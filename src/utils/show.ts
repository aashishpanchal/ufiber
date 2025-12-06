import os from 'node:os';
import {write} from './tools';
import {COLORS} from '@/consts';

type BannerOptions = {
  url: string;
  port?: number;
  host?: string;
  version: string;
  startTime?: number;
};

/**
 * Get network URL (first non-internal IPv4 address)
 * @returns Network URL or null if not found
 */
const getNetworkUrl = (port: number): string | null => {
  try {
    const interfaces = os.networkInterfaces();
    for (const name in interfaces) {
      const iface = interfaces[name];
      if (!iface) continue;

      for (const info of iface) {
        // Only IPv4, not internal (127.0.0.1)
        if (info.family === 'IPv4' && !info.internal) {
          return `http://${info.address}:${port}`;
        }
      }
    }
  } catch (err) {
    // Silently fail - not critical
    return null;
  }
  return null;
};

/**
 * Check if colors should be disabled
 * Respects NO_COLOR, NODE_DISABLE_COLORS env vars
 */
const shouldUseColors = (): boolean => {
  return (
    !process.env.NO_COLOR &&
    !process.env.NODE_DISABLE_COLORS &&
    process.stdout.isTTY
  );
};

/**
 * Display modern startup banner
 */
export const showModernBanner = (opts: BannerOptions) => {
  try {
    const useColors = shouldUseColors();
    const colors = useColors ? COLORS : ({} as typeof COLORS);
    const {
      cyan = '',
      green = '',
      dim = '',
      reset = '',
      bold = '',
      magenta = '',
    } = colors;

    const version = opts.version;
    const duration = opts.startTime ? Date.now() - opts.startTime : 0;
    const isUnix = opts.url.startsWith('unix://');

    write('\n');
    write(
      `${magenta}⚡ uFiber${reset} ${dim}v${version}${reset}  ${green}ready in ${duration}ms${reset}\n\n`,
    );

    if (isUnix) {
      // Unix socket: just show socket path
      write(
        `${dim}➜${reset}  ${bold}Socket:${reset}  ${cyan}${opts.url}${reset}\n`,
      );
    } else {
      // TCP: show Local + Network
      write(
        `${dim}➜${reset}  ${bold}Local:${reset}   ${cyan}${opts.url}${reset}\n`,
      );
      // Only show Network IP if binding to all interfaces (0.0.0.0)
      const shouldShowNetwork = opts.host === '0.0.0.0';
      if (shouldShowNetwork) {
        const net = getNetworkUrl(opts.port ?? 3000);
        if (net) {
          write(
            `${dim}➜${reset}  ${bold}Network:${reset} ${cyan}${net}${reset}\n`,
          );
        }
      }
    }

    write('\n');
  } catch (err) {
    // Fallback to simple message if banner fails
    write(`Server listening on ${opts.url}\n`);
  }
};
