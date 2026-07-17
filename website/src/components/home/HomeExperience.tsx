'use client';

import dynamic from 'next/dynamic';
import Navbar from '@/components/Navbar';
import SmoothScrollProvider from '@/components/SmoothScrollProvider';
import HeroText from '@/components/HeroText';
import FeatureTextOverlay from '@/components/FeatureTextOverlay';
import CTASection from '@/components/CTASection';
import HomeClassicSections from '@/components/home/HomeClassicSections';
import PhoneScreenOverlay from '@/components/phone-app/PhoneScreenOverlay';
import HeroFeatureOrbits from '@/components/HeroFeatureOrbits';
import SceneErrorBoundary from '@/components/SceneErrorBoundary';
import { ScrollProgressProvider, useScrollProgress } from '@/hooks/use-scroll-progress';
import { useHeroScrollPhase } from '@/hooks/use-hero-scroll-phase';
import { useIdleHeroDemo } from '@/hooks/use-idle-hero-demo';

const SceneCanvas = dynamic(() => import('@/components/SceneCanvas'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#03060d]" aria-hidden />,
});

function HomeExperienceInner() {
  const pastHero = useHeroScrollPhase();
  const { isMobile, reducedMotion } = useScrollProgress();
  // 仅在 Hero 区内做 UI 轮播；绝不改写 scroll progress
  useIdleHeroDemo(!pastHero, reducedMotion);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#03060d] text-white">
      <Navbar variant="home" pastHero={pastHero} />
      <main className="relative">
        <div id="features" className="sr-only" aria-hidden />
        <div id="download" className="sr-only" aria-hidden />
        <div id="about" className="sr-only" aria-hidden />

        <SmoothScrollProvider hideScene={pastHero}>
          <SceneErrorBoundary>
            {/* 移动端仍挂轻量场景作氛围；手机主体走 DOM 降级 */}
            <SceneCanvas />
          </SceneErrorBoundary>
        </SmoothScrollProvider>

        {/* 固定层用 opacity 隐藏，避免 pastHero 切换时整树卸载闪一下（勿用 display:contents） */}
        <div
          className="pointer-events-none fixed inset-0 z-[20]"
          style={{
            opacity: pastHero ? 0 : 1,
            visibility: pastHero ? 'hidden' : 'visible',
            transition: 'opacity 0.4s ease',
          }}
          aria-hidden={pastHero}
        >
          {isMobile && <PhoneScreenOverlay />}
          <HeroFeatureOrbits />
          <HeroText />
          <FeatureTextOverlay />
          <CTASection />
        </div>

        <HomeClassicSections />
      </main>

      <div
        className="pointer-events-none fixed inset-0 z-[1]"
        style={{
          opacity: pastHero ? 0 : 0.45,
          transition: 'opacity 0.45s ease',
          background:
            'radial-gradient(ellipse 65% 50% at 70% 40%, rgba(56,189,248,0.16), transparent 55%), radial-gradient(ellipse 45% 35% at 15% 28%, rgba(167,139,250,0.12), transparent 50%)',
        }}
      />
    </div>
  );
}

export default function HomeExperience() {
  return (
    <ScrollProgressProvider>
      <HomeExperienceInner />
    </ScrollProgressProvider>
  );
}
