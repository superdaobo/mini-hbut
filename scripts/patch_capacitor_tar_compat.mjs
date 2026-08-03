import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const LEGACY_CALL = 'await tar_1.default.extract({ file: src, cwd: dir });'
const COMPAT_CALL = 'await (tar_1.default ?? tar_1).extract({ file: src, cwd: dir });'

export const resolveCapacitorTemplatePath = () => {
  const cliEntry = require.resolve('@capacitor/cli')
  return path.join(path.dirname(cliEntry), 'util', 'template.js')
}

/**
 * Capacitor CLI 6 was compiled against tar 6's synthetic default export. The security override
 * intentionally keeps tar 7.5.22, whose CommonJS export exposes extract directly. Patch only the
 * exact known call site and fail closed if the installed source is unexpected.
 */
export const patchCapacitorTarTemplate = (filePath) => {
  const source = fs.readFileSync(filePath, 'utf8')
  if (source.includes(COMPAT_CALL)) return { status: 'unchanged', filePath }

  const matches = source.split(LEGACY_CALL).length - 1
  if (matches !== 1) {
    throw new Error(
      `Capacitor tar 兼容补丁拒绝修改未知源码：期望 1 个调用，实际 ${matches} 个（${filePath}）`
    )
  }

  fs.writeFileSync(filePath, source.replace(LEGACY_CALL, COMPAT_CALL), 'utf8')
  return { status: 'patched', filePath }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = patchCapacitorTarTemplate(resolveCapacitorTemplatePath())
  console.log(`[capacitor-tar-compat] ${result.status}: ${result.filePath}`)
}
