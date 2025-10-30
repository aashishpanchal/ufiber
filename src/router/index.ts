import {HttpError} from '../errors';
import {SmartRouter} from './smart';
import {mergePath} from '../utils/url';
import {TrieRouter} from './trie-tree';
import {RegExpRouter} from './reg-exp';
import {METHOD_NAME_ALL, METHOD_NAME_ALL_LOWERCASE, METHODS} from '../consts';
import type {Handler, RouterRoute, Router as IRouter, Target, $404Handler, ErrorHandler} from '../types';

const notFoundHandler: $404Handler = c => {
  return c.status(404).text('404 Not Found');
};

const errorHandler: ErrorHandler = (err, c) => {
  if (HttpError.isHttpError(err)) return c.status(err.status).json(err.getBody());
  return c.status(501).text('Internal Server Error');
};

/**
 * Lightweight, router built on top of a RegExp/Trie based matcher.
 * Supports single or multiple route matchers (Trie, RegExp, or both).
 * like multi-router delegation and single-router optimization.
 */
export class Router {
  routes: RouterRoute[] = [];
  #basePath = '/';
  #path = '/';
  router: IRouter<[Handler, RouterRoute]>;

  /** Register a GET route. */
  get!: (path: string, ...handlers: Handler[]) => this;
  /** Register a POST route. */
  post!: (path: string, ...handlers: Handler[]) => this;
  /** Register a PUT route. */
  put!: (path: string, ...handlers: Handler[]) => this;
  /** Register a DELETE route. */
  delete!: (path: string, ...handlers: Handler[]) => this;
  /** Register a PATCH route. */
  patch!: (path: string, ...handlers: Handler[]) => this;
  /** Register a HEAD route. */
  head!: (path: string, ...handlers: Handler[]) => this;
  /** Register an OPTIONS route. */
  options!: (path: string, ...handlers: Handler[]) => this;
  /** Register a route matching any HTTP method. */
  all!: (path: string, ...handlers: Handler[]) => this;

  /**
   * Creates a new Router instance.
   *
   * @param router - Determines internal matcher:
   *   'trie'    → uses TrieRouter
   *   'regexp'  → uses RegExpRouter
   *   'both'    → uses SmartRouter (RegExp + Trie)
   *   IRouter   → use provided router directly
   *
   * @example
   * // Multi-router (default)
   * import express from 'express';
   * import {Router} from 'exstack';
   *
   * const app = express();
   * const api = new Router(); // uses both Trie + RegExp internally
   *
   * api.get('/ping', (req, res) => res.send('pong'));
   * api.post('/login', (req, res) => res.send({ token: 'abc123' }));
   *
   * app.use(api.dispatch);
   */
  constructor(router: Target = 'both') {
    // Dynamically assign route registration methods
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach(method => {
      this[method] = (arg1: string | Handler, ...args: Handler[]) => {
        const path = typeof arg1 === 'string' ? arg1 : this.#path;
        if (typeof arg1 !== 'string') this.#addRoute(method, path, arg1);
        args.forEach(handler => this.#addRoute(method, path, handler));
        return this as any;
      };
    });
    // --- dynamic router assignment ---
    switch (router) {
      case 'trie':
        this.router = new TrieRouter();
        break;
      case 'regexp':
        this.router = new RegExpRouter();
        break;
      case 'both':
        this.router = new SmartRouter({
          routers: [new RegExpRouter(), new TrieRouter()],
        });
        break;
      default:
        throw new Error(`Router constructor expects 'trie', 'regexp', 'both'. Received: ${router}`);
    }
  }

  #notFound: $404Handler = notFoundHandler;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  private errorHandler: ErrorHandler = errorHandler;

  /**
   * Register a route for one or more HTTP methods and paths.
   *
   * @param method - A single method or an array of methods (e.g. `'get'`, `'post'`).
   * @param path - A single path or an array of paths.
   * @param handlers - One or more handlers to attach.
   * @returns This router instance (for chaining).
   *
   * @example
   * ```ts
   * router.on(['get', 'post'], ['/user', '/account'], handler);
   * ```
   */
  on = (method: string | string[], path: string | string[], ...handlers: Handler[]): Router => {
    for (const p of [path].flat()) {
      this.#path = p;
      for (const m of [method].flat()) {
        handlers.forEach(handler => this.#addRoute(m.toUpperCase(), this.#path, handler));
      }
    }
    return this;
  };

  /**
   * Registers middleware handlers.
   * Works similarly to `app.use()` in Express.
   *
   * - If called with a path: attaches handlers only for that path.
   * - If called without a path: applies globally to all requests.
   *
   * @param arg1 - Path string or the first handler function.
   * @param handlers - Additional handler functions.
   * @returns This router instance.
   *
   * @example
   * ```ts
   * router.use(authMiddleware);
   * router.use('/api', apiMiddleware);
   * ```
   */
  use = (arg1: string | Handler, ...handlers: Handler[]): Router => {
    if (typeof arg1 === 'string') {
      this.#path = arg1;
    } else {
      this.#path = '*';
      handlers.unshift(arg1);
    }
    handlers.forEach(handler => this.#addRoute(METHOD_NAME_ALL, this.#path, handler));
    return this;
  };

  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#error-handling}
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = (handler: ErrorHandler): Router => {
    this.errorHandler = handler;
    return this;
  };

  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = (handler: $404Handler): Router => {
    this.#notFound = handler;
    return this;
  };

  /**
   * `.route()` allows grouping other Fiver instance in routes.
   *
   * @param {string} path - base Path
   * @param {Router} router - other Router instance
   * @returns {Router} routed Router instance
   *
   * @example
   * ```ts
   * const app = new Router()
   * const app2 = new Router()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path: string, router: Router): Router {
    if (router === this) throw new Error('Cannot mount router onto itself');
    const base = mergePath(this.#basePath, path);
    // If same router type or SmartRouter root → merge routes
    if (
      this.router.name === router.router.name || // same type (e.g., both RegExpRouter)
      this.router.name === 'SmartRouter' // SmartRouter root → universal
    ) {
      // merge routes (Shadow Copy)
      router.routes.forEach(r => {
        this.#addRoute(r.method, mergePath(base, r.path), r.handler);
      });
    } else {
      // Fallback → Throw Error
      throw new Error(
        `Cannot mount sub-router with different type (${router.router.name}) on root router (${this.router.name})!`,
      );
    }
    return this;
  }

  /**
   * Internal method that registers a route into the internal matcher.
   */
  #addRoute(method: string, path: string, handler: Handler): Router {
    method = method.toUpperCase();
    const fullPath = mergePath(this.#basePath, path);

    const route: RouterRoute = {
      basePath: this.#basePath,
      path: fullPath,
      method,
      handler,
    };

    this.router.add(method, path, [handler, route]);
    this.routes.push(route);

    return this;
  }
}
