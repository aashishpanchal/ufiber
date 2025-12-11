import uWS from '../uws';
import {Context} from './core';
import {Pooling} from './utils/pool';
import {version} from '../package.json';
import {showBanner} from './utils/show';
import {Router, compose} from './router';
import {k404, k500, kInitMethod, kMatch, kResetMethod} from './consts';
import {ByteString, NullObject, parseBytes} from './utils/tools';

export type FiberOptions = {
  http3?: boolean;
  appName?: string;
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
  #pooling: Pooling<Context>;
  readonly #startTime: number = Date.now();

  /**
   * Create a new Fiber server instance with optional pooling.
   *
   * @param options - Fiber configuration options
   *
   * @example
   * ```ts
   * // With pooling enabled (default)
   * const app = new Fiber({bodyLimit: '64MB'});
   *
   * // Without pooling
   * const app = new Fiber({pooling: false});
   *
   * // With custom pool options
   * const app = new Fiber({
   *   pooling: true,
   *   poolOptions: {maxSize: 500, preAlloc: 10}
   * });
   * ```
   */
  constructor(config: FiberOptions = NullObject()) {
    super();
    this.#methods = config.methods;
    this.#appName = config.appName || 'uFiber';
    this.#listened = false;
    this.#bodyLimit = parseBytes(config.bodyLimit || '16MB');

    const opts = config.uwsOptions ?? {};
    if (config.http3) {
      if (!opts.key_file_name || !opts.cert_file_name)
        throw new Error('uwsOptions.key_file_name and uwsOptions.cert_file_name are required for HTTP/3');
      this.uwsApp = (uWS as any).H3App(opts);
      this.isSSL = true;
    } else if (opts.key_file_name && opts.cert_file_name) {
      this.uwsApp = uWS.SSLApp(opts);
      this.isSSL = true;
    } else {
      this.uwsApp = uWS.App(opts);
      this.isSSL = false;
    }

    this.#pooling = new Pooling<Context>(
      () => new Context(),
      ctx => ctx[kResetMethod](),
      config.poolOptions,
    );
  }

  /**
   * Get current pool statistics.
   * Returns null if pooling is disabled.
   *
   * @example
   * ```ts
   * const stats = app.getPoolStats();
   * if (stats) {
   *   console.log(`Available: ${stats.available}, Created: ${stats.created}`);
   * }
   * ```
   */
  getPoolStats() {
    return this.#pooling?.stats() ?? null;
  }

  /**
   * Add WebSocket support.
   *
   * @param pattern - URL pattern for WebSocket endpoint
   * @param behavior - WebSocket behavior configuration
   *
   * @example
   * ```ts
   * app.ws('/chat', {
   *   message: (ws, message, opCode) => {
   *     ws.send(message);
   *   },
   *   open: (ws) => {
   *     console.log('WebSocket connected');
   *   }
   * });
   * ```
   */
  ws<T>(pattern: string, behavior: uWS.WebSocketBehavior<T>): void {
    this.uwsApp.ws(pattern, behavior);
  }

  /** @internal Internal method to get context (pooled or new) */
  #getCtx(res: uWS.HttpResponse, req: uWS.HttpRequest): Context {
    const ctx = this.#pooling.acquire();
    // Initialize context first
    ctx[kInitMethod](req, res, {
      isSSL: this.isSSL,
      methods: this.#methods,
      appName: this.#appName,
      bodyLimit: this.#bodyLimit,
    });
    // Setup abort handler
    res.onAborted(() => {
      if (ctx.raw !== res || ctx.aborted || ctx.finished) return;
      ctx.req.destroy();
      ctx.events.emit('abort');
      ctx.events.emit('close');
      ctx.aborted = true;
      ctx.finished = true;
    });
    return ctx;
  }

  /** @internal Internal method to release context back to pool */
  #releaseCtx(ctx: Context): void {
    queueMicrotask(() => this.#pooling.release(ctx));
  }

  /** @internal Internal method to attach uWS handlers and route dispatcher */
  #createReqHandler() {
    this.uwsApp.any('/*', (res, req) => {
      const ctx = this.#getCtx(res, req);
      const matchResult = this.router.match(ctx.req.method === 'HEAD' ? 'GET' : ctx.req.method, ctx.req.path);
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
          result.catch(err => this[k500](err as Error, ctx)).finally(releaseCtx);
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
   * Start listening on a port and hostname.
   *
   * @example
   * ```ts
   * // 1. Listen with no config (OS picks a random port)
   * app.listen();
   
   * // 2. Listen on port only
   * app.listen(3000);
   
   * // 3. Listen on port + hostname
   * app.listen(3000, '127.0.0.1');
   * ```
   */
  listen(): void;
  listen(port: number): void;
  listen(port: number, host: string): void;
  listen(port?: number, host?: string): void {
    if (this.#listened) {
      throw new Error('Already server running on tcp!');
    }
    this.#listened = true;
    this.#createReqHandler();
    // Normalize values
    const finalPort = typeof port === 'number' ? port : 0;
    const finalHost = typeof host === 'string' ? host : '0.0.0.0';
    this.#listenTcp(finalPort, finalHost);
  }

  /**
   * Listen on a Unix domain socket. Uses `/tmp/ufiber.sock` by default.
   *
   * @example
   * ```ts
   * // 1. Listen with default path
   * app.listenUnix();
   
   * // 2. Listen on custom path
   * app.listenUnix("/tmp/chat.sock");
   * ```
   */
  listenUnix(): void;
  listenUnix(path: string): void;
  listenUnix(path?: string): void {
    if (this.#listened) {
      throw new Error('Already server running on unix!');
    }
    this.#listened = true;
    this.#createReqHandler();
    const sockPath = typeof path === 'string' ? path : '/tmp/ufiber.sock';
    // Normalize: allow "sock", "./sock", "/full/path.sock"
    const normalized = sockPath.startsWith('/') || sockPath.startsWith('./') ? sockPath : `./${sockPath}`;
    this.#listenUnix(normalized);
  }

  /** @internal Internal method to start server on tcp. */
  #listenTcp(port: number, host: string) {
    this.uwsApp.listen(host, port, socket => {
      if (!socket) throw new Error(`Failed to listen on port ${port}.  No permission or already in use.`);
      const protocol = this.isSSL ? 'https' : 'http';
      const realPort = uWS.us_socket_local_port(socket);
      const url = `${protocol}://${host}:${realPort}`;
      showBanner({
        url,
        host,
        version,
        port: realPort,
        startTime: this.#startTime,
      });
    });
  }

  /** @internal Internal method to start server on unix-socket. */
  #listenUnix(path: string) {
    const normalized = path.startsWith('/') || path.startsWith('./') ? path : `./${path}`;
    this.uwsApp.listen_unix(socket => {
      if (!socket) throw new Error(`Failed to listen on unix socket: ${normalized}`);
      const display = normalized.replace(/^(\.\/|\/)+/, '');
      const url = `unix://${display}`;
      showBanner({
        url,
        version,
        startTime: this.#startTime,
      });
    }, normalized);
  }
}
