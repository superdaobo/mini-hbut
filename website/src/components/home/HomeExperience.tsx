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

const SceneCanvas = dynamic(() => import('@/components/SceneCanvas'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 bg-[#03060d]" aria-hidden />
  ),
});

export default function HomeExperience() {
  const pastHero = useHeroScrollPhase();

  return (
    <ScrollProgressProvider>
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
            className="pointer-events-none fixed inset-0 z-[1] opacity-30"
            style={{
              background:
                'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(56,189,248,0.12), transparent 60%), radial-gradient(ellipse 60% 40% at 80% 80%, rgba(167,139,250,0.08), transparent 50%)',
            }}
          />
        )}
      </div>
    </ScrollProgressProvider>
  );
}
