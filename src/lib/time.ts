// Time helpers shared by the server and the browser.
// Timestamps are epoch milliseconds; calendar days are local "YYYY-MM-DD" keys.

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY_MS = 24 * HOUR;

const pad = (n: number, width = 2) => String(Math.trunc(Math.abs(n))).padStart(width, "0");

/** 8015 -> "02:13:35". Hours are not capped at 24. */
export function formatHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

export function formatSignedHMS(totalSeconds: number): string {
  return (totalSeconds < 0 ? "-" : "") + formatHMS(Math.abs(totalSeconds));
}

/** 15600 -> "4h 20m", 2700 -> "45m", 0 -> "0m". */
export function formatHM(totalSeconds: number): string {
  const negative = totalSeconds < 0;
  const mins = Math.floor(Math.abs(totalSeconds) / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const body = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  return negative ? `-${body}` : body;
}

/**
 * Parses what a person might type as an estimate and returns minutes.
 * Accepts: 90, "90", "1:30", "01:30:00", "1.5h", "1h 30m", "45 min", "2 hours".
 */
export function parseDuration(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) && input >= 0 ? Math.round(input) : null;
  const s = input.trim().toLowerCase();
  if (!s) return null;

  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));

  const clock = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (clock) {
    const [, h, m, sec] = clock;
    return Math.round(Number(h) * 60 + Number(m) + (sec ? Number(sec) / 60 : 0));
  }

  let total = 0;
  let matched = false;
  const re = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|seconds?|d|day|days)\b/g;
  for (const part of s.matchAll(re)) {
    matched = true;
    const value = Number(part[1]);
    const unit = part[2];
    if (unit.startsWith("d")) total += value * 8 * 60; // a "day" of effort = one 8h workday
    else if (unit.startsWith("h")) total += value * 60;
    else if (unit.startsWith("s")) total += value / 60;
    else total += value;
  }
  return matched ? Math.round(total) : null;
}

/** Local-time ISO string with offset, e.g. "2026-09-15T09:00:00+05:30". */
export function toLocalIso(ms: number): string {
  const d = new Date(ms);
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  );
}

/** Google Sheets date serial (days since 1899-12-30, local wall time) -> epoch ms. */
export function serialToLocalMs(serial: number): number {
  const days = Math.floor(serial);
  const seconds = Math.round((serial - days) * 86400);
  return new Date(1899, 11, 30 + days, 0, 0, seconds).getTime();
}

/** Parses ISO strings, "YYYY-MM-DD HH:MM[:SS]" (local) and Sheets serial numbers. */
export function parseTimestamp(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? serialToLocalMs(value) : null;
  const s = value.trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    // Large integers are epoch ms; small ones are Sheets serial dates.
    return n > 1e11 ? n : serialToLocalMs(n);
  }
  const localForm = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (localForm) {
    const [, y, mo, d, h, mi, sec] = localForm;
    return new Date(+y, +mo - 1, +d, +h, +mi, sec ? +sec : 0).getTime();
  }
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : parsed;
}

export function floorToSecond(ms: number): number {
  return Math.floor(ms / SECOND) * SECOND;
}

/** Local calendar day key for an instant. */
export function dateKey(ms: number = Date.now()): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(keyToDate(value).getTime());
}

/** Normalises a date typed in a sheet into a "YYYY-MM-DD" key. */
export function parseDateKey(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return dateKey(serialToLocalMs(value));
  const s = value.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return dateKey(new Date(+iso[1], +iso[2] - 1, +iso[3]).getTime());
  if (/^\d+(\.\d+)?$/.test(s)) return dateKey(serialToLocalMs(Number(s)));
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    let a = +dmy[1];
    let b = +dmy[2];
    const y = dmy[3].length === 2 ? 2000 + +dmy[3] : +dmy[3];
    // Ambiguous dates are read day-first; "9/20/2026" is unambiguous month-first.
    if (a <= 12 && b > 12) [a, b] = [b, a];
    return dateKey(new Date(y, b - 1, a).getTime());
  }
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : dateKey(parsed);
}

export function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, days: number): string {
  const d = keyToDate(key);
  return dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime());
}

/** Whole calendar days from `a` to `b` (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((keyToDate(b).getTime() - keyToDate(a).getTime()) / DAY_MS);
}

/** [start, end) instants of a local calendar day (DST-safe). */
export function dayRange(key: string): [number, number] {
  return [keyToDate(key).getTime(), keyToDate(addDays(key, 1)).getTime()];
}

export function startOfWeekKey(key: string, weekStartsOn: number): string {
  const offset = (keyToDate(key).getDay() - weekStartsOn + 7) % 7;
  return addDays(key, -offset);
}

export function weekKeys(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function keysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

export function weekdayOf(key: string): number {
  return keyToDate(key).getDay();
}

export function formatDateLabel(key: string, style: "short" | "long" | "day" = "short"): string {
  const d = keyToDate(key);
  if (style === "day") return d.toLocaleDateString(undefined, { weekday: "short" });
  if (style === "long") {
    return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** "09:05:07" in local 24h time. */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** "HH:MM" -> minutes after midnight. */
export function hmToMinutes(hm: string): number {
  const m = hm.match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 9 * 60;
}

/**
 * Normalizes a clock time into "HH:MM" (24h), or "" if unset/unparseable.
 * Accepts "9:00", "9:00 AM", "09:00:00" (typed or from the sheet), and a
 * Sheets TIME-formatted cell read as UNFORMATTED_VALUE (a 0..1 day fraction).
 */
export function parseClockTime(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") {
    if (value < 0 || value >= 1) return "";
    const totalMinutes = Math.round(value * 24 * 60) % (24 * 60);
    return `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;
  }
  const m = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (!m) return "";
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ampm = m[3]?.toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return "";
  return `${pad(h)}:${pad(min)}`;
}

/** Value for <input type="datetime-local"> from epoch ms. */
export function toDateTimeLocalInput(ms: number): string {
  const d = new Date(ms);
  return `${dateKey(ms)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
