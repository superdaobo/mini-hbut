'use client';

import { useEffect, useRef } from 'react';
import { useScrollProgress } from '@/hooks/use-scroll-progress';

/**
 * 用户未主动滚动时，缓慢推进 hero 进度 0→~0.55→回弹，
 * 以展示镜头运镜与多屏 App UI。一旦用户滚动则停止接管。
 */
export function useIdleHeroDemo(enabled: boolean) {
  const { setProgress, reducedMotion } = useScrollProgress();
  const userTouched = useRef(false);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || reducedMotion) return undefined;

    const markTouched = () => {
      userTouched.current = true;
    };

    window.addEventListener('wheel', markTouched, { passive: true });
    window.addEventListener('touchstart', markTouched, { passive: true });
    window.addEventListener('keydown', markTouched);
    window.addEventListener('pointerdown', markTouched);

    let raf = 0;
    const loop = (now: number) => {
      if (userTouched.current) return;
      if (startRef.current == null) startRef.current = now;
      const elapsed = (now - startRef.current) / 1000;
      // 前 1.6s 定妆，之后在 0.04→0.58 循环：驱动 3D 运镜 + 多屏 UI + 右侧功能卡高亮
      // 左侧文案靠 heroOpacity 缓淡，不抢中/右区
      if (elapsed >= 1.6) {
        const cycle = ((elapsed - 1.6) % 20) / 20;
        const tri = cycle < 0.72 ? cycle / 0.72 : 1 - (cycle - 0.72) / 0.28;
        const target = 0.04 + tri * 0.54;
        setProgress(target);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('wheel', markTouched);
      window.removeEventListener('touchstart', markTouched);
      window.removeEventListener('keydown', markTouched);
      window.removeEventListener('pointerdown', markTouched);
    };
  }, [enabled, reducedMotion, setProgress]);
}
