import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as rds from "aws-cdk-lib/aws-rds";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as logs from "aws-cdk-lib/aws-logs";
import * as path from "path";

export class DotverseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const frontendUrl = new cdk.CfnParameter(this, "FrontendUrl", {
      type: "String",
      description: "フロントエンドのURL (Amplify または Vercel)",
      default: "https://your-frontend.amplifyapp.com",
    });

    // ─── VPC ───────────────────────────────────────────────────────────────
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "Public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "Private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
      ],
    });

    // ─── Security Groups ───────────────────────────────────────────────────
    const albSg = new ec2.SecurityGroup(this, "AlbSg", {
      vpc,
      description: "ALB: allow HTTP/HTTPS from internet",
    });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP");
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS");

    const ecsSg = new ec2.SecurityGroup(this, "EcsSg", {
      vpc,
      description: "ECS Fargate tasks",
    });
    ecsSg.addIngressRule(albSg, ec2.Port.tcp(4000), "from ALB");

    const dbSg = new ec2.SecurityGroup(this, "DbSg", {
      vpc,
      description: "Aurora PostgreSQL",
    });
    dbSg.addIngressRule(ecsSg, ec2.Port.tcp(5432), "from ECS");

    const redisSg = new ec2.SecurityGroup(this, "RedisSg", {
      vpc,
      description: "ElastiCache Redis",
    });
    redisSg.addIngressRule(ecsSg, ec2.Port.tcp(6379), "from ECS");

    // ─── Aurora Serverless v2 ──────────────────────────────────────────────
    const dbCluster = new rds.DatabaseCluster(this, "AuroraCluster", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4,
      }),
      serverlessV2MinCapacity: 0.5,  // 0.5 ACU (最小コスト)
      serverlessV2MaxCapacity: 16,   // 16 ACU (ピーク時)
      writer: rds.ClusterInstance.serverlessV2("writer"),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [dbSg],
      defaultDatabaseName: "dotverse",
      credentials: rds.Credentials.fromGeneratedSecret("dotverse", {
        secretName: "dotverse/db-credentials",
      }),
      storageEncrypted: true,
      backup: { retention: cdk.Duration.days(7) },
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    });

    // ─── ElastiCache Serverless Redis ──────────────────────────────────────
    // Socket.IO Redis adapter 用 (タスク間 pub/sub)
    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, "RedisSubnetGroup", {
      description: "DotVerse Redis subnet group",
      subnetIds: vpc.privateSubnets.map((s) => s.subnetId),
    });

    const redisCache = new elasticache.CfnServerlessCache(this, "RedisCache", {
      engine: "redis",
      serverlessCacheName: "dotverse-redis",
      subnetIds: vpc.privateSubnets.map((s) => s.subnetId),
      securityGroupIds: [redisSg.securityGroupId],
    });

    // ─── JWT Secret ────────────────────────────────────────────────────────
    const jwtSecret = new secretsmanager.Secret(this, "JwtSecret", {
      secretName: "dotverse/jwt-secret",
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 64,
      },
    });

    // ─── ECS Cluster ───────────────────────────────────────────────────────
    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      containerInsights: true,
    });

    // ─── Task Definition ───────────────────────────────────────────────────
    const logGroup = new logs.LogGroup(this, "BackendLogs", {
      logGroupName: "/ecs/dotverse/backend",
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const taskDef = new ecs.FargateTaskDefinition(this, "TaskDef", {
      cpu: 512,
      memoryLimitMiB: 1024,
    });

    // DB の secret から username/password を注入、host/port/dbname は env で渡す
    taskDef.addContainer("backend", {
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, "../.."), {
        file: "Dockerfile",
      }),
      environment: {
        NODE_ENV: "production",
        PORT: "4000",
        DB_HOST: dbCluster.clusterEndpoint.hostname,
        DB_PORT: dbCluster.clusterEndpoint.port.toString(),
        DB_NAME: "dotverse",
        // ElastiCache Serverless は TLS 必須 → rediss://
        REDIS_URL: cdk.Fn.join("", [
          "rediss://",
          redisCache.attrEndpointAddress,
          ":",
          redisCache.attrEndpointPort,
        ]),
        FRONTEND_URL: frontendUrl.valueAsString,
      },
      secrets: {
        DB_USER: ecs.Secret.fromSecretsManager(dbCluster.secret!, "username"),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(dbCluster.secret!, "password"),
        JWT_SECRET: ecs.Secret.fromSecretsManager(jwtSecret),
      },
      portMappings: [{ containerPort: 4000 }],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "backend",
        logGroup,
      }),
      healthCheck: {
        command: ["CMD-SHELL", "wget -qO- http://localhost:4000/health || exit 1"],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    // ─── ALB + Fargate Service ─────────────────────────────────────────────
    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, "Service", {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      publicLoadBalancer: true,
      assignPublicIp: false,
      taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    // ALB のセキュリティグループを明示
    service.loadBalancer.connections.securityGroups.push(albSg);

    // スティッキーセッション (Socket.IO がポーリングを使う場合に必須)
    service.targetGroup.enableCookieStickiness(cdk.Duration.hours(24));
    service.targetGroup.configureHealthCheck({
      path: "/health",
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
    });

    // ─── Auto Scaling ──────────────────────────────────────────────────────
    const scaling = service.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 10,
    });

    // CPU 60% を超えたらスケールアウト (30秒後)、下回ったらスケールイン (120秒後)
    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 60,
      scaleOutCooldown: cdk.Duration.seconds(30),
      scaleInCooldown: cdk.Duration.seconds(120),
    });

    // メモリ 70% を超えたらスケールアウト
    scaling.scaleOnMemoryUtilization("MemoryScaling", {
      targetUtilizationPercent: 70,
      scaleOutCooldown: cdk.Duration.seconds(30),
      scaleInCooldown: cdk.Duration.seconds(120),
    });

    // ─── DB アクセス権限 ───────────────────────────────────────────────────
    dbCluster.secret!.grantRead(taskDef.taskRole);
    jwtSecret.grantRead(taskDef.taskRole);
    dbCluster.connections.allowFrom(ecsSg, ec2.Port.tcp(5432));

    // ─── Outputs ──────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "BackendUrl", {
      value: `http://${service.loadBalancer.loadBalancerDnsName}`,
      description: "バックエンドURL (NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WS_URL に設定)",
    });

    new cdk.CfnOutput(this, "EcsClusterName", {
      value: cluster.clusterName,
      description: "ECS クラスター名",
    });

    new cdk.CfnOutput(this, "EcsServiceName", {
      value: service.service.serviceName,
      description: "ECS サービス名",
    });
  }
}
