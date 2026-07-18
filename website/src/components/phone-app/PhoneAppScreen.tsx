'use client';

import type { ComponentType } from 'react';
import type { AppScreen } from '@/lib/scroll-utils';
import AppShell, { AppCard, PageHeader } from './AppShell';
import './phone-app.css';
import { APP_MODULES, MODULE_CATEGORIES, QUICK_ENTRY_IDS, modulesByCategory } from './app-modules';
import {
  DEMO_CALENDAR,
  DEMO_CAMPUS_CODE,
  DEMO_CLASSROOMS,
  DEMO_ELECTRICITY,
  DEMO_ELECTRICITY_DUAL,
  DEMO_EXAMS,
  DEMO_GRADES,
  DEMO_LIBRARY,
  DEMO_NOTIFICATIONS,
  DEMO_RANKING,
  DEMO_SCHEDULE_BLOCKS,
  DEMO_STUDENT,
  DEMO_TODAY_COURSES,
  DEMO_TRANSACTIONS,
} from './demo-data';
import {
  Bell,
  BookOpen,
  Calendar,
  CloudSun,
  GraduationCap,
  MapPin,
  QrCode,
  Search,
  User,
  Wallet,
  Zap,
} from 'lucide-react';

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
  // 对齐 ScheduleView：月栏 + 7 日 + 节次轴 + 彩色课程块
  const days = ['一', '二', '三', '四', '五', '六', '日'];
  const dayNums = [14, 15, 16, 17, 18, 19, 20];
  const periods = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const todayIdx = 2;

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
            <div className="phone-schedule-topbar-sub">2025-2026 · 第 1 学期</div>
          </div>
          <div className="phone-schedule-week-pill">第 14 周 ▾</div>
        </div>

        <div className="phone-schedule-date-header">
          <div className="phone-schedule-month">
            <span className="phone-schedule-month-num">7</span>
            <span className="phone-schedule-month-label">月</span>
          </div>
          <div className="phone-schedule-days-row">
            {days.map((d, i) => (
              <div key={d} className={`phone-schedule-day-col ${i === todayIdx ? 'is-today' : ''}`}>
                <div className="phone-schedule-day-num">{dayNums[i]}</div>
                <div className="phone-schedule-day-label">周{d}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="phone-schedule-grid-body">
          <div className="phone-schedule-time-axis">
            {periods.map((p) => (
              <div key={p} className="phone-schedule-time-slot" style={{ height: 22 }}>
                <span className="period-num">{p}</span>
              </div>
            ))}
          </div>
          <div
            className="phone-schedule-courses-grid"
            style={{ height: periods.length * 22, gridTemplateColumns: 'repeat(7, 1fr)' }}
          >
            {days.map((_, dayIdx) => (
              <div
                key={dayIdx}
                className={`phone-schedule-day-column ${dayIdx === todayIdx ? 'is-today' : ''}`}
                style={{ gridTemplateRows: `repeat(${periods.length}, 22px)` }}
              >
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
  // 对齐成绩模块：学期 chip + 绩点横幅 + 课程列表卡
  const terms = ['全部', '2025-2026-1', '2024-2025-2'];
  const activeTerm = '2025-2026-1';
  // Hero 演示固定本学期；chip「全部」仅视觉，列表仍按 activeTerm 过滤
  const list = DEMO_GRADES.filter((g) => g.term === activeTerm);

  return (
    <AppShell screen="grades" showNav={false}>
      <PageHeader title="成绩查询" icon={<GraduationCap className="h-4 w-4 text-indigo-500" />} />
      <div className="phone-feature-body">
        <div className="phone-grade-term-row">
          {terms.map((t) => (
            <span
              key={t}
              className={`phone-grade-term-chip ${t === activeTerm ? 'is-active' : ''}`}
            >
              {t === '全部' ? t : t.replace('2025-2026-1', '本学期').replace('2024-2025-2', '上学期')}
            </span>
          ))}
        </div>

        <div className="phone-gradient-banner phone-gradient-indigo">
          <div className="flex items-end justify-between">
            <div>
              <p className="phone-banner-label">本学期绩点</p>
              <p className="phone-banner-value">{DEMO_STUDENT.gpa}</p>
              <p className="phone-banner-sub">已修学分 {DEMO_STUDENT.credits}</p>
            </div>
            <div className="text-right text-[9px] opacity-90">
              <p>专业排名</p>
              <p className="text-lg font-bold">{DEMO_RANKING.rank}</p>
            </div>
          </div>
        </div>

        {list.map((g) => {
          const scoreNum = Number(g.score);
          const scoreColor = scoreNum >= 90 ? '#16a34a' : scoreNum >= 80 ? '#2563eb' : '#d97706';
          return (
            <div key={`${g.name}-${g.term}`} className="phone-grade-course-card">
              <div className="min-w-0 flex-1">
                <p className="phone-list-item-title">{g.name}</p>
                <p className="phone-list-item-sub">
                  {g.teacher} · {g.term}
                </p>
              </div>
              <div className="phone-grade-score-block">
                <p className="phone-grade-score" style={{ color: scoreColor }}>
                  {g.score}
                </p>
                <p className="phone-list-item-meta">绩点 {g.point}</p>
              </div>
            </div>
          );
        })}
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
  const dual = DEMO_ELECTRICITY_DUAL;
  const e = DEMO_ELECTRICITY;
  return (
    <AppShell screen="electricity" showNav={false}>
      <PageHeader title="电费查询" icon={<Zap className="h-4 w-4 text-rose-500" />} />
      <div className="phone-feature-body">
        <div className="phone-card phone-card-shadow">
          <p className="text-[10px] font-medium text-gray-500">
            {dual.building} · {dual.room}
          </p>
          <p className="mt-1 text-[9px] text-gray-400">双计费宿舍 · 更新于 {dual.updatedAt}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="phone-gradient-banner phone-gradient-rose !p-3">
            <p className="phone-banner-label">💡 {dual.light.label}</p>
            <p className="phone-banner-value !text-xl">¥{dual.light.balance}</p>
            <p className="phone-banner-sub">{dual.light.kwh} 度</p>
          </div>
          <div className="phone-gradient-banner phone-gradient-indigo !p-3">
            <p className="phone-banner-label">❄️ {dual.ac.label}</p>
            <p className="phone-banner-value !text-xl">¥{dual.ac.balance}</p>
            <p className="phone-banner-sub">{dual.ac.kwh} 度</p>
          </div>
        </div>
        <div className="phone-list-item">
          <div>
            <p className="phone-list-item-title">今日用电</p>
            <p className="phone-list-item-sub">照明 + 空调合计</p>
          </div>
          <span className="text-sm font-bold text-rose-500">{e.usage} 度</span>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] text-rose-600">
          低电量提醒已开启 · 余额低于 10 度将推送通知
        </div>
      </div>
    </AppShell>
  );
}

function CampusCodeScreen() {
  const c = DEMO_CAMPUS_CODE;
  return (
    <AppShell screen="home" showNav={false}>
      <PageHeader title="校园码" icon={<QrCode className="h-4 w-4 text-teal-600" />} />
      <div className="phone-feature-body">
        <div className="phone-card phone-card-shadow text-center">
          <span className="inline-flex rounded-full bg-teal-50 px-2 py-0.5 text-[9px] font-semibold text-teal-700">
            {c.mode}
          </span>
          <div className="mx-auto mt-3 flex h-36 w-36 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 shadow-inner">
            <div className="grid grid-cols-5 gap-1 p-3">
              {Array.from({ length: 25 }).map((_, i) => (
                <span
                  key={i}
                  className={`h-2.5 w-2.5 rounded-[2px] ${i % 3 === 0 || i % 7 === 0 ? 'bg-white' : 'bg-white/20'}`}
                />
              ))}
            </div>
          </div>
          <p className="mt-3 text-sm font-bold text-gray-800">{c.name}</p>
          <p className="text-[10px] text-gray-500">学号 {c.serial}</p>
          <p className="mt-2 text-lg font-bold text-teal-600">¥{c.balance}</p>
          <p className="mt-1 text-[9px] text-gray-400">{c.hint}</p>
        </div>
      </div>
    </AppShell>
  );
}

function TransactionsScreen() {
  return (
    <AppShell screen="home" showNav={false}>
      <PageHeader title="交易记录" icon={<Wallet className="h-4 w-4 text-rose-500" />} />
      <div className="phone-feature-body">
        {DEMO_TRANSACTIONS.map((t) => (
          <div key={`${t.title}-${t.time}`} className="phone-list-item">
            <div>
              <p className="phone-list-item-title">{t.title}</p>
              <p className="phone-list-item-sub">
                {t.type} · {t.time}
              </p>
            </div>
            <span
              className={`text-sm font-bold ${t.amount.startsWith('+') ? 'text-emerald-600' : 'text-gray-800'}`}
            >
              {t.amount}
            </span>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function LibraryScreen() {
  return (
    <AppShell screen="home" showNav={false}>
      <PageHeader title="图书查询" icon={<BookOpen className="h-4 w-4 text-teal-700" />} />
      <div className="phone-feature-body">
        <div className="phone-dashboard-search mx-0 mb-1 max-w-none">
          <Search className="phone-dashboard-search-icon" />
          搜索书名 / ISBN
        </div>
        {DEMO_LIBRARY.map((b) => (
          <div key={b.title} className="phone-list-item">
            <div className="min-w-0">
              <p className="phone-list-item-title truncate">{b.title}</p>
              <p className="phone-list-item-sub">{b.loc}</p>
            </div>
            <span
              className={`phone-status-pill ${b.status === '已借出' ? 'phone-status-pill--busy' : 'phone-status-pill--free'}`}
            >
              {b.status}
            </span>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function CalendarScreen() {
  return (
    <AppShell screen="home" showNav={false}>
      <PageHeader title="校历" icon={<Calendar className="h-4 w-4 text-blue-500" />} />
      <div className="phone-feature-body">
        <div className="phone-gradient-banner phone-gradient-indigo">
          <p className="phone-banner-label">2025-2026 学年 · 第 1 学期</p>
          <p className="phone-banner-value !text-2xl">第 14 教学周</p>
          <p className="phone-banner-sub">当前周次</p>
        </div>
        {DEMO_CALENDAR.map((w) => (
          <div key={w.week} className="phone-list-item">
            <div>
              <p className="phone-list-item-title">{w.week}</p>
              <p className="phone-list-item-sub">{w.range}</p>
            </div>
            <span className="text-[10px] text-gray-500">{w.note}</span>
          </div>
        ))}
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
                    <mod.icon className="phone-module-svg" strokeWidth={2.2} />
                  </div>
                  <span className="phone-module-label">{mod.name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {/* 扩展模块视觉预览（对齐 Tauri 全量入口） */}
        <div className="phone-feature-category">
          <h3 className="phone-feature-category-title">生活与扩展</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="phone-card !p-2.5">
              <p className="text-[10px] font-bold text-gray-800">校园码</p>
              <p className="text-[8px] text-gray-500">在线 / 高能模式二维码</p>
            </div>
            <div className="phone-card !p-2.5">
              <p className="text-[10px] font-bold text-gray-800">交易记录</p>
              <p className="text-[8px] text-gray-500">一码通流水筛选</p>
            </div>
            <div className="phone-card !p-2.5">
              <p className="text-[10px] font-bold text-gray-800">图书查询</p>
              <p className="text-[8px] text-gray-500">馆藏检索与状态</p>
            </div>
            <div className="phone-card !p-2.5">
              <p className="text-[10px] font-bold text-gray-800">校历</p>
              <p className="text-[8px] text-gray-500">教学周与假期</p>
            </div>
          </div>
        </div>
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
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <p className="phone-profile-name">{DEMO_STUDENT.id}</p>
                <span className="phone-profile-badge">本科生</span>
              </div>
              <p className="phone-profile-college">湖北工业大学 · {DEMO_STUDENT.college}</p>
            </div>
            <span className="session-status-dot is-green" title="会话已连接" />
          </div>
        </div>
        <div className="phone-card phone-card-shadow">
          <div className="phone-section-head">
            <h3>登录状态</h3>
            <span className="text-[9px] font-medium text-emerald-600">静默登录已开启</span>
          </div>
          <p className="text-[9px] text-gray-500">门户会话本地缓存 · 临时会话自动失效处理</p>
        </div>
        <div className="phone-module-grid !grid-cols-4">
          {['设置中心', '导出中心', '检查更新', '意见反馈'].map((label) => (
            <div key={label} className="phone-module-item">
              <div className="phone-module-icon bg-slate-100 !text-slate-600">
                <span className="text-[10px] font-bold">{label.slice(0, 1)}</span>
              </div>
              <span className="phone-module-label">{label}</span>
            </div>
          ))}
        </div>
        {['云同步', '隐私政策', '开源协议', '关于 Mini-HBUT'].map((item) => (
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

/** 官网手机演示可用的屏 ID（与 scroll-utils AppScreen 对齐） */
export type PhoneDemoScreen = AppScreen;

export default function PhoneAppScreen({
  screenFrom,
  screenTo,
  screenBlend = 1,
  blend,
}: {
  screenFrom: AppScreen;
  screenTo: AppScreen;
  /** 兼容旧调用 */
  screenBlend?: number;
  /** Hero / Showcase 简写 */
  blend?: number;
}) {
  const resolvedBlend = blend ?? screenBlend;
  const blending = resolvedBlend > 0.02 && screenFrom !== screenTo;

  return (
    <div className="phone-app-viewport phone-app-root">
      {blending ? (
        <>
          <ScreenLayer
            screen={screenFrom}
            opacity={1 - resolvedBlend}
            scale={1 - resolvedBlend * 0.03}
          />
          <ScreenLayer
            screen={screenTo}
            opacity={resolvedBlend}
            translateY={(1 - resolvedBlend) * 10}
            scale={0.98 + resolvedBlend * 0.02}
          />
        </>
      ) : (
        <ScreenLayer screen={screenTo} opacity={1} />
      )}
    </div>
  );
}
