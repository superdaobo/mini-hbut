import { timeSchedule as defaultTimeSchedule } from '../constants'
import { formatMinuteToClock } from './formatters'
import { parseClockToMinute } from './timeGeometry'

export interface BlankTimeSelection {
  dayIndex: number
  date: string
  startPeriod: number
  endPeriod: number
  span: number
  startMinute: number
  endMinute: number
  startTime: string
  endTime: string
}

type TimeSlot = {
  p: number
  start: string
  end: string
}

const normalizeSlots = (slots: TimeSlot[] = defaultTimeSchedule): Array<TimeSlot & {
  startMinute: number
  endMinute: number
}> =>
  (Array.isArray(slots) ? slots : [])
    .map((slot) => {
      const startMinute = parseClockToMinute(slot?.start)
      const endMinute = parseClockToMinute(slot?.end)
      if (
        !Number.isFinite(slot?.p) ||
        startMinute === null ||
        endMinute === null ||
        endMinute <= startMinute
      ) {
        return null
      }
      return {
        ...slot,
        p: Number(slot.p),
        startMinute,
        endMinute
      }
    })
    .filter((slot): slot is TimeSlot & { startMinute: number; endMinute: number } => !!slot)
    .sort((a, b) => a.p - b.p)

/**
 * 把点击得到的近似分钟映射到课节。
 *
 * 若点击落在课间/午休，则归到下一节：这样 2→3 的课间会选中 3–4，
 * 午休会选中 5–6，而不是回到已经结束的上一组。
 */
export const resolveClickedPeriod = (
  approximateMinute: number,
  slots: TimeSlot[] = defaultTimeSchedule
): number | null => {
  const minute = Number(approximateMinute)
  const normalized = normalizeSlots(slots)
  if (!Number.isFinite(minute) || normalized.length === 0) return null
  if (minute <= normalized[0].startMinute) return normalized[0].p

  for (let index = 0; index < normalized.length; index += 1) {
    const slot = normalized[index]
    if (minute <= slot.endMinute) return slot.p
    const next = normalized[index + 1]
    if (next && minute < next.startMinute) return next.p
  }

  return normalized[normalized.length - 1].p
}

/**
 * 常见双节课吸附：
 * 1–2 / 3–4 / 5–6 / 7–8 / 9–10；第 11 节单独一节。
 */
export const resolveCourseBlock = (
  period: number,
  slots: TimeSlot[] = defaultTimeSchedule
): { startPeriod: number; endPeriod: number; span: number } | null => {
  const normalized = normalizeSlots(slots)
  if (normalized.length === 0) return null
  const validPeriods = new Set(normalized.map((slot) => slot.p))
  const p = Number(period)
  if (!validPeriods.has(p)) return null

  if (p >= 11 || !validPeriods.has(p % 2 === 0 ? p - 1 : p + 1)) {
    return { startPeriod: p, endPeriod: p, span: 1 }
  }

  const startPeriod = p % 2 === 0 ? p - 1 : p
  const endPeriod = startPeriod + 1
  if (!validPeriods.has(startPeriod) || !validPeriods.has(endPeriod)) {
    return { startPeriod: p, endPeriod: p, span: 1 }
  }
  return { startPeriod, endPeriod, span: 2 }
}

export const buildBlankTimeSelection = (
  approximateMinute: number,
  dayIndex: number,
  date: string,
  slots: TimeSlot[] = defaultTimeSchedule
): BlankTimeSelection | null => {
  const normalized = normalizeSlots(slots)
  const period = resolveClickedPeriod(approximateMinute, slots)
  const block = period === null ? null : resolveCourseBlock(period, slots)
  if (!block) return null

  const startSlot = normalized.find((slot) => slot.p === block.startPeriod)
  const endSlot = normalized.find((slot) => slot.p === block.endPeriod)
  if (!startSlot || !endSlot) return null

  const day = Number(dayIndex)
  if (!Number.isInteger(day) || day < 1 || day > 7) return null

  return {
    dayIndex: day,
    date: String(date || ''),
    startPeriod: block.startPeriod,
    endPeriod: block.endPeriod,
    span: block.span,
    startMinute: startSlot.startMinute,
    endMinute: endSlot.endMinute,
    startTime: formatMinuteToClock(startSlot.startMinute),
    endTime: formatMinuteToClock(endSlot.endMinute)
  }
}

export const isSameBlankTimeSelection = (
  left: BlankTimeSelection | null | undefined,
  right: BlankTimeSelection | null | undefined
): boolean =>
  !!left &&
  !!right &&
  left.dayIndex === right.dayIndex &&
  left.date === right.date &&
  left.startPeriod === right.startPeriod &&
  left.endPeriod === right.endPeriod
