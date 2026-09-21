# Remediation queue — RC Surface 1.0 release audit

Fila priorizada de correções para conversão em tarefas cirúrgicas. **Esta
investigação não corrige produto**: ela abre a fila com patches mínimos,
regressões exatas e critério de aceite. Cada item tem dependências, gate
afetado e evidência esperada. Cada item precisa de revisão independente
(`coder`) e `task verify` antes de integração.

## Estado em 2026-09-21 (task `rc-surface-release-prep-2026-09-21`)

| Item | Estado | Evidência |
| --- | --- | --- |
| A1 write-ceiling P04 | pendente (bancada do responsável) | `internal/LIVE-WRITE-CEILING-1.0.md` §3 |
| A2 rota do SDK | feito — rota 1 + CI via repositório privado | `internal/DISTRIBUTION-REVIEW-1.0.md` §6; `vendor/README.md`; `scripts/check-vendor-sdk.mjs` |
| A3 Receiver v2 residual | pendente (Set do responsável) | — |
| B1 landing pt-BR 320 | feito em `9eb3f51` | `tests/ui/landing-release.spec.mjs` 4/4 |
| B2 bench meanMs | sem mudança; passou em 2 execuções de 2026-09-21 | `npm test` |
| B3 panel-token sem `dist/` | feito — `servePanelHtml` usa o mesmo fallback `static/` de `serveStaticFile` | `src/server/http.ts`; teste vermelho sem `dist/` na base, verde após |
| C1–C3, D1 | sem mudança | — |
| D2 publicação | continua exigindo ordem explícita do responsável | política Git §3 |

Convenção de severidade: P0/P1/P2/P3 (mesma do `FINDINGS.md`). Cada grupo
lista arquivos/funções, reprodução, teste que falha antes, patch mínimo
proposto, regressão de vizinhança/cruzada, dependências e gate afetado.

---

## Grupo A — Release-block, gates físicos/de public

### A1 — Rodar P04 do write-ceiling (bloqueia `physical-hardware`)
- **Severidade**: P1 (gate `physical-hardware`)
- **Arquivos**: `scripts/bench-live-write-rate.mjs`,
  `internal/LIVE-WRITE-CEILING-1.0.md`,
  `src/live/continuous-target-actuator.ts` (`getStats`),
  `src/live/transport-clock.ts` (`LFO_SHAPE_MAX_HZ`).
- **Reprodução**: impossível sem bancada.
- **Teste que falha antes**: `tests/live-bench-device-param-writes.test.mjs`
  mostra `meanMs=29.13` (jitter Windows aceito); sem P04 real, tabela
  `LFO_SHAPE_MAX_HZ` é fallback.
- **Patch mínimo proposto**: nova task
  `rc-surface-write-ceiling-physical-2026-09-XX` clonando
  `rc-surface-write-ceiling-2026-09-16`; rodar matriz 12 células
  (3 alvos × 4 modos) + 2 Automation Arm + 1 LFO real. Atualizar
  `LIVE-WRITE-CEILING-1.0.md` §3 com JSON + prints.
- **Regressão cruzada**: regenerar `LFO_SHAPE_MAX_HZ` por
  `maxHz(shape) = floor(teto_efetivo / minPointsPerCycle(shape))`;
  atualizar `src/live/transport-clock.ts:11`,
  `static/phone-v3/controls.js:21`, `docs/CONTRACTS.md`,
  `tests/contracts-freeze.test.mjs`, CHANGELOG.
- **Dependências**: operador + Live 12.4.5 + SDK 1.0.0-beta.0 + AppData
  descartável.
- **Gate afetado**: `physical-hardware` (P09) → `passed` quando
  `check-release-gates.mjs --stage publish` aceita.
- **Owner proposto**: responsável + revisão `coder`.

### A2 — Habilitar rota de distribuição do SDK (bloqueia `distribution-publication`)
- **Severidade**: P1 (gate `distribution-publication`)
- **Arquivos**: `internal/RELEASE-GATES-1.0.json`,
  `internal/DISTRIBUTION-REVIEW-1.0.md`,
  `internal/VERIFY-RELEASE-CONSTRAINT-1.0.md`,
  `vendor/ableton-extensions-sdk-1.0.0-beta.0.tgz`,
  `package.json` dependencies.
- **Reprodução**: impossível sem rota upstream do SDK.
- **Teste que falha antes**: nenhum automatizado; gate é decisão humana.
- **Patch mínimo proposto**: nova task
  `rc-surface-sdk-route-2026-09-XX` com passos: (a) reativar árvore
  vendor; (b) `npm ci` + `npm run build:prod`; (c) rodar
  `scripts/verify-release.mjs`; (d) atualizar `RELEASE-GATES-1.0.json`
  `distribution-publication.status=passed` com rationale referenciando a
  rota SDK; (e) `scripts/check-release-gates.mjs --stage publish`.
- **Regressão cruzada**: SDK permanece tree-shaken fora do `.ablx` em
  qualquer cenário intermediário; sem leak no ZIP.
- **Dependências**: upstream (`@ableton-extensions/sdk`).
- **Gate afetado**: `distribution-publication` (P10).
- **Owner proposto**: responsável.

### A3 — Receiver v2 UDP residual (HYP-004)
- **Severidade**: P0 (segurança)
- **Arquivos**: `docs/SECURITY.md`,
  `internal/TESTER-GUIDE.md`, `src/live/midi-receiver.ts`.
- **Reprodução**: carregar Set legado com `RC-Midi-Receiver.amxd` UDP
  antigo; verificar listener UDP 9000 no host.
- **Teste que falha antes**: nenhum automatizado; `findMidiReceiver`
  recusa no nível do SDK, mas o device antigo permanece em runtime.
- **Patch mínimo proposto**: nova task
  `rc-surface-receiver-v2-migration-2026-09-XX`; roteiro: (a) backup do
  Set; (b) substituir todas as instâncias antigas por Receiver v2; (c)
  documentar em `docs/SECURITY.md` o procedimento de upgrade com captura
  de tela do Live mostrando ausência do listener UDP.
- **Regressão cruzada**: smoke test MIDI em duas tracks distintas, OFF no
  release, save/reopen sem nota espontânea.
- **Dependências**: operador + Set pessoal descartável.
- **Gate afetado**: nenhum direto; pré-requisito do grupo A.
- **Owner proposto**: responsável + revisão `coder`.

---

## Grupo B — Higiene de testes/CI

### B1 — `landing-release.spec` overflow horizontal da grade de destaques em pt-BR 320
- **Severidade**: P2
- **Arquivos**: `docs/landing/index.html`, `docs/landing/landing.css`, `tests/ui/landing-release.spec.mjs:14:38`.
- **Reprodução**: `npm run test:ui -- tests/ui/landing-release.spec.mjs`.
- **Patch mínimo proposto**: diagnosticar e ajustar a geometria CSS de `UL.hi-grid` e `LI.hi-cell` em `docs/landing/` (ex.: regras de flex/grid min-width, padding lateral ou word-break nos textos em português) para garantir contenção estrita em `width === 320` no viewport de 320 px. Manter o teste rigoroso (`width: 320, viewport: 320`), sem relaxar asserções com tolerâncias artificiais (+16 px) que mascarariam o overflow.
- **Regressão cruzada**: rodar `test:ui` completo em Desktop Chrome e Mobile Chrome Landscape.
- **Owner**: `coder`.

### B2 — `live-bench-device-param-writes` meanMs upper
- **Severidade**: P3
- **Arquivos**: `tests/live-bench-device-param-writes.test.mjs`.
- **Patch mínimo proposto**: relaxar para `meanMs ≤ 32` em Windows ou
  pular asserção em `process.platform === 'win32'`.
- **Regressão cruzada**: bench sintético; impacto zero em produção.
- **Owner**: `coder`.

### B3 — `server-panel-token-exposure` desacoplamento de `dist/` prévio no CI
- **Severidade**: P2
- **Arquivos**: `tests/server-panel-token-exposure.test.mjs`, `package.json:14`.
- **Reprodução**: rodar `npm test` em clone limpo sem rodar `npm run build:prod` antes.
- **Patch mínimo proposto**: desacoplar o teste unitário de servidor da existência do artefato de produção `dist/static/panel/index.html`. Fornecer fixture estática isolada em diretório de testes (`tests/fixtures/`) ou mock para o teste de injeção de token, permitindo que a etapa `npm test` (que roda antes de `build:prod` no `npm run ci`) passe de forma limpa e determinística.
- **Regressão cruzada**: `npm test` limpo e `npm run ci` sem `dist/` inicial.
- **Owner**: `coder`.

---

## Grupo C — Cobertura adicional (GAP)

### C1 — WebKit project (Safari iOS)
- **Severidade**: P2
- **Patch mínimo proposto**: configurar project WebKit em
  `playwright.config.*`; adicionar job em runner macOS no CI.
- **Regressão cruzada**: já passa em Chromium; WebKit cobre gestos iOS,
  gate de microfone, foco.

### C2 — Sessão longa automatizada (20–30 min)
- **Severidade**: P2
- **Patch mínimo proposto**: script Playwright long-running; screenshots
  a cada 5 min; relatório de CPU/bateria/throttling.

### C3 — Native Track (`PENDING_OWNER_DEFERRED`)
- **Severidade**: P1
- **Patch mínimo proposto**: nova task dedicada ao retomar a bancada
  `native-audio-reference.mjs`; documentar resultado mesmo quando
  diferido.

---

## Grupo D — Documentação / Divulgação

### D1 — Atualizar `RELEASE-GATES-1.0.json` rationale
- **Severidade**: P1
- **Patch mínimo proposto**: quando gates A1/A2 passarem, atualizar
  rationale com referência ao relatório desta investigação (`internal/
  release-audit-2026-09-19/REPORT.md`) e ao `LIVE-ACCEPTANCE.md` assinado
  pelo operador.

### D2 — Publicação fora do escopo deste runbook
- **Severidade**: P0 (procedimento)
- **Patch mínimo proposto**: nada técnico; compromisso processual:
  push/tag/release/upload exigem autorização explícita do responsável,
  registrada antes da execução.

---

## Procedência

- **Origem da fila**: `internal/release-audit-2026-09-19/FINDINGS.md`
  (BUG-001/002/003, HYP-001/002/003/004, GAP-001/002/003/004,
  DOC-001/002), `internal/RELEASE-GATES-1.0.json`,
  `internal/LAUNCH-RUNBOOK-1.0.md`.
- **Não duplica** o trabalho de `rc-surface-audio-loudness-2026-09-16`,
  `rc-surface-write-ceiling-2026-09-16`,
  `rc-surface-modulator-quality-2026-09-16`,
  `rc-surface-config-mode-2026-09-16` (fila serial existente).
- **Não reinicia** auditoria parcial já fechada (r3 reviewed, r12
  stutter, r11 shape limits, calibration r13) — todas aquelas conclusões
  continuam válidas e são refletidas em
  `internal/RELEASE-CANDIDATE-CHECKLIST.pt-BR.md` §Atualização.
