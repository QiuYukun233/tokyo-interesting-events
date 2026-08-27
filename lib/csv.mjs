/**
 * CSV reading for Japanese open data.
 *
 * Two things here are not optional, both learned by getting them wrong:
 *
 * 1. Tokyo's open data CSVs are Shift_JIS. Reading them as UTF-8 yields pure
 *    mojibake, and the failure is silent — you get strings, just wrong ones.
 * 2. Fields contain quoted commas AND quoted newlines. Splitting on lines and
 *    then on commas counted 3,091 rows in a file that actually has 9.
 */

/** Above this share of replacement characters, a decoding is judged wrong. */
const MOJIBAKE_RATIO = 0.002;

const replacementRatio = (text) => (text.match(/\uFFFD/g)?.length ?? 0) / Math.max(text.length, 1);

/**
 * Decode bytes, preferring UTF-8 and falling back to Shift_JIS.
 *
 * Counting U+FFFD is the discriminator: a Shift_JIS file read as UTF-8 produces
 * them in bulk, while genuine UTF-8 produces none.
 *
 * @param {Uint8Array|Buffer} bytes
 * @returns {{text: string, encoding: 'utf-8'|'shift_jis'}}
 */
export function decodeCsvBytes(bytes) {
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  if (replacementRatio(utf8) <= MOJIBAKE_RATIO) return { text: utf8, encoding: 'utf-8' };
  try {
    const sjis = new TextDecoder('shift_jis').decode(bytes);
    if (replacementRatio(sjis) < replacementRatio(utf8)) return { text: sjis, encoding: 'shift_jis' };
  } catch {
    // Runtime without the shift_jis label; fall through to UTF-8.
  }
  return { text: utf8, encoding: 'utf-8' };
}

/**
 * Parse CSV into rows of raw string cells (RFC 4180: `""` escapes a quote).
 * Handles quoted commas and quoted newlines. Blank rows are dropped.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const pushRow = () => {
    row.push(cell);
    cell = '';
    if (row.some((value) => value.trim() !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') { cell += char; continue; }
      if (text[i + 1] === '"') { cell += '"'; i += 1; continue; }
      quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') pushRow();
    else if (char !== '\r') cell += char;
  }
  pushRow();
  return rows;
}

/**
 * Parse CSV into objects keyed by the header row.
 * Strips the UTF-8 BOM and trims header names; short rows yield ''.
 */
export function parseCsvRecords(text) {
  const [header, ...body] = parseCsv(text);
  if (!header) return { columns: [], records: [] };
  const columns = header.map((name, index) => (index === 0 ? name.replace(/^\uFEFF/, '') : name).trim());
  const records = body.map((row) => Object.fromEntries(columns.map((name, index) => [name, (row[index] ?? '').trim()])));
  return { columns, records };
}

/** Decode and parse in one step. */
export function readCsvRecords(bytes) {
  const { text, encoding } = decodeCsvBytes(bytes);
  return { ...parseCsvRecords(text), encoding };
}
