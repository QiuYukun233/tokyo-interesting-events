'use client';

import { useCallback, useEffect, useState } from 'react';

type WantItem = {
  id: string; title: string; titleZh: string | null; place: string | null;
  price: string | null; startDate: string; endDate: string | null;
  sourceUrl: string | null; tags: string[]; votedAt: string;
};

const SOON_DAYS = 14;

function daysUntil(date: string): number {
  return Math.ceil((new Date(`${date}T23:59:59+09:00`).getTime() - Date.now()) / 86400000);
}

export default function WantlistPage() {
  const [items, setItems] = useState<WantItem[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch('/api/wantlist');
      if (response.status === 401) { setDenied(true); return; }
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { items: WantItem[] };
      setItems(data.items);
    } catch {
      setError('加载失败，稍后再试');
    }
  }, []);

  // Initial fetch on mount; a data fetch on mount is the intended use.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  if (denied) return <main className="p-8">先去<a className="underline" href="/queue">队列页</a>输入口令。</main>;
  if (error) {
    return (
      <main className="mx-auto max-w-md p-8">
        <p>{error}</p>
        <button className="mt-4 rounded border px-4 py-2" onClick={() => void load()}>重试</button>
      </main>
    );
  }
  if (!items) return <main className="p-8">加载中…</main>;

  return (
    <main className="mx-auto max-w-lg p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">想去清单（{items.length}）</h1>
        <a className="rounded border px-2 py-1 text-sm" href="/queue">回队列</a>
      </header>
      {items.length === 0 ? <p className="text-sm text-gray-500">还没有想去的，去队列里滑一轮。</p> : null}
      <ul className="space-y-3">
        {items.map((item) => {
          const deadline = item.endDate ?? item.startDate;
          const left = daysUntil(deadline);
          const urgent = left >= 0 && left <= SOON_DAYS;
          return (
            <li key={item.id} className={`rounded-lg border p-4 ${urgent ? 'border-red-500' : ''}`}>
              <p className="font-bold">{item.titleZh ?? item.title}</p>
              <p className="mt-1 text-sm">
                {item.startDate}{item.endDate ? ` – ${item.endDate}` : ''}
                {item.place ? ` · ${item.place}` : ''}{item.price ? ` · ${item.price}` : ''}
                {urgent ? <span className="ml-2 font-bold text-red-600">还剩 {left} 天</span> : null}
              </p>
              <p className="mt-1 text-xs text-gray-500">{item.tags.join(' · ')}</p>
              {item.sourceUrl ? (
                <a className="mt-1 inline-block text-sm underline" href={item.sourceUrl} target="_blank" rel="noreferrer">
                  主办方页面 ↗
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
