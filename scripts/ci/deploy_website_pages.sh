#!/usr/bin/env bash
# 将 website/dist 内容强制推送到 website-pages 分支根目录（供多个 workflow 复用）。
# GitHub Pages「Deploy from a branch」仅支持 / 或 /docs，因此不能发布到 dist/ 子目录。
set -euo pipefail

DEPLOY_MESSAGE="${DEPLOY_MESSAGE:?DEPLOY_MESSAGE is required}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
GITHUB_TOKEN="${GITHUB_TOKEN:?GITHUB_TOKEN is required}"

if [ ! -d website/dist ]; then
  echo "ERROR: website/dist not found"
  exit 1
fi

DEPLOY="$(mktemp -d)"
cp -r website/dist/. "$DEPLOY/"
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
git push --force "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" HEAD:website-pages
echo "Deployed website-pages: $DEPLOY_MESSAGE"
