// Spoken-word helpers. Every price/duration/date/time/reference ships twice:
// once machine-readable, once as a phrase the TTS agent reads verbatim.
// Currency/locale come from the tenant; defaults are INR / en-IN.

import { DateTime } from 'luxon';

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** Cardinal number to words. Handles 0 .. 999,999 (plenty for prices/durations). */
export function numberToWords(n: number): string {
  if (n < 0) return 'minus ' + numberToWords(-n);
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const r = n % 10;
    return r ? `${TENS[t]} ${ONES[r]}` : TENS[t];
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return r ? `${ONES[h]} hundred ${numberToWords(r)}` : `${ONES[h]} hundred`;
  }
  if (n < 100000) {
    const th = Math.floor(n / 1000);
    const r = n % 1000;
    return r ? `${numberToWords(th)} thousand ${numberToWords(r)}` : `${numberToWords(th)} thousand`;
  }
  const lakh = Math.floor(n / 100000);
  const r = n % 100000;
  return r ? `${numberToWords(lakh)} lakh ${numberToWords(r)}` : `${numberToWords(lakh)} lakh`;
}

const ORDINALS: Record<number, string> = {
  1: 'first', 2: 'second', 3: 'third', 5: 'fifth', 8: 'eighth', 9: 'ninth',
  12: 'twelfth', 20: 'twentieth', 30: 'thirtieth',
};

/** Ordinal words for day-of-month, e.g. 15 -> "fifteenth". */
export function ordinalToWords(n: number): string {
  if (ORDINALS[n]) return ORDINALS[n];
  if (n < 20) return numberToWords(n).replace(/t$/, 'th').replace(/([^t])$/, '$1th');
  const t = Math.floor(n / 10) * 10;
  const r = n % 10;
  if (r === 0) return TENS[t / 10] + 'ieth';
  return `${TENS[t / 10]} ${ORDINALS[r] ?? numberToWords(r) + 'th'}`;
}

const CURRENCY_WORDS: Record<string, { singular: string; plural: string }> = {
  INR: { singular: 'rupee', plural: 'rupees' },
  USD: { singular: 'dollar', plural: 'dollars' },
  EUR: { singular: 'euro', plural: 'euros' },
  GBP: { singular: 'pound', plural: 'pounds' },
};

/** e.g. priceToWords(800, "INR") -> "eight hundred rupees". */
export function priceToWords(amount: number, currency = 'INR'): string {
  const words = CURRENCY_WORDS[currency] ?? { singular: currency, plural: currency };
  const unit = amount === 1 ? words.singular : words.plural;
  return `${numberToWords(amount)} ${unit}`;
}

/** e.g. 60 -> "about one hour", 210 -> "about three and a half hours". */
export function durationToWords(minutes: number | null): string | null {
  if (minutes == null) return null;
  if (minutes < 60) return `about ${numberToWords(minutes)} minutes`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  const hourWord = hours === 1 ? 'hour' : 'hours';
  if (rem === 0) return `about ${numberToWords(hours)} ${hourWord}`;
  if (rem === 30) return `about ${numberToWords(hours)} and a half hours`;
  return `about ${numberToWords(hours)} ${hourWord} and ${numberToWords(rem)} minutes`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "2026-09-15" -> "Tuesday the fifteenth of September". */
export function dateToWords(dateISO: string): string {
  const dt = DateTime.fromISO(dateISO);
  const weekday = WEEKDAY_NAMES[dt.weekday - 1];
  const day = ordinalToWords(dt.day);
  const month = MONTHS[dt.month - 1];
  return `${weekday} the ${day} of ${month}`;
}

/** "14:30" -> "half past two in the afternoon"; "10:00" -> "ten in the morning". */
export function timeToWords(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h < 12 ? 'in the morning' : h < 17 ? 'in the afternoon' : 'in the evening';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  let core: string;
  if (m === 0) core = numberToWords(twelve);
  else if (m === 15) core = `quarter past ${numberToWords(twelve)}`;
  else if (m === 30) core = `half past ${numberToWords(twelve)}`;
  else if (m === 45) core = `quarter to ${numberToWords(twelve === 12 ? 1 : twelve + 1)}`;
  else core = `${numberToWords(twelve)} ${numberToWords(m)}`;
  return `${core} ${period}`;
}

/** "B729" -> "B seven two nine" — spell it out so TTS never mangles it. */
export function referenceToWords(ref: string): string {
  return ref
    .split('')
    .map((ch) => (/\d/.test(ch) ? numberToWords(Number(ch)) : ch.toUpperCase()))
    .join(' ');
}
