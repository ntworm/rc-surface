# Third-Party Notices — RC Surface

Build `1.0.0`. This file lists the third-party components that are actually
packaged in the ABLX payload and in the host bundle, with the notices their
licenses require. The canonical distribution matrix lives in the internal
distribution review document.

## Packaged in the ABLX payload

### Ableton Extensions SDK (`@ableton-extensions/sdk`, 1.0.0-beta.0)

Bundled inside `dist/extension.js` as part of the application. Licensed under
the Ableton Extensions SDK License (see `vendor/` tarball). The license permits
distributing the application that uses parts or all of the SDK, and prohibits
distributing the SDK or parts of it outside of the application. The SDK source
and license text are not reproduced publicly here for that reason.

### ws (8.21.0) — MIT

Copyright (c) 2011 Einar Otto Stangvik <einaros@gmail.com>
<https://github.com/websockets/ws>

### selfsigned (5.5.0) — MIT

Copyright (c) 2013 José F. Romaniello <jfromaniello@gmail.com>
<https://github.com/jfromaniello/selfsigned>

### @peculiar/x509 (1.14.3) — MIT

Copyright (c) Peculiar Ventures, LLC
<https://github.com/PeculiarVentures/x509>

### @peculiar/asn1-schema (2.8.0) — MIT

Copyright (c) Peculiar Ventures, LLC
<https://github.com/PeculiarVentures/asn1-schema>

### asn1js (3.0.10) — BSD-3-Clause

Copyright (c) 2014, GMO GlobalSign, Inc. All rights reserved.
<https://github.com/PeculiarVentures/asn1.js>

### pvutils (1.1.5) — MIT

Copyright (c) Peculiar Ventures, LLC
<https://github.com/PeculiarVentures/pvutils>

### tslib (2.8.1) — 0BSD

Copyright (c) Microsoft Corporation.
<https://github.com/Microsoft/tslib>

### osc-min (2.1.2) — zlib/libpng

Copyright (c) Russell McClellan <russell.mcclellan@gmail.com>
<https://github.com/russellmcc/osc-min>

### MediaPipe Hands & Camera Utils (Apache-2.0)

Copyright 2019 The MediaPipe Authors.
Copied into the payload under `static/phone-v3/vendor/mediapipe/`; the Apache
License 2.0 text is vendored at `static/phone-v3/vendor/mediapipe/LICENSE`.
<https://developers.google.com/mediapipe>

### Departure Mono — MIT

Copyright (c) 2024 Helena Zhang & Tobias Fried.
Bundled at `static/fonts/` and embedded in `docs/index.html`.
License text at `static/fonts/LICENSE.txt`. <https://departuremono.com>

### OpenMoji — CC BY-SA 4.0

Copyright the OpenMoji authors.
Used in `docs/index.html` (pinching-hand and raised-hand glyphs, Vision
illustration). <https://openmoji.org>

## Not packaged

The following components are development/build-time only and are never copied
into the ABLX or the host bundle: `@ableton-extensions/cli`, `@playwright/test`,
`@types/*`, `@typescript-eslint/parser`, `esbuild`, `eslint`, `globals`, `tsx`,
`typescript`. `pkijs` (BSD-3-Clause, dependency of `@peculiar/x509`) was checked
by distinctive-symbol scan and is not present in the built bundle.

## License text preservation

- Apache-2.0: preserved in `static/phone-v3/vendor/mediapipe/LICENSE`.
- MIT: preserved in `static/fonts/LICENSE.txt`; upstream texts also remain in
  `node_modules/` and are summarized above with author attribution.
- CC BY-SA 4.0: attribution preserved in `NOTICE` and on the landing page.
- Ableton Extensions SDK License: preserved inside the installed packages and
  the `vendor/` tarballs; not reproduced publicly (see the internal
  distribution review).
