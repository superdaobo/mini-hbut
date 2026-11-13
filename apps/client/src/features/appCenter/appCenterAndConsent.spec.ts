// src/features/appCenter/appCenterAndConsent.spec.ts
//
// Epic #1243 两个 UI 页展示模型的契约测试（#1253 应用中心 / #1256 授权管理）。
//
// 守的产品红线：
//   - 应用中心：`status !== active` → 已下架且不可进入；未提供隐私说明要**明说**；
//     `allowed_origins` 为空 = 不可内嵌（不是「不限制」）；
//   - 授权管理：逐项独立、撤销**不影响学号登录**（必须显式说明）、
//     未知状态一律按「未授权」（默认拒绝）、stale 需重新确认。

import { describe, expect, it } from 'vitest'

import {
  buildAppCenter,
  canOpenCard,
  cardSubtitle,
  isBareHttpsOrigin,
  privacyText
} from '../appCenter/appCenterViewModel'
import {
  buildConsentManagement,
  selectedDomains,
  summaryText
} from '../identity/consent/consentManagementViewModel'

const app = (overrides: Record<string, unknown> = {}) => ({
  client_id: 'app-a',
  label: '示例应用',
  owner: 'ops',
  status: 'active',
  data_domains: { grades: ['read'], schedule: ['read'] },
  allowed_origins: ['https://partner.example.com'],
  privacy_url: 'https://partner.example.com/privacy',
  ...overrides
})

describe('appCenterViewModel', () => {
  it('active 应用 → 已审核、可进入、可内嵌', () => {
    const model = buildAppCenter([app()])
    const card = model.cards[0]
    expect(card.badge).toBe('已审核')
    expect(canOpenCard(card)).toBe(true)
    expect(card.embeddable).toBe(true)
    expect(card.domains).toEqual(['成绩', '课表'])
    expect(model.notice).toBe('')
  })

  it('非 active → 已下架且不可进入（不能给 SSO）', () => {
    const card = buildAppCenter([app({ status: 'disabled' })]).cards[0]
    expect(card.badge).toBe('已下架')
    expect(canOpenCard(card)).toBe(false)
    expect(card.embeddable).toBe(false)
  })

  it('allowed_origins 为空 = 不可内嵌（不是「不限制」）', () => {
    const card = buildAppCenter([app({ allowed_origins: [] })]).cards[0]
    expect(card.embeddable).toBe(false)
  })

  it('非法 origin 被丢弃（http / 通配 / 带路径 / 大写 host）', () => {
    const card = buildAppCenter([
      app({
        allowed_origins: [
          'http://a.example.com',
          'https://*.example.com',
          'https://a.example.com/path',
          'https://A.example.com'
        ]
      })
    ]).cards[0]
    expect(card.embeddable).toBe(false)
  })

  it('未提供隐私说明要明说，不隐藏', () => {
    const card = buildAppCenter([app({ privacy_url: '' })]).cards[0]
    expect(privacyText(card)).toBe('未提供隐私说明')
    const withUrl = buildAppCenter([app()]).cards[0]
    expect(privacyText(withUrl)).toBe('查看隐私说明')
  })

  it('缺 client_id 的条目被丢弃；非数组输入 → 空 + 提示', () => {
    expect(buildAppCenter([{ label: 'no id' }, app()]).cards).toHaveLength(1)
    expect(buildAppCenter(null).notice).toBe('暂时无法加载应用列表')
    expect(buildAppCenter([]).notice).toBe('暂无已审核的应用')
  })

  it('全部下架 → 页面级提示', () => {
    const model = buildAppCenter([app({ status: 'disabled' }), app({ client_id: 'b', status: 'off' })])
    expect(model.allDisabled).toBe(true)
    expect(model.notice).toBe('已审核的应用当前均不可用')
  })

  it('副标题包含负责人与可申请类别', () => {
    const card = buildAppCenter([app()]).cards[0]
    expect(cardSubtitle(card)).toContain('负责人：ops')
    expect(cardSubtitle(card)).toContain('可申请：')
  })

  it('isBareHttpsOrigin 口径', () => {
    expect(isBareHttpsOrigin('https://a.example.com')).toBe(true)
    expect(isBareHttpsOrigin('https://a.example.com:8443')).toBe(true)
    expect(isBareHttpsOrigin('http://a.example.com')).toBe(false)
    expect(isBareHttpsOrigin('https://a.example.com/x')).toBe(false)
    expect(isBareHttpsOrigin('https://*')).toBe(false)
  })
})

describe('consentManagementViewModel', () => {
  it('逐域映射状态与动作', () => {
    const model = buildConsentManagement([
      { domain: 'schedule', state: 'granted' },
      { domain: 'grades', state: 'revoked' },
      { domain: 'exams', state: 'never' },
      { domain: 'rank', state: 'stale' }
    ])
    expect(model.rows.map((row) => [row.state, row.action])).toEqual([
      ['granted', 'revoke'],
      ['revoked', 'grant'],
      ['never', 'grant'],
      ['stale', 'renew']
    ])
    expect(model.grantedCount).toBe(1)
    expect(model.canRevokeAll).toBe(true)
  })

  it('**撤销不影响学号登录**必须在页面说明里出现', () => {
    const model = buildConsentManagement([{ domain: 'grades', state: 'granted' }])
    expect(model.notice).toContain('不影响你用学号登录')
  })

  it('未知状态按「未授权」处理（默认拒绝）', () => {
    const model = buildConsentManagement([{ domain: 'grades', state: 'weird' }])
    expect(model.rows[0].state).toBe('never')
    expect(model.rows[0].granted).toBe(false)
  })

  it('跳过缺 domain 的条目；非数组 → 空模型', () => {
    expect(buildConsentManagement([{ state: 'granted' }, { domain: 'grades', state: 'granted' }]).rows).toHaveLength(1)
    const empty = buildConsentManagement(null)
    expect(empty.rows).toEqual([])
    expect(empty.canRevokeAll).toBe(false)
  })

  it('只提交已勾选的域（未勾选不提交）', () => {
    const model = buildConsentManagement([
      { domain: 'schedule', state: 'never' },
      { domain: 'grades', state: 'never' }
    ])
    expect(selectedDomains(model.rows, new Set(['schedule']))).toEqual(['schedule'])
    expect(selectedDomains(model.rows, new Set())).toEqual([])
    // 非 Set 输入 fail closed
    expect(selectedDomains(model.rows, undefined as unknown as ReadonlySet<string>)).toEqual([])
  })

  it('汇总文案', () => {
    expect(summaryText(buildConsentManagement([]))).toBe('该应用未申请任何数据类别')
    expect(
      summaryText(
        buildConsentManagement([
          { domain: 'grades', state: 'granted' },
          { domain: 'schedule', state: 'never' }
        ])
      )
    ).toBe('已授权 1 / 2 项')
  })
})
