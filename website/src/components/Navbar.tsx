'use client';

import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Menu, X, Download } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavLink = { name: string; href: string; external?: boolean };

const siteNavLinks: NavLink[] = [
  { name: '功能', href: '#features' },
  { name: '下载', href: '#download' },
  { name: '关于', href: '#about' },
  { name: '文档', href: '/docs' },
  { name: '版本', href: '/releases' },
];

interface NavbarProps {
  variant?: 'default' | 'home';
  pastHero?: boolean;
}

export default function Navbar({ variant = 'default', pastHero = false }: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const linksRef = useRef<(HTMLAnchorElement | null)[]>([]);
  const pathname = usePathname();
  const isHome = pathname === '/';
  const isHomeVariant = variant === 'home' || isHome;
  const showSolidNav = isScrolled || (isHomeVariant && pastHero) || !isHome;

  const isActiveLink = (href: string) => {
    if (href === '/docs') return pathname === '/docs' || pathname.startsWith('/docs/');
    if (href === '/releases') return pathname === '/releases' || pathname.startsWith('/releases/');
    return false;
  };

  const linkClassName = (href: string) => {
    const active = isActiveLink(href);
    return `group relative text-sm transition-colors ${active ? 'text-cyan' : 'text-gray-300 hover:text-cyan'}`;
  };

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (navRef.current) {
      gsap.fromTo(
        navRef.current,
        { y: -24, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, ease: 'expo.out', delay: 0.2 },
      );
    }

    linksRef.current.forEach((link, i) => {
      if (link) {
        gsap.fromTo(
          link,
          { opacity: 0, y: -12 },
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
        .map((_, index) => (index < iteration ? originalText[index] : chars[Math.floor(Math.random() * chars.length)]))
        .join('');

      if (iteration >= originalText.length) clearInterval(interval);
      iteration += 1 / 2;
    }, 30);
  };

  const handleLinkLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.textContent = e.currentTarget.dataset.text || '';
  };

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!isHome && href.startsWith('#')) {
      setIsMobileMenuOpen(false);
      return;
    }

    if (href.startsWith('#')) {
      e.preventDefault();
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
      setIsMobileMenuOpen(false);
    }
  };

  const getLinkHref = (href: string) => (href.startsWith('#') && !isHome ? `/${href}` : href);

  const renderNavLink = (link: NavLink, index?: number, mobile = false) => {
    const underline = (
      <span
        className={`absolute -bottom-1 left-0 h-0.5 bg-cyan transition-all duration-300 ${
          isActiveLink(link.href) ? 'w-full' : 'w-0 group-hover:w-full'
        }`}
      />
    );
    const itemClass = `${linkClassName(link.href)}${mobile ? ' block py-2' : ''}`;

    if (link.external) {
      return (
        <a
          key={link.name}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          data-text={link.name}
          className={itemClass}
          onMouseEnter={handleLinkHover}
          onMouseLeave={handleLinkLeave}
        >
          {link.name}
        </a>
      );
    }

    if (link.href.startsWith('#')) {
      return (
        <a
          key={link.name}
          ref={index !== undefined ? (el) => { linksRef.current[index] = el; } : undefined}
          href={getLinkHref(link.href)}
          data-text={link.name}
          className={itemClass}
          onMouseEnter={handleLinkHover}
          onMouseLeave={handleLinkLeave}
          onClick={(e) => scrollToSection(e, link.href)}
        >
          {link.name}
          {underline}
        </a>
      );
    }

    return (
      <Link
        key={link.name}
        href={link.href}
        ref={index !== undefined ? (el) => { linksRef.current[index] = el; } : undefined}
        data-text={link.name}
        className={itemClass}
        onMouseEnter={handleLinkHover}
        onMouseLeave={handleLinkLeave}
        onClick={() => setIsMobileMenuOpen(false)}
      >
        {link.name}
        {underline}
      </Link>
    );
  };

  return (
    <nav
      ref={navRef}
      className={`fixed top-4 left-1/2 z-50 -translate-x-1/2 transition-all duration-500 ${
        isHomeVariant && !showSolidNav
          ? 'w-[95%] max-w-6xl rounded-2xl border border-white/5 bg-black/20 backdrop-blur-md'
          : showSolidNav
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
          {siteNavLinks.map((link, i) => renderNavLink(link, i))}
        </div>

        <a
          href={getLinkHref('#download')}
          className="cyber-btn hidden items-center gap-2 px-4 py-2 font-mono text-xs md:flex"
          onClick={(e) => scrollToSection(e, '#download')}
        >
          <Download className="h-4 w-4" />
          获取应用
        </a>

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
            {siteNavLinks.map((link) => renderNavLink(link, undefined, true))}
            <a
              href={getLinkHref('#download')}
              className="cyber-btn mt-2 px-4 py-2 text-center font-mono text-xs"
              onClick={(e) => scrollToSection(e, '#download')}
            >
              获取应用
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
