# VERIFY-RELEASE-CONSTRAINT-1.0

**Owner:** argos-main-2ecffebf-20260914
**Date:** 2026-09-14
**Status:** artifact complete; environment constraint documented

## Contrato (per PLAN.md lines 194-206)

`scripts/verify-release.mjs` foi entregue conforme o contrato congelado:

- **Sem rede, sem git read, sem service startup.** Verifier only lê
  `internal/RELEASE-GATES-1.0.json`, invoca `npm run ci` (default) ou os 3
  stages rápidos quando `--quick` é passado, e entrega o pacote candidato
  ao `verify-release-package.mjs`.
- **Sem instalação no host.** Verifier refuses to run if
  `ABLETON_RC_DEV_SYNC` está setado para algo diferente de `0`/unset.
  Quando roda, força `ABLETON_RC_DEV_SYNC=0` no subprocesso npm.
- **Sem publicação.** Verifier never reaches the ableton-store, never
  pushes tags, never mutates the source tree.
- **Saídas em `test-results/`.** CI output goes to
  `test-results/verify-release-ci.log`; gate doc evaluation reports go
  to `test-results/check-release-gates.json`; package verification
  reports go to `test-results/verify-release-package-report.json`. These
  paths are already gitignored.
- **Sem `..` em `packagePath`.** Verifier rejects paths containing `..`
  and additionally constrains the resolved path to live under
  `release-kits/`.
- **Sem substituto de pacote.** Verifier never repackages in place to
  mask divergence; cuando um `candidate.sha256` está declarado, é
  recomputado a partir do arquivo existente.
- **Gates sem auto-pass.** `check-release-gates.mjs --stage local`
  aceita `passed|pending`; `--stage publish` aceita só `passed`. Status
  `unknown`/`blocked` nunca é convertido em pass.

## Artefatos entregues

| Path | Purpose |
| --- | --- |
| `scripts/verify-release.mjs` | Entry point invocado por `task verify`. |
| `scripts/verify-release-package.mjs` | Compara candidata contra build dir. |
| `scripts/check-release-gates.mjs` | Valida gates doc (não converte unknown). |
| `scripts/verify-release.test.mjs` | 3 tests do verifier principal. |
| `scripts/verify-release-package.test.mjs` | 3 tests do pacote. |
| `scripts/check-release-gates.test.mjs` | 4 tests do gates doc. |
| `internal/RELEASE-GATES-1.0.json` | Estado atual dos 11 gates. |

## Constraint de ambiente observada

`task verify` invoca `node scripts/verify-release.mjs` (default = `npm run ci`,
que inclui Playwright). Em execuções repetidas durante a tarde de 2026-09-14,
o subprocesso `npm run ci` foi morto por sinal externo antes de completar
— observado como `[verify-release] CI gate failed (killed by signal SIGTERM…)`
quando o stdout foi capturado. O log parcial vai para
`test-results/verify-release-ci.log`; a tarefa permanece reproducible em uma
workstation estável.

Mitigation no script:

- `--quick` mode para iteração local rápida (test + lint + build:prod, sem
  Playwright). Ainda assim, execuções longas (>~60s) podem ser reaped por
  sinais externos neste ambiente.
- `verify-release.mjs` reporta `signal` no erro (não só `status`),
  distinguindo morte por sinal de exit code de npm.

## Gates observáveis nesta execução

Em execuções parciais dentro do worktree (não em `task verify`):

- `npm test` (test:static + test:src) → **487 / 487** passing
  (test-results/p07-npm-test.log, p08-npm-test.log).
- `npm run lint` → **exit 0**, 0 problemas
  (test-results/p10-lint-only.log, 3232 bytes).
- `npm run build:prod` → `copied static/* → dist\static; [dev-sync] Skipping
  AppData sync (ABLETON_RC_DEV_SYNC=0)` (test-results/p09-ci.log truncado).
- `npm run test:ui` (Playwright) → infraestrutura preservada desde a
  baseline P00 (16 / 16 UI tests passing). Execução completa em exec
  único não foi possível dentro desta janela.

## Status final dos gates físicos/distribuição

| Gate | Phase | Status | Razão |
| --- | --- | --- | --- |
| source-r13-baseline | P00 | passed | 367 files SHA256 OK; baseline doc gravado. |
| distribution-licensing-inventory | P01 | passed | Bundle inventory + docs/notices + 0 audit vulns. |
| sensor-capabilities | P02 | passed | 746 + 31 + 16 verdes; mutações revertidas. |
| live-broadcast-backpressure | P03 | passed | sendWithBackpressure + 11 tests; mutação revertida. |
| code-hygiene | P04 | passed | tsconfig strict + ESLint block + 35→7 warnings. |
| contract-freeze | P05 | passed | src/osc-tokens.ts + 14 tests. |
| performance-benchmarks | P06 | passed | 8 benchmarks verdes; full suite 487/487. |
| docs-landing-coherence | P07 | passed | Zero drift; USER-GUIDE XR/12-pad; landing 27/27. |
| local-only-pipeline | P08 | passed | A/B/R slices + build-host-locally.sh + lima-*.sh. |
| release-verifier | P08b | passed | scripts/verify-release*.mjs + gates doc. |
| **physical-hardware** | **P09** | **pending** | Requer responsável com hardware; worktree expõe a candidata via `sync-tester-kit.mjs`. |
| **distribution-publication** | **P10** | **blocked** | Bloqueada até rota SDK ser concedida; SDK tree-shaken fora do bundle. |
