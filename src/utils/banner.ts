import os from 'node:os';
import ansis from 'ansis';
import {write} from './tools';

type Options = {
  url: string;
  version: string;
  startTime?: number;
  port?: number;
  host?: string;
};

export const printBanner = (opts: Options) => {
  const {url, version} = opts;
  const duration = opts.startTime ? Date.now() - opts.startTime : 0;
  const isUnix = url.startsWith('unix://');
  const port = opts.port ?? 3000;
  const host = opts.host ?? '127.0.0.1';
  const localUrl =
    host === '0.0.0.0' || host === '::' ? `http://127.0.0.1:${port}` : url;
  write('\n');
  write(ansis.bold.cyan`  uFiber v${version}  `);
  write(ansis.dim`ready in ${duration}ms\n\n`);
  // Unix socket mode
  if (isUnix) {
    write(ansis.dim`  → ` + ansis.bold`Socket:` + ` ${ansis.cyan(url)}\n\n`);
    return;
  }
  // Local URL
  write(
    ansis.dim`  → ` +
      ansis.bold`Local:` +
      `   ${ansis.cyan.underline(localUrl)}\n`,
  );
  // Network URL
  if (host === '0.0.0.0' || host === '::') {
    const net = getNetworkUrl(port);
    if (net) {
      write(
        ansis.dim`  → ` +
          ansis.bold`Network:` +
          ` ${ansis.green.underline(net)}\n`,
      );
    }
  }
  write('\n');
  write(ansis.dim`  Press ` + ansis.bold`Ctrl+C` + ansis.dim` to stop\n\n`);
};

const getNetworkUrl = (port: number): string | null => {
  const interfaces = os.networkInterfaces();
  for (const list of Object.values(interfaces)) {
    for (const info of list ?? []) {
      if (info.family === 'IPv4' && !info.internal) {
        return `http://${info.address}:${port}`;
      }
    }
  }
  return null;
};
