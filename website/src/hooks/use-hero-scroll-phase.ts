'use client';

import { useEffect, useState } from 'react';

/** 是否已滚过 3D Hero 滚动驱动区，进入下方经典官网内容 */
export function useHeroScrollPhase() {
  const [pastHero, setPastHero] = useState(false);

  useEffect(() => {
    const update = () => {
      const driver = document.querySelector('[data-hero-scroll-driver]');
      if (!driver) {
        setPastHero(false);
        return;
      }
      const bottom = driver.getBoundingClientRect().bottom;
      setPastHero(bottom <= 0);
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
