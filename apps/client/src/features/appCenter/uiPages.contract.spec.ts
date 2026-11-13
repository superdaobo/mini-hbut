// src/features/appCenter/uiPages.contract.spec.ts
//
// Epic #1243 两个 UI 页（#1253 应用中心 / #1256 授权管理）的源码契约测试。
//
// 仓库没有 @vue/test-utils / DOM 环境（见 CampusCodeView.spec.ts），
// 组件行为由展示模型单测覆盖；本文件只锁「必须接线到展示模型」与「产品红线不得回退」。
//
// 注意：断言前**必须剥注释** —— 组件头注释里写着「不得出现 XXX」，那段话本身含禁用词，
// 不剥注释这条测试会被自己的文档打死（检查点 B / T17 同步状态页各踩过一次）。

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')

const stripComments = (text: string): string =>
  text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('AppCenterView #1253 契约', () => {
  const source = stripComments(read('./AppCenterView.vue'))

  it('必须接线到展示模型', () => {
    expect(source).toContain('buildAppCenter')
    expect(source).toContain('canOpenCard')
    expect(source).toContain('cardSubtitle')
    expect(source).toContain('privacyText')
    expect(source).toContain("from './appCenterViewModel'")
  })

  it('已下架应用不可点击（disabled 绑定在 actionable 上）', () => {
    expect(source).toContain(':disabled="!card.actionable"')
  })

  it('未提供隐私说明要明说（不隐藏）', () => {
    expect(source).toContain('privacyText(card)')
  })

  it('不自己发请求、无定时器', () => {
    expect(source).not.toContain('fetch(')
    expect(source).not.toContain('axios')
    expect(source).not.toContain('setInterval')
  })

  it('有可访问性标注', () => {
    expect(source).toContain('aria-labelledby')
    expect(source).toContain('role="alert"')
  })
})

describe('ConsentManagementView #1256 契约', () => {
  const source = stripComments(read('../identity/consent/ConsentManagementView.vue'))

  it('必须接线到展示模型', () => {
    expect(source).toContain('buildConsentManagement')
    expect(source).toContain('selectedDomains')
    expect(source).toContain('summaryText')
    expect(source).toContain("from './consentManagementViewModel'")
  })

  it('**必须**展示「不影响学号登录」的说明', () => {
    expect(source).toContain('model.notice')
    // 说明文本来自模型；此处再锁一次模型侧的关键词，防止有人把说明删掉
    const modelSource = read('../identity/consent/consentManagementViewModel.ts')
    expect(modelSource).toContain('不影响你用学号登录')
  })

  it('逐项独立：每行一个复选框（没有「全部开启」）', () => {
    expect(source).toContain('type="checkbox"')
    expect(source).not.toContain('全部开启')
    expect(source).not.toContain('一键授权')
  })

  it('只提交已勾选项（空选不提交）', () => {
    expect(source).toContain('selectedDomains(')
    expect(source).toContain('if (!domains.length) return')
  })

  it('不自己发请求、无定时器、无自动弹窗', () => {
    expect(source).not.toContain('fetch(')
    expect(source).not.toContain('axios')
    expect(source).not.toContain('setInterval')
    expect(source).not.toContain('window.confirm')
  })

  it('有可访问性标注（aria-label + role=alert）', () => {
    expect(source).toContain('aria-label')
    expect(source).toContain('role="alert"')
  })
})
