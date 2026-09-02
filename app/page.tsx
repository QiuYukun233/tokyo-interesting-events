'use client';

import { FormEvent, useMemo, useState } from 'react';
import eventData from '../data/events.json';

type EventItem = (typeof eventData.events)[number];
// Vibe chips are derived from the data, not listed by hand: when the sources
// started carrying performances a fourth vibe appeared and its events had no
// filter to reach them.
const vibes = [...new Set(eventData.events.map((event) => event.vibe))].filter(Boolean).sort();
const filters = ['全部', '今晚', '本周末', ...vibes];
// The home page is a shortlist, not the catalogue: the hottest few by
// source-reported interest, ties broken by soonest start. /pool has everything.
const HOME_PICKS = 12;
const byHeat = (a: EventItem, b: EventItem) =>
  (b.popularity ?? 0) - (a.popularity ?? 0) || a.startDate.localeCompare(b.startDate);

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
  const [saved, setSaved] = useState<string[]>([]);
  const [joining, setJoining] = useState<EventItem | null>(null);
  const [joined, setJoined] = useState<string[]>([]);
  const visible = useMemo(
    () => eventData.events.filter((event) => matchesDate(event, filter)).sort(byHeat).slice(0, HOME_PICKS),
    [filter]);

  function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (joining) setJoined((old) => [...old, joining.id]);
  }

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="#top" aria-label="东京有点意思首页"><span className="brand-mark">东</span><span>东京有点意思</span></a>
        <div className="nav-links"><a href="#events">找活动</a><a href="#about">这是什么</a><button className="submit-button">＋ 推荐一个</button></div>
      </nav>
      <section className="hero" id="top">
        <p className="eyebrow"><span /> TOKYO, BUT LESS BORING</p>
        <h1>别再说东京<br />没有<span>意思</span>。</h1>
        <p className="hero-copy">每天捞出那些不太好搜、但值得出门的活动。<br />顺便，找一个也想去的人。</p>
        <a className="scroll-cue" href="#events">本周有什么 <span>↓</span></a>
        <div className="hero-stamp" aria-hidden="true">会おう<br /><b>↗</b></div>
      </section>
      <section className="ticker" aria-label="站点特点"><div>NO MEETUP SMALL TALK <b>✦</b> 只用一件有趣的事开始认识 <b>✦</b> UPDATED EVERY DAY <b>✦</b> NO MEETUP SMALL TALK</div></section>
      <section className="events-section" id="events">
        <div className="section-heading"><div><p className="section-kicker">CURATED THIS WEEK</p><h2>这周，去点不一样的。</h2></div><p className="update-note"><i /> {eventData.updatedAtLabel} 更新<br /><span>按热度挑 {HOME_PICKS} 条 · <a href="/pool">看全部 {eventData.events.length} 条 →</a></span></p></div>
        <div className="filters" aria-label="筛选活动">{filters.map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
        {visible.length === 0 ? <div className="empty"><b>这格暂时空着。</b><span>换个口味看看，更新机器人今晚还会再来。</span></div> : null}
        <div className="event-grid">
          {visible.map((event, index) => {
            const meta = dayMeta(event.startDate);
            return <article className="event-card" key={event.id}>
              <div className="event-art" style={{ background: event.color }}>
                <div className="date-block"><b>{meta.date}</b><span>{meta.dow}</span></div><span className="art-word">TOKYO<br />ODDITY</span><span className="art-icon">{event.symbol}</span>
                <button className={`save ${saved.includes(event.id) ? 'saved' : ''}`} onClick={() => setSaved((old) => old.includes(event.id) ? old.filter((id) => id !== event.id) : [...old, event.id])} aria-label={saved.includes(event.id) ? '取消收藏' : '收藏活动'}>{saved.includes(event.id) ? '♥' : '♡'}</button>
              </div>
              <div className="event-body"><span className="vibe">{event.vibe}</span><h3 lang="ja">{event.title}</h3><p className="event-zh">{event.titleZh}</p><dl><div><dt>地点</dt><dd>{event.place}</dd></div><div><dt>时间</dt><dd>{event.time}</dd></div><div><dt>费用</dt><dd>{event.price}</dd></div></dl><a className="source-link" href={event.sourceUrl} target="_blank" rel="noreferrer">查看主办方页面 ↗</a><div className="mate-row"><div className="faces"><span>ア</span><span>林</span><span>J</span></div><p><b>{2 + index} 人</b>想找人一起</p><button onClick={() => setJoining(event)}>{joined.includes(event.id) ? '已发起 ✓' : '我也想去 ↗'}</button></div></div>
            </article>;
          })}
        </div>
      </section>
      <section className="manifesto" id="about"><p>不是相亲，不是硬聊。</p><h2>先一起去做一件<br />真的有意思的事。</h2><span>如果聊得来，那是彩蛋。</span></section>

      {joining ? <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setJoining(null)}>
        <section className="join-modal" role="dialog" aria-modal="true" aria-labelledby="join-title">
          <button className="modal-close" onClick={() => setJoining(null)} aria-label="关闭">×</button>
          {joined.includes(joining.id) ? <div className="joined-state"><span>✓</span><h2>同行邀请已准备好</h2><p>首版先保存在这台设备。接入账号后，它会公开给同样想去的人。</p><button onClick={() => setJoining(null)}>知道了</button></div> : <form onSubmit={submitJoin}>
            <p className="section-kicker">FIND A PLUS-ONE</p><h2 id="join-title">不硬聊，先约件事。</h2><p className="join-event">{joining.titleZh}</p>
            <label>别人怎么叫你<input name="name" placeholder="昵称就好" required maxLength={20} /></label>
            <label>想找什么样的同行<textarea name="note" placeholder="比如：第一次去，想找会日语的人；结束后可以一起喝一杯。" required maxLength={120} /></label>
            <div className="safety-note"><b>见面小原则</b><span>公共场所碰面 · 不交换敏感信息 · 随时可以离开</span></div>
            <button className="join-submit">发起同行邀请 ↗</button>
          </form>}
        </section>
      </div> : null}
    </main>
  );
}
