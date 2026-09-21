# LAUNCH-RUNBOOK-1.0 — RC Surface

Roteiro de lançamento da 1.0. **Não** é equivalente a "lançamento executado"; os gates físicos e de publicação ficam `pending`/`blocked` por contrato até que o responsável abra a rota.

## Estado atual (consultar `internal/RELEASE-GATES-1.0.json`)

| Gate | Fase | Status | Dono |
|---|---|---|---|
| `physical-hardware` | P09 | `passed` (2026-09-21, aceite do responsável) | `responsible-party` |
| `distribution-publication` | P10 | `passed` (2026-09-21, rota 1) | `responsible-party` |

`scripts/check-release-gates.mjs --stage local` aceita `passed|pending|blocked`; `--stage publish` aceita apenas `passed`. Em 2026-09-21 os 12 gates estão `passed` e `--stage publish` retorna exit `0`; a publicação em si continua exigindo a ordem explícita do responsável.

## Etapas para o responsável (P09 → P10)

### Migração de dados de Ableton-RC-Surface (1.0.0)

Antes de instalar o `.ablx` renomeado, se você testou candidatos anteriores que
ainda usavam o nome antigo, rode o migrador do kit para copiar seus dados
(`worm.ableton-rc-surface`) para a nova pasta (`worm.rc-surface`) sem
sobrescrever nada:

- Windows: clique duplo em `Migrate-RC-Surface-Data.cmd` (ou rode `Migrate-RC-Surface-Data.ps1`)
- macOS: clique duplo em `Migrate RC Surface Data.command`

O script nunca move nem apaga a origem. Se a pasta de origem não existir
(instalação nova), sai com mensagem e exit 0.

### P09 — Aceitação física

1. Sincronizar kit local: `node scripts/sync-tester-kit.mjs --only=AB` (fatia padrão A+B, não escreve AppData). A fatia R (`--only=R`) só executa com `ABLETON_RC_DEV_SYNC` apontando para a pasta de Extensions do operador.
2. Carregar `release-kits/RC-Surface-1.0.0-test/RC-Surface-1.0.0.ablx` no Live de teste.
3. Seguir `internal/TESTER-GUIDE.md` (cenários v2 + midi-receiver-arming + live-midi-trigger + sensor-capabilities + audio-spectral-workspace + surface + workspace-scaling + modulation phase continuity).
4. Conferir `internal/RELEASE-CANDIDATE-CHECKLIST.pt-BR.md` em paralelo.
5. Resultado: alterar `physical-hardware.status` em `internal/RELEASE-GATES-1.0.json` para `passed` (com rationale assinado) ou `blocked` (com motivo da reprovação física), e rodar `node scripts/check-release-gates.mjs --stage publish --report test-results/release-gates-publish.json`.

### P10 — Distribuição e publicação

1. Garantir que `physical-hardware` está `passed`.
2. Abrir a rota de distribuição do SDK `@ableton-extensions/sdk` (1.0.0-beta.0) com o upstream. O SDK continua tree-shaken fora do `.ablx` até essa rota existir (ver `internal/VERIFY-RELEASE-CONSTRAINT-1.0.md`).
3. Feito em 2026-09-21 (rota 1, `internal/DISTRIBUTION-REVIEW-1.0.md` §6): tarballs fora do rastreio, `npm run check:vendor` verifica as cópias locais, gate `distribution-publication` = `passed`. CI hospedada: o repositório privado `ntworm/rc-surface-vendor` (dois tarballs na raiz) existe desde 2026-09-21 com uma deploy key somente-leitura; o segredo `VENDOR_SDK_KEY` no repositório público guarda a chave privada. `ci.yml`/`release.yml` fazem checkout dele antes do `npm ci`; o pacote de release também pode ser gerado localmente com `npm run build:prod-ablx`.
4. Publicação fora do escopo deste runbook: exige autorização explícita adicional do responsável (ver `internal/RELEASE-BASELINE-1.0.md` e `internal/VERIFY-RELEASE-CONSTRAINT-1.0.md`).

## Invariantes

- `ABLETON_RC_DEV_SYNC=0` (ou vazio) em qualquer execução automatizada; a fatia R é opt-in.
- Sem `git push`/`tag`/`merge`/publicação automática; nenhum commit antes da revisão independente.
- Cabeçalho do `.ablx` segue tree-shaking do SDK; nada na candidata vaza o tarball do SDK.

## Roteiro não equivalente a lançamento

A entrega local (worktree `rc-surface-v1-launch-2026-09-14`) **não** é o lançamento. Lançamento exige: P09 física passada + P10 distribuição passada + autorização explícita adicional fora deste contrato. Ver `internal/RELEASE-BASELINE-1.0.md` para o contexto histórico da fonte r13 e o que foi preservado, e `internal/RELEASE-GATES-1.0.json` para o estado vivo dos gates.
