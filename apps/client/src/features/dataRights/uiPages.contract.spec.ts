// src/features/dataRights/uiPages.contract.spec.ts
//
// Epic #1243（G3-05 / mini-hbut#1258）两个新页面的源码契约测试。
//
// 仓库没有 @vue/test-utils / DOM 环境，行为由展示模型单测覆盖；
// 本文件只锁「必须接线到展示模型」与「产品红线不得回退」。
// 断言前必须剥注释（注释里含禁用词，检查点 B / 同步状态页 / 两个 UI 页各踩过一次）。

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')

const stripComments = (text: string): string =>
  text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('DataRightsView #1258 契约', () => {
  const source = stripComments(read('./DataRightsView.vue'))

  it('必须接线到展示模型', () => {
    expect(source).toContain('buildDataRights')
    expect(source).toContain('deleteConfirmText')
    expect(source).toContain("from './dataRightsViewModel'")
  })

  it('学校权威域不可勾选（disabled 绑定在 deletable 上）', () => {
    expect(source).toContain(':disabled="!row.deletable"')
    expect(source).toContain('if (!deletable) return')
  })

  it('删除前必须二次确认', () => {
    expect(source).toContain('confirming')
    expect(source).toContain('确认删除')
    expect(source).toContain('role="alert"')
  })

  it('不自己发请求、无定时器、无原生 confirm 弹窗', () => {
    expect(source).not.toContain('fetch(')
    expect(source).not.toContain('axios')
    expect(source).not.toContain('setInterval')
    expect(source).not.toContain('window.confirm')
  })
})

describe('SyncMigrationNoticeView #1258 契约', () => {
  const source = stripComments(read('../sync/SyncMigrationNoticeView.vue'))

  it('必须接线到展示模型与选择落地函数', () => {
    expect(source).toContain('buildMigrationNotice')
    expect(source).toContain('resolveMigrationChoice')
    expect(source).toContain("from './syncMigrationNotice'")
  })

  it('只在 shouldShow 时渲染（不打扰从未关闭过的用户）', () => {
    expect(source).toContain('v-if="model.shouldShow"')
  })

  it('提供「继续」与「暂不」两个选择', () => {
    expect(source).toContain("choose('accept')")
    expect(source).toContain("choose('defer')")
  })

  it('不自己写 localStorage（落地由调用方按返回值执行）', () => {
    expect(source).not.toContain('localStorage')
  })

  it('有对话框语义', () => {
    expect(source).toContain('role="dialog"')
    expect(source).toContain('aria-labelledby')
  })
})
