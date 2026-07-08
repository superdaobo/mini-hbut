#!/usr/bin/env bash
# 部署静态站点到 website-pages 分支根目录（EdgeOne 自定义域名 hbut.6661111.xyz）。
#
# 构建在 CI 完成（website/ 内 npm run build），本脚本只发布产物：
#   源目录：website/dist/（Next.js export 输出，含 public/ 同步进来的静态资源）
#   目标分支：website-pages 根目录 /（不是 dist/ 子目录）
#   EdgeOne：RepoBranch=website-pages，outputDirectory=.，install/build=echo skip
#
# 纯网页约 ~130 个文件；modules/ 为游戏 CDN，部署前会裁剪历史版本目录。
# GitHub Pages（/mini-hbut/ 子路径）请用 deploy_github_pages.sh → gh-pages 分支。
set -euo pipefail

DEPLOY_MESSAGE="${DEPLOY_MESSAGE:?DEPLOY_MESSAGE is required}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
GITHUB_TOKEN="${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
DEPLOY_SOURCE_DIR="${DEPLOY_SOURCE_DIR:-website/dist}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-website-pages}"

if [ ! -d "$DEPLOY_SOURCE_DIR" ]; then
  echo "ERROR: $DEPLOY_SOURCE_DIR not found"
  exit 1
fi

if [ -d "$DEPLOY_SOURCE_DIR/modules" ]; then
  node scripts/prune_website_module_versions.mjs "$DEPLOY_SOURCE_DIR/modules"
fi

DEPLOY="$(mktemp -d)"
cp -r "$DEPLOY_SOURCE_DIR/." "$DEPLOY/"
# EdgeOne 读取仓库根目录 edgeone.json；website-pages 必须带上静态构建配置，覆盖控制台里残留的 main 分支命令。
if [ -f edgeone.json ]; then
  cp edgeone.json "$DEPLOY/edgeone.json"
elif [ -f website/public/edgeone.json ]; then
  cp website/public/edgeone.json "$DEPLOY/edgeone.json"
fi
# EdgeOne 在 website-pages 分支可能执行默认 npm install；提供占位 package.json 避免 ENOENT（对齐 v1.4.2）。
echo '{"name":"mini-hbut-website","private":true,"scripts":{"build":"echo skip"}}' > "$DEPLOY/package.json"
# Jekyll 会忽略下划线前缀目录（如 _next/），必须禁用。
touch "$DEPLOY/.nojekyll"
cd "$DEPLOY"
git init -q
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git add -A
git commit -q -m "$DEPLOY_MESSAGE"
git push --force "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" HEAD:"$DEPLOY_BRANCH"
echo "Deployed $DEPLOY_BRANCH from $DEPLOY_SOURCE_DIR: $DEPLOY_MESSAGE"
