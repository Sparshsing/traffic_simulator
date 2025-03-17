import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  eslint: {
    ignoreDuringBuilds: false,
    dirs: ['src/app'], // Directories to run ESLint on
  },
  basePath: '/sparshp/trafficsim', // Set the subpath
  assetPrefix: '/sparshp/trafficsim',
  trailingSlash: true, // Ensures proper URL handling
};

export default nextConfig;
