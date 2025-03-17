import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  eslint: {
    ignoreDuringBuilds: false,
    dirs: ['src/app'], // Directories to run ESLint on
  },
  basePath: '/sparsh/traffic-simulator', // Set the subpath
  assetPrefix: '/sparsh/traffic-simulator',
  trailingSlash: true, // Ensures proper URL handling
};

export default nextConfig;
