import type {BaseMime} from './utils/mime';
import type {ContentfulStatusCode, HttpStatusCode} from './status';
import type {HttpRequest, HttpResponse} from '../uws';
import type {Handler, $404Handler, Result, RouterRoute, ResponseHeader} from './types';

type HeaderRecord =
  | Record<'Content-Type', BaseMime>
  | Record<ResponseHeader, string | string[]>
  | Record<string, string | string[]>;

type Options = {
  /**
   * Handler for not found responses.
   */
  res: HttpResponse;
  req: HttpRequest;
  $404Handler?: $404Handler;
  matchResult: Result<[Handler, RouterRoute]>;
  path?: string;
};

export class Context {
  #req: HttpRequest;
  #res: HttpResponse;
  #matchResult: Result<[Handler, RouterRoute]> | undefined;
  #path: string | undefined;
  // Local data
  #var: Map<unknown, unknown> | undefined;
  // Track handler
  routeIndex: number | undefined;

  /**
   * `.error` can get the error object from the middleware if the Handler throws an error.
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   await next()
   *   if (c.error) {
   *     // do something...
   *   }
   * })
   * ```
   */
  error: Error | undefined;

  #status: HttpStatusCode | undefined;

  constructor(options: Options) {
    this.#req = options.req;
    this.#res = options.res;
    // Router match result
    this.#matchResult = options.matchResult;
    this.#path = options.path;
  }

  /**
   * `.req` is the instance of {@link HonoRequest}.
   */
  get req(): HttpRequest {
    return this.#req;
  }

  /**
   * The Response object for the current request.
   */
  get res(): HttpResponse {
    return this.#res;
  }

  /**
   * `.set()` can set the value specified by the key.
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Fiver is uws!!')
   *   await next()
   * })
   * ```
   */
  set = <T extends unknown>(key: string, value: T) => {
    this.#var ??= new Map();
    this.#var.set(key, value);
  };

  /**
   * `.get()` can use the value specified by the key.
   *
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get = <T extends unknown>(key: string): T | undefined => {
    return this.#var ? (this.#var.get(key) as T) : undefined;
  };

  status = (status: HttpStatusCode) => {
    this.#status = status;
    return this;
  };

  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   *
   * @example
   * ```ts
   * app.get('/say', (c) => {
   *   return c.text('Hello!')
   * })
   * ```
   */
  text = (text: string) => {};

  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   *
   * @example
   * ```ts
   * app.get('/api', (c) => {
   *   return c.json({ message: 'Hello!' })
   * })
   * ```
   */
  json = (value: object) => {};

  /**
   * `.redirect()` can Redirect, default status code is 302.
   *
   *
   * @example
   * ```ts
   * app.get('/redirect', (c) => {
   *   return c.redirect('/')
   * })
   * app.get('/redirect-permanently', (c) => {
   *   return c.redirect('/', 301)
   * })
   * ```
   */
  redirect = () => {};

  /**
   * `.notFound()` can return the Not Found Response.
   *
   *
   * @example
   * ```ts
   * app.get('/notfound', (c) => {
   *   return c.notFound()
   * })
   * ```
   */
  notFound = () => {};
}
