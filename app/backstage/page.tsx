'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import backstageData from '../../data/backstage.json';
import styles from './backstage.module.css';

/**
 * Back office, read-only.
 *
 * The pool lives in SQLite and decisions are written by `npm run review`; this
 * page is the shareable window onto the same data, built from the exported
 * snapshot so the site stays a static build. Anything that changes state is
 * deliberately absent here — a public URL is the wrong place for it.
 */

type Item = {
  id: string;
  title: string;
  titleZh?: string;
  place?: string;
  time?: string;
  price?: string;
  startDate: string;
  endDate?: string;
  source?: string;
  sourceUrl?: string;
  category?: string;
  audience?: string;
  state: string;
  decidedBy?: string | null;
  reasons: string[];
  signals: string[];
};

type Group = { objectType: string; label: string; items: Item[] };

const groups = backstageData.groups as Group[];
const summary = backstageData.summary;

const STATE_LABELS: Record<string, string> = { pending: '待定', published: '已发布', rejected: '已排除' };
const DECIDER_LABELS: Record<string, string> = { human: '人工', legacy: '扩源前既有', 'ai:claude': 'AI 初筛（待复核）' };

function decidedByLabel(by?: string | null) {
  if (!by) return '';
  if (DECIDER_LABELS[by]) return DECIDER_LABELS[by];
  // The automatic gate will write `rule:<name>`; show which rule fired.
  return by.startsWith('rule:') ? `规则 ${by.slice(5)}` : by;
}

function when(item: Item) {
  const short = (date: string) => date.slice(5).replace('-', '.');
  return item.endDate && item.endDate !== item.startDate
    ? { main: short(item.startDate), sub: `→ ${short(item.endDate)}` }
    : { main: short(item.startDate), sub: item.startDate.slice(0, 4) };
}

export default function Backstage() {
  const [state, setState] = useState('全部');
  const [source, setSource] = useState('全部');

  const sources = useMemo(
    () => [...new Set(groups.flatMap((group) => group.items.map((item) => item.source)).filter(Boolean))].sort() as string[],
    [],
  );

  const visible = useMemo(
    () => groups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => (state === '全部' || item.state === state) && (source === '全部' || item.source === source),
        ),
      }))
      .filter((group) => group.items.length),
    [state, source],
  );

  const shown = visible.reduce((total, group) => total + group.items.length, 0);

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}>东</span>
          <span>东京有点意思</span>
        </Link>
        <div className={styles.navLinks}>
          <Link href="/">前台</Link>
          <Link href="/pool">池子</Link>
          <Link href="/backstage" aria-current="page"><b>后台</b></Link>
        </div>
      </nav>

      <header className={styles.head}>
        <div className={styles.kicker}>BACKSTAGE · 候选池</div>
        <h1>新来的东西，先在这儿。</h1>
        <p className={styles.lede}>
          抓到的候选先进后台，按方案 §4.1 的对象类型分门别类，
          <b>待定的不会自己上前台</b>——要么人放行，要么将来由自动闸门放行。
          这一页是只读的；改状态在本地后台 <code>npm run review</code>。
        </p>
      </header>

      <section className={styles.stats} aria-label="池子概况">
        <div className={`${styles.stat} ${styles.pending}`}>
          <b>{summary.pending}</b>
          <span>PENDING 待定</span>
        </div>
        <div className={styles.stat}>
          <b>{summary.published}</b>
          <span>PUBLISHED 已发布</span>
        </div>
        <div className={styles.stat}>
          <b>{summary.rejected}</b>
          <span>REJECTED 已排除</span>
        </div>
        <div className={styles.stat}>
          <b>{summary.total}</b>
          <span>TOTAL 候选总数</span>
        </div>
      </section>

      <div className={styles.controls}>
        {['全部', 'pending', 'published', 'rejected'].map((item) => (
          <button
            key={item}
            className={state === item ? styles.active : ''}
            onClick={() => setState(item)}
          >
            {item === '全部' ? '全部' : STATE_LABELS[item]}
          </button>
        ))}
        <select value={source} onChange={(event) => setSource(event.target.value)} aria-label="按来源筛选">
          <option>全部</option>
          {sources.map((item) => <option key={item}>{item}</option>)}
        </select>
        <span className={styles.count}>{shown} 条</span>
      </div>

      {visible.length === 0 && <div className={styles.section}><div className={styles.empty}>没有符合条件的候选。</div></div>}

      {visible.map((group) => (
        <section key={group.objectType} className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>{group.label}</h2>
            <em>{group.objectType.toUpperCase()}</em>
            <span>{group.items.length} 条</span>
          </div>
          <div className={styles.rows}>
            {group.items.map((item) => {
              const date = when(item);
              return (
                <article key={item.id} className={`${styles.row} ${styles[item.state] ?? ''}`}>
                  <div className={styles.when}>
                    {date.main}
                    <small>{date.sub}</small>
                  </div>
                  <div className={styles.what}>
                    <h3>
                      {item.sourceUrl
                        ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.titleZh || item.title}</a>
                        : (item.titleZh || item.title)}
                    </h3>
                    <div className={styles.meta}>
                      <span><b>{item.source || '编辑精选'}</b></span>
                      {item.place && <span>{item.place}</span>}
                      {item.category && <span>{item.category}</span>}
                      {item.audience && <span>来场对象 {item.audience}</span>}
                      {item.price && <span>{item.price}</span>}
                    </div>
                    {(item.reasons.length > 0 || item.signals.length > 0) && (
                      <div className={styles.codes}>
                        {item.reasons.map((code) => (
                          <span key={code} className={`${styles.code} ${code.startsWith('hard:') ? styles.hard : ''}`}>{code}</span>
                        ))}
                        {item.signals.filter((code) => !item.reasons.includes(code)).map((code) => (
                          <span key={code} className={`${styles.code} ${styles.signal}`}>{code}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className={`${styles.state} ${styles[item.state] ?? ''}`}>{STATE_LABELS[item.state] ?? item.state}</div>
                    {item.decidedBy && <span className={styles.by}>{decidedByLabel(item.decidedBy)}</span>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <footer className={styles.foot}>
        <b>为什么分这七类：</b>方案 §4.1 的统一对象模型。探索队列（§7.1）要求一轮里类型多样，
        而“全都叫活动”是没法保证多样性的。类型是从来源已有的证据推出来的，不是手填的。<br />
        <b>为什么待定不自动上前台：</b>发布是一次写进 <code>decisions</code> 表的判决，
        抓取永远碰不到那张表。今天由人放行，将来自动闸门写同一张表、只是署名从 <code>human</code> 变成 <code>rule:…</code>。
      </footer>
    </main>
  );
}
