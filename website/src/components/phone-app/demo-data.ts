export const DEMO_STUDENT = {
  id: '2023123456',
  college: '计算机学院 · 软件工程',
  gpa: '3.72',
  credits: '86.5',
};

export const DEMO_TODAY_COURSES = [
  { name: '数据结构', room: '教学楼 A103', start: '10:30', end: '12:10', status: 'current' as const },
  { name: '操作系统', room: '教学楼 B205', start: '14:00', end: '15:40', status: 'upcoming' as const },
  { name: '大学英语', room: '外语楼 302', start: '16:00', end: '17:40', status: 'upcoming' as const },
];

export const DEMO_SCHEDULE_BLOCKS = [
  { day: 1, period: 3, name: '数据结构', room: 'A103', color: '#6366f1' },
  { day: 1, period: 5, name: '操作系统', room: 'B205', color: '#0ea5e9' },
  { day: 2, period: 2, name: '高等数学', room: 'C101', color: '#8b5cf6' },
  { day: 3, period: 4, name: '大学英语', room: '外语302', color: '#f59e0b' },
  { day: 4, period: 3, name: '计算机网络', room: 'A201', color: '#10b981' },
  { day: 5, period: 1, name: '体育', room: '体育馆', color: '#ef4444' },
];

export const DEMO_GRADES = [
  { name: '数据结构', score: '92', point: '4.5', teacher: '张老师', term: '2025-2026-1' },
  { name: '操作系统', score: '88', point: '4.0', teacher: '李老师', term: '2025-2026-1' },
  { name: '高等数学', score: '85', point: '3.7', teacher: '王老师', term: '2025-2026-1' },
  { name: '大学英语', score: '90', point: '4.2', teacher: '赵老师', term: '2024-2025-2' },
  { name: '计算机网络', score: '87', point: '3.9', teacher: '陈老师', term: '2024-2025-2' },
];

export const DEMO_EXAMS = [
  { name: '数据结构', date: '2026-01-08', time: '09:00-11:00', room: '教学楼 A103', daysLeft: 12 },
  { name: '操作系统', date: '2026-01-10', time: '14:00-16:00', room: '教学楼 B205', daysLeft: 14 },
  { name: '大学英语', date: '2026-01-12', time: '09:00-11:00', room: '外语楼 302', daysLeft: 16 },
];

export const DEMO_NOTIFICATIONS = [
  { title: '课程提醒', body: '10:30 数据结构 · 教学楼 A103', type: 'class', color: '#3b82f6' },
  { title: '电费预警', body: '宿舍余额不足 10 元，请及时充值', type: 'electricity', color: '#ef4444' },
  { title: '成绩更新', body: '操作系统成绩已发布，点击查看', type: 'grades', color: '#8b5cf6' },
  { title: '考试安排', body: '期末考试时间已更新', type: 'exams', color: '#14b8a6' },
  { title: '学校消息', body: '教务处：选课通知已发布', type: 'inbox', color: '#6366f1' },
];

export const DEMO_ELECTRICITY = {
  building: '东苑 12栋',
  room: '312',
  balance: '23.60',
  usage: '1.82',
  updatedAt: '2 分钟前',
};

export const DEMO_CLASSROOMS = [
  { room: 'A103', building: '教学楼 A', seats: 120, free: true },
  { room: 'B205', building: '教学楼 B', seats: 80, free: true },
  { room: 'C101', building: '教学楼 C', seats: 60, free: false },
];

export const DEMO_RANKING = {
  rank: 8,
  total: 156,
  gpa: '3.72',
  avg: '3.21',
};
