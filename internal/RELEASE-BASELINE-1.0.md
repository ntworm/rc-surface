# RELEASE-BASELINE-1.0 — RC Surface

Candidata 1.0 consolidada a partir do estado r13 (frente `feat/audio-descriptors-v1`).

- **Worktree de execução:** `.worktrees/rc-surface-v1-launch-2026-09-14`
- **Branch:** `plan/rc-surface-v1-launch-2026-09-14`
- **Base:** `701e2eff2dd68f12f98b8b10e82c81498c9ebfb3` (HEAD permanece nesta base; nenhum commit nesta execução)
- **Task:** `rc-surface-v1-launch-consolidation-2026-09-14` · **Owner:** `argos-main-2ecffebf-20260914`
- **Data da integração:** 2026-09-14 (UTC-3)

## P00 — Consolidação do estado r13

### 1. Conferência da fonte (leitura)

- Fonte r13: `ableton-rc-surface/.worktrees/audio-descriptors-v1`, HEAD `701e2ef`, branch `feat/audio-descriptors-v1`.
- `git status --porcelain` atual da fonte comparado ao `status` capturado em `SOURCE-INVENTORY.json` (`captured_at` 2026-09-14T06:41:34Z): **101/101 entradas idênticas, zero diferenças** (`onlyOld=[]`, `onlyNow=[]`).
- Inventário: 367 caminhos (359 existentes, 8 ausentes por exclusão deliberada).

### 2. Revisão do diff pendente

- Patch binária gerada com `git diff --binary HEAD` na fonte: `source-overlay.patch`, 451.063 bytes,
  SHA256 `FD78A506A0B3C00A7C0217573CC11F6517B53CD43AE4F97BCE2BF1F63AA62E2E`.
- Conteúdo revisado: produto, testes, docs e exclusões antigas deliberadas (mock-server, sim-phone,
  test-admin-broadcast, test-commands, udp-midi, `.amxd.original`, test-server.ts) dentro do escopo.
  Scan por segredos/tokens na patch: **nenhum achado**.
- 23 arquivos untracked enumerados copiados individualmente com validação de caminho
  (sem absolutos/`..`) e SHA256 conferido após cópia: **23/23 ok**.

### 3. Aplicação na worktree preparada

- `git apply --check` → ok. `git apply` → ok.
- Status resultante: 78 entradas tracked (M/D) + 23 untracked = 101 caminhos.

### 4. Comparação contra o inventário

- Verificação de todos os 367 caminhos do inventário (exists/SHA256/ausências, incluindo AMXDs):
  **367/367 conforme**. Digest do inventário registrado no plano (`037ea702…`): metadado de
  rastreabilidade; a conferência operacional é por SHA256 individual, executada acima.
- Reconciliação de line endings: 3 arquivos `tests/ui/{audio-detectors,audio-spectral-workspace,surface}.spec.mjs`
  existiam na fonte com bytes CRLF (index LF, worktree CRLF). Copiados byte-a-byte da fonte para
  garantir "mesmos bytes da fonte"; o conteúdo de diff é vazio (git normaliza CRLF→LF) e o status
  permanece limpo após refresh do stat.

### 5. Alterações alheias (main e landing)

| Fonte | Arquivo | Classificação | Diff resumido |
|---|---|---|---|
| main (`16b12df`, dirty) | `docs/SECURITY.pt-BR.md` | **Editorial incompatível — não incorporar** | Edição suja do main introduz typo `RC-Surfce` e linha `a` solta; conteúdo do main é o texto antigo da era UDP 9000. A candidata r13 já traz o texto Receiver v2, nome correto `RC-Surface` e firewall condicionado a devices antigos. |
| landing (`f38c8b9`, dirty) | `docs/index.html` | **Editorial incompatível — não restaurar conteúdo funcional antigo** | Landing antiga afirma MIX 6+6 ("six knobs, six faders"), "Follow Detected Note", seis abas e diagrama OSC/UDP 11000/11001. Candidata r13 tem MIX 8+8, 12 descritores, sem Follow, Receiver v2 sem UDP. O código da frente ativa prevalece. |
| landing (`f38c8b9`, dirty) | `docs/site-i18n.js` | **Editorial incompatível — intenção visual pendente** | Mesmas afirmações antigas nos textos EN/PT-BR. Intenção visual (diagramas/layout) não equivalente ao estado funcional r13: integração futura de branches exige decisão do responsável; nada foi restaurado. |

### 6. Baseline de execução

- `npm ci` com tarballs locais de `vendor/` (SDK/CLI `1.0.0-beta.0`) → ver seção 7.
- Node `v24.19.0` (requisito `>=24.16.0 <25`).
- Baseline histórica da auditoria (referência, não substituto da lista de testes): 730 static + 459 host + 144 UI.

### 7. Resultados na candidata

- `npm ci`: ok (224 pacotes, tarballs locais `vendor/`). `npm audit` reportou 1 vulnerabilidade high
  em `glob@10.5.0` (transitiva); tratada em P01.
- `npm test`: ok na re-execução — **730 static + 459 host, 0 falhas**. Primeira execução teve 1 falha
  transitória em `server-panel-token-exposure` (404 no panel); diagnosticada: passa isolado e na
  re-execução completa; porta `16124` é exclusiva do arquivo — inconsistência transitória de porta
  na primeira corrida paralela. Registrada, não ocultada.
- `npm run lint`: ok (eslint src/static/tests/docs + `tsc --noEmit`).
- `npm run ci` (DEV_SYNC=0): **ok — 730 static + 459 host + 144 UI (Playwright, 1.7min), 0 falhas.**
  Baseline histórica (730+459+144) reproduzida na candidata.

## Preservação

- Fonte r13, main e landing: somente leitura nesta execução; nenhuma escrita.
- `ABLETON_RC_DEV_SYNC=0` mantido; nenhuma instalação no Live, nenhuma alteração de Set/firewall.
- Nenhum commit, merge, push, tag ou release nesta execução.
