import ansis from 'ansis';
import type {Middleware} from '@/types';
import {NullObject, write} from '@/utils/tools';

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
  if (c === 2) return ansis.green(status);
  if (c === 3) return ansis.cyan(status);
  if (c === 4) return ansis.yellow(status);
  if (c === 5) return ansis.red(status);
  return status;
};

const colorMethod = (method: string) => {
  switch (method) {
    case 'GET':
      return ansis.blue(method);
    case 'POST':
      return ansis.green(method);
    case 'PUT':
      return ansis.yellow(method);
    case 'DELETE':
      return ansis.red(method);
    case 'PATCH':
      return ansis.magenta(method);
    case 'HEAD':
      return ansis.cyan(method);
    case 'OPTIONS':
      return ansis.gray(method);
    default:
      return ansis.white(method);
  }
};

const formatTime = () => {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return ansis.gray(`${h}:${m}:${s}`);
};

const formatDuration = (ms: number) => {
  if (ms < 100) return ansis.green(`${ms}ms`);
  if (ms < 500) return ansis.yellow(`${ms}ms`);
  if (ms < 1000) return ansis.magenta(`${ms}ms`);
  return ansis.red(`${(ms / 1000).toFixed(2)}s`);
};

/**
 * Request logger middleware with incoming/outgoing logs.
 *
 * @example
 * ```ts
 * // Basic usage
 * app.use(logger());
 * // Output:
 * // --> GET /users
 * // <-- GET /users 200 45ms
 *
 * // With IP address
 * app.use(logger({ showIp: true }));
 * // Output:
 * // --> GET /users [192.168.1.1]
 * // <-- GET /users 200 45ms
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
export const logger = (opts: Options = NullObject()): Middleware => {
  const ignore = opts.ignore ?? [];
  const checkIgnore = ignore.length
    ? (path: string) => ignore.some(i => path.startsWith(i))
    : () => false;

  const print = (msg: string) => {
    if (opts.printer) opts.printer(msg);
    else write(msg + '\n', true);
  };

  return async (ctx, next) => {
    const {method, path} = ctx.req;
    if (checkIgnore(path)) return await next();

    const ip = opts.showIp ? ctx.ip : null;
    const time = formatTime();
    const m = colorMethod(method);
    const ipStr = ip ? ansis.gray(` [${ip}]`) : '';

    // Incoming request
    print(`${time} ${ansis.gray('-->')} ${m} ${ansis.white(path)}${ipStr}`);

    const start = Date.now();
    await next();
    const delta = Date.now() - start;

    // Outgoing response
    const status = ctx.statusCode;
    const s = colorStatus(status);
    const dur = formatDuration(delta);

    print(`${time} ${ansis.gray('<--')} ${m} ${ansis.white(path)} ${s} ${dur}`);
  };
};
