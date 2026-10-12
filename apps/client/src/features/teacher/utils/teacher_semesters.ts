/**
 * 教师视图使用和学生端一致的学期选择器，避免让用户手输教务接口的学期编码。
 * 这里只生成筛选候选项，不推断学期查询是否有数据。
 */
export const teacherSemesterOptions = (selected: string, now: Date = new Date()): string[] => {
  const baseYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  const options = new Set<string>()
  for (let year = baseYear; year >= baseYear - 4; year -= 1) {
    options.add(`${year}-${year + 1}-1`)
    options.add(`${year}-${year + 1}-2`)
  }
  if (/^\d{4}-\d{4}-[12]$/.test(selected)) options.add(selected)
  return [...options].sort((a, b) => b.localeCompare(a))
}
