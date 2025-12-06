import {Writable} from 'node:stream';

export class UwsWriteable extends Writable {
  /**
   * Initialize/reinitialize the writable stream.
   */
  init(): this {
    return this;
  }

  /**
   * Reset the stream for reuse in object pool
   */
  reset(): void {}
}
