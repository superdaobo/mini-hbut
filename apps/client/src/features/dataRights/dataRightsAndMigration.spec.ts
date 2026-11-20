// src/features/dataRights/dataRightsAndMigration.spec.ts
//
// Epic #1243（G3-05 / mini-hbut#1258）两个展示模型的契约测试。
//
// 守的产品红线：
//   - 数据权利：**学校权威域不可删**（且要给出原因，不能让用户点了才发现失败）；
//     删除不影响学号登录；二次确认必须列出将删除的域；
//   - 迁移告知：只有「曾关闭 + 未确认」才提示；**「暂不」绝不能变成永久静默上传**。

import { describe, expect, it } from 'vitest'

import {
  DELETABLE_DOMAINS,
  SCHOOL_AUTHORITATIVE_DOMAINS,
  buildDataRights,
  deleteConfirmText,
  exportFileName
} from './dataRightsViewModel'
import {
  buildMigrationNotice,
  resolveMigrationChoice,
  wasSyncDisabled
} from '../sync/syncMigrationNotice'

const ALL = [...SCHOOL_AUTHORITATIVE_DOMAINS, ...DELETABLE_DOMAINS]

describe('dataRightsViewModel', () => {
  it('学校权威域标为不可删并给出原因', () => {
    const model = buildDataRights(ALL, new Set())
    const grades = model.rows.find((row) => row.domain === 'grades')!
    expect(grades.deletable).toBe(false)
    expect(grades.reason).toContain('学校权威数据')
    expect(grades.selected).toBe(false)
  })

  it('用户域可删；可删数量正确', () => {
    const model = buildDataRights(ALL, new Set())
    expect(model.deletableCount).toBe(DELETABLE_DOMAINS.length)
    const custom = model.rows.find((row) => row.domain === 'custom_courses')!
    expect(custom.deletable).toBe(true)
    expect(custom.reason).toBe('')
  })

  it('选中态只对可删域生效（不可删域即使传进 selected 也不算选中）', () => {
    const model = buildDataRights(ALL, new Set(['grades', 'personal_events']))
    expect(model.selectedCount).toBe(1)
    expect(model.rows.find((row) => row.domain === 'grades')!.selected).toBe(false)
    expect(model.canSubmitDelete).toBe(true)
  })

  it('空选不可提交；非 Set 输入按未选处理（fail closed）', () => {
    expect(buildDataRights(ALL, new Set()).canSubmitDelete).toBe(false)
    expect(
      buildDataRights(ALL, undefined as unknown as ReadonlySet<string>).selectedCount
    ).toBe(0)
  })

  it('页面说明必须包含三条关键信息', () => {
    const notice = buildDataRights(ALL, new Set()).notice
    expect(notice).toContain('导出')
    expect(notice).toContain('学校权威数据不会被删除')
    expect(notice).toContain('不影响你用学号登录')
  })

  it('跳过空域名；非数组 → 空模型', () => {
    expect(buildDataRights(['', '  ', 'grades'], new Set()).rows).toHaveLength(1)
    expect(buildDataRights(null as unknown as string[], new Set()).rows).toEqual([])
  })

  it('导出文件名本地生成（YYYYMMDD）', () => {
    expect(exportFileName(new Date('2026-11-13T10:00:00Z'))).toMatch(
      /^mini-hbut-data-\d{8}\.json$/
    )
  })

  it('二次确认文案列出将删除的域；无选中时为空', () => {
    const model = buildDataRights(ALL, new Set(['personal_events']))
    expect(deleteConfirmText(model.rows)).toContain('个人日程')
    expect(deleteConfirmText(buildDataRights(ALL, new Set()).rows)).toBe('')
  })
})

describe('syncMigrationNotice', () => {
  it('旧偏好识别：1/true/yes/boolean true', () => {
    expect(wasSyncDisabled('1')).toBe(true)
    expect(wasSyncDisabled('true')).toBe(true)
    expect(wasSyncDisabled('YES')).toBe(true)
    expect(wasSyncDisabled(true)).toBe(true)
    expect(wasSyncDisabled('0')).toBe(false)
    expect(wasSyncDisabled(undefined)).toBe(false)
  })

  it('曾关闭且未确认 → 必须显示告知页', () => {
    expect(buildMigrationNotice({ legacyDisabled: '1' }).shouldShow).toBe(true)
  })

  it('从没关闭过 → 不打扰', () => {
    expect(buildMigrationNotice({ legacyDisabled: null }).shouldShow).toBe(false)
    expect(buildMigrationNotice({ legacyDisabled: '0' }).shouldShow).toBe(false)
  })

  it('已确认过 → 不再显示', () => {
    expect(buildMigrationNotice({ legacyDisabled: '1', acknowledged: true }).shouldShow).toBe(false)
  })

  it('**「暂不」绝不能变成永久静默上传**', () => {
    const defer = resolveMigrationChoice('defer')
    expect(defer.allowUpload).toBe(false)
    expect(defer.markAcknowledged).toBe(false) // 下次还要问
    expect(defer.clearLegacyKey).toBe(false)
  })

  it('「继续」才会清旧键、写确认、允许上传', () => {
    expect(resolveMigrationChoice('accept')).toEqual({
      markAcknowledged: true,
      clearLegacyKey: true,
      allowUpload: true
    })
  })

  it('告知文案明确提到可导出/删除，不隐瞒', () => {
    const model = buildMigrationNotice({ legacyDisabled: '1' })
    expect(model.body).toContain('导出')
    expect(model.body).toContain('删除')
    expect(model.deferText).toContain('不上传')
  })
})
