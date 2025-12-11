import type {Middleware} from '@/types';

type TrustProxy = boolean | number | string | string[] | ((ip: string) => boolean);

/**
 * Trust Proxy Middleware for Fiber.
 *
 * @param {TrustProxy} [trust=false] - Trust configuration
 *
 * @example
 * ```ts
 * // Trust all proxies
 * app.use(trustProxy(true))
 *
 * // Trust specific IP
 * app.use(trustProxy('127.0.0.1'))
 *
 * // Trust multiple IPs
 * app.use(trustProxy(['127.0.0.1', '10.0.0.0/8']))
 *
 * // Trust first N hops
 * app.use(trustProxy(1))
 *
 * // Custom function
 * app.use(trustProxy((ip) => ip.startsWith('192.168.')))
 * ```
 */
export const trustProxy =
  (trust: TrustProxy = false): Middleware =>
  async (ctx, next) => {
    ctx.set('trust-proxy', trust);
    await next();
  };
