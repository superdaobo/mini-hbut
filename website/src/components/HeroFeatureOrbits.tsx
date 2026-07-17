'use client';

import { motion } from 'framer-motion';
import { useScrollProgress } from '@/hooks/use-scroll-progress';
import { APP_MODULES, type AppModuleId } from '@/components/phone-app/app-modules';
import type { AppScreen } from '@/lib/scroll-utils';

type OrbitCard = {
  id: AppModuleId;
  metric: string;
  screen: AppScreen;
  top: string;
};

/**
 * 右侧功能轮询卡：
 * - 固定右栏，不侵入中间手机与左侧文案
 * - 随 activeScreen 高亮，形成「功能轮播」感
 */
const ORBIT_CARDS: OrbitCard[] = [
  { id: 'grades', metric: 'GPA 3.72', screen: 'grades', top: '18%' },
  { id: 'classroom', metric: '今 12 间空闲', screen: 'classroom', top: '32%' },
  { id: 'exams', metric: '倒计时 6 天', screen: 'exams', top: '46%' },
  { id: 'electricity', metric: '余额 ¥28.6', screen: 'electricity', top: '60%' },
  { id: 'calendar', metric: '第 14 教学周', screen: 'home', top: '74%' },
];

function screenMatches(card: OrbitCard, active: AppScreen) {
  if (card.screen === active) return true;
  if (active === 'all-features') return card.id === 'grades';
  if (active === 'home') return card.id === 'calendar' || card.id === 'grades';
  if (active === 'schedule') return card.id === 'calendar';
  return false;
}

export default function HeroFeatureOrbits() {
  const { sample, reducedMotion, isMobile } = useScrollProgress();
  if (isMobile) return null;

  return (
    <div
      className="pointer-events-none fixed inset-y-0 right-0 z-[25] hidden w-[min(260px,24vw)] min-w-[188px] lg:block"
      aria-hidden
    >
      <div className="relative h-full w-full pr-4 pt-28">
        <p className="mb-3 pr-1 text-right text-[10px] font-medium tracking-wide text-white/35">
          功能速览 · 随界面轮播
        </p>
        {ORBIT_CARDS.map((card, i) => {
          const mod = APP_MODULES.find((m) => m.id === card.id);
          if (!mod) return null;
          const Icon = mod.icon;
          const active = screenMatches(card, sample.activeScreen);
          return (
            <motion.div
              key={card.id}
              className="absolute right-0 w-[156px]"
              style={{ top: card.top }}
              initial={reducedMotion ? false : { opacity: 0, x: 28 }}
              animate={{
                opacity: active ? 1 : 0.55 + sample.phone.screenBrightness * 0.2,
                x: 0,
                scale: active ? 1.06 : 0.98,
              }}
              transition={{ delay: 0.1 + i * 0.05, duration: 0.35 }}
            >
              <motion.div
                className="rounded-2xl border border-white/15 bg-black/55 p-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur-md"
                style={{
                  boxShadow: active
                    ? `0 0 0 1px ${mod.color}99, 0 16px 40px rgba(0,0,0,0.5), 0 0 28px ${mod.color}45`
                    : undefined,
                }}
                animate={reducedMotion ? undefined : { y: [0, i % 2 === 0 ? -5 : 5, 0] }}
                transition={
                  reducedMotion
                    ? undefined
                    : { duration: 3.2 + i * 0.25, repeat: Infinity, ease: 'easeInOut' }
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
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: mod.color }}
                    animate={{ width: active ? '88%' : '38%' }}
                    transition={{ duration: 0.45 }}
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
