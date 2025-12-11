export class Pooling<T> {
  #pool: T[] = [];
  #created = 0;
  #maxSize: number;
  #reset: (obj: T) => void;
  #factory: () => T;

  constructor(factory: () => T, reset: (obj: T) => void, options: {maxSize?: number; preAlloc?: number} = {}) {
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

  acquire(): T {
    if (this.#pool.length > 0) {
      return this.#pool.pop()!;
    }
    this.#created++;
    return this.#factory();
  }

  release(obj: T): void {
    if (!obj) return;
    if (this.#pool.length >= this.#maxSize) return;
    this.#reset(obj);
    this.#pool.push(obj);
  }

  stats() {
    return {
      available: this.#pool.length,
      created: this.#created,
      maxSize: this.#maxSize,
    };
  }

  clear(): void {
    this.#pool.length = 0;
  }
}
