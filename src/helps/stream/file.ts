import {UwsStream} from './utils';
import {HttpError} from '@/errors';
import type {Context} from '@/core';
import {lookup as mimeLookup} from 'mrmime';
import {createReadStream, statSync} from 'node:fs';
import {resolve, isAbsolute, normalize} from 'node:path';

type Options = {
  /** Base directory for relative paths. Required if path is not absolute. */
  root?: string;
  /**
   * Disable caching headers. Set false for static assets.
   * @default true
   * @example noCache: false // enables browser caching
   */
  noCache?: boolean;
  /**
   * Force specific MIME type instead of auto-detection.
   * @example contentType: 'video/mp4'
   */
  contentType?: string;
  /**
   * Custom error handler called on streaming errors.
   * @example onError: (err, stream) => ctx.json({ error: err.message }, 500)
   */
  onError?: (err: Error, stream: UwsStream) => Promise<void> | void;
};

/**
 * Stream a file with support for range requests, caching, and security checks.
 *
 * @param ctx Request context
 * @param filePath Path to file (absolute or relative to root)
 * @param options Streaming options
 *
 * @example
 * ```ts
 * // Video streaming
 * app.get('/video/:id', async ctx => {
 *   await streamFile(ctx, `${ctx.params.id}.mp4`, {
 *     root: '/media',
 *     noCache: false
 *   });
 * });
 * ```
 */
export const streamFile = async (ctx: Context, filePath: string, options?: Options): Promise<void> => {
  const stream = new UwsStream(ctx);
  try {
    // Security: Path validation
    if (!options?.root && !isAbsolute(filePath)) {
      throw new HttpError(500, {
        message: 'Path must be absolute or specify root option',
      });
    }

    // Security: Check for null bytes
    if (filePath.indexOf('\0') !== -1) {
      throw new HttpError(400, {
        message: 'Invalid path',
      });
    }

    // Resolve full path
    const fullPath = options?.root ? resolve(options.root, filePath) : filePath;

    // Security: Prevent path traversal
    if (options?.root && !fullPath.startsWith(resolve(options.root))) {
      throw new HttpError(403, {
        message: 'Path traversal detected',
      });
    }

    // Security: Check for directory traversal patterns
    const normalized = normalize(fullPath);
    if (normalized !== fullPath || /\.\./.test(filePath)) {
      throw new HttpError(403, {
        message: 'Invalid path',
      });
    }

    // File info
    let stat;
    try {
      stat = statSync(fullPath);
    } catch (err) {
      throw new HttpError(404, {
        message: 'File not found',
      });
    }

    // Check if directory
    if (stat.isDirectory()) {
      throw new HttpError(404, {
        message: 'Path is a directory',
      });
    }
    const cType = options?.contentType || mimeLookup(fullPath) || 'application/octet-stream';

    // Standard headers
    ctx.header('Content-Type', cType);
    ctx.header('Accept-Ranges', 'bytes');
    ctx.header('Connection', 'keep-alive');
    ctx.header('Last-Modified', stat.mtime.toUTCString());
    ctx.header('ETag', `"${stat.size}-${stat.mtime.getTime()}"`);
    if (options?.noCache ?? true) ctx.header('Cache-Control', 'no-cache');
    else ctx.header('Cache-Control', 'public, max-age=31536000, immutable');

    // Handle conditional requests (304 Not Modified)
    const ifNoneMatch = ctx.req.header('if-none-match');
    const ifModifiedSince = ctx.req.header('if-modified-since');
    const etag = `"${stat.size}-${stat.mtime.getTime()}"`;

    if (ifNoneMatch === etag || (ifModifiedSince && new Date(ifModifiedSince) >= stat.mtime)) {
      ctx.status(304);
      return ctx.end();
    }

    // Handle HEAD requests
    if (ctx.req.method === 'HEAD') {
      ctx.status(200);
      ctx.header('Content-Length', stat.size.toString());
      return ctx.end();
    }

    const createStream = (start?: number, end?: number) => {
      const file = createReadStream(fullPath, {start, end, autoClose: true});
      stream.onAbort(() => {
        file.destroy();
      });
      return file;
    };

    // Handle range request if present
    const range = ctx.req.header('range');
    if (range && /^bytes=\d*-\d*$/.test(range)) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
      const start = startStr ? parseInt(startStr, 10) : 0;
      const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
      const chunkSize = Math.min(stat.size - 1, end) - start + 1;
      if (start >= stat.size || start > end) {
        ctx.status(416);
        ctx.header('Content-Range', `bytes */${stat.size}`);
        return ctx.end();
      }
      ctx.status(206);
      ctx.header('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      ctx.header('Content-Length', chunkSize.toString());
      return await stream.pipe(createStream(start, end), false);
    }
    // Normal response
    ctx.status(200);
    ctx.header('Content-Length', stat.size.toString());
    return await stream.pipe(createStream(), false);
  } catch (err) {
    console.error('[stream] Error:', err);
    if (options?.onError) {
      await options.onError(err as Error, stream);
    } else {
      ctx.status(500);
      ctx.header('Content-Type', 'text/plain');
      ctx.end('File streaming failed');
    }
  }
};
