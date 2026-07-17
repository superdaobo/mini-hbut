'use client';

import { useEffect, useState } from 'react';

/**
 * 是否已滚过 3D Hero 滚动驱动区。
 * 使用 hysteresis，避免边界附近 pastHero 来回翻转导致整页闪一下。
 */
export function useHeroScrollPhase() {
  const [pastHero, setPastHero] = useState(false);

  useEffect(() => {
    const ENTER_PAST = -24; // bottom 越过视口上方再切
    const EXIT_PAST = 48; // 重新进入时留缓冲

    const update = () => {
      const driver = document.querySelector('[data-hero-scroll-driver]');
      if (!driver) {
        setPastHero(false);
        return;
      }
      const bottom = driver.getBoundingClientRect().bottom;
      setPastHero((prev) => {
        if (prev) {
          // 已 past：只有明显回到驱动区才退出 past
          return bottom <= EXIT_PAST;
        }
        return bottom <= ENTER_PAST;
      });
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return pastHero;
}
