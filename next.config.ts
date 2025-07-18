import type { NextConfig } from "next";

const isDev = false;//process.env.NODE_ENV === 'development';
const nextConfig: NextConfig = {
  output: "export",
  eslint: {
    ignoreDuringBuilds: false,
    dirs: ['src/app'], // Directories to run ESLint on
  },
  basePath: isDev ? '' : '/projects/traffic-simulator', // Set the subpath
//   assetPrefix: isDev ? '' :'/projects/traffic-simulator',
//   trailingSlash: true, // Ensures proper URL handling,
  env: {
    NEXT_PUBLIC_BASE_PATH: isDev ? '' : '/projects/traffic-simulator'
  }
};

export default nextConfig;
