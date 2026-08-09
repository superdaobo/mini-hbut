// 论坛纯文本格式化工具（无副作用，便于单元测试）
// 描述：空值转文本、头像首字、作者名、时间展示等纯函数。

/** 任意值转字符串（null/undefined 转空串） */
export const toText = (value: unknown): string => (value == null ? '' : String(value))

/** 头像首字：取前两个字符大写，空值回退 HB */
export const initials = (value: unknown): string => {
  const text = toText(value).trim()
  return text ? text.slice(0, 2).toUpperCase() : 'HB'
}

/** 作者显示名：本人显示昵称，其余显示学号，空值匿名 */
export const authorName = (studentId: unknown, currentStudentId = '', nickname = ''): string => {
  const text = toText(studentId).trim()
  if (!text) return '匿名同学'
  if (text === String(currentStudentId || '').trim()) return toText(nickname).trim() || text
  return text
}

/** 时间展示：无效输入原样返回，有效时间按中国时区格式化为 zh-CN 短格式 */
export const formatTime = (value: unknown): string => {
  if (!value) return ''
  const date = new Date(toText(value))
  if (Number.isNaN(date.getTime())) return String(value)
  // 产品语义：论坛时间一律按 Asia/Shanghai 展示，与运行环境本地时区无关，
  // 保证 Windows / Linux CI / macOS 渲染结果一致（#596 P0-2）。
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
