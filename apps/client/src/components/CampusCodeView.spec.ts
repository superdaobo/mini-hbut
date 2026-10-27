/**
 * #1114 校园码页/适配器源码契约。
 *
 * 仓库没有 @vue/test-utils / DOM 环境，组件行为通过可注入控制器单测覆盖；
 * 本文件只锁「组件必须接线到控制器、失败必须恢复、错误必须保留 kind」这些
 * 容易被后续重构改回旧实现的契约。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('CampusCodeView #1114 刷新链接线契约', () => {
  const source = read('../components/CampusCodeView.vue')

  it('必须使用注入式刷新链，禁止回退到手工 setTimeout 自动刷新', () => {
    expect(source).toContain('createCampusCodeRefreshChain')
    expect(source).toContain('createOrderStatusPoller')
    expect(source).not.toContain('scheduleAutoRefresh')
    expect(source).not.toContain('refreshTimer = setTimeout')
  })

  it('失败后必须清空失效二维码并停止订单轮询', () => {
    expect(source).toContain('const applyQrFailure')
    expect(source).toContain('qrcodeText.value = \'\'')
    expect(source).toContain('qrImageDataUrl.value = \'\'')
    expect(source).toContain('stopOrderPolling()')
  })

  it('手动刷新必须可立即触发控制器，不依赖 loadingCode 旧状态', () => {
    expect(source).toContain('const manualRefresh')
    expect(source).toContain('chainRef.triggerNow()')
    expect(source).not.toContain('loadingCode')
  })

  it('卸载时必须停止刷新链/订单轮询并移除 visibilitychange', () => {
    expect(source).toContain("document.addEventListener('visibilitychange'")
    expect(source).toContain("document.removeEventListener('visibilitychange'")
    expect(source).toContain('stopChain()')
    expect(source).toContain('stopOrderPolling()')
  })

  it('失败状态必须通过 i18n key 展示，不在组件硬编码恢复文案', () => {
    expect(source).toContain("t('campuscode.state.stoppedAuth')")
    expect(source).toContain("t('campuscode.state.stoppedBusiness')")
    expect(source).toContain("tf('campuscode.state.recovering'")
  })
})

describe('axios_adapter/campus_code #1114 错误透传契约', () => {
  const source = read('../utils/axios_adapter/campus_code.ts')

  it('桥路径失败必须保留 success/error 结构，不能只 unwrap data', () => {
    expect(source).toContain('const bridgeResult')
    expect(source).toContain('res.success === false')
    expect(source).toContain('mockResponse(bridgeResult(res))')
  })

  it('Tauri 对象错误必须保留 kind，字符串错误保持兼容', () => {
    expect(source).toContain('const invokeErrorPayload')
    expect(source).toContain('{ kind, message: errorMessage(err) }')
    expect(source).toContain('mockResponse(invokeErrorPayload(err))')
  })
})

describe('#1114 三语状态文案', () => {
  const locales = ['zh-CN', 'en', 'ja']

  it('每种语言都包含恢复/停止状态 key', () => {
    for (const locale of locales) {
      const messages = read(`../utils/i18n/messages/${locale}.ts`)
      for (const key of [
        'campuscode.state.recovering',
        'campuscode.state.recoverFailed',
        'campuscode.state.stoppedAuth',
        'campuscode.state.stoppedBusiness'
      ]) {
        expect(messages, `${locale} 缺少 ${key}`).toContain(`'${key}'`)
      }
    }
  })
})
