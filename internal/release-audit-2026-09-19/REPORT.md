# RC Surface 1.0 release-audit report

**Task**: `rc-surface-release-investigation-2026-09-19`
**Worktree**: `plan/rc-surface-release-investigation-2026-09-19`
**SHA**: `2544d19e95a4c4726b58c06380d4af75b499588c`
**Base canônica**: `integration/rc-surface-1.0` (mesmo SHA)
**Branch**: `plan/rc-surface-release-investigation-2026-09-19`
**Executor**: `argos-main`
**Data**: 2026-09-19
**Escopo**: investigar integralmente a candidata 1.0.0 para Ableton Live 12
Beta, devolver diagnóstico rastreável, matriz de cobertura e fila de
correções verificáveis. Sem patch de produto.

---

## 1. Conclusão

**NO-GO para publicação pública.** Decisão defensável pelos gates
contratuais da própria base (`internal/RELEASE-GATES-1.0.json`):

| Gate | Status atual | Origem |
| --- | --- | --- |
| `source-r13-baseline` | `passed` | já documentado |
| `distribution-licensing-inventory` | `passed` | já documentado |
| `sensor-capabilities` | `passed` | já documentado |
| `live-broadcast-backpressure` | `passed` | já documentado |
| `code-hygiene` | `passed` | já documentado |
| `contract-freeze` | `passed` | já documentado |
| `performance-benchmarks` | `passed` | já documentado |
| `docs-landing-coherence` | `passed` | já documentado |
| `local-only-pipeline` | `passed` | já documentado |
| `release-verifier` | `passed` | já documentado |
| **`physical-hardware`** | **`pending`** (P09) | exige operador + bancada |
| **`distribution-publication`** | **`blocked`** (P10) | exige rota upstream do SDK |

Publicação exige `--stage publish` aceito por
`scripts/check-release-gates.mjs`, que retorna exit 4 enquanto
`physical-hardware` e `distribution-publication` não forem `passed`. Esta
investigação **não toca produto**; promover esses dois gates é trabalho
externo (responsável + upstream), registrado em `REMEDIATION.md` A1/A2.

**GO para próxima etapa interna** — abrir as tarefas cirúrgicas
`rc-surface-receiver-v2-migration-2026-09-XX`,
`rc-surface-write-ceiling-physical-2026-09-XX` (clonagem da fila serial
existente), `rc-surface-sdk-route-2026-09-XX`, e o conjunto de fixes de
higiene de teste (B1/B2/B3). Cada item em `REMEDIATION.md` tem critério
de aceite e regressões cruzadas definidas.

---

## 2. Baseline

| Item | Valor |
| --- | --- |
| Repositório | `C:\Users\Usuario\repos\ableton-extensions\source-repos\ableton-rc-surface` |
| Worktree | `C:\Users\Usuario\repos\ableton-extensions\source-repos\.worktrees\rc-surface-release-investigation-2026-09-19` |
| Branch | `plan/rc-surface-release-investigation-2026-09-19` |
| SHA trabalho | `2544d19` |
| Integração | `integration/rc-surface-1.0` @ `2544d19` |
| Worktree status | limpa (`git status --short --branch` = `## plan/...`) |
| Node | `v24.19.0` (engines exige `>=24.16.0 <25` — dentro do contrato) |
| npm | `11.17.0` |
| `git diff --check` | verde |
| Paths rastreados (`git ls-files`) | 410 |
| Itens em `FILES.csv` | 410 (sem exclusões silenciosas) |
| Itens em `FEATURES.csv` | 121 (surface controls + subsystems + distribuição + bench); coluna `status` lista só evidência registrada — ver §4.1 |
| Itens em `BUILD-REPORT` (`dist/`) | gerado por `npm run build:prod` |

`refs/` preserva cópias exatas de `git status`, `git rev-parse HEAD`,
`git log -12 --oneline`, `git diff --check`, `node --version`,
`npm --version`, `git ls-files`, headings de `docs/USER-GUIDE{,.pt-BR}.md`.

---

## 3. Ambiente e métodos

- Worktree isolada `ABLETON_RC_DEV_SYNC=0` em todos os comandos.
- Lockfile preservado intacto; `npm ci` apenas na worktree.
- Sem patch de produto; apenas escrita em `internal/release-audit-2026-09-19/`.
- Source review profundo de: `src/extension.ts`, `src/server/{http,ws-bounds,
  write-scheduler,backpressure,session-auth}.ts`, `src/live/{mappings,
  continuous-target-actuator,host-modulators,transport-clock,osc-transport,
  midi-receiver,project-config,safe-input}.ts`,
  `static/phone-v3/{controls,config-mode,mapping-mode,audio-processor,
  audio-descriptor-worklet,vision-processor}.js`,
  `static/panel/`, `static/admin/`, `scripts/`.
- Gates automatizados: `npm ci`, `npm test`, `npm run lint`, `npm run
  build:prod`, `npm run test:ui`.
- Sem hardware físico disponível; P04 do `LIVE-WRITE-CEILING-1.0.md` e
  Native Track marcados como **not-run** com roteiro reproduzível em
  `LIVE-ACCEPTANCE.md`.

## 4. Cobertura

A matriz abaixo resume o que foi investigado pelo source review contra a
superfície documentada. Detalhamento por feature está em `FEATURES.csv`.

### 4.1 Níveis de evidência (o que a coluna `status` significa)

Nenhuma linha de `FEATURES.csv` ou `FILES.csv` foi auditada ponta a ponta em
hardware por esta investigação. Uma versão anterior deste relatório carimbou
todas as linhas como `audited-*` por script; isso foi revertido. A coluna
`status` (features) e `review_state` (arquivos) agora é a lista das evidências
que de fato existem, separadas por `;`, gerada por
`relabel-evidence-states.py` a partir de três fontes verificáveis: as entradas
P02–P06 de `progress.jsonl` da task (arquivos nomeados), os arquivos de teste
que os globs de `npm test` / `npm run test:ui` executaram em P05 e as sessões
de aceite do dono em 2026-09-18 e 2026-09-19 registradas em
`workflow-main/tasks/rc-surface-v1-stage-acceptance-2026-09-18`.

| Evidência | Significado | Linhas em `FEATURES.csv` |
| --- | --- | --- |
| `owner-accepted-<data>` | item exercitado pelo dono com nota ou print (PERF, MIX, XY, LFO, stutter, CFG, MAP, SNP, SYNC, pose aprendida) | 48 |
| `owner-smoke-<data>` | dono relata que funciona, sem registro por item (SNS, AUD, VID built-ins) | 39 |
| `automated-test-P05` | pelo menos um teste listado existe e rodou em P05 | 120 |
| `code-reviewed-P0x` | fonte nomeada na entrada P0x do progresso foi lida (P05 é execução de testes, não leitura) | P02 85 · P03 20 · P04 41 · P06 4 |
| `blocked-owner-deferred` | Native Track, decisão do dono em `NATIVE-AUDIO-VALIDATION.md`; derivado da fonte, sobrevive à regeneração | 1 |
| `not-verified` | nenhuma evidência registrada (`bench.ws_compression`, GAP-004) | 1 |

Em `FILES.csv` (410 arquivos): `read-P0x` 36, `executed-P05` 200 (testes e
entradas de build), `inventoried` 176 (listados por `git ls-files`, não lidos
nem executados). A coluna `evidence_basis` de `FEATURES.csv` cita a fonte de
cada rótulo; rodar o script duas vezes a partir dos CSVs entregues produz
arquivos idênticos. Sem bancada física, o único item validado em Live pelo dono foi a
superfície de UI; latência, teto de escrita e Native Track continuam nos
bloqueios de §7.

| Domínio | Source revisado | Teste automatizado | Bancada física |
| --- | --- | --- | --- |
| PERF (12 pads / 8 knobs / 8 faders / 2×XY / L1–L4 / S1–S4) | `controls.js`, `mappings.ts` | `static/phone-v3/*.test.mjs` + `tests/live-mappings-*.test.mjs` | parcial (UI Playwright passa) |
| MIX (knobs/faders 8+8, reset target-aware) | `controls.js` (mixer builders), `fader-range`, `fader-reset` | `tests/ui/*` | não medido |
| MAP (bind/trigger-note/clear/preset) | `mapping-mode.js`, `mappings.ts`, `midi-receiver.ts` | `tests/live-mappings-*`, `tests/live-midi-*`, `midi-receiver-arming` | não medido |
| CFG (per-control override, Clear-all, badges) | `config-mode.js`, `control-config.js` | `config-mode.test.mjs`, `control-config.test.mjs` | não medido |
| SYNC / TRN / STAGE | `transport.js`, `sync.js`, `stage-mode-controller.js`, `osc-transport.ts` | `tests/osc-transport*`, `tests/stage-mode-fullscreen`, `tests/transport-clock` | não medido |
| SNP | `modules/snapshots.js`, `mappings.ts` (snapshot vs cfg) | `snapshots.test.mjs`, `snapshot-controls.test.mjs`, `release-cleanup.test.mjs` | não medido |
| SNS (motion/orient/calibração) | `sensor-capabilities.js`, `calibration.js`, `modules/calibration.js` | `sensor-capabilities*`, `sensor-orientation`, `calibration*` | não medido |
| AUD (12 descritores + loudness K-weighted) | `audio-processor.js`, `audio-descriptor-worklet.js`, `audio-spectral-descriptors.js`, `audio-descriptor-stream.js`, `audio-input-selector.js`, `audio-workspace.js`, `audio-smoothing.js`, `audio-analysis-controls.js`, `audio-descriptors.js` | `static/phone-v3/audio-*` (suite ampla), `live-audio-descriptor-dispatch.test.mjs` | não medido (Native Track deferida) |
| VID (camera/hand/static-pose/pinch) | `vision-processor.js`, `camera-lifecycle.js`, `vision-control-state.js` | `vision-*`, `static-pose-*` | não medido |
| Backend write-path | `continuous-target-actuator.ts`, `host-modulators.ts`, `transport-clock.ts`, `write-scheduler.ts` | `live-continuous-*`, `live-host-*`, `lfo-*`, `stutter-*`, `server-write-scheduler*` | parcial (write-ceiling P04 pendente) |
| OSC / AbletonOSC | `osc-transport.ts`, `osc-tokens.ts` | `osc-transport*`, `contracts-freeze.test.mjs` | não medido |
| Backend security | `session-auth.ts`, `backpressure.ts`, `http.ts`, `ws-bounds.ts` | `server-*` (suite ampla) | não aplicável |
| Persistence | `project-config.ts`, `mappings.ts` (atomic write) | `project-config*`, `live-preset-storage*`, `release-cleanup*` | não aplicável |
| Max devices | `static/RC-Midi-Receiver.amxd`, `static/RC-Audio-Sender.amxd`, `static/RC-Audio-Descriptors.amxd` (verificar rastreamento), `scripts/build-*` | `midi-receiver-device*`, `audio-sender-device*`, `audio-descriptors-device*` | não medido (Receiver v2 ainda em rollout manual) |
| Distribution | `build.ts`, `scripts/verify-release*`, `scripts/check-release-gates*`, `scripts/package-tester-kit*`, `scripts/migrate-data*` | `release-*`, `package-tester-kit*`, `migrate-data*` | não aplicável |

## 5. Resultados automatizados (P05)

| Comando | Resultado | Detalhes |
| --- | --- | --- |
| `npm ci` | ✓ exit 0 | ver `test-results/p05-npm-ci.log` |
| `npm test` | ✓ 498/500 (exit 1); rerun `server-panel-token-exposure` 4/4 verde após `dist/` | 1 falha Windows timer jitter (já aceita em `2a616f2`/`1673c2b`); 1 falha em `server-panel-token-exposure` por ausência de `dist/` prévio (`package.json` define `"ci"` com `npm test` antes de `build:prod`, falhando CI limpo; rerun passa após build) |
| `npm run lint` | ✓ exit 0 | 0 errors, 6 unused-vars warnings |
| `npm run build:prod` | ✓ exit 0 | `dist/extension.js` + `dist/static/*` populados |
| `npm run test:ui` | ✓ 156/158 (exit 1) | 2 falhas `landing-release.spec` pt-BR 320 (`scrollWidth 327` vs `innerWidth 320` em Desktop Chrome por overflow real da grade `hi-grid`/`hi-cell`; teste estrito mantido) |
| `node --import tsx --test tests/server-panel-token-exposure.test.mjs` (rerun) | ✓ 4/4 exit 0 | confirma hipótese `dist/` |

Detalhamento em `TEST-RESULTS.md`.

## 6. Achados

13 itens consolidados em 3 BUG (todos P3/P2 de layout/CI/teste), 4 HYP (1 P0 segurança,
1 P1 release block latência física, 1 P2 cap modulador, 1 P2 worklet clock),
4 GAP (1 P1 Native Track, 1 P2 sessão longa, 1 P2 WebKit, 1 P3 bench
sem teste), 2 DOC (1 P1 gate pendente, 1 P3 engines.node).

Evidência posterior: a sessão de aceite do dono (Worm) em 2026-09-19
(`tasks/rc-surface-v1-stage-acceptance-2026-09-18/findings.md`) levantou 10
achados em hardware real (F-001 a F-010), confirmando que além dos bloqueios
externos há bugs funcionais de software (ex.: recall de snapshots elevando
stutters e salto de vetor XY sem rAF) e ajustes de UI a remediar antes da 1.0.

Detalhamento em `FINDINGS.md`.

## 7. Limitações e bloqueios declarados

1. **Sem hardware físico**: latência microfone→SDK→Receiver, write-ceiling
   real, Native Track e sessão longa no aparelho ficam **not-run**. Roteiro
   reproduzível em `LIVE-ACCEPTANCE.md`.
2. **`engines.node`**: ambiente `v24.19.0` está dentro do contrato
   (`>=24.16.0 <25`); documentado em `DOC-002`.
3. **Cobertura WebKit/Safari iOS**: CI roda apenas Chromium; gestos iOS
   permanecem com cobertura parcial via emulação.
4. **Receiver v2 + UDP residual**: bloqueio externo (operador deve
   substituir Receivers antigos em Sets legados).
5. **Publicação**: push/tag/release/upload permanecem fora do escopo;
   exigem autorização explícita do responsável.

## 8. Decisão go/no-go

**NO-GO para publicação pública.** Justificada por gates contratuais
da própria base, não por achado novo desta investigação. As 10 das 12
portas verdes são robustas; as duas restantes dependem de fatores
externos (operador + upstream SDK): `physical-hardware` (pending) e
`distribution-publication` (blocked).

**GO para próxima etapa interna**: abrir as tarefas listadas em
`REMEDIATION.md` (grupos A, B, C, D). Cada uma com critério de aceite,
regressões cruzadas e gate associado. Revisão independente obrigatória
antes de integrar.

**Lançamento público** só pode ser declarado após:
1. `physical-hardware` → `passed` com rationale assinado.
2. `distribution-publication` → `passed` com rationale referenciando a
   rota SDK.
3. Nova artefato recebe digest de fonte + SHA256; instalado/testado
   exatamente esse artefato.
4. Licenciamento/distribuição resolvidos com evidência.
5. Push/tag/release/upload autorizados explicitamente pelo responsável.

Esta task **não** executa nenhum desses passos.
