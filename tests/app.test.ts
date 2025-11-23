import {describe, it, expect} from 'vitest';
import {uFiber} from '../src/ufiber';

const makeRequest = async (
  app: uFiber,
  path: string,
  options?: {method?: string; headers?: Record<string, string>; body?: string},
) => {
  return new Promise<{
    status: number;
    body: string;
    headers: Record<string, string>;
  }>((resolve, reject) => {
    const port = 9000 + Math.floor(Math.random() * 1000);
    let resolved = false;

    app.listen(port, () => {
      const url = `http://localhost:${port}${path}`;
      fetch(url, {
        method: options?.method || 'GET',
        headers: options?.headers,
        body: options?.body,
      })
        .then(async res => {
          const headers: Record<string, string> = {};
          res.headers.forEach((v, k) => (headers[k] = v));
          resolved = true;
          resolve({
            status: res.status,
            body: await res.text(),
            headers,
          });
        })
        .catch(reject);
    });

    setTimeout(() => {
      if (!resolved) reject(new Error('Request timeout'));
    }, 5000);
  });
};

describe('GET Request', () => {
  it('GET /hello', async () => {
    const app = new uFiber();
    app.get('/hello', ctx => ctx.text('hello'));

    const res = await makeRequest(app, '/hello');
    expect(res.status).toBe(200);
    expect(res.body).toBe('hello');
  });
});

describe('Routing', () => {
  it('GET /posts/:id', async () => {
    const app = new uFiber();
    app.get('/posts/:id', ctx => {
      const id = ctx.param('id');
      ctx.text(`id is ${id}`);
    });

    const res = await makeRequest(app, '/posts/123');
    expect(res.status).toBe(200);
    expect(res.body).toBe('id is 123');
  });
});

describe('Middleware', () => {
  it('Before middleware', async () => {
    const app = new uFiber();
    app.use('*', async (ctx, next) => {
      ctx.setHeader('x-custom', 'test');
      await next();
    });
    app.get('/hello', ctx => ctx.text('hello'));

    const res = await makeRequest(app, '/hello');
    expect(res.status).toBe(200);
    expect(res.headers['x-custom']).toBe('test');
  });
});

describe('JSON Response', () => {
  it('Should return JSON', async () => {
    const app = new uFiber();
    app.get('/json', ctx => ctx.json({message: 'hello'}));

    const res = await makeRequest(app, '/json');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({message: 'hello'});
  });
});
