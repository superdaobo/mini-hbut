/**
 * 图书馆预约 · 静音仓 / 研讨室领域层单测（#1058 收口）
 *
 * 覆盖 catalog.ts 的纯逻辑（无网络、无副作用）：
 * 1. **错误分支可判别**：未登录 / 无权限 / 网络 / 业务失败 必须映射到不同文案，
 *    且网络失败单独标记（组件据此选择提示样式与停留时长）；
 * 2. 动态表单归一化与本地校验（必填 / 数字 / 格式 / 正则）；
 * 3. 时段归一化三态（free / taken / closed）与日期工具。
 */
import { describe, expect, it } from 'vitest'
import {
  RESERVE_ERROR_MESSAGE_KEYS,
  SEMINAR_RESOURCES,
  QUIET_RESOURCES,
  RESOURCE_CATALOG,
  buildDateOptions,
  buildInitialValues,
  extractHm,
  matchesDate,
  normalizeFormFields,
  normalizeSlot,
  parseReserveFailure,
  sortKeyOf,
  stripHtml,
  summarizeFormValues,
  toFormData,
  toDateKey,
  validateFormValues,
  type FormField,
  type ReserveResource
} from './catalog'

describe('parseReserveFailure（错误分支可判别）', () => {
  it('未登录 / 无权限 / 网络三类可区分，且只有网络标记为 network', () => {
    const notLoggedIn = parseReserveFailure({
      kind: 'chaoxing_not_logged_in',
      message: '未登录超星'
    })
    expect(notLoggedIn.kind).toBe('chaoxing_not_logged_in')
    expect(notLoggedIn.messageKey).toBe('library.reserve.error.notLoggedIn')
    expect(notLoggedIn.network).toBe(false)
    expect(notLoggedIn.detail).toBe('未登录超星')

    const noPerm = parseReserveFailure({ kind: 'no_permission', message: '无权限' })
    expect(noPerm.messageKey).toBe('library.reserve.error.noPermission')
    expect(noPerm.network).toBe(false)
    // 与未登录必须是不同文案（否则用户无法判断是否需要重新登录）
    expect(noPerm.messageKey).not.toBe(notLoggedIn.messageKey)

    const net = parseReserveFailure({ kind: 'network_unreachable', message: '连接超时' })
    expect(net.messageKey).toBe('library.reserve.error.network')
    expect(net.network).toBe(true)
  })

  it('业务失败各 kind 映射到不同文案，且都不标记 network', () => {
    const kinds = [
      'slot_unavailable',
      'reserve_limit_exceeded',
      'reserve_suspended',
      'business_rejected',
      'invalid_params'
    ]
    const keys = kinds.map((kind) => parseReserveFailure({ kind }).messageKey)
    for (const [i, key] of keys.entries()) {
      expect(key, `kind=${kinds[i]} 应有映射`).not.toBe('')
      expect(parseReserveFailure({ kind: kinds[i] }).network).toBe(false)
    }
    // 业务失败之间文案不同（时段被占 / 超限 / 停用 / 其它拒绝 / 参数错误）
    expect(new Set(keys).size).toBe(kinds.length)
  })

  it('Rust 侧全部错误 kind 均有前端文案映射（防止新增 kind 后静默退化）', () => {
    for (const kind of [
      'chaoxing_not_logged_in',
      'no_permission',
      'network_unreachable',
      'invalid_app',
      'unexpected_response',
      'slot_unavailable',
      'reserve_limit_exceeded',
      'reserve_suspended',
      'business_rejected',
      'invalid_params'
    ]) {
      expect(RESERVE_ERROR_MESSAGE_KEYS[kind], `缺少 kind=${kind} 的映射`).toBeTruthy()
    }
  })

  it('非结构化异常回落为通用失败（不误判为业务 / 网络）', () => {
    const runtimeErr = parseReserveFailure(new Error('invoke 不可用'))
    expect(runtimeErr.kind).toBe('')
    expect(runtimeErr.messageKey).toBe('')
    expect(runtimeErr.network).toBe(false)
    expect(runtimeErr.detail).toBe('invoke 不可用')

    const stringErr = parseReserveFailure('boom')
    expect(stringErr.detail).toBe('boom')

    // 空 message 时回落 Error.message
    const emptyMsg = parseReserveFailure({ kind: 'no_permission', message: '   ' })
    expect(emptyMsg.messageKey).toBe('library.reserve.error.noPermission')
    expect(emptyMsg.detail).toBe('')
  })
})

describe('动态表单（normalizeFormFields / 校验 / 提交体）', () => {
  const CONFIG = {
    parsed: true,
    fields: [
      {
        key: 'userName',
        label: '使用人',
        fieldType: 'text',
        required: true,
        raw: { pattern: '^[\\u4e00-\\u9fa5A-Za-z]+$' }
      },
      { key: 'people', label: '人数', fieldType: 'number', raw: { min: 2, max: 6 } },
      {
        key: 'purpose',
        label: '用途',
        fieldType: 'unknownType',
        options: [
          { label: '自习', value: 'study' },
          { name: '讨论', id: 'talk' }
        ]
      },
      { key: '   ', label: '无 key 应被跳过' },
      { key: 'tags', label: '标签', fieldType: 'checkbox', defaultValue: ['a', 'b'] }
    ]
  }

  it('归一化字段：跳过无 key、选项归一化、未知类型带选项降级为单选', () => {
    const { fields, parsed } = normalizeFormFields(CONFIG)
    expect(parsed).toBe(true)
    expect(fields.map((f) => f.key)).toEqual(['userName', 'people', 'purpose', 'tags'])

    const purpose = fields.find((f) => f.key === 'purpose')!
    expect(purpose.control).toBe('radio')
    expect(purpose.options).toEqual([
      { label: '自习', value: 'study' },
      { label: '讨论', value: 'talk' }
    ])

    const people = fields.find((f) => f.key === 'people')!
    expect(people.min).toBe(2)
    expect(people.max).toBe(6)

    const tags = fields.find((f) => f.key === 'tags')!
    expect(tags.control).toBe('checkbox')
    expect(tags.defaultValue).toBe('a,b')
  })

  it('未解析（parsed !== true）时如实标记，不伪造「已解析」', () => {
    // parsed 标记来自后端：字段仍按 best-effort 提取，但标记为未解析以提示用户
    const loose = normalizeFormFields({ fields: [{ key: 'x' }] })
    expect(loose.parsed).toBe(false)
    expect(loose.fields.map((f) => f.key)).toEqual(['x'])

    expect(normalizeFormFields(null)).toEqual({ fields: [], parsed: false })
    expect(normalizeFormFields({ parsed: true, fields: 'oops' })).toEqual({ fields: [], parsed: true })
  })

  it('本地校验：必填 / 数字上下限 / 正则', () => {
    const { fields } = normalizeFormFields(CONFIG)

    // 必填缺失
    const missing = validateFormValues(fields, {})
    expect(missing.valid).toBe(false)
    expect(missing.errors.userName).toBe('library.reserve.form.required')

    // 数字越界
    const outOfRange = validateFormValues(fields, { userName: '张三', people: '9' })
    expect(outOfRange.errors.people).toBe('library.reserve.form.max')

    // 正则不匹配（含空格）
    const badPattern = validateFormValues(fields, { userName: '张 三', people: '3' })
    expect(badPattern.errors.userName).toBe('library.reserve.form.format')

    // 全部合法
    const ok = validateFormValues(fields, { userName: '张三', people: '3', purpose: 'study' })
    expect(ok.valid).toBe(true)
    expect(ok.errors).toEqual({})
  })

  it('初始值 / 提交体：多值逗号连接、空值不提交', () => {
    const fields: FormField[] = normalizeFormFields(CONFIG).fields
    const initial = buildInitialValues(fields)
    expect(initial.tags).toEqual(['a', 'b'])
    expect(initial.userName).toBe('')

    const data = toFormData(fields, { userName: '张三', tags: ['a', 'b'], purpose: '' })
    expect(data).toEqual({ userName: '张三', tags: 'a,b' })

    expect(summarizeFormValues(fields, { userName: '张三', purpose: '' })).toEqual([
      { label: '使用人', value: '张三' }
    ])
  })
})

describe('normalizeSlot（时段三态与表单解析标记）', () => {
  const quiet: ReserveResource = QUIET_RESOURCES[0]

  it('status / remaining / 开放时段决定 free / taken / closed', () => {
    const free = normalizeSlot(
      { aprvId: 1, startTime: '09:00:00', endTime: '10:00:00' },
      0,
      quiet
    )
    expect(free.state).toBe('free')
    expect(free.start).toBe('09:00')
    expect(free.end).toBe('10:00')
    expect(free.aprvId).toBe(1)

    // status=1 → 已占用
    expect(normalizeSlot({ status: 1 }, 0, quiet).state).toBe('taken')
    // remaining<=0 → 已占用
    expect(normalizeSlot({ remaining: 0 }, 0, quiet).state).toBe('taken')
    // 越出开放时段（静音仓 08:00-21:30）→ 不开放
    expect(normalizeSlot({ startTime: '07:00' }, 0, quiet).state).toBe('closed')
    expect(normalizeSlot({ endTime: '22:00' }, 0, quiet).state).toBe('closed')
    // 未知状态视为可约，交由服务端裁决
    expect(normalizeSlot({}, 0, quiet).state).toBe('free')
  })

  it('customFormConfig 缺失视为已解析；存在但无法解析则 formParsed=false', () => {
    expect(normalizeSlot({}, 0, quiet).formParsed).toBe(true)
    const unparsed = normalizeSlot({ customFormConfig: { fields: [{ key: 'x' }] } }, 0, quiet)
    expect(unparsed.formParsed).toBe(false)
  })
})

describe('日期 / 文本工具', () => {
  it('buildDateOptions：含今天共 advanceDays+1 天，非法值不放大范围', () => {
    const now = new Date(2026, 9, 15) // 2026-10-15 本地
    const opts = buildDateOptions(3, now)
    expect(opts.map((o) => o.value)).toEqual([
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18'
    ])
    expect(opts.map((o) => o.offset)).toEqual([0, 1, 2, 3])

    expect(buildDateOptions(0, now)).toHaveLength(1)
    expect(buildDateOptions(-5, now)).toHaveLength(1)
    expect(buildDateOptions(Number.NaN, now)).toHaveLength(1)
  })

  it('toDateKey 使用本地日期（不受时区偏移影响）', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('extractHm 兼容多种时间形态', () => {
    expect(extractHm('08:00')).toBe('08:00')
    expect(extractHm('8:05')).toBe('08:05')
    expect(extractHm('08:00:00')).toBe('08:00')
    expect(extractHm('2026-10-16 08:00:00')).toBe('08:00')
    expect(extractHm('')).toBe('')
    expect(extractHm(null)).toBe('')
  })

  it('matchesDate 按数字后缀比对多种日期形态', () => {
    expect(matchesDate('2026-10-16', '2026-10-16')).toBe(true)
    expect(matchesDate('2026/10/16', '2026-10-16')).toBe(true)
    expect(matchesDate('10-16', '2026-10-16')).toBe(true)
    expect(matchesDate('2026-10-17', '2026-10-16')).toBe(false)
    expect(matchesDate('', '2026-10-16')).toBe(false)
  })

  it('stripHtml 去除标签与实体（防 XSS 展示）', () => {
    expect(stripHtml('<p>1. 按号就坐</p>')).toBe('1. 按号就坐')
    expect(stripHtml('a&nbsp;b &amp; c')).toBe('a b & c')
    expect(stripHtml(null)).toBe('')
  })

  it('sortKeyOf：缺失日期排末尾', () => {
    expect(sortKeyOf({ date: '2026-10-16', start: '08:00' })).toBe('2026-10-16 08:00')
    expect(sortKeyOf({ date: '', start: '' })).toBe('9999-99-99 99:99')
  })
})

describe('资源目录（与命令层 parse_pc_app 取值一致）', () => {
  it('静音仓 5 间 / 研讨室 7 间，且 app 标识与后端一致', () => {
    expect(RESOURCE_CATALOG.quiet_room).toHaveLength(5)
    expect(RESOURCE_CATALOG.seminar_room).toHaveLength(7)
    expect(QUIET_RESOURCES.every((r) => r.app === 'quiet_room')).toBe(true)
    expect(SEMINAR_RESOURCES.every((r) => r.app === 'seminar_room')).toBe(true)
    // 研讨室 7 号为大型间（6-30 人），其余 2-8 人
    expect(SEMINAR_RESOURCES[6]).toMatchObject({ capacityMin: 6, capacityMax: 30 })
    expect(SEMINAR_RESOURCES[0]).toMatchObject({ capacityMin: 2, capacityMax: 8 })
  })
})
