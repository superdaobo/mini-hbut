/**
 * Android SDK 安装契约（issue #830）。
 *
 * 背景：`android-actions/setup-android` 的 `packages` 输入默认值是
 * `'tools platform-tools'`，而 Google 已在 2026-09-12 ~ 09-15 之间从 SDK 仓库
 * 下架遗留的 `tools` 包。默认值会让 `sdkmanager tools` 报
 * `Failed to find package 'tools'` 并以退出码 1 结束，Dev Build 与 Release 的
 * Android job 会在 `Setup Android SDK` 第一步就中止。
 *
 * 关键约束：`@v3` 与 `@v4.0.1` 的默认值**都**含 `tools`，所以「升级 action 版本」
 * 不能解决问题，调用方必须显式覆盖 `packages`。
 *
 * 本测试看守三件事：
 *   1. 任何工作流里的 setup-android 步骤都必须显式覆盖 packages；
 *   2. 覆盖值里不得出现 `tools`（注意别与 `platform-tools` 混淆）；
 *   3. 工作流中不得直接调用 `sdkmanager tools`（同样会失败）。
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const workflowsDir = path.resolve(process.cwd(), '../../.github/workflows')

/** Android 构建入口：这两个文件必须修好，单独点名看守，避免规则因文件改名而漏看 */
const ANDROID_BUILD_WORKFLOWS = ['dev-build.yml', 'release.yml']

const SETUP_ANDROID_USE = /^\s*uses:\s*android-actions\/setup-android@/
/** step 起始行：`- name:` / `- uses:` / `- run:` 等 */
const STEP_START = /^\s*-\s+\S/
const PACKAGES_LINE = /^\s*packages:\s*(.+)$/m

const allWorkflowFiles = (): string[] =>
  fs
    .readdirSync(workflowsDir)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort()

/**
 * 读取工作流并**剥离 YAML 注释**后按行返回。
 *
 * 必须剥注释：本契约的说明文字里会引用 `sdkmanager tools` 这类失败命令，
 * 若不剥离，注释本身会被哨兵当成真实调用（同时注释也不该能"满足"契约）。
 * 规则：行首 `#` 或空白后的 `#` 起为注释。
 */
const stripYamlComment = (line: string): string => {
  const match = /(^|\s)#/.exec(line)
  if (!match) return line
  return line.slice(0, match.index + match[1].length)
}

const readWorkflowLines = (file: string): string[] =>
  fs
    .readFileSync(path.join(workflowsDir, file), 'utf8')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(stripYamlComment)

/**
 * 取出 uses 行所属 step 的后续块（到下一个 step 起始行为止）。
 * 只按 step 边界截断，避免把后续 step 的 with 误判成当前 step 的。
 */
const stepBlockOf = (lines: string[], usesIndex: number): string => {
  const block: string[] = []
  for (let i = usesIndex + 1; i < lines.length; i += 1) {
    if (STEP_START.test(lines[i])) break
    block.push(lines[i])
  }
  return block.join('\n')
}

/**
 * 解析 packages 值中的包名 token：先剥掉包裹引号，再按空白切分。
 * 必须按 token 比较，不能用 includes('tools')——`platform-tools` 也含该子串。
 */
const packageTokens = (rawValue: string | undefined): string[] =>
  String(rawValue ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .split(/\s+/)
    .filter(Boolean)

const findUsesIndexes = (lines: string[]): number[] =>
  lines.reduce<number[]>((acc, line, index) => {
    if (SETUP_ANDROID_USE.test(line)) acc.push(index)
    return acc
  }, [])

describe('Android SDK 安装契约（#830）', () => {
  it('工作流目录可读（防止路径漂移导致契约静默失效）', () => {
    expect(fs.existsSync(workflowsDir)).toBe(true)
    expect(allWorkflowFiles().length).toBeGreaterThan(0)
  })

  it('任何 setup-android 步骤都必须显式覆盖 packages，且不得包含已下架的 tools', () => {
    const violations: string[] = []

    for (const file of allWorkflowFiles()) {
      const lines = readWorkflowLines(file)
      for (const index of findUsesIndexes(lines)) {
        const block = stepBlockOf(lines, index)
        const match = PACKAGES_LINE.exec(block)
        if (!match) {
          violations.push(
            `${file}:${index + 1} 未覆盖 packages，会走默认值 'tools platform-tools'（含已下架的 tools）`
          )
          continue
        }
        const tokens = packageTokens(match[1])
        if (tokens.includes('tools')) {
          violations.push(`${file}:${index + 1} packages 仍请求已下架的 tools：${match[1].trim()}`)
        }
        if (tokens.length === 0) {
          violations.push(`${file}:${index + 1} packages 覆盖为空，Android 构建需要 platform-tools`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('Android 构建入口（dev-build.yml / release.yml）均已修复', () => {
    for (const file of ANDROID_BUILD_WORKFLOWS) {
      const lines = readWorkflowLines(file)
      const usesIndexes = findUsesIndexes(lines)
      expect(usesIndexes.length, `${file} 应至少有一处 setup-android`).toBeGreaterThan(0)

      for (const index of usesIndexes) {
        const tokens = packageTokens(PACKAGES_LINE.exec(stepBlockOf(lines, index))?.[1])
        // 回归哨兵：旧写法是裸用 action（走默认值），一旦回退这里立刻失败
        expect(tokens, `${file}:${index + 1} packages 不应包含 tools`).not.toContain('tools')
        expect(tokens, `${file}:${index + 1} packages 不应为空`).toContain('platform-tools')
      }
    }
  })

  it('回归哨兵：工作流中不得直接调用 sdkmanager tools', () => {
    const offenders: string[] = []
    for (const file of allWorkflowFiles()) {
      const text = readWorkflowLines(file).join('\n')
      const matches = text.match(/sdkmanager\s+['"]?tools\b/g)
      if (matches) offenders.push(`${file}: ${matches.join(', ')}`)
    }
    expect(offenders).toEqual([])
  })
})
