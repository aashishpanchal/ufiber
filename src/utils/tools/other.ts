/**
 * Delay execution for a specified amount of time.
 *
 * @example
 * await delay(500); // waits 500ms
 *
 * @param ms - Milliseconds to wait.
 * @returns A Promise that resolves after the given time.
 */
export const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Write a string to standard output without appending a newline.
 *
 * @param str - The string to write.
 *
 * @example
 * write("Hello"); // prints "Hello" to stdout
 */
export const write = (str: string, async?: boolean) => {
  if (!async) {
    process.stdout.write(str);
    return;
  }
  queueMicrotask(() => process.stdout.write(str));
};

/**
 * Create a new object with no prototype.
 *
 * Useful for maps or dictionaries where you do not want inherited keys.
 *
 * @returns A new object created with `Object.create(null)`.
 *
 * @example
 * const obj = Null();
 * obj.key = "value";
 */
export const NullObject = () => Object.create(null);
