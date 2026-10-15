import type { FieldDef } from './schema.ts';

export type FieldValue = string | number | null;
export type CoerceResult = { ok: true; value: FieldValue } | { ok: false; error: string };

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

const MAX_TEXT = 500;
const MAX_TEXTAREA = 4000;
const MAX_MONEY = 100_000_000;

function isBlank(raw: unknown): boolean {
  return raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function isValidDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1900 || y > 2150 || m < 1 || m > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dim;
}

/** Parse UK-style dates. Ambiguous numeric dates are read as DD/MM/YYYY. */
export function parseDate(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/,/g, ' ');
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isValidDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/);
  if (m) {
    let y = Number(m[3]);
    if (m[3].length === 2) y += y > 40 ? 1900 : 2000;
    const [d, mo] = [Number(m[1]), Number(m[2])];
    return isValidDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  m = s.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (m && MONTHS[m[2]]) {
    const [d, mo, y] = [Number(m[1]), MONTHS[m[2]], Number(m[3])];
    return isValidDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  m = s.match(/^([a-z]+)\s+(\d{1,2})\s+(\d{4})$/);
  if (m && MONTHS[m[1]]) {
    const [mo, d, y] = [MONTHS[m[1]], Number(m[2]), Number(m[3])];
    return isValidDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  return null;
}

/** "£45,000", "45k", "1.2m", "45000.50", 45000 → number (pounds). */
export function parseMoney(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  let s = raw.trim().toLowerCase().replace(/gbp|£|,|\s/g, '');
  s = s.replace(/(per|a|p)(year|annum|month|week|yr|mo|m|a)$/, '').replace(/\/(year|yr|month|mo|pa|pm)$/, '');
  s = s.replace(/(pa|pcm|pm)$/, '');
  const m = s.match(/^(-?\d+(?:\.\d+)?)(k|m|million|thousand)?$/);
  if (!m) return null;
  let n = Number(m[1]);
  const mult = m[2];
  if (mult === 'k' || mult === 'thousand') n *= 1_000;
  if (mult === 'm' || mult === 'million') n *= 1_000_000;
  return Math.round(n * 100) / 100;
}

export function parseNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const s = raw.trim().replace(/,/g, '').replace(/%$/, '').replace(/\s*(years?|yrs?)$/i, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

const UK_POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/;

export function normalisePostcode(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  const m = s.match(UK_POSTCODE);
  return m ? `${m[1]} ${m[2]}` : null;
}

export function normalisePhone(raw: string): string | null {
  const s = raw.trim().replace(/[\s()\-.]/g, '');
  if (!/^\+?\d{10,14}$/.test(s)) return null;
  return s;
}

function matchOption(raw: string, options: readonly string[]): string | null {
  const s = raw.trim().toLowerCase();
  const exact = options.find((o) => o.toLowerCase() === s);
  if (exact) return exact;
  const starts = options.filter((o) => o.toLowerCase().startsWith(s) && s.length >= 3);
  if (starts.length === 1) return starts[0];
  const contains = options.filter((o) => o.toLowerCase().includes(s) && s.length >= 4);
  if (contains.length === 1) return contains[0];
  return null;
}

/**
 * Convert a raw value (typed by a broker, or proposed by AI) into the
 * canonical stored form for the field. Blank → null (clears the field).
 */
export function coerceValue(field: FieldDef, raw: unknown): CoerceResult {
  if (isBlank(raw)) return { ok: true, value: null };
  const str = typeof raw === 'string' ? raw.trim() : String(raw);
  switch (field.type) {
    case 'text':
    case 'textarea': {
      const max = field.type === 'text' ? MAX_TEXT : MAX_TEXTAREA;
      if (str.length > max) return { ok: false, error: `Maximum ${max} characters` };
      return { ok: true, value: str };
    }
    case 'currency': {
      const n = parseMoney(raw);
      if (n === null) return { ok: false, error: 'Enter an amount in pounds, e.g. 45000' };
      if (n < 0 || n > MAX_MONEY) return { ok: false, error: 'Amount out of range' };
      return { ok: true, value: n };
    }
    case 'number': {
      const n = parseNumber(raw);
      if (n === null) return { ok: false, error: 'Enter a number' };
      if (n < 0 || n > 10_000) return { ok: false, error: 'Number out of range' };
      return { ok: true, value: n };
    }
    case 'percent': {
      const n = parseNumber(raw);
      if (n === null || n < 0 || n > 100) return { ok: false, error: 'Enter a percentage 0–100' };
      return { ok: true, value: n };
    }
    case 'date': {
      const d = parseDate(str);
      return d ? { ok: true, value: d } : { ok: false, error: 'Enter a date as DD/MM/YYYY' };
    }
    case 'yesno': {
      const s = str.toLowerCase();
      if (['yes', 'y', 'true', '1'].includes(s)) return { ok: true, value: 'yes' };
      if (['no', 'n', 'false', '0', 'none'].includes(s)) return { ok: true, value: 'no' };
      return { ok: false, error: 'Answer yes or no' };
    }
    case 'select': {
      const opt = matchOption(str, field.options ?? []);
      return opt ? { ok: true, value: opt } : { ok: false, error: `Choose one of: ${(field.options ?? []).join(', ')}` };
    }
    case 'email': {
      const s = str.toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? { ok: true, value: s } : { ok: false, error: 'Enter a valid email address' };
    }
    case 'phone': {
      const p = normalisePhone(str);
      return p ? { ok: true, value: p } : { ok: false, error: 'Enter a valid phone number' };
    }
    case 'postcode': {
      const p = normalisePostcode(str);
      return p ? { ok: true, value: p } : { ok: false, error: 'Enter a valid UK postcode' };
    }
  }
}

export function formatValue(field: FieldDef, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  switch (field.type) {
    case 'currency':
      return formatGBP(Number(value));
    case 'percent':
      return `${value}%`;
    case 'date':
      return formatUkDate(String(value));
    case 'yesno':
      return value === 'yes' ? 'Yes' : value === 'no' ? 'No' : String(value);
    default:
      return String(value);
  }
}

export function formatGBP(n: number): string {
  if (!Number.isFinite(n)) return '';
  const fixed = Math.abs(n) % 1 === 0 ? Math.abs(n).toFixed(0) : Math.abs(n).toFixed(2);
  const [int, dec] = fixed.split('.');
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${n < 0 ? '-' : ''}£${withCommas}${dec ? '.' + dec : ''}`;
}

export function formatUkDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Value to show inside a text input for editing. */
export function toInputString(field: FieldDef, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (field.type === 'date') return formatUkDate(String(value));
  return String(value);
}
