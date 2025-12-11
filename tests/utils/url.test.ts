import {describe, it, expect} from 'vitest';
import {tryDecode, checkOptionalParameter, mergePath} from '@/utils/url';

describe('URL Utilities', () => {
  describe('tryDecode', () => {
    it('should decode valid URI component', () => {
      const result = tryDecode('Hello%20World', decodeURIComponent);
      expect(result).toBe('Hello World');
    });

    it('should decode URL-encoded string', () => {
      const result = tryDecode('test%2Fpath%3Fkey%3Dvalue', decodeURIComponent);
      expect(result).toBe('test/path?key=value');
    });

    it('should handle malformed URI gracefully', () => {
      const result = tryDecode('Hello%20World%', decodeURIComponent);
      expect(result).toBe('Hello World%');
    });

    it('should return original string on decode error', () => {
      const result = tryDecode('%E0%A4%A', decodeURIComponent);
      expect(result).toContain('%E0%A4%A');
    });

    it('should decode partial valid sequences', () => {
      const result = tryDecode('valid%20but%invalid', decodeURIComponent);
      expect(result).toContain('valid but');
    });
  });

  describe('checkOptionalParameter', () => {
    it('checkOptionalParameter', () => {
      expect(checkOptionalParameter('/api/animals/:type?')).toEqual(['/api/animals', '/api/animals/:type']);
      expect(checkOptionalParameter('/api/animals/type?')).toBeNull();
      expect(checkOptionalParameter('/api/animals/:type')).toBeNull();
      expect(checkOptionalParameter('/api/animals')).toBeNull();
      expect(checkOptionalParameter('/api/:animals?/type')).toBeNull();
      expect(checkOptionalParameter('/api/animals/:type?/')).toBeNull();
      expect(checkOptionalParameter('/:optional?')).toEqual(['/', '/:optional']);
      expect(checkOptionalParameter('/v1/leaderboard/:version?/:platform?')).toEqual([
        '/v1/leaderboard',
        '/v1/leaderboard/:version',
        '/v1/leaderboard/:version/:platform',
      ]);
      expect(checkOptionalParameter('/api/:version/animal/:type?')).toEqual([
        '/api/:version/animal',
        '/api/:version/animal/:type',
      ]);
    });
  });

  describe('mergePath', () => {
    it('mergePath', () => {
      expect(mergePath('/book', '/')).toBe('/book');
      expect(mergePath('/book/', '/')).toBe('/book/');
      expect(mergePath('/book', '/hey')).toBe('/book/hey');
      expect(mergePath('/book/', '/hey')).toBe('/book/hey');
      expect(mergePath('/book', '/hey/')).toBe('/book/hey/');
      expect(mergePath('/book/', '/hey/')).toBe('/book/hey/');
      expect(mergePath('/book', 'hey', 'say')).toBe('/book/hey/say');
      expect(mergePath('/book', '/hey/', '/say/')).toBe('/book/hey/say/');
      expect(mergePath('/book', '/hey/', '/say/', '/')).toBe('/book/hey/say/');
      expect(mergePath('/book', '/hey', '/say', '/')).toBe('/book/hey/say');
      expect(mergePath('/', '/book', '/hey', '/say', '/')).toBe('/book/hey/say');

      expect(mergePath('book', '/')).toBe('/book');
      expect(mergePath('book/', '/')).toBe('/book/');
      expect(mergePath('book', '/hey')).toBe('/book/hey');
      expect(mergePath('book', 'hey')).toBe('/book/hey');
      expect(mergePath('book', 'hey/')).toBe('/book/hey/');
    });
    it('Should be `/book`', () => {
      expect(mergePath('/', 'book')).toBe('/book');
    });
    it('Should be `/book`', () => {
      expect(mergePath('/', '/book')).toBe('/book');
    });
    it('Should be `/`', () => {
      expect(mergePath('/', '/')).toBe('/');
    });
  });
});
