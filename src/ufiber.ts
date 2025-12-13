import uWS from '../uws';
import {Context} from './http/context';
import {version} from '../package.json';
import {Router, compose} from './router';
import {printBanner} from './utils/banner';
import {k404, k500, kMatch} from './consts';
import {bytes, ByteString, NullObject} from './utils/tools';
import type {
  AppOptions,
  HttpRequest,
  HttpResponse,
  TemplatedApp,
  WebSocketBehavior,
} from '../uws';

export type FiberOptions = {
  http3?: boolean;
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
  uwsOptions?: AppOptions;
};

/**
 * Fiber — High-performance wrapper on uWebSockets.js
 */
export class Fiber extends Router {
  #methods?: string[];
  /**
   * Underlying uWebSockets.js `App` or `SSLApp` instance.
   * Useful for advanced / low-level operations.
   */
  readonly uwsApp: TemplatedApp;
  /**
   * Whether this server is using HTTPS (true) or HTTP (false).
   */
  readonly isSSL: boolean;
  #listened?: boolean;
  #bodyLimit: number | null;
  readonly #startTime: number = Date.now();

  /**
   * Create a new Fiber server instance.
   *
   * @param options - Fiber configuration options
   *
   * @example
   * ```ts
   * const app = new Fiber({bodyLimit: '64MB'});
   * ```
   */
  constructor(config: FiberOptions = NullObject()) {
    super();
    this.#methods = config.methods;
    this.#bodyLimit = bytes(config.bodyLimit || '16MB');
    this.#listened = false;

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
  ws<T>(pattern: string, behavior: WebSocketBehavior<T>): void {
    this.uwsApp.ws(pattern, behavior);
  }

  getCtx(req: HttpRequest, res: HttpResponse): Context {
    return new Context(req, res, {
      isSSL: this.isSSL,
      bodyLimit: this.#bodyLimit,
      methods: this.#methods,
    });
  }

  #createReqHandler() {
    this.uwsApp.any('/*', (res, req) => {
      const ctx = this.getCtx(req, res);
      const matchResult = this.router.match(
        ctx.req.method === 'HEAD' ? 'GET' : ctx.req.method,
        ctx.req.path,
      );
      ctx.req[kMatch] = matchResult;
      const handlers = matchResult[0];
      // If match-result not found
      if (handlers.length === 0) {
        this[k404](ctx);
        return;
      }
      // Single handler
      if (handlers.length === 1) {
        const r = handlers[0][0];
        try {
          const result = r.handler(ctx, async () => r.nfHandler(ctx));
          if (result instanceof Promise) {
            result.catch(err => r.errHandler(err, ctx));
          }
        } catch (err) {
          r.errHandler(err as Error, ctx);
        }
        return;
      }
      // Multi-handler compose
      try {
        const result = compose(handlers)(ctx);
        if (result instanceof Promise) {
          result.catch(err => this[k500](err as Error, ctx));
        }
      } catch (err) {
        this[k500](err as Error, ctx);
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
    const finalHost = typeof host === 'string' ? host : '::';
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
    const normalized =
      sockPath.startsWith('/') || sockPath.startsWith('./')
        ? sockPath
        : `./${sockPath}`;
    this.#listenUnix(normalized);
  }

  #listenTcp(port: number, host: string) {
    this.uwsApp.listen(host, port, socket => {
      if (!socket)
        throw new Error(
          `Failed to listen on port ${port}.  No permission or already in use.`,
        );
      const protocol = this.isSSL ? 'https' : 'http';
      const realPort = uWS.us_socket_local_port(socket);
      const url = `${protocol}://${host}:${realPort}`;
      printBanner({
        url,
        host,
        version,
        port: realPort,
        startTime: this.#startTime,
      });
    });
  }

  #listenUnix(path: string) {
    const normalized =
      path.startsWith('/') || path.startsWith('./') ? path : `./${path}`;
    this.uwsApp.listen_unix(socket => {
      if (!socket)
        throw new Error(`Failed to listen on unix socket: ${normalized}`);
      const display = normalized.replace(/^(\.\/|\/)+/, '');
      const url = `unix://${display}`;
      printBanner({
        url,
        version,
        startTime: this.#startTime,
      });
    }, normalized);
  }
}
