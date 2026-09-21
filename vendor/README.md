# vendor/ — Ableton Extensions SDK and CLI

`package.json` installs the Ableton Extensions SDK and CLI from local tarballs:

- `vendor/ableton-extensions-sdk-1.0.0-beta.0.tgz`
- `vendor/ableton-extensions-cli-1.0.0-beta.0.tgz`

The tarballs are Ableton's licensed material. The Extensions SDK licence allows
shipping an application that embeds the SDK, but not distributing the SDK
itself outside that application, so the tarballs are **not tracked in this
repository** (`.gitignore` covers `vendor/*.tgz`). Only `manifest.json` (names,
sizes and SHA256) and this note are versioned.

## Local setup

1. Obtain both tarballs from Ableton (Extensions SDK beta programme).
2. Copy them into `vendor/` with the exact names above.
3. Verify before installing:

   ```bash
   npm run check:vendor
   npm ci
   ```

`check:vendor` fails with a clear message when a tarball is missing or its
SHA256 does not match `manifest.json`. It never deletes or overwrites a file
that already matches.

## Hosted CI

GitHub Actions cannot read the tarballs from this repository. Both workflows
check out a **private** repository that holds only the two tarballs at its root
and stage them with `node scripts/check-vendor-sdk.mjs --from .vendor-private`:

- repository: `ntworm/rc-surface-vendor` (private)
- secret: `VENDOR_SDK_KEY` — the private half of a read-only deploy key
  registered on that repository; the key grants nothing else

Without the secret the fetch step fails before `npm ci`; nothing in the public
repository or its releases exposes the tarballs.

## Built packages

`RC-Surface-<version>.ablx` embeds only the parts of the SDK that the host
bundle uses (tree-shaken by esbuild). The tarballs themselves are never copied
into the package; `scripts/verify-release-package.mjs` compares the candidate
against the build directory.
