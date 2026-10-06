// #719 校内证书探测 composable 测试：
// 1. 显示/隐藏逻辑（仅 cert-error 域产生黄色提示文案）
// 2. 会话内防重复探测（模块级 Promise 缓存）
// 3. MeView.vue 展示位与挂载触发的源码契约

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readVueContractSource } from '../utils/contract_source_test'

// hoisted mock：避免 vi.mock 提升导致的外部变量未初始化问题
const { invokeNativeMock } = vi.hoisted(() => ({ invokeNativeMock: vi.fn() }))

vi.mock('../platform/native', () => ({
  invokeNative: invokeNativeMock
}))

/** 每个用例重新加载模块，隔离 module-scope 的探测缓存 */
const loadCertProbeModule = async () => {
  vi.resetModules()
  return import('./certProbe')
}

beforeEach(() => {
  invokeNativeMock.mockReset()
})

describe('certIssueMessagesFromResults 显示/隐藏逻辑', () => {
  it('ok 与 network-error 一律不产生提示文案', async () => {
    const { certIssueMessagesFromResults } = await loadCertProbeModule()
    expect(
      certIssueMessagesFromResults([
        { domain: 'jwxt.hbut.edu.cn', status: 'ok' },
        { domain: 'e.hbut.edu.cn', status: 'network-error' }
      ])
    ).toEqual([])
  })

  it('cert-error 域逐个生成含域名与兼容模式的中性文案', async () => {
    const { certIssueMessagesFromResults } = await loadCertProbeModule()
    const messages = certIssueMessagesFromResults([
      { domain: 'jwxt.hbut.edu.cn', status: 'cert-error' },
      { domain: 'e.hbut.edu.cn', status: 'ok' }
    ])
    expect(messages).toEqual(['jwxt.hbut.edu.cn 证书校验未通过，已以兼容模式连接'])
    // 中性措辞约束：必须提及域名与兼容模式，不得写死“已过期”
    expect(messages[0]).toContain('jwxt.hbut.edu.cn')
    expect(messages[0]).toContain('兼容模式')
    expect(messages[0]).not.toContain('已过期')
  })

  it('两个域均异常时全部展示', async () => {
    const { certIssueMessagesFromResults } = await loadCertProbeModule()
    const messages = certIssueMessagesFromResults([
      { domain: 'jwxt.hbut.edu.cn', status: 'cert-error' },
      { domain: 'e.hbut.edu.cn', status: 'cert-error' }
    ])
    expect(messages).toHaveLength(2)
    expect(messages.every((m) => m.includes('兼容模式'))).toBe(true)
  })

  it('非法输入安全降级为空列表', async () => {
    const { certIssueMessagesFromResults } = await loadCertProbeModule()
    expect(certIssueMessagesFromResults(null)).toEqual([])
    expect(certIssueMessagesFromResults(undefined)).toEqual([])
    expect(certIssueMessagesFromResults([])).toEqual([])
  })
})

describe('ensureCertProbe 会话内防重复探测', () => {
  it('多次串行调用只真正 invoke 一轮，并更新响应式提示', async () => {
    const mod = await loadCertProbeModule()
    invokeNativeMock.mockResolvedValue([
      { domain: 'jwxt.hbut.edu.cn', status: 'cert-error' },
      { domain: 'e.hbut.edu.cn', status: 'ok' }
    ])

    await mod.ensureCertProbe()
    await mod.ensureCertProbe()

    expect(invokeNativeMock).toHaveBeenCalledTimes(1)
    // #1001：显式传 force=false（保持「会话内只探一轮」语义）；强制重探走 force=true
    expect(invokeNativeMock).toHaveBeenCalledWith('probe_school_cert_status', { force: false })

    const { certIssues } = mod.useCertProbeBanner()
    expect(certIssues.value).toEqual(['jwxt.hbut.edu.cn 证书校验未通过，已以兼容模式连接'])
  })

  it('remount 场景的并发调用同样只 invoke 一次', async () => {
    const mod = await loadCertProbeModule()
    invokeNativeMock.mockResolvedValue([{ domain: 'e.hbut.edu.cn', status: 'network-error' }])

    // 模拟两个组件实例同时挂载
    await Promise.all([mod.ensureCertProbe(), mod.ensureCertProbe()])

    expect(invokeNativeMock).toHaveBeenCalledTimes(1)
    const { certIssues } = mod.useCertProbeBanner()
    expect(certIssues.value).toEqual([])
  })

  it('invoke 失败时静默降级为空提示且不抛出', async () => {
    const mod = await loadCertProbeModule()
    invokeNativeMock.mockRejectedValue(new Error('当前运行时不支持 invoke'))

    await expect(mod.ensureCertProbe()).resolves.toEqual([])
    const { certIssues } = mod.useCertProbeBanner()
    expect(certIssues.value).toEqual([])
  })
})

describe('#1001 连接状态聚合（certProbeToneFromResults）', () => {
  it('任一域 network-error → network-error（优先于证书问题）', async () => {
    const { certProbeToneFromResults } = await loadCertProbeModule()
    expect(
      certProbeToneFromResults([
        { domain: 'jwxt.hbut.edu.cn', status: 'cert-error' },
        { domain: 'e.hbut.edu.cn', status: 'network-error' }
      ])
    ).toBe('network-error')
  })

  it('仅证书失败 → cert-error；两域全通 → ok', async () => {
    const { certProbeToneFromResults } = await loadCertProbeModule()
    expect(certProbeToneFromResults([{ domain: 'jwxt.hbut.edu.cn', status: 'cert-error' }])).toBe(
      'cert-error'
    )
    expect(
      certProbeToneFromResults([
        { domain: 'jwxt.hbut.edu.cn', status: 'ok' },
        { domain: 'e.hbut.edu.cn', status: 'ok' }
      ])
    ).toBe('ok')
  })

  it('空/非法输入 → unknown（不据此报红，避免误报）', async () => {
    const { certProbeToneFromResults } = await loadCertProbeModule()
    expect(certProbeToneFromResults(null)).toBe('unknown')
    expect(certProbeToneFromResults(undefined)).toBe('unknown')
    expect(certProbeToneFromResults([])).toBe('unknown')
  })
})

describe('#1001 强制重探（refreshCertProbe）', () => {
  it('force=true 绕过会话缓存，并用新结果覆盖响应式状态', async () => {
    const mod = await loadCertProbeModule()
    invokeNativeMock.mockResolvedValueOnce([
      { domain: 'jwxt.hbut.edu.cn', status: 'network-error' },
      { domain: 'e.hbut.edu.cn', status: 'network-error' }
    ])
    await mod.ensureCertProbe()
    const { certProbeTone } = mod.useCertProbeBanner()
    expect(certProbeTone.value).toBe('network-error')

    // 恢复联网后重探：结果必须覆盖旧值（会话缓存不得把红点永久钉住）
    invokeNativeMock.mockResolvedValueOnce([
      { domain: 'jwxt.hbut.edu.cn', status: 'ok' },
      { domain: 'e.hbut.edu.cn', status: 'ok' }
    ])
    await mod.refreshCertProbe()

    expect(invokeNativeMock).toHaveBeenCalledTimes(2)
    expect(invokeNativeMock).toHaveBeenLastCalledWith('probe_school_cert_status', { force: true })
    expect(certProbeTone.value).toBe('ok')
  })

  it('重探失败时降级为 unknown 且不抛出', async () => {
    const mod = await loadCertProbeModule()
    invokeNativeMock.mockRejectedValue(new Error('offline'))
    await expect(mod.refreshCertProbe()).resolves.toEqual([])
    const { certProbeTone } = mod.useCertProbeBanner()
    expect(certProbeTone.value).toBe('unknown')
  })
})

describe('MeView.vue 证书提示展示契约', () => {
  const vue = () => readVueContractSource('src/components/MeView.vue')

  it('登录状态卡片内按 certIssues 渲染黄色小字提示', () => {
    const source = vue()
    expect(source).toContain('v-for="msg in certIssues"')
    expect(source).toContain('class="cert-probe-warning"')
  })

  it('挂载即触发一轮探测，且不引入任何轮询', () => {
    const source = vue()
    expect(source).toContain('useCertProbeBanner')
    expect(source).toContain('onMounted(() => {')
    expect(source).toContain('ensureCertProbe()')
    // 轮询 API 禁用校验（字符串拆写以保持本仓库对该标识符的字面零命中）
    expect(source).not.toMatch(new RegExp(`set${'Interval'}`))
  })

  it('黄色样式覆盖亮色与暗色两套取色', () => {
    const source = vue()
    // 亮色 amber-700、暗色经 :global(html.dark) 提亮为 amber-400
    expect(source).toContain('.cert-probe-warning {')
    expect(source).toContain('#b45309')
    expect(source).toContain(':global(html.dark) .cert-probe-warning')
    expect(source).toContain('#fbbf24')
  })

  it('#1001：圆点由 connectionStatus 驱动，不再是静态绿点', () => {
    const source = vue()
    // 回归护栏：历史上圆点是裸的、无任何绑定（这正是 issue 的根因）
    expect(source).not.toContain('<span class="status-dot"></span>')
    expect(source).toContain("connectionStatus.tone === 'red'")
    expect(source).toContain('.status-dot.is-red')
    // 异常提示文案与圆点同源
    expect(source).toContain('connectionStatus.message')
    expect(source).toContain('.connection-warning {')
    // 会话权威与会话状态点同源（Dashboard 用的是同一个 store 字段）
    expect(source).toContain('useAuthStore')
    expect(source).toContain('onlineSessionState')
  })
})
