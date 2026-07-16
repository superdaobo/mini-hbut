import type { Metadata } from 'next';
import Privacy from '@/views/Privacy';

export const metadata: Metadata = {
  title: '隐私政策 — Mini-HBUT',
  description:
    'Mini-HBUT 隐私政策：说明本地会话、学业缓存、可选云同步与第三方端点如何处理你的数据。',
};

export default function PrivacyPage() {
  return <Privacy />;
}
