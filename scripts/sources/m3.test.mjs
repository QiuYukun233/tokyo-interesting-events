import test from 'node:test';
import assert from 'node:assert/strict';
import { M3_GENRES, activeExhibition, eventDateToJst, genreLabel, mapCircle, mapCircles } from './m3.mjs';

const source = { name: 'M3 2026春', edition: '2026s', startDate: '2026-04-25', venue: '東京流通センター（大田区平和島）' };

const circle = (overrides = {}) => ({
  id: 570001,
  name: 'Ayamelon',
  phonetic: 'アヤメロン',
  genre: 'A14',
  adult: false,
  prText: 'Ayamelonによる怒涛のデジタルJ-POP',
  links: { twitter: { serviceName: 'twitter', text: '', url: 'https://x.com/ayamelon56s' } },
  keywords: [{ text: 'デジタルJ-POP' }, { text: '東方Project' }],
  area: 'あ',
  number: '04a',
  ...overrides,
});

test('a circle maps to a candidate with its space, genre label and own pitch', () => {
  const event = mapCircle(circle(), source);
  assert.equal(event.title, 'Ayamelon');
  assert.equal(event.startDate, '2026-04-25');
  assert.equal(event.place, '東京流通センター（大田区平和島） · あ-04a');
  assert.equal(event.category, 'アニメ/ゲーム系：東方project');
  assert.equal(event.sourceUrl, 'https://catalog.m3net.jp/2026s/circles/570001');
});

test('the description is the circle\'s own PR text and its own keywords, nothing invented', () => {
  const event = mapCircle(circle(), source);
  assert.equal(event.description, 'Ayamelonによる怒涛のデジタルJ-POP / #デジタルJ-POP #東方Project');
});

test('a circle with no PR text still carries its keywords', () => {
  const event = mapCircle(circle({ prText: '' }), source);
  assert.equal(event.description, '#デジタルJ-POP #東方Project');
});

test('a circle with neither PR text nor keywords omits description rather than emitting empty', () => {
  const event = mapCircle(circle({ prText: '', keywords: [] }), source);
  assert.ok(!('description' in event));
});

test('an official site wins over the social link, and some link is always preferred to none', () => {
  const withSite = mapCircle(circle({ links: { twitter: { url: 'https://x.com/a' }, site: { url: 'https://example.test/' } } }), source);
  assert.equal(withSite.attribution, 'https://example.test/');
  assert.equal(mapCircle(circle(), source).attribution, 'https://x.com/ayamelon56s');
  assert.ok(!('attribution' in mapCircle(circle({ links: {} }), source)));
});

test('an unknown genre code passes through instead of vanishing', () => {
  // The API publishes no genre lookup; a new code must stay visible.
  assert.equal(genreLabel('A01'), M3_GENRES.A01);
  assert.equal(genreLabel('Z99'), 'Z99');
  assert.equal(genreLabel(undefined), undefined);
});

test('an adult circle is flagged on audience rather than dropped at crawl time', () => {
  assert.equal(mapCircle(circle({ adult: true }), source).audience, 'R-18');
  assert.ok(!('audience' in mapCircle(circle(), source)));
});

test('a circle missing a name, or an edition with no date, produces nothing', () => {
  assert.equal(mapCircle(circle({ name: '' }), source), null);
  assert.equal(mapCircle(circle(), { ...source, startDate: undefined }), null);
});

test('a circle with no space assignment still places at the venue', () => {
  const event = mapCircle(circle({ area: '', number: '' }), source);
  assert.equal(event.place, '東京流通センター（大田区平和島）');
});

test('ids are distinct per circle and stable across runs', () => {
  const [a, b] = mapCircles({ items: [circle(), circle({ id: 570002, name: 'Other' })] }, source);
  assert.notEqual(a.id, b.id);
  assert.equal(a.id, mapCircle(circle(), source).id);
});

test('mapCircles accepts both the wrapped and the bare array shape', () => {
  assert.equal(mapCircles({ items: [circle()] }, source).length, 1);
  assert.equal(mapCircles([circle()], source).length, 1);
  assert.deepEqual(mapCircles({ items: [] }, source), []);
});

test('the active edition is chosen, falling back to the newest when none is flagged', () => {
  const payload = {
    items: [
      { id: '2025f', name: 'M3 2025秋', isActive: false, updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: '2026s', name: 'M3 2026春', isActive: true, updatedAt: '2026-02-27T03:34:22.790Z' },
    ],
  };
  assert.equal(activeExhibition(payload).id, '2026s');
  const noneActive = { items: payload.items.map((item) => ({ ...item, isActive: false })) };
  assert.equal(activeExhibition(noneActive).id, '2026s', 'falls back to most recently updated');
  assert.equal(activeExhibition({ items: [] }), null);
});

test('eventDate is read in Tokyo time, not UTC', () => {
  // 15:00Z is midnight the next day in JST; reading it as UTC loses a day.
  assert.equal(eventDateToJst('2026-04-24T15:00:00.000Z'), '2026-04-25');
  assert.equal(eventDateToJst(null), null);
  assert.equal(eventDateToJst('not a date'), null);
});
