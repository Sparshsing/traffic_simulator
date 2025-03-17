import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  eslint: {
    ignoreDuringBuilds: false,
    dirs: ['src/app'], // Directories to run ESLint on
  },
};

export default nextConfig;
