// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface

/** The commands the panel uses to look at the network and to walk it. */

import type { CommandSpec } from './catalog/types.js';
import { buildServerAccessUrls } from '../server/access-urls.js';
import {
  chooseNetwork,
  checkNetwork,
  getNetworkCheck,
  getNetworkSearch,
  getPublishedLan,
  nextNetworkAddress,
  startNetworkSearch,
  stopNetworkSearch,
  type NetworkCheckReport,
  type PublishedLan,
} from '../server/lan-runtime.js';
import type { LanSearchView } from '../server/lan-search.js';

export type NetworkInfoInput = {
  published: PublishedLan;
  search: LanSearchView | null;
  check: NetworkCheckReport | null;
  server: { isRunning: boolean; httpPort: number | null; httpsPort: number | null; useHttps: boolean };
  tokens: { controllerToken: string; adminToken: string };
  locale?: string;
};

/** The phone URL of one address, in the language of the panel. */
function phoneUrlFor(address: string, input: NetworkInfoInput): string | null {
  return buildServerAccessUrls({
    isRunning: input.server.isRunning,
    httpPort: input.server.httpPort,
    httpsPort: input.server.httpsPort,
    primaryIp: address,
    controllerToken: input.tokens.controllerToken,
    adminToken: input.tokens.adminToken,
    ...(input.locale === undefined ? {} : { locale: input.locale }),
  }).phoneUrl;
}

/** Everything the panel shows about the network, in one answer. */
export function buildNetworkInfo(input: NetworkInfoInput) {
  const search = input.search;
  const tried = search !== null && (search.state === 'running' || search.state === 'arrived');
  return {
    ...input.published,
    isRunning: input.server.isRunning,
    httpsPort: input.server.httpsPort,
    useHttps: input.server.useHttps,
    phoneUrl: phoneUrlFor(input.published.primaryIp, input),
    search: search === null ? null : { ...search, phoneUrl: tried ? phoneUrlFor(search.ip, input) : null },
    check: input.check,
  };
}

/** The server state the network needs, read when the panel asks. */
async function currentInfo() {
  const serverState = await import('../server/state.js');
  const { getControllerToken, getAdminToken } = await import('../server/session-auth.js');
  const { getLocale } = await import('../server/locale.js');
  return buildNetworkInfo({
    published: getPublishedLan(),
    search: getNetworkSearch(),
    check: getNetworkCheck(),
    server: {
      isRunning: serverState.serverInstance !== null,
      httpPort: serverState.actualPort,
      httpsPort: serverState.actualHttpsPort,
      useHttps: serverState.useHttps,
    },
    tokens: { controllerToken: getControllerToken(), adminToken: getAdminToken() },
    locale: getLocale(),
  });
}

export const networkCommands: Record<string, CommandSpec> = {
  getNetworkInfo: { description: 'Read the published address, the running search and the last check', handler: async () => currentInfo() },
  setNetworkChoice: { description: 'Choose the network the phone is told to use', handler: async args => { await chooseNetwork(args); return currentInfo(); } },
  runNetworkCheck: { description: 'Read why a phone does not reach this machine', handler: async () => { const serverState = await import('../server/state.js'); await checkNetwork(serverState.actualHttpsPort); return currentInfo(); } },
  startNetworkSearch: { description: 'Walk the candidate addresses, one at a time', handler: async () => { await startNetworkSearch(); return currentInfo(); } },
  stopNetworkSearch: { description: 'End the walk over the candidate addresses', handler: async () => { await stopNetworkSearch(); return currentInfo(); } },
  nextNetworkAddress: { description: 'Give the walk the next candidate address', handler: async () => { await nextNetworkAddress(); return currentInfo(); } },
};
