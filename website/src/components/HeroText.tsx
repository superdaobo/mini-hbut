'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Download, Sparkles } from 'lucide-react';
import { useScrollProgress } from '@/hooks/use-scroll-progress';
import { SCREEN_CAPTIONS } from '@/lib/screen-captions';

const FEATURE_CHIPS = [
  { id: 'schedule', label: '课表', color: '#818cf8' },
  { id: 'grades', label: '成绩', color: '#a78bfa' },
  { id: 'exams', label: '考试', color: '#f472b6' },
  { id: 'notify', label: '通知', color: '#34d399' },
  { id: 'electricity', label: '电费', color: '#fbbf24' },
  { id: 'classroom', label: '空教室', color: '#fb923c' },
] as const;

export default function HeroText() {
  const { sample, reducedMotion } = useScrollProgress();
  const opacity = sample.heroOpacity;
  const caption = SCREEN_CAPTIONS[sample.activeScreen] ?? SCREEN_CAPTIONS.home;

  if (opacity <= 0.02) return null;

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-20"
      initial={false}
      animate={{ opacity }}
      transition={{ duration: reducedMotion ? 0 : 0.35, ease: 'easeOut' }}
    >
      <div className="mx-auto flex h-full max-w-7xl flex-col justify-center px-5 pb-16 pt-24 md:px-8 lg:flex-row lg:items-center lg:gap-8 lg:px-8 xl:px-10">
        {/* 左侧文案 — 限制宽度，右侧留给 3D 手机与浮卡 */}
        <div className="pointer-events-auto max-w-xl lg:w-[38%] lg:max-w-md xl:w-[40%]">
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[11px] font-medium tracking-wide text-cyan-200">
              <Sparkles className="h-3.5 w-3.5" />
              Mini-HBUT · 校园信息聚合客户端
            </div>

            <h1 className="bg-gradient-to-br from-white via-cyan-50 to-violet-200 bg-clip-text text-4xl font-semibold leading-[1.12] text-transparent sm:text-5xl md:text-[3.25rem]">
              一个入口，
              <br />
              看清整个校园日程。
            </h1>

            <p className="mt-4 max-w-md text-sm leading-7 text-white/65 sm:text-base">
              课表、成绩、考试、通知、电费与空教室——在真实 App 界面里滚动体验，而不是看一张静态截图。
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {FEATURE_CHIPS.map((chip, i) => (
                <motion.span
                  key={chip.id}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/80 backdrop-blur-sm"
                  style={{ boxShadow: `inset 0 0 0 1px ${chip.color}33` }}
                  initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 + i * 0.05, duration: 0.4 }}
                >
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: chip.color }} />
                  {chip.label}
                </motion.span>
              ))}
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a
                href="#download"
                className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_0_32px_rgba(34,211,238,0.35)] transition hover:brightness-110"
              >
                <Download className="h-4 w-4" />
                免费下载
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </a>
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white/85 backdrop-blur-sm transition hover:border-cyan-400/40 hover:text-white"
              >
                查看文档
              </Link>
            </div>

            <p className="mt-4 text-[11px] text-white/40">
              向下滚动 · 观看 3D 运镜与界面演示
            </p>
          </motion.div>
        </div>

        {/* 右侧字幕贴在文案列底部小条，避免与右栏浮卡争抢 */}
        <div className="pointer-events-none mt-6 max-w-md lg:absolute lg:bottom-[12vh] lg:left-8 lg:mt-0 lg:w-[min(360px,34vw)] xl:left-10">
          <motion.div
            key={sample.activeScreen}
            className="hidden rounded-2xl border border-white/10 bg-black/45 p-3.5 shadow-[0_16px_48px_rgba(0,0,0,0.4)] backdrop-blur-md lg:block"
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: Math.min(1, 0.4 + sample.phone.screenBrightness * 0.6), y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-slate-950"
                style={{ background: caption.accent }}
              >
                {caption.label}
              </span>
              <span className="text-[10px] text-white/40">App 界面预览</span>
            </div>
            <h2 className="text-base font-semibold text-white">{caption.title}</h2>
            <p className="mt-1 text-xs leading-5 text-white/60">{caption.blurb}</p>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
