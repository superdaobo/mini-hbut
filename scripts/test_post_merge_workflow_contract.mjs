import assert from 'node:assert/strict'
import fs from 'node:fs'

const devBuild = fs.readFileSync('.github/workflows/dev-build.yml', 'utf8')
const syncMain = fs.readFileSync('.github/workflows/sync-main-to-dev.yml', 'utf8')

assert.match(devBuild, /workflow_dispatch:\s+inputs:\s+smoke_only:/s)
assert.match(devBuild, /meta:\s+if: \$\{\{ github\.event_name != 'workflow_dispatch' \|\| inputs\.smoke_only != true \}\}/s)
assert.match(devBuild, /deploy-dev-release:/)
assert.match(syncMain, /gh workflow run "Dev Build" --ref dev -f smoke_only=true/)
assert.doesNotMatch(syncMain, /gh workflow run "Dev Build" --ref dev\s*$/m)

console.log('post-merge workflow smoke-only contract passed')
