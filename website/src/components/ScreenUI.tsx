'use client';

import { Html } from '@react-three/drei';
import {
  Bell,
  BookOpen,
  Calendar,
  GraduationCap,
  Home,
  LayoutGrid,
  MapPin,
  MessageSquare,
} from 'lucide-react';

interface ScreenUIProps {
  brightness: number;
  insideScreen: number;
}

const quickActions = [
  { icon: Calendar, label: '今日课表', color: '#38bdf8' },
  { icon: GraduationCap, label: '成绩查询', color: '#a78bfa' },
  { icon: BookOpen, label: '考试倒计时', color: '#f472b6' },
  { icon: Bell, label: '通知聚合', color: '#34d399' },
  { icon: MapPin, label: '校园服务', color: '#fbbf24' },
  { icon: MessageSquare, label: '交流功能', color: '#60a5fa' },
];

const tabItems = [
  { icon: Home, label: '首页' },
  { icon: LayoutGrid, label: '服务' },
  { icon: Calendar, label: '日程' },
  { icon: Bell, label: '通知' },
];

export default function ScreenUI({ brightness, insideScreen }: ScreenUIProps) {
  const opacity = Math.max(0.15, brightness) * (1 - insideScreen * 0.85);
  const scale = 1 + insideScreen * 0.15;

  return (
    <Html
      transform
      occlude
      distanceFactor={1.35}
      position={[0, 0, 0.034]}
      scale={0.22 * scale}
      style={{
        width: '280px',
        height: '580px',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <div
        className="relative h-full w-full overflow-hidden rounded-[28px] border border-white/10"
        style={{
          opacity,
          background: 'linear-gradient(165deg, #0b1220 0%, #111827 45%, #0a1628 100%)',
          boxShadow: `0 0 ${20 + brightness * 30}px rgba(56, 189, 248, ${0.15 + brightness * 0.25})`,
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(56,189,248,0.18),transparent_45%)]" />
        <div className="relative flex h-full flex-col p-4 text-white">
          <header className="mb-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/70">Mini-HBUT</p>
            <h2 className="mt-1 text-lg font-semibold">让校园生活，从一个入口开始</h2>
            <p className="mt-1 text-[11px] text-white/55">聚合课表、成绩、考试、通知与日程</p>
          </header>

          <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
            <div className="flex items-center justify-between text-[11px] text-white/60">
              <span>今日课表</span>
              <span className="text-cyan-300">第 3-4 节</span>
            </div>
            <div className="mt-2 rounded-xl bg-gradient-to-r from-cyan-500/20 to-violet-500/20 p-2.5">
              <p className="text-sm font-medium">数据结构</p>
              <p className="text-[10px] text-white/60">教学楼 A103 · 10:30</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {quickActions.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] p-2.5"
              >
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${item.color}22`, color: item.color }}
                >
                  <item.icon size={14} />
                </div>
                <span className="text-[10px] text-white/80">{item.label}</span>
              </div>
            ))}
          </div>

          <div className="mt-auto flex items-center justify-around border-t border-white/10 pt-2">
            {tabItems.map((tab) => (
              <div key={tab.label} className="flex flex-col items-center gap-0.5 text-[9px] text-white/50">
                <tab.icon size={14} className="text-cyan-300/80" />
                <span>{tab.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Html>
  );
}
