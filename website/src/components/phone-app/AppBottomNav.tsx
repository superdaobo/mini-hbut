'use client';

interface AppBottomNavProps {
  active: 'home' | 'schedule' | 'notifications' | 'me';
}

const TABS = [
  { id: 'home' as const, label: '首页' },
  { id: 'schedule' as const, label: '课表' },
  { id: 'notifications' as const, label: '通知' },
  { id: 'me' as const, label: '我的' },
];

function TabIcon({ id, active }: { id: AppBottomNavProps['active']; active: boolean }) {
  const stroke = active ? '#6366f1' : '#64748b';
  if (id === 'home') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={stroke} strokeWidth="1.8">
        <path d="M3 10.8L12 3l9 7.8V21a1 1 0 0 1-1 1h-5.3a1 1 0 0 1-1-1v-5h-3.4v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10.8z" />
      </svg>
    );
  }
  if (id === 'schedule') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={stroke} strokeWidth="1.8">
        <rect x="3.2" y="4.5" width="17.6" height="16.3" rx="3.1" />
        <path d="M7 2.8v3.5M17 2.8v3.5M3.2 9.3h17.6" />
      </svg>
    );
  }
  if (id === 'notifications') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={stroke} strokeWidth="1.8">
        <path d="M12 3.5a5.8 5.8 0 0 0-5.8 5.8v3.2c0 .8-.2 1.6-.6 2.3L4.3 17a1.3 1.3 0 0 0 1.1 2h13.2a1.3 1.3 0 0 0 1.1-2l-1.3-2.2a4.7 4.7 0 0 1-.6-2.3V9.3A5.8 5.8 0 0 0 12 3.5z" />
        <path d="M9.3 19a2.7 2.7 0 0 0 5.4 0" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={stroke} strokeWidth="1.8">
      <circle cx="12" cy="8" r="4.1" />
      <path d="M4 20c1.8-3.6 4.7-5.5 8-5.5s6.2 1.9 8 5.5" />
    </svg>
  );
}

export default function AppBottomNav({ active }: AppBottomNavProps) {
  return (
    <nav className="mx-2 mb-2 grid shrink-0 grid-cols-4 gap-1 rounded-[18px] border border-slate-200/60 bg-white/90 px-2 py-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur-xl">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <div
            key={tab.id}
            className={`flex flex-col items-center gap-0.5 rounded-xl py-1 ${isActive ? 'text-indigo-500' : 'text-slate-500'}`}
          >
            <TabIcon id={tab.id} active={isActive} />
            <span className={`text-[9px] ${isActive ? 'font-semibold' : ''}`}>{tab.label}</span>
          </div>
        );
      })}
    </nav>
  );
}
