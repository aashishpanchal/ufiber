import type {Context} from '@/http';
import {parse, parseSigned, serialize, serializeSigned} from './parser';
import type {
  Cookie,
  SignedCookie,
  CookieOptions,
  CookiePrefixOptions,
} from './parser';

export class CookieManager {
  constructor(private ctx: Context) {}

  get(key: string, prefix?: CookiePrefixOptions): string | undefined;
  get(): Cookie;
  get(key?: string, prefix?: CookiePrefixOptions): any {
    const cookie = this.ctx.req.header('cookie');
    if (!key) {
      return cookie ? parse(cookie) : {};
    }
    if (!cookie) return undefined;
    const finalKey = this.#applyPrefix(key, prefix);
    const obj = parse(cookie, finalKey);
    return obj[finalKey];
  }

  set(name: string, value: string, opt?: CookieOptions): void {
    const cookie = this.generate(name, value, opt);
    this.ctx.header('set-cookie', cookie, true);
  }

  delete(name: string, opt?: CookieOptions): string | undefined {
    const old = this.get(name, opt?.prefix);
    this.set(name, '', {...opt, maxAge: 0});
    return old;
  }

  generate(name: string, value: string, opt?: CookieOptions): string {
    // Cookie names prefixed with __Secure- can be used only if they are set with the secure attribute.
    // Cookie names prefixed with __Host- can be used only if they are set with the secure attribute,
    // must have a path of / (meaning any path at the host) and must not have a Domain attribute.
    // Read more at https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#cookie_prefixes
    const finalName = this.#applyPrefix(name, opt?.prefix);
    return serialize(finalName, value, {
      path: '/',
      ...opt,
      secure: opt?.prefix ? true : opt?.secure,
      domain: opt?.prefix === 'host' ? undefined : opt?.domain,
    });
  }

  async getSigned(
    secret: string | BufferSource,
    key: string,
    prefix?: CookiePrefixOptions,
  ): Promise<string | undefined | false>;
  async getSigned(secret: string | BufferSource): Promise<SignedCookie>;
  async getSigned(
    secret: string | BufferSource,
    key?: string,
    prefix?: CookiePrefixOptions,
  ): Promise<any> {
    const cookie = this.ctx.req.header('cookie');
    if (!key) {
      return cookie ? parseSigned(cookie, secret) : {};
    }
    if (!cookie) return undefined;
    const finalKey = this.#applyPrefix(key, prefix);
    const obj = await parseSigned(cookie, secret, finalKey);
    return obj[finalKey];
  }

  async setSigned(
    name: string,
    value: string,
    secret: string | BufferSource,
    opt?: CookieOptions,
  ): Promise<void> {
    const cookie = await this.generateSigned(name, value, secret, opt);
    this.ctx.header('set-cookie', cookie, true);
  }

  async generateSigned(
    name: string,
    value: string,
    secret: string | BufferSource,
    opt?: CookieOptions,
  ): Promise<string> {
    const finalName = this.#applyPrefix(name, opt?.prefix);
    return serializeSigned(finalName, value, secret, {
      path: '/',
      ...opt,
      secure: opt?.prefix ? true : opt?.secure,
      domain: opt?.prefix === 'host' ? undefined : opt?.domain,
    });
  }

  #applyPrefix(key: string, prefix?: CookiePrefixOptions): string {
    if (prefix === 'secure') return `__Secure-${key}`;
    if (prefix === 'host') return `__Host-${key}`;
    return key;
  }
}
