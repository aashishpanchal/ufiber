import {bytes} from '@/utils/tools';
import {Readable} from 'node:stream';
import {decompress} from '@/utils/zlib';
import {HIGH_WATER_MARK} from '@/consts';
import type {HttpResponse} from '../../uws';
import type {BufferArray, CompressFormat} from '@/types';
import {BadRequestError, ContentTooLargeError} from '@/errors';

type UwsRead = {
  bytes: number;
  isDone: boolean;
  buffer: BufferArray | null;
  chunks: BufferArray[];
};

export class UwsReadable extends Readable {
  #usedBuffer = false;
  #usedStream = false;
  #uwsRead: UwsRead = {
    bytes: 0,
    chunks: [],
    isDone: false,
    buffer: null,
  };
  #needsData = false;
  #completed = false;
  #inflate: ReturnType<typeof decompress> = null;

  constructor(
    res: HttpResponse,
    format?: CompressFormat,
    bodyLimit?: number | null,
  ) {
    super({highWaterMark: HIGH_WATER_MARK});
    this.#inflate = decompress(format);
    if (this.#inflate === false) {
      this.destroy(new BadRequestError('Unsupported content encoding'));
      return;
    }
    res.onData((chunk, isLast) => {
      if (this.destroyed) return;
      // We MUST copy the data of chunk if isLast is not true.
      let buf = Buffer.from(new Uint8Array(chunk)); // required copy
      // Decompress data if client give compress data
      if (this.#inflate) {
        try {
          buf = this.#inflate.processChunk(buf, isLast);
          if (isLast) {
            this.#inflate.close();
          }
        } catch (err: any) {
          if (this.#inflate) {
            this.#inflate.close();
          }
          this.destroy(
            new BadRequestError(`Decompression failed: ${err.message}`),
          );
          return;
        }
      }
      this.#uwsRead.chunks.push(buf);
      this.#uwsRead.bytes += buf.length;
      // Exceeded allowed body size -> destroy stream with error
      if (
        bodyLimit !== null &&
        typeof bodyLimit !== 'undefined' &&
        this.#uwsRead.bytes > bodyLimit
      ) {
        if (this.#inflate) this.#inflate.close();
        this.destroy(
          new ContentTooLargeError(
            `Request body ${bytes(this.#uwsRead.bytes)} exceeds limit: ${bytes(bodyLimit)}`,
          ),
        );
        return;
      }
      if (isLast) {
        this.#uwsRead.isDone = true;
        // If buffer-mode or there's a listener for 'complete' and not using stream, trigger complete
        // Also ensure we don't mix with stream mode.
        if (
          !this.#completed &&
          !this.#usedStream &&
          (this.#usedBuffer || this.listenerCount('complete') > 0)
        ) {
          this.#complete();
        }
      }
      // Only trigger _read if in streaming mode (someone has asked for stream data).
      if (this.#needsData) {
        this.#needsData = false;
        // call _read to push whatever we have now
        this._read();
      }
    });
  }

  _read() {
    if (this.#usedBuffer) {
      this.destroy(
        new Error('Cannot read stream after getBuffer() has been called'),
      );
      return;
    }
    this.#usedStream = true;
    let bytesToRead = HIGH_WATER_MARK;
    while (bytesToRead > 0 && this.#uwsRead.chunks.length > 0) {
      const chunk = this.#uwsRead.chunks[0];
      if (chunk.length <= bytesToRead) {
        // Use entire chunk - no copy
        this.#uwsRead.chunks.shift();
        bytesToRead -= chunk.length;
        if (!this.push(chunk)) break;
      } else {
        // Split chunk using views - no copy
        const part = chunk.subarray(0, bytesToRead);
        this.#uwsRead.chunks[0] = chunk.subarray(bytesToRead);
        bytesToRead = 0;
        if (!this.push(part)) break;
      }
    }
    // If all chunks sent and request fully received → end stream
    if (this.#uwsRead.isDone && this.#uwsRead.chunks.length === 0)
      this.push(null);
    // If we ran out of chunks but more data might come later
    else if (this.#uwsRead.chunks.length === 0) this.#needsData = true;
  }

  _destroy(err: Error | null, cb: (error?: Error | null) => void): void {
    if (this.#inflate) {
      this.#inflate.close();
    }
    const r = this.#uwsRead;
    r.isDone = true;
    r.buffer = null;
    r.chunks.length = 0;
    this.#needsData = false;
    this.#completed = false;
    super._destroy(err, cb);
  }

  once(event: string | symbol, listener: (...args: any[]) => void) {
    if (event === 'complete') {
      // Prevent mixing stream mode with buffer mode
      if (this.#usedStream)
        throw new Error('Cannot use complete event after stream has been read');
      // If already completed, immediately call with cached body
      if (this.#completed && this.#uwsRead.buffer) {
        queueMicrotask(() => listener(this.#uwsRead.buffer!));
        return this;
      }
      // If done but not completed yet, trigger completion now
      if (this.#uwsRead.isDone && !this.#completed) {
        this.#complete();
      }
    }
    return super.once(event, listener);
  }

  #bodyBuf(): BufferArray {
    if (this.#uwsRead.buffer) return this.#uwsRead.buffer;
    const chunksLen = this.#uwsRead.chunks.length;
    let buffer: BufferArray;
    if (chunksLen === 0) {
      buffer = Buffer.allocUnsafe(0);
    } else if (chunksLen === 1) {
      buffer = this.#uwsRead.chunks[0]!;
    } else {
      buffer = Buffer.concat(this.#uwsRead.chunks, this.#uwsRead.bytes);
    }
    this.#uwsRead.buffer = buffer;
    this.#uwsRead.chunks.length = 0;
    return buffer;
  }

  #complete() {
    if (this.#completed) return;
    this.#completed = true;
    queueMicrotask(() => {
      if (this.destroyed) return;
      const body = this.#bodyBuf();
      this.emit('complete', body);
    });
  }

  getRawBody(): Promise<BufferArray> {
    return new Promise<BufferArray>((resolve, reject) => {
      if (this.#uwsRead.buffer) return resolve(this.#uwsRead.buffer);
      if (this.destroyed) return reject(new Error('Stream has been destroyed'));
      if (this.#usedStream)
        return reject(
          new Error('Cannot get buffer after stream has been read'),
        );
      // Mark buffer mode permanently (prevents future streaming)
      this.#usedBuffer = true;
      // If already completed → return immediately
      if (this.#uwsRead.isDone) return resolve(this.#bodyBuf());
      // Handlers
      const onComplete = (buffer: BufferArray) => {
        cleanup();
        resolve(buffer);
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const onClose = () => {
        cleanup();
        reject(new Error('Stream closed before completion'));
      };
      const cleanup = () => {
        this.off('error', onError);
        this.off('close', onClose);
        this.off('complete', onComplete);
      };
      // Attach handlers
      this.once('error', onError);
      this.once('close', onClose);
      this.once('complete', onComplete);
      // Destroy happened right after listeners attached
      if (this.destroyed) {
        cleanup();
        return reject(new Error('Stream has been destroyed'));
      }
    });
  }
}
