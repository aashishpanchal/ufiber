import {UwsRequest} from './request';
import {NullObject} from '@/utils/tools';
import {EventEmitter} from 'node:events';
import {CookieManager} from '@/utils/cookie';
import type {BaseMime, ResHeaders} from '@/utils/header';
import type {HttpRequest, HttpResponse, RecognizedString} from '../../uws';
import {
  STATUS_TEXT,
  type HttpStatusCode,
  type RedirectStatusCode,
} from '@/status';
import {kEvent} from '@/consts';

type Options = {
  isSSL: boolean;
  bodyLimit: number | null;
  methods?: string[];
};

type Event = EventEmitter<{abort: []; close: []}>;

export class Context {
  raw: HttpResponse;
  /**
   * `.req` returns the parsed high-level Request object.
   *
   * You can access HTTP method, URL, headers, body, etc.
   *
   * @see {@link Request}
   *
   * @example
   * ```ts
   * const name = ctx.req.query('name')
   * return ctx.text(`Hello ${name}`)
   * ```
   */
  req: UwsRequest;

  /** Whether client aborted the connection */
  aborted = false;
  /** Whether response has already closed */
  closed = false;

  #req?: UwsRequest;
  #cookie?: CookieManager;
  [kEvent]?: Event;
  #headers: Record<string, string> = NullObject();
  #statusCode: HttpStatusCode = 200;
  #headerSent = false;
  #vars?: Map<unknown, unknown>;
  #cachedIp?: string;

  /**
   * Creates a new Context instance.
   *
   * @param req - The raw HttpRequest instance.
   * @param res - The raw HttpResponse instance.
   * @param options - Internal server options.
   *
   * @example
   * ```ts
   * uwsApp.get('/hello', (res, req) => {
   *   const ctx = new Context(req, res, options)
   *   ctx.text('Hello from Context!')
   * })
   * ```
   */
  constructor(req: HttpRequest, res: HttpResponse, opts: Options) {
    this.raw = res;
    this.req = new UwsRequest(req, this.raw, opts);
    this.raw.onAborted(() => {
      if (this.aborted || this.closed) return;
      // Stop streaming if request body was read
      if (this.#req && this.#req.isRead) this.#req.stream.destroy();
      // Set flags FIRST
      this.aborted = true;
      this.closed = true;
      // THEN emit event
      this[kEvent]?.emit('close');
    });
  }
  /**
   * `.cookie` provides utilities to read and write cookies.
   *
   * @see {@link CookieManager}
   *
   * @example
   * ```ts
   * ctx.cookie.set('user_id', '123', { maxAge: 3600 })
   * ctx.cookie.delete('old_token')
   * ```
   */
  get cookie(): CookieManager {
    if (!this.#cookie) {
      this.#cookie = new CookieManager(this);
    }
    return this.#cookie;
  }
  /**
   * `.headerSent` indicates whether response headers
   * have already been written to the client.
   *
   * Useful when writing adapters or middleware that must
   * avoid modifying headers after they are committed.
   *
   * @example
   * ```ts
   * if (ctx.headerSent) {
   *   console.log('Headers already sent')
   * }
   * ```
   */
  get headerSent(): boolean {
    return this.#headerSent;
  }
  /**
   * `.statusCode` returns the currently assigned HTTP status code.
   *
   * This reflects the last value set by `.status()`, `.text()`,
   * `.json()`, `.html()`, or `.redirect()`.
   *
   * @example
   * ```ts
   * ctx.status(404)
   * console.log(ctx.statusCode) // 404
   * ```
   */
  get statusCode(): HttpStatusCode {
    return this.#statusCode;
  }
  /**
   * `.var` can access the value of a variable.
   *
   * @example
   * ```ts
   * const result = c.var.hello.oneMethod()
   * ```
   */
  get var(): Record<string, any> {
    if (!this.#vars) {
      return {} as any;
    }
    return Object.fromEntries(this.#vars);
  }

  /**
   * `.set()` can set the value specified by the key.
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Hono is hot!!')
   *   await next()
   * })
   * ```
   */
  set<T>(key: string, value: T) {
    this.#vars ??= new Map();
    this.#vars.set(key, value);
  }
  /**
   * `.get()` can use the value specified by the key.
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get<T>(key: string): T | undefined {
    return this.#vars ? (this.#vars.get(key) as T) : undefined;
  }
  /**
   * `.ip` returns the client’s IP address.
   *
   * If `trust-proxy` is enabled, `X-Forwarded-For` or `X-Real-IP`
   * will be used.
   *
   * @example
   * ```ts
   * const ip = ctx.ip
   * console.log('Client IP:', ip)
   * ```
   */
  get ip(): string {
    if (this.#cachedIp) return this.#cachedIp;
    const trust = this.get('trust-proxy');
    // Check proxy headers only if trust is enabled
    if (trust) {
      const forwarded = this.req.header('x-forwarded-for');
      if (forwarded) {
        this.#cachedIp = forwarded.split(',')[0].trim();
        return this.#cachedIp;
      }
      const realIp = this.req.header('x-real-ip');
      if (realIp) {
        this.#cachedIp = realIp;
        return this.#cachedIp;
      }
    }
    // Get raw IP from uWebSockets
    const rawIp = this.raw.getRemoteAddress();
    if (rawIp.byteLength === 4) {
      // IPv4
      this.#cachedIp = new Uint8Array(rawIp).join('.');
    } else if (rawIp.byteLength === 16) {
      // IPv6
      const dv = new DataView(rawIp);
      let ip = '';
      for (let i = 0; i < 8; i++) {
        ip += dv
          .getUint16(i * 2)
          .toString(16)
          .padStart(4, '0');
        if (i < 7) ip += ':';
      }
      this.#cachedIp = ip;
    } else {
      // Unix socket
      this.#cachedIp = '-';
    }
    return this.#cachedIp;
  }
  /**
   * `.status()` can set the HTTP status code for the response.
   *
   * @example
   * ```ts
   * ctx.status(201)
   * ctx.text('Created')
   * ```
   */
  status(code: HttpStatusCode): void {
    if (code < 100 || code > 599) {
      throw new Error(`Invalid status code: ${status}`);
    }
    this.#statusCode = code;
  }
  /**
   * `.onClose()` can register a callback invoked when the connection closes.
   *
   * - Client disconnects/aborts the request
   * - Response completes normally
   *
   * @example
   * ```ts
   * ctx.onClose(() => {
   *   console.log('Connection closed')
   * })
   * ```
   */
  onClose(listener: () => void): void {
    this[kEvent] ??= new EventEmitter();
    this[kEvent].on('close', listener);
  }
  /**
   * `.header()` can set, append, or delete response headers.
   *
   * @example
   * ```ts
   * ctx.header('x-id', '123')
   * ctx.header('x-tag', 'a', true) // append
   * ctx.header('remove-this') // delete
   * ```
   */
  header(name: 'content-type', value?: BaseMime, append?: boolean): void;
  header(name: ResHeaders, value?: string, append?: boolean): void;
  header(name: string, value?: string, append?: boolean): void;
  header(field: any, value: any, append: any): void {
    if (this.#headerSent)
      throw new Error(
        'Cannot modify headers after they are sent to the client',
      );
    if (value === undefined) delete this.#headers[field];
    else if (append) {
      const existing = this.#headers[field];
      this.#headers[field] = existing ? `${existing}, ${value}` : value;
    } else this.#headers[field] = value;
  }
  /** @internal Writes response headers to the underlying HttpResponse. */
  writeHeader(): void {
    if (this.#headerSent)
      throw new Error(
        'Headers have already been written; response is already committed',
      );
    const headers = this.#headers;
    for (const key in headers) {
      this.raw.writeHeader(key, headers[key]);
    }
    this.#headerSent = true;
  }
  /** @internal Writes the HTTP status line using the current status code. */
  writeStatus(): void {
    const statusText = STATUS_TEXT[this.#statusCode] ?? this.#statusCode;
    this.raw.writeStatus(statusText);
  }
  /**
   * `.end()` can finish the response with an optional body.
   *
   * @example
   * ```ts
   * ctx.end('Done')
   * ```
   */
  end(body?: RecognizedString | null): void {
    if (this.closed || this.aborted) return;
    this.raw.cork(() => {
      this.writeStatus();
      this.writeHeader();
      const finish = () => {
        this.closed = true;
        this[kEvent]?.emit('close');
      };
      if (!body) {
        this.raw.end();
        return finish();
      }
      if (Buffer.isBuffer(body)) {
        body = body.buffer.slice(
          body.byteOffset,
          body.byteOffset + body.byteLength,
        ) as ArrayBuffer;
      }
      if (this.req.method === 'HEAD') {
        const len =
          body && typeof body === 'string' ? Buffer.byteLength(body) : 0;
        this.raw.endWithoutBody(len);
        return finish();
      }
      this.raw.end(body);
      return finish();
    });
  }
  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   * @example
   * ```ts
   * ctx.text('Hello World', 200);
   * ```
   */
  text(body: string, status?: HttpStatusCode): void {
    if (status !== undefined) this.#statusCode = status;
    this.#headers['content-type'] = 'text/plain; charset=utf-8';
    this.end(body);
  }
  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   * @example
   * ```ts
   * ctx.json({ ok: true })
   * ctx.json({ id: 1 }, 201)
   * ```
   */
  json(body: any, status?: HttpStatusCode): void {
    if (status !== undefined) this.#statusCode = status;
    this.#headers['content-type'] = 'application/json; charset=utf-8';
    this.end(JSON.stringify(body));
  }
  /**
   * `.html()` can render HTML as `Content-Type:text/html`.
   *
   * @example
   * ```ts
   * ctx.html('<h1>Hello</h1>')
   * ```
   */
  html(body: string, status?: HttpStatusCode): void {
    if (status !== undefined) this.#statusCode = status;
    this.#headers['content-type'] = 'text/html; charset=utf-8';
    this.end(body);
  }
  /**
   * `.redirect()` can redirect the client.
   *
   * The default status code is `302`.
   *
   * @example
   * ```ts
   * ctx.redirect('/login')
   * ctx.redirect('/moved', 301)
   * ```
   */
  redirect(url: string, status: RedirectStatusCode = 302): void {
    this.#statusCode = status;
    this.#headers['location'] = /^[\x20-\x7E]*$/.test(url)
      ? url
      : encodeURI(url);
    // Handle HEAD requests - no body allowed
    if (this.req.method === 'HEAD') this.end();
    else this.end();
  }
}
