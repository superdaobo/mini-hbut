'use client';

import { motion } from 'framer-motion';
import { useScrollProgress } from '@/hooks/use-scroll-progress';
import { SCREEN_CAPTIONS } from '@/lib/screen-captions';
import PhoneAppScreen from './PhoneAppScreen';
import './phone-app.css';

/**
 * 产品手机框：以「设备 chrome + 屏幕」呈现真实 App UI。
 * 与 3D 机身/镜头轨同步缩放与倾斜，避免裸露的扁平后台截图感。
 */
export default function PhoneScreenOverlay() {
  const { sample, reducedMotion, isMobile } = useScrollProgress();
  const brightness = sample.phone.screenBrightness;
  if (brightness < 0.05) return null;

  const progress = sample.globalProgress;
  const phoneScale = sample.phone.scale;
  const rotY = sample.phone.rotation.y;
  const rotX = sample.phone.rotation.x;
  const caption = SCREEN_CAPTIONS[sample.activeScreen] ?? SCREEN_CAPTIONS.home;

  // 桌面偏右给文案留位；移动端居中略下
  const baseScale = isMobile ? 0.78 : 0.92;
  const scale = baseScale * (0.92 + (phoneScale - 1) * 0.35);
  const rotateY = rotY * 28;
  const rotateX = -rotX * 18 + 6;
  const translateX = isMobile ? 0 : 18 + progress * 4 + sample.phone.position.x * 40;
  const translateY =
    (typeof window !== 'undefined' ? window.innerHeight * (isMobile ? 0.2 : 0.14) : 120) +
    sample.phone.position.y * 70;

  return (
    <div className="pointer-events-none fixed inset-0 z-[12] overflow-hidden" aria-hidden>
      <motion.div
        className="absolute left-1/2 top-0"
        style={{
          transformStyle: 'preserve-3d',
          perspective: 1200,
        }}
        initial={false}
        animate={{
          opacity: 0.15 + brightness * 0.85,
          x: `calc(-50% + ${translateX}%)`,
          y: translateY,
        }}
        transition={{ type: 'spring', stiffness: 90, damping: 22, mass: 0.8 }}
      >
        <div
          className="relative"
          style={{
            width: 292,
            height: 600,
            transform: `rotateY(${rotateY}deg) rotateX(${rotateX}deg) scale(${scale})`,
            transformStyle: 'preserve-3d',
            transition: reducedMotion ? undefined : 'transform 0.45s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          {/* 金属外框 */}
          <div
            className="absolute inset-0 rounded-[42px] shadow-[0_40px_100px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.08)]"
            style={{
              background:
                'linear-gradient(145deg, #2a3348 0%, #121722 40%, #0a0e16 70%, #1a2233 100%)',
              transform: 'translateZ(-8px)',
            }}
          />
          {/* 侧边高光 */}
          <div
            className="absolute inset-y-8 -left-0.5 w-1 rounded-full opacity-50"
            style={{
              background: 'linear-gradient(180deg, transparent, #67e8f9, transparent)',
              transform: 'translateZ(-4px)',
            }}
          />

          {/* 内屏玻璃 */}
          <div className="absolute inset-[9px] overflow-hidden rounded-[34px] bg-black ring-1 ring-white/10">
            {/* 动态岛 */}
            <div className="absolute left-1/2 top-2 z-20 h-6 w-[88px] -translate-x-1/2 rounded-full bg-black" />
            <div className="absolute inset-0 origin-top">
              <PhoneAppScreen
                screenFrom={sample.screenFrom}
                screenTo={sample.screenTo}
                screenBlend={sample.screenBlend}
              />
            </div>
            {/* 玻璃反光 */}
            <div
              className="pointer-events-none absolute inset-0 z-10"
              style={{
                background:
                  'linear-gradient(115deg, rgba(255,255,255,0.14) 0%, transparent 32%, transparent 62%, rgba(56,189,248,0.08) 100%)',
              }}
            />
          </div>

          {/* 移动端字幕条 */}
          <div className="absolute -bottom-14 left-1/2 w-[min(280px,80vw)] -translate-x-1/2 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-center backdrop-blur-md lg:hidden">
            <p className="text-[10px] font-semibold" style={{ color: caption.accent }}>
              {caption.label}
            </p>
            <p className="text-xs text-white/80">{caption.title}</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
