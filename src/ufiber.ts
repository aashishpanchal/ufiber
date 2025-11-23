import uWS from '../uws';
import path from 'node:path';
import {Context} from './http';
import {Router} from './router';
import {compose} from './router/layer';
import {parseBytes} from './utils/tools';
import type {uFiberOptions} from './types';
import {k404, k500, kMatch} from './consts';

/**
 * uFiber — A minimal wrapper around `uWebSockets.js`.
 */
export class uFiber extends Router {
  /**
   * Underlying uWebSockets.js `App` or `SSLApp` instance.
   * Useful for advanced / low-level operations.
   */
  readonly uws: uWS.TemplatedApp;

  /**
   * Whether this server is using HTTPS (true) or HTTP (false).
   */
  readonly isSSL: boolean;

  // Private properties
  #appName: string;
  #methods?: string[];
  #bodyLimit?: number;

  /**
   * Create a new uFiber server instance.
   *
   * @param options - uFiber configuration options
   *
   * @example
   * ```ts
   * const app = new uFiber({ bodyLimit: '64MB', appName: 'MyApp' });
   * ```
   */
  constructor(config: uFiberOptions = Object.create(null)) {
    super();
    this.#appName = config.appName || 'uFiber';
    this.#methods = config.methods;
    this.#bodyLimit = parseBytes(config.bodyLimit || '16MB');
    const opts = config.uwsOptions ?? {};
    if (opts.key_file_name && opts.cert_file_name) {
      this.uws = uWS.SSLApp(opts);
      this.isSSL = true;
    } else {
      this.uws = uWS.App(opts);
      this.isSSL = false;
    }
  }

  /**
   * Internal request dispatcher used for all HTTP routes.
   * This method is attached to `uws.any("/*")` and is invoked
   *
   * @param res - The uWebSockets.js `HttpResponse` object.
   * @param req - The uWebSockets.js `HttpRequest` object.
   * @internal
   */
  #dispatch = (res: uWS.HttpResponse, req: uWS.HttpRequest) => {
    const ctx = new Context({
      req,
      res,
      isSSL: this.isSSL,
      appName: this.#appName,
      bodyLimit: this.#bodyLimit,
      methods: this.#methods,
    });
    const matchResult = this.router.match(
      ctx.method === 'HEAD' ? 'GET' : ctx.method,
      ctx.path,
    );
    ctx[kMatch] = matchResult;
    // If match-result not found
    if (!matchResult) {
      return this[k404](ctx);
    }
    const handlers = matchResult[0];
    // Fast path: single handler
    if (handlers.length === 1) {
      const [handler, r] = handlers[0][0];
      // Getting global handlers
      const errHandler = r.errorHandler ?? this[k500];
      const nfHandler = r.notFoundHandler ?? this[k404];
      try {
        const result = handler(ctx, async () => nfHandler(ctx));
        if (result instanceof Promise)
          result.catch(err => errHandler(err, ctx));
      } catch (err: any) {
        errHandler(err, ctx);
      }
      return;
    }
    // Multi-handler compose
    try {
      const result = compose(handlers, this[k500], this[k404])(ctx);
      if (result instanceof Promise) result.catch(err => this[k500](err, ctx));
    } catch (error: any) {
      this[k500](error, ctx);
    }
  };

  /**
   * Start listening on a port, hostname, UNIX domain socket, or default.
   *
   * @example
   * ```ts
   * // 1. Listen on port only
   * app.listen(3000, (url) => {
   *   console.log('Listening on', url);
   * });
   * ```
   *
   * @example
   * ```ts
   * // 2. Listen on port + hostname
   * app.listen(3000, '127.0.0.1', (url) => {
   *   console.log('Listening on', url);
   * });
   * ```
   *
   * @example
   * ```ts
   * // 3. Listen on UNIX domain socket
   * app.listen('/tmp/server.sock', (path) => {
   *   console.log('Socket at', path);
   * });
   * ```
   *
   * @example
   * ```ts
   * // 4. Listen with no args (OS picks a random port)
   * app.listen((url) => {
   *   console.log('Server started at', url);
   * });
   * ```
   */
  listen(
    port: number,
    hostname: string,
    callback?: (url: string) => void | Promise<void>,
  ): void;
  listen(port: number, callback?: (url: string) => void | Promise<void>): void;
  listen(path: string, callback?: (path: string) => void | Promise<void>): void;
  listen(callback?: (url: string) => void): void;
  listen(...args: any[]): void {
    this.uws.any('/*', this.#dispatch);
    // Listen server
    let port: number | string = 0;
    let host: string | undefined;
    let cb: ((url: string) => void | Promise<void>) | undefined;
    // Normalize parameters
    if (typeof args[0] === 'function') {
      cb = args[0];
    } else if (typeof args[1] === 'function') {
      port = args[0];
      cb = args[1];
    } else {
      [port, host, cb] = args;
    }

    const onListen = (socket: any) => {
      if (!socket) {
        throw new Error(
          `Failed to listen on ${port}. No permission or address in use.`,
        );
      }
      let address: string;
      if (typeof port === 'string' && isNaN(Number(port))) {
        // It’s a Unix domain socket
        const normalizedPath =
          port.startsWith('/') || port.startsWith('./') ? port : `./${port}`;
        // Use absolute path for clarity
        address = path.resolve(normalizedPath);
      } else {
        const protocol = this.isSSL ? 'https' : 'http';
        address = `${protocol}://${host ?? '0.0.0.0'}:${port}`;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      cb ? cb(address) : console.log(address);
    };

    if (typeof port === 'string' && isNaN(Number(port))) {
      // Unix socket
      this.uws.listen_unix(onListen, port);
    } else {
      const numericPort = Number(port);
      if (host) this.uws.listen(host, numericPort, onListen);
      else this.uws.listen(numericPort, onListen);
    }
  }
}
