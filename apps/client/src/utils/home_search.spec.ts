import { describe, expect, it } from 'vitest'
import { buildHomeSearchSections, buildWeeklyCourseSearchEntries } from './home_search'

const modules = [
  {
    id: 'grades',
    name: '成绩查询',
    desc: '查看所有学期成绩',
    aliases: ['分数', '绩点']
  },
  {
    id: 'electricity',
    name: '电费查询',
    desc: '宿舍电费余额',
    aliases: ['宿舍电费', '余额']
  }
]

describe('home search service', () => {
  it('ranks exact service name matches before fuzzy aliases', () => {
    const sections = buildHomeSearchSections({
      query: '电费',
      modules
    })

    expect(sections[0].title).toBe('服务')
    expect(sections[0].items[0]).toMatchObject({
      type: 'service',
      id: 'electricity',
      title: '电费查询'
    })
  })

  it('returns course matches as schedule results', () => {
    const sections = buildHomeSearchSections({
      query: '高数',
      modules,
      courses: [
        {
          key: 'course-1',
          name: '高等数学',
          room: '教一 101',
          start: '08:20',
          end: '09:55'
        }
      ]
    })

    const courseSection = sections.find((section) => section.title === '课程')
    expect(courseSection?.items[0]).toMatchObject({
      type: 'course',
      id: 'course-1',
      title: '高等数学',
      target: 'schedule'
    })
  })

  it('builds current week course search entries across all weekdays and merges adjacent duplicates', () => {
    const entries = buildWeeklyCourseSearchEntries({
      currentWeek: 8,
      periodTimeMap: {
        1: { start: '08:20', end: '09:05' },
        2: { start: '09:10', end: '09:55' },
        3: { start: '10:15', end: '11:00' }
      },
      courses: [
        {
          name: '高等数学',
          room: '教一 101',
          teacher: '张老师',
          weekday: 1,
          period: 1,
          djs: 1,
          weeks: [8]
        },
        {
          name: '高等数学',
          room: '教一 101',
          teacher: '张老师',
          weekday: 1,
          period: 2,
          djs: 1,
          weeks: [8]
        },
        {
          name: '高等数学',
          room: '教二 201',
          teacher: '张老师',
          weekday: 5,
          period: 3,
          djs: 1,
          weeks: [8]
        },
        {
          name: '大学英语',
          room: '教三 301',
          teacher: '李老师',
          weekday: 2,
          period: 1,
          djs: 1,
          weeks: [9]
        }
      ]
    })

    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      name: '高等数学',
      weekday: 1,
      weekdayLabel: '周一',
      room: '教一 101',
      start: '08:20',
      end: '09:55'
    })
    expect(entries[1]).toMatchObject({
      name: '高等数学',
      weekday: 5,
      weekdayLabel: '周五',
      room: '教二 201',
      start: '10:15',
      end: '11:00'
    })
  })

  it('deduplicates course search results with stable course keys', () => {
    const sections = buildHomeSearchSections({
      query: '高数',
      modules,
      courses: [
        {
          key: 'remote-1',
          dedupeKey: 'week8:math:monday:1-2:room101',
          name: '高等数学',
          room: '教一 101',
          teacher: '张老师',
          weekdayLabel: '周一',
          start: '08:20',
          end: '09:55'
        },
        {
          key: 'custom-1',
          dedupeKey: 'week8:math:monday:1-2:room101',
          name: '高等数学',
          room: '教一 101',
          teacher: '张老师',
          weekdayLabel: '周一',
          start: '08:20',
          end: '09:55'
        }
      ]
    })

    const courseSection = sections.find((section) => section.title === '课程')
    expect(courseSection?.items).toHaveLength(1)
    expect(courseSection?.items[0]).toMatchObject({
      type: 'course',
      title: '高等数学',
      subtitle: '周一 · 08:20 - 09:55 · 教一 101 · 张老师'
    })
  })

  it('searches notices by title and summary', () => {
    const sections = buildHomeSearchSections({
      query: '讲座',
      modules,
      notices: [
        {
          id: 'notice-1',
          title: '图书馆讲座安排',
          summary: '本周三开放报名'
        }
      ]
    })

    const noticeSection = sections.find((section) => section.title === '资讯')
    expect(noticeSection?.items[0]).toMatchObject({
      type: 'notice',
      id: 'notice-1',
      title: '图书馆讲座安排'
    })
  })
})
