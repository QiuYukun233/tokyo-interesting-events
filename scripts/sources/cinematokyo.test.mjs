import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CINEMATOKYO_SHOWTIMES_URL, aggregateRuns, cleanTitle, isTokyoCinema, isoDate, mapRecord, mapShowtime, runUrl,
} from './cinematokyo.mjs';

const source = { name: '東京ミニシアター上映時間', origin: 'https://cinematokyo.com' };

/** A trimmed real row from data/showtimes.json, shape verified 2026-09-02. */
const row = (extra = {}) => ({
  cinema_name: '神保町シアター',
  movie_title: '『 浪華悲歌 』',
  movie_title_en: 'Osaka Elegy',
  director: '溝口健二',
  year: '1936',
  country: null,
  runtime_min: '71',
  synopsis: 'かいせつ 電話交換手のアヤ子(山田)は、横領疑惑で失業した父の借金を肩代わりする約束で妻子持ちの会社社長と愛人契約を結ぶが…。',
  date_text: '2026-08-15',
  showtime: '11:00',
  detail_page_url: 'https://www.shogakukan.co.jp/jinbocho-theater/features/2026-08-15_mizoguchi-kenji-70th.html',
  program_title: '没後70年 映画監督・溝口健二の世界',
  purchase_url: null,
  tmdb_id: 43877,
  clean_title_jp: '浪華悲歌',
  movie_title_jp: '浪華悲歌',
  director_jp: '溝口健二',
  director_en: 'Kenji Mizoguchi',
  genres: ['ドラマ'],
  vote_average: 6.735,
  ...extra,
});

test('the showtimes file is the documented download, not a guessed endpoint', () => {
  assert.equal(CINEMATOKYO_SHOWTIMES_URL, 'https://cinematokyo.com/data/showtimes.json');
});

test('a normal row becomes a per-showtime candidate with the theatre as place', () => {
  const event = mapShowtime(row(), source);
  assert.equal(event.title, '浪華悲歌');
  assert.equal(event.place, '神保町シアター');
  assert.equal(event.startDate, '2026-08-15');
  assert.equal(event.endDate, undefined);
  assert.equal(event.time, '11:00');
  assert.equal(event.price, '详见活动页');
  assert.equal(event.category, 'ミニシアター上映');
  assert.equal(event.source, source.name);
  assert.equal(event.attribution, '没後70年 映画監督・溝口健二の世界');
  assert.match(event.description, /^監督：溝口健二｜電話交換手/);
  assert.ok(!event.description.includes('かいせつ'), 'the theatre\'s section label is stripped from the synopsis');
});

test('the source URL is a deep link into the aggregator, unique per cinema and film', () => {
  const url = runUrl('神保町シアター', '浪華悲歌');
  assert.ok(url.startsWith('https://cinematokyo.com/#'));
  const params = new URLSearchParams(url.split('#')[1]);
  assert.equal(params.get('view'), 'cinema');
  assert.equal(params.get('cinema'), '神保町シアター');
  assert.equal(params.get('q'), '浪華悲歌');
  // Same film at two theatres must not collide in stableEventId (which hashes sourceUrl).
  const a = mapShowtime(row(), source);
  const b = mapShowtime(row({ cinema_name: 'ユーロスペース' }), source);
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.sourceUrl, b.sourceUrl);
});

test('dates: only strict ISO is accepted; rows without a date are dropped', () => {
  assert.equal(isoDate('2026-09-02'), '2026-09-02');
  assert.equal(isoDate(' 2026-09-02 '), '2026-09-02');
  assert.equal(isoDate('2026/09/02'), null);
  assert.equal(isoDate('9月2日'), null);
  assert.equal(isoDate(null), null);
  assert.equal(mapShowtime(row({ date_text: null }), source), null);
  assert.equal(mapShowtime(row({ date_text: '' }), source), null);
  assert.equal(mapShowtime(row({ date_text: '未定' }), source), null);
});

test('titles fall back from clean_title_jp to the quoted raw title', () => {
  assert.equal(cleanTitle(row()), '浪華悲歌');
  assert.equal(cleanTitle(row({ clean_title_jp: null, movie_title_jp: null })), '浪華悲歌');
  assert.equal(cleanTitle({ movie_title: '「 顔 かお 」' }), '顔 かお');
  assert.equal(mapShowtime(row({ clean_title_jp: null, movie_title_jp: null, movie_title: '  ' }), source), null);
});

test('cinemas outside Tokyo are dropped — the site lists Kanagawa, Saitama and Chiba too', () => {
  assert.equal(isTokyoCinema('神保町シアター'), true);
  assert.equal(isTokyoCinema('kino cinéma立川髙島屋S.C.館'), true, 'Tachikawa is Tokyo');
  assert.equal(isTokyoCinema('横浜シネマリン'), false);
  assert.equal(isTokyoCinema('CINEMA AMIGO'), false, 'listed under 神奈川 by the site itself, no giveaway in the name');
  assert.equal(isTokyoCinema('千葉劇場'), false);
  assert.equal(isTokyoCinema('新・川崎シネマ'), false, 'unknown names still match the pattern');
  assert.equal(mapShowtime(row({ cinema_name: '川越スカラ座' }), source), null);
  assert.equal(mapShowtime(row({ cinema_name: '' }), source), null);
});

test('a missing director or synopsis leaves description partial or absent, never "監督："', () => {
  assert.equal(mapShowtime(row({ director: '', director_jp: null }), source).description.startsWith('電話交換手'), true);
  assert.equal(mapShowtime(row({ synopsis: null }), source).description, '監督：溝口健二');
  assert.equal('description' in mapShowtime(row({ director: null, director_jp: null, synopsis: '' }), source), false);
});

test('long synopses are clipped on a sentence boundary', () => {
  const synopsis = `${'あ'.repeat(200)}。${'い'.repeat(200)}。`;
  const { description } = mapShowtime(row({ synopsis }), source);
  assert.ok(description.length <= 300);
  assert.ok(description.endsWith('。'));
});

test('a run at one cinema folds into one candidate spanning first to last showing', () => {
  const showings = [
    mapRecord(row({ date_text: '2026-08-16', showtime: '17:45' }), source, 0),
    mapRecord(row({ date_text: '2026-08-15', showtime: '11:00' }), source, 1),
    mapRecord(row({ date_text: '2026-08-22', showtime: '11:00' }), source, 2),
  ];
  const runs = aggregateRuns(showings);
  assert.equal(runs.length, 1);
  const [run] = runs;
  assert.equal(run.startDate, '2026-08-15');
  assert.equal(run.endDate, '2026-08-22');
  assert.equal(run.time, '3回上映 · 11:00 / 17:45');
  assert.equal(run.place, '神保町シアター');
  assert.equal(run.title, '浪華悲歌');
  assert.ok(!('dates' in run) && !('times' in run) && !('count' in run), 'working sets do not leak into the candidate');
});

test('multi-theatre: the same film at three cinemas is three candidates, one per cinema', () => {
  const cinemas = ['神保町シアター', 'ユーロスペース', '新文芸坐'];
  const showings = cinemas.flatMap((cinema) => [
    mapRecord(row({ cinema_name: cinema, date_text: '2026-09-01' }), source),
    mapRecord(row({ cinema_name: cinema, date_text: '2026-09-03' }), source),
  ]);
  const runs = aggregateRuns(showings);
  assert.equal(runs.length, 3);
  assert.deepEqual(runs.map((run) => run.place).sort(), [...cinemas].sort());
  assert.equal(new Set(runs.map((run) => run.id)).size, 3);
  for (const run of runs) assert.equal(run.endDate, '2026-09-03');
});

test('a single-day run has no endDate; more than four distinct hours are elided', () => {
  const hours = ['10:00', '12:30', '15:00', '17:30', '20:00'];
  const runs = aggregateRuns(hours.map((showtime) => mapRecord(row({ showtime }), source)));
  assert.equal(runs.length, 1);
  assert.equal(runs[0].endDate, undefined);
  assert.equal(runs[0].time, '5回上映 · 10:00 / 12:30 / 15:00 / 17:30 ほか');
});

test('null rows from the mapper and an empty file both yield no candidates', () => {
  assert.deepEqual(aggregateRuns([]), []);
  assert.deepEqual(aggregateRuns([null, undefined]), []);
  assert.equal(mapRecord(null, source), null);
});
