import type { Metadata } from 'next';
import { Suspense } from 'react';
import '@/index.css';
import RouteScrollManager from '@/components/RouteScrollManager';

export const metadata: Metadata = {
  title: 'Mini-HBUT — 校园信息聚合与日程提醒',
  description: '聚合课表、成绩、考试、通知与日程，把复杂的校园信息变成清晰、高效、好用的移动体验。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-[#03060d] text-white antialiased" style={{ margin: 0, backgroundColor: '#03060d', color: '#ffffff' }}>
        <Suspense fallback={null}>
          <RouteScrollManager />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
