/**
 * #898 契约：学业类视图（培养方案 / 学业情况）在教务会话失效时不得登出。
 *
 * 背景：这两个页面曾把 need_login 无条件转成 emit('logout')，会话过期时清空本地登录身份、
 * 写入 hbu_manual_logout，连后台自动重登链路一起停摆（违反 #355）。
 * 现对齐课表/校历：仅临时扫码会话退回登录页，其余情况保留身份并降级提示。
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const readText = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const VIEW_FILES = [
  { path: 'src/components/TrainingPlanView.vue', label: '培养方案' },
  { path: 'src/components/AcademicProgressView.vue', label: '学业情况' },
] as const

describe('academic views session expiry contract (#898)', () => {
  it('会话失效走临时会话守卫，而非无条件登出', () => {
    for (const view of VIEW_FILES) {
      const source = readText(view.path)

      expect(source, `${view.label} 应复用共享的临时会话判定`).toContain(
        "from '../utils/session_flags.js'",
      )

      const handler = source.match(/const applySessionExpired[\s\S]*?\n\}/)
      expect(handler, `${view.label} 缺少 applySessionExpired`).toBeTruthy()
      // 登出必须被临时会话判定包裹
      expect(handler![0], `${view.label} 的登出未经过临时会话判定`).toMatch(
        /if \(isTemporaryLoginSession\(\)\) \{\s*\n\s*emit\('logout'\)/,
      )
      // 判定块之外不得再出现登出调用（回归信号）
      const outsideGuard = handler![0].replace(
        /if \(isTemporaryLoginSession\(\)\) \{[\s\S]*?\n {2}\}/,
        '',
      )
      expect(outsideGuard, `${view.label} 不得在临时会话判定之外登出`).not.toContain(
        "emit('logout')",
      )
    }
  })

  it('need_login 分支改为携带上下文的会话失效处理', () => {
    for (const view of VIEW_FILES) {
      const source = readText(view.path)
      // 正向：need_login 直接接 applySessionExpired
      expect(source, `${view.label} 的 need_login 未接会话失效处理`).toMatch(
        /need_login[\s\S]{0,60}applySessionExpired\(/,
      )
      // 反向：need_login 附近不得出现登出调用（旧实现形态）
      expect(source, `${view.label} 的 need_login 分支不得直接登出`).not.toMatch(
        /need_login[\s\S]{0,120}emit\('logout'\)/,
      )
    }
  })
})
