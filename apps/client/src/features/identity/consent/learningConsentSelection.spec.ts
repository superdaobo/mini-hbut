// src/features/identity/consent/learningConsentSelection.spec.ts
//
// Epic #1243（G3-03 / mini-hbut#1256）契约测试：**逐类同意**的勾选模型。
//
// 守的契约：
//   1. **部分勾选合法**（提交目标是 OCR 逐域 API，未勾选项不进请求体）；
//   2. 全部未勾选 → `canSubmit=false` + 沿用 #699 冻结文案（逐字一致）；
//   3. `granted`/`denied` 按请求顺序拆分，直接可用于 `grant`/展示；
//   4. 健壮性：多余 id 忽略、非 Set 输入按未勾选处理（fail closed）；
//   5. 本模块**不改**旧 `learningDataConsent.ts` 的全集守卫（那条流程仍走 Core）。

import { describe, expect, it } from 'vitest'

import { LEARNING_DATA_SCOPE_LABELS } from '../learningDataConsent'
import {
  consentSelectionNotice,
  resolveConsentSelection,
  selectAll
} from './learningConsentSelection'

const items = [
  { id: 'student.grades.read' as const, label: LEARNING_DATA_SCOPE_LABELS['student.grades.read'] },
  {
    id: 'student.timetable.read' as const,
    label: LEARNING_DATA_SCOPE_LABELS['student.timetable.read']
  }
]

describe('learningConsentSelection（Epic #1243 逐类同意）', () => {
  it('全选 → canSubmit，两个域都在 granted', () => {
    const state = resolveConsentSelection(items, selectAll(items))
    expect(state).toEqual({
      canSubmit: true,
      allDenied: false,
      partial: false,
      granted: ['student.grades.read', 'student.timetable.read'],
      denied: []
    })
    expect(consentSelectionNotice(state)).toBe('')
  })

  it('部分勾选 → **可提交**，只把勾选项放进 granted', () => {
    const selected = selectAll(items)
    selected.delete('student.grades.read')
    const state = resolveConsentSelection(items, selected)
    expect(state.canSubmit).toBe(true)
    expect(state.partial).toBe(true)
    expect(state.granted).toEqual(['student.timetable.read'])
    expect(state.denied).toEqual(['student.grades.read'])
    expect(consentSelectionNotice(state)).toContain('只')
  })

  it('全部未勾选 → 不可提交 + 沿用 #699 冻结文案', () => {
    const state = resolveConsentSelection(items, new Set())
    expect(state.canSubmit).toBe(false)
    expect(state.allDenied).toBe(true)
    expect(state.granted).toEqual([])
    expect(state.denied).toEqual(['student.grades.read', 'student.timetable.read'])
    expect(consentSelectionNotice(state)).toBe('该应用要求的数据权限已被取消，无法继续')
  })

  it('请求为空 → 无域可授予，也不算「全部拒绝」', () => {
    const state = resolveConsentSelection([], new Set())
    expect(state).toEqual({
      canSubmit: false,
      allDenied: false,
      partial: false,
      granted: [],
      denied: []
    })
  })

  it('健壮性：多余 id 被忽略；非 Set 输入按未勾选处理', () => {
    const polluted = new Set([...items.map((item) => item.id), 'unknown.scope'])
    const state = resolveConsentSelection(items, polluted)
    expect(state.granted).toEqual(['student.grades.read', 'student.timetable.read'])

    const broken = resolveConsentSelection(items, undefined as unknown as ReadonlySet<string>)
    expect(broken.canSubmit).toBe(false)
    expect(broken.allDenied).toBe(true)
  })

  it('granted 顺序与请求顺序一致（不按字母/冻结顺序重排）', () => {
    const reversed = [items[1], items[0]]
    const state = resolveConsentSelection(reversed, new Set(['student.timetable.read']))
    expect(state.granted).toEqual(['student.timetable.read'])
    expect(state.denied).toEqual(['student.grades.read'])
  })
})
