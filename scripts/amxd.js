// Read and write the .amxd container.
//
// The file is three chunks: "ampf" with a four-byte device-kind marker,
// "meta" with four zero bytes, and "ptch" whose declared length covers the
// JSON patcher plus a trailing NUL terminator. The declared length is the
// authority, and the NUL is inside it — parsing to end-of-chunk without
// stripping it fails on the last byte.
import fs from 'node:fs';

const NUL = String.fromCharCode(0);
const DEVICE_IDENTITIES = {
  audio: { marker: 'aaaa', amxdtype: 1633771873 },
  midi: { marker: 'mmmm', amxdtype: 1835887981 },
};

function readPatch(file) {
  const buf = fs.readFileSync(file);
  const at = buf.indexOf('ptch');
  if (at < 0) throw new Error('no ptch chunk');
  const len = buf.readUInt32LE(at + 4);
  let raw = buf.toString('utf8', at + 8, at + 8 + len);
  while (raw.endsWith(NUL)) raw = raw.slice(0, -1);
  return JSON.parse(raw);
}

function writePatch(file, patch, deviceKind = 'midi') {
  const identity = DEVICE_IDENTITIES[deviceKind];
  if (!identity) throw new Error(`unsupported Max device kind: ${deviceKind}`);

  const typedPatch = {
    ...patch,
    patcher: {
      ...patch.patcher,
      project: {
        ...patch.patcher.project,
        amxdtype: identity.amxdtype,
      },
    },
  };
  // Max writes CRLF and terminates the chunk with a NUL counted by the
  // declared length. Matching that byte for byte is cheaper than discovering
  // which parts Live is strict about.
  const body = JSON.stringify(typedPatch, null, 4).split('\n').join('\r\n');
  const json = Buffer.concat([Buffer.from(body, 'utf8'), Buffer.from([0])]);
  const head = Buffer.alloc(24);
  head.write('ampf', 0, 'ascii');
  head.writeUInt32LE(4, 4);
  head.write(identity.marker, 8, 'ascii');
  head.write('meta', 12, 'ascii');
  head.writeUInt32LE(4, 16);
  head.writeUInt32LE(0, 20);
  const ptch = Buffer.alloc(8);
  ptch.write('ptch', 0, 'ascii');
  ptch.writeUInt32LE(json.length, 4);
  fs.writeFileSync(file, Buffer.concat([head, ptch, json]));
  return json.length;
}

function listObjects(patch) {
  const out = [];
  const walk = (boxes) => {
    for (const entry of boxes || []) {
      const box = entry.box || entry;
      if (box.text) out.push(box.text);
      else if (box.maxclass) out.push('<' + box.maxclass + '>');
      if (box.patcher) walk(box.patcher.boxes);
    }
  };
  walk(patch.patcher.boxes);
  return out;
}

export { readPatch, writePatch, listObjects };
