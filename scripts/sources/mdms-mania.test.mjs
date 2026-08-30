import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMdmsMania } from './mdms-mania.mjs';

// Simplified but structurally faithful fixture: mdms-mania.com/store/tokyo/ is a
// single long article. Each shop is an <h3> (or, for a chain's other branches,
// an accordion <h4>) immediately followed by a <figure class="wp-block-table">
// whose rows are keyed by 住所/アクセス/電話番号/営業時間/公式サイト.
const HTML = `
<html><body>
<h3 class="wp-block-heading">ロストプロダクト シンジュクジンチ</h3>
<figure class="wp-block-table"><table><tbody>
<tr><th>住所</th><td>東京都新宿区新宿５丁目11-13 博雅ビル４階</td></tr>
<tr><th>アクセス</th><td>新宿三丁目より徒歩3分</td></tr>
<tr><th>電話番号</th><td>070-4480-5636</td></tr>
<tr><th>営業時間</th><td>平日：13:00-22:00<br>土日：9:00-22:00</td></tr>
<tr><th>公式サイト</th><td><a href="https://www.lostproduct.jp/shinjyuku/">ロストプロダクト シンジュクジンチ</a></td></tr>
</tbody></table></figure>
<h4 class="swell-block-accordion__label">ロストプロダクト オオサカジンチ</h4>
<figure class="wp-block-table"><table><tbody>
<tr><th>住所</th><td>大阪府大阪市淀川区西中島４丁目8-26</td></tr>
<tr><th>アクセス</th><td>西中島南方より徒歩3分</td></tr>
<tr><th>電話番号</th><td>&#8211;</td></tr>
<tr><th>営業時間</th><td>&#8211;</td></tr>
<tr><th>公式サイト</th><td><a href="https://www.lostproduct.jp/osaka/">ロストプロダクト オオサカジンチ</a></td></tr>
</tbody></table></figure>
<h3 class="wp-block-heading">Rabbithole(ラビットホール) 渋谷店</h3>
<figure class="wp-block-table"><table><tbody>
<tr><th>住所</th><td>東京都渋谷区宇田川町1-1 サンプルビル2階</td></tr>
<tr><th>アクセス</th><td>渋谷駅より徒歩5分</td></tr>
<tr><th>電話番号</th><td>&#8211;</td></tr>
<tr><th>営業時間</th><td>12:00-22:00</td></tr>
<tr><th>公式サイト</th><td><a href="https://rabbithole.example/shibuya/">Rabbithole 渋谷店</a></td></tr>
</tbody></table></figure>
</body></html>
`;

const source = { name: 'マダミスマニア', url: 'https://mdms-mania.com/store/tokyo/', startDate: '2026-08-30' };

test('parses a Tokyo shop into a place candidate', () => {
  const shops = parseMdmsMania(HTML, source);
  const shinjuku = shops.find((shop) => shop.title === 'ロストプロダクト シンジュクジンチ');
  assert.ok(shinjuku);
  assert.equal(shinjuku.place, '東京都新宿区新宿５丁目11-13 博雅ビル４階');
  assert.equal(shinjuku.startDate, '2026-08-30');
  assert.equal(shinjuku.ongoing, true);
  assert.equal(shinjuku.category, 'マーダーミステリー');
});

test('drops shops whose address is outside Tokyo', () => {
  const shops = parseMdmsMania(HTML, source);
  assert.equal(shops.some((shop) => shop.title.includes('オオサカ')), false);
});

test('reads accordion-branch shops the same way as top-level shops', () => {
  const shops = parseMdmsMania(HTML, source);
  const shibuya = shops.find((shop) => shop.title.includes('渋谷'));
  assert.ok(shibuya);
  assert.equal(shibuya.place, '東京都渋谷区宇田川町1-1 サンプルビル2階');
});

test('returns no candidates when the fixture has no shop tables', () => {
  assert.deepEqual(parseMdmsMania('<html><body><p>no shops here</p></body></html>', source), []);
});
