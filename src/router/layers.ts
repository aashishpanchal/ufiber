import type {Context} from '@/http';
import type {Result, RouterRoute} from '@/types';

type MatchedHandlers = Result<RouterRoute>[0];

/**
 * Compose multiple middleware functions into a single async callable function.
 */
export const compose =
  (middles: MatchedHandlers) =>
  (ctx: Context): Promise<void> => {
    let index = -1;
    const len = middles.length;

    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) throw new Error('next() called multiple times');

      index = i;
      if (i >= len) return;
      const r = middles[i][0];
      ctx.req.routeIndex = i;

      try {
        if (!r.handler) {
          await r.nfHandler(ctx);
          return;
        }
        // Execute handler
        await r.handler(ctx, () => dispatch(i + 1));
      } catch (err) {
        r.errHandler(err as Error, ctx);
      }
    };

    return dispatch(0);
  };
