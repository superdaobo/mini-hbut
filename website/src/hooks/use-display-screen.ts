'use client';

import { useEffect, useState } from 'react';
import type { AppScreen } from '@/lib/scroll-utils';
import { useScrollProgress } from '@/hooks/use-scroll-progress';
import { subscribeIdleDemoScreen } from '@/hooks/use-idle-hero-demo';

/**
 * 手机预览屏选择：
 * - 滚动进度较低且 idle 轮播激活时 → idle 演示屏
 * - 用户已滚动 → 严格跟随 sample 的 screen 序列
 */
export function useDisplayScreen() {
  const { sample, progress } = useScrollProgress();
  const [idleScreen, setIdleScreen] = useState<AppScreen | null>(null);

  useEffect(() => subscribeIdleDemoScreen(setIdleScreen), []);

  const useIdle = progress < 0.06 && idleScreen != null;

  if (useIdle) {
    return {
      screenFrom: idleScreen,
      screenTo: idleScreen,
      screenBlend: 0,
      activeScreen: idleScreen,
      isIdleDemo: true,
    };
  }

  return {
    screenFrom: sample.screenFrom,
    screenTo: sample.screenTo,
    screenBlend: sample.screenBlend,
    activeScreen: sample.activeScreen,
    isIdleDemo: false,
  };
}
