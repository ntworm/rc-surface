# Live acceptance — RC Surface 1.0 release audit

Roteiro reproduzível para a bancada física do operador (P04/P09 do runbook).
Nenhum item desta lista pode ser declarado **passed** sem captura física no
Live 12.4.5 Suite (Beta) com Extensions SDK 1.0.0-beta.0 instalado em
`node_modules/@ableton-extensions/sdk` (vendorizado). A bancada foi
desenhada, instrumentada e está pronta para preencher; a captura é a única
etapa que falta, e ela exige o aparelho real do responsável.

## Identificação

- Máquina: (a preencher)
- OS / build: Windows 11 — confirmar build (P04/P09)
- Ableton Live: 12.4.5+ Suite (Beta)
- Extensions SDK: `1.0.0-beta.0` em `node_modules/@ableton-extensions/sdk`
- Node: `v24.16.x` (worktree)
- Worktree: `rc-surface-release-investigation-2026-09-19` @ `2544d19`
- Branch: `plan/rc-surface-release-investigation-2026-09-19`
- Kit local: `release-kits/RC-Surface-1.0.0-test/RC-Surface-1.0.0.ablx`
- Comandos do bench: `node scripts/bench-live-write-rate.mjs`
- BPM do Set: 120 (4/4)
- ABLETON_RC_DEV_SYNC=0 (sempre)

## Princípios

- Cada passo termina em **passed / failed / blocked / not-run**, com
  evidência anexada (log, print, JSON).
- Captura de áudio exige **referência + resposta no mesmo relógio**;
  ouvir reação é smoke test, não medição.
- Não comparar `samples` sem normalizar alinhamento.
- Não mover o `node_modules` para outro agente, nem editar o lockfile.
- `ABLETON_RC_DEV_SYNC` vazio ou `0` em qualquer execução automatizada.

## 1. Instalação limpa

- [ ] Salvar cópia do Set; encerrar Live; instalar
  `RC-Surface-1.0.0.ablx` (Beta 12.4.5+ Suite); reiniciar Live.
- [ ] Carregar `release-kits/RC-Surface-1.0.0-test/RC-Surface-1.0.0.ablx`
  em Live de teste; substituir todos os `RC-Midi-Receiver.amxd` antigos
  pelas cópias v2 desta entrega (`SDK / LOCAL MAX — NO UDP`).
- [ ] Verificar no painel que **não existe listener UDP 9000** atribuível
  a estes devices (netstat / Ableton log).
- [ ] Conferir `internal/RELEASE-CANDIDATE-CHECKLIST.pt-BR.md` em
  paralelo (cenários v2, midi-receiver-arming, live-midi-trigger,
  sensor-capabilities, audio-spectral-workspace, surface,
  workspace-scaling, modulation phase continuity).

Status: ______ · Evidência: ______

## 2. CFG / MAP / PERF / MIX / SNP (UI mobile)

| # | Passo | Esperado | Observado | Status |
| --- | --- | --- | --- | --- |
| 2.1 | Abrir PERF, tocar 12 pads, soltar; alternar modos A/B/C/D | `latch`/`toggle`/`burst` corretos; sem nota presa | | |
| 2.2 | Mover 8 knobs + 8 faders; duplo toque reseta para 0.85 | Reset target-aware (0.5 quando bound a pan) | | |
| 2.3 | CFG em pad-1: trocar modo/shape/subdivision | LFO respeita override; modo renderiza corretamente | | |
| 2.4 | CFG long-press: Clear-all popover com confirmação | Persistência localStorage limpa | | |
| 2.5 | MAP: bind knob-1 a Auto Filter frequency | Live segue o dedo, sem snap | | |
| 2.6 | MAP: bind Trigger Note em MIDI track (com Receiver v2) | Note on/off correto, ordem sob SDK lento | | |
| 2.7 | SNP: capture, recall, clear, morph 1 bar Sync | Transição segue BPM; readout `1 bar` | | |
| 2.8 | Trocar idioma EN ↔ PT-BR | Strings i18n consistentes | | |
| 2.9 | STAGE fullscreen | Entra/sai sem crash; `resize`/`orientationchange` não quebram | | |
| 2.10 | `LIVE-WRITE-CEILING-1.0.md` §3.3: LFO telefone real (triângulo, 1/16, 120 BPM, 10 s) | `getActuatorStats` reporta `ratePerSecond`/`writesCompleted`/`writesFailed`/`meanMs` | | |

Status global: ______

## 3. Backend write path (`continuousTargetActuator`)

- [ ] Disparar LFO telefone real (triângulo, 1/16, 120 BPM) durante 10 s;
  coletar `getActuatorStats` antes/depois (rota de produção real, não
  bench).
- [ ] Esperado: `ratePerSecond` ≤ `LFO_SHAPE_MAX_HZ[shape] × 16`
  (16 pontos/ciclo mínimo do triângulo). Drift/phase esperado: o host
  aceita `BPM`/`subdivision` change sem reset.
- [ ] Cancelar/recreate o mesmo target: lane retém lock in-flight sem
  overlap; verificar `getStats.byTarget[targetKey]` mostra
  `writesStarted == writesCompleted + writesFailed`.

## 4. Bancada `bench-live-write-rate.mjs` (P04 do write-ceiling)

Comando base:

```
node scripts/bench-live-write-rate.mjs --matrix --port <port> --token *** \
  --track 0 --device 0 --param <P> --seconds 10 \
  --json test-results/write-ceiling/bench-<alvo>-<modo>.json
```

| alvo | single | parallel 2 | parallel 4 | parallel 8 |
| --- | --- | --- | --- | --- |
| Utility Gain | — | — | — | — |
| Rack macro 1 | — | — | — | — |
| terceiro alvo (mixer volume) | — | — | — | — |

- [ ] Preencher matriz de 12 células (3 alvos × 4 modos), `stairs` pattern,
  10 s cada.
- [ ] Pelo menos 2 células com Automation Arm ligado; contar pontos
  gravados (Live UI ou print). `pontos/s = pontos / 2 s`.
- [ ] Derivação: `teto_single_escritas/s = max(média em single)`;
  `teto_paralelo_max_escritas/s = max(média em parallel)`;
  `teto_pontos_gravados/s = max(pontos/s)`;
  `teto_efetivo = min(teto_single, teto_pontos_gravados)`.
- [ ] Regenerar `LFO_SHAPE_MAX_HZ` por
  `maxHz(shape) = floor(teto_efetivo / minPointsPerCycle(shape))` (sine 10 /
  tri 16 / ramps 16 / square 4). Atualizar
  `src/live/transport-clock.ts:11`, `static/phone-v3/controls.js:21`,
  `tests/contracts-freeze.test.mjs`, `docs/CONTRACTS.md`, CHANGELOG.

Status: ______ · Evidência: JSON + prints + tabela.

## 5. Sensores (SNS / AUD / VID)

- [ ] SNS CALIBRATE (postura neutra, 1 s): leitura fresh antes de
  aceitar. Cancelar e retomar não corrompe a próxima sessão.
- [ ] AUD CALIBRATE (som normal tocando, 5 s): ganho RMS/envelope ajustado.
  Input change (trocar device) não afeta calibração prévia.
- [ ] VID CALIBRATE (mão erguida, 4 s): câmera automática quando suportada;
  rejeita dispositivos sem suporte sem fake success.
- [ ] SNS sensores motion/orientation com permissão ativa. Negar uma API
  (accelerometer) não afeta a outra.
- [ ] AUD loopback/virtual-cable. Selecionar input, ligar/trocar/desligar;
  verificar descritores voltam a zero em silêncio; sem auto-capture após
  reload. Capture completions antigas não revivem áudio.
- [ ] K-weighted loudness: tom -20 dBFS 1 kHz → `momentary` ≈ -20 LUFS,
  `short_term` converge em ~3 s, `integrated` acumula.
- [ ] VID pinça em pose confirmada (3 dedos estendidos): pinch clutch
  engata em 4 frames, libera em 15 frames; X/Y/Z viajam com a mão; release
  mantém valor; tracking loss momentâneo não zera. Reapós long release
  re-engata sem jump.
- [ ] VID gestos estáticos: capturar 5 frames estáveis; reconhecer de
  outro ângulo/distância; reload mantém pose salva; pose claramente
  diferente não dispara.

## 6. SYNC / TRN / OSC

- [ ] Live em 120 BPM; SYNC `1/4` LFO sine: ciclo dura exatamente 1
  beat. Mudar Live para 60 BPM sem mexer no phone: ciclo dobra.
- [ ] TRN play/stop, prev/next locator, jump por nome; metrônomo
  pisca Beat 1 verde, outros azul.
- [ ] SYNC `FREE`: valores em ms; SYNC `OFF` smoothing passa direto;
  reload preserva setting.
- [ ] Sem AbletonOSC: status `FREE` ou `SDK`; clicar SYNC → modal mostra
  fallback explícito.

## 7. Segurança e sessão

- [ ] Reabrir página phone após Live restart: token antigo recusado,
  status `SESSION EXPIRED — RESCAN QR`.
- [ ] QR antigo após Stop+Start no painel: recusado (token rotacionado).
- [ ] Diag `https://<lan-ip>:8731/diag?token=***` mostra
  `originCheck.ok=true`, `helloRole=controller`,
  `helloTokenStatus=valid`.
- [ ] Painel admin URL (`/static/admin/mappings.html?token=***admin***`)
  renderiza; `style.css`/`app.js` continuam públicos sem token.
- [ ] Tentar `GET /static/panel/index.html` sem token → 403; com token
  controller → 403.

## 8. Native Track (`PENDING_OWNER_DEFERRED`)

- [ ] Confirmar se esta sessão abre a bancada `native-audio-reference.mjs`
  com a fonte sonora DC gerada em bancada. **Atenção**: o sinal contém DC
  — **sem caixas/fones nem saída física**.
- [ ] Se bancada reaberta: gravar com/sem `RC-Audio-Descriptors.amxd` na
  track; medir mediana/p95/max/eventos perdidos em mesmo relógio.
- [ ] Resultado mesmo que "não retomado nesta sessão" é válido: registrar
  e seguir.

## 9. Sessão longa 20–30 min (operador)

- [ ] Tocar Set real 20–30 min; observar calor, bateria, throttling,
  rafs, mensagens recusadas, perda de token, reconexão espontânea.
- [ ] Resultado registrado em `refs/long-session-<data>.md`.

## 10. Aprovação

- [ ] Preencher `internal/RELEASE-GATES-1.0.json::gates[physical-hardware].status`
  → `passed` (com rationale assinado) ou `blocked` (com motivo reprovado).
- [ ] Rodar `node scripts/check-release-gates.mjs --stage publish --report
  test-results/release-gates-publish.json`.
- [ ] Push, tag, release, upload permanecem fora desta task — exige
  autorização explícita adicional do responsável.

## Bloqueios explícitos

| Item | Bloqueio | Próximo passo |
| --- | --- | --- |
| `physical-hardware.status` | requer operador + bancada | P04 do write-ceiling + Native Track deferida |
| `distribution-publication.status` | rota upstream do SDK | depende de `internal/DISTRIBUTION-REVIEW-1.0.md` |
| Sessão longa | depende de aparelho + tempo | próxima janela do operador |
| macOS / Safari | runner dedicado | fora do executor |

`LIVE-ACCEPTANCE.md` é executado pelo operador; o executor desta task
não marca nada como **passed** sem evidência física. O relatório desta
investigação aponta tudo como **not-run** por definição.
