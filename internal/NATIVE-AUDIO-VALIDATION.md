# Native audio — Gate A bench / bancada

Status: EXPERIMENTAL, **revised load + basic Remote/OFF PASS (owner report); latency unmeasured / carga revisada + Remote/OFF básico PASS (relato do proprietário); latência não medida**.
Task 1: `70617ce`. Task 2 is a local prototype, not a released Track input.
The phone/host production path is unchanged. No test below is approved merely
because the patch JSON or JavaScript tests pass.

## Paused by owner / Adiado pelo proprietário — 2026-09-07

**PENDING_OWNER_DEFERRED — no Remote/control WAV received; Gate A remains closed.**
The owner cannot run the bench now and requested a whole-project release audit
instead. Do not ask for another recording or resume native integration until
the owner chooses to return to this front. See
[release review / revisão de lançamento](RELEASE-READINESS-2026-09-07.pt-BR.md).

Configuração já mostrada: SSL ASIO Driver 1, 48 kHz, buffer 128 samples,
Safe Mode ligado. Os números de entrada/saída informados pelo driver não
medem a latência do caminho detector → alvo.

A montagem mais recente do proprietário substituiu a orientação inicial de
três tracks abaixo: grupo BUS contém REF/RESPOSTA; CAPTURA, fora do grupo,
recebe BUS Post Mixer e grava sem saída física. REF usa Utility Left antes do
analisador; RESPOSTA usa Utility Right antes do target; pan de mixer deve
separar L/R e balance dos Utilities ficar central. O caminho recopiado do
Gain foi `live_set tracks 2 devices 1 parameters 1`, com `remote_active`.
O proprietário disse ter feito os últimos ajustes; não há captura completa
posterior comprovando todos eles. Antes de gravar futuramente, reconferir
isolamento físico/DC, canais, Warp/fades e caminho no Set então aberto.
Não reutilizar o índice de track cegamente nem tratar o roteiro histórico
abaixo como confirmação do roteamento atual.

**ADIADO, não aprovado:** carga revisada e reação/OFF básicos continuam como
evidência qualitativa; latência, controle/null, demais releases e pareamento
continuam pendentes. Isso não bloqueia automaticamente um lançamento Browser.

## Load incident / Falha de carregamento — 2026-09-06

The owner reports Live crashes immediately when loading either device from
`gate-a` (prototype commit `d1a224f`). **Do not reuse those original AMXDs.**
At that incident, no audio/latency or safe-release test had passed. Logs identify Live 12.4.15b1
and Max 9.1.5. The local crash dump's exception is `0xc0000005`, in
`MaxPlug.dll+0x451168`, export `dictionary_getentrycount+0x28`.
Stack-memory address candidates include `project_newfromdevicepatcher+0x5d7`;
this was an address/export lookup, **not a fully symbolized stack unwind**.

Both generated AMXDs contained only `project: {amxdtype:1633771873}`. The
installed stock Max Audio Effect and the existing RC Audio Sender contain
project version, contents/patchers, layout, searchpath and device-path metadata.
That missing envelope is a concrete packaging defect consistent with the
dictionary/project loading failure. It is not yet proof that every load issue
is resolved. The native builder now supplies the complete project envelope;
the generic AMXD writer, patcher payload and companions remain unchanged.

Os arquivos revisados já estão em
`.agent-context/runtime/native-audio/gate-a-load-fix-r1/`.
Não sobrescrevemos a bancada antiga; ela fica preservada para diagnóstico.
Protocolo do primeiro reteste, agora concluído: **Set novo/descartável, trabalho anterior salvo; carregar
somente RC-Native-Latency-Target.amxd dessa pasta nova, sem áudio nem Play**.
Não usar `bench-48k.wav` agora. Se carregar, informar/mostrar o knob Test Gain;
se falhar, parar. Só depois verificar o analisador e retomar a bancada abaixo.

Revised files are in `gate-a-load-fix-r1`, with all companions beside them.
The completed first owner retest was load-only, gain target alone in an empty disposable Set,
no audio or playback, after saving other work. Stop on failure; do not repeatedly
retry the original files. The agent has not opened Live or modified its installation.

Repair evidence: RED regression on missing project version; GREEN on both
generated files. 12 project-envelope mutations caught, baseline green and
source/test hashes unchanged. `npm test`: 748 static +363 source; lint/TS passed.
Generated-file comparison: **only project metadata changes**, no DSP/control
or legacy device changes. Dump and artifact hashes stay in ignored
`.agent-context/runtime/native-audio/crash-20260906/`.
Repair runtime status: **LOAD_PASS; BASIC_REMOTE_OFF_PASS (owner-operated)**.
Gate A remains closed pending quantitative latency and the remaining lifecycle/capability checks.

## Owner retest / Reteste do proprietário — 2026-09-06

Both revised devices loaded without the earlier fatal crash. Screenshots show
the analyzer before the gain target, the copied parameter path, and
`target_prepared`. The actual Live context-menu label is **Copy Max for Live Path**;
the prototype's instruction text calls the same operation Copy LOM Path.

After the instructed mode 0 / arm trial, the owner reports the gain reacts to
attacks and local `off` restores manual Gain control. This is a basic behavioral
PASS for that session, not a timed recording or proof of every cleanup path.
A subsequent owner screenshot confirms the literal `remote_active` status.
The owner explicitly requested numerical evidence rather than relying on hearing;
no recorded response WAV has been received yet. Source settings
default to sensitivity 0.65, release 45 ms, curve 1. Direct transient-to-gain
mapping cuts the level between attacks; the reported dry/chopped sound alone
does not establish a fault in this bench or validate detector musical quality.

O proprietário confirmou carga dos dois arquivos revisados, reação do ganho e
controle manual recuperado após `off`. Isso não mede latência nem aprova remoção,
Activator, alvo removido, persistência ou pareamento. Não repetir o teste de carga
por falta de um aviso: a indicação no rodapé foi interpretada incorretamente
pelo agente como alerta; não existe erro Max confirmado por esses prints.

Next: record actual sample rate/buffer/driver and prepare the isolated latency
and control-route recordings below. Do not play the DC fixture through speakers.

## Coleta guiada / Guided capture — 48 kHz

O agente gerou `gate-a-load-fix-r1/bench-48k.wav`: 112 s, 220 pulsos,
21,504,044 bytes, SHA256 `cf1ba6941cd924ae4993b880f0ac21e77ac87249cb385917bf1d57ed0ee9977c`.
Gerador + medidor: 9 testes focados passaram nesta rodada; isso valida as
ferramentas, **não mede o Live**. Não tocar no player/preview do navegador.

1. Salvar o trabalho e usar um Set de teste. Desligar fisicamente caixas/fones
   durante a montagem, inclusive para evitar preview involuntário. Deixar todos
   os sends em menos infinito. Não enviar nenhuma rota da bancada ao Main/Ext. Out.
2. Configurar 48 kHz / buffer 128 se disponível. Registrar driver/interface,
   sample rate e buffer reais, compensação de delay e opções de monitoring;
   não esconder configurações diferentes. Manter track delays em zero.
3. Criar três tracks de áudio com os nomes abaixo. Montar a rota ANTES de
   importar/tocar o WAV. Utility com ganho 0 dB, sem inversão de fase; faders 0 dB.

| Track | Dispositivos, na ordem | Pan | Audio To |
|---|---|---|---|
| REF | Utility em Left → RC-Audio-Descriptors | totalmente L | CAPTURA → Track In |
| RESPOSTA | Utility em Right → RC-Native-Latency-Target | totalmente R | CAPTURA → Track In |
| CAPTURA | nenhum; Monitor In; armar só esta track para gravar | centro | Sends Only; todos os sends em menos infinito |

O roteamento interno e as opções de saída são documentados no
[manual de I/O](https://www.ableton.com/en/manual/routing-and-i-o/).
O modo Left/Right do Utility isola o canal e o entrega às duas saídas;
o pan separa referência e resposta no WAV final, conforme o
[manual do Utility](https://www.ableton.com/en/manual/live-audio-effect-reference/#utility).

4. Colocar duas cópias do WAV, uma em REF e outra em RESPOSTA, ambas em 1.1.1.
   Warp OFF, Loop OFF, fades zerados, clip gain 0 dB, sem transpose.
5. Como o alvo mudou de track, copiar novamente **Copy Max for Live Path** do
   Gain. Colar no analisador → Enter → prepare → mode 0 → arm. Exigir
   `remote_active`; manter `settings 0.65 45 1`, sem iniciar Node.
6. Gravar CAPTURA em tempo real no Arrangement, desde 1.1.1 até passar 112 s.
   Não renderizar o circuito offline para substituir esta captura. O arquivo
   estéreo gravado deve conter referência em L e resposta em R.
7. Preservar esse WAV bruto como take Remote. Para o controle, sem mudar rotas,
   buffer, pan ou posições: analisador OFF, Gain manual em 1, Utility de
   RESPOSTA passa de Right para Left. Gravar novamente toda a duração em uma
   nova tomada, sem sobrescrever a anterior.
8. Enviar os dois WAVs brutos e as configurações de áudio/monitoramento ao agente.
   Não normalizar, consolidar com Warp, converter para MP3, cortar ataques ou
   alinhar canais à mão. As gravações ficam em `Samples/Recorded` do projeto
   salvo ([manual de gravação](https://www.ableton.com/en/live-manual/12/recording-new-clips/#where-are-the-recorded-samples)).

English summary: build the isolated three-track route above before importing
the DC fixture; keep hardware playback disabled. Record the simultaneous left
reference/right native gain response in real time for the full 112 s, then a
separate control take with analyzer OFF, manual gain 1 and both Utilities Left.
Supply both raw stereo WAVs and actual audio/monitoring settings. Neither the
fixture itself nor its passing unit tests counts as measured Live response.
The agent must report median/P95/max, misses and false positives, inspect both
channels, retain signed offsets/control evidence and test threshold sensitivity.

## Historical automated evidence / Evidência automatizada anterior

Automated evidence before the load incident (2026-09-06): 24 focused tests,
747 static +363 source tests, lint/TypeScript and additional Max ES5/helper lint.
57 deliberate mutations were caught; source/test SHA256 unchanged after the run.
These results validate source logic and packaging, **not physical latency**.
The Node entry also registers when required by an external runner; the tested
probe client lives separately in `rc-probe-client.cjs`, included in the folder.

## What is ready / O que existe

- `RC-Audio-Descriptors.amxd`: stereo pass-through; broadband transient in MSP;
  one explicit native Remote slot; local OFF; no auto-arm.
- `RC-Native-Latency-Target.amxd`: a bench-only linear gain 0..1, initially 0.
  It lets us measure an actual receiving parameter without a synth's transfer
  curve, lookahead or loudness law. This extra fixture is deliberately part of
  Task 2, not a shipping detector.
- Source companions must stay beside the analyzer. This is **not** a frozen
  standalone device; do not copy only its AMXD.
- Modulate is visibly unavailable (`modulation_kind_unsupported`). LOM min/max
  does not establish polarity; no allowlist is proven yet. No SDK-per-frame fallback.
- Settings message in the experimental UI is `settings sensitivity releaseMs curve`.
  Defaults `0.65 45 1`. Edit/click locally for trials; synced native knobs and
  twelve spectral outputs are Task 3, not present now. Browser SYNC is separate.
- Node probe only sends identity heartbeats. Stopping Node must not stop native
  modulation; there is no raw PCM or phone round-trip.

## Prepare locally / Gerar arquivos locais

Run from the worktree root (PowerShell); use a NEW output folder each experiment:

```powershell
$env:ABLETON_RC_DEV_SYNC='0'
node scripts/build-audio-descriptors.mjs .agent-context/runtime/native-audio/gate-a-load-fix-r1
node scripts/generate-native-latency-fixture.mjs .agent-context/runtime/native-audio/gate-a-load-fix-r1/bench-48k.wav
```

This does not build/install an extension, replace old Max MIDI devices or start Live.
O agente só gera arquivos. O proprietário abre o Live e opera a bancada.

**CAUTION / ATENÇÃO:** the WAV's right channel is a constant DC carrier at 0.0625
(-24 dBFS); left is 220 isolated 1 ms pulses at 0.5, 500 ms apart. **Never route the
bench to headphones or speakers.** Use an empty Set, a recording-only bus with
no hardware output, and disable sends. Do not use a performance Set.
Nunca enviar o canal DC às caixas/fones; manter todas as saídas da bancada
sem saída física. O arquivo não foi feito para ser ouvido.

## 1. Real Remote latency / Latência real

Owner-operated, Max editor closed while recording:

1. Set 48 kHz, audio buffer 128; record actual Live, Max, Node, SDK, OS/driver,
   MSP vector, PDC and monitoring settings in the table below. No oversampling,
   lookahead, Warp, clip fades, normalization or other plugins.
2. Duplicate the bench clip at the exact same Arrangement position on two audio
   tracks. On **Reference**, Utility's Left channel mode isolates the pulses;
   follow with RC-Audio-Descriptors. On **Response**, Utility's Right mode
   isolates the DC carrier; follow with RC-Native-Latency-Target. Both Utility
   gains 0 dB; no mid/side processing.
3. On the target's **Gain** knob (parameter Test Gain), use Live's **Copy Max for Live Path**
   (called Copy LOM Path in the prototype text). Paste into the
   analyzer's text field and send it with Return (status `target_path_set`).
   Click `prepare`; require `target_prepared`. Click `mode 0` (Remote),
   then `arm`; require `remote_active`. OFF always releases. If a status
   differs, stop and report it; do not bypass eligibility checks.
4. Pan Reference fully left and Response fully right into the same stereo
   **recording-only** bus. Record this bus at unity, with no physical output.
   Export one stereo PCM16/24/32 or float32 RIFF WAV without Warp/fades/normalize,
   including the full 112 seconds. Left = reference; right = recorded target response.
   Preserve the raw take; do not shift either channel to make results look faster.
5. Measure, using a new report directory per take:

```powershell
node scripts/measure-native-audio-latency.mjs --wav .agent-context/runtime/native-audio/remote-take.wav --reference-channel 1 --response-channel 2 --threshold 0.005 --min-gap-ms 250 --out-dir .agent-context/runtime/native-audio/remote-report
```

The suggested 0.005 absolute threshold is below expected response amplitude.
Inspect peaks first; if the signal never crosses it, that is missing evidence,
not zero latency. Record every threshold used and test sensitivity to a second
reasonable threshold. JSON includes SHA256, parameters, median/P95/max, matches,
misses and false positives. A report never overwrites an existing report.

O teste mede entrada → parâmetro → saída gravada, incluindo a resposta do
dispositivo alvo. P95 usa nearest rank; negativos não são truncados nem
subtraídos. Associação é ao ataque de referência mais próximo, até ±100 ms,
um único match por ataque; pulsos isolados ≥250 ms evitam ambiguidade periódica.

6. Record a **control route**: same routing and length, but feed the pulse
   channel to BOTH branches, analyzer OFF, target Test Gain manually 1. Record
   any channel offset with a separate report. Keep this raw result alongside
   the Remote report; do not silently subtract an assumed recording/PDC delay.
7. Repeat buffer 64/256/512 and 44.1/96 kHz later. The initial acceptance target
   **P95 ≤10 ms at 48 kHz / 128 samples** is not a guarantee for every configuration.
8. Test OFF while active, deleting the analyzer, toggling its Live Device
   Activator, target deletion, save/reload and copy. Parameter must release;
   reload/copy must **not** arm automatically. Node script stop, closed phone
   and Wi-Fi loss must not change musical output.
9. Separately null-compare analyzer pass-through ON/OFF on stereo content,
   including opposite-polarity channels. Our graph tests only prove the direct
   wires; Live's real render is still required.

## 2. Identity / Node / SDK capability

No production bridge is needed. Owner can run the isolated probe:

```powershell
node scripts/native-audio-capability-probe.mjs .agent-context/runtime/native-audio/probe-private
```

Use a NEW `probe-private` directory (the parent must exist). The helper binds
127.0.0.1 on an ephemeral port, protects this new directory for the user, and
writes `bridge.json` with an ephemeral credential. **Do not share that file,
copy its token into a URL, or place it in Git.** Ctrl+C stops the helper and
removes its own rendezvous; it never replaces the production bridge.

In the experimental analyzer: `script start`, then the `bang` file picker,
choose that `bridge.json`. Require `probe_connected`; read the literal Node
version from Max console. Do not override Max's embedded Node to conceal a
compatibility failure. The installed SDK parameter editor should discover
`_RC PairNonce`, including values above 255 up to 16777215; confirm the exact
value in Max and SDK, not just the normalized knob position.

UUID persistence is via a Blob pattr parameter bound to the control JS.
Runtime identity is independent. Inspect/log the `identity deviceId instanceId`
message in Max (the controller's fourth outlet; **not** a credential). Save and
reload: deviceId preserved, instanceId changes. Duplicate: a copied deviceId is
expected at this prototype stage, but instanceId must differ and both instances
remain unarmed. Copy collision reconciliation is Task 5; do not enable auto-arm.

Check LOM path ↔ SDK track/device/parameter indices using a top-level target.
Never assume SDK handles equal LOM IDs. Record failures literally; no automatic
insertion or SDK value sweep. Modulate stays disabled for unipolar/unknown
targets; only independently proven bipolar capability may enable it in future.

## Evidence table / Evidência real

| Item | Actual evidence |
|---|---|
| Original `d1a224f` device loading | FAILED: fatal crash reported for both AMXDs |
| `gate-a-load-fix-r1` loading | PASS: owner loaded target and analyzer without crash; screenshots |
| Target prepare | PASS: screenshot shows `target_prepared` |
| Basic native Remote response | Qualitative PASS: owner reports gain reacts to attacks; screenshot `remote_active`; no timing measurement |
| Local OFF release | PASS: owner reports manual Gain control restored after `off` |
| Live / Max versions | Log: Live 12.4.15b1 / Max 9.1.5 |
| Node / SDK capability versions | NOT RUN |
| OS / driver / audio buffer / MSP vector / PDC / monitoring | NOT RUN |
| Remote raw SHA256, matches ≥200, misses, false positives | NOT RUN |
| Remote median / P95 / max, threshold | NOT RUN |
| Control-route median / P95 / max | NOT RUN |
| Removal / Activator / deleted target release | NOT RUN |
| Save/reload / duplicate identities / no auto-arm | NOT RUN |
| Node rendezvous HTTP / exact SDK nonce | NOT RUN |
| Stereo null comparison | NOT RUN |
| Modulate proven bipolar | UNAVAILABLE; no target established |
| Gate A | WAITING_FOR_OWNER_EVIDENCE |

Only actual owner observations or recordings/capability results may replace NOT RUN;
label qualitative reports separately from measurements. Keep private
WAVs and raw logs in ignored `.agent-context/runtime/native-audio/`; commit
only non-private metrics/settings and limitations. Do not begin Task 3–6 while
the fast route, safe release or identity capability remains unproven.

## Basis and limitations / Fontes e limites

The MSP recurrence uses documented [slide~](https://docs.cycling74.com/reference/slide~/)
coefficients. Its small Node graph evaluator proves the source wiring/formula,
not Max scheduling or compilation. The [Remote reference](https://docs.cycling74.com/reference/live.remote~/)
documents one audio buffer of latency for signal control and default 1 ms
smoothing; this prototype explicitly requests 0 and must verify that behavior.
The [Modulate reference](https://docs.cycling74.com/reference/live.modulate~/)
explains why zero is not neutral for every target.
[Node for Max](https://docs.cycling74.com/reference/node.script/) is asynchronous,
separate-process control only. The [pattr reference](https://docs.cycling74.com/reference/pattr/)
requires Float parameters for values above 255 and supports Blob persistence.
