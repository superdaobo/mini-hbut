'use client';

import { motion } from 'framer-motion';
import { useScrollProgress } from '@/hooks/use-scroll-progress';

export default function HeroText() {
  const { sample } = useScrollProgress();
  const opacity = sample.heroOpacity;

  if (opacity <= 0.02) return null;

  return (
    <motion.div
      className="pointer-events-none fixed inset-x-0 top-[18vh] z-20 mx-auto max-w-4xl px-6 text-center"
      initial={false}
      animate={{ opacity, y: (1 - opacity) * 24 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <p className="mb-3 text-xs uppercase tracking-[0.35em] text-cyan-300/70">Mini-HBUT</p>
      <h1 className="bg-gradient-to-br from-white via-cyan-100 to-violet-200 bg-clip-text text-4xl font-semibold leading-tight text-transparent sm:text-5xl md:text-6xl">
        让校园生活，从一个入口开始。
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-white/60 sm:text-base">
        聚合课表、成绩、考试、通知与日程，把复杂的校园信息变成清晰、高效、好用的移动体验。
      </p>
    </motion.div>
  );
}
