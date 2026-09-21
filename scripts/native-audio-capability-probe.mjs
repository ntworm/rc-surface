// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Isolated Gate A helper. No SDK import, no production server or parameter writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import '../static/shared/native-audio-contract.js';
const exec = promisify(execFile);
export async function startCapabilityProbe({ privateDir }) {
  if (typeof privateDir !== 'string' || !path.isAbsolute(privateDir)) throw Error('invalid_probe_directory');
  const dir = path.resolve(privateDir), file = path.join(dir, 'bridge.json');
  try { await fs.mkdir(dir, { mode: 0o700 }); }
  catch (error) { if (error.code === 'EEXIST') throw Error('probe_directory_exists'); throw error; }
  // The caller supplies a NEW directory; never change permissions on an
  // existing workspace, parent directory, home or production rendezvous.
  if (process.platform === 'win32') {
    const who = await exec('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { windowsHide: true, timeout: 5000 });
    const sid = who.stdout.match(/S-1-[0-9-]+/);
    if (!sid) throw Error('probe_acl_unavailable');
    await exec('icacls.exe', [dir, '/inheritance:r', '/grant:r', '*' + sid[0] + ':(OI)(CI)F'], { windowsHide: true, timeout: 5000 });
  } else await fs.chmod(dir, 0o700);
  const token = randomBytes(32).toString('hex'), hostEpoch = randomUUID();
  let port = 0, stopped = false;
  const server = http.createServer(async (req, res) => {
    const reply = (status, body = { code: 'probe_rejected' }) => {
      if (!res.headersSent) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
    };
    try {
      if (req.url !== '/native-audio/probe' || req.method !== 'POST') return reply(404);
      if (req.socket.remoteAddress !== '127.0.0.1' || req.headers.origin !== undefined
        || req.headers.host !== '127.0.0.1:' + port) return reply(403);
      const auth = Buffer.from(req.headers.authorization || '');
      const expected = Buffer.from('Bearer ' + token);
      if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return reply(401);
      if (req.headers['content-type'] !== 'application/json') return reply(415);
      if (Number(req.headers['content-length']) > 16384) return reply(413);
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 16384) return reply(413); chunks.push(chunk); }
      const value = globalThis.NativeAudioContract.validateExchange(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if (value.hostEpoch !== hostEpoch) return reply(400);
      reply(200, { version: 1, hostEpoch, acceptedSeq: value.frame?.seq ?? null, telemetryHz: 1 });
    } catch { reply(400); }
  });
  server.maxConnections = 8; server.requestTimeout = 3000; server.headersTimeout = 2000; server.keepAliveTimeout = 1000;
  server.setTimeout(3000, socket => socket.destroy());
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  port = server.address().port;
  try {
    await fs.writeFile(file, JSON.stringify({ version: 1, kind: 'rc-native-capability-probe',
      host: '127.0.0.1', port, hostEpoch, token }), { flag: 'wx', mode: 0o600 });
  } catch (error) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); throw error; }
  return { port, async stop() {
    if (stopped) return; stopped = true;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    // Preserve a caller replacement rather than deleting material we don't own.
    try { const current = JSON.parse(await fs.readFile(file, 'utf8')); if (current.hostEpoch === hostEpoch && current.token === token) await fs.unlink(file); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) { process.stderr.write('Usage: node scripts/native-audio-capability-probe.mjs <new-private-directory>\n'); process.exitCode = 1; }
  else startCapabilityProbe({ privateDir: path.resolve(process.argv[2]) }).then(probe => {
    process.stdout.write('Isolated native capability probe listening on 127.0.0.1:' + probe.port + '. Ctrl+C stops it.\n');
    const stop = () => probe.stop().then(() => process.exit(0), () => process.exit(1));
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  }).catch(() => { process.stderr.write('Could not start isolated native probe. Use a new private directory.\n'); process.exitCode = 1; });
}
