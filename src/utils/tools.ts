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

/**
 * Delay execution for a specified amount of time.
 *
 * @example
 * await delay(500); // waits 500ms
 *
 * @param ms - Milliseconds to wait.
 * @returns A Promise that resolves after the given time.
 */
export const delay = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

export const write = (str: string) => process.stdout.write(str);
