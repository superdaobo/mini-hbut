#!/usr/bin/env bash
# 将 GITHUB_PAGES=true 构建的 website/dist 推送到 gh-pages 分支根目录。
# GitHub Pages 项目站地址：https://superdaobo.github.io/mini-hbut/（需要 basePath=/mini-hbut）
#
# 体积策略：GH Pages 作官网 + 更新清单备用源，不镜像 modules 游戏包与大体量安装包
#（安装包仍走 GitHub Releases / 代理；EdgeOne website-pages 承载完整 CDN）。
set -euo pipefail

DEPLOY_MESSAGE="${DEPLOY_MESSAGE:?DEPLOY_MESSAGE is required}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
GITHUB_TOKEN="${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
DEPLOY_SOURCE_DIR="${DEPLOY_SOURCE_DIR:-website/dist}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-gh-pages}"

if [ ! -d "$DEPLOY_SOURCE_DIR" ]; then
  echo "ERROR: $DEPLOY_SOURCE_DIR not found (build with GITHUB_PAGES=true first)"
  exit 1
fi

DEPLOY="$(mktemp -d)"
# 仅同步站点静态页 + _next + 清单类资源，排除 modules 与大安装包
rsync -a \
  --exclude 'modules/' \
  --exclude 'modules-src/' \
  --exclude '*.exe' \
  --exclude '*.msi' \
  --exclude '*.dmg' \
  --exclude '*.apk' \
  --exclude '*.ipa' \
  --exclude '*.AppImage' \
  --exclude '*.zip' \
  --exclude '*.tar.gz' \
  "$DEPLOY_SOURCE_DIR/" "$DEPLOY/"

# 发布清单 JSON 保留（更新探测备用）；清理空 releases 子目录中的大文件后若无 json 再删
if [ -d "$DEPLOY/releases" ]; then
  find "$DEPLOY/releases" -type f \
    ! -name '*.json' ! -name '*.html' ! -name '*.txt' ! -name '*.md' \
    -delete 2>/dev/null || true
fi

touch "$DEPLOY/.nojekyll"
# 确保 .nojekyll 优先被识别（避免 Jekyll 吃掉 _next）
cd "$DEPLOY"
git init -q
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git add -A
git commit -q -m "$DEPLOY_MESSAGE"
git push --force "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" HEAD:"$DEPLOY_BRANCH"
echo "Deployed $DEPLOY_BRANCH (slim site + release JSON) from $DEPLOY_SOURCE_DIR: $DEPLOY_MESSAGE"
