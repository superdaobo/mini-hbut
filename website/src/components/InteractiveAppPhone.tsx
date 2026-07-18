'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { BellRing, MousePointer2, ShieldCheck, Zap } from 'lucide-react';
import { withBasePath } from '@/lib/base-path';

/**
 * Hero 右侧可交互手机：iframe 嵌入 `public/app-demo`（Vue 客户端 + 演示 fixtures）。
 * 不再自动轮播 mock 屏；用户可像真实软件一样点击底栏与模块。
 */
export default function InteractiveAppPhone() {
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const target = useRef({ rx: 0, ry: 0 });
  const current = useRef({ rx: 0, ry: 0 });
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const demoSrc = useMemo(() => {
    // Next trailingSlash:false 下 /app-demo/ 可能 404，显式 index.html 更稳
    // Vite base:'./' → assets 相对 /app-demo/ 解析
    return withBasePath('/app-demo/index.html');
  }, []);

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
      // 指针在机身内时归零 3D，保证 iframe 点击命中与真实软件一致
      const phone = phoneRef.current?.getBoundingClientRect();
      if (
        phone &&
        e.clientX >= phone.left &&
        e.clientX <= phone.right &&
        e.clientY >= phone.top &&
        e.clientY <= phone.bottom
      ) {
        target.current.rx = 0;
        target.current.ry = 0;
        return;
      }
      const r = el.getBoundingClientRect();
      const px = (e.clientX - (r.left + r.width / 2)) / r.width;
      const py = (e.clientY - (r.top + r.height / 2)) / r.height;
      target.current.ry = px * 10;
      target.current.rx = -py * 8;
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
        <div className="animate-float-slow relative h-[560px] w-[272px] rounded-[2.75rem] bg-gradient-to-b from-slate-700/80 via-slate-800 to-slate-900 p-[3px] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8),0_0_60px_-20px_rgba(34,211,238,0.35)]">
          <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[2.6rem] bg-[#0f172a]">
            <div className="pointer-events-none absolute left-1/2 top-2.5 z-20 h-[22px] w-[96px] -translate-x-1/2 rounded-full bg-black shadow-inner" />
            <div className="pointer-events-none z-10 flex items-center justify-between bg-[#f0f4f8] px-6 pb-1 pt-3 text-[9px] font-medium text-slate-600">
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
              {!loaded && !failed && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#f0f4f8] text-[11px] text-slate-500">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-500" />
                  加载可交互演示…
                </div>
              )}
              {failed && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#f0f4f8] px-4 text-center text-[11px] text-slate-500">
                  <p>演示包未就绪</p>
                  <p className="text-[10px] text-slate-400">请运行 npm run build:website-demo</p>
                </div>
              )}
              <iframe
                title="Mini-HBUT 可交互演示（离线预设数据）"
                src={demoSrc}
                className="h-full w-full border-0 bg-[#f0f4f8]"
                // 演示不联网；sandbox 允许同源脚本与同窗导航
                sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups-to-escape-sandbox"
                loading="eager"
                referrerPolicy="no-referrer"
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
              />
            </div>
          </div>
          <div className="pointer-events-none absolute -right-[2px] top-28 h-14 w-[3px] rounded-r-md bg-slate-600" />
          <div className="pointer-events-none absolute -left-[2px] top-24 h-8 w-[3px] rounded-l-md bg-slate-600" />
          <div className="pointer-events-none absolute -left-[2px] top-36 h-8 w-[3px] rounded-l-md bg-slate-600" />
        </div>

        <div
          className="animate-float pointer-events-none absolute -left-28 top-16 hidden md:block"
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
          className="animate-float-delay pointer-events-none absolute -right-24 top-40 hidden md:block"
          style={{ transform: 'translateZ(50px)' }}
        >
          <div className="kimi-glass flex items-center gap-2 rounded-xl px-3 py-2 shadow-lg shadow-black/40">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-400/15">
              <BellRing className="h-3.5 w-3.5 text-violet-300" />
            </span>
            <div>
              <p className="text-[10px] font-medium text-white">考试安排已更新</p>
              <p className="text-[8.5px] text-white/40">演示数据</p>
            </div>
          </div>
        </div>
        <div
          className="animate-float pointer-events-none absolute -bottom-4 -left-20 hidden md:block"
          style={{ transform: 'translateZ(90px)' }}
        >
          <div className="kimi-glass flex items-center gap-2 rounded-xl px-3 py-2 shadow-lg shadow-black/40">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/15">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
            </span>
            <div>
              <p className="text-[10px] font-medium text-white">离线预设数据</p>
              <p className="text-[8.5px] text-white/40">可点击操作</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-white/70">
          <MousePointer2 className="h-3.5 w-3.5 text-cyan-300/90" />
          可点击操作 · 与客户端同一套界面
        </p>
        <p className="text-[11px] text-white/35">演示账号预设数据 · 不发起真实教务请求</p>
      </div>
    </div>
  );
}
