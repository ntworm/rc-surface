// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface

export interface ServerAccessUrlOptions {
  isRunning: boolean;
  /** Carried so the phone renders in the panel's language on first paint,
   *  instead of flashing English and being corrected over the socket. */
  locale?: string;
  httpPort: number | null;
  httpsPort: number | null;
  primaryIp: string;
  controllerToken: string;
  adminToken: string;
}

export interface ServerAccessUrls {
  phoneUrl: string | null;
  adminUrl: string | null;
}

export function buildServerAccessUrls(options: ServerAccessUrlOptions): ServerAccessUrls {
  const {
    isRunning,
    httpPort,
    httpsPort,
    primaryIp,
    controllerToken,
    adminToken,
    locale,
  } = options;

  const lang = locale ? `&lang=${encodeURIComponent(locale)}` : "";

  return {
    phoneUrl: isRunning && httpsPort !== null
      ? `https://${primaryIp}:${httpsPort}/?token=${controllerToken}${lang}`
      : null,
    adminUrl: isRunning && httpPort !== null
      ? `http://127.0.0.1:${httpPort}/static/admin/?token=${adminToken}${lang}`
      : null,
  };
}
