'use client';

import { motion } from 'framer-motion';
import { useScrollProgress } from '@/hooks/use-scroll-progress';
import { APP_MODULES, type AppModuleId } from '@/components/phone-app/app-modules';
import type { AppScreen } from '@/lib/scroll-utils';

type OrbitCard = {
  id: AppModuleId;
  metric: string;
  screen: AppScreen;
  /** 相对手机中心的百分比偏移 */
  x: string;
  y: string;
};

/** 与 Dashboard 快捷入口/功能网格同源的模块迷你卡 */
const ORBIT_CARDS: OrbitCard[] = [
  { id: 'grades', metric: 'GPA 3.72', screen: 'grades', x: '-118%', y: '8%' },
  { id: 'classroom', metric: '今 12 间空闲', screen: 'classroom', x: '108%', y: '0%' },
  { id: 'exams', metric: '倒计时 6 天', screen: 'exams', x: '-102%', y: '58%' },
  { id: 'electricity', metric: '余额 ¥28.6', screen: 'electricity', x: '96%', y: '52%' },
  { id: 'calendar', metric: '第 14 教学周', screen: 'home', x: '-40%', y: '-18%' },
];

function screenMatches(card: OrbitCard, active: AppScreen) {
  if (card.screen === active) return true;
  if (active === 'all-features' || active === 'home') return card.id === 'calendar' || card.id === 'grades';
  return false;
}

export default function HeroFeatureOrbits() {
  const { sample, reducedMotion, isMobile } = useScrollProgress();
  if (isMobile) return null;

  const progress = sample.globalProgress;
  // 随滚动略微散开
  const spread = 1 + progress * 0.12;

  return (
    <div className="pointer-events-none fixed inset-0 z-[13] hidden lg:block" aria-hidden>
      <div
        className="absolute left-1/2 top-0"
        style={{
          // 与 PhoneScreenOverlay 手机锚点大致对齐（偏右）
          transform: `translate(calc(-50% + 18% + ${sample.phone.position.x * 40}%), ${
            typeof window !== 'undefined' ? window.innerHeight * 0.14 + sample.phone.position.y * 70 : 120
          }px) scale(${spread})`,
          width: 292,
          height: 600,
          transformOrigin: 'center center',
        }}
      >
        {ORBIT_CARDS.map((card, i) => {
          const mod = APP_MODULES.find((m) => m.id === card.id);
          if (!mod) return null;
          const Icon = mod.icon;
          const active = screenMatches(card, sample.activeScreen);
          return (
            <motion.div
              key={card.id}
              className="absolute w-[132px]"
              style={{
                left: '50%',
                top: '50%',
                transform: `translate(${card.x}, ${card.y})`,
              }}
              initial={reducedMotion ? false : { opacity: 0, scale: 0.9 }}
              animate={{
                opacity: 0.55 + sample.phone.screenBrightness * 0.45,
                scale: active ? 1.06 : 1,
              }}
              transition={{ delay: 0.15 + i * 0.06, duration: 0.45 }}
            >
              <motion.div
                className="rounded-2xl border border-white/15 bg-black/45 p-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur-md"
                style={{
                  boxShadow: active
                    ? `0 0 0 1px ${mod.color}66, 0 16px 40px rgba(0,0,0,0.5), 0 0 28px ${mod.color}33`
                    : undefined,
                }}
                animate={
                  reducedMotion
                    ? undefined
                    : { y: [0, i % 2 === 0 ? -5 : 5, 0] }
                }
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
                <div
                  className="mt-2 h-0.5 overflow-hidden rounded-full bg-white/10"
                  style={{ opacity: active ? 1 : 0.35 }}
                >
                  <div className="h-full w-2/3 rounded-full" style={{ background: mod.color }} />
                </div>
              </motion.div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
