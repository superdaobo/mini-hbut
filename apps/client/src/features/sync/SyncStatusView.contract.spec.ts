// src/features/sync/SyncStatusView.contract.spec.ts
//
// Epic #1243（G6-01 / mini-hbut#1268）源码契约测试。
//
// 仓库没有 @vue/test-utils / DOM 环境（见 CampusCodeView.spec.ts 的说明），
// 组件行为通过可注入的展示模型单测覆盖；本文件只锁「组件必须接线到展示模型、
// 且**不得**出现按数据年龄的过期告警」这些容易被后续重构改回旧实现的契约。

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')

/**
 * 去掉 HTML 与 JS 注释后再做「禁用词」扫描。
 *
 * 为什么必须去注释：组件头部注释里**必须**写明「不得出现过期告警」这条红线，
 * 而那段说明本身就含有「过期」二字。不剥注释的话，这条契约测试会被自己的文档打死
 * （检查点 B 在 iframe 沙箱那里踩过同一个坑）。
 */
const stripComments = (text: string): string =>
  text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('SyncStatusView #1268 契约', () => {
  const raw = read('./SyncStatusView.vue')
  const source = stripComments(raw)

  it('必须接线到展示模型（buildSyncStatus / rowSubtitle）', () => {
    expect(source).toContain('buildSyncStatus')
    expect(source).toContain('rowSubtitle')
    expect(source).toContain("from './syncStatusViewModel'")
  })

  it('**不得**出现按数据年龄的过期告警或强制刷新文案', () => {
    for (const banned of ['已过期', '可能过期', '数据过期', '请刷新', '强制刷新']) {
      expect(source).not.toContain(banned)
    }
    // 模板里只允许「最后同步」这种绝对时间表述
    expect(raw).toContain('最后同步')
  })

  it('「立即刷新」是用户主动入口（不是自动强制刷新）', () => {
    expect(source).toContain('立即刷新')
    // 不得出现定时器式的强制刷新
    expect(source).not.toContain('setInterval')
    expect(source).not.toContain('setTimeout')
  })

  it('不自己发请求（拉取与错误处理在调用方）', () => {
    expect(source).not.toContain('fetch(')
    expect(source).not.toContain('axios')
  })

  it('四态都要有对应的状态样式钩子', () => {
    for (const state of ['ok', 'unauthorized', 'unavailable']) {
      expect(source).toContain(`data-state='${state}'`)
    }
  })

  it('有可访问性标注（aria-labelledby + role=alert）', () => {
    expect(source).toContain('aria-labelledby')
    expect(source).toContain('role="alert"')
  })
})
