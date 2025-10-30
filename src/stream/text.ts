import {stream, UwsStream} from './stream';
import type {HttpResponse} from '../../uws';

/**
 * streamText()
 * ---------------------------------------------------------
 * Simplified text streaming utility for uWebSockets.js
 * Based on Hono's `streamText`, but uses your custom stream().
 */
export const streamText = async (
  res: HttpResponse,
  cb: (stream: UwsStream) => Promise<void>,
  onError?: (e: Error, stream: UwsStream) => Promise<void>,
): Promise<void> => {
  // Set equivalent headers for text streaming
  res.cork(() => {
    res.writeHeader('Content-Type', 'text/plain; charset=utf-8');
    res.writeHeader('X-Content-Type-Options', 'nosniff');
    res.writeHeader('Cache-Control', 'no-cache');
    res.writeHeader('Connection', 'keep-alive');
    // res.writeHeader('Transfer-Encoding', 'chunked');
  });
  // Delegate to the general-purpose streaming handler
  return await stream(res, cb, onError);
};
