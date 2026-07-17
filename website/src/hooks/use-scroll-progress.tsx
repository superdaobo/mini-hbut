'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { sampleScroll, type ScrollSample } from '@/lib/scroll-utils';

interface ScrollProgressContextValue {
  progress: number;
  sample: ScrollSample;
  pointer: { x: number; y: number };
  /** 高频读取（R3F useFrame），避免依赖每帧 React 重渲染 */
  progressRef: MutableRefObject<number>;
  sampleRef: MutableRefObject<ScrollSample>;
  pointerRef: MutableRefObject<{ x: number; y: number }>;
  reducedMotion: boolean;
  isMobile: boolean;
  /**
   * 仅应由 ScrollTrigger / 真实滚动写入。
   * 禁止 idle 演示改写 progress（会与滚动驱动互抢导致闪烁）。
   */
  setProgress: (value: number) => void;
}

const defaultSample = sampleScroll(0);

const ScrollProgressContext = createContext<ScrollProgressContextValue | null>(null);

/** 低于此变化不触发 React 状态更新 */
const REACT_PROGRESS_EPS = 0.0035;
/** 与当前 ref 几乎相同则完全忽略 */
const HARD_PROGRESS_EPS = 0.0004;

export function ScrollProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgressState] = useState(0);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  // 客户端首帧即按视口判断，避免 isMobile 从 false→true 时驱动区高度突变导致跳动
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false,
  );

  const progressRef = useRef(0);
  const sampleRef = useRef<ScrollSample>(defaultSample);
  const pointerRef = useRef({ x: 0, y: 0 });
  const reactRafRef = useRef(0);
  const lastReactProgress = useRef(0);
  const lastPointerReactAt = useRef(0);

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
      pointerRef.current = { x, y };

      // 指针仅低频同步到 React（3D 走 ref）
      const now = performance.now();
      if (now - lastPointerReactAt.current > 100) {
        lastPointerReactAt.current = now;
        setPointer({ x, y });
      }
    };
    window.addEventListener('pointermove', handleMove, { passive: true });
    return () => window.removeEventListener('pointermove', handleMove);
  }, []);

  useEffect(
    () => () => {
      if (reactRafRef.current) cancelAnimationFrame(reactRafRef.current);
    },
    [],
  );

  const setProgress = useCallback((value: number) => {
    const next = Math.min(1, Math.max(0, value));
    if (Math.abs(next - progressRef.current) < HARD_PROGRESS_EPS) return;

    progressRef.current = next;
    sampleRef.current = sampleScroll(next);

    // 合并到每帧最多一次 React 更新
    if (reactRafRef.current) return;
    reactRafRef.current = requestAnimationFrame(() => {
      reactRafRef.current = 0;
      const latest = progressRef.current;
      if (Math.abs(latest - lastReactProgress.current) < REACT_PROGRESS_EPS) return;
      lastReactProgress.current = latest;
      setProgressState(latest);
    });
  }, []);

  const sample = useMemo(() => sampleScroll(progress), [progress]);

  const value = useMemo(
    () => ({
      progress,
      sample,
      pointer,
      progressRef,
      sampleRef,
      pointerRef,
      reducedMotion,
      isMobile,
      setProgress,
    }),
    [progress, sample, pointer, reducedMotion, isMobile, setProgress],
  );

  return (
    <ScrollProgressContext.Provider value={value}>
      {children}
    </ScrollProgressContext.Provider>
  );
}

export function useScrollProgress() {
  const ctx = useContext(ScrollProgressContext);
  if (!ctx) {
    const progressRef = { current: 0 };
    const sampleRef = { current: defaultSample };
    const pointerRef = { current: { x: 0, y: 0 } };
    return {
      progress: 0,
      sample: defaultSample,
      pointer: { x: 0, y: 0 },
      progressRef,
      sampleRef,
      pointerRef,
      reducedMotion: false,
      isMobile: false,
      setProgress: () => undefined,
    } satisfies ScrollProgressContextValue;
  }
  return ctx;
}
