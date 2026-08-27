import test from "node:test";
import assert from "node:assert/strict";
import { classifyActivity, dedupeActivities, filterAndDedupeActivities, normalizeTitle, normalizeUrl } from "./activity-filter.mjs";

test("normalizes Japanese titles and URL tracking noise", () => {
  assert.equal(normalizeTitle("【ロボット・展】"), "ロボット展");
  assert.equal(normalizeUrl("HTTPS://EXAMPLE.COM/a/?utm_source=x#top"), "https://example.com/a");
});

test("excludes explicit recruitment, school, and B2B sales", () => {
  for (const title of ["IT業界 合同説明会", "採用情報・会社説明会", "入試相談会", "出展者募集 商談会"]) assert.equal(classifyActivity({ title }).decision, "exclude");
  assert.notEqual(classifyActivity({ title: "独立出版 即売会" }).decision, "exclude");
});

test("keeps public robot/model experiences and exposes publishable", () => {
  assert.equal(classifyActivity({ title: "ロボット・AI展示会 一般来場者向け体験" }).publishable, true);
  assert.equal(classifyActivity({ title: "第12回 業界フォーラム" }).publishable, false);
});

test("dedupes same normalized title/date across different URLs", () => {
  const result = dedupeActivities([
    { title: "【新・発見】", url: "https://a.test/one", startDate: "2026-09-01T10:00:00+09:00" },
    { title: "新発見", url: "https://b.test/two", date: "2026-09-01" },
    { title: "新発見", url: "https://c.test/three", date: "2026-09-02" },
  ]);
  assert.equal(result.length, 2);
});

test("filters before dedupe and returns review queue", () => {
  const result = filterAndDedupeActivities([
    { title: "採用説明会", url: "https://x.test/1" },
    { title: "ロボット展", url: "https://x.test/2" },
    { title: "第12回 業界フォーラム", url: "https://x.test/3" },
  ]);
  assert.equal(result.excluded.length, 1); assert.equal(result.activities.length, 2); assert.equal(result.review.length, 1); assert.equal(result.review[0].publishable, false);
});
