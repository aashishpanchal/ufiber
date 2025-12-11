import zlib from 'zlib';
import type {BufferArray} from '@/types';
import type {WithImplicitCoercion} from 'buffer';
import type {ZlibOptions, BrotliOptions} from 'zlib';

export {constants} from 'zlib';

type ZlibType = 'Inflate' | 'Gunzip' | 'BrotliDecompress';

type ZlibInstance = {
  _processChunk(data: Buffer, flag: number): BufferArray;
  _defaultFlushFlag: number;
  _handle: {
    close(): void;
  } | null;
  close(): void;
  reset(): void;
  removeAllListeners(event: string): void;
  [key: symbol]: any;
};

abstract class ZlibBase {
  #noFlushFlag: number;
  #instance: ZlibInstance | null;
  #buffer: Buffer[];
  #kError: symbol;
  #backups: [() => void, any, () => void];

  constructor(type: ZlibType, options: ZlibOptions | BrotliOptions) {
    if (type.startsWith('Brotli')) {
      this.#noFlushFlag = zlib.constants.BROTLI_OPERATION_PROCESS;
      if (!Number.isInteger((options as any).flush)) {
        (options as any).flush = zlib.constants.BROTLI_OPERATION_FLUSH;
      }
    } else {
      this.#noFlushFlag = zlib.constants.Z_NO_FLUSH;
      if (!Number.isInteger((options as any).flush)) {
        (options as any).flush = zlib.constants.Z_SYNC_FLUSH;
      }
    }
    this.#instance = new (zlib as any)[type](options) as ZlibInstance;
    this.#buffer = [];
    this.#kError = Object.getOwnPropertySymbols(this.#instance).find(x => x.toString().includes('kError')) as symbol;
    this.#backups = [this.#instance.close, this.#instance._handle, this.#instance._handle!.close];
  }

  process(arrayBuffer: WithImplicitCoercion<ArrayBuffer | SharedArrayBuffer>, flag?: number): BufferArray;
  process(data: Uint8Array | ReadonlyArray<number>, flag?: number): BufferArray;
  process(data: WithImplicitCoercion<Uint8Array | ReadonlyArray<number> | string>, flag?: number): BufferArray;
  process(
    string: WithImplicitCoercion<string> | {[Symbol.toPrimitive](hint: 'string'): string},
    flag?: number,
  ): BufferArray;
  process(_data: any, _flag?: number): BufferArray {
    const z = this.#instance!;
    const nff = this.#noFlushFlag;
    const kError = this.#kError;
    const [c, h, hc] = this.#backups;
    const flag = !Number.isInteger(_flag) ? z._defaultFlushFlag : _flag!;
    const data = !Buffer.isBuffer(_data) ? Buffer.from(_data) : _data;
    const buffer = this.#buffer;
    let result: BufferArray;
    let error: Error | undefined;
    z.close = () => void 0;
    z._handle!.close = () => void 0;
    try {
      result = z._processChunk(data, flag);
    } catch (e) {
      error = e as Error;
    }
    z.close = c;
    z._handle = h;
    z._handle!.close = hc;
    z.removeAllListeners('error');
    if (error) {
      z.reset();
      z[kError] = null;
      throw error;
    }
    result = Buffer.from(result!);
    if (flag === nff) {
      if (result.length) {
        buffer.push(result);
        return Buffer.allocUnsafe(0);
      }
    } else if (buffer.length) {
      buffer.push(result);
      result = Buffer.concat(buffer);
      this.#buffer = [];
    }
    return result;
  }

  processChunk(data: any, isLast: boolean): BufferArray {
    return this.process(data, isLast ? undefined : this.#noFlushFlag);
  }

  close(): void {
    if (!this.#instance) {
      return;
    }
    this.#instance._handle!.close();
    this.#instance._handle = null;
    this.#instance.close();
    this.#instance = null;
    this.process = (() => void 0) as any;
  }
}

class Inflate extends ZlibBase {
  constructor(options?: ZlibOptions) {
    super('Inflate', options || {});
  }
}

class Gunzip extends ZlibBase {
  constructor(options?: ZlibOptions) {
    super('Gunzip', options || {});
  }
}

class BrotliDecompress extends ZlibBase {
  constructor(options?: BrotliOptions) {
    super('BrotliDecompress', options || {});
  }
}

export const decompress = (format?: string) => {
  const encoding = format || 'identity';
  switch (encoding) {
    case 'identity':
      return null;
    case 'deflate':
      return new Inflate();
    case 'gzip':
      return new Gunzip();
    case 'br':
      return new BrotliDecompress();
    default:
      return false;
  }
};
