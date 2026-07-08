#!/usr/bin/env bash
# 将 GITHUB_PAGES=true 构建的 website/dist 推送到 gh-pages 分支根目录。
# GitHub Pages 项目站地址：https://superdaobo.github.io/mini-hbut/（需要 basePath=/mini-hbut）
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

if [ -d "$DEPLOY_SOURCE_DIR/modules" ]; then
  node scripts/prune_website_module_versions.mjs "$DEPLOY_SOURCE_DIR/modules"
fi

DEPLOY="$(mktemp -d)"
cp -r "$DEPLOY_SOURCE_DIR/." "$DEPLOY/"
touch "$DEPLOY/.nojekyll"
cd "$DEPLOY"
git init -q
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git add -A
git commit -q -m "$DEPLOY_MESSAGE"
git push --force "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" HEAD:"$DEPLOY_BRANCH"
echo "Deployed $DEPLOY_BRANCH from $DEPLOY_SOURCE_DIR: $DEPLOY_MESSAGE"
