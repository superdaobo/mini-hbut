// src/utils/login_success_channel_contract.spec.ts
//
// GitHub #927（epic）/ #928 / #932 登录成功交付契约：
//   - 门户登录成功必须走「成绩不阻塞 + 应用级通道」，不再等待成绩同步
//   - 曾因删除 emitSuccessWithGrades 而遗留调用点，导致扫码登录抛 ReferenceError；
//     此契约锁定该标识符不得再出现
//   - 「登录中切回页面」的恢复路径必须带超时逃生与结果归一化

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const clientSrcRoot = resolve(__dirname, '..')
const readSource = (rel: string): string =>
  readFileSync(resolve(clientSrcRoot, ...rel.split('/')), 'utf8')

describe('登录成功交付通道契约（#928 / #932）', () => {
  it('LoginV3 不再引用已删除的 emitSuccessWithGrades（曾致扫码登录 ReferenceError）', () => {
    const source = readSource('components/LoginV3.vue')
    expect(source).not.toContain('emitSuccessWithGrades')
  })

  it('门户密码/扫码/学习通登录均按各自方式标注，并统一交付结果', () => {
    const source = readSource('components/LoginV3.vue')
    expect(source).toContain('publishPortalLoginSucceeded')
    // 落地函数按 method 参数区分登录方式（不得硬编码为门户密码登录，
    // 否则扫码临时会话会被当成正式会话、学习通自动重登会走错凭据分支）
    expect(source).toContain('method = LOGIN_METHOD_PORTAL_PASSWORD')
    expect(source).toContain('triggersLoginCooldown(method)')
    // 各调用点在进入单飞门时标注方式，供复用路径还原语义
    expect(source).toContain('method: LOGIN_METHOD_PORTAL_QR')
    expect(source).toContain('method: LOGIN_METHOD_CHAOXING_PASSWORD')
    expect(source).toContain('method: LOGIN_METHOD_CHAOXING_QR')
  })

  it('登录中恢复路径具备超时逃生与结果归一化', () => {
    const source = readSource('components/LoginV3.vue')
    expect(source).toContain('waitForInFlightLogin')
    expect(source).toContain('normalizePortalLoginOutcome')
    expect(source).toContain('LOGIN_SUBMIT_TIMEOUT_MS')
  })

  it('AuthCoordinator 订阅应用级登录成功通道（组件卸载也能推进登录态）', () => {
    const source = readSource('app/coordinators/AuthCoordinator.ts')
    expect(source).toContain('subscribePortalLoginSucceeded')
  })

  it('成绩补拉前后都校验学号归属（防切号后跨账号污染）', () => {
    const source = readSource('app/coordinators/AuthCoordinator.ts')
    expect(source).toContain('state.studentId.value !== sid')
  })
})
