import {COLORS, kCtxRes} from '@/consts';
import {write} from '@/utils/tools';
import type {Middleware} from '@/types';

type Print = (msg: string) => void;

type Options = {
  /** Paths to skip logging (e.g., ['/health', '/metrics']) */
  ignore?: string[];
  /** Custom print function instead of pino */
  printer?: Print;
  /** Show client IP in logs */
  showIp?: boolean;
};

const colorStatus = (status: number) => {
  const c = (status / 100) | 0;
  if (c === 2) return COLORS.green + status + COLORS.reset;
  if (c === 3) return COLORS.cyan + status + COLORS.reset;
  if (c === 4) return COLORS.yellow + status + COLORS.reset;
  if (c === 5) return COLORS.red + status + COLORS.reset;
  return status;
};

/**
 * Request logger middleware.
 * Logs method, path, status code, and response time.
 *
 * @example
 * ```ts
 * // Basic usage
 * app.use(logger());
 * // Output: GET /users → 200 45ms
 *
 * // With IP address
 * app.use(logger({ showIp: true }));
 * // Output: [192.168.1.1] GET /users → 200 45ms
 *
 * // Ignore health checks
 * app.use(logger({ ignore: ['/health', '/metrics'] }));
 *
 * // Custom printer
 * app.use(logger({
 *   printer: (msg) => fs.appendFileSync('access.log', msg + '\n')
 * }));
 * ```
 */
export const logger = (opts: Options = Object.create(null)): Middleware => {
  const ignore = opts.ignore ?? [];
  // Pre-compute ignore check to avoid repeated array operations
  const checkIgnore = ignore.length
    ? (path: string) => ignore.some(i => path.startsWith(i))
    : () => false;
  return async (ctx, next) => {
    const {method, path} = ctx.req;
    if (checkIgnore(path)) return await next();
    // Fetch IP before response to avoid uWS access error
    const ip = opts.showIp ? ctx.ip : null;
    const start = Date.now();
    await next();
    const delta = Date.now() - start;
    const ms = COLORS.gray + `${delta}ms` + COLORS.reset;
    const status = ctx[kCtxRes].statusCode;
    const s = colorStatus(status);
    const ipStr = ip ? COLORS.gray + `[${ip}] ` + COLORS.reset : '';
    const str = `${ipStr}${method} ${path} → ${s} ${ms}`;
    if (opts.printer) opts.printer(str);
    else queueMicrotask(() => write(str + '\n'));
  };
};
