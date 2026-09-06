'use client';

import { useEffect, useMemo, useState } from 'react';
import eventData from '../data/events.json';

type EventItem = (typeof eventData.events)[number];
// Vibe chips are derived from the data, not listed by hand: when the sources
// started carrying performances a fourth vibe appeared and its events had no
// filter to reach them.
const vibes = [...new Set(eventData.events.map((event) => event.vibe))].filter(Boolean).sort();
const filters = ['全部', '今晚', '本周末', ...vibes];
// The home page is a shortlist, not the catalogue: the hottest few by
// source-reported interest. Most events carry no count, so ties are the common
// case: upcoming ones first (soonest start), then long-running ones already
// under way — otherwise a room-escape that opened in 2025 tops the page.
// /pool has everything.
const HOME_PICKS = 12;
const tokyoToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
// `today` is null during prerender and the first client render so both agree
// (the page is built on one day and viewed on another); the effect below then
// re-sorts with the real date.
const byHeat = (today: string | null) => (a: EventItem, b: EventItem) => {
  const upcoming = (event: EventItem) => (today && event.startDate >= today ? 1 : 0);
  return (b.popularity ?? 0) - (a.popularity ?? 0) || upcoming(b) - upcoming(a) || a.startDate.localeCompare(b.startDate);
};

function dayMeta(date: string) {
  const value = new Date(`${date}T12:00:00+09:00`);
  return { date: `${value.getMonth() + 1}.${String(value.getDate()).padStart(2, '0')}`, dow: value.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Tokyo' }).toUpperCase() };
}

function matchesDate(event: EventItem, filter: string) {
  const now = new Date();
  const eventDate = new Date(`${event.startDate}T12:00:00+09:00`);
  if (filter === '今晚') return eventDate.toDateString() === now.toDateString();
  if (filter === '本周末') {
    const days = Math.ceil((eventDate.getTime() - now.getTime()) / 86400000);
    return days >= 0 && days <= 7 && [0, 6].includes(eventDate.getDay());
  }
  return filter === '全部' || event.vibe === filter;
}

export default function Home() {
  const [filter, setFilter] = useState('全部');
  const [today, setToday] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setToday(tokyoToday()); }, []);
  const visible = useMemo(
    () => eventData.events.filter((event) => matchesDate(event, filter)).sort(byHeat(today)).slice(0, HOME_PICKS),
    [filter, today]);

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="#top" aria-label="东京有点意思首页"><span className="brand-mark">东</span><span>东京有点意思</span></a>
        <div className="nav-links"><a href="#events">找活动</a><a href="#about">这是什么</a><a className="submit-button" href="/queue">开始探索 ↗</a></div>
      </nav>
      <section className="hero" id="top">
        <p className="eyebrow"><span /> TOKYO, BUT LESS BORING</p>
        <h1>别再说东京<br />没有<span>意思</span>。</h1>
        <div className="hero-copy"><p>每天捞出那些不太好搜、但值得出门的活动。</p><div className="hero-actions"><a href="/queue">开始一轮探索 ↗</a><a href="/wantlist">查看想去清单</a></div></div>
        <a className="scroll-cue" href="#events">本周有什么 <span>↓</span></a>
        <div className="hero-stamp" aria-hidden="true">見つける<br /><b>↗</b></div>
      </section>
      <section className="ticker" aria-label="站点特点"><div>ONE GOOD PLAN <b>✦</b> 先找到一件值得出门的事 <b>✦</b> UPDATED EVERY DAY <b>✦</b> ONE GOOD PLAN</div></section>
      <section className="events-section" id="events">
        <div className="section-heading"><div><p className="section-kicker">CURATED THIS WEEK</p><h2>这周，去点不一样的。</h2></div><p className="update-note"><i /> {eventData.updatedAtLabel} 更新<br /><span>按热度挑 {HOME_PICKS} 条 · <a href="/queue">去探索队列 →</a> · <a href="/pool">看全部 {eventData.events.length} 条 →</a></span></p></div>
        <div className="filters" aria-label="筛选活动">{filters.map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
        {visible.length === 0 ? <div className="empty"><b>这格暂时空着。</b><span>换个口味看看，更新机器人今晚还会再来。</span></div> : null}
        <div className="event-grid">
          {visible.map((event) => {
            const meta = dayMeta(event.startDate);
            return <article className="event-card" key={event.id}>
              <div className="event-art" style={{ background: event.color }}>
                <div className="date-block"><b>{meta.date}</b><span>{meta.dow}</span></div><span className="art-word">TOKYO<br />ODDITY</span><span className="art-icon">{event.symbol}</span>
              </div>
              <div className="event-body"><span className="vibe">{event.vibe}</span><h3 lang="ja">{event.title}</h3><p className="event-zh">{event.titleZh}</p><dl><div><dt>地点</dt><dd>{event.place}</dd></div><div><dt>时间</dt><dd>{event.time}</dd></div><div><dt>费用</dt><dd>{event.price}</dd></div></dl><a className="source-link" href={event.sourceUrl} target="_blank" rel="noreferrer">查看主办方页面 ↗</a><a className="queue-card-link" href="/queue">在探索队列里判断 ↗</a></div>
            </article>;
          })}
        </div>
      </section>
      <section className="manifesto" id="about"><p>不是活动黄页，也不是无尽列表。</p><h2>先判断一件<br />真的有意思的事。</h2><span>想去的，会留在你的想去清单里。</span></section>

    </main>
  );
}
