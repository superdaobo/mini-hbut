import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// 契约对象在仓库根(.github/),脚本可能在 apps/client 下执行,故以脚本位置向上解析
const repoRoot = path.resolve(import.meta.dirname, '../../..')
const readRepo = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const devBuild = readRepo('.github/workflows/dev-build.yml')
const syncMain = readRepo('.github/workflows/sync-main-to-dev.yml')

assert.match(devBuild, /workflow_dispatch:\s*(?:\r?\n)/)
assert.doesNotMatch(devBuild, /smoke_only/)
assert.doesNotMatch(devBuild, /inputs\.smoke_only/)
for (const job of ['build-ios:', 'build-macos:', 'build-linux:', 'build-windows:', 'build-android:', 'deploy-dev-release:']) {
  assert.ok(devBuild.includes(`  ${job}`), `missing full dev build job: ${job}`)
}
assert.match(devBuild, /name:\s*Android beta APK/)
assert.match(syncMain, /gh workflow run "Dev Build" --ref dev\s*$/m)
assert.doesNotMatch(syncMain, /smoke_only=true/)

console.log('post-merge full dev build contract passed')
