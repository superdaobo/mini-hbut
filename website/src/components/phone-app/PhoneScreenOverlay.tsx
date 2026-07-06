'use client';

import { useScrollProgress } from '@/hooks/use-scroll-progress';
import PhoneAppScreen from './PhoneAppScreen';
import './phone-app.css';

/**
 * 手机屏幕 UI：使用固定 DOM 叠层渲染（比 drei Html transform 更稳定），
 * 通过滚动进度与手机关键帧同步位置/缩放。
 */
export default function PhoneScreenOverlay() {
  const { sample } = useScrollProgress();
  const brightness = sample.phone.screenBrightness;
  const screenOn = brightness > 0.08;
  const opacity = screenOn ? 1 : Math.max(0, brightness / 0.08);

  if (opacity <= 0.01) return null;

  const progress = sample.globalProgress;
  const phoneScale = sample.phone.scale;
  const phoneTilt = sample.phone.rotation.x;

  // 与 3D 手机机身对齐的经验参数（居中偏下，不遮挡 Hero 标题）
  const overlayScale = 0.46 + phoneScale * 0.58;
  const translateY =
    typeof window !== 'undefined'
      ? window.innerHeight * (0.26 + progress * 0.04) + sample.phone.position.y * 90
      : 220 + sample.phone.position.y * 90;
  const rotateX = Math.min(10, Math.max(0, (-phoneTilt - 0.12) * 16));

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[12] flex justify-center"
      style={{ opacity }}
      aria-hidden
    >
      <div
        className="origin-top overflow-hidden rounded-[22px] bg-[#f0f4f8] shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
        style={{
          width: '280px',
          height: '580px',
          marginTop: `${translateY}px`,
          transform: `perspective(900px) rotateX(${rotateX}deg) scale(${overlayScale})`,
          transformOrigin: 'top center',
          visibility: opacity > 0.01 ? 'visible' : 'hidden',
        }}
      >
        <PhoneAppScreen
          screenFrom={sample.screenFrom}
          screenTo={sample.screenTo}
          screenBlend={sample.screenBlend}
        />
      </div>
    </div>
  );
}
