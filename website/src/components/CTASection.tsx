'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Github } from 'lucide-react';
import { useScrollProgress } from '@/hooks/use-scroll-progress';

interface MagneticButtonProps {
  href: string;
  children: React.ReactNode;
  variant?: 'primary' | 'ghost';
  external?: boolean;
}

function MagneticButton({ href, children, variant = 'ghost', external }: MagneticButtonProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const { isMobile } = useScrollProgress();

  const handleMove = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (isMobile) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    setOffset({ x: x * 0.18, y: y * 0.18 });
  };

  const handleLeave = () => setOffset({ x: 0, y: 0 });

  const className =
    variant === 'primary'
      ? 'inline-flex items-center justify-center rounded-full border border-cyan/40 bg-cyan/15 px-6 py-3 text-sm font-medium text-cyan shadow-[0_0_30px_rgba(56,189,248,0.25)] backdrop-blur-md transition-colors hover:bg-cyan/25'
      : 'inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white/85 backdrop-blur-md transition-colors hover:border-white/30 hover:bg-white/10';

  const style = { transform: `translate(${offset.x}px, ${offset.y}px)` };

  if (external) {
    return (
      <motion.a
        ref={ref}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        style={style}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        whileTap={{ scale: 0.97 }}
      >
        {children}
      </motion.a>
    );
  }

  return (
    <motion.div style={style} onMouseMove={handleMove as never} onMouseLeave={handleLeave}>
      <Link href={href} className={className} ref={ref as never}>
        {children}
      </Link>
    </motion.div>
  );
}

export default function CTASection() {
  const { sample, isMobile } = useScrollProgress();
  const opacity = sample.ctaOpacity;

  // 保持挂载，避免 opacity 阈值附近闪灭
  return (
    <section
      id="download"
      className={`pointer-events-auto fixed inset-x-0 z-30 mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 ${
        isMobile ? 'bottom-[6vh]' : 'bottom-[8vh]'
      }`}
      style={{
        opacity: opacity <= 0.02 ? 0 : opacity,
        visibility: opacity <= 0.02 ? 'hidden' : 'visible',
        transform: `translateY(${(1 - Math.max(opacity, 0)) * 24}px)`,
        transition: 'opacity 0.35s ease, transform 0.35s ease',
      }}
    >
      <div className="flex flex-wrap items-center justify-center gap-3">
        <MagneticButton href="/releases" variant="primary">
          立即体验
        </MagneticButton>
        <MagneticButton href="https://github.com/superdaobo/mini-hbut" external>
          <Github size={16} />
          GitHub
        </MagneticButton>
        <MagneticButton href="/docs">了解功能</MagneticButton>
      </div>
      <p className="text-center text-xs text-white/45">
        下载 Windows / macOS / Linux / Android / iOS 全平台版本
      </p>
    </section>
  );
}
