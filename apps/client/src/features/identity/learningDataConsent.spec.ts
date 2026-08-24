// src/features/identity/learningDataConsent.spec.ts
//
// #699：学习数据 scope 逐项勾选纯函数单测（选中集合计算 / 全部取消守卫）。

import { describe, expect, it } from 'vitest'
import {
  LEARNING_DATA_SCOPE_IDS,
  LEARNING_DATA_SCOPE_LABELS,
  defaultLearningConsent,
  learningConsentNotice,
  resolveLearningConsent,
  splitLearningDataScopes
} from './learningDataConsent'
import type { IdentityScopeInfo } from './types'

const scope = (id: string): IdentityScopeInfo => ({ id, label: `label:${id}`, risk: 'basic' })

const bothScopes = (): IdentityScopeInfo[] => [
  scope('openid'),
  scope('student.grades.read'),
  scope('student.identity'),
  scope('student.timetable.read')
]

describe('#699 学习数据 scope 拆分与冻结文案', () => {
  it('拆分：学习数据项按冻结顺序输出冻结文案，其余 scope 保持原顺序', () => {
    const result = splitLearningDataScopes(bothScopes())
    // 学习数据项只含冻结 id，顺序 = 冻结顺序（与请求中的出现顺序无关）
    expect(result.learning.map((item) => item.id)).toEqual([
      'student.grades.read',
      'student.timetable.read'
    ])
    // 冻结文案逐字遵守
    expect(LEARNING_DATA_SCOPE_LABELS['student.grades.read']).toBe(
      '全部成绩单（含各学期成绩与绩点）'
    )
    expect(LEARNING_DATA_SCOPE_LABELS['student.timetable.read']).toBe('完整课表')
    expect(result.learning.every((item) => item.label === LEARNING_DATA_SCOPE_LABELS[item.id])).toBe(true)
    // 其余 scope 维持现有展示方式：原样保留原顺序
    expect(result.others.map((item) => item.id)).toEqual(['openid', 'student.identity'])
  })

  it('拆分：请求不含学习数据项时 learning 为空、others 为全量', () => {
    const result = splitLearningDataScopes([scope('openid'), scope('profile')])
    expect(result.learning).toEqual([])
    expect(result.others.map((item) => item.id)).toEqual(['openid', 'profile'])
  })

  it('拆分：非数组输入防御性返回空结果；未知 id 不进入学习数据组', () => {
    expect(splitLearningDataScopes(undefined as unknown as IdentityScopeInfo[])).toEqual({
      learning: [],
      others: []
    })
    const result = splitLearningDataScopes([scope('student.grades.read.only')])
    expect(result.learning).toEqual([])
    expect(result.others).toHaveLength(1)
  })
})

describe('#699 勾选守卫：选中集合计算与全部取消阻断', () => {
  const items = splitLearningDataScopes(bothScopes()).learning

  it('默认全选：defaultLearningConsent 覆盖请求中全部学习数据项', () => {
    const selected = defaultLearningConsent(items)
    expect(selected.size).toBe(2)
    for (const id of LEARNING_DATA_SCOPE_IDS) {
      expect(selected.has(id)).toBe(true)
    }
    // 全选时可批准
    expect(resolveLearningConsent(items, selected)).toEqual({
      canApprove: true,
      allRevoked: false,
      someRevoked: false
    })
  })

  it('部分取消：不可批准（Core 只接受全集，取消项不得进入批准范围）', () => {
    const selected = defaultLearningConsent(items)
    selected.delete('student.grades.read')
    const state = resolveLearningConsent(items, selected)
    expect(state.canApprove).toBe(false)
    expect(state.someRevoked).toBe(true)
    expect(state.allRevoked).toBe(false)
    // 部分取消提示不含「仍会提交」类扩大授权表述
    const notice = learningConsentNotice(state)
    expect(notice).not.toContain('仍会')
    expect(notice).toContain('整体授予')
  })

  it('全部取消：阻断守卫 + 冻结文案「该应用要求的数据权限已被取消，无法继续」', () => {
    const state = resolveLearningConsent(items, new Set())
    expect(state.canApprove).toBe(false)
    expect(state.allRevoked).toBe(true)
    expect(state.someRevoked).toBe(false)
    expect(learningConsentNotice(state)).toBe('该应用要求的数据权限已被取消，无法继续')
  })

  it('请求不含学习数据项：不参与勾选逻辑，维持原有批准路径', () => {
    expect(resolveLearningConsent([], new Set())).toEqual({
      canApprove: true,
      allRevoked: false,
      someRevoked: false
    })
    expect(learningConsentNotice({ canApprove: true, allRevoked: false, someRevoked: false })).toBe('')
  })

  it('健壮性：选中集合包含未知 id 或非 Set 输入时不误判为已选', () => {
    const polluted = new Set([...items.map((item) => item.id), 'unknown.scope'])
    expect(resolveLearningConsent(items, polluted).canApprove).toBe(true)
    // 全部未知 id：等于全部未勾选
    expect(resolveLearningConsent(items, new Set(['unknown.scope'])).allRevoked).toBe(true)
    // 非 Set 输入（如 undefined）：fail closed，视为全部取消
    expect(
      resolveLearningConsent(items, undefined as unknown as ReadonlySet<string>).canApprove
    ).toBe(false)
  })
})
