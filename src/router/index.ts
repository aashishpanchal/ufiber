import {SmartRouter} from './smart';
import {mergePath} from '@/utils/url';
import {TrieRouter} from './trie-tree';
import {RegExpRouter} from './reg-exp';
import {
  k404,
  k500,
  METHODS,
  METHOD_NAME_ALL,
  METHOD_NAME_ALL_LOWERCASE,
} from '@/consts';
import type {
  ErrorHandler,
  Handler,
  Middleware,
  NotFoundHandler,
  RouterRoute,
  Router as IRouter,
} from '@/types';

// Default Handlers
const onNotFound: NotFoundHandler = ctx =>
  ctx.status(404).text(`Cannot ${ctx.url} on ${ctx.method}`);

const onError: ErrorHandler = (err, ctx) => {
  console.error(err);
  ctx.status(500).text('Internal Server Error');
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

  // Symbol-based private handlers
  [k404]: NotFoundHandler = onNotFound;
  [k500]: ErrorHandler = onError;

  get!: (path: string, ...handlers: Handler[]) => this;
  post!: (path: string, ...handlers: Handler[]) => this;
  put!: (path: string, ...handlers: Handler[]) => this;
  delete!: (path: string, ...handlers: Handler[]) => this;
  patch!: (path: string, ...handlers: Handler[]) => this;
  head!: (path: string, ...handlers: Handler[]) => this;
  options!: (path: string, ...handlers: Handler[]) => this;
  all!: (path: string, ...handlers: Handler[]) => this;

  constructor() {
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
    // Router assignment
    this.router = new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()],
    });
  }

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
  on(
    method: string | string[],
    path: string | string[],
    ...handlers: Handler[]
  ): this {
    for (const p of [path].flat()) {
      this.#path = p;
      for (const m of [method].flat()) {
        handlers.forEach(handler =>
          this.#addRoute(m.toUpperCase(), this.#path, handler),
        );
      }
    }
    return this;
  }

  /**
   * Registers middleware handlers.
   * Works similarly to `app.use()` in Express.
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
  use(arg1: string | Middleware, ...handlers: Middleware[]): this {
    if (typeof arg1 === 'string') {
      this.#path = arg1;
    } else {
      this.#path = '*';
      handlers.unshift(arg1);
    }
    handlers.forEach(handler =>
      this.#addRoute(METHOD_NAME_ALL, this.#path, handler),
    );
    return this;
  }

  /**
   * Handles an error and returns a customized Response.
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Router} changed Router instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError(handler: ErrorHandler): this {
    this[k500] = handler;
    return this;
  }

  /**
   * Set a custom "not found" handler.
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Router} changed Router instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound(handler: NotFoundHandler): this {
    this[k404] = handler;
    return this;
  }

  /**
   * Mount another Router instance under a base path.
   *
   * @param {string} path - base Path
   * @param {Router} child - other Router instance
   *
   * @example
   * ```ts
   * const r1= new Router()
   * const r2 = new Router()
   *
   * r2.get("/user", c => c.text("user"))
   * r1.route("/api", r2) // GET /api/user
   * ```
   */
  route(path: string, child: Router): this {
    const self = this.group(path);
    // merge routes (Shadow Copy)
    child.routes.forEach(r => {
      r['path'] = mergePath(self.#basePath, r.path);
      // Copy all config routes
      self.router.add(r.method, r.path, [r.handler, r]);
      self.routes.push(r);
    });
    return this;
  }

  /**
   * Group routes under a shared prefix.
   *
   * @param prefix - The base path applied to all nested routes.
   * @param callback - Optional route-configuration callback.
   * @returns Returns `this` when callback is missing, otherwise `void`.
   *
   * @example
   * # Example - Chainable mode
   * router.group('/api')
   *       .get('/ping', c => c.text('pong'));
   *
   * # Example - Callback mode
   * router.group('/api', r => {
   *   r.get('/users', c => c.text('users'));
   *   r.post('/posts', c => c.text('created'));
   * });
   */
  group(prefix: string): Router;
  group(prefix: string, callback: (r: Router) => void): void;
  group(prefix: string, callback?: (r: Router) => void): void | Router {
    // Create a scoped "virtual router"
    const r = this.#clone();
    // Copy base path
    r.#basePath = mergePath(this.#basePath, prefix);
    // Callback mode
    if (callback) {
      callback(r);
      return;
    }
    // Chainable mode
    return r;
  }

  #clone(): Router {
    const clone = new Router();
    // Inherit handlers
    clone[k404] = this[k404];
    clone[k500] = this[k500];
    // Share internal structures
    clone.router = this.router;
    clone.routes = this.routes;
    return clone;
  }

  #addRoute(method: string, path: string, handler: Handler): void {
    path = mergePath(this.#basePath, path);
    method = method.toUpperCase();
    const errorHandler = this[k500] === onError ? undefined : this[k500];
    const notFoundHandler = this[k404] === onNotFound ? undefined : this[k404];
    const r: RouterRoute = {
      path,
      method,
      handler,
      basePath: this.#basePath,
      errorHandler,
      notFoundHandler,
    };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
}
