'use client';

import { useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Features from '@/sections/Features';
import Download from '@/sections/Download';
import About from '@/sections/About';
import Footer from '@/sections/Footer';

gsap.registerPlugin(ScrollTrigger);

/** 3D Hero 下方的经典官网内容：功能介绍、下载、关于、页脚 */
export default function HomeClassicSections() {
  useEffect(() => {
    const refresh = () => ScrollTrigger.refresh();
    refresh();
    window.addEventListener('resize', refresh);
    const timer = window.setTimeout(refresh, 600);

    return () => {
      window.removeEventListener('resize', refresh);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="relative z-20 bg-black text-white">
      <Features />
      <Download />
      <About />
      <Footer />
    </div>
  );
}
