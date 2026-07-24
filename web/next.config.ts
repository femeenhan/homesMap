import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // 배포 식별자 — 업데이트 배너가 서버 /version과 비교. 로컬 dev는 'dev'로 비활성.
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
  },
};

export default nextConfig;
