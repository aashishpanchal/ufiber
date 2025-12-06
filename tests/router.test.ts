import {Router} from '@/router';
import {RegExpRouter} from '@/router/lib/reg-exp';
import {UnsupportedPathError} from '@/router/lib/error';
import {describe, it, expect, beforeEach} from 'vitest';

// Router Test Case
describe('Router', () => {
  it('should register GET route', () => {
    const router = new Router();
    router.get('/hello', ctx => ctx.text('hello'));
    expect(router.routes.length).toBe(1);
    expect(router.routes[0].method).toBe('GET');
    expect(router.routes[0].path).toBe('/hello');
  });

  it('should register POST route', () => {
    const router = new Router();
    router.post('/users', ctx => ctx.text('created'));
    expect(router.routes.length).toBe(1);
    expect(router.routes[0].method).toBe('POST');
  });

  it('should register middleware with use()', () => {
    const router = new Router();
    router.use('*', async (ctx, next) => await next());
    expect(router.routes.length).toBe(1);
    expect(router.routes[0].method).toBe('ALL');
  });

  it('should register route with on()', () => {
    const router = new Router();
    router.on('GET', '/test', ctx => ctx.text('test'));
    expect(router.routes.length).toBe(1);
    expect(router.routes[0].path).toBe('/test');
  });

  it('should register multiple methods with on()', () => {
    const router = new Router();
    router.on(['GET', 'POST'], '/api', ctx => ctx.text('api'));
    expect(router.routes.length).toBe(2);
  });

  it('should group routes with prefix', () => {
    const router = new Router();
    const api = router.group('/api');
    api.get('/users', ctx => ctx.text('users'));
    expect(router.routes[0].path).toBe('/api/users');
  });

  it('should mount child router', () => {
    const parent = new Router();
    const child = new Router();
    child.get('/test', ctx => ctx.text('test'));
    parent.route('/api', child);
    expect(parent.routes[0].path).toBe('/api/test');
  });
});

// Regex Router Test Case
describe('RegExpRouter', () => {
  describe('Basic Usage', () => {
    let router: RegExpRouter<string>;

    beforeEach(() => {
      router = new RegExpRouter();
      router.add('GET', '/hello', 'get hello');
      router.add('POST', '/hello', 'post hello');
      router.add('PURGE', '/hello', 'purge hello');
    });

    it('GET /hello', () => {
      const res = router.match('GET', '/hello');
      expect(res[0].length).toBe(1);
      expect(res[0][0][0]).toBe('get hello');
    });

    it('POST /hello', () => {
      const res = router.match('POST', '/hello');
      expect(res[0].length).toBe(1);
      expect(res[0][0][0]).toBe('post hello');
    });

    it('PURGE /hello', () => {
      const res = router.match('PURGE', '/hello');
      expect(res[0].length).toBe(1);
      expect(res[0][0][0]).toBe('purge hello');
    });

    it('PUT /hello - not found', () => {
      const res = router.match('PUT', '/hello');
      expect(res[0].length).toBe(0);
    });

    it('GET / - not found', () => {
      const res = router.match('GET', '/');
      expect(res[0].length).toBe(0);
    });
  });

  describe('Named Parameters', () => {
    let router: RegExpRouter<string>;

    beforeEach(() => {
      router = new RegExpRouter();
    });

    it('should match route with single param', () => {
      router.add('GET', '/entry/:id', 'get entry');
      const res = router.match('GET', '/entry/123');
      expect(res[0].length).toBe(1);
      expect(res[0][0][0]).toBe('get entry');
      expect(res[1]).toContain('123');
    });

    it('should match route with multiple params', () => {
      router.add('GET', '/posts/:id/comments/:commentId', 'get comment');
      const res = router.match('GET', '/posts/123/comments/456');
      expect(res[0].length).toBe(1);
      expect(res[0][0][0]).toBe('get comment');
      expect(res[1]).toContain('123');
      expect(res[1]).toContain('456');
    });
  });

  describe('Wildcard Routes', () => {
    let router: RegExpRouter<string>;

    beforeEach(() => {
      router = new RegExpRouter();
    });

    it('should match wildcard in middle', () => {
      router.add('GET', '/wild/*/card', 'get wildcard');
      const res = router.match('GET', '/wild/xxx/card');
      expect(res[0].length).toBe(1);
      expect(res[0][0][0]).toBe('get wildcard');
    });

    it('should match wildcard at end', () => {
      router.add('GET', '/api/*', 'fallback');
      const res = router.match('GET', '/api/users/123');
      expect(res[0].length).toBe(1);
      expect(res[0][0][0]).toBe('fallback');
    });

    it('should match both specific and wildcard', () => {
      router.add('GET', '/api/abc', 'get api');
      router.add('GET', '/api/*', 'fallback');
      const res = router.match('GET', '/api/abc');
      expect(res[0].length).toBe(2);
      expect(res[0][0][0]).toBe('get api');
      expect(res[0][1][0]).toBe('fallback');
    });
  });

  describe('Regexp Parameters', () => {
    let router: RegExpRouter<string>;

    beforeEach(() => {
      router = new RegExpRouter();
    });

    it('should match with regexp constraint', () => {
      router.add('GET', '/post/:date{[0-9]+}/:title{[a-z]+}', 'get post');
      const res = router.match('GET', '/post/20210101/hello');
      expect(res[0].length).toBe(1);
      expect(res[0][0][0]).toBe('get post');
      expect(res[1]).toContain('20210101');
      expect(res[1]).toContain('hello');
    });

    it('should not match invalid regexp', () => {
      router.add('GET', '/post/:date{[0-9]+}/:title{[a-z]+}', 'get post');
      const res = router.match('GET', '/post/onetwothree/hello');
      expect(res[0].length).toBe(0);
    });
  });

  describe('Optional Parameters', () => {
    let router: RegExpRouter<string>;

    beforeEach(() => {
      router = new RegExpRouter();
    });

    it('should match with optional param present', () => {
      router.add('GET', '/api/animals/:type?', 'animals');
      const res = router.match('GET', '/api/animals/dog');
      expect(res[0].length).toBe(1);
      expect(res[0][0][0]).toBe('animals');
      expect(res[1]).toContain('dog');
    });

    it('should match with optional param absent', () => {
      router.add('GET', '/api/animals/:type?', 'animals');
      const res = router.match('GET', '/api/animals');
      expect(res[0].length).toBe(1);
      expect(res[0][0][0]).toBe('animals');
    });
  });

  describe('ALL Method', () => {
    let router: RegExpRouter<string>;

    beforeEach(() => {
      router = new RegExpRouter();
    });

    it('should match ALL for any method', () => {
      router.add('ALL', '/test', 'all methods');
      let res = router.match('GET', '/test');
      expect(res[0].length).toBe(1);
      expect(res[0][0][0]).toBe('all methods');

      res = router.match('POST', '/test');
      expect(res[0].length).toBe(1);
      expect(res[0][0][0]).toBe('all methods');
    });
  });

  describe('UnsupportedPathError', () => {
    it('should throw for ambiguous routes', () => {
      const router = new RegExpRouter<string>();
      router.add('GET', '/:user/entries', 'get user entries');
      router.add('GET', '/entry/:name', 'get entry');

      expect(() => {
        router.match('GET', '/entry/entries');
      }).toThrow(UnsupportedPathError);
    });

    it('should throw for multiple handlers with different labels', () => {
      const router = new RegExpRouter<string>();
      router.add('GET', '/:type/:id', ':type');
      router.add('GET', '/:class/:id', ':class');

      expect(() => {
        router.match('GET', '/entry/123');
      }).toThrow(UnsupportedPathError);
    });

    it('should throw for static and dynamic conflict', () => {
      const router = new RegExpRouter<string>();
      router.add('GET', '/reg-exp/router', 'foo');
      router.add('GET', '/reg-exp/:id', 'bar');

      expect(() => {
        router.match('GET', '/reg-exp/test');
      }).toThrow(UnsupportedPathError);
    });
  });

  describe('Return Value Type', () => {
    it('should return correct structure', () => {
      const router = new RegExpRouter<string>();
      router.add('GET', '/posts/:id', 'get post');

      const result = router.match('GET', '/posts/1');
      expect(result[0].length).toBe(1);
      expect(result[0][0][0]).toBe('get post');
      expect(result[1]).toBeDefined();
      expect(result[1]![1]).toBe('1');
    });
  });
});
