import { describe, expect, it } from 'vitest'
import { normalizeTeacherNames, resolveTeacherQuery } from './teacherQuery'

// #1321 教师姓名归一化：课程详情 → 给分记录 快捷入口的数据基础
describe('normalizeTeacherNames', () => {
  it('单教师：原样返回（trim 后）', () => {
    expect(normalizeTeacherNames('张三')).toEqual(['张三'])
    expect(normalizeTeacherNames('  李四  ')).toEqual(['李四'])
    expect(resolveTeacherQuery('张三')).toBe('张三')
  })

  it('多种分隔符：、 , ， ; ； / ／ 与空白', () => {
    expect(normalizeTeacherNames('张三、李四')).toEqual(['张三', '李四'])
    expect(normalizeTeacherNames('张三,李四，王五;赵六；钱七/孙八／吴九 郑十')).toEqual([
      '张三',
      '李四',
      '王五',
      '赵六',
      '钱七',
      '孙八',
      '吴九',
      '郑十',
    ].slice(0, 5))
  })

  it('括号职称：去掉中英文括号内容', () => {
    expect(normalizeTeacherNames('张三(副教授)')).toEqual(['张三'])
    expect(normalizeTeacherNames('张三（讲师）、李四 (助教)')).toEqual(['张三', '李四'])
  })

  it('尾部「等」：去掉后保留姓名', () => {
    expect(normalizeTeacherNames('张三、李四等')).toEqual(['张三', '李四'])
    expect(normalizeTeacherNames('张三等')).toEqual(['张三'])
  })

  it('空值与非字符串：返回空数组', () => {
    expect(normalizeTeacherNames('')).toEqual([])
    expect(normalizeTeacherNames('   ')).toEqual([])
    expect(normalizeTeacherNames(null)).toEqual([])
    expect(normalizeTeacherNames(undefined)).toEqual([])
    expect(normalizeTeacherNames(42)).toEqual([])
    expect(normalizeTeacherNames({})).toEqual([])
    expect(resolveTeacherQuery(null)).toBe('')
  })

  it('无效占位值（未填写 / — / - / 未知 / 未知教师）：视为无教师', () => {
    expect(normalizeTeacherNames('未填写')).toEqual([])
    expect(normalizeTeacherNames('—')).toEqual([])
    expect(normalizeTeacherNames('-')).toEqual([])
    expect(normalizeTeacherNames('未知')).toEqual([])
    expect(normalizeTeacherNames('未知教师')).toEqual([])
    expect(normalizeTeacherNames('张三、未填写')).toEqual(['张三'])
  })

  it('去重：保持原顺序', () => {
    expect(normalizeTeacherNames('张三、李四、张三、王五')).toEqual(['张三', '李四', '王五'])
  })

  it('超长段（>20 字符）丢弃，恰好 20 字符保留', () => {
    const tooLong = 'a'.repeat(21)
    expect(normalizeTeacherNames(`${tooLong}、张三`)).toEqual(['张三'])
    const exact = 'b'.repeat(20)
    expect(normalizeTeacherNames(exact)).toEqual([exact])
  })

  it('总条数上限 5：只保留前 5 个', () => {
    expect(normalizeTeacherNames('甲、乙、丙、丁、戊、己、庚')).toEqual(['甲', '乙', '丙', '丁', '戊'])
  })
})
