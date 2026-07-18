'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { BellRing, ShieldCheck, Zap } from 'lucide-react';
import PhoneAppScreen, { type PhoneDemoScreen } from '@/components/phone-app/PhoneAppScreen';
import {
  HERO_PHONE_CAPTIONS,
  HERO_PHONE_SEQUENCE,
} from '@/data/home-content';

const ROTATE_MS = 3200;

export default function Phone3D() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const target = useRef({ rx: 0, ry: 0 });
  const current = useRef({ rx: 0, ry: 0 });

  const screens = HERO_PHONE_SEQUENCE;
  const activeScreen = screens[active] as PhoneDemoScreen;

  useEffect(() => {
    if (paused || reduced) return undefined;
    const t = setInterval(() => setActive((a) => (a + 1) % screens.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [paused, reduced, screens.length]);

  useEffect(() => {
    if (reduced) return undefined;
    let raf = 0;
    const tick = () => {
      current.current.rx += (target.current.rx - current.current.rx) * 0.09;
      current.current.ry += (target.current.ry - current.current.ry) * 0.09;
      if (phoneRef.current) {
        phoneRef.current.style.transform = `rotateX(${current.current.rx}deg) rotateY(${current.current.ry}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const el = wrapRef.current;
    if (!el) {
      cancelAnimationFrame(raf);
      return undefined;
    }
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - (r.left + r.width / 2)) / r.width;
      const py = (e.clientY - (r.top + r.height / 2)) / r.height;
      target.current.ry = px * 14;
      target.current.rx = -py * 10;
    };
    const onLeave = () => {
      target.current.rx = 0;
      target.current.ry = 0;
    };
    window.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [reduced]);

  return (
    <div ref={wrapRef} className="phone-scene relative mx-auto w-fit select-none">
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2">
        <div className="animate-spin-slower absolute inset-0 rounded-full border border-dashed border-cyan-400/15" />
        <div className="animate-spin-slower-rev absolute inset-10 rounded-full border border-violet-400/10" />
        <div className="absolute inset-24 rounded-full bg-cyan-400/[0.05] blur-2xl" />
        <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/15 blur-[70px]" />
      </div>

      <div className="pointer-events-none absolute -bottom-14 left-1/2 h-16 w-[75%] -translate-x-1/2 rounded-[100%] bg-cyan-400/20 blur-2xl" />

      <div ref={phoneRef} className="phone-3d relative">
        <div
          className="animate-float-slow relative h-[560px] w-[272px] rounded-[2.75rem] bg-gradient-to-b from-slate-700/80 via-slate-800 to-slate-900 p-[3px] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8),0_0_60px_-20px_rgba(34,211,238,0.35)]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[2.6rem] bg-[#0f172a]">
            <div className="absolute left-1/2 top-2.5 z-20 h-[22px] w-[96px] -translate-x-1/2 rounded-full bg-black shadow-inner" />
            <div className="z-10 flex items-center justify-between bg-[#f0f4f8] px-6 pb-1 pt-3 text-[9px] font-medium text-slate-600">
              <span className="tabular-nums">09:41</span>
              <div className="flex items-center gap-1">
                <span className="inline-block h-1.5 w-3 rounded-[2px] bg-slate-500/70" />
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-500/70" />
                <span className="inline-block h-2 w-4 rounded-[3px] border border-slate-500/60 p-px">
                  <span className="block h-full w-3/4 rounded-[1.5px] bg-emerald-500" />
                </span>
              </div>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden bg-[#f0f4f8]">
              <div key={activeScreen} className="animate-screen-in h-full">
                <PhoneAppScreen screenFrom={activeScreen} screenTo={activeScreen} blend={1} />
              </div>
            </div>
          </div>
          <div className="absolute -right-[2px] top-28 h-14 w-[3px] rounded-r-md bg-slate-600" />
          <div className="absolute -left-[2px] top-24 h-8 w-[3px] rounded-l-md bg-slate-600" />
          <div className="absolute -left-[2px] top-36 h-8 w-[3px] rounded-l-md bg-slate-600" />
        </div>

        <div
          className="animate-float absolute -left-28 top-16 hidden md:block"
          style={{ transform: 'translateZ(70px)' }}
        >
          <div className="kimi-glass flex items-center gap-2 rounded-xl px-3 py-2 shadow-lg shadow-black/40">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-400/15">
              <Zap className="h-3.5 w-3.5 text-cyan-300" />
            </span>
            <div>
              <p className="text-[10px] font-medium text-white">电费余额 ¥23.6</p>
              <p className="text-[8.5px] text-white/40">东苑 12栋 · 312</p>
            </div>
          </div>
        </div>
        <div
          className="animate-float-delay absolute -right-24 top-40 hidden md:block"
          style={{ transform: 'translateZ(50px)' }}
        >
          <div className="kimi-glass flex items-center gap-2 rounded-xl px-3 py-2 shadow-lg shadow-black/40">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-400/15">
              <BellRing className="h-3.5 w-3.5 text-violet-300" />
            </span>
            <div>
              <p className="text-[10px] font-medium text-white">考试安排已更新</p>
              <p className="text-[8.5px] text-white/40">10 分钟前</p>
            </div>
          </div>
        </div>
        <div
          className="animate-float absolute -bottom-4 -left-20 hidden md:block"
          style={{ transform: 'translateZ(90px)' }}
        >
          <div className="kimi-glass flex items-center gap-2 rounded-xl px-3 py-2 shadow-lg shadow-black/40">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/15">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
            </span>
            <div>
              <p className="text-[10px] font-medium text-white">数据本地存储</p>
              <p className="text-[8.5px] text-white/40">隐私安全</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        <p key={active} className="animate-screen-in text-sm font-medium text-white/70">
          {HERO_PHONE_CAPTIONS[activeScreen]}
        </p>
        <div className="flex items-center gap-1.5" role="tablist" aria-label="App 界面切换">
          {screens.map((key, i) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={HERO_PHONE_CAPTIONS[key]}
              onClick={() => setActive(i)}
              className={`h-1.5 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                i === active ? 'w-5 bg-cyan-400' : 'w-1.5 bg-white/20 hover:bg-white/40'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
