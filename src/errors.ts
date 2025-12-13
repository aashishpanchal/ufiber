import {STATUS_TEXT, HttpStatus} from './status';
import type {ClientErrorStatusCode, ServerErrorStatusCode} from './status';

/** The type for the body message of HTTP errors. */
type Message = string | string[];

/** The structure of the HTTP error body. */
type ErrorBody = {
  data?: Record<string, any> | null;
  code?: string | null;
  error: string;
  status: Status;
  message: Message;
};

// Define the type for the status code of HTTP errors
type Status = ServerErrorStatusCode | ClientErrorStatusCode;

const CLEAN_RE = /^\d+|[^a-zA-Z0-9 ]+/g;
const nameCache = new Map<number, string>();

/**
 * Get a human-readable error name from the HTTP status code.
 */
const getErrorName = (status: Status): string => {
  if (nameCache.has(status)) return nameCache.get(status)!;
  if (status < 400 || status > 511) return 'HttpError';
  const rawName = STATUS_TEXT[status];
  if (!rawName) return 'HttpError';
  // Remove apostrophes, punctuation, etc.
  const cleaned = rawName.replace(CLEAN_RE, '');
  // Split into words, capitalize each, join together
  const camel = cleaned
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
  // Store name if not exist
  const finalName = camel.endsWith('Error') ? camel : `${camel}Error`;
  nameCache.set(status, finalName);
  return finalName;
};

/**
 * Base class for handling HTTP errors.
 */
export class HttpError extends Error {
  /**
   * Creates an instance of `HttpError`.
   */
  constructor(
    readonly status: Status = HttpStatus.INTERNAL_SERVER_ERROR,
    readonly options: Pick<ErrorBody, 'message' | 'data' | 'code'> & {
      /** Optional custom name override for the error */
      name?: string;
      cause?: unknown;
    } = {message: 'HttpError'},
  ) {
    super(
      typeof options.message === 'string'
        ? options.message
        : getErrorName(status),
    );
    // Allow developer to override error name
    this.name = options.name ?? getErrorName(status);

    // Preserve stack trace
    Error.captureStackTrace?.(this, this.constructor);
  }

  getBody(): ErrorBody {
    const {name: error, status} = this;
    const {message, data = null, code = null} = this.options;
    return {status, error, message, data, code};
  }
}

/**
 * Utility function to create custom error classes.
 * @param status - HTTP status code.
 * @returns - A new error class.
 * @example
 * const NotFoundError = createHttpErrorClass(HttpStatus.NOT_FOUND);
 */
export const createHttpErrorClass = (status: Status) =>
  class extends HttpError {
    constructor(
      message: Message,
      options: {
        cause?: unknown;
        code?: string | null;
        data?: Record<string, unknown> | null;
      } = {},
    ) {
      super(status, {message, ...options});
    }
  };

/**
 * Represents a Bad Request HTTP error (400).
 * @extends {HttpError}
 */
export const BadRequestError = createHttpErrorClass(HttpStatus.BAD_REQUEST);

/**
 * Represents a Conflict HTTP error (409).
 * @extends {HttpError}
 */
export const ConflictError = createHttpErrorClass(HttpStatus.CONFLICT);

/**
 * Represents a Forbidden HTTP error (403).
 * @extends {HttpError}
 */
export const ForbiddenError = createHttpErrorClass(HttpStatus.FORBIDDEN);

/**
 * Represents a Not Found HTTP error (404).
 * @extends {HttpError}
 */
export const NotFoundError = createHttpErrorClass(HttpStatus.NOT_FOUND);

/**
 * Represents an UnAuthorized HTTP error (401).
 * @extends {HttpError}
 */
export const UnAuthorizedError = createHttpErrorClass(HttpStatus.UNAUTHORIZED);

/**
 * Represents an Internal Server Error HTTP error (500).
 * @extends {HttpError}
 */
export const InternalServerError = createHttpErrorClass(
  HttpStatus.INTERNAL_SERVER_ERROR,
);

/**
 * Represents an Content Too Larger Error HTTP error (413).
 * @extends {HttpError}
 */
export const ContentTooLargeError = createHttpErrorClass(
  HttpStatus.PAYLOAD_TOO_LARGE,
);
