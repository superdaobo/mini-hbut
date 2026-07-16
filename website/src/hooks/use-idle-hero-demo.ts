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
      // 前 1s 静止展示入场，之后循环演示
      if (elapsed >= 1) {
        const cycle = ((elapsed - 1) % 18) / 18;
        const tri = cycle < 0.72 ? cycle / 0.72 : 1 - (cycle - 0.72) / 0.28;
        const target = 0.03 + tri * 0.54;
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
