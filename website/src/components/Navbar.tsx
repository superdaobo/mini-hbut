'use client';

import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Menu, X, Download } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const defaultNavLinks = [
  { name: '功能', href: '#features' },
  { name: '下载', href: '#download' },
  { name: '关于', href: '#about' },
];

const homeNavLinks = [
  { name: '体验', href: 'http://score.6661111.xyz', external: true },
  { name: '文档', href: '/docs' },
  { name: '版本', href: '/releases' },
];

interface NavbarProps {
  variant?: 'default' | 'home';
}

export default function Navbar({ variant = 'default' }: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const linksRef = useRef<(HTMLAnchorElement | null)[]>([]);
  const pathname = usePathname();
  const isHome = pathname === '/';
  const isHomeVariant = variant === 'home' || isHome;
  const links = isHomeVariant ? homeNavLinks : defaultNavLinks;

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (navRef.current) {
      gsap.fromTo(
        navRef.current,
        { y: -24 },
        { y: 0, opacity: 1, duration: 0.8, ease: 'expo.out', delay: 0.2 },
      );
    }

    linksRef.current.forEach((link, i) => {
      if (link) {
        gsap.fromTo(
          link,
          { y: -12 },
          { opacity: 1, y: 0, duration: 0.4, delay: 0.4 + i * 0.1, ease: 'power2.out' },
        );
      }
    });
  }, []);

  const handleLinkHover = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const target = e.currentTarget;
    const originalText = target.dataset.text || target.textContent || '';
    const chars = 'アイウエオカキクケコサシスセソタチツテト0123456789';
    let iteration = 0;

    const interval = setInterval(() => {
      target.textContent = originalText
        .split('')
        .map((_, index) => {
          if (index < iteration) {
            return originalText[index];
          }
          return chars[Math.floor(Math.random() * chars.length)];
        })
        .join('');

      if (iteration >= originalText.length) {
        clearInterval(interval);
      }
      iteration += 1 / 2;
    }, 30);
  };

  const handleLinkLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const target = e.currentTarget;
    target.textContent = target.dataset.text || '';
  };

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!isHome && href.startsWith('#')) {
      return;
    }

    if (href.startsWith('#')) {
      e.preventDefault();
      const element = document.querySelector(href);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
      setIsMobileMenuOpen(false);
    }
  };

  const getLinkHref = (href: string) => {
    if (href.startsWith('#') && !isHome) {
      return `/${href}`;
    }
    return href;
  };

  return (
    <nav
      ref={navRef}
      className={`fixed top-4 left-1/2 z-50 -translate-x-1/2 transition-all duration-500 ${
        isHomeVariant && !isScrolled
          ? 'w-[95%] max-w-6xl border border-white/5 bg-black/20 backdrop-blur-md'
          : isScrolled
            ? 'w-[95%] max-w-6xl rounded-2xl border border-cyan/30 bg-black/60 shadow-neon glass'
            : 'w-[95%] max-w-6xl bg-transparent'
      } ${isHomeVariant ? 'rounded-2xl' : ''}`}
    >
      <div className="flex items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="font-pixel text-sm text-cyan transition-colors hover:text-pink md:text-base"
          onClick={() => {
            if (isHome) window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <span className="neon-text-cyan">Mini-HBUT</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {links.map((link, i) =>
            'external' in link && link.external ? (
              <a
                key={link.name}
                ref={(el) => { linksRef.current[i] = el; }}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                data-text={link.name}
                className="text-sm text-gray-300 transition-colors hover:text-cyan"
                onMouseEnter={handleLinkHover}
                onMouseLeave={handleLinkLeave}
              >
                {link.name}
              </a>
            ) : link.href.startsWith('#') ? (
              <a
                key={link.name}
                ref={(el) => { linksRef.current[i] = el; }}
                href={getLinkHref(link.href)}
                data-text={link.name}
                className="group relative text-sm text-gray-300 transition-colors hover:text-cyan"
                onMouseEnter={handleLinkHover}
                onMouseLeave={handleLinkLeave}
                onClick={(e) => scrollToSection(e, link.href)}
              >
                {link.name}
                <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-cyan transition-all duration-300 group-hover:w-full" />
              </a>
            ) : (
              <Link
                key={link.name}
                href={link.href}
                data-text={link.name}
                className="group relative text-sm text-gray-300 transition-colors hover:text-cyan"
                onMouseEnter={handleLinkHover}
                onMouseLeave={handleLinkLeave}
              >
                {link.name}
                <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-cyan transition-all duration-300 group-hover:w-full" />
              </Link>
            ),
          )}

          {!isHomeVariant && (
            <>
          <Link
            href="/docs"
            data-text="文档"
            className="group relative text-sm text-gray-300 transition-colors hover:text-cyan"
            onMouseEnter={handleLinkHover}
            onMouseLeave={handleLinkLeave}
          >
            文档
            <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-cyan transition-all duration-300 group-hover:w-full" />
          </Link>

          <Link
            href="/releases"
            data-text="历史版本"
            className="group relative text-sm text-gray-300 transition-colors hover:text-cyan"
            onMouseEnter={handleLinkHover}
            onMouseLeave={handleLinkLeave}
          >
            历史版本
            <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-cyan transition-all duration-300 group-hover:w-full" />
          </Link>
            </>
          )}
        </div>

        {!isHomeVariant && (
        <a
          href={getLinkHref('#download')}
          className="cyber-btn hidden items-center gap-2 px-4 py-2 font-mono text-xs md:flex"
          onClick={(e) => scrollToSection(e, '#download')}
        >
          <Download className="h-4 w-4" />
          获取应用
        </a>
        )}

        <button
          type="button"
          className="text-cyan md:hidden"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="glass rounded-b-2xl border-t border-cyan/20 md:hidden">
          <div className="flex flex-col gap-4 px-6 py-4">
            {links.map((link) =>
              'external' in link && link.external ? (
                <a key={link.name} href={link.href} target="_blank" rel="noopener noreferrer" className="py-2 text-gray-300">{link.name}</a>
              ) : link.href.startsWith('#') ? (
                <a key={link.name} href={getLinkHref(link.href)} className="py-2 text-gray-300" onClick={(e) => scrollToSection(e, link.href)}>{link.name}</a>
              ) : (
                <Link key={link.name} href={link.href} className="py-2 text-gray-300" onClick={() => setIsMobileMenuOpen(false)}>{link.name}</Link>
              ),
            )}
            {!isHomeVariant && (
              <>
            <Link
              href="/docs"
              className="py-2 text-gray-300 transition-colors hover:text-cyan"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              文档
            </Link>
            <Link
              href="/releases"
              className="py-2 text-gray-300 transition-colors hover:text-cyan"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              历史版本
            </Link>
            <a
              href={getLinkHref('#download')}
              className="cyber-btn mt-2 px-4 py-2 text-center font-mono text-xs"
              onClick={(e) => scrollToSection(e, '#download')}
            >
              获取应用
            </a>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
