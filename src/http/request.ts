import {UwsReadable} from './readable';
import {NullObject} from '@/utils/tools';
import {tryDecode, getQuery} from '@/utils/url';
import type {Result, RouterRoute} from '@/types';
import {discardedDuplicates, kMatch} from '@/consts';
import type {HttpRequest, HttpResponse} from '../../uws';
import {FormOption, FormData, formParse} from '@/utils/body';
import type {CustomHeader, ReqHeaders} from '@/utils/header';

const tryDecodeURIComponent = (str: string) =>
  tryDecode(str, decodeURIComponent);

type BodyCache = {
  json: any;
  blob: Blob;
  text: string;
  formData: FormData;
  arrayBuffer: ArrayBuffer;
};

type Options = {
  isSSL: boolean;
  methods?: string[];
  bodyLimit: number | null;
};

export class UwsRequest {
  raw!: HttpRequest;
  isSSL = false;
  isRead = false;
  /** URL pathname starting with `/` */
  path: string;
  /** HTTP method in uppercase (e.g. `POST`, `GET`) */
  method: string;
  /** Raw query string (with `?` prefix) or empty string */
  urlQuery: string;
  routeIndex = 0;
  [kMatch]!: Result<RouterRoute>;
  #stream?: UwsReadable;
  #rawHeader: [string, string][] = [];
  #bodyCache: Partial<BodyCache> = NullObject();
  #headers: Record<string, any> = NullObject();

  constructor(
    raw: HttpRequest,
    res: HttpResponse,
    {bodyLimit, methods, isSSL}: Options,
  ) {
    this.raw = raw;
    const q = raw.getQuery();
    this.method = raw.getMethod().toUpperCase();
    this.path = raw.getUrl();
    this.urlQuery = q ? '?' + q : '';
    this.isSSL = isSSL;
    raw.forEach((key, value) => this.#rawHeader.push([key, value]));
    // skip reading body for non-POST requests
    this.isRead =
      ['POST', 'PUT', 'PATCH'].includes(this.method) ||
      ((methods && methods.includes(this.method)) as boolean);
    if (this.isRead) {
      const encoding = raw.getHeader('content-encoding') as any;
      this.#stream = new UwsReadable(res, encoding, bodyLimit);
    }
  }
  /**
   * Full request URL including protocol, host, path and query.
   *
   * @example
   * ```ts
   * ctx.req.url; // "http://localhost:3000/users?id=1"
   * ```
   */
  get url(): string {
    const host = this.header('host');
    const protocol = this.isSSL ? 'https://' : 'http://';
    return protocol + host + this.path + this.urlQuery;
  }
  /**
   * Returns a single query param or the full query object.
   *
   * @example
   * ```ts
   * ctx.req.query('q') // "hello"
   * ctx.req.query() // { q: "hello", page: "1" }
   * ```
   */
  query(): Record<string, string>;
  query(key: string): string | undefined;
  query(key?: string): any {
    return getQuery(this.url, key as any);
  }
  /**
   * Returns array values for a query param or all params as arrays.
   *
   * @example
   * ```ts
   * ctx.req.queries('tag') // ["a", "b"]
   * ctx.req.queries() // { tag: ["a","b"] }
   * ```
   */
  queries(): Record<string, string[]>;
  queries(key: string): string[] | undefined;
  queries(key?: string): any {
    return getQuery(this.url, key as any, true);
  }
  /**
   * Returns the value of a named route parameter.
   *
   * @example
   * ```ts
   * ctx.req.param('id'); // "123"
   * ```
   */
  param(field: string): string {
    const paramKey = this[kMatch][0][this.routeIndex][1][field];
    const param = this.#getParamValue(paramKey);
    return param && /%/.test(param) ? tryDecodeURIComponent(param) : param;
  }
  /**
   * Returns an object containing all route parameters for the current route.
   *
   * @example
   * ```ts
   * ctx.req.params(); // { id: "123", name: "John" }
   * ```
   */
  params(): Record<string, string> {
    const decoded: Record<string, string> = {};
    const keys = Object.keys(this[kMatch][0][this.routeIndex][1]);
    for (const key of keys) {
      const value = this.#getParamValue(
        this[kMatch][0][this.routeIndex][1][key],
      );
      if (value !== undefined) {
        decoded[key] = /%/.test(value) ? tryDecodeURIComponent(value) : value;
      }
    }
    return decoded;
  }
  /**
   * Resolves the parameter value from the match result.
   */
  #getParamValue = (paramKey: any): string =>
    this[kMatch][1] ? this[kMatch][1][paramKey] : paramKey;
  /**
   * Lazily normalizes and caches all request headers.
   */
  #buildHeader() {
    const store = this.#headers;
    if (Object.keys(store).length > 0) {
      return;
    }
    for (const [keyRaw, value] of this.#rawHeader) {
      const key = keyRaw.toLowerCase();
      if (store[key]) {
        if (discardedDuplicates.has(key)) continue;
        if (key === 'cookie') {
          store[key] += '; ' + value;
          continue;
        }
        if (key === 'set-cookie') {
          store[key].push(value);
          continue;
        }
        store[key] += ', ' + value;
        continue;
      }
      if (key === 'set-cookie') {
        store[key] = [value];
      } else {
        store[key] = value;
      }
    }
  }
  /**
   * Returns a specific request header,
   * or all headers if no name is provided.
   *
   * @example
   * ```ts
   * ctx.req.header('content-type'); // => "application/json"
   * ctx.req.header(); // => { host: "localhost:3000", ... }
   * ```
   */
  header(field: ReqHeaders): string | undefined;
  header(field: string): string | undefined;
  header(): Record<ReqHeaders | (string & CustomHeader), string>;
  header(field?: string): any {
    this.#buildHeader();
    const headers = this.#headers;
    if (!field) return headers;
    const key = field.toLowerCase();
    if (key === 'referrer' || key === 'referer')
      return headers['referrer'] || headers['referer'];
    return headers[key];
  }
  /**
   * Readable stream for body.
   * Available only for POST/PUT/PATCH or configured methods.
   *
   * @example
   * ctx.req.stream.pipe(fs.createWriteStream("upload.bin"));
   */
  get stream(): UwsReadable {
    if (this.#stream && !this.#stream.destroyed) return this.#stream;
    throw new Error(
      `Cannot access request body stream for HTTP method '${this.method}'.`,
    );
  }
  /**
   * Reads body as UTF-8 text.
   *
   * @example
   * const text = await ctx.req.text();
   */
  async text(): Promise<string> {
    const body = this.#bodyCache;
    if (body.text) return body.text;
    const buf = await this.stream.getRawBody();
    const text = buf.toString('utf-8').trim();
    body.text = text;
    return text;
  }
  /**
   * Reads the body as a Blob (Node 18+).
   *
   * @example
   * ```ts
   * const blob = await ctx.req.blob();
   * console.log('Blob size:', blob.size);
   * ```
   */
  async blob(): Promise<Blob> {
    const body = this.#bodyCache;
    if (body.blob) return body.blob;
    const type = this.header('Content-Type') || 'application/octet-stream';
    const arrayBuffer = await this.arrayBuffer();
    const blob = new Blob([arrayBuffer], {type});
    body.blob = blob;
    return blob;
  }
  /**
   * Parses body as JSON.
   * Throws on empty or invalid JSON.
   *
   * @example
   * const data = await ctx.req.json();
   */
  async json<T = any>(): Promise<T> {
    const body = this.#bodyCache;
    if (body.json) return body.json;
    const text = await this.text();
    if (!text) throw new SyntaxError('Empty request body, expected JSON');
    try {
      const json = JSON.parse(text);
      body.json = json;
      return json;
    } catch (err: any) {
      throw new SyntaxError(`Invalid JSON body: ${err.message}`);
    }
  }
  /**
   * Reads body as ArrayBuffer.
   *
   * @example
   * const buf = await ctx.req.arrayBuffer();
   */
  async arrayBuffer(): Promise<ArrayBuffer> {
    const body = this.#bodyCache;
    if (body.arrayBuffer) return body.arrayBuffer;
    const buffer = await this.stream.getRawBody();
    // Convert Node Buffer → ArrayBuffer safely
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    body.arrayBuffer = arrayBuffer;
    return arrayBuffer;
  }
  /**
   * Parses `application/x-www-form-urlencoded`
   * or `multipart/form-data` bodies.
   *
   * @example
   * const form = await ctx.req.formParse();
   * form.get("username");
   */
  async formData(options?: FormOption): Promise<FormData> {
    const cType = (this.header('content-type') || '').toLowerCase();
    const body = this.#bodyCache;
    if (body.formData) return body.formData;
    if (cType.startsWith('application/x-www-form-urlencoded')) {
      const form = new FormData();
      const text = await this.text();
      if (!text) throw new SyntaxError('Empty form data');
      try {
        const params = new URLSearchParams(text);
        for (const [k, v] of params.entries()) {
          form.append(k, v);
        }
        body.formData = form;
        return form;
      } catch (error) {
        throw new SyntaxError('Malformed URL-encoded data');
      }
    } else if (cType.startsWith('multipart/form-data')) {
      const buf = await this.stream.getRawBody();
      const form = formParse(buf, cType, options);
      body.formData = form;
      return form;
    }
    throw new TypeError(
      `Content-Type '${cType}' not supported for form parsing`,
    );
  }
}
