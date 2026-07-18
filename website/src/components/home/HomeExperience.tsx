'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import HeroSection from '@/components/home/HeroSection';
import ScrollShowcase from '@/components/home/ScrollShowcase';
import HomeClassicSections from '@/components/home/HomeClassicSections';

/**
 * 首页：Kimi 风格短 Hero + 滚动 Showcase + 经典区块。
 * 不再挂载 R3F SceneCanvas / 超长 scroll driver。
 */
export default function HomeExperience() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#03060d] text-white">
      <Navbar variant="home" pastHero={scrolled} />
      <main className="relative">
        <HeroSection />
        <ScrollShowcase />
        <HomeClassicSections />
      </main>
    </div>
  );
}
