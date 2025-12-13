import {delay} from '@/utils/tools';
import {Context} from '@/http/context';
import type {Readable} from 'node:stream';
import {HIGH_WATER_MARK, kEvent} from '@/consts';
import type {RecognizedString} from '../../uws';

const FLUSH_TIMEOUT = 50;

type Stream = {
  pendingSize: number;
  lastWriteTime: number;
  writeTimeout?: NodeJS.Timeout;
  pendingChunks: RecognizedString[];
};

export class UwsStream {
  #ctx: Context;
  delay = delay;
  #stream: Stream = {
    pendingSize: 0,
    lastWriteTime: 0,
    pendingChunks: [],
  };

  constructor(ctx: Context) {
    this.#ctx = ctx;
  }
  /**
   * Whether the stream has been aborted.
   */
  get aborted() {
    return this.#ctx.aborted;
  }
  /**
   * Whether the stream has been closed normally.
   */
  get closed() {
    return this.#ctx.closed;
  }
  /**
   * Register a callback invoked when the stream closes.
   *
   * @param listener - Callback to invoke on close
   *
   * @example
   * ```ts
   * stream.onClose(() => {
   *   console.log('Stream closed');
   * });
   * ```
   */
  onClose(listener: () => void) {
    this.#ctx.onClose(listener);
  }
  /** @internal flush pending buffered chunks to the underlying socket. */
  #flush(): void {
    const s = this.#stream;
    if (s.pendingSize === 0) return;
    try {
      if (!this.#ctx.headerSent) {
        this.#ctx.writeHead();
        this.#ctx.writeStatus();
      }
      // Write all pending chunks
      for (const chunk of s.pendingChunks) {
        this.#ctx.raw.write(chunk);
      }
    } catch (err) {
      console.error('[stream] Flush error:', err);
    } finally {
      s.pendingSize = 0;
      s.pendingChunks.length = 0;
      s.lastWriteTime = performance.now();
      if (s.writeTimeout) {
        clearTimeout(s.writeTimeout);
        s.writeTimeout = undefined;
      }
    }
  }
  /**
   * Write a chunk to the stream (buffered).
   *
   * @param chunk - String / Buffer / ArrayBuffer view.
   *
   * @example
   * ```ts
   * await s.write("chunk1 ");
   * await s.write(Buffer.from("chunk2"));
   * ```
   */
  async write(chunk: RecognizedString): Promise<void> {
    if (this.aborted || this.closed) return;
    const s = this.#stream;
    // Calculate chunk size
    let chunkSize: number;
    if (typeof chunk === 'string') {
      chunkSize = Buffer.byteLength(chunk);
    } else if (Buffer.isBuffer(chunk)) {
      chunkSize = chunk.byteLength;
    } else {
      chunkSize = chunk.byteLength;
    }
    // Add to pending chunks
    s.pendingChunks.push(chunk);
    s.pendingSize += chunkSize;
    const now = performance.now();
    // Flush conditions
    if (
      !s.lastWriteTime ||
      s.pendingSize >= HIGH_WATER_MARK ||
      now - s.lastWriteTime > FLUSH_TIMEOUT
    ) {
      this.#ctx.raw.cork(() => this.#flush());
    } else if (!s.writeTimeout) {
      // Schedule flush after FLUSH_TIMEOUT
      s.writeTimeout = setTimeout(() => {
        s.writeTimeout = undefined;
        if (!this.closed && !this.aborted) {
          this.#ctx.raw.cork(() => this.#flush());
        }
      }, FLUSH_TIMEOUT);
      // Don't prevent process exit
      s.writeTimeout.unref();
    }
  }
  /**
   * Write a line (with newline appended).
   *
   * @example
   * ```ts
   * await s.writeln("data: hello");
   * await s.writeln("event: message");
   * ```
   */
  async writeln(line: string): Promise<void> {
    return this.write(line + '\n');
  }
  /**
   * Pipe from a Web ReadableStream or Node.js Readable into this stream.
   * Automatically closes the stream unless `preventClose` is true.
   */
  async pipe(
    body: ReadableStream<Uint8Array> | Readable,
    preventClose?: boolean,
  ): Promise<void> {
    if (this.aborted) return;
    if ('getReader' in body) {
      // Web ReadableStream
      await this.#pipeWeb(body, preventClose);
    } else {
      // Node.js Readable
      await this.#pipeNode(body, preventClose);
    }
  }

  async #pipeWeb(
    body: ReadableStream<Uint8Array>,
    preventClose?: boolean,
  ): Promise<void> {
    let active = true;
    const reader = body.getReader();

    const cleanup = () => {
      if (!active) return;
      active = false;
      try {
        reader.releaseLock();
      } catch {}
      if (!preventClose) {
        this.close();
      }
    };

    this.onClose(cleanup);

    try {
      while (active && !this.aborted) {
        const result = await reader.read().catch(err => {
          cleanup();
          console.error('[stream.pipeWeb] Read error:', err);
          return {done: true} as ReadableStreamReadResult<Uint8Array>;
        });
        if (!result || result.done || this.aborted) break;
        const chunk = result.value;
        if (!chunk) continue;
        await this.write(chunk);
      }
      // Flush any remaining pending chunks
      this.#ctx.raw.cork(() => this.#flush());
    } catch (err) {
      if (!this.aborted) {
        console.error('[stream.pipeWeb] Error:', err);
      }
    } finally {
      cleanup();
    }
  }

  async #pipeNode(body: Readable, preventClose?: boolean): Promise<void> {
    if (this.aborted) return;

    let active = true;
    const cleanup = () => {
      if (!active) return;
      active = false;
      if (!body.destroyed) {
        body.destroy();
      }
      if (!preventClose) {
        this.close();
      }
    };

    this.onClose(cleanup);

    try {
      for await (const chunk of body) {
        if (!active || this.aborted) break;
        await this.write(chunk);
      }
      // Flush any remaining pending chunks
      this.#ctx.raw.cork(() => this.#flush());
    } catch (err) {
      if (!this.aborted) {
        console.error('[stream.pipeNode] Error:', err);
      }
    } finally {
      cleanup();
    }
  }

  close() {
    if (this.closed || this.aborted) return;
    try {
      this.#ctx.raw.cork(() => {
        this.#flush();
        this.#ctx.raw.end();
        this.#ctx.closed = true;
        this.#ctx[kEvent]?.emit('close');
      });
    } catch (err) {
      if (!this.aborted && !this.closed) {
        console.error('[stream] Close error:', err);
      }
    }
  }

  abort() {
    if (!this.aborted) {
      // Immediately force closes the connection. Any onAborted callback will run.
      this.#ctx.raw.close();
    }
  }
}

/**
 * Streaming response helper.
 * Automatically closes the stream after the callback finishes.
 *
 * @param ctx - Request context
 * @param callback - Handler that receives a `UwsStream`
 * @param onError - Optional error handler
 *
 * @example
 * ```ts
 * await stream(ctx, async s => {
 *   await s.writeln("data: hello");
 *   await s.writeln("data: world");
 * });
 *
 * // Error handler
 * await stream(ctx,
 *   async s => { throw new Error("fail"); },
 *   async (err, s) => {
 *     await s.write("error occurred");
 *   });
 * ```
 */
export const stream = async (
  ctx: Context,
  callback: (stream: UwsStream) => Promise<void>,
  onError?: (e: Error, stream: UwsStream) => Promise<void>,
): Promise<void> => {
  const stream = new UwsStream(ctx);

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
