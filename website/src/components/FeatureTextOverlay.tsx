'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useScrollProgress } from '@/hooks/use-scroll-progress';

const FEATURE_COPY: Record<string, { title: string; body: string }> = {
  schedule: {
    title: '课表，不只是查看',
    body: '而是知道下一步该去哪里。',
  },
  grades: {
    title: '成绩、考试、进度',
    body: '一眼看清。',
  },
  tunnel: {
    title: '通知、日程、校园服务',
    body: '统一聚合。',
  },
  cta: {
    title: '一个入口',
    body: '连接你的校园生活。',
  },
};

function getCopyKey(phase: string): keyof typeof FEATURE_COPY {
  if (phase === 'schedule' || phase === 'dive') return 'schedule';
  if (phase === 'grades') return 'grades';
  if (phase === 'tunnel' || phase === 'return') return 'tunnel';
  if (phase === 'cta') return 'cta';
  return 'schedule';
}

export default function FeatureTextOverlay() {
  const { sample } = useScrollProgress();
  const opacity = sample.featureOpacity;
  const copyKey = getCopyKey(sample.phase);
  const copy = FEATURE_COPY[copyKey];

  return (
    <AnimatePresence mode="wait">
      {opacity > 0.05 && (
        <motion.div
          key={copyKey}
          className="pointer-events-none fixed inset-x-0 bottom-[18vh] z-20 mx-auto max-w-3xl px-6 text-center lg:hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.4 }}
        >
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">{copy.title}</h2>
          <p className="mt-3 text-base text-white/65 sm:text-lg">{copy.body}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
