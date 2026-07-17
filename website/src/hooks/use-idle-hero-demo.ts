'use client';

import { useEffect, useRef } from 'react';
import type { AppScreen } from '@/lib/scroll-utils';
import { PHONE_SCREEN_SEQUENCE_FOR_DEMO } from '@/lib/scroll-utils';

export type IdleDemoListener = (screen: AppScreen | null) => void;

/**
 * 模块级 idle 演示：只切换手机「界面预览」屏，**绝不**改写 scroll progress。
 * 旧实现每帧 setProgress 与 ScrollTrigger 互抢，导致主页闪烁/乱跳。
 */
const listeners = new Set<IdleDemoListener>();
let currentDemoScreen: AppScreen | null = null;

export function subscribeIdleDemoScreen(listener: IdleDemoListener) {
  listeners.add(listener);
  listener(currentDemoScreen);
  return () => {
    listeners.delete(listener);
  };
}

export function getIdleDemoScreen() {
  return currentDemoScreen;
}

function publish(screen: AppScreen | null) {
  currentDemoScreen = screen;
  listeners.forEach((fn) => fn(screen));
}

/**
 * 用户未滚动时，缓慢轮播手机内 UI 预览屏。
 * - 不调用 setProgress / 不驱动镜头关键帧
 * - 用户一滚动即停止，之后完全跟随真实滚动进度
 */
export function useIdleHeroDemo(enabled: boolean, reducedMotion: boolean) {
  const userTouched = useRef(false);
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || reducedMotion) {
      publish(null);
      return undefined;
    }

    userTouched.current = false;
    started.current = false;

    const markTouched = () => {
      if (userTouched.current) return;
      userTouched.current = true;
      publish(null);
    };

    // 真实滚动即停；忽略 1px 级噪声用 scrollY 阈值
    let lastY = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - lastY) > 4) {
        markTouched();
      }
      lastY = window.scrollY;
    };

    window.addEventListener('wheel', markTouched, { passive: true });
    window.addEventListener('touchmove', markTouched, { passive: true });
    window.addEventListener('keydown', markTouched);
    window.addEventListener('scroll', onScroll, { passive: true });

    const sequence = PHONE_SCREEN_SEQUENCE_FOR_DEMO;
    const HOLD_MS = 2800;
    const START_DELAY_MS = 2200;
    let index = 0;
    let timer = 0;

    const tick = () => {
      if (userTouched.current) return;
      publish(sequence[index % sequence.length]);
      index += 1;
      timer = window.setTimeout(tick, HOLD_MS);
    };

    const startTimer = window.setTimeout(() => {
      if (userTouched.current) return;
      started.current = true;
      tick();
    }, START_DELAY_MS);

    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(timer);
      window.removeEventListener('wheel', markTouched);
      window.removeEventListener('touchmove', markTouched);
      window.removeEventListener('keydown', markTouched);
      window.removeEventListener('scroll', onScroll);
      publish(null);
    };
  }, [enabled, reducedMotion]);
}
