import {UwsStream} from './stream';
import type {HttpResponse} from '../../uws';

export type SSEMessage = {
  data: string | Promise<string>;
  event?: string;
  id?: string;
  retry?: number;
};

/**
 * Server-Sent Events (SSE) Streaming API
 * --------------------------------------
 * Follows SSE protocol with `event`, `data`, `id`, and `retry` fields.
 */
export class UwsSSEStream extends UwsStream {
  /**
   * Send a properly formatted SSE message.
   */
  async writeSSE(message: SSEMessage): Promise<void> {
    const dataStr = await message.data;
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
 * streamSSE() — For Server-Sent Events (SSE)
 * ------------------------------------------
 * Sends `text/event-stream` response with proper SSE framing.
 */
export const streamSSE = async (
  res: HttpResponse,
  cb: (stream: UwsSSEStream) => Promise<void>,
  onError?: (err: Error, stream: UwsSSEStream) => Promise<void>,
) => {
  // Set up SSE headers immediately
  res.cork(() => {
    res.writeHeader('Content-Type', 'text/event-stream');
    res.writeHeader('Cache-Control', 'no-cache');
    res.writeHeader('Connection', 'keep-alive');
    // res.writeHeader('Transfer-Encoding', 'chunked');
  });

  const stream = new UwsSSEStream(res);

  try {
    await cb(stream);
  } catch (e: any) {
    if (onError && e instanceof Error) {
      await onError(e, stream);
      await stream.writeSSE({
        event: 'error',
        data: e.message,
      });
    } else {
      console.error('[streamSSE] Error:', e);
    }
  } finally {
    stream.close();
  }
};
