import type {Middleware} from '@/types';

type Options = {
  /**
   * The value for X-Powered-By header.
   * @default uFiber
   */
  serverName?: string;
};

/**
 * Powered By Middleware for Fiber.
 *
 * @param options - The options for the Powered By Middleware.
 * @returns {Middleware} The middleware handler function.
 *
 * @example
 * ```ts
 * import {poweredBy} from 'ufiber/powered-by'
 *
 * const app = new Fiber()
 *
 * app.use(poweredBy()) // With options: poweredBy({ serverName: "My Server" })
 * ```
 */
export const poweredBy = (options?: Options): Middleware =>
  async function poweredBy(c, next) {
    await next();
    c.raw.writeHeader('X-Powered-By', options?.serverName ?? 'uFiber');
  };
