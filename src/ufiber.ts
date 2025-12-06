import uWS from '../uws';
import {Context} from './core';
import {Pooling} from './utils/pool';
import {version} from '../package.json';
import {Router, compose} from './router';
import {k404, k500, kMatch} from './consts';
import {showModernBanner} from './utils/show';
import {type ByteString, parseBytes} from './utils/tools';

type CallBackUrl = (url: string) => void | Promise<void>;
type CallBackPath = (path: string) => void | Promise<void>;

export type FiberOptions = {
  http3?: boolean;
  appName?: string;
  /**
   * Enable object pooling for Context/Request objects.
   * Improves performance by reusing objects instead of creating new ones.
   * @default true
   */
  pooling?: boolean;
  /**
   * Pool configuration (only used when pooling is enabled)
   */
  poolOptions?: {
    /**
     * Maximum number of objects to keep in pool
     * @default 1000
     */
    maxSize?: number;
    /**
     * Number of objects to pre-allocate on startup
     * @default 0
     */
    preAlloc?: number;
  };
  /**
   * Allowed HTTP methods to read data body.
   */
  methods?: string[];
  /**
   * Maximum request body size.
   * @default "16MB"
   */
  bodyLimit?: ByteString;
  /**
   * Options passed directly to uWebSockets.js `App` or `SSLApp`.
   *
   * If both `key_file_name` and `cert_file_name` are provided,
   * uFiber will automatically create an HTTPS (`SSLApp`) server.
   */
  uwsOptions?: uWS.AppOptions;
};

/**
 * Fiber — High-performance wrapper with optional object pooling
 */
export class Fiber extends Router {
  #appName: string;
  #methods?: string[];
  /**
   * Underlying uWebSockets.js `App` or `SSLApp` instance.
   * Useful for advanced / low-level operations.
   */
  readonly uwsApp: uWS.TemplatedApp;
  /**
   * Whether this server is using HTTPS (true) or HTTP (false).
   */
  readonly isSSL: boolean;
  #listened?: boolean;
  #bodyLimit?: number;
  #pooling: Pooling<Context> | null;
  readonly #startTime: number = Date.now();

  /**
   * Create a new Fiber server instance with optional pooling.
   *
   * @param options - Fiber configuration options
   *
   * @example
   * ```
   * const app = new Fiber({bodyLimit: '64MB', appName: 'MyApp'});
   * ```
   * @example
   * ```ts
   * const app = new Fiber({
   *   pooling: true,
   *   poolOptions: {maxSize: 500, preAlloc: 50}
   * });
   * ```
   */
  constructor(config: FiberOptions = Object.create(null)) {
    super();
    this.#methods = config.methods;
    this.#appName = config.appName || 'uFiber';
    this.#listened = false;
    this.#bodyLimit = parseBytes(config.bodyLimit || '16MB');

    const opts = config.uwsOptions ?? {};
    if (config.http3) {
      if (!opts.key_file_name || !opts.cert_file_name)
        throw new Error(
          'uwsOptions.key_file_name and uwsOptions.cert_file_name are required for HTTP/3',
        );
      this.uwsApp = (uWS as any).H3App(opts);
      this.isSSL = true;
    } else if (opts.key_file_name && opts.cert_file_name) {
      this.uwsApp = uWS.SSLApp(opts);
      this.isSSL = true;
    } else {
      this.uwsApp = uWS.App(opts);
      this.isSSL = false;
    }

    if (config.pooling) {
      const poolOpts = config.poolOptions || {};
      this.#pooling = new Pooling<Context>(
        () => new Context(),
        ctx => ctx.reset(),
        {
          maxSize: poolOpts.maxSize,
          preAlloc: poolOpts.preAlloc,
        },
      );
    } else {
      this.#pooling = null;
    }
  }

  /** @internal Internal method to get context (pooled or new) */
  #getCtx(res: uWS.HttpResponse, req: uWS.HttpRequest): Context {
    if (this.#pooling) {
      const ctx = this.#pooling.acquire();
      ctx.init(req, res, {
        isSSL: this.isSSL,
        methods: this.#methods,
        appName: this.#appName,
        bodyLimit: this.#bodyLimit,
      });
      return ctx;
    } else {
      const ctx = new Context();
      ctx.init(req, res, {
        isSSL: this.isSSL,
        methods: this.#methods,
        appName: this.#appName,
        bodyLimit: this.#bodyLimit,
      });
      return ctx;
    }
  }

  /** @internal Internal method to release context back to pool */
  #releaseCtx(ctx: Context): void {
    if (this.#pooling) {
      const pool = this.#pooling;
      queueMicrotask(() => pool.release(ctx));
    }
  }

  /**
   * Get current pool statistics (only available when pooling is enabled)
   *
   * @example
   * ```ts
   * const stats = app.getPoolStats();
   * console.log(`Available: ${stats.available}, Created: ${stats.created}`);
   * ```
   */
  getPoolStats() {
    if (!this.#pooling) {
      return {
        created: 0,
        maxSize: 0,
        available: 0,
        poolingEnabled: false,
      };
    }
    return {
      ...this.#pooling.stats(),
      poolingEnabled: true,
    };
  }

  /** @internal Internal method to attach uWS handlers and route dispatcher */
  #createReqHandler() {
    this.uwsApp.any('/*', (res, req) => {
      const ctx = this.#getCtx(res, req);
      const matchResult = this.router.match(
        ctx.req.method === 'HEAD' ? 'GET' : ctx.req.method,
        ctx.req.path,
      );
      ctx.req[kMatch] = matchResult;
      const handlers = matchResult[0];
      // Release context after response finishes
      const releaseCtx = () => this.#releaseCtx(ctx);
      // If match-result not found
      if (handlers.length === 0) {
        this[k404](ctx);
        releaseCtx();
        return;
      }
      // Single handler
      if (handlers.length === 1) {
        const r = handlers[0][0];
        try {
          const result = r.handler(ctx, async () => r.nfHandler(ctx));
          if (result instanceof Promise) {
            result.catch(err => r.errHandler(err, ctx)).finally(releaseCtx);
          } else {
            releaseCtx();
          }
        } catch (err) {
          r.errHandler(err as Error, ctx);
          releaseCtx();
        }
        return;
      }
      // Multi-handler compose
      try {
        const result = compose(handlers)(ctx);
        if (result instanceof Promise) {
          result
            .catch(err => this[k500](err as Error, ctx))
            .finally(releaseCtx);
        } else {
          releaseCtx();
        }
      } catch (err) {
        this[k500](err as Error, ctx);
        releaseCtx();
      }
    });
  }

  /**
   * Start listening on a port, hostname, callback, or default.
   *
   * @example
   * ```ts
   * // 1. Listen with no config (OS picks a random port)
   * app.listenTcp((url) => {
   *   console.log('Server started at', url);
   * });
   * ```
   *
   * @example
   * ```ts
   * // 2. Listen on port only
   * app.listenTcp(3000, (url) => {
   *   console.log('Listening on', url);
   * });
   * ```
   *
   * @example
   * ```ts
   * // 3. Listen on port + hostname
   * app.listenTcp(3000, '127.0.0.1', (url) => {
   *   console.log('Listening on', url);
   * });
   * ```
   */
  listenTcp(cb?: CallBackUrl): void;
  listenTcp(port: number, cb?: CallBackUrl): void;
  listenTcp(port: number, host: string, cb?: CallBackUrl): void;
  listenTcp(
    port?: number | string | CallBackUrl,
    host?: string | CallBackUrl,
    cb?: CallBackUrl,
  ): void {
    if (this.#listened) {
      throw new Error('Already server running on tcp!');
    }
    this.#listened = true;
    this.#createReqHandler();
    // listen(callback)
    if (!cb && typeof port === 'function') {
      cb = port;
      port = 0; // OS chooses port
    }
    // listen(port, callback)
    if (typeof host === 'function') {
      cb = host;
      host = undefined;
    }
    // Normalize values
    const finalPort = typeof port === 'number' ? port : 0;
    const finalHost = typeof host === 'string' ? host : '0.0.0.0';
    this.#listenTcp(finalPort, finalHost, cb);
  }

  /**
   * Listen on a Unix domain socket. Uses `/tmp/ufiber.sock` by default.
   *
   * @example
   * // 1. Listen with no config
   * ```ts
   * app.listenUnix(path => {
   *   console.log('Listening on unix socket:', path);
   * });
   * ```
   *
   * @example
   * // 2. Listen custom path .sock
   * ```ts
   * app.listenUnix("/tmp/chat.sock", path => {
   *   console.log('Listening on', path);
   * });
   * ```
   */
  listenUnix(cb?: CallBackPath): void;
  listenUnix(path: string | CallBackPath, cb?: CallBackPath): void;
  listenUnix(path?: string | CallBackPath, cb?: CallBackPath): void {
    if (this.#listened) {
      throw new Error('Already server running on unix!');
    }
    this.#listened = true;
    this.#createReqHandler();
    // listenUnix(callback)
    if (!cb && typeof path === 'function') {
      cb = path;
      path = undefined!;
    }
    const sockPath = typeof path === 'string' ? path : '/tmp/ufiber.sock';
    // Normalize: allow "sock", "./sock", "/full/path.sock"
    const normalized =
      sockPath.startsWith('/') || sockPath.startsWith('./')
        ? sockPath
        : `./${sockPath}`;
    this.#listenUnix(normalized, cb);
  }

  /** @internal Internal method to start server on tcp. */
  #listenTcp(port: number, host: string, cb?: CallBackUrl) {
    this.uwsApp.listen(host, port, socket => {
      if (!socket)
        throw new Error(
          `Failed to listen on port ${port}.  No permission or already in use.`,
        );
      const protocol = this.isSSL ? 'https' : 'http';
      const realPort = uWS.us_socket_local_port(socket);
      const url = `${protocol}://${host}:${realPort}`;
      // If callback provided → use it (override)
      if (cb) {
        cb(url);
      } else {
        // No callback → show default banner
        showModernBanner({
          url,
          port: realPort,
          host,
          version,
          startTime: this.#startTime,
        });
      }
    });
  }

  /** @internal Internal method to start server on unix-socket. */
  #listenUnix(path: string, cb?: CallBackPath) {
    const normalized =
      path.startsWith('/') || path.startsWith('./') ? path : `./${path}`;
    this.uwsApp.listen_unix(socket => {
      if (!socket)
        throw new Error(`Failed to listen on unix socket: ${normalized}`);
      const display = normalized.replace(/^(\.\/|\/)+/, '');
      const url = `unix://${display}`;
      // If callback provided → use it (override)
      if (cb) {
        cb(url);
      } else {
        // No callback → show default banner
        showModernBanner({
          url,
          version,
          startTime: this.#startTime,
        });
      }
    }, normalized);
  }
}
