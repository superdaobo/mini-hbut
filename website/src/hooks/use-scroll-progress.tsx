'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { sampleScroll, type ScrollSample } from '@/lib/scroll-utils';

interface ScrollProgressContextValue {
  progress: number;
  sample: ScrollSample;
  pointer: { x: number; y: number };
  reducedMotion: boolean;
  isMobile: boolean;
  setProgress: (value: number) => void;
}

const defaultSample = sampleScroll(0);

const ScrollProgressContext = createContext<ScrollProgressContextValue>({
  progress: 0,
  sample: defaultSample,
  pointer: { x: 0, y: 0 },
  reducedMotion: false,
  isMobile: false,
  setProgress: () => undefined,
});

export function ScrollProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgressState] = useState(0);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobileMedia = window.matchMedia('(max-width: 768px)');
    const updateMotion = () => setReducedMotion(media.matches);
    const updateMobile = () => setIsMobile(mobileMedia.matches);
    updateMotion();
    updateMobile();
    media.addEventListener('change', updateMotion);
    mobileMedia.addEventListener('change', updateMobile);
    return () => {
      media.removeEventListener('change', updateMotion);
      mobileMedia.removeEventListener('change', updateMobile);
    };
  }, []);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = (event.clientY / window.innerHeight) * 2 - 1;
      setPointer({ x, y });
    };
    window.addEventListener('pointermove', handleMove, { passive: true });
    return () => window.removeEventListener('pointermove', handleMove);
  }, []);

  const setProgress = useCallback((value: number) => {
    setProgressState(Math.min(1, Math.max(0, value)));
  }, []);

  const sample = useMemo(() => sampleScroll(progress), [progress]);

  const value = useMemo(
    () => ({ progress, sample, pointer, reducedMotion, isMobile, setProgress }),
    [progress, sample, pointer, reducedMotion, isMobile, setProgress],
  );

  return (
    <ScrollProgressContext.Provider value={value}>
      {children}
    </ScrollProgressContext.Provider>
  );
}

export function useScrollProgress() {
  return useContext(ScrollProgressContext);
}
