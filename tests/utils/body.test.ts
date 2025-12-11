import {describe, it, expect} from 'vitest';
import {FormData, isFileType, type FileType} from '@/utils/body';

describe('Body Utilities', () => {
  describe('FormData', () => {
    it('should create empty FormData', () => {
      const form = new FormData();
      expect(form.size).toBe(0);
    });

    it('should set and get values', () => {
      const form = new FormData();
      form.set('name', 'John');
      expect(form.get('name')).toBe('John');
    });

    it('should append single value', () => {
      const form = new FormData();
      form.append('key', 'value1');
      expect(form.get('key')).toBe('value1');
    });

    it('should append multiple values as array', () => {
      const form = new FormData();
      form.append('key', 'value1');
      form.append('key', 'value2');
      const values = form.getAll('key');
      expect(values).toEqual(['value1', 'value2']);
    });

    it('should get first value when multiple exist', () => {
      const form = new FormData();
      form.append('key', 'value1');
      form.append('key', 'value2');
      expect(form.get('key')).toBe('value1');
    });

    it('should return all values', () => {
      const form = new FormData();
      form.append('tags', 'red');
      form.append('tags', 'green');
      expect(form.getAll('tags')).toEqual(['red', 'green']);
    });

    it('should return empty array for non-existent key', () => {
      const form = new FormData();
      expect(form.getAll('missing')).toEqual([]);
    });

    it('should return single value in array from getAll', () => {
      const form = new FormData();
      form.set('key', 'value');
      expect(form.getAll('key')).toEqual(['value']);
    });

    it('should convert to JSON object', () => {
      const form = new FormData();
      form.set('name', 'John');
      form.set('age', 30);
      const json = form.toJSON();
      expect(json).toEqual({name: 'John', age: 30});
    });

    it('should include arrays in JSON', () => {
      const form = new FormData();
      form.append('tags', 'red');
      form.append('tags', 'blue');
      const json = form.toJSON();
      expect(json.tags).toEqual(['red', 'blue']);
    });

    it('should check and delete keys', () => {
      const form = new FormData();
      form.set('key', 'value');
      expect(form.has('key')).toBe(true);
      form.delete('key');
      expect(form.has('key')).toBe(false);
    });

    it('should iterate over entries', () => {
      const form = new FormData();
      form.set('a', '1');
      form.set('b', '2');
      const entries = Array.from(form.entries());
      expect(entries).toEqual([
        ['a', '1'],
        ['b', '2'],
      ]);
    });
  });

  describe('isFileType', () => {
    it('should return true for valid FileType', () => {
      const file: FileType = {
        buffer: Buffer.from('test'),
        filename: 'test.txt',
        mimeType: 'text/plain',
        extension: 'txt',
        bytes: 4,
        readable: '4 B',
      };
      expect(isFileType(file)).toBe(true);
    });

    it('should return false for non-Buffer', () => {
      const notFile = {
        buffer: 'not a buffer',
        filename: 'test.txt',
        mimeType: 'text/plain',
      };
      expect(isFileType(notFile)).toBe(false);
    });

    it('should return false for missing filename', () => {
      const notFile = {
        buffer: Buffer.from('test'),
        mimeType: 'text/plain',
      };
      expect(isFileType(notFile)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isFileType(null)).toBeFalsy();
    });

    it('should return false for undefined', () => {
      expect(isFileType(undefined)).toBeFalsy();
    });

    it('should return false for non-object', () => {
      expect(isFileType('string')).toBe(false);
      expect(isFileType(123)).toBe(false);
      expect(isFileType(true)).toBe(false);
    });

    it('should return false for array', () => {
      expect(isFileType([1, 2, 3])).toBe(false);
    });
  });
});
