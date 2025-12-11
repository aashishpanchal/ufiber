import {Pooling} from '@/utils/pool';
import {describe, it, expect, beforeEach} from 'vitest';

describe('Pooling', () => {
  let factory: () => any;
  let reset: (obj: any) => void;

  beforeEach(() => {
    factory = () => ({x: 0, y: 0, used: false});
    reset = obj => {
      obj.x = 0;
      obj.y = 0;
      obj.used = false;
    };
  });

  it('should pre-allocate correctly', () => {
    const pool = new Pooling(factory, reset, {preAlloc: 5});

    expect(pool.stats().available).toBe(5);
    expect(pool.stats().created).toBe(5);
  });

  it('should acquire a new object when pool is empty', () => {
    const pool = new Pooling(factory, reset);

    const obj = pool.acquire();
    expect(obj).toBeDefined();
    expect(pool.stats().created).toBe(1);
  });

  it('should release and reuse objects', () => {
    const pool = new Pooling(factory, reset);

    const obj1 = pool.acquire();
    obj1.x = 123; // mutate to confirm reset works

    pool.release(obj1);

    const obj2 = pool.acquire();

    expect(obj2).toBe(obj1); // same instance reused
    expect(obj2.x).toBe(0); // reset applied
  });

  it('should respect maxSize and not grow beyond it', () => {
    const pool = new Pooling(factory, reset, {maxSize: 2});

    const a = factory();
    const b = factory();
    const c = factory();

    pool.release(a);
    pool.release(b);
    pool.release(c); // should be discarded

    expect(pool.stats().available).toBe(2);
  });

  it('stats() should report accurate values', () => {
    const pool = new Pooling(factory, reset, {preAlloc: 3});

    const o1 = pool.acquire();
    const _ = pool.acquire();
    pool.release(o1);

    expect(pool.stats()).toEqual({
      available: 2, // one released + one unused from preAlloc
      created: 3, // 3 pre-allocated
      maxSize: 1000,
    });
  });

  it('clear() should empty the pool', () => {
    const pool = new Pooling(factory, reset, {preAlloc: 5});

    expect(pool.stats().available).toBe(5);

    pool.clear();

    expect(pool.stats().available).toBe(0);
  });

  it('should ignore release(null/undefined)', () => {
    const pool = new Pooling(factory, reset);

    pool.release(undefined);

    pool.release(null);

    expect(pool.stats().available).toBe(0);
  });
});
