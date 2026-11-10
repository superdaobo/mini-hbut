/**
 * identityV2Errors.spec.ts —— §4 错误分类器（冻结文案；验收 ③）。
 * 断言：kind→文案逐字一致（17 条全表）；kind 集合无增无减；
 * mapServerReason 固定映射（未知 → unknown，不透传原文）；文案不含任何敏感子串。
 */
import { describe, expect, it } from 'vitest'
import {
  FLOW_KINDS,
  FLOW_MESSAGES,
  isFlowErrorKind,
  mapServerReason,
  messageFor
} from './identityV2Errors'

describe('§4 冻结表：kind → 中文文案（逐字一致）', () => {
  it('first_claim_ok', () => {
    expect(FLOW_MESSAGES.first_claim_ok).toBe('设备登记成功，本机已成为该学号的受信任设备')
  })
  it('already_registered', () => {
    expect(FLOW_MESSAGES.already_registered).toBe('本机已完成登记，无需重复操作')
  })
  it('student_taken', () => {
    expect(FLOW_MESSAGES.student_taken).toBe('该学号已绑定其他设备：请在旧设备上批准换机，或联系管理员')
  })
  it('device_taken', () => {
    expect(FLOW_MESSAGES.device_taken).toBe('本机设备已绑定到其他学号，请先在该学号下解除绑定或联系管理员')
  })
  it('no_active_device', () => {
    expect(FLOW_MESSAGES.no_active_device).toBe('该学号当前没有可用的旧设备，请直接完成首次登记')
  })
  it('request_pending', () => {
    expect(FLOW_MESSAGES.request_pending).toBe('换机请求已提交，请用旧设备输入/扫描换机码完成批准')
  })
  it('approved', () => {
    expect(FLOW_MESSAGES.approved).toBe('换机完成：本机已成为该学号的受信任设备')
  })
  it('approver_mismatch', () => {
    expect(FLOW_MESSAGES.approver_mismatch).toBe('只有该学号当前的活跃设备才能批准换机')
  })
  it('request_expired', () => {
    expect(FLOW_MESSAGES.request_expired).toBe('换机码已过期，请在新设备上重新发起换机')
  })
  it('request_done', () => {
    expect(FLOW_MESSAGES.request_done).toBe('该换机请求已被处理，无需重复批准')
  })
  it('code_invalid', () => {
    expect(FLOW_MESSAGES.code_invalid).toBe('换机码无效或已损坏，请重新扫描/输入')
  })
  it('not_enrolled', () => {
    expect(FLOW_MESSAGES.not_enrolled).toBe('本机尚未登记设备身份，请先完成首次登记')
  })
  it('not_logged_in', () => {
    expect(FLOW_MESSAGES.not_logged_in).toBe('请先在本机登录学校账号后再操作')
  })
  it('secure_storage_unavailable', () => {
    expect(FLOW_MESSAGES.secure_storage_unavailable).toBe('本机安全存储不可用，无法完成设备身份操作')
  })
  it('network', () => {
    expect(FLOW_MESSAGES.network).toBe('网络不可用或服务暂时不可达，请稍后重试')
  })
  it('service_unavailable', () => {
    expect(FLOW_MESSAGES.service_unavailable).toBe('服务暂时不可用，请稍后重试')
  })
  it('unknown', () => {
    expect(FLOW_MESSAGES.unknown).toBe('操作失败，请稍后重试')
  })
  it('kind 集合恰为 17 个（无增无减）', () => {
    const expected = [
      'first_claim_ok',
      'already_registered',
      'student_taken',
      'device_taken',
      'no_active_device',
      'request_pending',
      'approved',
      'approver_mismatch',
      'request_expired',
      'request_done',
      'code_invalid',
      'not_enrolled',
      'not_logged_in',
      'secure_storage_unavailable',
      'network',
      'service_unavailable',
      'unknown'
    ]
    expect([...FLOW_KINDS].sort()).toEqual([...expected].sort())
    expect(Object.keys(FLOW_MESSAGES).sort()).toEqual([...expected].sort())
  })
})

describe('mapServerReason：固定映射，未知一律 unknown（不透传原文）', () => {
  const cases: Array<[unknown, string]> = [
    ['student_active_on_other_device', 'student_taken'],
    ['device_active_for_other_student', 'device_taken'],
    ['rebind_no_active_device', 'no_active_device'],
    ['rebind_new_device_taken', 'device_taken'],
    ['rebind_request_expired', 'request_expired'],
    ['rebind_request_already_done', 'request_done'],
    ['rebind_approver_mismatch', 'approver_mismatch'],
    ['rebind_approver_not_active', 'approver_mismatch'],
    ['rebind_request_not_found', 'code_invalid'],
    ['rebind_pubkey_mismatch', 'code_invalid'],
    ['device_not_registered', 'not_enrolled'],
    ['not_enrolled', 'not_enrolled'],
    ['no_local_login', 'not_logged_in'],
    ['keyring_unavailable', 'secure_storage_unavailable'],
    // trim 后精确匹配
    ['  student_active_on_other_device  ', 'student_taken'],
    // 未知 reason 一律 unknown（原文不透传）
    ['totally_unknown_reason_xyz', 'unknown'],
    ['', 'unknown'],
    ['   ', 'unknown'],
    [undefined, 'unknown'],
    [null, 'unknown'],
    [42, 'unknown'],
    [{ reason: 'student_active_on_other_device' }, 'unknown']
  ]
  for (const [input, expected] of cases) {
    it(`reason=${String(input)} → ${expected}`, () => {
      expect(mapServerReason(input)).toBe(expected)
    })
  }
})

describe('messageFor / isFlowErrorKind', () => {
  it('已知 kind → 固定文案', () => {
    for (const kind of FLOW_KINDS) {
      expect(messageFor(kind)).toBe(FLOW_MESSAGES[kind])
      expect(isFlowErrorKind(kind)).toBe(true)
    }
  })
  it('未知输入 → unknown 文案（绝不原样回显输入）', () => {
    expect(messageFor('no_such_kind')).toBe('操作失败，请稍后重试')
    expect(messageFor(42)).toBe('操作失败，请稍后重试')
    expect(messageFor(undefined)).toBe('操作失败，请稍后重试')
    expect(isFlowErrorKind('no_such_kind')).toBe(false)
    expect(isFlowErrorKind(null)).toBe(false)
  })
})

describe('验收 ③：全部失败文案不含敏感信息', () => {
  const sensitiveFragments = [
    '202312345678', // 完整学号
    'MEQCIBSIGNATURE', // 签名
    'OKP', // 公钥 JWK 材料
    'http://', // URL
    'https://', // URL
    'request_id', // 请求标识字段
    'student_active_on_other_device', // 服务端 reason 原文
    '409', // HTTP 状态码
    'HBRB1' // 换机码前缀
  ]
  for (const kind of FLOW_KINDS) {
    it(`${kind} 的文案不含任何敏感子串`, () => {
      const message = FLOW_MESSAGES[kind]
      for (const fragment of sensitiveFragments) {
        expect(message.includes(fragment), `${kind} 的文案不应包含「${fragment}」`).toBe(false)
      }
    })
  }
})
