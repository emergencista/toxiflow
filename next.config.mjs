/** @type {import('next').NextConfig} */
const basePath = process.env.TOXIFLOW_BASE_PATH || "";

const nextConfig = {
  basePath,
  assetPrefix: basePath || undefined,
  typedRoutes: true
};

export default nextConfig;