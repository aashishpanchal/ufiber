export type ByteUnit = 'B' | 'KB' | 'MB' | 'GB' | 'TB' | 'PB';
export type ByteString =
  | `${number}${ByteUnit}`
  | `${number}${Lowercase<ByteUnit>}`;

const UNIT_MAP: Readonly<Record<ByteUnit, number>> = {
  B: 1,
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4,
  PB: 1024 ** 5,
};
const SIZES = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;
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
  if (!Number.isFinite(bytes) || bytes === 0) {
    return '0B';
  }
  const k = 1024;
  const abs = Math.abs(bytes);
  const i = Math.min(Math.floor(Math.log(abs) / Math.log(k)), SIZES.length - 1);
  const value = bytes / Math.pow(k, i);
  const formatted = value.toFixed(1);
  return `${formatted}${SIZES[i]}` as ByteString;
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
  const match = value.trim().match(/^([\d.]+)\s*(B|KB|MB|GB|TB|PB)$/i);
  if (!match) {
    // Compile-time safety already helps, this is runtime fallback
    throw new Error(`Invalid byte string: ${value}`);
  }
  const num = Number(match[1]);
  const unit = match[2].toUpperCase() as ByteUnit;
  return Math.floor(num * UNIT_MAP[unit]);
};
/**
 * Convert between bytes and a human-readable byte string.
 *
 * - If a **number** is provided, it formats bytes into a string.
 * - If a **byte string** is provided, it parses it into a number.
 *
 * @example
 * bytes(1024);        // "1KB"
 * bytes(1536);        // "1.5KB"
 *
 * @example
 * bytes("1KB");       // 1024
 * bytes("1.5MB");     // 1572864
 */
export function bytes(value: number): ByteString;
export function bytes(value: ByteString): number;
export function bytes(value: number | ByteString): ByteString | number {
  return typeof value === 'number' ? formatBytes(value) : parseBytes(value);
}
/**
 * Delay execution for a specified amount of time.
 *
 * @example
 * await delay(500); // waits 500ms
 *
 * @param ms - Milliseconds to wait.
 * @returns A Promise that resolves after the given time.
 */
export const delay = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));
/**
 * Write a string to standard output without appending a newline.
 *
 * @param str - The string to write.
 *
 * @example
 * write("Hello"); // prints "Hello" to stdout
 */
export const write = (str: string, async?: boolean) => {
  if (!async) {
    process.stdout.write(str);
    return;
  }
  queueMicrotask(() => process.stdout.write(str));
};
/**
 * Create a new object with no prototype.
 *
 * Useful for maps or dictionaries where you do not want inherited keys.
 *
 * @returns A new object created with `Object.create(null)`.
 *
 * @example
 * const obj = Null();
 * obj.key = "value";
 */
export const NullObject = () => Object.create(null);
