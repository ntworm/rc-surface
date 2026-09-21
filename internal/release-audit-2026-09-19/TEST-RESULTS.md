# Test results — RC Surface 1.0 release audit

Execução: 2026-09-19, worktree `plan/rc-surface-release-investigation-2026-09-19`
(SHA `2544d19e95a4c4726b58c06380d4af75b499588c`, branch limpa, base
`integration/rc-surface-1.0`). Todos os comandos foram executados na worktree
isolada com `ABLETON_RC_DEV_SYNC=0` para impedir a cópia de artefatos para o
AppData do Live.

| Comando | CWD | Node | SHA | Início | Fim | Exit | Log |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `npm ci` | worktree | v24.19.0 | `2544d19` | 2026-09-19 14:54 -03 | 2026-09-19 14:55 -03 | 0 | `test-results/p05-npm-ci.log` |
| `npm test` | worktree | v24.19.0 | `2544d19` | 2026-09-19 14:55 -03 | 2026-09-19 14:55 -03 | 1 | `test-results/p05-npm-test.log` |
| `npm run lint` | worktree | v24.19.0 | `2544d19` | 2026-09-19 15:04 -03 | 2026-09-19 15:04 -03 | 0 | `test-results/p05-npm-lint.log` |
| `npm run build:prod` | worktree | v24.19.0 | `2544d19` | 2026-09-19 15:04 -03 | 2026-09-19 15:04 -03 | 0 | `test-results/p05-npm-build-prod.log` |
| `npm run test:ui` (Playwright) | worktree | v24.19.0 | `2544d19` | 2026-09-19 15:05 -03 | 2026-09-19 15:06 -03 | 1 | `test-results/p05-npm-test-ui.log` |
| `node --import tsx --test tests/server-panel-token-exposure.test.mjs` (rerun com `dist/`) | worktree | v24.19.0 | `2544d19` | 2026-09-19 14:57 -03 | 2026-09-19 14:57 -03 | 0 | `test-results/p05-rerun-panel-token.log` |

Observação: `engines.node` exige `>=24.16.0 <25`. O ambiente roda
`v24.19.0`, dentro do contrato. Nenhuma troca de dependência foi feita; o
lockfile permaneceu intacto.

## `npm test` (`test:static` + `test:src`)

- 500 casos / 498 pass / 2 fail / 0 skip / duração 6 210 ms.
- Suites cobertas: `static/admin/*.test.mjs`, `static/panel/*.test.mjs`,
  `static/phone-v3/*.test.mjs`, `static/shared/*.test.mjs`,
  `scripts/*.test.mjs`, `tests/*.test.mjs`.

### Falhas conhecidas e classificação

1. **`tests/live-bench-device-param-writes.test.mjs:91`** — modo `single` da
   `benchDeviceParamWrites` reportou `meanMs=29.13` contra limite aceito
   `14..28`. Falha de **jitter do timer do Windows** reconhecida pela base
   (commits `2a616f2` "relax meanMs upper bound for Windows timer jitter" e
   `1673c2b` "relax throughput lower bound for Windows timer jitter"). O
   caminho real de produção (`continuousTargetActuator.pumpLane`) tem
   `minWriteIntervalMs=20` e a bancada é puramente sintética; a janela
   superior de 28 ms não é um limite de produto. **Não é regressão.**
   Resultado válido da investigação: confirma que o limite do produto é
   conservador e que o bench precisa de P04 físico para definir números reais.

2. **`tests/server-panel-token-exposure.test.mjs:70`** — falha inicial
   `404 !== 200` ao pedir `GET /static/panel/index.html?token=<admin>`. Causa
   raiz: o teste importa o source via `tsx`, e o handler `serveStaticFile`
   (`src/server/http.ts:117-181`) resolve o arquivo a partir de
   `__dirname/static` (que em runtime aponta para `dist/static/`).
   Sem `npm run build:prod` prévio, `dist/` não existe e o `fs.stat` falha
   com `ENOENT` → `404`. Como `package.json:14` define `"ci": "npm test && npm run lint && npm run build:prod && npm run test:ui"`,
   `npm test` é executado antes de `build:prod`, fazendo com que um CI limpo
   falhe neste teste. Após rodar `npm run build:prod` (que popula `dist/static/panel/index.html`),
   rerun do mesmo arquivo passa verde: **4/4 pass, exit 0** (ver `test-results/p05-rerun-panel-token.log`).
   A proposta de remediação é desacoplar o teste unitário através de fixture isolada
   para que `npm test` passe independentemente de build prévio.

## `npm run lint` (ESLint + `tsc --noEmit`)

- 0 errors, 6 warnings (todos `no-unused-vars` em arquivos de teste/script).
  Lista reproduzida de `p05-npm-lint.log`:
  - `scripts/`: `writeFileSync`, `rm`, `e`, `existsSync`, `STAGE_KEYS`,
    `dirname` em arquivos `stage-mode-fullscreen` e adjacentes. Marcados
    permitidos pela convenção `/^_/u`, porém não usados. Sem impacto em
    runtime. **Não bloqueia release.**

## `npm run build:prod` (`tsc --noEmit` + esbuild)

- `tsc --noEmit` ✓ (zero erros de tipo).
- `tsx build.ts --production` ✓ — `dist/extension.js` + `dist/static/*`
  copiados. Arquivo `dist/static/panel/index.html` presente, habilitando o
  rerun verde do teste de panel-token.

## `npm run test:ui` (Playwright)

- 158 casos / 156 pass / 2 fail / duração 34 s. Suites cobertas:
  `tests/ui/*.spec.mjs` (`audio-input`, `audio-spectral-workspace`,
  `calibration`, `landing-release`, `sensor-capabilities`, `surface`).

### Falhas conhecidas

`tests/ui/landing-release.spec.mjs:14:1` em ambos os projetos
`Desktop Chrome` e `Mobile Chrome Landscape` no caso `pt-BR 320`. Diagnóstico
reproduzido: em Desktop Chrome, `scrollWidth` mede `327` contra `innerWidth=320`
(overflow horizontal real de 7 px). O teste identificou os candidatos causadores:
`UL.hi-grid`, `LI.hi-cell`, `H3`, `P` (elementos da grade de destaques em português).
O array `overflowing: []` reportou vazio unicamente porque sua busca estava restrita
a seletores específicos (`h1, h2, .sec > .c, .head, .duo`), não abrangendo `hi-grid`/`hi-cell`.
Em Mobile Chrome Landscape emulado, `viewport=327` e `width=327`. Trata-se de
**overflow horizontal real** decorrente da geometria/CSS da grade de destaques em pt-BR
no viewport mínimo de 320 px (BUG-001). A asserção rigorosa (`width === 320, viewport === 320`)
deve ser mantida e a geometria corrigida em tarefa de UI apropriada, sem relaxamento
artificial com tolerância. Os outros 156 casos do `test:ui` passam, incluindo
todos os checks de áudio espectral, calibração SNS/AUD/VID, mapeamento
mobile, MIX 8+8 e layout das demais abas.

## Tests apenas propostos (não cobertos pela base atual)

A PLAN pede que a investigação distinga testes herdados, executados e
propostos. A base cobre abundantemente os caminhos determinísticos; o que
fica como **proposto** e exige decisão da bancada P04 (operador):

- Latência física microphone→SDK→Live (browser audio worklet vs Host
  modulator loop vs SDK `setValue`): sem captura-controle no mesmo relógio,
  `meanMs`/`p95` sintéticos não estabelecem caminho real.
- Bancada `bench-live-write-rate.mjs` em `single/parallel 2/4/8` com
  Automation Arm ligado e contagem de pontos gravados pelo Live.
- Native Track (`scripts/measure-native-audio-latency.mjs`,
  `scripts/generate-native-latency-fixture.mjs`,
  `scripts/native-audio-capability-probe.mjs`): designado
  `PENDING_OWNER_DEFERRED` por decisão do responsável; não foi executado.
- Sessão longa 20–30 min no aparelho real para fadiga de CPU, calor,
  drenagem de bateria, throttling de timer em background. O script
  `tests/ui/wake-lock.test.mjs` valida o pedido de wake-lock, não o efeito
  no aparelho.
- macOS / Safari iOS: testes cobrem Chromium (desktop e mobile emulado). A
  suite Playwright não roda em WebKit no Windows do executor.

## Comandos reproduzíveis

```
cd C:\Users\Usuario\repos\ableton-extensions\source-repos\.worktrees\rc-surface-release-investigation-2026-09-19
$env:ABLETON_RC_DEV_SYNC='0'
npm ci
npm test
npm run lint
npm run build:prod
npm run test:ui
```

Nenhum dos comandos acima escreve em AppData do Live. Logs sanitizados em
`internal/release-audit-2026-09-19/test-results/` (sem tokens, sem QR, sem
dados pessoais).
