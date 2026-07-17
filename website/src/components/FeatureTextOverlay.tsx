'use client';

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

/**
 * 中段功能文案。
 * 不用 AnimatePresence mode=wait（进出场叠 progress 抖动会整段闪）。
 * 移动端文案改由 Hero 顶部 + 手机字幕承担，这里隐藏以免叠层跳动。
 */
export default function FeatureTextOverlay() {
  const { sample, isMobile } = useScrollProgress();
  if (isMobile) return null;

  const opacity = sample.featureOpacity;
  if (opacity <= 0.05) return null;

  const copyKey = getCopyKey(sample.phase);
  const copy = FEATURE_COPY[copyKey];

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[18vh] z-20 mx-auto max-w-3xl px-6 text-center lg:hidden"
      style={{ opacity, transition: 'opacity 0.3s ease' }}
    >
      <h2 className="text-2xl font-semibold text-white sm:text-3xl">{copy.title}</h2>
      <p className="mt-3 text-base text-white/65 sm:text-lg">{copy.body}</p>
    </div>
  );
}
