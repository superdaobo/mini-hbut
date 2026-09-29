/**
 * 定位可用于「字体子集」处理的 Python 解释器。
 *
 * 仓库同时存在多套 Python（Windows 上 `python` 3.11 / `python3` 3.13 / `py -3.13`），
 * fontTools 未必都装了；这里逐个探测 `import fontTools`，返回第一个可用的 argv 前缀。
 */

import { execFileSync } from 'node:child_process'

/** 与脚本同目录的 Python helper 文件名 */
export const PYTHON_HELPER_NAME = 'font_subset_tools.py'

const CANDIDATE_COMMANDS = [
  ['python3'],
  ['python'],
  ['py', '-3.13'],
  ['py', '-3']
]

const canImportFontTools = (argv) => {
  try {
    execFileSync(argv[0], [...argv.slice(1), '-c', 'import fontTools'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * @param {string} [override] 显式指定（如环境变量 MINI_HBUT_PYTHON="py -3.13"）
 * @returns {string[] | null} 可执行文件 + 参数前缀；都不可用时返回 null
 */
export function resolvePythonCommand(override = process.env.MINI_HBUT_PYTHON) {
  const candidates = []
  if (override && override.trim()) candidates.push(override.trim().split(/\s+/))
  candidates.push(...CANDIDATE_COMMANDS)

  for (const argv of candidates) {
    if (canImportFontTools(argv)) return argv
  }
  return null
}
