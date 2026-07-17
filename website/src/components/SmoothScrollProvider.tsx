'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SCROLL_DRIVER_VH, SCROLL_DRIVER_VH_MOBILE } from '@/lib/scroll-utils';
import { useScrollProgress } from '@/hooks/use-scroll-progress';

gsap.registerPlugin(ScrollTrigger);

interface SmoothScrollProviderProps {
  children: ReactNode;
  hideScene?: boolean;
}

export default function SmoothScrollProvider({ children, hideScene = false }: SmoothScrollProviderProps) {
  const driverRef = useRef<HTMLDivElement>(null);
  const { setProgress, reducedMotion, isMobile } = useScrollProgress();
  const lenisRef = useRef<Lenis | null>(null);
  const rafRef = useRef<((time: number) => void) | null>(null);

  useEffect(() => {
    const driver = driverRef.current;
    if (!driver) return undefined;

    // 移动端用原生滚动：Lenis + 地址栏伸缩更容易造成 progress 抖动
    const useLenis = !reducedMotion && !isMobile;

    if (useLenis) {
      const lenis = new Lenis({
        duration: 1.05,
        smoothWheel: true,
        touchMultiplier: 1.2,
      });
      lenisRef.current = lenis;

      const raf = (time: number) => {
        lenis.raf(time * 1000);
      };
      rafRef.current = raf;

      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);
    }

    const trigger = ScrollTrigger.create({
      trigger: driver,
      start: 'top top',
      end: 'bottom bottom',
      // 轻微 scrub 平滑，避免 onUpdate 硬切
      scrub: isMobile ? 0.35 : 0.55,
      onUpdate: (self) => {
        setProgress(self.progress);
      },
    });

    // 初始化一次，避免首帧 progress 与 scroll 脱节
    setProgress(trigger.progress);

    let resizeTimer = 0;
    const refresh = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        ScrollTrigger.refresh();
      }, 120);
    };
    window.addEventListener('resize', refresh);

    return () => {
      window.removeEventListener('resize', refresh);
      window.clearTimeout(resizeTimer);
      trigger.kill();
      if (rafRef.current) {
        gsap.ticker.remove(rafRef.current);
      }
      lenisRef.current?.destroy();
      lenisRef.current = null;
    };
  }, [setProgress, reducedMotion, isMobile]);

  const driverVh = isMobile ? SCROLL_DRIVER_VH_MOBILE : SCROLL_DRIVER_VH;

  return (
    <>
      <div
        ref={driverRef}
        data-hero-scroll-driver
        className="relative"
        style={{ height: `${driverVh}vh` }}
        aria-hidden
      />
      <div
        className={`fixed inset-0 z-0 overflow-hidden pointer-events-none transition-opacity duration-500 ${
          hideScene ? 'opacity-0 invisible' : 'opacity-100 visible'
        }`}
      >
        {children}
      </div>
    </>
  );
}
