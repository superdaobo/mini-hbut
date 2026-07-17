'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Download, Sparkles } from 'lucide-react';
import { useScrollProgress } from '@/hooks/use-scroll-progress';
import { useDisplayScreen } from '@/hooks/use-display-screen';
import { SCREEN_CAPTIONS } from '@/lib/screen-captions';

const FEATURE_CHIPS = [
  { id: 'schedule', label: '课表', color: '#818cf8' },
  { id: 'grades', label: '成绩', color: '#a78bfa' },
  { id: 'exams', label: '考试', color: '#f472b6' },
  { id: 'notify', label: '通知', color: '#34d399' },
  { id: 'electricity', label: '电费', color: '#fbbf24' },
  { id: 'classroom', label: '空教室', color: '#fb923c' },
] as const;

/**
 * 左栏营销文案：
 * - 桌面：固定左栏，不与中/右重叠
 * - 移动：顶部紧凑文案，手机在中部独立展示
 */
export default function HeroText() {
  const { sample, reducedMotion, isMobile } = useScrollProgress();
  const display = useDisplayScreen();
  const opacity = isMobile ? Math.max(0.75, sample.heroOpacity) : sample.heroOpacity;
  const caption = SCREEN_CAPTIONS[display.activeScreen] ?? SCREEN_CAPTIONS.home;

  // 不用 return null：卸载/挂载会造成整层闪一下
  const hidden = opacity <= 0.02;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[25]"
      style={{
        opacity: hidden ? 0 : opacity,
        visibility: hidden ? 'hidden' : 'visible',
        transition: reducedMotion ? undefined : 'opacity 0.35s ease-out',
      }}
    >
      <div
        className={
          isMobile
            ? 'pointer-events-auto absolute inset-x-0 top-0 flex flex-col px-4 pb-2 pt-[4.75rem]'
            : 'pointer-events-auto absolute inset-y-0 left-0 flex w-full max-w-full flex-col justify-center px-5 pb-16 pt-24 md:px-8 lg:w-[min(32vw,380px)] lg:px-8 xl:w-[min(30vw,400px)] xl:px-10'
        }
      >
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mb-2.5 inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-medium tracking-wide text-cyan-200 sm:mb-4 sm:px-3 sm:text-[11px]">
            <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            Mini-HBUT · 校园信息聚合客户端
          </div>

          <h1
            className={
              isMobile
                ? 'bg-gradient-to-br from-white via-cyan-50 to-violet-200 bg-clip-text text-[1.65rem] font-semibold leading-[1.18] text-transparent'
                : 'bg-gradient-to-br from-white via-cyan-50 to-violet-200 bg-clip-text text-3xl font-semibold leading-[1.14] text-transparent sm:text-4xl lg:text-[2.55rem] xl:text-[2.75rem]'
            }
          >
            一个入口，
            {isMobile ? ' ' : <br />}
            看清整个校园日程。
          </h1>

          <p
            className={
              isMobile
                ? 'mt-2 max-w-md text-[12px] leading-5 text-white/65'
                : 'mt-4 max-w-sm text-sm leading-7 text-white/65'
            }
          >
            {isMobile
              ? '课表、成绩、考试、电费——下滑体验真实 App 界面。'
              : '课表、成绩、考试、通知、电费与空教室——在真实 App 界面里滚动体验，而不是看一张静态截图。'}
          </p>

          {!isMobile && (
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
                  <span
                    className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: chip.color }}
                  />
                  {chip.label}
                </motion.span>
              ))}
            </div>
          )}

          <div className={`flex flex-wrap items-center gap-2.5 ${isMobile ? 'mt-3' : 'mt-7 gap-3'}`}>
            <a
              href="#download"
              className={`group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 font-semibold text-slate-950 shadow-[0_0_32px_rgba(34,211,238,0.35)] transition hover:brightness-110 ${
                isMobile ? 'px-4 py-2 text-xs' : 'px-5 py-2.5 text-sm'
              }`}
            >
              <Download className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
              免费下载
              <ArrowRight className={`transition group-hover:translate-x-0.5 ${isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
            </a>
            <Link
              href="/docs"
              className={`inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 font-medium text-white/85 backdrop-blur-sm transition hover:border-cyan-400/40 hover:text-white ${
                isMobile ? 'px-4 py-2 text-xs' : 'px-5 py-2.5 text-sm'
              }`}
            >
              查看文档
            </Link>
          </div>

          {!isMobile && (
            <div
              key={display.activeScreen}
              className="mt-8 hidden max-w-sm rounded-2xl border border-white/10 bg-black/45 p-3.5 shadow-[0_16px_48px_rgba(0,0,0,0.4)] backdrop-blur-md lg:block"
            >
              <div className="mb-1.5 flex items-center gap-2">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-slate-950"
                  style={{ background: caption.accent }}
                >
                  {caption.label}
                </span>
                <span className="text-[10px] text-white/40">界面预览</span>
              </div>
              <h2 className="text-sm font-semibold text-white">{caption.title}</h2>
              <p className="mt-1 text-xs leading-5 text-white/60">{caption.blurb}</p>
            </div>
          )}

          <p className={`text-[11px] text-white/40 ${isMobile ? 'mt-2' : 'mt-5 lg:mt-4'}`}>
            {isMobile ? '向下滑动 · 查看功能演示' : '向下滚动 · 3D 运镜与功能演示'}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
