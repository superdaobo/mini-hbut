import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bike,
  BookOpen,
  Bot,
  Calendar,
  CalendarCheck,
  ChartLine,
  DoorOpen,
  FolderOpen,
  GraduationCap,
  Library,
  Mail,
  Map,
  QrCode,
  Network,
  Table,
  ClipboardList,
  Wallet,
  Zap,
} from 'lucide-react';

export type AppModuleId =
  | 'grades'
  | 'classroom'
  | 'electricity'
  | 'transactions'
  | 'exams'
  | 'ranking'
  | 'campus_code'
  | 'calendar'
  | 'school_inbox'
  | 'academic'
  | 'qxzkb'
  | 'course_selection'
  | 'training'
  | 'library'
  | 'campus_map'
  | 'resource_share'
  | 'towergo'
  | 'ai';

export interface AppModule {
  id: AppModuleId;
  name: string;
  desc: string;
  color: string;
  icon: LucideIcon;
  category: '教务服务' | '一码通' | '资源';
  requiresLogin: boolean;
}

export const APP_MODULES: AppModule[] = [
  { id: 'grades', name: '成绩查询', desc: '查看所有学期成绩', color: '#667eea', icon: GraduationCap, category: '教务服务', requiresLogin: true },
  { id: 'classroom', name: '空教室', desc: '查询空闲教室', color: '#ed8936', icon: DoorOpen, category: '教务服务', requiresLogin: true },
  { id: 'exams', name: '考试安排', desc: '查询考试时间地点', color: '#38b2ac', icon: CalendarCheck, category: '教务服务', requiresLogin: true },
  { id: 'ranking', name: '绩点排名', desc: '专业班级排名', color: '#f6ad55', icon: BarChart3, category: '教务服务', requiresLogin: true },
  { id: 'academic', name: '学业情况', desc: '学业完成度与课程进度', color: '#10b981', icon: ChartLine, category: '教务服务', requiresLogin: true },
  { id: 'qxzkb', name: '全校课表', desc: '查询全校课程与排课', color: '#6366f1', icon: Table, category: '教务服务', requiresLogin: true },
  { id: 'course_selection', name: '选课中心', desc: '通识选课与退课', color: '#f59e0b', icon: ClipboardList, category: '教务服务', requiresLogin: true },
  { id: 'training', name: '培养方案', desc: '培养方案与课程设置', color: '#0ea5e9', icon: Network, category: '教务服务', requiresLogin: true },
  { id: 'calendar', name: '校历', desc: '查看学期校历', color: '#3b82f6', icon: Calendar, category: '教务服务', requiresLogin: true },
  { id: 'school_inbox', name: '学校消息', desc: '教务与学习通消息', color: '#6366f1', icon: Mail, category: '教务服务', requiresLogin: true },
  { id: 'campus_code', name: '校园码', desc: '在线/高能模式二维码', color: '#0f766e', icon: QrCode, category: '一码通', requiresLogin: true },
  { id: 'electricity', name: '电费查询', desc: '宿舍电费余额', color: '#e53e3e', icon: Zap, category: '一码通', requiresLogin: true },
  { id: 'transactions', name: '交易记录', desc: '一码通消费记录', color: '#F56C6C', icon: Wallet, category: '一码通', requiresLogin: true },
  { id: 'library', name: '图书查询', desc: '馆藏检索与定位', color: '#0f766e', icon: Library, category: '资源', requiresLogin: false },
  { id: 'campus_map', name: '校园地图', desc: '校园地图查看', color: '#14b8a6', icon: Map, category: '资源', requiresLogin: false },
  { id: 'resource_share', name: '资料分享', desc: 'WebDAV 资料浏览与下载', color: '#0ea5e9', icon: FolderOpen, category: '资源', requiresLogin: false },
  { id: 'towergo', name: '小塔出行', desc: '校园电单车与骑行服务', color: '#22c55e', icon: Bike, category: '资源', requiresLogin: false },
  { id: 'ai', name: '校园助手', desc: 'AI 学习助手', color: '#94a3b8', icon: Bot, category: '资源', requiresLogin: true },
];

export const MODULE_CATEGORIES = ['教务服务', '一码通', '资源'] as const;

export function modulesByCategory(category: (typeof MODULE_CATEGORIES)[number]) {
  return APP_MODULES.filter((m) => m.category === category);
}

export const QUICK_ENTRY_IDS: AppModuleId[] = [
  'grades', 'exams', 'qxzkb', 'electricity', 'classroom', 'calendar',
];
