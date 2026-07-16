'use client';

import dynamic from 'next/dynamic';
import Navbar from '@/components/Navbar';
import SmoothScrollProvider from '@/components/SmoothScrollProvider';
import HeroText from '@/components/HeroText';
import FeatureTextOverlay from '@/components/FeatureTextOverlay';
import CTASection from '@/components/CTASection';
import HomeClassicSections from '@/components/home/HomeClassicSections';
import PhoneScreenOverlay from '@/components/phone-app/PhoneScreenOverlay';
import SceneErrorBoundary from '@/components/SceneErrorBoundary';
import { ScrollProgressProvider } from '@/hooks/use-scroll-progress';
import { useHeroScrollPhase } from '@/hooks/use-hero-scroll-phase';
import { useIdleHeroDemo } from '@/hooks/use-idle-hero-demo';

const SceneCanvas = dynamic(() => import('@/components/SceneCanvas'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#03060d]" aria-hidden />,
});

function HomeExperienceInner() {
  const pastHero = useHeroScrollPhase();
  useIdleHeroDemo(!pastHero);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#03060d] text-white">
      <Navbar variant="home" pastHero={pastHero} />
      <main className="relative">
        <div id="features" className="sr-only" aria-hidden />
        <div id="download" className="sr-only" aria-hidden />
        <div id="about" className="sr-only" aria-hidden />
        <SmoothScrollProvider hideScene={pastHero}>
          <SceneErrorBoundary>
            <SceneCanvas />
          </SceneErrorBoundary>
        </SmoothScrollProvider>
        {!pastHero && (
          <>
            <PhoneScreenOverlay />
            <HeroText />
            <FeatureTextOverlay />
            <CTASection />
          </>
        )}
        <HomeClassicSections />
      </main>
      {!pastHero && (
        <div
          className="pointer-events-none fixed inset-0 z-[1] opacity-40"
          style={{
            background:
              'radial-gradient(ellipse 70% 55% at 72% 42%, rgba(56,189,248,0.14), transparent 55%), radial-gradient(ellipse 50% 40% at 18% 30%, rgba(167,139,250,0.12), transparent 50%), radial-gradient(ellipse 80% 50% at 50% 100%, rgba(14,165,233,0.08), transparent 55%)',
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
