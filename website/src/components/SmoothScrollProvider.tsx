'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SCROLL_DRIVER_VH } from '@/lib/scroll-utils';
import { useScrollProgress } from '@/hooks/use-scroll-progress';

gsap.registerPlugin(ScrollTrigger);

interface SmoothScrollProviderProps {
  children: ReactNode;
  hideScene?: boolean;
}

export default function SmoothScrollProvider({ children, hideScene = false }: SmoothScrollProviderProps) {
  const driverRef = useRef<HTMLDivElement>(null);
  const { setProgress, reducedMotion } = useScrollProgress();
  const lenisRef = useRef<Lenis | null>(null);
  const rafRef = useRef<((time: number) => void) | null>(null);

  useEffect(() => {
    const driver = driverRef.current;
    if (!driver) return undefined;

    if (!reducedMotion) {
      const lenis = new Lenis({
        duration: 1.15,
        smoothWheel: true,
        touchMultiplier: 1.4,
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
      scrub: true,
      onUpdate: (self) => {
        setProgress(self.progress);
      },
    });

    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('resize', refresh);

    return () => {
      window.removeEventListener('resize', refresh);
      trigger.kill();
      if (rafRef.current) {
        gsap.ticker.remove(rafRef.current);
      }
      lenisRef.current?.destroy();
      lenisRef.current = null;
    };
  }, [setProgress, reducedMotion]);

  return (
    <>
      <div
        ref={driverRef}
        data-hero-scroll-driver
        className="relative"
        style={{ height: `${SCROLL_DRIVER_VH}vh` }}
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
