'use client';

import { useScrollProgress } from '@/hooks/use-scroll-progress';
import { useDisplayScreen } from '@/hooks/use-display-screen';
import { SCREEN_CAPTIONS } from '@/lib/screen-captions';
import PhoneAppScreen from './PhoneAppScreen';
import './phone-app.css';

/**
 * 移动端产品手机降级：CSS 机框 + 同源 PhoneAppScreen。
 * 位置固定、无 spring，避免 progress 连续更新时整机弹跳闪烁。
 */
export default function PhoneScreenOverlay() {
  const { sample, isMobile } = useScrollProgress();
  const display = useDisplayScreen();
  const caption = SCREEN_CAPTIONS[display.activeScreen] ?? SCREEN_CAPTIONS.home;

  if (!isMobile) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[12] flex flex-col items-center"
      style={{
        top: 'max(9.5rem, 22vh)',
        paddingBottom: '1rem',
      }}
      aria-hidden
    >
      <div
        className="relative"
        style={{
          width: 'min(68vw, 260px)',
          height: 'min(140vw, 534px)',
          maxHeight: '52vh',
          opacity: Math.max(0.9, sample.phone.screenBrightness),
          transition: 'opacity 0.3s ease',
        }}
      >
        <div
          className="absolute inset-0 rounded-[36px]"
          style={{
            background:
              'linear-gradient(155deg, #3d4a63 0%, #1a2233 35%, #0c1018 65%, #243044 100%)',
            boxShadow:
              '0 24px 50px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.1), inset 0 1px 0 rgba(255,255,255,0.12)',
          }}
        />

        <div className="absolute inset-[8px] overflow-hidden rounded-[28px] bg-[#f0f4f8] ring-1 ring-black/40">
          <div className="absolute left-1/2 top-1.5 z-20 h-[16px] w-[72px] -translate-x-1/2 rounded-full bg-black" />
          <div className="absolute inset-0">
            <PhoneAppScreen
              screenFrom={display.screenFrom}
              screenTo={display.screenTo}
              screenBlend={display.screenBlend}
            />
          </div>
          <div
            className="pointer-events-none absolute inset-0 z-10"
            style={{
              background:
                'linear-gradient(118deg, rgba(255,255,255,0.14) 0%, transparent 28%, transparent 70%, rgba(56,189,248,0.05) 100%)',
            }}
          />
        </div>
      </div>

      <div className="mt-3 w-[min(280px,88vw)] rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-center backdrop-blur-md">
        <p className="text-[10px] font-semibold" style={{ color: caption.accent }}>
          {caption.label}
        </p>
        <p className="text-xs text-white/85">{caption.title}</p>
      </div>
    </div>
  );
}
