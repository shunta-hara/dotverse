import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {},
  // 別オリジンのバックエンド（Render）を同一オリジンに見せ、SameSite=Strict の Cookie をそのまま使う。
  // BACKEND_INTERNAL_URL 未設定（ローカル開発）のときは何もしない。
  async rewrites() {
    const backend = process.env.BACKEND_INTERNAL_URL;
    if (!backend) return [];
    return [{ source: "/api/:path*", destination: `${backend}/:path*` }];
  },
  webpack(config) {
    config.resolve.alias["@shared"] = path.resolve(__dirname, "../shared");
    return config;
  },
};

export default nextConfig;
