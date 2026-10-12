'use client';

import { useCallback, useEffect, useState } from 'react';

type WantItem = {
  id: string; title: string; titleZh: string | null; place: string | null;
  price: string | null; startDate: string; endDate: string | null;
  sourceUrl: string | null; tags: string[]; votedAt: string;
  invite: { code: string; replies: { name: string; vote: 'want' | 'ok' | 'no' }[] } | null;
};

const VOTE_LABEL = { want: '想去', ok: '可以', no: '不想去' } as const;

const SOON_DAYS = 14;

function daysUntil(date: string): number {
  return Math.ceil((new Date(`${date}T23:59:59+09:00`).getTime() - Date.now()) / 86400000);
}

export default function WantlistPage() {
  const [items, setItems] = useState<WantItem[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<Record<string, string>>({});

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

  // One link per item (朋友投票设计 §1): asking twice returns the same code.
  async function askFriends(item: WantItem) {
    const say = (msg: string) => setShareMsg((prev) => ({ ...prev, [item.id]: msg }));
    try {
      const response = await fetch('/api/invites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: item.id }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const { code } = (await response.json()) as { code: string };
      const url = `${location.origin}/i/${code}`;
      setItems((prev) => prev?.map((i) => (i.id === item.id && !i.invite ? { ...i, invite: { code, replies: [] } } : i)) ?? prev);
      const text = `我想去这个，你呢？${item.titleZh ?? item.title}`;
      if (navigator.share) {
        await navigator.share({ title: text, text, url }).catch(() => undefined);
        say('');
      } else {
        await navigator.clipboard.writeText(`${text}
${url}`);
        say('链接已复制，发给朋友吧');
      }
    } catch {
      say('生成链接失败，稍后再试');
    }
  }

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
              <p className="mt-2 flex items-center gap-3 text-sm">
                {item.sourceUrl ? (
                  <a className="underline" href={item.sourceUrl} target="_blank" rel="noreferrer">主办方页面 ↗</a>
                ) : null}
                <button className="rounded border px-2 py-0.5" onClick={() => void askFriends(item)}>
                  {item.invite ? '再发一次链接' : '问朋友'}
                </button>
              </p>
              {shareMsg[item.id] ? <p className="mt-1 text-xs text-gray-500">{shareMsg[item.id]}</p> : null}
              {item.invite?.replies.length ? (
                <p className="mt-1 text-sm">
                  {item.invite.replies.map((r) => `${r.name} ${VOTE_LABEL[r.vote]}`).join(' · ')}
                </p>
              ) : item.invite ? <p className="mt-1 text-xs text-gray-500">链接已发出，还没人回</p> : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
