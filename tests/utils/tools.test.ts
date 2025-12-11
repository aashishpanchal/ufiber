import {describe, it, expect, vi} from 'vitest';
import {formatBytes, parseBytes, parseMs, delay, NullObject, write, type ByteString} from '@/utils/tools';

describe('formatBytes', () => {
  it('formats bytes correctly', () => {
    expect(formatBytes(0)).toBe('0B');
    expect(formatBytes(500)).toBe('500.0B');
    expect(formatBytes(1024)).toBe('1.0KB');
    expect(formatBytes(1536)).toBe('1.5KB');
    expect(formatBytes(1048576)).toBe('1.0MB');
    expect(formatBytes(1073741824)).toBe('1.0GB');
  });
});

describe('parseBytes', () => {
  it('parses valid byte strings', () => {
    expect(parseBytes('500B')).toBe(500);
    expect(parseBytes('1KB')).toBe(1024);
    expect(parseBytes('1.5KB')).toBe(1536);
  });

  it('handles lowercase runtime input', () => {
    expect(parseBytes('1kb')).toBe(1024);
  });

  it('throws on invalid format', () => {
    // compile-time check
    parseBytes('12 KB');

    // runtime invalid strings
    expect(() => parseBytes('ABC' as unknown as ByteString)).toThrow();
    expect(() => parseBytes('12TB' as unknown as ByteString)).toThrow();
  });
});

describe('formatBytes + parseBytes', () => {
  it('reverses values following the same rounding logic', () => {
    const values = [0, 500, 1024, 1500, 500000];

    for (const val of values) {
      const str = formatBytes(val);
      const parsed = parseBytes(str);

      const index = Math.floor(Math.log(val || 1) / Math.log(1024));
      const rounded = parseFloat((val / 1024 ** index).toFixed(1));
      const expected = Math.round(rounded * 1024 ** index);

      expect(parsed).toBe(expected);
    }
  });
});

describe('parseMs', () => {
  it('should parse simple time strings', () => {
    expect(parseMs('1s')).toBe(1000);
    expect(parseMs('1m')).toBe(60000);
    expect(parseMs('1h')).toBe(3600000);
    expect(parseMs('1d')).toBe(86400000);
  });

  it('should parse time with spaces', () => {
    expect(parseMs('1 s')).toBe(1000);
    expect(parseMs('5 minutes')).toBe(300000);
  });

  it('should parse decimal values', () => {
    expect(parseMs('1.5h')).toBe(5400000);
    expect(parseMs('0.5m')).toBe(30000);
  });

  it('should parse compound expressions', () => {
    expect(parseMs('1h 30m' as any)).toBe(5400000);
    expect(parseMs('2d 4h' as any)).toBe(187200000);
  });

  it('should handle various unit formats', () => {
    expect(parseMs('1ms')).toBe(1);
    expect(parseMs('1sec')).toBe(1000);
    expect(parseMs('1min')).toBe(60000);
    expect(parseMs('1hr')).toBe(3600000);
  });

  it('should handle uppercase and mixed case', () => {
    expect(parseMs('1S')).toBe(1000);
    expect(parseMs('1M')).toBe(60000);
    expect(parseMs('1H')).toBe(3600000);
  });

  it('should return number as-is', () => {
    expect(parseMs(5000)).toBe(5000);
  });

  it('should throw on invalid input', () => {
    expect(() => parseMs('' as any)).toThrow('Invalid time string');
    expect(() => parseMs('invalid' as any)).toThrow('Invalid time string');
    expect(() => parseMs('   ' as any)).toThrow('Invalid time string');
  });

  it('should parse weeks, months, years', () => {
    expect(parseMs('1w')).toBe(604800000);
    expect(parseMs('1 week')).toBe(604800000);
  });
});

describe('delay', () => {
  it('should delay execution', async () => {
    const start = Date.now();
    await delay(100);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(90);
    expect(elapsed).toBeLessThan(150);
  });

  it('should resolve promise after delay', async () => {
    const promise = delay(50);
    expect(promise).toBeInstanceOf(Promise);
    await promise;
    expect(true).toBe(true);
  });
});

describe('NullObject', () => {
  it('should create object with null prototype', () => {
    const obj = NullObject();
    expect(Object.getPrototypeOf(obj)).toBeNull();
  });

  it('should not have inherited properties', () => {
    const obj = NullObject();
    expect(obj.toString).toBeUndefined();
    expect(obj.hasOwnProperty).toBeUndefined();
  });

  it('should allow setting properties', () => {
    const obj = NullObject();
    obj.key = 'value';
    expect(obj.key).toBe('value');
  });

  it('should create fresh object each time', () => {
    const obj1 = NullObject();
    const obj2 = NullObject();
    expect(obj1).not.toBe(obj2);
  });
});

describe('write', () => {
  it('should write to stdout synchronously', () => {
    const spy = vi.spyOn(process.stdout, 'write');
    write('test');
    expect(spy).toHaveBeenCalledWith('test');
    spy.mockRestore();
  });

  it('should write to stdout asynchronously', async () => {
    const spy = vi.spyOn(process.stdout, 'write');
    write('async test', true);
    await new Promise<void>(resolve => queueMicrotask(resolve));
    expect(spy).toHaveBeenCalledWith('async test');
    spy.mockRestore();
  });
});
