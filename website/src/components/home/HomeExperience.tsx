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
    // 注意：不要在 sticky Showcase 祖先上使用 overflow-x-hidden，
    // 否则 sticky 会相对该祖先计算，滚动后机身被顶出视口（#413）。
    <div className="relative min-h-screen bg-[#03060d] text-white">
      <Navbar variant="home" pastHero={scrolled} />
      <main className="relative overflow-x-clip">
        <HeroSection />
        <ScrollShowcase />
        <HomeClassicSections />
      </main>
    </div>
  );
}
