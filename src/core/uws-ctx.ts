import {kCtxRes, kInitMethod, kResetMethod} from '@/consts';
import {Request} from './uws-req';
import {NullObject} from '@/utils/tools';
import {EventEmitter} from 'node:events';
import {CookieManager} from '@/helps/cookie/object';
import type {BaseMime, ResponseHeader} from '@/types';
import type {HttpRequest, HttpResponse, RecognizedString} from '../../uws';
import {STATUS_TEXT, type HttpStatusCode, type RedirectStatusCode} from '@/status';

type ResData = {
  vars?: Record<string, unknown>;
  headers: Record<string, string>;
  cachedIp?: string;
  statusCode: HttpStatusCode;
  headerSent: boolean;
};

type Options = {
  isSSL: boolean;
  appName: string;
  bodyLimit?: number;
  methods?: string[];
};

type EventType = Record<'abort' | 'close', []>;

/**
 * ⚡ Unified high-performance Context for uWebSockets.js
 * Combines both Request + Response APIs into one streamlined object.
 */
export class Context {
  raw!: HttpResponse;
  req = new Request();
  aborted = false;
  finished = false;
  events = new EventEmitter<EventType>();
  [kCtxRes]: ResData = {
    headers: NullObject(),
    statusCode: 200,
    headerSent: false,
  };
  #cookie?: CookieManager;

  [kInitMethod](reqRaw: HttpRequest, res: HttpResponse, {appName, ...opts}: Options): this {
    this.raw = res;
    this.req[kInitMethod](reqRaw, res, opts);
    this.events.removeAllListeners();
    this[kCtxRes].headers['X-Powered-By'] = appName;
    return this;
  }

  /**
   * Access cookie operations for reading and writing HTTP cookies.
   *
   * @example
   * ```ts
   * ctx.cookie.set('user_id', '123', { maxAge: 3600 });
   * ctx.cookie.delete('old_token');
   * ```
   */
  get cookie(): CookieManager {
    if (!this.#cookie) {
      this.#cookie = new CookieManager(this);
    }
    return this.#cookie;
  }

  /**
   * Store data for later middlewares or handlers.
   *
   * @example
   * ```ts
   * ctx.set('user', { id: 1 });
   * ```
   */
  set<T>(key: string, value: T): this {
    const vars = this[kCtxRes].vars ?? (this[kCtxRes].vars = NullObject());
    vars[key] = value;
    return this;
  }

  /**
   * Retrieve stored data.
   *
   * @example
   * ```ts
   * const user = ctx.get<{ id: number }>('user');
   * ```
   */
  get<T>(key: string): T | undefined {
    return this[kCtxRes].vars?.[key] as T | undefined;
  }

  /**
   * Get client IP address (supports IPv4 and IPv6).
   * Checks proxy headers first if trustProxy middleware is enabled.
   *
   * @example
   * ```ts
   * const ip = ctx.ip; // "192.168.1.1" or "::1"
   * ```
   */
  get ip(): string {
    const r = this[kCtxRes];
    if (r.cachedIp) return r.cachedIp;
    const trust = this.get('trust-proxy');
    // Check proxy headers only if trust is enabled
    if (trust) {
      const forwarded = this.req.header('x-forwarded-for');
      if (forwarded) {
        r.cachedIp = forwarded.split(',')[0].trim();
        return r.cachedIp;
      }
      const realIp = this.req.header('x-real-ip');
      if (realIp) {
        r.cachedIp = realIp;
        return r.cachedIp;
      }
    }
    // Get raw IP from uWebSockets
    const rawIp = this.raw.getRemoteAddress();
    if (rawIp.byteLength === 4) {
      // IPv4
      r.cachedIp = new Uint8Array(rawIp).join('.');
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
      r.cachedIp = ip;
    } else {
      // Unix socket
      r.cachedIp = '-';
    }
    return r.cachedIp;
  }

  /**
   * Set HTTP status code.
   * Can be chained with response methods.
   *
   * @example
   * ```ts
   * ctx.status(201);
   * ctx.text("hello world");
   * ```
   */
  status(code: HttpStatusCode): void {
    this[kCtxRes].statusCode = code;
  }

  /**
   * Register a callback to be called when the request is aborted.
   *
   * @example
   * ```ts
   * ctx.onAbort(() => {
   *   console.log('Client disconnected');
   * });
   * ```
   */
  onAbort(listener: () => void): void {
    this.events.on('abort', listener);
  }

  /**
   * Register a callback to be called when the response is closed.
   *
   * @example
   * ```ts
   * ctx.onClose(() => {
   *   console.log('Response closed');
   * });
   * ```
   */
  onClose(listener: () => void): void {
    this.events.on('close', listener);
  }

  /**
   * Set or append response headers.
   *
   * @example
   * ```ts
   * ctx.header('x-remove'); // delete
   * ctx.header('x-id', '123', true); // append
   * ctx.header('Content-Type', 'application/json');
   * ```
   */
  header(name: 'Content-Type', value?: BaseMime, append?: boolean): void;
  header(name: ResponseHeader, value?: string, append?: boolean): void;
  header(name: string, value?: string, append?: boolean): void;
  header(field: any, value: any, append: any): void {
    const r = this[kCtxRes];
    if (r.headerSent) throw new Error('Cannot set headers after they are sent to the client');
    // DELETE
    if (value === undefined) delete r.headers[field];
    // APPEND
    else if (append) {
      const existing = r.headers[field];
      r.headers[field] = existing ? `${existing}, ${value}` : value;
    }
    // SET (replace)
    else r.headers[field] = value;
  }

  /**
   * @internal
   * Writes all queued response headers to the underlying uWS response.
   * Called automatically before sending the body.
   */
  _writeHeaders() {
    const r = this[kCtxRes];
    const headers = r.headers;
    for (const key in headers) {
      this.raw.writeHeader(key, headers[key]);
    }
    r.headerSent = true;
  }

  /**
   * @internal
   * Writes the HTTP status line (e.g. "200 OK") to the response.
   * Called automatically before headers/body.
   */
  _writeStatus() {
    const r = this[kCtxRes];
    const statusText = STATUS_TEXT[r.statusCode];
    this.raw.writeStatus(statusText);
  }

  /**
   * End response with optional body
   *
   * @example
   * ```ts
   * ctx.end('Hello World');
   * ```
   */
  end(body?: RecognizedString): void {
    if (this.finished || this.aborted) return;
    this.raw.cork(() => {
      const finish = () => {
        this.finished = true;
        this.events.emit('close');
      };
      this._writeStatus();
      this._writeHeaders();
      if (this.req.method === 'HEAD') {
        const len = body && typeof body === 'string' ? Buffer.byteLength(body) : 0;
        this.raw.endWithoutBody(len);
        finish();
        return;
      }
      if (body === undefined) {
        this.raw.end();
        finish();
        return;
      }
      if (Buffer.isBuffer(body)) {
        const arrBuf = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
        finish();
        this.raw.end(arrBuf);
        return;
      }
      finish();
      this.raw.end(body);
    });
  }

  /**
   * Send plain text response
   *
   * @example
   * ```ts
   * ctx.text('Hello World', 200);
   * ```
   */
  text(body: string, status?: HttpStatusCode): void {
    const r = this[kCtxRes];
    if (status !== undefined) r.statusCode = status;
    r.headers['Content-Type'] = 'text/plain; charset=utf-8';
    this.end(body);
  }

  /**
   * Send JSON response
   *
   * @example
   * ```ts
   * ctx.json({ ok: true });
   * ```
   */
  json(body: any, status?: HttpStatusCode): void {
    const r = this[kCtxRes];
    if (status !== undefined) r.statusCode = status;
    r.headers['Content-Type'] = 'application/json; charset=utf-8';
    this.end(JSON.stringify(body));
  }

  /**
   * Send HTML response
   *
   * @example
   * ```ts
   * ctx.html('<h1>Welcome</h1>');
   * ```
   */
  html(body: string, status?: HttpStatusCode): void {
    const r = this[kCtxRes];
    if (status !== undefined) r.statusCode = status;
    r.headers['Content-Type'] = 'text/html; charset=utf-8';
    this.end(body);
  }

  /**
   * Redirect to another URL
   *
   * @example
   * ```ts
   * ctx.redirect('/login');
   * ctx.redirect('/new', 301);
   * ctx.redirect('https://example.com');
   * ```
   */
  redirect(url: string, status: RedirectStatusCode = 302): void {
    const r = this[kCtxRes];
    r.statusCode = status as any;
    r.headers['location'] = url;
    this.end();
  }

  /**
   * @internal
   * Reset the context for reuse in object pool
   */
  [kResetMethod](): void {
    // Clear response data
    const r = this[kCtxRes];
    r.vars = undefined;
    r.headers = NullObject();
    r.statusCode = 200;
    r.headerSent = false;
    r.cachedIp = undefined;
    this.raw = null as any;
    this.req[kResetMethod]();
    // Reset flags
    this.aborted = false;
    this.finished = false;
    // Clear event listeners
    this.events.removeAllListeners();
  }
}
