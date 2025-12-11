// Time constants
const S = 1000;
const M = S * 60;
const H = M * 60;
const D = H * 24;
const W = D * 7;
const Y = D * 365.25;
const MO = Y / 12;

// Unit literal types
type Years = 'years' | 'year' | 'yrs' | 'yr' | 'y';
type Months = 'months' | 'month' | 'mo';
type Weeks = 'weeks' | 'week' | 'w';
type Days = 'days' | 'day' | 'd';
type Hours = 'hours' | 'hour' | 'hrs' | 'hr' | 'h';
type Minutes = 'minutes' | 'minute' | 'mins' | 'min' | 'm';
type Seconds = 'seconds' | 'second' | 'secs' | 'sec' | 's';
type Milliseconds = 'milliseconds' | 'millisecond' | 'msecs' | 'msec' | 'ms';

type Unit = Years | Months | Weeks | Days | Hours | Minutes | Seconds | Milliseconds;

// Accept any-case variations: "10H", "5MiN", etc.
type UnitAnyCase = Unit | Uppercase<Unit> | Capitalize<Unit>;

// Matches "10h", "10 h", "10H", "1.5 hours" etc.
export type StringValue = `${number}` | `${number}${UnitAnyCase}` | `${number} ${UnitAnyCase}`;

// Value table for all units
const UNIT_VALUES: Record<Lowercase<Unit>, number> = {
  // ms
  ms: 1,
  msec: 1,
  msecs: 1,
  millisecond: 1,
  milliseconds: 1,

  // seconds
  s: S,
  sec: S,
  secs: S,
  second: S,
  seconds: S,

  // minutes
  m: M,
  min: M,
  mins: M,
  minute: M,
  minutes: M,

  // hours
  h: H,
  hr: H,
  hrs: H,
  hour: H,
  hours: H,

  // days
  d: D,
  day: D,
  days: D,

  // weeks
  w: W,
  week: W,
  weeks: W,

  // months
  mo: MO,
  month: MO,
  months: MO,

  // years
  y: Y,
  yr: Y,
  yrs: Y,
  year: Y,
  years: Y,
};

/**
 * Parse a human time expression into milliseconds.
 * Supports compound expressions like "1h 30m", "2d4h", "1.5h".
 */
export function parseMs(value: StringValue | number): number {
  if (typeof value === 'number') return value;

  const input = value.trim();
  if (!input) throw new Error(`Invalid time string: "${value}"`);

  let total = 0;
  let matched = false;

  // Matches: "1.5h", "30 m", "2 days"
  const regex =
    /(-?\d*\.?\d+)\s*(milliseconds?|msecs?|msec|ms|seconds?|secs?|sec|s|minutes?|mins?|min|m|hours?|hrs?|hr|h|days?|day|d|weeks?|week|w|months?|month|mo|years?|year|yrs?|yr|y)/gi;

  for (const m of input.matchAll(regex)) {
    matched = true;

    const rawValue = m[1];
    const rawUnit = m[2].toLowerCase() as Lowercase<Unit>;

    const num = parseFloat(rawValue);
    const multiplier = UNIT_VALUES[rawUnit];

    if (multiplier == null) {
      throw new Error(`Unknown unit "${rawUnit}" in "${value}"`);
    }

    total += num * multiplier;
  }

  if (!matched) {
    throw new Error(`Invalid time string: "${value}"`);
  }

  return total;
}

export type ByteUnit = 'B' | 'KB' | 'MB' | 'GB';

export type ByteString = `${number}${ByteUnit | Lowercase<ByteUnit>}`;

/**
 * Convert a byte count into a human-readable string.
 *
 * @param bytes - The number of bytes.
 * @returns A formatted string like "1.5KB" or "2MB".
 *
 * @example
 * formatBytes(1536);     // "1.5KB"
 * formatBytes(1048576);  // "1.0MB"
 */
export const formatBytes = (bytes: number): ByteString => {
  if (bytes === 0) return '0B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)}${sizes[i]}` as ByteString;
};

/**
 * Parse a human-readable byte string (e.g. "1.5MB") into a number of bytes.
 *
 * @param value - A formatted byte string such as "10MB" or "512KB".
 * @returns The number of bytes represented by the string.
 * @throws If the string does not match the expected format.
 *
 * @example
 * parseBytes("1KB");     // 1024
 * parseBytes("1.5MB");   // 1572864
 */
export const parseBytes = (value: ByteString): number => {
  const units: Record<ByteUnit, number> = {B: 0, KB: 1, MB: 2, GB: 3};
  // Trim spaces and make sure format matches "<number><unit>"
  const match = value
    .trim()
    .toUpperCase()
    .match(/^([\d.]+)\s*(B|KB|MB|GB)$/);
  if (!match) {
    throw new Error(`Invalid byte format: "${value}"`);
  }
  const num = parseFloat(match[1]);
  const unit = match[2] as keyof typeof units;
  return Math.round(num * Math.pow(1024, units[unit]));
};
