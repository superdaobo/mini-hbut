import { Suspense } from 'react';
import Search from '@/views/Search';

function SearchFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-white/60">
      加载搜索…
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchFallback />}>
      <Search />
    </Suspense>
  );
}
