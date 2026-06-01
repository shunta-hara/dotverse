#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { DotverseStack } from "../lib/dotverse-stack";

const app = new cdk.App();

new DotverseStack(app, "DotverseStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-1",
  },
  description: "DotVerse backend: ECS Fargate + Aurora Serverless v2 + ElastiCache Redis",
});
