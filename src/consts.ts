import {parseBytes} from './utils/tools';

// ANSI color codes for terminal output
export const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

/**
 * Constant representing all HTTP methods in uppercase.
 */
export const METHOD_NAME_ALL = 'ALL' as const;

/**
 * Constant representing all HTTP methods in lowercase.
 */
export const METHOD_NAME_ALL_LOWERCASE = 'all' as const;

/**
 * Array of supported HTTP methods.
 */
export const METHODS = [
  'get',
  'post',
  'put',
  'delete',
  'options',
  'patch',
] as const;

/**
 * Error message indicating that a route cannot be added because the matcher is already built.
 */
export const MESSAGE_MATCHER_IS_ALREADY_BUILT =
  'Can not add a route since the matcher is already built.';

/** Default chunk size (512KB) */
export const HIGH_WATER_MARK = parseBytes('512KB');

// Router class symbol
export const k500 = Symbol('k500');
export const k404 = Symbol('k404');

// Context class symbol
export const kMatch = Symbol('kMatch');
export const kCtxRes = Symbol('kCtxRes');
export const kCtxReq = Symbol('kCtxReq');
