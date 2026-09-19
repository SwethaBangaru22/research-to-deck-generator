/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pdf-parse", "pg", "bullmq", "ioredis"],
};

export default nextConfig;
