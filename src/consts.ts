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

export const TEXT_PLAIN = 'text/plain; charset=UTF-8';
