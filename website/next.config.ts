import type { NextConfig } from 'next';
import path from 'path';
import { fileURLToPath } from 'url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// GitHub Pages 项目站点部署在 /mini-hbut/ 子路径；自定义域名构建不设置 GITHUB_PAGES。
const isGitHubPages = process.env.GITHUB_PAGES === 'true';
const basePath = isGitHubPages ? '/mini-hbut' : '';

const nextConfig: NextConfig = {
  basePath,
  assetPrefix: basePath || undefined,
  // 客户端 Navbar 等需要读到 basePath，修复 GH Pages 上 `/#xxx` 丢仓库前缀
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  output: 'export',
  distDir: 'dist',
  images: { unoptimized: true },
  trailingSlash: false,
  transpilePackages: ['three'],
  outputFileTracingRoot: rootDir,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
