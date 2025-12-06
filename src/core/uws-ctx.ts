import {kCtxRes} from '@/consts';
import {Request} from './uws-req';
import type {BaseMime, ResponseHeader} from '@/types';
import type {HttpRequest, HttpResponse, RecognizedString} from '../../uws';
import {
  STATUS_TEXT,
  type HttpStatusCode,
  type RedirectStatusCode,
} from '@/status';

interface SetHeaders {
  (name: 'content-type', value?: BaseMime, append?: boolean): void;
  (name: ResponseHeader, value?: string, append?: boolean): void;
  (name: string, value?: string, append?: boolean): void;
}

type ResData = {
  vars?: Record<string, unknown>;
  headers: Record<string, string>;
  statusCode: HttpStatusCode;
  headerSent: boolean;
  aborts: Array<() => void>;
};

type Options = {
  isSSL: boolean;
  appName: string;
  bodyLimit?: number;
  methods?: string[];
};

/**
 * ⚡ Unified high-performance Context for uWebSockets.js
 * Combines both Request + Response APIs into one streamlined object.
 */
export class Context {
  raw!: HttpResponse;
  req = new Request();
  /** True if the client disconnected before response was sent */
  aborted = false;
  /** True once response is completed */
  finished = false;
  #cachedIp?: string;
  #abortHandler?: () => void;
  [kCtxRes]: ResData = {
    aborts: [],
    headers: Object.create(null),
    headerSent: false,
    statusCode: 200,
  };

  /**
   * Initialize/reinitialize the context for a new request
   */
  init(
    reqRaw: HttpRequest,
    res: HttpResponse,
    {appName, ...opts}: Options,
  ): this {
    this.raw = res;
    // ALWAYS reinitialize request with new data
    this.req.init(reqRaw, res, opts);
    // Default headers
    this[kCtxRes].headers['x-powered-by'] = appName;
    // Abort handling - create handler if not exists to prevent listener leak
    if (!this.#abortHandler) {
      this.#abortHandler = () => {
        if (this.aborted || this.finished) return;
        this.aborted = true;
        this.finished = true;
        this.req._destroy();
        this[kCtxRes].aborts.forEach(cb => cb());
        this[kCtxRes].aborts.length = 0;
      };
    }
    res.onAborted(this.#abortHandler);

    return this;
  }

  /**
   * Register a callback that runs if the client disconnects.
   *
   * @example
   * ```ts
   * ctx.onAbort(() => console.log("Client left early"));
   * ```
   */
  onAbort(fn: () => void): void {
    this[kCtxRes].aborts.push(fn);
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
    const vars =
      this[kCtxRes].vars ?? (this[kCtxRes].vars = Object.create(null));
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
   * Set HTTP status code.
   * Can be chained with response methods.
   *
   * @example
   * ```ts
   * ctx.status(201).json({ created: true });
   * ```
   */
  status(code: HttpStatusCode): this {
    this[kCtxRes].statusCode = code;
    return this;
  }

  /**
   * Set or append response headers.
   *
   * @example
   * ```ts
   * ctx.header('Content-Type', 'application/json');
   * ctx.header('x-id', '123', true); // append
   * ctx.header('x-remove'); // delete
   * ```
   */
  header: SetHeaders = (field, value, append): void => {
    const r = this[kCtxRes];
    if (r.headerSent)
      throw new Error('Cannot set headers after they are sent to the client');
    // DELETE
    if (value === undefined) delete r.headers[field];
    // APPEND
    else if (append) {
      const existing = r.headers[field];
      r.headers[field] = existing ? `${existing}, ${value}` : value;
    }
    // SET (replace)
    else r.headers[field] = value;
  };

  /**
   * Writes all queued response headers to the underlying uWS response.
   * Called automatically before sending the body.
   *
   * @example
   * ```ts
   * // Normally you don't call this directly.
   * // It runs inside ctx.end(), ctx.json(), ctx.text(), etc.
   * ctx.header('x-id', '123');
   * ctx.end('OK'); // writeHeaders() runs internally
   * ```
   */
  writeHeaders() {
    const r = this[kCtxRes];
    const headers = r.headers;
    for (const key in headers) {
      this.raw.writeHeader(key, headers[key]);
    }
    r.headerSent = true;
  }

  /**
   * Writes the HTTP status line (e.g. "200 OK") to the response.
   * Called automatically before headers/body.
   *
   * @example
   * ```ts
   * // Internal usage:
   * ctx.status(404);
   * ctx.end('Not Found'); // writeStatus() runs automatically
   * ```
   */
  writeStatus() {
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
  end(body?: RecognizedString, cb?: () => void): void {
    if (this.finished || this.aborted) return;
    this.raw.cork(() => {
      const finish = () =>
        queueMicrotask(() => {
          this.finished = true;
          cb?.();
        });
      this.writeStatus();
      this.writeHeaders();
      if (this.req.method === 'HEAD') {
        const len =
          body && typeof body === 'string' ? Buffer.byteLength(body) : 0;
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
        const arrBuf = body.buffer.slice(
          body.byteOffset,
          body.byteOffset + body.byteLength,
        ) as ArrayBuffer;
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
   * ctx.status(200).text('Success');
   * ```
   */
  text(body: string, status?: HttpStatusCode): void {
    const r = this[kCtxRes];
    if (status !== undefined) r.statusCode = status;
    r.headers['content-type'] = 'text/plain; charset=utf-8';
    this.end(body);
  }

  /**
   * Send JSON response
   *
   * @example
   * ```ts
   * ctx.json({ ok: true });
   * ctx.json({ error: "Missing" }, 404);
   * ```
   */
  json(body: any, status?: HttpStatusCode): void {
    const r = this[kCtxRes];
    if (status !== undefined) r.statusCode = status;
    r.headers['content-type'] = 'application/json; charset=utf-8';
    this.end(JSON.stringify(body));
  }

  /**
   * Send HTML response
   *
   * @example
   * ```ts
   * ctx.html('<h1>Welcome</h1>');
   * ctx.html('<p>Error</p>', 500);
   * ```
   */
  html(body: string, status?: HttpStatusCode): void {
    const r = this[kCtxRes];
    if (status !== undefined) r.statusCode = status;
    r.headers['content-type'] = 'text/html; charset=utf-8';
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
   * Reset the context for reuse in object pool
   */
  reset(): void {
    if (this.req.isInit) {
      this.req.reset();
    }
    // Clear response data
    const r = this[kCtxRes];
    r.vars = undefined;
    r.headers = Object.create(null);
    r.statusCode = 200;
    r.headerSent = false;
    // Clear abort callbacks to prevent closure leaks
    r.aborts.length = 0;

    // Clear reference to uWS response to prevent memory leak
    this.raw = null as any;

    // Reset flags
    this.aborted = false;
    this.finished = false;
    this.#cachedIp = undefined;
  }
}
