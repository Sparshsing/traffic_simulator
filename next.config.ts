import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === 'development';
const basePath = '/projects/traffic-simulator'

const nextConfig: NextConfig = {
  output: "export",
  eslint: {
    ignoreDuringBuilds: false,
    dirs: ['src/app'], // Directories to run ESLint on
  },
  basePath: isDev ? '' : basePath, // Set the subpath
  assetPrefix: isDev ? '' : basePath,
//   trailingSlash: true, // Ensures proper URL handling,
  env: {
    NEXT_PUBLIC_BASE_PATH: isDev ? '' : basePath
  }
};

export default nextConfig;
