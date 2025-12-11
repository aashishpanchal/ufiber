import os from 'node:os';
import ansis from 'ansis';
import {write} from './tools';

const getNetworkUrl = (port: number): string | null => {
  try {
    const interfaces = os.networkInterfaces();
    for (const name in interfaces) {
      for (const info of interfaces[name] || []) {
        if (info.family === 'IPv4' && !info.internal) {
          return `http://${info.address}:${port}`;
        }
      }
    }
  } catch {}
  return null;
};

type Options = {
  url: string;
  version: string;
  startTime?: number;
  port?: number;
  host?: string;
};

export const showBanner = (opts: Options) => {
  try {
    const version = opts.version;
    const duration = opts.startTime ? Date.now() - opts.startTime : 0;
    const isUnix = opts.url.startsWith('unix://');

    const port = opts.port ?? 3000;
    const host = opts.host ?? '127.0.0.1';
    const localUrl = host === '0.0.0.0' || host === '::' ? `http://127.0.0.1:${port}` : opts.url;

    write('\n');
    write(ansis.bold.cyan`          ⚡ uFiber Server Running ⚡              \n\n`);

    // Version and timing info
    write(ansis.dim`  ┌─ Server Info\n`);
    write(ansis.dim`  │\n`);
    write(ansis.dim`  ├─ ` + ansis.bold`Version:` + ansis.green` v${version}\n`);
    write(ansis.dim`  └─ ` + ansis.bold`Ready in:` + ansis.yellow` ${duration}ms\n\n`);

    // Socket mode
    if (isUnix) {
      write(ansis.dim`  ┌─ Connection\n`);
      write(ansis.dim`  │\n`);
      write(ansis.dim`  └─ ` + ansis.bold`Socket:` + ansis.cyan` ${opts.url}\n\n`);
      return;
    }

    // URLs section
    write(ansis.dim`  ┌─ Endpoints\n`);
    write(ansis.dim`  │\n`);
    write(ansis.dim`  ├─ ` + ansis.bold`Local:  ` + ansis.cyan.underline`${localUrl}\n`);

    // Network URL if host=0.0.0.0
    if (host === '0.0.0.0') {
      const net = getNetworkUrl(port);
      if (net) {
        write(ansis.dim`  └─ ` + ansis.bold`Network: ` + ansis.green.underline`${net}\n`);
      } else {
        write(ansis.dim`  └─\n`);
      }
    } else {
      write(ansis.dim`  └─\n`);
    }

    write('\n');
    write(ansis.dim`  Press ` + ansis.bold.white`Ctrl+C` + ansis.dim` to stop\n\n`);
  } catch (err) {
    write(`Server listening on ${ansis.green(opts.url)}\n`);
  }
};
