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
  const { isMobile } = useScrollProgress();
  useIdleHeroDemo(!pastHero);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#03060d] text-white">
      <Navbar variant="home" pastHero={pastHero} />
      <main className="relative">
        <div id="features" className="sr-only" aria-hidden />
        <div id="download" className="sr-only" aria-hidden />
        <div id="about" className="sr-only" aria-hidden />

        {/* 桌面：R3F 唯一手机贴屏；移动端场景仅氛围 */}
        <SmoothScrollProvider hideScene={pastHero}>
          <SceneErrorBoundary>
            <SceneCanvas />
          </SceneErrorBoundary>
        </SmoothScrollProvider>

        {!pastHero && (
          <>
            {/* 移动端 DOM 降级手机；桌面不叠第二台 */}
            {isMobile && <PhoneScreenOverlay />}
            <HeroFeatureOrbits />
            <HeroText />
            <FeatureTextOverlay />
            <CTASection />
          </>
        )}

        <HomeClassicSections />
      </main>

      {!pastHero && (
        <div
          className="pointer-events-none fixed inset-0 z-[1] opacity-45"
          style={{
            background:
              'radial-gradient(ellipse 65% 50% at 70% 40%, rgba(56,189,248,0.16), transparent 55%), radial-gradient(ellipse 45% 35% at 15% 28%, rgba(167,139,250,0.12), transparent 50%)',
          }}
        />
      )}
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
