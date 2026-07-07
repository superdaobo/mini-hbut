import type { NextConfig } from 'next';
import path from 'path';
import { fileURLToPath } from 'url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: 'export',
  distDir: 'dist',
  images: { unoptimized: true },
  trailingSlash: false,
  transpilePackages: ['three'],
  outputFileTracingRoot: rootDir,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
