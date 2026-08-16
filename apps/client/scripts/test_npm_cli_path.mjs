import assert from 'node:assert/strict'
import { npmCliCandidates, resolveNpmCliPath } from './npm_cli_path.mjs'

const windowsExec = String.raw`C:\Program Files\nodejs\node.exe`
const windowsExpected = String.raw`C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`
assert.equal(npmCliCandidates(windowsExec, 'win32')[0], windowsExpected)
assert.equal(
  resolveNpmCliPath({
    execPath: windowsExec,
    platform: 'win32',
    existsSync: (candidate) => candidate === windowsExpected
  }),
  windowsExpected
)

const linuxExec = '/opt/hostedtoolcache/node/22.23.1/x64/bin/node'
const linuxExpected = '/opt/hostedtoolcache/node/22.23.1/x64/lib/node_modules/npm/bin/npm-cli.js'
assert.ok(npmCliCandidates(linuxExec, 'linux').includes(linuxExpected))
assert.equal(
  resolveNpmCliPath({
    execPath: linuxExec,
    platform: 'linux',
    existsSync: (candidate) => candidate === linuxExpected
  }),
  linuxExpected
)

assert.throws(
  () => resolveNpmCliPath({ execPath: linuxExec, platform: 'linux', existsSync: () => false }),
  /未找到 npm CLI/
)

console.log('npm CLI path contract passed')
