// Teacher Portal V2（E5 #1025）：教师错误归类与教学载荷解析契约测试。
//
// 覆盖 recon 04 §0.3 的四类错误形态在前端的归一化结果，
// 以及 `{ tasks, classes }` 载荷的解析（含注入身份字段过滤）。
// fixture 全部脱敏。

import { describe, expect, it } from 'vitest'

import {
  classifyTeacherErrorKind,
  teacherEmptyError,
  toTeacherDataError
} from '../api/teacherApi'
import {
  normalizeTeachingClass,
  normalizeTeachingData,
  normalizeTeachingTask
} from '../utils/normalizeTeacherData'

describe('E5：教师错误形态归类', () => {
  it('HTTP 401 / 无权限提示 → unauthorized', () => {
    expect(
      classifyTeacherErrorKind('没有访问当前接口的权限!Subject does not have permission [模块:子模块]')
    ).toBe('unauthorized')
    expect(classifyTeacherErrorKind('HTTP 401')).toBe('unauthorized')
  })

  it('会话过期 / 重定向登录页 → expired', () => {
    expect(classifyTeacherErrorKind('会话已过期，请重新登录')).toBe('expired')
    expect(classifyTeacherErrorKind('session expired')).toBe('expired')
  })

  it('HTTP 200 错误 HTML 页 → errorHtml', () => {
    expect(classifyTeacherErrorKind('报错啦')).toBe('errorHtml')
    expect(classifyTeacherErrorKind('错误原因：参数异常')).toBe('errorHtml')
  })

  it('超时 → timeout', () => {
    expect(classifyTeacherErrorKind('请求超时')).toBe('timeout')
    expect(classifyTeacherErrorKind('timed out')).toBe('timeout')
  })

  it('E0 stub 未实现 → notImplemented', () => {
    expect(classifyTeacherErrorKind('教师端功能未实现（E0 骨架）: 我的教学')).toBe('notImplemented')
  })

  it('ret!=0 的后端消息 → unknown（走通用失败提示，不臆造语义）', () => {
    expect(classifyTeacherErrorKind('教务接口返回 ret=-1 msg=参数传输异常')).toBe('unknown')
  })

  it('空消息 → unknown', () => {
    expect(classifyTeacherErrorKind('')).toBe('unknown')
  })

  it('toTeacherDataError 归一化非 Error 对象为可读 message', () => {
    expect(toTeacherDataError({ message: '会话已过期，请重新登录' }).kind).toBe('expired')
    expect(toTeacherDataError('请求超时').kind).toBe('timeout')
  })

  it('teacherEmptyError 的 kind 为 empty', () => {
    expect(teacherEmptyError().kind).toBe('empty')
  })
})

describe('E5：教学载荷解析', () => {
  it('normalizeTeachingData 解析 { tasks, classes } 且忽略注入身份字段', () => {
    const data = normalizeTeachingData({
      tasks: [
        {
          id: 't1',
          xnxq: '2026-2027-1',
          kcmc: '课程一',
          name: '课程一【理论】1001',
          jxbid: 'jx-1',
          bjrs: 49,
          xf: '1.5',
          currentUserId: 'SECRET',
          currentRoleId: 'js',
          new: true
        }
      ],
      classes: [
        {
          id: 'c1',
          kcmc: '课程一',
          kcbh: '20605010A',
          xnxq: '2026-2027-1',
          name: '课程一【理论】1001',
          jxbid: 'jx-1',
          bjrs: 49,
          xs: '24',
          kkyxmc: '示例学院',
          currentUserName: 'SECRET',
          new: false
        }
      ]
    })

    expect(data.tasks).toHaveLength(1)
    expect(data.classes).toHaveLength(1)
    expect(data.tasks[0]).toMatchObject({ kcmc: '课程一', jxbid: 'jx-1', bjrs: 49, xf: '1.5' })
    // 注入身份字段不得进入业务模型
    expect(Object.keys(data.tasks[0])).not.toContain('currentUserId')
    expect(Object.keys(data.classes[0])).not.toContain('currentUserName')
  })

  it('normalizeTeachingData 对缺失字段的响应返回空数组（不抛异常）', () => {
    expect(normalizeTeachingData(null)).toEqual({ tasks: [], classes: [] })
    expect(normalizeTeachingData({ tasks: 'oops' })).toEqual({ tasks: [], classes: [] })
  })

  it('normalizeTeachingTask 保留 6 条任务的稳定 id / jxbid', () => {
    const task = normalizeTeachingTask({
      id: 't1',
      jxbid: 'jx-1',
      kcmc: '课程一',
      name: '班一',
      bjrs: 49,
      xf: '1.5'
    })
    expect(task.id).toBe('t1')
    expect(task.jxbid).toBe('jx-1')
    expect(task.bjrs).toBe(49)
  })

  it('normalizeTeachingClass 类型混用（bjrs 数字 / xf、xs 字符串）分别处理', () => {
    const cls = normalizeTeachingClass({
      id: 'c1',
      jxbid: 'jx-1',
      kcmc: '课程一',
      kcbh: '20605010A',
      name: '班一',
      bjrs: 49,
      xf: '1.5',
      xs: '24'
    })
    expect(cls.bjrs).toBe(49)
    expect(cls.xf).toBe('1.5')
    expect(cls.xs).toBe('24')
  })
})
