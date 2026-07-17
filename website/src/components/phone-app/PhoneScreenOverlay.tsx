'use client';

import { motion } from 'framer-motion';
import { useScrollProgress } from '@/hooks/use-scroll-progress';
import { SCREEN_CAPTIONS } from '@/lib/screen-captions';
import PhoneAppScreen from './PhoneAppScreen';
import './phone-app.css';

/**
 * 唯一产品手机：CSS 3D 机框 + 屏幕内 Dashboard 同源 UI。
 * 不再依赖场景中的空壳 PhoneModel。
 */
export default function PhoneScreenOverlay() {
  const { sample, reducedMotion, isMobile } = useScrollProgress();
  const brightness = Math.max(0.85, sample.phone.screenBrightness);
  const caption = SCREEN_CAPTIONS[sample.activeScreen] ?? SCREEN_CAPTIONS.home;

  const progress = sample.globalProgress;
  const phoneScale = sample.phone.scale;
  const rotY = sample.phone.rotation.y;
  const rotX = sample.phone.rotation.x;

  const baseScale = isMobile ? 0.82 : 0.96;
  const scale = baseScale * (0.94 + (phoneScale - 1) * 0.28);
  const rotateY = rotY * 26;
  const rotateX = -rotX * 16 + 5;
  const translateX = isMobile ? 0 : 16 + progress * 3 + sample.phone.position.x * 36;
  const translateY =
    (typeof window !== 'undefined' ? window.innerHeight * (isMobile ? 0.18 : 0.12) : 110) +
    sample.phone.position.y * 64;

  return (
    <div className="pointer-events-none fixed inset-0 z-[12] overflow-hidden" aria-hidden>
      <motion.div
        className="absolute left-1/2 top-0"
        style={{ transformStyle: 'preserve-3d', perspective: 1400 }}
        initial={false}
        animate={{
          opacity: brightness,
          x: `calc(-50% + ${translateX}%)`,
          y: translateY,
        }}
        transition={{ type: 'spring', stiffness: 100, damping: 24, mass: 0.75 }}
      >
        <div
          className="relative"
          style={{
            width: 300,
            height: 618,
            transform: `rotateY(${rotateY}deg) rotateX(${rotateX}deg) scale(${scale})`,
            transformStyle: 'preserve-3d',
            transition: reducedMotion ? undefined : 'transform 0.5s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          {/* 机身边框 */}
          <div
            className="absolute inset-0 rounded-[44px]"
            style={{
              background:
                'linear-gradient(155deg, #3d4a63 0%, #1a2233 35%, #0c1018 65%, #243044 100%)',
              boxShadow:
                '0 40px 90px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.1), inset 0 1px 0 rgba(255,255,255,0.12)',
              transform: 'translateZ(-10px)',
            }}
          />
          <div
            className="absolute inset-y-10 -left-[1px] w-[3px] rounded-full opacity-60"
            style={{
              background: 'linear-gradient(180deg, transparent, #67e8f9aa, transparent)',
            }}
          />

          {/* 屏幕 */}
          <div className="absolute inset-[10px] overflow-hidden rounded-[36px] bg-[#f0f4f8] ring-1 ring-black/40">
            <div className="absolute left-1/2 top-2.5 z-20 h-[22px] w-[92px] -translate-x-1/2 rounded-full bg-black" />
            <div className="absolute inset-0">
              <PhoneAppScreen
                screenFrom={sample.screenFrom}
                screenTo={sample.screenTo}
                screenBlend={sample.screenBlend}
              />
            </div>
            <div
              className="pointer-events-none absolute inset-0 z-10"
              style={{
                background:
                  'linear-gradient(118deg, rgba(255,255,255,0.16) 0%, transparent 28%, transparent 70%, rgba(56,189,248,0.06) 100%)',
              }}
            />
          </div>

          {/* 移动端字幕 */}
          <div className="absolute -bottom-14 left-1/2 w-[min(280px,85vw)] -translate-x-1/2 rounded-xl border border-white/10 bg-black/55 px-3 py-2 text-center backdrop-blur-md lg:hidden">
            <p className="text-[10px] font-semibold" style={{ color: caption.accent }}>
              {caption.label}
            </p>
            <p className="text-xs text-white/85">{caption.title}</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
