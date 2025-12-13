import type {Context} from '@/http';
import type {Middleware} from '@/types';

type CORSOptions = {
  origin:
    | string
    | string[]
    | ((
        origin: string,
        c: Context,
      ) => Promise<string | undefined | null> | string | undefined | null);
  allowMethods?:
    | string[]
    | ((origin: string, c: Context) => Promise<string[]> | string[]);
  allowHeaders?: string[];
  maxAge?: number;
  credentials?: boolean;
  exposeHeaders?: string[];
};

/**
 * CORS Middleware for Fiber.
 *
 * @param {CORSOptions} [options] - The options for the CORS middleware.
 * @param {string | string[] | ((origin: string, c: Context) => Promise<string | undefined | null> | string | undefined | null)} [options.origin='*'] - The value of "Access-Control-Allow-Origin" CORS header.
 * @param {string[] | ((origin: string, c: Context) => Promise<string[]> | string[])} [options.allowMethods=['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH']] - The value of "Access-Control-Allow-Methods" CORS header.
 * @param {string[]} [options.allowHeaders=[]] - The value of "Access-Control-Allow-Headers" CORS header.
 * @param {number} [options.maxAge] - The value of "Access-Control-Max-Age" CORS header.
 * @param {boolean} [options.credentials] - The value of "Access-Control-Allow-Credentials" CORS header.
 * @param {string[]} [options.exposeHeaders=[]] - The value of "Access-Control-Expose-Headers" CORS header.
 * @returns {MiddlewareHandler} The middleware handler function.
 *
 * @example
 * ```ts
 * const app = new Fiber()
 *
 * app.use('/api/*', corsOrigin())
 * app.use(
 *   '/api2/*',
 *   corsOrigin({
 *     origin: 'http://example.com',
 *     allowHeaders: ['X-Custom-Header', 'Upgrade-Insecure-Requests'],
 *     allowMethods: ['POST', 'GET', 'OPTIONS'],
 *     exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
 *     maxAge: 600,
 *     credentials: true,
 *   })
 * )
 *
 * app.all('/api/abc', (ctx) => {
 *   return c.json({ success: true })
 * })
 * app.all('/api2/abc', (ctx) => {
 *   return c.json({ success: true })
 * })
 * ```
 */
export const corsOrigin = (options?: CORSOptions): Middleware => {
  const defaults: CORSOptions = {
    origin: '*',
    allowMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH'],
    allowHeaders: [],
    exposeHeaders: [],
  };

  const opts = {...defaults, ...options};

  const findAllowOrigin = (opt => {
    if (typeof opt === 'string') {
      if (opt === '*') return () => '*';
      return (origin: string) => (origin === opt ? origin : null);
    }
    if (typeof opt === 'function') return opt;
    return (origin: string) => (opt.includes(origin) ? origin : null);
  })(opts.origin);

  const findAllowMethods = (opt => {
    if (typeof opt === 'function') return opt;
    if (Array.isArray(opt)) return () => opt;
    return () => [];
  })(opts.allowMethods);

  return async (ctx, next) => {
    const origin = ctx.req.header('origin') || '';
    const allowOrigin = await findAllowOrigin(origin, ctx);
    if (allowOrigin) {
      ctx.header('access-control-allow-origin', allowOrigin);
    }
    if (opts.credentials) {
      ctx.header('access-control-allow-credentials', 'true');
    }
    if (opts.exposeHeaders?.length) {
      ctx.header('access-control-expose-headers', opts.exposeHeaders.join(','));
    }
    if (ctx.req.method === 'OPTIONS') {
      // Vary header for caching
      if (opts.origin !== '*') {
        ctx.header('vary', 'Origin');
      }
      if (opts.maxAge !== undefined) {
        ctx.header('access-control-max-age', opts.maxAge.toString());
      }
      const methods = await findAllowMethods(origin, ctx);
      if (methods.length) {
        ctx.header('access-control-allow-methods', methods.join(','));
      }
      let headers = opts.allowHeaders;
      if (!headers?.length) {
        const requestHeaders = ctx.req.header('access-control-request-headers');
        if (requestHeaders) {
          headers = requestHeaders.split(/\s*,\s*/);
        }
      }
      if (headers?.length) {
        ctx.header('access-control-allow-headers', headers.join(','));
        ctx.header('vary', 'access-control-request-headers', true);
      }
      ctx.status(204);
      ctx.header('content-type');
      ctx.header('content-length');
      return ctx.end();
    }

    await next();

    // Add Vary header for non-wildcard origins
    if (opts.origin !== '*') {
      ctx.header('vary', 'origin', true);
    }
  };
};
