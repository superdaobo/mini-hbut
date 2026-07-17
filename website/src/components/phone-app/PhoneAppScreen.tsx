'use client';

import type { ComponentType } from 'react';
import type { AppScreen } from '@/lib/scroll-utils';
import AppShell, { AppCard, PageHeader } from './AppShell';
import './phone-app.css';
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
import { Bell, CloudSun, GraduationCap, MapPin, Search, User } from 'lucide-react';

/**
 * 首页视觉对齐 Tauri `Dashboard.vue`：
 * Header(Logo+搜索) → 问候/天气 → 用户卡 → 今日安排(高亮+时间线) → 快捷入口 5 列 → 所有功能 tabs
 */
function HomeScreen() {
  const quickEntries = QUICK_ENTRY_IDS.map((id) => APP_MODULES.find((m) => m.id === id)!).filter(Boolean);
  const academicMods = modulesByCategory('教务服务').slice(0, 8);
  const current = DEMO_TODAY_COURSES.find((c) => c.status === 'current') || DEMO_TODAY_COURSES[0];
  const upcoming = DEMO_TODAY_COURSES.filter((c) => c !== current);

  return (
    <AppShell screen="home">
      <div className="phone-dashboard">
        {/* Header — Dashboard: Mini-HBUT logo + 搜索 */}
        <header className="phone-dashboard-header">
          <div className="phone-dashboard-brand">
            <div className="phone-dashboard-logo">M</div>
            <span className="phone-dashboard-title">Mini-HBUT</span>
          </div>
          <div className="phone-dashboard-search">
            <Search className="phone-dashboard-search-icon" />
            搜索服务/课程/资讯
          </div>
        </header>

        <div className="phone-dashboard-body">
          {/* Greeting & weather */}
          <div className="phone-dashboard-greeting">
            <div>
              <h1>上午好</h1>
              <p>新的一天，元气满满！</p>
            </div>
            <div className="phone-dashboard-weather">
              <div className="flex items-center gap-1">
                <CloudSun className="h-3.5 w-3.5 text-amber-500" />
                <span>18°C</span>
              </div>
              <span className="text-[8px] font-normal text-gray-500">多云</span>
            </div>
          </div>

          {/* User profile card */}
          <div className="phone-card phone-card-shadow">
            <div className="phone-profile-row">
              <div className="phone-profile-avatar">
                <User className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center">
                  <span className="phone-profile-name">{DEMO_STUDENT.id}</span>
                  <span className="phone-profile-badge">本科生</span>
                </div>
                <p className="phone-profile-college">{DEMO_STUDENT.college}</p>
              </div>
              <span className="session-status-dot is-green" title="会话已连接" />
            </div>
          </div>

          {/* Today's schedule — 高亮进行中 + 后续课 */}
          <div className="phone-card phone-card-shadow">
            <div className="phone-section-head">
              <h3>今日安排</h3>
              <a>查看全部 ›</a>
            </div>

            {current && (
              <div className="phone-course-highlight mb-2.5">
                <div className="phone-course-highlight-deco" />
                <div className="flex w-5 shrink-0 flex-col items-center pt-0.5 relative z-10">
                  <div className="phone-course-dot" />
                </div>
                <div className="phone-course-time-col relative z-10">
                  <div>{current.start}</div>
                  <div className="text-[8px] font-medium opacity-80">~ {current.end || '11:10'}</div>
                </div>
                <div className="relative z-10 min-w-0 flex-1 pr-1">
                  <span className="mb-0.5 inline-block rounded bg-white/20 px-1.5 py-0.5 text-[8px]">
                    进行中
                  </span>
                  <p className="phone-course-highlight-title">{current.name}</p>
                  <p className="mt-0.5 flex items-center text-[8px] opacity-90">
                    <MapPin className="mr-0.5 h-2.5 w-2.5" /> {current.room}
                  </p>
                </div>
              </div>
            )}

            {upcoming.map((course) => (
              <div key={course.name} className="phone-course-upcoming">
                <div className="phone-course-upcoming-dot" />
                <div className="phone-course-time-col text-gray-700">
                  <div className="font-semibold">{course.start}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-gray-800">{course.name}</p>
                  <p className="text-[8px] text-gray-500">{course.room}</p>
                </div>
                <span className="shrink-0 text-[8px] text-gray-400">未开始</span>
              </div>
            ))}

            <div className="phone-today-stats">
              <div className="phone-today-stat">
                <div className="phone-today-stat-icon phone-today-stat-icon--blue">日</div>
                <div>
                  <p className="phone-today-stat-label">今日课程</p>
                  <p className="phone-today-stat-value">
                    {DEMO_TODAY_COURSES.length} <span className="text-[8px] font-normal">节</span>
                  </p>
                </div>
              </div>
              <div className="phone-today-stat-divider" />
              <div className="phone-today-stat">
                <div className="phone-today-stat-icon phone-today-stat-icon--teal">✓</div>
                <div>
                  <p className="phone-today-stat-label">已完成</p>
                  <p className="phone-today-stat-value">
                    33 <span className="text-[8px] font-normal">%</span>
                  </p>
                </div>
              </div>
              <div className="phone-today-stat-divider" />
              <div className="phone-today-stat">
                <div className="phone-today-stat-icon phone-today-stat-icon--orange">时</div>
                <div>
                  <p className="phone-today-stat-label">剩余</p>
                  <p className="phone-today-stat-value">
                    {upcoming.length + 1} <span className="text-[8px] font-normal">节</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick entry — Dashboard 5 列 */}
          <div className="phone-card phone-card-shadow">
            <div className="phone-section-head">
              <h3>快捷入口</h3>
            </div>
            <div className="phone-quick-grid phone-quick-grid--5">
              {quickEntries.slice(0, 5).map((item) => (
                <div key={item.id} className="phone-quick-item">
                  <div className="phone-quick-icon" style={{ backgroundColor: item.color }}>
                    <item.icon className="h-4 w-4" strokeWidth={2.2} />
                  </div>
                  <span className="phone-quick-label">{item.name.replace('查询', '').replace('安排', '')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* All features — tabs + 4 列网格 */}
          <div className="phone-card phone-card-shadow">
            <div className="phone-section-head mb-3">
              <h3>所有功能</h3>
              <div className="flex gap-2 text-[9px]">
                <span className="border-b-2 border-blue-500 pb-0.5 font-bold text-blue-500">教务服务</span>
                <span className="text-gray-400">一码通</span>
                <span className="text-gray-400">资源</span>
              </div>
            </div>
            <div className="phone-module-grid">
              {academicMods.map((mod) => (
                <div key={mod.id} className="phone-module-item">
                  <div className="phone-module-icon" style={{ backgroundColor: mod.color }}>
                    <mod.icon className="phone-module-svg" strokeWidth={2.2} />
                  </div>
                  <span className="phone-module-label">{mod.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ScheduleScreen() {
  const days = ['一', '二', '三', '四', '五', '六', '日'];
  const periods = [1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <AppShell screen="schedule">
      <div className="phone-schedule-root">
        <div className="phone-schedule-topbar">
          <div className="phone-schedule-menu-btn" aria-hidden>
            <span className="phone-schedule-menu-bar" />
            <span className="phone-schedule-menu-bar" />
            <span className="phone-schedule-menu-bar" />
          </div>
          <div className="phone-schedule-topbar-center">
            <div className="phone-schedule-topbar-title">我的课表</div>
            <div className="phone-schedule-topbar-sub">2025-2026 第 1 学期</div>
          </div>
          <div className="phone-schedule-week-pill">第 14 周</div>
        </div>
        <div className="phone-schedule-date-header">
          <div className="phone-schedule-month">
            <span className="phone-schedule-month-num">7</span>
            <span className="phone-schedule-month-label">月</span>
          </div>
          <div className="phone-schedule-days-row">
            {days.map((d, i) => (
              <div key={d} className={`phone-schedule-day-col ${i === 2 ? 'is-today' : ''}`}>
                <div className="phone-schedule-day-num">{14 + i}</div>
                <div className="phone-schedule-day-label">周{d}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="phone-schedule-grid-body">
          <div className="phone-schedule-time-axis">
            {periods.map((p) => (
              <div key={p} className="phone-schedule-time-slot">
                <span className="period-num">{p}</span>
              </div>
            ))}
          </div>
          <div className="phone-schedule-courses-grid" style={{ height: 160 }}>
            {[0, 1, 2, 3, 4].map((dayIdx) => (
              <div key={dayIdx} className={`phone-schedule-day-column ${dayIdx === 2 ? 'is-today' : ''}`}>
                {DEMO_SCHEDULE_BLOCKS.filter((b) => b.day === dayIdx + 1).map((block) => (
                  <div
                    key={`${block.day}-${block.period}-${block.name}`}
                    className="phone-schedule-course-card"
                    style={{
                      backgroundColor: block.color,
                      gridRow: `${block.period} / span 2`,
                    }}
                  >
                    <div className="phone-schedule-course-name">{block.name}</div>
                    <div className="phone-schedule-course-room">{block.room}</div>
                  </div>
                ))}
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
      <div className="phone-feature-body">
        <div className="phone-gradient-banner phone-gradient-indigo">
          <p className="phone-banner-label">本学期绩点</p>
          <p className="phone-banner-value">{DEMO_STUDENT.gpa}</p>
          <p className="phone-banner-sub">已修学分 {DEMO_STUDENT.credits}</p>
        </div>
        {DEMO_GRADES.map((g) => (
          <div key={g.name} className="phone-list-item">
            <div>
              <p className="phone-list-item-title">{g.name}</p>
              <p className="phone-list-item-sub">
                {g.teacher} · {g.term}
              </p>
            </div>
            <div className="phone-list-item-right">
              <p className="phone-list-item-value">{g.score}</p>
              <p className="phone-list-item-meta">绩点 {g.point}</p>
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
      <div className="phone-feature-body">
        {DEMO_EXAMS.map((exam) => (
          <div key={exam.name} className="phone-list-item">
            <div>
              <p className="phone-list-item-title">{exam.name}</p>
              <p className="phone-list-item-sub">
                {exam.date} · {exam.time}
              </p>
              <p className="phone-list-item-sub">{exam.room}</p>
            </div>
            <div className="phone-exam-countdown">
              <p className="phone-exam-days">{exam.daysLeft}</p>
              <p className="phone-exam-days-label">天</p>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function NotificationsScreen() {
  return (
    <AppShell screen="notifications">
      <PageHeader title="通知中心" icon={<Bell className="h-4 w-4 text-indigo-500" />} />
      <div className="phone-feature-body">
        {DEMO_NOTIFICATIONS.map((n) => (
          <div key={n.title} className="phone-notify-row">
            <div className="phone-notify-icon" style={{ backgroundColor: n.color }}>
              <Bell className="phone-notify-bell" />
            </div>
            <div>
              <p className="phone-list-item-title">{n.title}</p>
              <p className="phone-list-item-sub">{n.body}</p>
            </div>
          </div>
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
      <div className="phone-feature-body">
        <div className="phone-gradient-banner phone-gradient-rose">
          <p className="phone-banner-label">
            {e.building} · {e.room}
          </p>
          <p className="phone-banner-value phone-banner-value-lg">¥{e.balance}</p>
          <p className="phone-banner-sub">剩余余额 · 更新于 {e.updatedAt}</p>
          <div className="phone-banner-footer">
            <span>今日用电 {e.usage} 度</span>
            <span>低电量提醒已开启</span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ClassroomScreen() {
  return (
    <AppShell screen="classroom" showNav={false}>
      <PageHeader title="空教室查询" />
      <div className="phone-feature-body">
        {DEMO_CLASSROOMS.map((c) => (
          <div key={c.room} className="phone-list-item">
            <div>
              <p className="phone-list-item-title">
                {c.building} {c.room}
              </p>
              <p className="phone-list-item-sub">座位 {c.seats}</p>
            </div>
            <span className={`phone-status-pill ${c.free ? 'phone-status-pill--free' : 'phone-status-pill--busy'}`}>
              {c.free ? '空闲' : '使用中'}
            </span>
          </div>
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
      <div className="phone-feature-body">
        <div className="phone-card phone-ranking-card">
          <p className="phone-ranking-label">专业排名</p>
          <p className="phone-ranking-value">
            {r.rank}
            <span className="phone-ranking-total">/{r.total}</span>
          </p>
          <div className="phone-ranking-stats">
            <div>
              <p className="phone-ranking-stat-label">我的绩点</p>
              <p className="phone-ranking-stat-value phone-ranking-stat-value--primary">{r.gpa}</p>
            </div>
            <div>
              <p className="phone-ranking-stat-label">专业平均</p>
              <p className="phone-ranking-stat-value">{r.avg}</p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function AllFeaturesScreen() {
  return (
    <AppShell screen="all-features" showNav={false}>
      <PageHeader title="所有功能" />
      <div className="phone-feature-body">
        {MODULE_CATEGORIES.map((cat) => (
          <div key={cat} className="phone-feature-category">
            <h3 className="phone-feature-category-title">{cat}</h3>
            <div className="phone-module-grid">
              {modulesByCategory(cat).map((mod) => (
                <div key={mod.id} className="phone-module-item">
                  <div className="phone-module-icon" style={{ backgroundColor: mod.color }}>
                    <mod.icon className="phone-module-svg" />
                  </div>
                  <span className="phone-module-label">{mod.name}</span>
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
      <div className="phone-feature-body">
        <div className="phone-card phone-card-shadow">
          <div className="phone-profile-row">
            <div className="phone-profile-avatar" style={{ width: 52, height: 52 }}>
              <User className="h-6 w-6" />
            </div>
            <div>
              <p className="phone-profile-name">{DEMO_STUDENT.id}</p>
              <p className="phone-profile-college">{DEMO_STUDENT.college}</p>
            </div>
          </div>
        </div>
        {['设置中心', '云同步', '导出数据', '关于 Mini-HBUT'].map((item) => (
          <div key={item} className="phone-list-item">
            <span className="phone-list-item-title">{item}</span>
            <span className="text-gray-300">›</span>
          </div>
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

function ScreenLayer({
  screen,
  opacity,
  translateY = 0,
  scale = 1,
}: {
  screen: AppScreen;
  opacity: number;
  translateY?: number;
  scale?: number;
}) {
  const Comp = SCREEN_MAP[screen] || HomeScreen;
  return (
    <div
      className="phone-screen-layer"
      style={{
        opacity,
        transform: `translateY(${translateY}px) scale(${scale})`,
        pointerEvents: opacity > 0.5 ? 'auto' : 'none',
      }}
    >
      <Comp />
    </div>
  );
}

export default function PhoneAppScreen({
  screenFrom,
  screenTo,
  screenBlend,
}: {
  screenFrom: AppScreen;
  screenTo: AppScreen;
  screenBlend: number;
}) {
  const blending = screenBlend > 0.02 && screenFrom !== screenTo;

  return (
    <div className="phone-app-viewport phone-app-root">
      {blending ? (
        <>
          <ScreenLayer screen={screenFrom} opacity={1 - screenBlend} scale={1 - screenBlend * 0.03} />
          <ScreenLayer
            screen={screenTo}
            opacity={screenBlend}
            translateY={(1 - screenBlend) * 10}
            scale={0.98 + screenBlend * 0.02}
          />
        </>
      ) : (
        <ScreenLayer screen={screenTo} opacity={1} />
      )}
    </div>
  );
}
