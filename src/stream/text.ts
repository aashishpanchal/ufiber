import type {Context} from '@/http';
import {UwsStream, stream} from './utils';

/**
 * Create a plain-text streaming response using `UwsStream`.
 *
 * Automatically sets:
 * - `Content-Type: text/plain; charset=utf-8`
 * - `Connection: keep-alive`
 * - `Cache-Control: no-cache`
 * - `X-Content-Type-Options: nosniff`
 *
 * @param ctx - Request context
 * @param callback - Receives a `UwsStream` for writing text chunks
 * @param onError - Optional custom error handler
 *
 * @example
 * ```ts
 * await streamText(ctx, async s => {
 *   await s.writeln("Starting task...");
 *   await s.writeln("Processing...");
 *   await s.writeln("Done!");
 * });
 * ```
 *
 * @example
 * ```ts
 * await streamText(
 *   ctx,
 *   async s => {
 *     throw new Error("Example failure");
 *   },
 *   async (err, s) => {
 *     await s.writeln("Error occurred: " + err.message);
 *   }
 * );
 * ```
 *
 * @example
 * ```ts
 * await streamText(ctx, async s => {
 *   for (let i = 0; i < 5; i++) {
 *     await s.writeln("tick: " + i);
 *     await s.sleep(500);
 *   }
 * });
 * ```
 */
export const streamText = async (
  ctx: Context,
  callback: (stream: UwsStream) => Promise<void>,
  onError?: (e: Error, stream: UwsStream) => Promise<void>,
): Promise<void> => {
  ctx.header('connection', 'keep-alive');
  ctx.header('cache-control', 'no-cache');
  ctx.header('x-content-type-options', 'nosniff');
  ctx.header('content-type', 'text/plain; charset=utf-8');
  return stream(ctx, callback, onError);
};
