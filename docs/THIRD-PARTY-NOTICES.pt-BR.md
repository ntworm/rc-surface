# Avisos de Terceiros — RC Surface

Build `1.0.0`. Este arquivo lista os componentes de terceiros efetivamente
empacotados no payload ABLX e no bundle do host, com os avisos exigidos pelas
respectivas licenças. A matriz canônica de distribuição está no documento
interno de revisão de distribuição.

## Empacotados no payload ABLX

### Ableton Extensions SDK (`@ableton-extensions/sdk`, 1.0.0-beta.0)

Incorporado em `dist/extension.js` como parte da aplicação. Licenciado sob a
Ableton Extensions SDK License (ver tarball em `vendor/`). A licença permite
distribuir a aplicação que usa partes ou todo o SDK e proíbe distribuir o SDK
ou partes dele fora da aplicação. Por isso o código e o texto da licença do
SDK não são reproduzidos publicamente aqui.

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

Copyright (c) 2014, GMO GlobalSign, Inc. Todos os direitos reservados.
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
Copiados para o payload em `static/phone-v3/vendor/mediapipe/`; o texto da
Apache License 2.0 é vendado em `static/phone-v3/vendor/mediapipe/LICENSE`.
<https://developers.google.com/mediapipe>

### Departure Mono — MIT

Copyright (c) 2024 Helena Zhang & Tobias Fried.
Empacotado em `static/fonts/` e embutido em `docs/index.html`.
Texto da licença em `static/fonts/LICENSE.txt`. <https://departuremono.com>

### OpenMoji — CC BY-SA 4.0

Copyright dos autores do OpenMoji.
Usado em `docs/index.html` (glifos de mão em pinça e mão levantada, ilustração
de Vision). <https://openmoji.org>

## Não empacotados

Os componentes abaixo são apenas de desenvolvimento/build e nunca entram no
ABLX nem no bundle do host: `@ableton-extensions/cli`, `@playwright/test`,
`@types/*`, `@typescript-eslint/parser`, `esbuild`, `eslint`, `globals`, `tsx`,
`typescript`. `pkijs` (BSD-3-Clause, dependência de `@peculiar/x509`) foi
verificado por varredura de símbolos distintivos e não está presente no bundle
gerado.

## Preservação dos textos de licença

- Apache-2.0: preservado em `static/phone-v3/vendor/mediapipe/LICENSE`.
- MIT: preservado em `static/fonts/LICENSE.txt`; os textos originais seguem em
  `node_modules/` e são resumidos acima com a atribuição dos autores.
- CC BY-SA 4.0: atribuição preservada no `NOTICE` e na landing page.
- Ableton Extensions SDK License: preservada dentro dos pacotes instalados e
  nos tarballs de `vendor/`; não reproduzida publicamente (ver a revisão
  interna de distribuição).
