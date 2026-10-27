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
import { t } from '../../utils/app_i18n'
import {
  RESERVE_ERROR_DETAIL_MAX,
  RESERVE_ERROR_MESSAGE_KEYS,
  SEMINAR_RESOURCES,
  QUIET_RESOURCES,
  RESOURCE_CATALOG,
  buildDateOptions,
  buildInitialValues,
  buildSlotTimeRange,
  extractHm,
  formatFieldErrorText,
  formatReserveFailureText,
  matchesDate,
  normalizeFormFields,
  normalizeMyReservation,
  normalizeSlot,
  parseReserveFailure,
  pickSelectedSlot,
  resolveFieldErrorLimit,
  sortKeyOf,
  stripHtml,
  summarizeFormValues,
  toFormData,
  toDateKey,
  toLocalHm,
  truncateReserveDetail,
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
      'credential_invalid',
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

  it('#1075：credential_invalid 与 no_permission 必须是不同文案，且不标记 network', () => {
    const credential = parseReserveFailure({ kind: 'credential_invalid', message: '凭证缺失' })
    expect(credential.kind).toBe('credential_invalid')
    expect(credential.messageKey).toBe('library.reserve.error.credentialInvalid')
    expect(credential.network).toBe(false)
    // 缺凭证 ≠ 无权限：文案必须区分（否则又会把用户引向「账号被禁用」的误判）
    expect(credential.messageKey).not.toBe(parseReserveFailure({ kind: 'no_permission' }).messageKey)
    // 且不得与「未登录」混同
    expect(credential.messageKey).not.toBe(
      parseReserveFailure({ kind: 'chaoxing_not_logged_in' }).messageKey
    )
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

// ── #1082 失败文案组装（用户反馈：提交失败必须能看见服务端原文） ──

describe('#1082 失败文案组装（始终带出服务端原文）', () => {
  /** 假翻译：直接回显 key，便于断言拼接结构 */
  const translate = (key: string): string => `[${key}]`

  it('truncateReserveDetail：空 / 空白 → 空串；正常原样；超长截断并加省略号', () => {
    expect(truncateReserveDetail('')).toBe('')
    expect(truncateReserveDetail('   ')).toBe('')
    expect(truncateReserveDetail(null)).toBe('')
    expect(truncateReserveDetail(undefined)).toBe('')
    expect(truncateReserveDetail('预约区域不存在')).toBe('预约区域不存在')

    const long = 'x'.repeat(RESERVE_ERROR_DETAIL_MAX + 50)
    const cut = truncateReserveDetail(long)
    expect(cut).toHaveLength(RESERVE_ERROR_DETAIL_MAX + 1) // 截断 + 省略号
    expect(cut.endsWith('…')).toBe(true)
    // 自定义上限
    expect(truncateReserveDetail('abcdef', 3)).toBe('abc…')
  })

  it('已知 kind：i18n 文案 + 细节后缀 + 服务端原文（原文不再被丢弃）', () => {
    const failure = parseReserveFailure({ kind: 'slot_unavailable', message: '该时段已被预约' })
    expect(formatReserveFailureText(failure, translate)).toBe(
      '[library.reserve.error.slotUnavailable][library.reserve.error.detailSuffix]该时段已被预约'
    )
  })

  it('未知 kind：直接给服务端原文；原文也为空 → 回落 fallbackKey（座位提交用专用兜底）', () => {
    const unknown = parseReserveFailure({ kind: 'brand_new_kind', message: '服务端拒绝：区域已关闭' })
    expect(formatReserveFailureText(unknown, translate)).toBe('服务端拒绝：区域已关闭')

    const empty = parseReserveFailure({ kind: 'brand_new_kind' })
    expect(formatReserveFailureText(empty, translate)).toBe('[library.reserve.error.unknown]')
    expect(
      formatReserveFailureText(empty, translate, 'library.reserve.seat.submit.error.submit')
    ).toBe('[library.reserve.seat.submit.error.submit]')
  })

  it('已知 kind 但无 detail → 只给 i18n 文案（不拼接空的细节后缀）', () => {
    const failure = parseReserveFailure({ kind: 'no_permission' })
    expect(formatReserveFailureText(failure, translate)).toBe('[library.reserve.error.noPermission]')
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

describe('表单错误文案（P1-2：按错误 key 取对应限值，而非恒取下限）', () => {
  // 研讨室人数：同时具备上下限（min=2 / max=6），旧实现 `field.min ?? field.max` 恒取 2
  const people = normalizeFormFields({
    parsed: true,
    fields: [{ key: 'people', label: '人数', fieldType: 'number', raw: { min: 2, max: 6 } }]
  }).fields[0]

  it('resolveFieldErrorLimit：max 取上限、min 取下限，其它错误无 {n}', () => {
    expect(resolveFieldErrorLimit(people, 'library.reserve.form.max')).toBe(6)
    expect(resolveFieldErrorLimit(people, 'library.reserve.form.min')).toBe(2)
    expect(resolveFieldErrorLimit(people, 'library.reserve.form.required')).toBeNull()
  })

  it('渲染文本：输入超上限显示上限值（不能大于 6，而非把容量说成 2）', () => {
    const validation = validateFormValues([people], { people: '9' })
    expect(validation.errors.people).toBe('library.reserve.form.max')
    // 断言最终渲染文本 —— 旧测试只断言 error key，故未捕获「不能大于 2」的文案错误
    expect(formatFieldErrorText(people, validation.errors.people, t)).toBe('不能大于 6')
  })

  it('渲染文本：低于下限显示下限值', () => {
    const validation = validateFormValues([people], { people: '1' })
    expect(validation.errors.people).toBe('library.reserve.form.min')
    expect(formatFieldErrorText(people, validation.errors.people, t)).toBe('不能小于 2')
  })

  it('无 {n} 占位的错误原样返回；空 key 返回空串', () => {
    const required = formatFieldErrorText(people, 'library.reserve.form.required', t)
    expect(required).not.toContain('{n}')
    expect(required).not.toContain('6')
    expect(formatFieldErrorText(people, '', t)).toBe('')
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

describe('pickSelectedSlot（P1-3：只在当前可见时段中解析已选）', () => {
  const quiet: ReserveResource = QUIET_RESOURCES[0]
  const dayA = normalizeSlot({ aprvId: 1, date: '2026-10-16', startTime: '09:00' }, 0, quiet)
  const dayB = normalizeSlot({ aprvId: 2, date: '2026-10-17', startTime: '10:00' }, 1, quiet)

  it('命中可见列表返回条目', () => {
    expect(pickSelectedSlot([dayA, dayB], dayA.id)).toBe(dayA)
  })

  it('切换日期后旧时段不在可见列表 → 返回 null（表单 / 提交条随之隐藏）', () => {
    // 日期 B 的可见列表不含日期 A 的时段；若仍从全量 slots 解析，旧时段会残留并被误提交
    expect(pickSelectedSlot([dayB], dayA.id)).toBeNull()
    expect(pickSelectedSlot([], dayA.id)).toBeNull()
    expect(pickSelectedSlot([dayA, dayB], '')).toBeNull()
  })
})

describe('buildSlotTimeRange（P1-4：所选日期 → 查询起止边界）', () => {
  it('按日期边界生成起止（当天 00:00 – 23:59）', () => {
    expect(buildSlotTimeRange('2026-10-16')).toEqual({
      startTime: '2026-10-16 00:00',
      endTime: '2026-10-16 23:59'
    })
  })

  it('空日期返回空串（调用方据此省略参数，不下发无意义边界）', () => {
    expect(buildSlotTimeRange('')).toEqual({ startTime: '', endTime: '' })
    expect(buildSlotTimeRange('   ')).toEqual({ startTime: '', endTime: '' })
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

describe('toLocalHm（#1076：毫秒时间戳 → 本地 HH:mm）', () => {
  it('毫秒时间戳按本地时区转换为 HH:mm（数字与纯数字字符串两种形态）', () => {
    const ms = new Date(2026, 6, 11, 9, 30).getTime() // 2026-07-11 09:30 本地
    expect(toLocalHm(ms)).toBe('09:30')
    expect(toLocalHm(String(ms))).toBe('09:30')
  })

  it('保留既有字符串时分行为（向后兼容）', () => {
    expect(toLocalHm('08:00')).toBe('08:00')
    expect(toLocalHm('8:05')).toBe('08:05')
    expect(toLocalHm('08:00:00')).toBe('08:00')
    expect(toLocalHm('2026-10-16 08:00:00')).toBe('08:00')
  })

  it('无法识别 / 空值返回空串，不猜测', () => {
    expect(toLocalHm('')).toBe('')
    expect(toLocalHm(null)).toBe('')
    expect(toLocalHm(undefined)).toBe('')
    expect(toLocalHm('时间待定')).toBe('')
    expect(toLocalHm(0)).toBe('')
    // 秒级时间戳无法与其它数字区分，不按毫秒解释
    expect(toLocalHm(1783760400)).toBe('')
  })
})

describe('normalizeMyReservation（#1076：按 reservepc/user/histroy 实测字段映射）', () => {
  // 与实测样本同形（见 data/library-reserve-recon/02-live-verification-2026-10-16.md §4.2）
  const ROW = {
    id: 29589158,
    itemId: 49136,
    name: '4号静音仓',
    today: '2026-07-11',
    starttime: new Date(2026, 6, 11, 9, 0).getTime(),
    endtime: new Date(2026, 6, 11, 11, 0).getTime(),
    status: 2,
    isCancel: 0,
    aprvId: 0
  }

  it('真实字段：名称 / 日期 / 毫秒起止时间正确渲染', () => {
    const item = normalizeMyReservation(ROW, 'quiet_room', 0)
    expect(item.name).toBe('4号静音仓')
    expect(item.date).toBe('2026-07-11')
    expect(item.start).toBe('09:00')
    expect(item.end).toBe('11:00')
    expect(item.status).toBe(2)
    expect(item.cancelled).toBe(false)
    expect(item.statusKey).toBe('library.reserve.mine.statusFallback')
  })

  it('aprvId 恒为 0 时不作为取消 id，改取真实 id', () => {
    const item = normalizeMyReservation(ROW, 'quiet_room', 0)
    expect(item.recordId).toBe('29589158')
    expect(item.key).toBe('quiet_room-29589158-0')
  })

  it('isCancel=1 标记为已取消并使用取消文案', () => {
    const item = normalizeMyReservation({ ...ROW, isCancel: 1 }, 'quiet_room', 0)
    expect(item.cancelled).toBe(true)
    expect(item.statusKey).toBe('library.reserve.mine.statusCancelled')
  })

  it('兼容后端已归一化的 camelCase 形态与嵌套 raw 兜底', () => {
    // 后端可能已归一化为 camelCase 顶层，但 date/startTime 候选键不含真实字段，真实行挂在 raw
    const nested = normalizeMyReservation(
      { aprvId: 0, itemName: null, date: null, startTime: null, raw: ROW },
      'quiet_room',
      0
    )
    expect(nested.name).toBe('4号静音仓')
    expect(nested.date).toBe('2026-07-11')
    expect(nested.start).toBe('09:00')
    expect(nested.end).toBe('11:00')
    expect(nested.recordId).toBe('29589158')
  })

  it('缺失字段 / 空对象不抛错，回落空值', () => {
    const empty = normalizeMyReservation(null, 'seminar_room', 2)
    expect(empty.name).toBe('')
    expect(empty.date).toBe('')
    expect(empty.recordId).toBe('')
    expect(empty.start).toBe('')
    expect(empty.status).toBeNull()
    expect(empty.cancelled).toBe(false)
    expect(empty.key).toBe('seminar_room-row-2')
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
