import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeCsvBytes, parseCsv, parseCsvRecords, readCsvRecords } from './csv.mjs';

/** Encode a string as Shift_JIS the way Tokyo's open data files are. */
const toShiftJis = (text) => {
  // Only the few kana/kanji the tests need; enough to prove the sniffing works.
  const table = { '展': [0x93, 0x57], '示': [0x8e, 0xa6], '会': [0x89, 0xef], '名': [0x96, 0xbc], '一': [0x88, 0xea], '般': [0x94, 0xca] };
  const bytes = [];
  for (const char of text) {
    if (table[char]) bytes.push(...table[char]);
    else bytes.push(char.charCodeAt(0));
  }
  return Uint8Array.from(bytes);
};

test('splits plain rows and cells', () => {
  assert.deepEqual(parseCsv('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
});

test('a quoted comma does not split the cell', () => {
  assert.deepEqual(parseCsv('a,b\n"x,1",2\n'), [['a', 'b'], ['x,1', '2']]);
});

test('a quoted newline does not end the row', () => {
  // The bug this guards: a naive line split counted 3,091 rows in a 9-row file.
  const rows = parseCsv('a,b\n"line\nbreak",2\n"another\nmulti\nline",3\n');
  assert.equal(rows.length, 3);
  assert.equal(rows[1][0], 'line\nbreak');
  assert.equal(rows[2][0], 'another\nmulti\nline');
});

test('a doubled quote is an escaped quote', () => {
  assert.deepEqual(parseCsv('a\n"say ""hi"""\n'), [['a'], ['say "hi"']]);
});

test('blank rows are dropped and CRLF is tolerated', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n\r\n'), [['a', 'b'], ['1', '2']]);
});

test('a final row without a trailing newline is kept', () => {
  assert.deepEqual(parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
});

test('records are keyed by trimmed header names', () => {
  const { columns, records } = parseCsvRecords('name , date\nMaker Faire,2026-09-05\n');
  assert.deepEqual(columns, ['name', 'date']);
  assert.deepEqual(records, [{ name: 'Maker Faire', date: '2026-09-05' }]);
});

test('a UTF-8 BOM is stripped from the first column name', () => {
  const { columns } = parseCsvRecords('﻿展示会名,会期\nx,y\n');
  assert.equal(columns[0], '展示会名');
});

test('a short row yields empty strings rather than undefined', () => {
  const { records } = parseCsvRecords('a,b,c\n1\n');
  assert.deepEqual(records, [{ a: '1', b: '', c: '' }]);
});

test('empty input does not throw', () => {
  assert.deepEqual(parseCsvRecords(''), { columns: [], records: [] });
});

test('UTF-8 bytes decode as UTF-8', () => {
  const { text, encoding } = decodeCsvBytes(new TextEncoder().encode('展示会名,一般\n'));
  assert.equal(encoding, 'utf-8');
  assert.equal(text, '展示会名,一般\n');
});

test('Shift_JIS bytes are detected and decoded, not silently mangled', () => {
  const { text, encoding } = decodeCsvBytes(toShiftJis('展示会名,一般\n'));
  assert.equal(encoding, 'shift_jis');
  assert.equal(text, '展示会名,一般\n');
});

test('readCsvRecords decodes and parses Shift_JIS in one step', () => {
  const { columns, records, encoding } = readCsvRecords(toShiftJis('展示会名\n一般\n'));
  assert.equal(encoding, 'shift_jis');
  assert.deepEqual(columns, ['展示会名']);
  assert.deepEqual(records, [{ 展示会名: '一般' }]);
});

test('ASCII-only bytes are treated as UTF-8', () => {
  assert.equal(decodeCsvBytes(Uint8Array.from(Buffer.from('a,b\n1,2\n'))).encoding, 'utf-8');
});
