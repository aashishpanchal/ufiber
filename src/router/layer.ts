import {Context} from '@/http';
import {kCtxReq} from '@/consts';
import type {NotFoundHandler, ErrorHandler, Next, RouterRoute} from '@/types';

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type Middleware = [[Function, RouterRoute], unknown][] | [[Function]][];

/**
 * Compose multiple middleware functions into a single async callable function.
 */
export const compose =
  (middles: Middleware, onError?: ErrorHandler, onNotFound?: NotFoundHandler) =>
  (ctx: Context, next?: Next): Promise<void> => {
    const index = -1;
    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) throw new Error('next() called multiple times');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      let fn: Function | undefined;
      let routeMeta: RouterRoute | undefined;
      if (middles[i]) {
        fn = middles[i][0][0];
        routeMeta = middles[i][0][1];
        ctx[kCtxReq].routeIndex = i;
      } else {
        fn = (i === middles.length && next) || undefined;
      }
      // Resolve per-route overrides (fastest possible)
      onError = routeMeta?.errorHandler ? routeMeta.errorHandler : onError;
      onNotFound = routeMeta?.notFoundHandler
        ? routeMeta.notFoundHandler
        : onNotFound;
      // No more middleware → maybe call onNotFound
      if (!fn) {
        if (onNotFound) await onNotFound(ctx);
        return;
      }
      // Run chain middlewares
      try {
        await fn(ctx, () => dispatch(i + 1));
      } catch (err) {
        if (onError) {
          await onError(err as Error, ctx);
        } else {
          throw err;
        }
      }
    };
    return dispatch(0);
  };
