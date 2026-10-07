import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

// Strict parsing (dayjs(text, format, true)) needs this plugin.
dayjs.extend(customParseFormat);

const SEPARATORS = new Set(['.', ',', '/', '-', ' ']);
// Longest month each day count fits (February counted as 29, the year may not be typed yet).
const MAX_DAY_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Masks typed text to DD.MM.YYYY as it is entered: dots appear on their own, a digit that would
 * make an impossible day (00, 32+), month (00, 13+, or 31 for a 30-day month) or a year outside
 * 1900–2099 is dropped, and a lone 4–9 day or 2–9 month digit is padded to "0X". Feb 29 in a
 * non-leap year still gets through and is caught by the strict parse on commit.
 */
export function maskDateInput(raw: string): string {
  const iso = dayjs(raw.trim(), 'YYYY-MM-DD', true);
  if (iso.isValid()) return iso.format('DD.MM.YYYY');

  const groups: string[] = [];
  let cur = '';
  const close = (group: string) => {
    groups.push(group);
    cur = '';
  };

  for (const ch of raw) {
    if (groups.length === 3) break;
    if (SEPARATORS.has(ch)) {
      // "7." means day 07: a separator after one digit closes the day or month group.
      if (groups.length < 2 && cur.length === 1 && cur !== '0') close(`0${cur}`);
      continue;
    }
    if (ch < '0' || ch > '9') continue;

    const next = cur + ch;
    if (groups.length === 0) {
      if (next.length === 1 && ch > '3') close(`0${ch}`);
      else if (next.length === 2 && (next === '00' || Number(next) > 31)) continue;
      else if (next.length === 2) close(next);
      else cur = next;
    } else if (groups.length === 1) {
      const day = Number(groups[0]);
      const fits = (month: string) => day <= MAX_DAY_IN_MONTH[Number(month) - 1];
      if (next.length === 1 && ch > '1') {
        if (fits(`0${ch}`)) close(`0${ch}`);
      } else if (next.length === 2) {
        if (next !== '00' && Number(next) <= 12 && fits(next)) close(next);
      } else cur = next;
    } else {
      // 19xx or 20xx only: a mistyped extra digit can't push the year into the far future.
      if (next.length === 1 && ch !== '1' && ch !== '2') continue;
      if (next.length === 2 && next !== '19' && next !== '20') continue;
      cur = next;
      if (cur.length === 4) close(cur);
    }
  }

  return [...groups, cur].filter(Boolean).join('.');
}
