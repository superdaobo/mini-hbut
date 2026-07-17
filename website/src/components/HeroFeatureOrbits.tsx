'use client';

import { motion } from 'framer-motion';
import { useScrollProgress } from '@/hooks/use-scroll-progress';
import { APP_MODULES, type AppModuleId } from '@/components/phone-app/app-modules';
import type { AppScreen } from '@/lib/scroll-utils';

type OrbitCard = {
  id: AppModuleId;
  metric: string;
  screen: AppScreen;
  /** 仅用右侧/上下安全区，避免侵入左侧 lg:w-[42%] 文案 */
  top: string;
  right: string;
};

/**
 * 浮卡全部锚在「手机右侧栏」：
 * 布局用 fixed 右侧轨道，不再用负向 translate 冲进左半屏。
 */
const ORBIT_CARDS: OrbitCard[] = [
  { id: 'grades', metric: 'GPA 3.72', screen: 'grades', top: '18%', right: '4%' },
  { id: 'classroom', metric: '今 12 间空闲', screen: 'classroom', top: '32%', right: '3%' },
  { id: 'exams', metric: '倒计时 6 天', screen: 'exams', top: '46%', right: '4.5%' },
  { id: 'electricity', metric: '余额 ¥28.6', screen: 'electricity', top: '60%', right: '3%' },
  { id: 'calendar', metric: '第 14 教学周', screen: 'home', top: '74%', right: '5%' },
];

function screenMatches(card: OrbitCard, active: AppScreen) {
  if (card.screen === active) return true;
  if (active === 'all-features') return card.id === 'grades';
  if (active === 'home') return card.id === 'calendar' || card.id === 'grades';
  return false;
}

export default function HeroFeatureOrbits() {
  const { sample, reducedMotion, isMobile } = useScrollProgress();
  // 平板以下隐藏；桌面放在右 1/3，绝不进左文案区
  if (isMobile) return null;

  return (
    <div
      className="pointer-events-none fixed inset-y-0 right-0 z-[13] hidden w-[min(280px,28vw)] min-w-[200px] lg:block"
      aria-hidden
    >
      <div className="relative h-full w-full pr-3 pt-24">
        {ORBIT_CARDS.map((card, i) => {
          const mod = APP_MODULES.find((m) => m.id === card.id);
          if (!mod) return null;
          const Icon = mod.icon;
          const active = screenMatches(card, sample.activeScreen);
          return (
            <motion.div
              key={card.id}
              className="absolute w-[148px]"
              style={{ top: card.top, right: card.right }}
              initial={reducedMotion ? false : { opacity: 0, x: 24 }}
              animate={{
                opacity: 0.72 + sample.phone.screenBrightness * 0.28,
                x: 0,
                scale: active ? 1.05 : 1,
              }}
              transition={{ delay: 0.12 + i * 0.05, duration: 0.4 }}
            >
              <motion.div
                className="rounded-2xl border border-white/15 bg-black/50 p-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur-md"
                style={{
                  boxShadow: active
                    ? `0 0 0 1px ${mod.color}88, 0 16px 40px rgba(0,0,0,0.5), 0 0 24px ${mod.color}40`
                    : undefined,
                }}
                animate={reducedMotion ? undefined : { y: [0, i % 2 === 0 ? -4 : 4, 0] }}
                transition={
                  reducedMotion
                    ? undefined
                    : { duration: 3 + i * 0.2, repeat: Infinity, ease: 'easeInOut' }
                }
              >
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] text-white shadow-sm"
                    style={{ backgroundColor: mod.color }}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-bold text-white">{mod.name}</p>
                    <p className="truncate text-[9px] text-white/55">{card.metric}</p>
                  </div>
                </div>
                <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: active ? '85%' : '45%',
                      background: mod.color,
                    }}
                  />
                </div>
              </motion.div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
