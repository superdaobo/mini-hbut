/**
 * #898 契约：学业类视图（培养方案 / 学业情况）在教务会话失效时不得登出。
 *
 * 背景：这两个页面曾把 need_login 无条件转成 emit('logout')，会话过期时清空本地登录身份、
 * 写入 hbu_manual_logout，连后台自动重登链路一起停摆（违反 #355）。
 * 现对齐课表/校历：仅临时扫码会话退回登录页，其余情况保留身份并降级提示。
 *
 * 处置语义（临时登出 / 有数据降级 / 无数据错误态）的真值表由
 * `session_flags.spec.ts` 覆盖，本文件只守视图侧的接线不回退。
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
  it('会话失效处置集中到共享决策函数，视图不再内联判定', () => {
    for (const view of VIEW_FILES) {
      const source = readText(view.path)

      expect(source, `${view.label} 应复用共享会话工具`).toContain(
        "from '../utils/session_flags.js'",
      )
      expect(source, `${view.label} 未使用 resolveSessionExpiryAction`).toMatch(
        /resolveSessionExpiryAction\(/,
      )
      // 会话类型判定集中在 utils：视图内联判定即回退到各写一份的老问题
      expect(source, `${view.label} 不应内联会话类型判定`).not.toContain(
        'isTemporaryLoginSession(',
      )
    }
  })

  it('need_login 分支不再直接登出', () => {
    for (const view of VIEW_FILES) {
      const source = readText(view.path)
      // 正向：need_login 接 applySessionExpired
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
