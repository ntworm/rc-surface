# PERFORMANCE-BASELINE-1.0 — RC Surface

Build `1.0.0`. Envelope sintético de performance da candidata 1.0. Aceitação física (hardware) está fora do escopo deste baseline e vive em `internal/TESTER-GUIDE.md` e no gate `physical-hardware` (P09, status `pending` em `internal/RELEASE-GATES-1.0.json`).

## Harness

- `tests/perf-bench.test.mjs` (4 casos): cenários de referência cobrindo LFO latest delivery, stutter depth coalesce, server control frame e modulator policy parity.
- `tests/perf-headroom-bench.test.mjs` (4 casos): headroom sob carga nominal; envelope de capacidade + sustentado ~300/s.
- `tests/lfo-latest-delivery.test.mjs`: LFO latest-value delivery em alta taxa + cenários de jitter.
- `tests/server-control-frame.test.mjs`: throughput de control-frame server-side.
- `tests/server-ws-stress.test.mjs`: envelope de stress WebSocket.
- `docs/AUDIO-AUDIT.md`, `docs/AUDIO-AUDIT.pt-BR.md`: critérios de aceitação de áudio e semântica do envelope.

Stress harness reusado em `scripts/stress/` (`admin-observer.mjs`, `fake-phone-headless.mjs`) para geração de carga sintética.

## Semântica do envelope

O envelope sintético é **separado da medição física**. Os números reportados aqui vêm de execuções headless na worktree (Node v24.19.0, Playwright Chromium `1234`). Eles **não** estabelecem performance física na máquina do responsável; esse gate (`physical-hardware`) fica intencionalmente `pending` até que aceitação manual rode.

## Resultados na 1.0.0

- `tests/perf-bench.test.mjs`: 4/4 verde.
- `tests/perf-headroom-bench.test.mjs`: 4/4 verde.
- `tests/lfo-latest-delivery.test.mjs`: verde na 1.0.0.
- `tests/server-control-frame.test.mjs`: verde na 1.0.0.
- `tests/server-ws-stress.test.mjs`: verde na 1.0.0.

Logs detalhados: `test-results/p06-perf-*.log` quando gerados; reprodução do baseline no re-run de `verify-release.mjs` (`test-results/verify-release-ci.log`).

## Fora do escopo deste baseline

- Trilha Native Track (adiada — entradas históricas em `internal/DECISIONS.md`; não faz parte do envelope da 1.0).
- Formas Max LFO canceladas (não fazem parte da 1.0).
- Hardware físico (gate `physical-hardware`).
- CI hospedada (gate distinto em `internal/RELEASE-GATES-1.0.json`).
