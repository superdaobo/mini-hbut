'use client';

import type { ComponentType } from 'react';
import type { AppScreen } from '@/lib/scroll-utils';
import AppShell, { AppCard, PageHeader } from './AppShell';
import { APP_MODULES, MODULE_CATEGORIES, QUICK_ENTRY_IDS, modulesByCategory } from './app-modules';
import {
  DEMO_CLASSROOMS,
  DEMO_ELECTRICITY,
  DEMO_EXAMS,
  DEMO_GRADES,
  DEMO_NOTIFICATIONS,
  DEMO_RANKING,
  DEMO_SCHEDULE_BLOCKS,
  DEMO_STUDENT,
  DEMO_TODAY_COURSES,
} from './demo-data';
import { Bell, CloudSun, GraduationCap, Search, User } from 'lucide-react';

function HomeScreen() {
  const quickEntries = APP_MODULES.filter((m) => QUICK_ENTRY_IDS.includes(m.id));
  const homeModules = APP_MODULES.slice(0, 7);

  return (
    <AppShell screen="home">
      <div className="h-full overflow-y-auto px-3 pb-2 pt-2">
        <header className="mb-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100">
            <GraduationCap className="h-4 w-4 text-blue-500" />
          </div>
          <span className="text-sm font-bold text-gray-800">HBUT 校园助手</span>
          <div className="relative ml-auto flex-1 max-w-[140px]">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
            <div className="rounded-full bg-white py-1 pl-7 pr-2 text-[10px] text-gray-400 shadow-sm">搜索服务/课程</div>
          </div>
        </header>

        <div className="mb-3 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">上午好</h1>
            <p className="text-[10px] text-gray-500">新的一天，元气满满！</p>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-700">
            <CloudSun className="h-4 w-4 text-amber-500" />
            <span className="font-semibold">18°C</span>
          </div>
        </div>

        <AppCard className="mb-3 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-blue-500">
            <User className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold">{DEMO_STUDENT.id}</span>
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[8px] text-gray-500">本科生</span>
            </div>
            <p className="text-[9px] text-gray-500">{DEMO_STUDENT.college}</p>
          </div>
        </AppCard>

        <AppCard className="mb-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">今日安排</h3>
            <span className="text-[10px] text-blue-500">查看全部 ›</span>
          </div>
          {DEMO_TODAY_COURSES.map((course) => (
            <div key={course.name} className={`mb-2 flex gap-2 ${course.status === 'current' ? '' : 'opacity-60'}`}>
              <div className="w-10 shrink-0 text-[10px] font-medium text-gray-700">{course.start}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-gray-800">{course.name}</p>
                <p className="text-[9px] text-gray-500">{course.room}</p>
              </div>
              {course.status === 'current' && (
                <span className="shrink-0 rounded-full bg-blue-500 px-2 py-0.5 text-[8px] text-white">进行中</span>
              )}
            </div>
          ))}
        </AppCard>

        <AppCard className="mb-3">
          <h3 className="mb-2 text-sm font-bold text-gray-800">快捷入口</h3>
          <div className="grid grid-cols-3 gap-2">
            {quickEntries.map((item) => (
              <div key={item.id} className="flex flex-col items-center">
                <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-[12px] text-white" style={{ backgroundColor: item.color }}>
                  <item.icon className="h-4 w-4" />
                </div>
                <span className="text-[9px] text-gray-600">{item.name}</span>
              </div>
            ))}
          </div>
        </AppCard>

        <AppCard>
          <h3 className="mb-2 text-sm font-bold text-gray-800">所有功能</h3>
          <div className="grid grid-cols-4 gap-y-3">
            {homeModules.map((mod) => (
              <div key={mod.id} className="flex flex-col items-center">
                <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-2xl text-white shadow-sm" style={{ backgroundColor: mod.color }}>
                  <mod.icon className="h-4 w-4" />
                </div>
                <span className="text-center text-[8px] text-gray-700">{mod.name}</span>
              </div>
            ))}
            <div className="flex flex-col items-center">
              <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-2xl bg-gray-400 text-white">+</div>
              <span className="text-[8px] text-gray-700">更多</span>
            </div>
          </div>
        </AppCard>
      </div>
    </AppShell>
  );
}

function ScheduleScreen() {
  const days = ['一', '二', '三', '四', '五'];
  const periods = [1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <AppShell screen="schedule">
      <PageHeader title="我的课表" />
      <div className="flex h-[calc(100%-44px)] flex-col overflow-hidden p-2">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-xs font-bold text-gray-800">2025-2026 第 1 学期</span>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[9px] font-medium text-indigo-600">第 14 周</span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-100 bg-white">
          <div className="grid grid-cols-6 border-b border-gray-100 bg-gray-50 text-center text-[8px] text-gray-500">
            <div className="py-1" />
            {days.map((d) => <div key={d} className="py-1 font-medium">周{d}</div>)}
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(100% - 20px)' }}>
            {periods.map((period) => (
              <div key={period} className="grid grid-cols-6 border-b border-gray-50">
                <div className="flex items-center justify-center py-2 text-[8px] text-gray-400">{period}</div>
                {days.map((_, dayIdx) => {
                  const block = DEMO_SCHEDULE_BLOCKS.find((b) => b.day === dayIdx + 1 && b.period === period);
                  return (
                    <div key={`${period}-${dayIdx}`} className="min-h-[28px] border-l border-gray-50 p-0.5">
                      {block && (
                        <div className="rounded-md p-1 text-[7px] leading-tight text-white" style={{ backgroundColor: block.color }}>
                          <div className="font-medium">{block.name}</div>
                          <div className="opacity-80">{block.room}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function GradesScreen() {
  return (
    <AppShell screen="grades" showNav={false}>
      <PageHeader title="成绩查询" icon={<GraduationCap className="h-4 w-4 text-indigo-500" />} />
      <div className="overflow-y-auto p-3">
        <AppCard className="mb-3 bg-gradient-to-r from-indigo-500 to-violet-500 text-white">
          <p className="text-[10px] opacity-80">本学期绩点</p>
          <p className="text-2xl font-bold">{DEMO_STUDENT.gpa}</p>
          <p className="text-[9px] opacity-70">已修学分 {DEMO_STUDENT.credits}</p>
        </AppCard>
        {DEMO_GRADES.map((g) => (
          <div key={g.name} className="mb-2 flex items-center justify-between rounded-xl bg-white p-3 shadow-sm">
            <div>
              <p className="text-xs font-medium text-gray-800">{g.name}</p>
              <p className="text-[9px] text-gray-500">{g.teacher} · {g.term}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-indigo-600">{g.score}</p>
              <p className="text-[9px] text-gray-400">绩点 {g.point}</p>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function ExamsScreen() {
  return (
    <AppShell screen="exams" showNav={false}>
      <PageHeader title="考试安排" />
      <div className="space-y-2 overflow-y-auto p-3">
        {DEMO_EXAMS.map((exam) => (
          <AppCard key={exam.name}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-gray-800">{exam.name}</p>
                <p className="mt-1 text-[9px] text-gray-500">{exam.date} · {exam.time}</p>
                <p className="text-[9px] text-gray-500">{exam.room}</p>
              </div>
              <div className="rounded-xl bg-rose-50 px-2 py-1 text-center">
                <p className="text-lg font-bold text-rose-500">{exam.daysLeft}</p>
                <p className="text-[8px] text-rose-400">天</p>
              </div>
            </div>
          </AppCard>
        ))}
      </div>
    </AppShell>
  );
}

function NotificationsScreen() {
  return (
    <AppShell screen="notifications">
      <PageHeader title="通知中心" icon={<Bell className="h-4 w-4 text-indigo-500" />} />
      <div className="space-y-2 overflow-y-auto p-3">
        {DEMO_NOTIFICATIONS.map((n) => (
          <AppCard key={n.title} className="flex gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: n.color }}>
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-800">{n.title}</p>
              <p className="text-[9px] text-gray-500">{n.body}</p>
            </div>
          </AppCard>
        ))}
      </div>
    </AppShell>
  );
}

function ElectricityScreen() {
  const e = DEMO_ELECTRICITY;
  return (
    <AppShell screen="electricity" showNav={false}>
      <PageHeader title="电费查询" />
      <div className="p-3">
        <AppCard className="bg-gradient-to-br from-red-500 to-orange-500 text-white">
          <p className="text-[10px] opacity-80">{e.building} · {e.room}</p>
          <p className="mt-2 text-3xl font-bold">¥{e.balance}</p>
          <p className="text-[9px] opacity-70">剩余余额 · 更新于 {e.updatedAt}</p>
          <div className="mt-3 flex justify-between text-[9px] opacity-80">
            <span>今日用电 {e.usage} 度</span>
            <span>低电量提醒已开启</span>
          </div>
        </AppCard>
      </div>
    </AppShell>
  );
}

function ClassroomScreen() {
  return (
    <AppShell screen="classroom" showNav={false}>
      <PageHeader title="空教室查询" />
      <div className="space-y-2 p-3">
        {DEMO_CLASSROOMS.map((c) => (
          <AppCard key={c.room} className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-gray-800">{c.building} {c.room}</p>
              <p className="text-[9px] text-gray-500">座位 {c.seats}</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[9px] ${c.free ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
              {c.free ? '空闲' : '使用中'}
            </span>
          </AppCard>
        ))}
      </div>
    </AppShell>
  );
}

function RankingScreen() {
  const r = DEMO_RANKING;
  return (
    <AppShell screen="ranking" showNav={false}>
      <PageHeader title="绩点排名" />
      <div className="p-3">
        <AppCard className="text-center">
          <p className="text-[10px] text-gray-500">专业排名</p>
          <p className="text-3xl font-bold text-amber-500">{r.rank}<span className="text-lg text-gray-400">/{r.total}</span></p>
          <div className="mt-3 flex justify-around border-t border-gray-100 pt-3">
            <div><p className="text-[9px] text-gray-400">我的绩点</p><p className="font-bold text-indigo-600">{r.gpa}</p></div>
            <div><p className="text-[9px] text-gray-400">专业平均</p><p className="font-bold text-gray-600">{r.avg}</p></div>
          </div>
        </AppCard>
      </div>
    </AppShell>
  );
}

function AllFeaturesScreen() {
  return (
    <AppShell screen="all-features" showNav={false}>
      <PageHeader title="所有功能" />
      <div className="overflow-y-auto p-3">
        {MODULE_CATEGORIES.map((cat) => (
          <div key={cat} className="mb-4">
            <h3 className="mb-2 text-xs font-bold text-gray-500">{cat}</h3>
            <div className="grid grid-cols-4 gap-y-3">
              {modulesByCategory(cat).map((mod) => (
                <div key={mod.id} className="flex flex-col items-center">
                  <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-2xl text-white shadow-sm" style={{ backgroundColor: mod.color }}>
                    <mod.icon className="h-4 w-4" />
                  </div>
                  <span className="text-center text-[8px] leading-tight text-gray-700">{mod.name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function MeScreen() {
  return (
    <AppShell screen="me">
      <div className="overflow-y-auto p-3">
        <AppCard className="mb-3 flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-500">
            <User className="h-7 w-7" />
          </div>
          <div>
            <p className="text-sm font-bold">{DEMO_STUDENT.id}</p>
            <p className="text-[9px] text-gray-500">{DEMO_STUDENT.college}</p>
          </div>
        </AppCard>
        {['设置中心', '云同步', '导出数据', '关于 Mini-HBUT'].map((item) => (
          <div key={item} className="mb-2 rounded-xl bg-white px-3 py-2.5 text-xs text-gray-700 shadow-sm">{item}</div>
        ))}
      </div>
    </AppShell>
  );
}

const SCREEN_MAP: Record<AppScreen, ComponentType> = {
  home: HomeScreen,
  schedule: ScheduleScreen,
  grades: GradesScreen,
  exams: ExamsScreen,
  notifications: NotificationsScreen,
  electricity: ElectricityScreen,
  classroom: ClassroomScreen,
  ranking: RankingScreen,
  'all-features': AllFeaturesScreen,
  me: MeScreen,
};

export default function PhoneAppScreen({ screen }: { screen: AppScreen }) {
  const Screen = SCREEN_MAP[screen] ?? HomeScreen;
  return <Screen />;
}
