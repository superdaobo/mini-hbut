'use client';

import { useEffect, useRef, useState } from 'react';
import {
  motion,
  useMotionTemplate,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { ArrowDownToLine, Github, MousePointer2 } from 'lucide-react';
import ParticleBackground from '@/components/ParticleBackground';
import PhoneAppScreen, { type PhoneDemoScreen } from '@/components/phone-app/PhoneAppScreen';
import { GITHUB_URL, SHOWCASE_STAGES } from '@/data/home-content';

const META = SHOWCASE_STAGES;
const N = META.length;

/** 运镜关键帧：每个舞台的相机位 */
const CAMS = [
  { ry: -8, rx: 4, s: 0.88, x: 96, y: 0 },
  { ry: -27, rx: 5, s: 1.0, x: -116, y: 0 },
  { ry: 25, rx: -3, s: 1.02, x: 116, y: 8 },
  { ry: -15, rx: 9, s: 1.1, x: -104, y: -6 },
  { ry: 27, rx: 3, s: 0.98, x: 116, y: 6 },
  { ry: -25, rx: 11, s: 1.06, x: -116, y: -10 },
  { ry: 15, rx: -5, s: 1.0, x: 116, y: 0 },
  { ry: 0, rx: 0, s: 0.94, x: 0, y: 0 },
];

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const fn = () => setM(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return m;
}

function StageScreen({
  index,
  master,
  screen,
}: {
  index: number;
  master: MotionValue<number>;
  screen: PhoneDemoScreen;
}) {
  const seg = 1 / (N - 1);
  const c = index * seg;
  const first = index === 0;
  const last = index === N - 1;

  const opacity = useTransform(
    master,
    first
      ? [0, seg * 0.28, seg * 0.62]
      : last
        ? [1 - seg * 0.62, 1 - seg * 0.28, 1]
        : [c - seg * 0.62, c - seg * 0.28, c + seg * 0.28, c + seg * 0.62],
    first ? [1, 1, 0] : last ? [0, 1, 1] : [0, 1, 1, 0],
    { clamp: true },
  );

  return (
    <motion.div className="absolute inset-0 overflow-hidden" style={{ opacity }} aria-hidden>
      <PhoneAppScreen screenFrom={screen} screenTo={screen} blend={1} />
    </motion.div>
  );
}

function StageCaption({
  index,
  master,
  active,
  isMobile,
}: {
  index: number;
  master: MotionValue<number>;
  active: number;
  isMobile: boolean;
}) {
  const meta = META[index];
  const seg = 1 / (N - 1);
  const c = index * seg;
  const first = index === 0;
  const last = index === N - 1;

  const opacity = useTransform(
    master,
    first
      ? [0, seg * 0.3, seg * 0.6]
      : last
        ? [1 - seg * 0.6, 1 - seg * 0.26, 1]
        : [c - seg * 0.6, c - seg * 0.26, c + seg * 0.26, c + seg * 0.6],
    first ? [1, 1, 0] : last ? [0, 1, 1] : [0, 1, 1, 0],
    { clamp: true },
  );
  const y = useTransform(
    master,
    first ? [0, seg * 0.2] : [c - seg * 0.55, c - seg * 0.18],
    [26, 0],
    { clamp: true },
  );

  const pos = isMobile
    ? 'absolute inset-x-5 bottom-[5.5%] text-center'
    : meta.side === 'left'
      ? 'absolute left-[7%] top-1/2 max-w-sm -translate-y-1/2 text-left'
      : meta.side === 'right'
        ? 'absolute right-[7%] top-1/2 max-w-sm -translate-y-1/2 text-left'
        : 'absolute inset-x-0 bottom-[7%] mx-auto max-w-xl px-5 text-center';

  return (
    <motion.div
      className={`${pos} z-20`}
      style={{ opacity, y, pointerEvents: active === index ? 'auto' : 'none' }}
      aria-hidden={active !== index}
    >
      <p
        className="mb-2 flex items-center gap-2 text-xs font-medium tracking-[0.2em] text-cyan-300/80"
        style={{
          justifyContent: isMobile || meta.side === 'center' ? 'center' : 'flex-start',
        }}
      >
        <span className="inline-block h-px w-6 bg-cyan-400/50" />
        {String(index + 1).padStart(2, '0')} · {meta.tag}
      </p>
      <h3 className="text-2xl font-bold tracking-tight text-white md:text-[2rem] md:leading-snug">
        {meta.title}
      </h3>
      <p className="mt-2.5 text-sm leading-relaxed text-white/55">{meta.desc}</p>
      {meta.side === 'center' && (
        <div className="mt-5 flex items-center justify-center gap-3">
          <a
            href="#download"
            className="btn-shine flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-sky-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-[0_10px_36px_-8px_rgba(34,211,238,0.55)] transition-transform hover:scale-[1.04] active:scale-95"
          >
            <ArrowDownToLine className="h-4 w-4" /> 免费下载
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-5 py-3 text-sm text-white/80 backdrop-blur transition-all hover:border-white/30 hover:text-white"
          >
            <Github className="h-4 w-4" /> GitHub
          </a>
        </div>
      )}
    </motion.div>
  );
}

function ShowcaseScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const smooth = useSpring(scrollYProgress, { stiffness: 58, damping: 17, mass: 0.6 });

  const [active, setActive] = useState(0);
  useMotionValueEvent(smooth, 'change', (v) => {
    const i = Math.min(N - 1, Math.max(0, Math.round(v * (N - 1))));
    setActive((prev) => (prev === i ? prev : i));
  });

  const cams = isMobile ? CAMS.map((c) => ({ ...c, x: 0, y: -40, s: c.s * 0.78 })) : CAMS;
  const input = META.map((_, i) => i / (N - 1));
  const ry = useTransform(smooth, input, cams.map((c) => c.ry));
  const rx = useTransform(smooth, input, cams.map((c) => c.rx));
  const sc = useTransform(smooth, input, cams.map((c) => c.s));
  const tx = useTransform(smooth, input, cams.map((c) => c.x));
  const ty = useTransform(smooth, input, cams.map((c) => c.y));
  const transform = useMotionTemplate`scale(${sc}) translate3d(${tx}px, ${ty}px, 0) rotateX(${rx}deg) rotateY(${ry}deg)`;
  const glowOpacity = useTransform(smooth, [0.82, 1], [0, 1], { clamp: true });

  const scrollToStage = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const total = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: el.offsetTop + (i / (N - 1)) * total, behavior: 'smooth' });
  };
  const skip = () => document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <section
      ref={ref}
      className="relative"
      style={{ height: `${N * 100}vh` }}
      aria-label="App 功能滚动演示"
    >
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0f1a] via-[#050a14] to-[#0a0f1a]" />
          <div className="aurora-blob left-[-8%] top-[5%] h-[420px] w-[420px] bg-cyan-500/[0.09]" />
          <div
            className="aurora-blob right-[-6%] bottom-[0%] h-[380px] w-[380px] bg-violet-500/[0.08]"
            style={{ animationDelay: '-9s' }}
          />
          <div className="bg-grid absolute inset-0 opacity-70" />
          <ParticleBackground />
        </div>

        <div className="absolute left-1/2 top-[4.5%] z-20 -translate-x-1/2 text-center">
          <p className="text-[11px] font-medium tracking-[0.3em] text-white/30">APP TOUR</p>
          <p className="mt-1 text-sm text-white/50">滚动，体验真实 App 界面</p>
        </div>

        <div className="phone-scene z-10">
          <motion.div style={{ transform }} className="phone-3d relative">
            <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[540px] w-[540px] -translate-x-1/2 -translate-y-1/2">
              <div className="animate-spin-slower absolute inset-0 rounded-full border border-dashed border-cyan-400/15" />
              <div className="animate-spin-slower-rev absolute inset-12 rounded-full border border-violet-400/10" />
              <div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/12 blur-[70px]" />
            </div>
            <motion.div
              style={{ opacity: glowOpacity }}
              className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/[0.13] blur-[80px]"
            />

            <div className="relative h-[560px] w-[272px] rounded-[2.75rem] bg-gradient-to-b from-slate-700/80 via-slate-800 to-slate-900 p-[3px] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8),0_0_60px_-20px_rgba(34,211,238,0.3)]">
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
                  {META.map((m, i) => (
                    <StageScreen
                      key={m.tag}
                      index={i}
                      master={smooth}
                      screen={m.screen as PhoneDemoScreen}
                    />
                  ))}
                </div>
              </div>
              <div className="absolute -right-[2px] top-28 h-14 w-[3px] rounded-r-md bg-slate-600" />
              <div className="absolute -left-[2px] top-24 h-8 w-[3px] rounded-l-md bg-slate-600" />
              <div className="absolute -left-[2px] top-36 h-8 w-[3px] rounded-l-md bg-slate-600" />
            </div>
          </motion.div>
        </div>

        {META.map((_, i) => (
          <StageCaption key={i} index={i} master={smooth} active={active} isMobile={isMobile} />
        ))}

        <div className="absolute left-6 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-2.5 lg:flex">
          {META.map((m, i) => (
            <button
              key={m.tag}
              type="button"
              onClick={() => scrollToStage(i)}
              className="group flex items-center gap-2.5 text-left focus-visible:outline-none"
              aria-label={`跳到 ${m.tag}`}
            >
              <span
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === active ? 'w-6 bg-cyan-400' : 'w-1.5 bg-white/20 group-hover:bg-white/45'
                }`}
              />
              <span
                className={`text-[11px] transition-all duration-300 ${
                  i === active ? 'text-white/90' : 'text-white/30 group-hover:text-white/60'
                }`}
              >
                {m.tag}
              </span>
            </button>
          ))}
        </div>

        <div className="absolute right-6 top-[4.5%] z-20 text-right">
          <p className="text-2xl font-bold tabular-nums text-white/85">
            {String(active + 1).padStart(2, '0')}
            <span className="text-sm font-normal text-white/30">
              {' '}
              / {String(N).padStart(2, '0')}
            </span>
          </p>
          <button
            type="button"
            onClick={skip}
            className="mt-1 text-[11px] text-white/35 underline-offset-4 transition-colors hover:text-cyan-300 hover:underline"
          >
            跳过演示 ↓
          </button>
        </div>

        <div className="absolute bottom-0 left-1/2 z-20 h-[3px] w-full -translate-x-1/2 bg-white/[0.06]">
          <motion.div
            className="h-full origin-left bg-gradient-to-r from-cyan-400 to-sky-400"
            style={{ scaleX: smooth }}
          />
        </div>
        <div
          className={`absolute bottom-[4%] left-1/2 z-20 -translate-x-1/2 items-center gap-2 text-white/35 transition-opacity duration-500 ${
            active === 0 ? 'flex' : 'hidden'
          } ${isMobile ? 'hidden' : ''}`}
        >
          <MousePointer2 className="h-3.5 w-3.5" />
          <span className="text-[11px]">继续滚动</span>
        </div>
      </div>
    </section>
  );
}

function ShowcaseFallback() {
  return (
    <section className="relative py-24" aria-label="App 功能展示">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium tracking-widest text-cyan-300/80">App 界面</p>
          <h2 className="mt-3 text-3xl font-bold text-white">每一个界面，都为校园而生</h2>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {META.map((m) => (
            <div key={m.tag} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
              <div className="mx-auto h-[300px] w-[204px] overflow-hidden rounded-[1.5rem] border border-slate-700/50 bg-[#f0f4f8]">
                <PhoneAppScreen
                  screenFrom={m.screen as PhoneDemoScreen}
                  screenTo={m.screen as PhoneDemoScreen}
                  blend={1}
                />
              </div>
              <p className="mt-3 text-center text-sm font-semibold text-white">{m.title}</p>
              <p className="mt-1 text-center text-xs leading-relaxed text-white/45">{m.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function ScrollShowcase() {
  const reduced = useReducedMotion();
  if (reduced) return <ShowcaseFallback />;
  return <ShowcaseScroll />;
}
