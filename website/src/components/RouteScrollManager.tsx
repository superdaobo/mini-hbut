'use client';

import { useEffect, useLayoutEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

function instantScrollTop() {
  const doc = document.documentElement;
  const body = document.body;
  const prevDoc = doc.style.scrollBehavior;
  const prevBody = body.style.scrollBehavior;

  doc.style.scrollBehavior = 'auto';
  body.style.scrollBehavior = 'auto';
  window.scrollTo(0, 0);
  doc.scrollTop = 0;
  body.scrollTop = 0;

  requestAnimationFrame(() => {
    doc.style.scrollBehavior = prevDoc;
    body.style.scrollBehavior = prevBody;
  });
}

function scrollToHash(hash: string) {
  if (!hash) return false;
  const decoded = decodeURIComponent(hash.slice(1));
  const target = document.getElementById(decoded) || document.querySelector(hash);
  if (!(target instanceof HTMLElement)) return false;

  const nav = document.querySelector('nav');
  const navOffset = nav instanceof HTMLElement ? nav.getBoundingClientRect().height + 24 : 24;
  const top = target.getBoundingClientRect().top + window.scrollY - navOffset;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  return true;
}

export default function RouteScrollManager() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hash = typeof window !== 'undefined' ? window.location.hash : '';

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      const previous = window.history.scrollRestoration;
      window.history.scrollRestoration = 'manual';
      return () => {
        window.history.scrollRestoration = previous;
      };
    }
    return undefined;
  }, []);

  useLayoutEffect(() => {
    let cancelled = false;
    let timer = 0;

    const run = (attempt = 0) => {
      if (cancelled) return;

      if (pathname === '/' && hash) {
        instantScrollTop();
        const ok = scrollToHash(hash);
        if (!ok && attempt < 30) {
          timer = window.setTimeout(() => run(attempt + 1), 120);
        }
        return;
      }

      instantScrollTop();
    };

    run();
    const raf = requestAnimationFrame(() => run());

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [pathname, hash, searchParams]);

  return null;
}
