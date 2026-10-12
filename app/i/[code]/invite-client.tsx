'use client';

import { useCallback, useEffect, useState } from 'react';

type Vote = 'want' | 'ok' | 'no';
type Match = 'both_want' | 'can_go' | 'both_ok' | 'no_match' | null;
type View = {
  item: {
    title: string; titleZh: string | null; place: string | null; time: string | null; price: string | null;
    startDate: string; endDate: string | null; sourceUrl: string | null; tags: string[];
  };
  replyCount: number;
  me: { name: string; vote: Vote } | null;
  revealed: boolean;
  inviterVote?: Vote | null;
  match?: Match;
  replies?: { name: string; vote: Vote; isMe: boolean; match: Match }[];
};

const VOTE_LABEL: Record<Vote, string> = { want: '想去', ok: '可以', no: '不想去' };
const MATCH_HEADLINE: Record<string, string> = {
  both_want: '你们都想去！', can_go: '可以一起去', both_ok: '都觉得可以', no_match: '这次不成',
};

// localStorage can throw (private mode, blocked storage); the page must still work.
function stored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function store(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* per-visit identity is fine */ }
}
function responderId(): string {
  const existing = stored('invite_responder');
  if (existing) return existing;
  const id = crypto.randomUUID();
  store('invite_responder', id);
  return id;
}

export default function InviteClient({ code }: { code: string }) {
  const [view, setView] = useState<View | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/invites/${encodeURIComponent(code)}?responder=${responderId()}`);
      if (response.status === 404) { setMissing(true); return; }
      if (!response.ok) throw new Error(String(response.status));
      setView(await response.json());
    } catch {
      setError('加载失败，稍后再试');
    }
  }, [code]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setName(stored('invite_name') ?? ''); void load(); }, [load]);

  async function vote(choice: Vote) {
    const trimmed = (view?.me?.name ?? name).trim();
    if (!trimmed) { setError('先填个昵称，让朋友知道是你'); return; }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/invites/${encodeURIComponent(code)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responderId: responderId(), name: trimmed, vote: choice }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? String(response.status));
      store('invite_name', trimmed);
      setView(data);
    } catch (e) {
      setError(e instanceof Error && e.message === 'this invite is full' ? '这个链接回复的人已经满了' : '没投上，再试一次');
    } finally {
      setBusy(false);
    }
  }

  if (missing) return <main className="mx-auto max-w-md p-8">这个链接不存在或已失效。</main>;
  if (!view) {
    return (
      <main className="mx-auto max-w-md p-8">
        {error ? <><p>{error}</p><button className="mt-4 rounded border px-4 py-2" onClick={() => void load()}>重试</button></> : '加载中…'}
      </main>
    );
  }

  const { item } = view;
  const buttons = (
    <div className="mt-4 grid grid-cols-3 gap-2">
      {(['no', 'ok', 'want'] as Vote[]).map((v) => (
        <button key={v} disabled={busy} onClick={() => void vote(v)}
          className={`rounded py-3 ${v === 'want' ? 'bg-black text-white!' : 'border'} ${view.me?.vote === v ? 'ring-2 ring-offset-1 ring-black' : ''}`}>
          {v === 'want' ? '想去！' : VOTE_LABEL[v]}
        </button>
      ))}
    </div>
  );

  return (
    <main className="mx-auto max-w-lg p-6">
      <p className="text-sm text-gray-500">朋友想去这个，你呢？</p>
      <section className="mt-3 rounded-lg border p-6">
        <h1 className="text-xl font-bold">{item.titleZh ?? item.title}</h1>
        {item.titleZh ? <p className="text-sm text-gray-500">{item.title}</p> : null}
        <p className="mt-2 text-sm">
          {item.startDate}{item.endDate ? ` – ${item.endDate}` : ''}
          {item.place ? ` · ${item.place}` : ''}{item.price ? ` · ${item.price}` : ''}
        </p>
        {item.tags.length ? <p className="mt-2 text-xs text-gray-500">{item.tags.join(' · ')}</p> : null}
        {item.sourceUrl ? (
          <a className="mt-2 inline-block text-sm underline" href={item.sourceUrl} target="_blank" rel="noreferrer">
            主办方页面 ↗
          </a>
        ) : null}
      </section>

      {view.revealed ? (
        <section className="mt-4 rounded-lg border p-6">
          <h2 className="text-xl font-bold">
            {view.match ? MATCH_HEADLINE[view.match] : '发起人还没表态'}
          </h2>
          <ul className="mt-3 space-y-1 text-sm">
            <li>发起人：{view.inviterVote ? VOTE_LABEL[view.inviterVote] : '—'}</li>
            {view.replies?.map((r, i) => (
              <li key={i} className={r.isMe ? 'font-bold' : ''}>{r.name}{r.isMe ? '（你）' : ''}：{VOTE_LABEL[r.vote]}</li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-gray-500">改主意了？点一下就能改。</p>
          {buttons}
        </section>
      ) : (
        <section className="mt-4 rounded-lg border p-6">
          <input className="w-full rounded border p-2" value={name} maxLength={20}
            onChange={(e) => setName(e.target.value)} placeholder="你的昵称" />
          {buttons}
          <p className="mt-3 text-xs text-gray-500">
            {view.replyCount ? `已有 ${view.replyCount} 人回复。` : ''}投完才能看到大家的选择。
          </p>
        </section>
      )}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </main>
  );
}
