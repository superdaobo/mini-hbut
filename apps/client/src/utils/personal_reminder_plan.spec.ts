/**
 * 个人日程提醒计划（#839）单测
 *
 * 覆盖：档位语义、触发时间解析、不补发历史、窗口过滤、event id 稳定标识、
 * 确定性、隐私（note 不进正文）、脏数据安全跳过、纯函数无副作用。
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  PERSONAL_REMINDER_LEAD_MINUTES,
  buildPersonalReminderPlan,
  resolvePersonalReminderTrigger,
  type PersonalReminderEvent
} from './personal_reminder_plan'
import { setLocalReminderPlatform, type LocalReminderPlatform } from './local_reminder_scheduler'

/** 本地时区构造时刻（与模块内 parseLocalDay 的「本地零点」语义一致） */
const at = (year: number, month: number, day: number, hour = 0, minute = 0): Date =>
  new Date(year, month - 1, day, hour, minute, 0, 0)

/** 锚点：2026-06-15 08:00（避开夏令时切换日，跨时区稳定） */
const NOW = at(2026, 6, 15, 8, 0).getTime()

const baseEvent = (patch: Partial<PersonalReminderEvent> = {}): PersonalReminderEvent => ({
  id: 'ev17500000000001234',
  title: '复习高数',
  date: '2026-06-16',
  startTime: '09:30',
  endTime: '11:00',
  location: '图书馆',
  reminderMinutes: 30,
  ...patch
})

const planOf = (
  events: unknown,
  options: Partial<{ studentId: string; nowMs: number; windowDays: number }> = {}
) =>
  buildPersonalReminderPlan(events as PersonalReminderEvent[], {
    studentId: '2021001',
    nowMs: NOW,
    ...options
  })

afterEach(() => {
  setLocalReminderPlatform(null)
})

describe('提醒档位语义', () => {
  it('V1 档位常量与 #836 表单一致（null / 0 / 5 / 10 / 30 / 60）', () => {
    expect(PERSONAL_REMINDER_LEAD_MINUTES).toEqual([null, 0, 5, 10, 30, 60])
  })

  it('reminderMinutes = null → 不产出', () => {
    expect(planOf([baseEvent({ reminderMinutes: null })])).toEqual([])
    expect(resolvePersonalReminderTrigger(baseEvent({ reminderMinutes: null }), NOW)).toBeNull()
  })

  it('reminderMinutes = 0 → 触发时间等于日程开始时间', () => {
    const resolved = resolvePersonalReminderTrigger(baseEvent({ reminderMinutes: 0 }), NOW)
    expect(resolved).toEqual({ atEpochMs: at(2026, 6, 16, 9, 30).getTime() })
  })

  it('reminderMinutes = 30 → 触发时间等于开始时间 − 30 分钟', () => {
    const resolved = resolvePersonalReminderTrigger(baseEvent({ reminderMinutes: 30 }), NOW)
    expect(resolved).toEqual({ atEpochMs: at(2026, 6, 16, 9, 0).getTime() })
  })

  it('六个档位逐一验证：null 不产出，其余按开始时间 − lead 产出', () => {
    const startMs = at(2026, 6, 16, 9, 30).getTime()
    for (const lead of PERSONAL_REMINDER_LEAD_MINUTES) {
      const specs = planOf([baseEvent({ reminderMinutes: lead })])
      if (lead === null) {
        expect(specs).toHaveLength(0)
        continue
      }
      expect(specs).toHaveLength(1)
      expect(specs[0].atEpochMs).toBe(startMs - lead * 60000)
      expect(specs[0].atEpochSecs).toBe(Math.floor((startMs - lead * 60000) / 1000))
    }
  })

  it('档位外的非负值仍按公式调度（后端契约只要求 reminder_minutes >= 0）', () => {
    const specs = planOf([baseEvent({ reminderMinutes: 15 })])
    expect(specs).toHaveLength(1)
    expect(specs[0].atEpochMs).toBe(at(2026, 6, 16, 9, 15).getTime())
  })

  it('负数 / 非数字档位 → 安全不产出', () => {
    expect(planOf([baseEvent({ reminderMinutes: -5 })])).toEqual([])
    expect(planOf([baseEvent({ reminderMinutes: Number.NaN })])).toEqual([])
    expect(planOf([baseEvent({ reminderMinutes: '30' as unknown as number })])).toEqual([])
  })
})

describe('不补发历史与窗口过滤', () => {
  it('触发时刻已在过去 → 不产出（不补发历史提醒）', () => {
    // 07:00 开始、提前 30 分钟 → 06:30 触发，早于 now(08:00)
    const past = baseEvent({ date: '2026-06-15', startTime: '07:00', endTime: '08:00', reminderMinutes: 30 })
    expect(resolvePersonalReminderTrigger(past, NOW)).toBeNull()
    expect(planOf([past])).toEqual([])
  })

  it('日程已开始但未结束 → 不补发', () => {
    // 07:30 开始、09:00 结束，now = 08:00 处于日程进行中
    const running = baseEvent({ date: '2026-06-15', startTime: '07:30', endTime: '09:00', reminderMinutes: 0 })
    expect(resolvePersonalReminderTrigger(running, NOW)).toBeNull()
    expect(planOf([running])).toEqual([])
  })

  it('超出 windowDays 窗口 → 不产出', () => {
    // 2026-07-06 距锚点 21 天，默认 14 天窗口外
    const far = baseEvent({ date: '2026-07-06', reminderMinutes: 0 })
    expect(planOf([far])).toEqual([])
    expect(planOf([far], { windowDays: 30 })).toHaveLength(1)
  })

  it('窗口内边界（14 天内）正常产出', () => {
    const near = baseEvent({ date: '2026-06-28', reminderMinutes: 0 })
    expect(planOf([near])).toHaveLength(1)
  })

  it('windowDays 非法（0 / 负数 / NaN）时回退默认 14 天', () => {
    const far = baseEvent({ date: '2026-07-06', reminderMinutes: 0 })
    for (const windowDays of [0, -3, Number.NaN]) {
      expect(planOf([far], { windowDays })).toEqual([])
    }
  })
})

describe('稳定标识（不依赖 title）', () => {
  it('同一 event id：标题 / 开始时间 / 地点变化后 reminder id 保持稳定，指纹随之变化', () => {
    const before = planOf([baseEvent()])[0]
    const after = planOf([
      baseEvent({ title: '复习线性代数', startTime: '10:00', location: '教学楼 A301' })
    ])[0]
    expect(after.id).toBe(before.id)
    // 内容变化 → 指纹变化 → diffReminders 识别为「旧取消 / 幂等替换 + 新建」
    expect(after.fingerprint).not.toBe(before.fingerprint)
  })

  it('不同 event id 产出不同 reminder id', () => {
    const a = planOf([baseEvent({ id: 'ev-1' })])[0]
    const b = planOf([baseEvent({ id: 'ev-2' })])[0]
    expect(a.id).not.toBe(b.id)
  })

  it('同一 event id 改日期 → 视为新 occurrence，id 变化', () => {
    const a = planOf([baseEvent({ date: '2026-06-16' })])[0]
    const b = planOf([baseEvent({ date: '2026-06-17' })])[0]
    expect(a.id).not.toBe(b.id)
  })

  it('不同学生产出不同 reminder id', () => {
    const a = planOf([baseEvent()], { studentId: '2021001' })[0]
    const b = planOf([baseEvent()], { studentId: '2021002' })[0]
    expect(a.id).not.toBe(b.id)
  })

  it('id 落在正 i32 范围内', () => {
    const spec = planOf([baseEvent()])[0]
    expect(Number.isInteger(spec.id)).toBe(true)
    expect(spec.id).toBeGreaterThan(0)
    expect(spec.id).toBeLessThanOrEqual(0x7fffffff)
    expect(spec.type).toBe('personal')
    expect(spec.targetView).toBe('schedule')
  })
})

describe('确定性与隐私', () => {
  it('同一输入重复调用 → 结果完全一致', () => {
    const events = [baseEvent(), baseEvent({ id: 'ev-2', date: '2026-06-20', reminderMinutes: 60 })]
    expect(planOf(events)).toEqual(planOf(events))
  })

  it('通知正文含 HH:mm + 标题 + 地点，且绝不含 note 内容', () => {
    const withNote = { ...baseEvent(), note: '隐私备注-不得外泄' } as PersonalReminderEvent
    const spec = planOf([withNote])[0]
    expect(spec.title).toBe('复习高数')
    expect(spec.body).toContain('09:30')
    expect(spec.body).toContain('复习高数')
    expect(spec.body).toContain('图书馆')
    expect(spec.body).not.toContain('隐私备注')
    // 序列化后（含日志/台账路径）同样不得出现 note 内容
    expect(JSON.stringify(spec)).not.toContain('隐私备注')
  })

  it('无地点时正文不含多余分隔符', () => {
    const spec = planOf([baseEvent({ location: '' })])[0]
    expect(spec.body).toBe('09:30 复习高数')
  })
})

describe('脏数据安全跳过（不抛异常）', () => {
  it('非法日期 → 不产出', () => {
    for (const date of ['2026-02-30', '2026/06/16', '2026-6-16', '', 'not-a-date']) {
      expect(() => planOf([baseEvent({ date })])).not.toThrow()
      expect(planOf([baseEvent({ date })])).toEqual([])
    }
  })

  it('非法开始时间 → 不产出', () => {
    for (const startTime of ['25:00', '9:5', '09:60', 'abc', '']) {
      expect(() => planOf([baseEvent({ startTime })])).not.toThrow()
      expect(planOf([baseEvent({ startTime })])).toEqual([])
    }
  })

  it('end <= start（含相等）→ 不产出', () => {
    expect(planOf([baseEvent({ startTime: '10:00', endTime: '09:00' })])).toEqual([])
    expect(planOf([baseEvent({ startTime: '10:00', endTime: '10:00' })])).toEqual([])
  })

  it('endTime 缺失或为空串时不做 end 校验，正常产出', () => {
    expect(planOf([baseEvent({ endTime: undefined })])).toHaveLength(1)
    expect(planOf([baseEvent({ endTime: '' })])).toHaveLength(1)
  })

  it('入参异常（非数组 / 缺 studentId / nowMs 非法 / 空 id 或标题）→ 安全返回空', () => {
    expect(planOf(null)).toEqual([])
    expect(planOf(undefined)).toEqual([])
    expect(planOf([baseEvent()], { studentId: '' })).toEqual([])
    expect(planOf([baseEvent()], { nowMs: Number.NaN })).toEqual([])
    expect(planOf([baseEvent({ id: '' })])).toEqual([])
    expect(planOf([baseEvent({ title: '   ' })])).toEqual([])
    expect(planOf([null as unknown as PersonalReminderEvent])).toEqual([])
  })
})

describe('纯函数无副作用（权限 / 调度失败不影响计划产出）', () => {
  it('平台未授权、调度必然失败时，计划产出完全一致且不调用平台', () => {
    let scheduleCalls = 0
    const deniedPlatform: LocalReminderPlatform = {
      async schedule() {
        scheduleCalls += 1
        return false
      },
      async pending() {
        return []
      },
      async cancel() {
        return false
      },
      async permission() {
        throw new Error('permission-denied')
      }
    }
    const events = [baseEvent(), baseEvent({ id: 'ev-2', date: '2026-06-20' })]
    const before = planOf(events)

    setLocalReminderPlatform(deniedPlatform)
    const after = planOf(events)

    expect(after).toEqual(before)
    expect(after).toHaveLength(2)
    expect(scheduleCalls).toBe(0)
  })
})
