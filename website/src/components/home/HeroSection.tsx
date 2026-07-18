'use client';

import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { BookOpenText, ChevronDown, Download, Github, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRef } from 'react';
import ParticleBackground from '@/components/ParticleBackground';
import Phone3D from '@/components/Phone3D';
import {
  CHIPS,
  EYEBROW,
  GITHUB_URL,
  H1_A,
  H1_B,
  SUB,
  TRUST_ITEMS,
} from '@/data/home-content';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.12 * i, duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function HeroSection() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const yCopy = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : -70]);
  const yPhone = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : 60]);
  const opacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  return (
    <section ref={ref} id="top" className="relative overflow-hidden pb-20 pt-28 md:pt-32">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-[#03060d] via-[#060b16] to-[#0a0f1a]" />
        <div className="aurora-blob left-[-10%] top-[-15%] h-[480px] w-[480px] bg-cyan-500/[0.13]" />
        <div
          className="aurora-blob right-[-8%] top-[10%] h-[420px] w-[420px] bg-sky-600/[0.11]"
          style={{ animationDelay: '-6s' }}
        />
        <div
          className="aurora-blob bottom-[-20%] left-[30%] h-[420px] w-[420px] bg-violet-500/[0.08]"
          style={{ animationDelay: '-12s' }}
        />
        <div className="bg-grid absolute inset-0" />
        <ParticleBackground />
      </div>

      <motion.div style={{ opacity }} className="mx-auto max-w-6xl px-5">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6">
          <motion.div style={{ y: yCopy }} className="text-center lg:text-left">
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}>
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/[0.07] px-3.5 py-1.5 text-xs text-cyan-200/90">
                <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
                {EYEBROW}
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              initial="hidden"
              animate="show"
              custom={1}
              className="mt-6 text-4xl font-bold leading-[1.15] tracking-tight text-white sm:text-5xl xl:text-[3.4rem]"
            >
              {H1_A}
              <br />
              <span className="text-gradient">{H1_B}</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              initial="hidden"
              animate="show"
              custom={2}
              className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-white/55 lg:mx-0"
            >
              {SUB}
            </motion.p>

            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="show"
              custom={3}
              className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start"
            >
              {CHIPS.map((c) => (
                <span
                  key={c}
                  className="cursor-default rounded-full border border-white/[0.09] bg-white/[0.04] px-3 py-1.5 text-xs text-white/65 transition-all hover:border-cyan-400/35 hover:bg-cyan-400/10 hover:text-cyan-200"
                >
                  {c}
                </span>
              ))}
            </motion.div>

            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="show"
              custom={4}
              className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
            >
              <a
                href="#download"
                className="btn-shine group flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-sky-400 px-6 py-3 text-[15px] font-semibold text-slate-950 shadow-[0_10px_36px_-8px_rgba(34,211,238,0.55)] transition-all hover:scale-[1.04] hover:shadow-[0_14px_44px_-8px_rgba(34,211,238,0.7)] active:scale-95"
              >
                <Download className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
                免费下载
              </a>
              <Link
                href="/docs"
                className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-6 py-3 text-[15px] font-medium text-white/80 backdrop-blur transition-all hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
              >
                <BookOpenText className="h-4 w-4" />
                查看文档
              </Link>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="前往 GitHub"
                className="flex h-[46px] w-[46px] items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] text-white/70 backdrop-blur transition-all hover:border-white/30 hover:text-white"
              >
                <Github className="h-4 w-4" />
              </a>
            </motion.div>

            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="show"
              custom={5}
              className="mt-9 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-white/35 lg:justify-start"
            >
              {TRUST_ITEMS.map((t, i) => (
                <span key={t} className="flex items-center gap-4">
                  {i > 0 && <span className="hidden h-0.5 w-0.5 rounded-full bg-white/20 sm:block" />}
                  {t}
                </span>
              ))}
            </motion.div>
          </motion.div>

          <motion.div
            style={{ y: yPhone }}
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.35, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <Phone3D />
          </motion.div>
        </div>

        <div className="mt-16 flex flex-col items-center gap-2 text-white/30">
          <span className="text-[11px]">向下滚动，体验真实 App 界面</span>
          <ChevronDown className="animate-scroll-hint h-4 w-4" />
        </div>
      </motion.div>
    </section>
  );
}
