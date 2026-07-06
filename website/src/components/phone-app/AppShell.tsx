'use client';

import type { ReactNode } from 'react';
import type { AppScreen } from '@/lib/scroll-utils';
import AppBottomNav from './AppBottomNav';

interface AppShellProps {
  screen: AppScreen;
  children: ReactNode;
  showNav?: boolean;
}

export default function AppShell({ screen, children, showNav = true }: AppShellProps) {
  const tabScreen = screen === 'schedule' ? 'schedule'
    : screen === 'notifications' ? 'notifications'
      : screen === 'me' ? 'me'
        : 'home';

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#f0f4f8] text-[#0f172a] antialiased">
      <div className="min-h-0 flex-1 overflow-hidden">
        {children}
      </div>
      {showNav && <AppBottomNav active={tabScreen} />}
    </div>
  );
}

export function AppCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white p-3 shadow-[0_4px_20px_rgba(15,23,42,0.08)] ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({ title, icon }: { title: string; icon?: ReactNode }) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-gray-100 bg-white/90 px-3 backdrop-blur-md">
      <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
      </button>
      <h1 className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
        {icon}
        {title}
      </h1>
      <div className="w-8" />
    </header>
  );
}
