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
