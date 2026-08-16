import assert from 'node:assert/strict'
import fs from 'node:fs'

const devBuild = fs.readFileSync('.github/workflows/dev-build.yml', 'utf8')
const syncMain = fs.readFileSync('.github/workflows/sync-main-to-dev.yml', 'utf8')

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
