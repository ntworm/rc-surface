# Findings — RC Surface 1.0 release audit

Achados separados em quatro classes:

- **BUG**: defeito confirmado no source, reproduzido por teste ou deduzido
  da inspeção.
- **HYP**: hipótese de defeito ainda não reproduzida por teste
  automatizado; precisa de fonte física ou P04 para confirmar.
- **GAP**: lacuna de teste (cobertura ausente para um caminho real).
- **DOC**: divergência entre documentação e comportamento.

Severidade segue a convenção do plano:

- **P0**: perda ou corrupção de dados, acesso indevido, falha grave de
  sessão.
- **P1**: função essencial errada, nota presa, instabilidade.
- **P2**: problema limitado com contorno.
- **P3**: apresentação.

Cada achado traz passos mínimos de reprodução, esperado vs observado, ponto
exato no source (SHA `2544d19`), status de regressão proposta e referência a
logs sem segredos.

---

## BUG-001 — `landing-release.spec` quebra em `pt-BR 320` por overflow horizontal da grade de destaques
- **Severidade**: P2 (apresentação / layout em viewport mínimo 320 px)
- **Confiança**: alta (reproduzido)
- **Arquivo**: `tests/ui/landing-release.spec.mjs:14:38`
- **SHA**: `2544d19`
- **Passos**:
  1. `npm run build:prod`
  2. `npm run test:ui -- --project=chromium tests/ui/landing-release.spec.mjs`
- **Esperado**: `width === 320` e `viewport === 320` em ambos `Desktop Chrome` e `Mobile Chrome Landscape`.
- **Observado**: Em `Desktop Chrome`, `scrollWidth=327` contra `innerWidth=320` (overflow horizontal real de 7 px). O teste identificou os candidatos causadores: `UL.hi-grid`, `LI.hi-cell`, `H3`, `P` (células de destaque em português). O array `overflowing: []` reportou vazio apenas porque a sua consulta se limitava a `h1, h2, .sec > .c, .head, .duo`, não incluindo `hi-grid`/`hi-cell`. Em `Mobile Chrome Landscape`, `viewport=327` e `width=327`.
- **Causa**: Hipótese a confirmar: a geometria de padding, min-width, gap ou quebra de linha do texto traduzido em português dos cards de destaque (`UL.hi-grid` / `LI.hi-cell` em `docs/landing/`) força a largura do documento para 327 px, excedendo o viewport de 320 px. Não se trata de falso positivo de scrollbar nem de artefato de medição.
- **Alcance**: Apresentação da landing page em telas estreitas (320 px) com idioma pt-BR. As demais suítes UI passam (156/158).
- **Regressão proposta**: Diagnosticar a geometria CSS de `UL.hi-grid` e `LI.hi-cell` em `docs/landing/` e corrigir estilos (ex.: box-sizing, flex/grid min-width, word-break ou padding) para garantir que caiba estritamente em `width === 320` no viewport 320, mantendo a asserção rigorosa do teste intacta (sem introduzir tolerâncias como `+16` que mascarariam o overflow). Não editar produto nesta task de auditoria.

## BUG-002 — `benchDeviceParamWrites` estourou limite superior em Windows
- **Severidade**: P3 (teste, não produto)
- **Confiança**: alta
- **Arquivo**: `tests/live-bench-device-param-writes.test.mjs:91:116`
- **SHA**: `2544d19`
- **Passos**: `npm test` (apenas na worktree Windows)
- **Esperado**: `meanMs ∈ [14, 28]`.
- **Observado**: `meanMs = 29.13`.
- **Causa**: `setTimeout`/`setInterval` do Node no Windows apresenta
  jitter maior que em macOS/Linux. Limites foram relaxados em
  `2a616f2`/`1673c2b` para throughput e `2a616f2` para meanMs; o presente
  caso escapou por 1 ms.
- **Alcance**: sintético. O caminho real de produção (`pumpLane` no
  `continuousTargetActuator`) usa `performance.now()` e tem
  `minWriteIntervalMs=20`. P04 físico é que define limites reais.
- **Regressão proposta**: relaxar `meanMs` upper para `32` em Windows, ou
  pular em `process.platform === 'win32'`. A primeira mantém contrato
  útil; a segunda é trabalho de investigação adicional.

## BUG-003 — `server-panel-token-exposure.test.mjs` 404 quando `dist/` ausente
- **Severidade**: P2 (CI gate limpo e execuções pontuais)
- **Confiança**: alta
- **Arquivo**: `tests/server-panel-token-exposure.test.mjs:70:78`, `package.json:14`
- **SHA**: `2544d19`
- **Passos**: rodar `npm test` (ou só `node --import tsx --test tests/server-panel-token-exposure.test.mjs`) em checkout limpo sem `dist/` prévio.
- **Esperado**: `200` com `window.INITIAL_ADMIN_TOKEN` no corpo.
- **Observado**: `404` "not found".
- **Causa**: `serveStaticFile` (`src/server/http.ts:117-181`) resolve arquivos a partir de `__dirname/static`, que em runtime aponta para `dist/static` (`tests/server-panel-token-exposure.test.mjs:14`). Sem `npm run build:prod`, `dist/` não existe; `fsSync.existsSync` falha e tenta `process.cwd()/static`, também ausente. Rerun após build: 4/4 pass.
- **Alcance**: Afeta CI limpo e execuções de teste isoladas. Em `package.json:14`, o script `"ci"` está definido como `"npm test && npm run lint && npm run build:prod && npm run test:ui"`, onde `npm test` roda ANTES de `npm run build:prod`. O build posterior não satisfaz a pré-condição do teste anterior, logo uma execução limpa de CI falha logo na etapa de testes.
- **Regressão proposta**: Desacoplar o teste unitário de servidor da existência de um build prévio de produção. Fornecer fixture estática isolada em `tests/fixtures/` ou mock de arquivo de painel para os testes de token, garantindo que `npm test` passe de forma autônoma sem exigir `dist/` prévio, sem mascarar dependências reais de produção.

## HYP-001 — Latência física microphone→SDK→Receiver não medida
- **Severidade**: P1 (release block, contrato declarado)
- **Confiança**: alta (gap de medição)
- **Arquivo**: `scripts/measure-native-audio-latency.mjs`,
  `scripts/generate-native-latency-fixture.mjs`,
  `internal/AUDIO-AUDIT.md`, `internal/LIVE-WRITE-CEILING-1.0.md`
- **SHA**: `2544d19`
- **Passos**: impossível reproduzir no executor (sem Live físico + mic).
  Roteiro reproduzível em `LIVE-ACCEPTANCE.md`.
- **Esperado**: nenhum valor publicado afirma latência zero; documentação
  promete medição e a bancada está pronta.
- **Observado**: `getActuatorStats` disponível (`continuousTargetActuator.getStats`
  em `src/live/continuous-target-actuator.ts:355`) mas nenhuma captura física
  preenche os slots de `LIVE-WRITE-CEILING-1.0.md` §3.1/3.2/3.3.
- **Causa**: P04 do write-ceiling + PENDING_OWNER_DEFERRED do Native Track.
- **Alcance**: bloqueia `physical-hardware` gate (`internal/RELEASE-GATES-1.0.json`)
  e impede `physical-hardware.status = passed`.
- **Regressão proposta**: tarefa `rc-surface-write-ceiling-2026-09-16` (já
  na fila serial) precisa correr P04 com `Sync` ligada, Automation Arm,
  matriz `single/parallel 2/4/8` × 3 alvos, e gravar
  `test-results/write-ceiling/bench-<alvo>-<modo>.json`.

## HYP-002 — `LFO_SHAPE_MAX_HZ` tabela é fallback não medido
- **Severidade**: P2 (release block, hard cap declarado)
- **Confiança**: alta
- **Arquivo**: `src/live/transport-clock.ts:11`,
  `static/phone-v3/controls.js:21`, `docs/CONTRACTS.md`, CHANGELOG
- **SHA**: `2544d19`
- **Passos**: impossível reproduzir sem bancada. A regra
  `maxHz(shape) = floor(teto_efetivo / minPointsPerCycle(shape))` está
  pronta; `teto_efetivo ≈ 50 escritas/s` é fallback.
- **Esperado**: tabela `sine 4 / triangle 3 / ramps 3 / square 12`
  reflete medição real.
- **Observado**: comentário explícito no source confirma "Fallback aplicado
  2026-09-17: write-ceiling P04 pendente". `tests/contracts-freeze.test.mjs`
  congela os valores atuais e falhará se a tabela mudar.
- **Alcance**: modulador quality (`rc-surface-modulator-quality-2026-09-16`)
  está bloqueada por `rc-surface-write-ceiling-2026-09-16`.
- **Regressão proposta**: idem HYP-001; assim que P04 rodar, regenerar
  tabela e atualizar source + `contracts-freeze.test.mjs` + `CONTRACTS.md`.

## HYP-003 — `audio-processor.js` ancora latência do worklet em
`currentFrame`/`sampleRate` que pode divergir do relógio real
- **Severidade**: P2
- **Confiança**: média
- **Arquivo**: `static/phone-v3/audio-processor.js:159-167`,
  `static/phone-v3/audio-descriptor-worklet.js`
- **SHA**: `2544d19`
- **Passos**: impossível reproduzir deterministicamente sem device
  específico (worklet clock drift é OS/browser dependent).
- **Esperado**: `frameTimeMs` reflete relógio real.
- **Observado**: `frameTimeMs` é derivado de `currentFrame` do
  AudioWorklet, que avança no sample-rate do `AudioContext`. Em
  AudioContext suspenso, `currentFrame` congela e o descriptor descarta o
  frame (`ageMs > 40` ou `ageMs < -20` ou `state !== 'running'`,
  `audio-processor.js:198-202`).
- **Alcance**: telefone real em background pode suspender contexto; descritor
  congela corretamente (intencional), mas mapeamento perde valor.
- **Regressão proposta**: já existe wake-lock
  (`tests/ui/wake-lock.test.mjs`); documentar no USER-GUIDE que AUD em
  background congela por design e que mapeamentos suaves (SMOOTH > 0)
  atenuam.

## HYP-004 — `regressão ONG/OGL` se Receiver UDP antigo permanecer carregado
- **Severidade**: P0 (segurança)
- **Confiança**: alta (documentada em SECURITY e TESTER-GUIDE)
- **Arquivo**: `docs/SECURITY.md`, `internal/TESTER-GUIDE.md`,
  `src/live/midi-receiver.ts:38-58`
- **SHA**: `2544d19`
- **Passos**: impossível reproduzir no executor (sem Live).
- **Esperado**: Receiver antigo UDP é recusado na interface.
- **Observado**: `findMidiReceiver` rejeita explicitamente via
  `receiver_ambiguous`/`receiver_upgrade_required`. **A proteção está
  ativa**; o risco é o usuário manter Receivers UDP antigos no Set
  carregado de versões anteriores. A `Receiver v2.1.1` trial registrada em
  CHANGELOG ajusta o `shortName` para alinhar a detecção.
- **Alcance**: operador; depende da migração no Set.
- **Regressão proposta**: documentação em `internal/TESTER-GUIDE.md` já
  exige substituição explícita; replicar aviso no `docs/SECURITY.md` no
  procedimento de upgrade.

## GAP-001 — Sem teste automatizado para sessão longa 20–30 min no aparelho
- **Severidade**: P2
- **Confiança**: alta
- **Arquivo**: ausência — não há script equivalente em `tests/` ou
  `scripts/`.
- **SHA**: `2544d19`
- **Passos**: roteiro físico em `LIVE-ACCEPTANCE.md`.
- **Causa**: natureza sequencial e dependente de operador; CI não roda
  bateria real.
- **Alcance**: gaps em fadiga de CPU, throttling de timer, drenagem de
  bateria, NetworkInformation API.
- **Regressão proposta**: roteiro de bancada + script Playwright
  long-running (15–30 min, com screenshots a cada 5 min) — não é escopo
  desta task.

## GAP-002 — Sem teste para Native Track (audio path Max)
- **Severidade**: P1 (release)
- **Confiança**: alta
- **Arquivo**: `scripts/native-audio-*.mjs`,
  `internal/NATIVE-AUDIO-VALIDATION.md`
- **SHA**: `2544d19`
- **Passos**: impossível no executor.
- **Causa**: `PENDING_OWNER_DEFERRED` por decisão do responsável.
- **Alcance**: bloqueia fechamento do gate `physical-hardware`.
- **Regressão proposta**: tarefa dedicada quando o responsável retomar;
  roteiro preparado, código de bancada existe.

## GAP-003 — Sem teste de macOS / Safari
- **Severidade**: P2
- **Confiança**: alta
- **Arquivo**: `playwright.config.*` (Chromium projects only)
- **SHA**: `2544d19`
- **Passos**: exige runner macOS + Playwright com project WebKit.
- **Causa**: ambiente Windows do executor; CI atual roda apenas Chromium.
- **Alcance**: cobertura parcial de Safari iOS (gestos, foco, gate).
- **Regressão proposta**: configurar project `webkit` no `playwright.config`
  e adicionar job em macOS.

## GAP-004 — `bench-ws-compression.mjs` sem teste de cobertura
- **Severidade**: P3
- **Confiança**: alta
- **Arquivo**: `scripts/bench-ws-compression.mjs`
- **SHA**: `2544d19`
- **Passos**: rodar `node scripts/bench-ws-compression.mjs` direto.
- **Causa**: bench descritivo, sem asserção.
- **Alcance**: probes de compressão de tráfego WS — não há decisão de
  produto atrelada.
- **Regressão proposta**: irrelevante para release; remover ou documentar
  como experimento.

## DOC-001 — `RELEASE-GATES-1.0.json` traz `physical-hardware` `pending` e
`distribution-publication` `blocked`
- **Severidade**: P1 (release)
- **Confiança**: alta (documental)
- **Arquivo**: `internal/RELEASE-GATES-1.0.json`
- **SHA**: `2544d19`
- **Passos**: `Read-Content internal/RELEASE-GATES-1.0.json`.
- **Observado**: `physical-hardware.stage=local, status=pending` (P09);
  `distribution-publication.stage=publish, status=blocked` (P10). Demais 10
  gates `passed`. `check-release-gates.mjs --stage publish` retorna exit 4
  enquanto os dois gates não forem `passed`.
- **Causa**: contrato explícito do runbook — `physical-hardware` exige
  bancada do operador; `distribution-publication` exige rota de SDK
  upstream.
- **Alcance**: impede `physical-hardware` e `distribution-publication` de
  virarem `passed` por código. Aprovação e publicação dependem de decisão
  humana.
- **Regressão proposta**: nenhuma alteração de código. Atualizar rationale
  com referência ao relatório desta investigação quando o responsável
  decidir.

## DOC-002 — `engines.node` `>=24.16.0 <25` divergente do ambiente `v24.19.0`
- **Severidade**: P3
- **Confiança**: alta
- **Arquivo**: `package.json:8`
- **SHA**: `2544d19`
- **Passos**: `node --version`.
- **Observado**: ambiente `v24.19.0` está dentro do range
  (`>=24.16.0 <25`). Não é divergência real, apenas registro.
- **Regressão proposta**: nenhuma.

---

## Evidência posterior: Sessão de aceite do dono (2026-09-19)

Em sessão de aceite realizada pelo dono (Worm) em 2026-09-19 (20:47–20:55 -0300) registrada em `tasks/rc-surface-v1-stage-acceptance-2026-09-18/findings.md`, foram levantados os achados `F-001` a `F-010` em hardware real (celular Android + Live 12 Beta). Esses achados comprovam que nem todos os impedimentos decorrem de bloqueios externos/upstream: há bugs funcionais de software (como `F-003`: recall de snapshots elevando stutters para 50%; e `F-004`: stutter e salto no arrasto do Vetor XY por falta de rAF) e inconsistências visuais/temáticas (`F-001`, `F-007`) que dependem de remediação local de código antes da versão 1.0 final.

---

## Estatísticas

- 13 achados consolidados:
  - 3 BUG (BUG-001 layout/overflow landing pt-BR 320 P2; BUG-002 jitter Windows meanMs P3; BUG-003 dependência dist/ pré-build no CI P2).
  - 4 HYP (HYP-001 latência física mic→SDK→Receiver P1; HYP-002 tabela LFO_SHAPE_MAX_HZ fallback P2; HYP-003 worklet clock drift P2; HYP-004 Receiver UDP residual no Set P0).
  - 4 GAP (GAP-001 sessão longa 20-30 min P2; GAP-002 Native Track P1; GAP-003 WebKit/Safari iOS P2; GAP-004 bench-ws-compression sem testes P3).
  - 2 DOC (DOC-001 gates pendentes no JSON P1; DOC-002 engines.node P3).
- Bloqueios externos contratuais confirmados nos gates de release (`physical-hardware` e `distribution-publication`), combinados com necessidade de correções de software locais documentadas em `REMEDIATION.md` e corroboradas pela sessão de aceite do dono.
- Remediação proposta em `REMEDIATION.md`.
