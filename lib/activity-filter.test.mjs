import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyActivity,
  dedupeActivities,
  filterAndDedupeActivities,
  normalizeTitle,
  normalizeUrl,
} from "./activity-filter.mjs";

test("normalizes Japanese titles and URL tracking noise", () => {
  assert.equal(normalizeTitle("【ロボット・展】"), "ロボット展");
  assert.equal(normalizeUrl("HTTPS://EXAMPLE.COM/a/?utm_source=x#top"), "https://example.com/a");
});

test("hard excludes recruitment, school, and pure sales listings", () => {
  for (const title of ["IT業界 合同説明会", "採用情報・会社説明会", "入試相談会", "秋の特売 SALE"]) {
    assert.equal(classifyActivity({ title }).decision, "exclude", title);
  }
});

test("keeps public robot/model experiences despite trade-show wording", () => {
  assert.equal(classifyActivity({ title: "ロボット・AI展示会 一般来場者向け体験" }).decision, "keep");
  assert.equal(classifyActivity({ title: "模型・フィギュア展" }).decision, "keep");
});

test("uses review for unknown activities instead of silently publishing", () => {
  assert.equal(classifyActivity({ title: "第12回 業界フォーラム" }).decision, "review");
});

test("dedupes canonical URLs and exact normalized titles", () => {
  const result = dedupeActivities([
    { title: "展覧会", url: "https://example.com/event?utm_campaign=x" },
    { title: "別タイトル", url: "https://example.com/event/" },
    { title: "【新・発見】" },
    { title: "新発見" },
  ]);
  assert.equal(result.length, 2);
});

test("filter pipeline excludes before dedupe and exposes review queue", () => {
  const result = filterAndDedupeActivities([
    { title: "採用説明会", url: "https://x.test/1" },
    { title: "ロボット展", url: "https://x.test/2" },
    { title: "街角の小さな展示", url: "https://x.test/3" },
  ]);
  assert.equal(result.excluded.length, 1);
  assert.equal(result.activities.length, 2);
  assert.equal(result.review.length, 1);
});

