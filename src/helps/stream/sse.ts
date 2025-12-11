import {UwsStream} from './utils';
import type {Context} from '@/core';

export type SSEMessage = {
  data: string | Promise<string>;
  event?: string;
  id?: string;
  retry?: number;
};

export class UwsSSEStream extends UwsStream {
  /**
   * Send a properly formatted SSE message.
   *
   * @param message - SSE message fields
   *
   * @example
   * ```ts
   * await stream.writeSSE({event: "tick",data: "hello",id: "1"});
   * ```
   */
  async writeSSE(message: SSEMessage): Promise<void> {
    const dataStr = await message.data;

    // Format multiline data
    const dataLines = dataStr
      .split('\n')
      .map(line => `data: ${line}`)
      .join('\n');

    const payload =
      [
        message.event && `event: ${message.event}`,
        dataLines,
        message.id && `id: ${message.id}`,
        message.retry && `retry: ${message.retry}`,
      ]
        .filter(Boolean)
        .join('\n') + '\n\n';

    await this.write(payload);
  }
}

/**
 * Create an SSE (Server-Sent Events) streaming response.
 *
 * Automatically sets:
 *  - `Connection: keep-alive`
 *  - `Content-Type: text/event-stream`
 *  - `Cache-Control: no-cache`
 *
 * @param ctx - Request context
 * @param callback - Function that receives a `UwsSSEStream`
 * @param onError - Optional custom error handler
 *
 * @example
 * ```ts
 * await streamSSE(ctx, async s => {
 *   let i = 0;
 *   while (!s.aborted) {
 *     await s.writeSSE({ event: "count", data: String(i++) });
 *     await s.sleep(1000);
 *   }
 * });
 * ```
 */
export const streamSSE = async (
  ctx: Context,
  callback: (stream: UwsSSEStream) => Promise<void>,
  onError?: (err: Error, stream: UwsSSEStream) => Promise<void>,
): Promise<void> => {
  ctx.header('Connection', 'keep-alive');
  ctx.header('Cache-Control', 'no-cache');
  ctx.header('Content-Type', 'text/event-stream');

  const stream = new UwsSSEStream(ctx);

  try {
    await callback(stream);
  } catch (err) {
    if (err instanceof Error && onError) {
      await onError(err, stream);
    } else {
      console.error('[stream] Error:\n', err);
    }
  } finally {
    stream.close();
  }
};
