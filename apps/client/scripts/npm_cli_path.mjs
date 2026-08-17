import fs from 'node:fs'
import path from 'node:path'

const unique = (values) => [...new Set(values)]

/**
 * Return fixed npm-cli.js candidates derived only from the trusted Node executable path.
 * No PATH, shell, ComSpec, or other environment-controlled command is executed.
 */
export const npmCliCandidates = (execPath = process.execPath, platform = process.platform) => {
  const pathApi = platform === 'win32' ? path.win32 : path.posix
  const nodeDir = pathApi.dirname(execPath)
  return unique([
    // Official Windows node installer: <nodeDir>/node_modules/npm/bin/npm-cli.js
    pathApi.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    // actions/setup-node and common Unix installs: <prefix>/lib/node_modules/npm/bin/npm-cli.js
    pathApi.resolve(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    // Some portable Unix layouts keep node_modules next to bin.
    pathApi.resolve(nodeDir, '..', 'node_modules', 'npm', 'bin', 'npm-cli.js')
  ])
}

export const resolveNpmCliPath = ({
  execPath = process.execPath,
  platform = process.platform,
  existsSync = fs.existsSync
} = {}) => {
  const candidates = npmCliCandidates(execPath, platform)
  const resolved = candidates.find((candidate) => existsSync(candidate))
  if (resolved) return resolved
  throw new Error(`未找到 npm CLI；已检查固定路径：${candidates.join(', ')}`)
}
