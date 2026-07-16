import type { AppScreen } from '@/lib/scroll-utils';

/** 屏幕切换时的产品叙事字幕 */
export const SCREEN_CAPTIONS: Record<
  AppScreen,
  { label: string; title: string; blurb: string; accent: string }
> = {
  home: {
    label: '首页',
    title: '今日校园，一眼看懂',
    blurb: '课表、快捷入口与通知聚合在同一张主页',
    accent: '#38bdf8',
  },
  schedule: {
    label: '课表',
    title: '周视图课表',
    blurb: '学期周次、教室与冲突提醒，滚动就能看全周',
    accent: '#818cf8',
  },
  grades: {
    label: '成绩',
    title: '绩点与成绩明细',
    blurb: '学期绩点、课程成绩与趋势，本地缓存可离线看',
    accent: '#a78bfa',
  },
  exams: {
    label: '考试',
    title: '考试倒计时',
    blurb: '考场、时间轴与临近提醒，不怕漏考',
    accent: '#f472b6',
  },
  notifications: {
    label: '通知',
    title: '校园通知聚合',
    blurb: '教务与校园消息统一收件箱',
    accent: '#34d399',
  },
  electricity: {
    label: '电费',
    title: '宿舍电费查询',
    blurb: '余额与用电趋势，一码通相关能力就地完成',
    accent: '#fbbf24',
  },
  classroom: {
    label: '空教室',
    title: '空教室速查',
    blurb: '按楼栋/节次过滤，自习不用到处撞门',
    accent: '#fb923c',
  },
  ranking: {
    label: '排名',
    title: '绩点排名',
    blurb: '班级/专业维度对比（以教务数据为准）',
    accent: '#60a5fa',
  },
  'all-features': {
    label: '功能全景',
    title: '更多校园能力',
    blurb: '选课、校历、图书馆、模块中心与设置一站到达',
    accent: '#22d3ee',
  },
  me: {
    label: '我的',
    title: '个人中心',
    blurb: '账号、主题与数据管理',
    accent: '#94a3b8',
  },
};
