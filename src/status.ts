/**
 * Pre-cached Http status code
 *
 * @publicApi http-status
 */
export const HttpStatus = Object.freeze({
  // 1xx
  CONTINUE: 100,
  SWITCHING_PROTOCOLS: 101,
  PROCESSING: 102,
  EARLY_HINTS: 103,
  // 2xx
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NON_AUTHORITATIVE_INFORMATION: 203,
  NO_CONTENT: 204,
  RESET_CONTENT: 205,
  PARTIAL_CONTENT: 206,
  MULTI_STATUS: 207,
  ALREADY_REPORTED: 208,
  IM_USED: 226,
  // 3xx
  MULTIPLE_CHOICES: 300,
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  SEE_OTHER: 303,
  NOT_MODIFIED: 304,
  USE_PROXY: 305,
  UNUSED: 306,
  TEMPORARY_REDIRECT: 307,
  PERMANENT_REDIRECT: 308,
  // 4xx
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  NOT_ACCEPTABLE: 406,
  PROXY_AUTHENTICATION_REQUIRED: 407,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  LENGTH_REQUIRED: 411,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  URI_TOO_LONG: 414,
  UNSUPPORTED_MEDIA_TYPE: 415,
  REQUESTED_RANGE_NOT_SATISFIABLE: 416,
  EXPECTATION_FAILED: 417,
  IM_A_TEAPOT: 418,
  MISDIRECTED_REQUEST: 421,
  UNPROCESSABLE_ENTITY: 422,
  LOCKED: 423,
  FAILED_DEPENDENCY: 424,
  TOO_EARLY: 425,
  UPGRADE_REQUIRED: 426,
  PRECONDITION_REQUIRED: 428,
  TOO_MANY_REQUESTS: 429,
  REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
  UNAVAILABLE_FOR_LEGAL_REASONS: 451,
  // 5xx
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  HTTP_VERSION_NOT_SUPPORTED: 505,
  VARIANT_ALSO_NEGOTIATES: 506,
  INSUFFICIENT_STORAGE: 507,
  LOOP_DETECTED: 508,
  BANDWIDTH_LIMIT_EXCEEDED: 509,
  NOT_EXTENDED: 510,
  NETWORK_AUTHENTICATION_REQUIRED: 511,
});

/**
 * Pre-cached HTTP status strings.
 *
 * @example "200 OK", "404 Not Found", "500 Internal Server Error"
 */
export const STATUS_TEXT = Object.freeze({
  // 1xx
  100: '100 Continue',
  101: '101 Switching Protocols',
  102: '102 Processing',
  103: '103 Early Hints',
  // 2xx
  200: '200 OK',
  201: '201 Created',
  202: '202 Accepted',
  203: '203 Non-Authoritative Information',
  204: '204 No Content',
  205: '205 Reset Content',
  206: '206 Partial Content',
  207: '207 Multi-Status',
  208: '208 Already Reported',
  226: '226 IM Used',
  // 3xx
  300: '300 Multiple Choices',
  301: '301 Moved Permanently',
  302: '302 Found',
  303: '303 See Other',
  304: '304 Not Modified',
  305: '305 Use Proxy',
  306: '306 Unused',
  307: '307 Temporary Redirect',
  308: '308 Permanent Redirect',
  // 4xx
  400: '400 Bad Request',
  401: '401 Unauthorized',
  402: '402 Payment Required',
  403: '403 Forbidden',
  404: '404 Not Found',
  405: '405 Method Not Allowed',
  406: '406 Not Acceptable',
  407: '407 Proxy Authentication Required',
  408: '408 Request Timeout',
  409: '409 Conflict',
  410: '410 Gone',
  411: '411 Length Required',
  412: '412 Precondition Failed',
  413: '413 Payload Too Large',
  414: '414 URI Too Long',
  415: '415 Unsupported Media Type',
  416: '416 Range Not Satisfiable',
  417: '417 Expectation Failed',
  418: "418 I'm a Teapot",
  421: '421 Misdirected Request',
  422: '422 Unprocessable Entity',
  423: '423 Locked',
  424: '424 Failed Dependency',
  425: '425 Too Early',
  426: '426 Upgrade Required',
  428: '428 Precondition Required',
  429: '429 Too Many Requests',
  431: '431 Request Header Fields Too Large',
  451: '451 Unavailable For Legal Reasons',
  // 5xx
  500: '500 Internal Server Error',
  501: '501 Not Implemented',
  502: '502 Bad Gateway',
  503: '503 Service Unavailable',
  504: '504 Gateway Timeout',
  505: '505 HTTP Version Not Supported',
  506: '506 Variant Also Negotiates',
  507: '507 Insufficient Storage',
  508: '508 Loop Detected',
  509: '509 Bandwidth Limit Exceeded',
  510: '510 Not Extended',
  511: '511 Network Authentication Required',
});

/**
 * Extracts the union of all value types of a given object type.
 *
 * @example
 * ```ts
 * type Example = { a: 1; b: 'x'; c: true };
 * type Values = ValueOf<Example>; // 1 | 'x' | true
 * ```
 */
type ValueOf<T> = T[keyof T];

/**
 * Extracts numeric status codes from {@link HttpStatus}.
 */
export type HttpStatusCode = ValueOf<typeof HttpStatus>;

/**
 * @module
 * HTTP Status Utility Types
 */

/** Informational & Success (1xx–2xx) */
export type SuccessStatusCode =
  | 100
  | 101
  | 102
  | 103
  | 200
  | 201
  | 202
  | 203
  | 204
  | 205
  | 206
  | 207
  | 208
  | 226;
/** Redirect (3xx) */
export type RedirectStatusCode =
  | 300
  | 301
  | 302
  | 303
  | 304
  | 305
  | 306
  | 307
  | 308;
/** Server Error (5xx) */
export type ServerErrorStatusCode =
  | 500
  | 501
  | 502
  | 503
  | 504
  | 505
  | 506
  | 507
  | 508
  | 509
  | 510
  | 511;
/**
 * Client Error (4xx)
 *
 * Automatically derived by excluding all known 1xx, 2xx, 3xx, and 5xx codes.
 */
export type ClientErrorStatusCode = Exclude<
  HttpStatusCode,
  SuccessStatusCode | RedirectStatusCode | ServerErrorStatusCode | -1
>;
