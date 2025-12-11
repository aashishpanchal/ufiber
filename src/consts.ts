import {parseBytes} from './utils/tools';

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
export const METHODS = ['get', 'post', 'put', 'delete', 'options', 'patch'] as const;

/**
 * Error message indicating that a route cannot be added because the matcher is already built.
 */
export const MESSAGE_MATCHER_IS_ALREADY_BUILT = 'Can not add a route since the matcher is already built.';

/** Default chunk size (128KB) */
export const HIGH_WATER_MARK = parseBytes('256KB');

// Router class symbol
export const k500 = Symbol('k500');
export const k404 = Symbol('k404');

// Context class symbol
export const kMatch = Symbol('kMatch');
export const kCtxRes = Symbol('kCtxRes');

// Pooling methods
export const kInitMethod = Symbol('k-init-method');
export const kResetMethod = Symbol('k-reset-method');
