import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Menu, X, Download } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const navLinks = [
  { name: '功能', href: '#features' },
  { name: '下载', href: '#download' },
  { name: '关于', href: '#about' },
];

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const linksRef = useRef<(HTMLAnchorElement | null)[]>([]);
  const location = useLocation();
  const isHome = location.pathname === '/';

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // Entrance animation
    if (navRef.current) {
      gsap.fromTo(
        navRef.current,
        { y: -100, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, ease: 'expo.out', delay: 0.2 }
      );
    }

    linksRef.current.forEach((link, i) => {
      if (link) {
        gsap.fromTo(
          link,
          { opacity: 0, y: -20 },
          { opacity: 1, y: 0, duration: 0.4, delay: 0.4 + i * 0.1, ease: 'power2.out' }
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
      // Allow default navigation to home page with hash
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
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ${isScrolled
          ? 'w-[95%] max-w-6xl glass rounded-2xl shadow-neon'
          : 'w-[95%] max-w-6xl bg-transparent'
        }`}
      style={{
        borderColor: isScrolled ? 'rgba(15, 240, 252, 0.3)' : 'transparent',
      }}
    >
      <div className="px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link
          to="/"
          className="font-pixel text-sm md:text-base text-cyan hover:text-pink transition-colors"
          onClick={() => {
            if (isHome) window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <span className="neon-text-cyan">Mini-HBUT</span>
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link, i) => (
            <a
              key={link.name}
              ref={(el) => { linksRef.current[i] = el; }}
              href={getLinkHref(link.href)}
              data-text={link.name}
              className="text-sm text-gray-300 hover:text-cyan transition-colors relative group"
              onMouseEnter={handleLinkHover}
              onMouseLeave={handleLinkLeave}
              onClick={(e) => scrollToSection(e, link.href)}
            >
              {link.name}
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-cyan transition-all duration-300 group-hover:w-full" />
            </a>
          ))}

          {/* Docs Link */}
          <Link
            to="/docs"
            data-text="文档"
            className="text-sm text-gray-300 hover:text-cyan transition-colors relative group"
            onMouseEnter={handleLinkHover}
            onMouseLeave={handleLinkLeave}
          >
            文档
            <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-cyan transition-all duration-300 group-hover:w-full" />
          </Link>

          {/* Releases Link */}
          <Link
            to="/releases"
            data-text="历史版本"
            className="text-sm text-gray-300 hover:text-cyan transition-colors relative group"
            onMouseEnter={handleLinkHover}
            onMouseLeave={handleLinkLeave}
          >
            历史版本
            <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-cyan transition-all duration-300 group-hover:w-full" />
          </Link>
        </div>

        {/* CTA Button */}
        <a
          href={getLinkHref("#download")}
          className="hidden md:flex items-center gap-2 cyber-btn px-4 py-2 text-xs font-mono"
          onClick={(e) => scrollToSection(e, '#download')}
        >
          <Download className="w-4 h-4" />
          获取应用
        </a>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden text-cyan"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden glass rounded-b-2xl border-t border-cyan/20">
          <div className="px-6 py-4 flex flex-col gap-4">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={getLinkHref(link.href)}
                className="text-gray-300 hover:text-cyan transition-colors py-2"
                onClick={(e) => scrollToSection(e, link.href)}
              >
                {link.name}
              </a>
            ))}
            <Link
              to="/docs"
              className="text-gray-300 hover:text-cyan transition-colors py-2"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              文档
            </Link>
            <Link
              to="/releases"
              className="text-gray-300 hover:text-cyan transition-colors py-2"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              历史版本
            </Link>
            <a
              href={getLinkHref("#download")}
              className="cyber-btn px-4 py-2 text-xs font-mono text-center mt-2"
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
