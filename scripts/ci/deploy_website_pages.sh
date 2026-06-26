#!/usr/bin/env bash
# 将 website/dist 强制推送到 website-pages 分支（供多个 workflow 复用）。
set -euo pipefail

DEPLOY_MESSAGE="${DEPLOY_MESSAGE:?DEPLOY_MESSAGE is required}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
GITHUB_TOKEN="${GITHUB_TOKEN:?GITHUB_TOKEN is required}"

if [ ! -d website/dist ]; then
  echo "ERROR: website/dist not found"
  exit 1
fi

DEPLOY="$(mktemp -d)"
echo '{"name":"mini-hbut-website","private":true,"scripts":{"build":"echo skip"}}' > "$DEPLOY/package.json"
cp -r website/dist "$DEPLOY/dist"
cd "$DEPLOY"
git init -q
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git add -A
git commit -q -m "$DEPLOY_MESSAGE"
git push --force "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" HEAD:website-pages
echo "Deployed website-pages: $DEPLOY_MESSAGE"
