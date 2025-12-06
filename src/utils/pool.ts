export class Pooling<T> {
  #pool: T[] = [];
  #created = 0;
  #maxSize: number;
  #reset: (obj: T) => void;
  #factory: () => T;

  constructor(
    factory: () => T,
    reset: (obj: T) => void,
    options: {maxSize?: number; preAlloc?: number} = {},
  ) {
    this.#reset = reset;
    this.#factory = factory;
    this.#maxSize = options.maxSize || 1000;
    // Pre-allocate instances
    const preAlloc = options.preAlloc || 0;
    for (let i = 0; i < preAlloc; i++) {
      this.#pool.push(factory());
      this.#created++;
    }
  }

  /**
   * Get an instance from pool or create new one
   */
  acquire(): T {
    const obj = this.#pool.pop();
    if (obj) return obj;
    this.#created++;
    return this.#factory();
  }

  /**
   * Return instance to pool after resetting
   */
  release(obj: T): void {
    if (this.#pool.length >= this.#maxSize) {
      // Pool is full, let GC handle it
      return;
    }
    this.#reset(obj);
    this.#pool.push(obj);
  }

  /**
   * Get pool statistics
   */
  stats() {
    return {
      available: this.#pool.length,
      created: this.#created,
      maxSize: this.#maxSize,
    };
  }

  /**
   * Clear the pool
   */
  clear(): void {
    this.#pool = [];
  }
}
