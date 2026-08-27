"use client";

import { useMemo, useState } from "react";
import eventData from "../../data/events.json";
import styles from "./pool.module.css";

type EventItem = {
  id: string;
  title: string;
  titleZh: string;
  place: string;
  time: string;
  price: string;
  startDate: string;
  vibe: string;
  color: string;
  sourceUrl: string;
  why?: string;
  imageUrl?: string;
  changeType?: "opening" | "closing" | "new-format" | string;
  attribution?: string;
};

const events = eventData.events as EventItem[];
const filters = ["全部", "限时活动", "艺术现场", "店铺动态"] as const;

function matches(event: EventItem, filter: (typeof filters)[number]) {
  if (filter === "全部") return true;
  if (filter === "店铺动态") return Boolean(event.changeType);
  if (filter === "艺术现场") return /艺术|展|museum|art/i.test(`${event.vibe} ${event.title} ${event.titleZh}`);
  return !event.changeType;
}

function changeLabel(changeType?: string) {
  if (changeType === "opening") return "新开店";
  if (changeType === "closing") return "即将闭店";
  if (changeType === "new-format") return "新业态";
  return null;
}

export default function EventPoolPage() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("全部");
  const visible = useMemo(() => events.filter((event) => matches(event, filter)), [filter]);

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <a href="/" className={styles.back}>← 东京不无聊</a>
        <p className={styles.eyebrow}>DISCOVERY POOL · TOKYO</p>
        <h1>先告诉你，<br />为什么值得去。</h1>
        <p>官方图片、编辑理由、店铺状态与原始出处放在同一张卡片里。喜欢以后，再找谁一起去。</p>
      </header>

      <nav className={styles.filters} aria-label="活动筛选">
        {filters.map((item) => (
          <button key={item} className={filter === item ? styles.active : ""} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
      </nav>

      <section className={styles.grid} aria-live="polite">
        {visible.map((event) => {
          const shopLabel = changeLabel(event.changeType);
          return (
            <article className={styles.card} key={event.id}>
              <div
                className={`${styles.art} ${event.imageUrl ? styles.hasImage : ""}`}
                style={{
                  backgroundColor: event.color,
                  backgroundImage: event.imageUrl
                    ? `linear-gradient(180deg, rgba(10,10,10,.06), rgba(10,10,10,.7)), url("${event.imageUrl}")`
                    : undefined,
                }}
              >
                <span className={styles.date}>{event.startDate}</span>
                <span className={styles.badge}>{shopLabel ?? event.vibe}</span>
              </div>
              <div className={styles.body}>
                <h2 lang="ja">{event.title}</h2>
                <p className={styles.zh}>{event.titleZh}</p>
                {event.why && <p className={styles.why}><strong>值得去</strong>{event.why}</p>}
                <dl>
                  <div><dt>地点</dt><dd>{event.place}</dd></div>
                  <div><dt>时间</dt><dd>{event.time}</dd></div>
                  <div><dt>费用</dt><dd>{event.price}</dd></div>
                </dl>
                <a href={event.sourceUrl} target="_blank" rel="noreferrer">
                  {event.attribution ? `${event.attribution}报道` : "查看主办方页面"} ↗
                </a>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
