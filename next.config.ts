import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  eslint: {
    ignoreDuringBuilds: false,
    dirs: ['src/app'], // Directories to run ESLint on
  },
  basePath: '/projects/traffic-simulator', // Set the subpath
  assetPrefix: '/projects/traffic-simulator',
  trailingSlash: true, // Ensures proper URL handling,
  env: {
    NEXT_PUBLIC_BASE_PATH: '/projects/traffic-simulator'
  }
};

export default nextConfig;
