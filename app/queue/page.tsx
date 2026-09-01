'use client';

import { useCallback, useEffect, useState } from 'react';

type Item = {
  id: string; title: string; titleZh: string | null; place: string | null;
  time: string | null; price: string | null; startDate: string; endDate: string | null;
  sourceUrl: string | null; changeType: string | null; popularity: number | null;
  tags: string[]; pickedFor: string; score: number;
};
type Round = { roundId: string | null; tag: string | null; items: Item[]; likedTags: string[] };

const PICKED_LABEL: Record<string, string> = {
  nowness: '为什么是现在', score: '综合高分', diversity: '换换口味', exploration: '探索位',
};

function setToken(token: string) {
  document.cookie = `queue_token=${encodeURIComponent(token)}; path=/; max-age=31536000; samesite=lax`;
}

export default function QueuePage() {
  const [round, setRound] = useState<Round | null>(null);
  const [index, setIndex] = useState(0);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [needToken, setNeedToken] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [tag, setTag] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (tagFilter: string) => {
    setLoading(true);
    const query = tagFilter ? `?tag=${encodeURIComponent(tagFilter)}` : '';
    const response = await fetch(`/api/queue${query}`);
    if (response.status === 401) { setNeedToken(true); setLoading(false); return; }
    setRound(await response.json());
    setIndex(0);
    setVotes({});
    setNeedToken(false);
    setLoading(false);
  }, []);

  // Initial fetch on mount; `load` flips a loading flag synchronously, which the
  // set-state-in-effect rule flags, but a data fetch on mount is the intended use.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(''); }, [load]);

  async function vote(item: Item, choice: 'want' | 'ok' | 'no') {
    setVotes((prev) => ({ ...prev, [item.id]: choice }));
    setIndex((i) => i + 1);
    await fetch('/api/vote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: item.id, vote: choice, roundId: round?.roundId }),
    });
  }

  if (needToken) {
    return (
      <main className="mx-auto max-w-md p-8">
        <h1 className="text-xl font-bold">这里需要口令</h1>
        <input className="mt-4 w-full rounded border p-2" type="password" value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)} placeholder="QUEUE_TOKEN" />
        <button className="mt-2 rounded bg-black px-4 py-2 text-white"
          onClick={() => { setToken(tokenInput); void load(tag); }}>进入</button>
      </main>
    );
  }
  if (loading || !round) return <main className="p-8">加载中…</main>;

  const item = round.items[index];
  const done = !item;

  return (
    <main className="mx-auto max-w-lg p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">探索队列{round.tag ? `｜${round.tag}` : ''}</h1>
        <div className="flex gap-2">
          <input className="w-24 rounded border p-1 text-sm" value={tag} placeholder="按 tag 开轮"
            onChange={(e) => setTag(e.target.value)} />
          <button className="rounded border px-2 text-sm" onClick={() => void load(tag)}>开专题轮</button>
          <a className="rounded border px-2 py-1 text-sm" href="/wantlist">想去清单</a>
        </div>
      </header>

      {done ? (
        <section className="rounded-lg border p-6">
          <h2 className="text-xl font-bold">本轮滑完了</h2>
          <p className="mt-2 text-sm">
            想去 {Object.values(votes).filter((v) => v === 'want').length} ·
            可以 {Object.values(votes).filter((v) => v === 'ok').length} ·
            不想去 {Object.values(votes).filter((v) => v === 'no').length}
          </p>
          <button className="mt-4 rounded bg-black px-4 py-2 text-white" onClick={() => void load(tag)}>
            开下一轮
          </button>
        </section>
      ) : (
        <section className="rounded-lg border p-6">
          <p className="text-xs text-gray-500">
            {index + 1} / {round.items.length} · {PICKED_LABEL[item.pickedFor] ?? item.pickedFor}
            {item.changeType === 'closing' ? ' · 快结束了' : ''}
            {(item.popularity ?? 0) >= 10 ? ' · 口碑热' : ''}
          </p>
          <h2 className="mt-2 text-xl font-bold">{item.titleZh ?? item.title}</h2>
          {item.titleZh ? <p className="text-sm text-gray-500">{item.title}</p> : null}
          <p className="mt-2 text-sm">
            {item.startDate}{item.endDate ? ` – ${item.endDate}` : ''}
            {item.place ? ` · ${item.place}` : ''}{item.price ? ` · ${item.price}` : ''}
          </p>
          <p className="mt-2 flex flex-wrap gap-1">
            {item.tags.map((t) => (
              <span key={t} className={`rounded-full border px-2 py-0.5 text-xs ${round.likedTags.includes(t) ? 'border-black font-bold' : 'text-gray-500'}`}>
                {t}{round.likedTags.includes(t) ? ' ♥' : ''}
              </span>
            ))}
          </p>
          {item.sourceUrl ? (
            <a className="mt-2 inline-block text-sm underline" href={item.sourceUrl} target="_blank" rel="noreferrer">
              去主办方页面看看 ↗
            </a>
          ) : null}
          <div className="mt-6 grid grid-cols-3 gap-2">
            <button className="rounded border py-3" onClick={() => void vote(item, 'no')}>不想去</button>
            <button className="rounded border py-3" onClick={() => void vote(item, 'ok')}>可以</button>
            <button className="rounded bg-black py-3 text-white" onClick={() => void vote(item, 'want')}>想去！</button>
          </div>
        </section>
      )}
    </main>
  );
}
