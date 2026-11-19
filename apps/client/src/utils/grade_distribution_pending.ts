/**
 * #1321 一次性「教师预填」存储（纯内存，不写 localStorage）。
 *
 * 课表课程详情 → 给分记录 导航时，NavigationCoordinator 先把教师名
 * 写在这里；GradeDistributionView 挂载时消费它，预填搜索框并立即
 * 发起查询。
 *
 * 语义：
 * - 写入做 trim，空值 / 超长（>20）直接拒绝
 * - TTL 保护：超过 PENDING_TTL_MS 的预填视为过期（用户可能早已离开
 *   该导航链），消费时返回空
 * - 一次性：消费即清空
 */

/** 预填有效期（毫秒）。 */
export const PENDING_TTL_MS = 30000

/** 预填姓名长度上限（与教师归一化层一致）。 */
const MAX_PENDING_LENGTH = 20

interface PendingEntry {
  name: string
  writtenAt: number
}

let pending: PendingEntry | null = null

/** 是否仍在有效期内。 */
const isFresh = (entry: PendingEntry): boolean =>
  Date.now() - entry.writtenAt <= PENDING_TTL_MS

/**
 * 写入一次性预填：先 trim；空值或超长（>20）拒绝写入。
 */
export const writePendingGradeTeacher = (name: string): void => {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!trimmed || trimmed.length > MAX_PENDING_LENGTH) return
  pending = { name: trimmed, writtenAt: Date.now() }
}

/**
 * 窥视当前有效预填（不消费）：有效返回姓名，过期 / 为空返回 ''
 * （过期即顺手清空）。
 */
export const peekPendingGradeTeacher = (): string => {
  if (!pending) return ''
  if (!isFresh(pending)) {
    pending = null
    return ''
  }
  return pending.name
}

/**
 * 消费一次性预填：有效则返回姓名并立即清空；
 * 过期或为空时返回 ''（同样清空）。
 */
export const consumePendingGradeTeacher = (): string => {
  const name = peekPendingGradeTeacher()
  pending = null
  return name
}
