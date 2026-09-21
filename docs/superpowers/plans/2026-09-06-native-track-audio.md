# Native Track Audio — Implementation Plan

> **For agentic workers:** usar `superpowers:executing-plans`, tarefa por tarefa, **SOLO, sem subagentes**, conforme instrução explícita do proprietário. Ler também o desenho vinculado abaixo. Marcar checkboxes somente com evidência nova; não transformar gates manuais em testes aprovados por inspeção de JSON.

**Goal:** oferecer entrada de uma track do Live com doze descritores e modulação nativa reativa, deixando o celular apenas como superfície de visualização/configuração.

**Architecture:** novo dispositivo Max for Live com pass-through estéreo, ataques no domínio do tempo e descritores espectrais em MSP. Modulação local por `live.modulate~`/`live.remote~`; ponte Node for Max → HTTP loopback do host → WebSocket da página transmite apenas estado/telemetria e recebe transações de configuração.

**Tech Stack:** TypeScript, JavaScript, Node test runner, Playwright, SDK vendorizado 1.0.0-beta.0, Max for Live/MSP/pfft~, Node for Max sem pacotes adicionais.

**Spec:** [Desenho completo, decisões e fontes primárias](../specs/2026-09-06-native-track-audio-design.md).

## Global Constraints

- Ferramentas do repositório: Node >=24.16.0 <25; SDK vendorizado 1.0.0-beta.0. Manter o requisito Live da versão atual do README (Live 12.4.5+ Suite Beta para esta extensão); registrar a versão Max real, não inferi-la do major do Live.
- Browser continua padrão; Track não captura microfone e não usa SDK por frame para modular.
- Manter doze nomes/normalizações; Follow Detected Note, MIDI antigo, Audio Lab e pitch/BPM aposentados permanecem dormentes.
- Continuar na worktree existente; preservar quaisquer mudanças de terceiros. Não usar reset/checkout destrutivo.
- Definir `$env:ABLETON_RC_DEV_SYNC='0'` em todos os terminais de build/teste.
- Não instalar, operar Live/navegador/Spotify, atualizar a extensão em execução, mergear, enviar remoto, criar tag ou publicar. Usuário opera aplicativos e grava evidência real.
- Commits locais unsigned com identidade humana verificada, paths exatos. Antes de **cada** commit de produto: `npm test`, depois `npm run lint`; parar se falhar. Não atribuir autoria a IA.
- Mutation-prove cada novo guard com alteração temporária isolada, teste vermelho e restauração exata; não sobrescrever trabalho concorrente.
- Não trackear `.ablx`, `dist/`, credenciais, certificados, `AGENTS.md` ou `.agent-context/`.
- EN/PT-BR juntos em documentação de produto, mensagens e tester kit. Este plano de engenharia é em português e não é anúncio de feature pronta.

---

## Retomada em 60 segundos

**Atualização prioritária — 2026-09-07:** o proprietário adiou a bancada por
falta de tempo e pediu auditoria do projeto completo antes de escolher a
próxima implementação. Gate A = `PENDING_OWNER_DEFERRED`; nenhuma gravação
Remote/controle recebida. Não retomar coleta nem Tasks 3–6 automaticamente.
Ler `internal/RELEASE-READINESS-2026-09-07.pt-BR.md` e aguardar a escolha das
frentes. Configuração SSL/48 kHz/128/Safe Mode e nova montagem BUS foram
registradas em `internal/NATIVE-AUDIO-VALIDATION.md`; não pedir esses dados
como se nunca tivessem sido enviados. O texto de retomada de 2026-09-06
abaixo é histórico, não a próxima ação vigente.

**Estado em 2026-09-06: Task 1 no commit `70617ce`; reparo `6142b21` passou na carga dos dois AMXDs revisados e no teste básico Remote/OFF, segundo o proprietário. Latência não medida; Gate A fechado.** O projeto AMXD incompleto causava uma falha compatível com o dump; o reparo mudou somente metadados de projeto. Usar `.agent-context/runtime/native-audio/gate-a-load-fix-r1/`; não reutilizar os originais de `gate-a`, que tiveram crash fatal. Evidência manual: prints de carga e `target_prepared`; relato de ganho reagindo aos ataques e controle manual devolvido por `off`. Evidência automatizada histórica do reparo: regressão RED/GREEN, 12 mutantes mortos, 748 static +363 source e lint/TS. Próximo: obter configurações reais e gravações de latência/controle conforme `internal/NATIVE-AUDIO-VALIDATION.md`, sem saída física para o sinal DC.

Worktree autorizada:

```text
C:/Users/Usuario/repos/ableton-extensions/source-repos/ableton-rc-surface/.worktrees/audio-descriptors-v1
branch: feat/audio-descriptors-v1
baseline funcional: 19e6dc0b97cff815748f21cc5228f1b1cfd72ca7
```

O baseline contém os doze descritores Browser, knobs AUD agrupados e SYNC antigo 1/16..1/1; não contém modo Track. Evidência histórica do baseline: 708 testes static, 362 source, lint/TS, 114 UI pass e 2 skips intencionais do Lab dormente. São resultados históricos, não validação do trabalho futuro.

Ler Workflow Main `C:/Users/Usuario/repos/workflow-main/AGENTS.md`, carregar `operating-workflow-main` e `repo-context-loader`, ler instruções da worktree e verificar status antes de editar. Task bundle existente:
`C:/Users/Usuario/repos/workflow-main/tasks/rc-surface-release-hardening-2026-09-01/EXECUTION.md`.
Bootstrap recente falha por seu limite interno de caracteres (12382 > 10000); não corrigir gerador nem abrir manifesto inteiro como parte deste trabalho. Usar somente escopo explícito e fontes já autorizadas; se exigida nova autoridade, pedir ao usuário.

Main checkout tem alteração alheia em `docs/SECURITY.pt-BR.md`: não a tocar ou importar. Existe handoff local ignorado `.agent-context/plans/2026-09-05-detector-controls.md`; este plano + spec são a referência **versionada e transferível**, dispensando memória da conversa.

**Próxima ação:** obter sample rate/buffer/driver reais, orientar a bancada de gravação isolada e medir resposta Remote + rota de controle. Carga dos dois dispositivos e reação/OFF básicos já passaram; não pedir novamente esses testes como se faltassem. O menu real é **Copy Max for Live Path**, e não Copy LOM Path. **Parada atual obrigatória:** Gate A da Task 2; faltam latência quantitativa, demais caminhos de liberação, identidade/Node/SDK e null estéreo. Não iniciar Tasks 3–6 por um teste auditivo aprovado. HEAD continua `6142b21`; esta rodada altera documentação/handoff, não código nem artefatos.

### Progresso persistente

| Etapa | Estado | Evidência exigida para marcar concluída |
|---|---|---|
| 0 — baseline | concluída | Node24.19.0; baseline72feb1f limpo; 708 static +362 source, lint/TS |
| 1 — contrato/timing | concluída | RED/GREEN; 723 static +363 source; lint/TS; 24 UI; 28 mutantes mortos |
| 2 — protótipo + gate A | carga revisada e Remote/OFF básicos PASS; Gate A pendente | Prints dos dois dispositivos e `target_prepared`; proprietário confirma ganho reativo e controle manual após OFF; latência/lifecycle/identidade ainda sem prova completa |
| 3 — doze descritores | não iniciada | fixtures + comparação Max e CPU |
| 4 — ponte/registro | não iniciada | auth, identidade, freshness, zero dispatch DSP |
| 5 — slots/estado | não iniciada | persistência, ownership, perdas e conflitos |
| 6 — página/MAP | não iniciada | UI Browser/Track, fonte única, duas sessões |
| 7 — distribuição/docs + gate B | não iniciada | kit autocontido + instalação limpa manual |
| 8 — regressão/handoff | não iniciada | CI, mutações, limites e testes pendentes honestos |

Ao interromper: atualizar linha da etapa, commit/dirty paths, último comando/resultado, evidência real, blocker e próxima ação exata aqui. Nunca registrar token/segredo. Não dizer “100%” se gate manual estiver aberto.

### Evidência Task 1 — 2026-09-06

- RED inicial: módulo ausente, arredondamento e clamp antigo; regressão de migração sem preferências também reproduzida antes da correção.
- GREEN: timing float 1.25..360000ms no DSP; FREE mantém10..500/0..200; antigos beats permanecem válidos; tooltip T/D EN/PT-BR. Primeiro SYNC sem preferências migra45ms para1/64D, não para zero.
- Contrato puro com whitelist, cópia imutável, declarações TS verificadas, payloads sem coerção e fixtures independentes. Nenhuma ponte/dispatch/seleção Track ativada.
- 28 mutantes em memória mortos pelos testes reais, baseline final verde, SHA256 das fontes inalterado. Caso de propriedade conhecida não enumerável adicionado após um mutante sobrevivente.
- 24 cenários UI passaram. Gate completo:723 static +363 source e depois lint/TS. Só servidores de teste efêmeros; nenhum build/package/install ou operação de apps.
- Novos tipos/fixtures em `static/shared/native-audio-contract.*`, `tests/helpers/native-audio-*` e `tests/native-audio-contract-types.test.mjs`; normalização existente testada em `audio-descriptor-stream.test.mjs`.

### Reparo de carga Task 2 — 2026-09-06

- Os dois arquivos originais derrubam o Live ao carregar, segundo o proprietário. Não era um resultado de latência ruim: a bancada não chegou a funcionar.
- Dump local: exceção `0xc0000005` em `MaxPlug.dll`, `dictionary_getentrycount+0x28`. Endereços na memória da pilha incluem caminho de criação de projeto, mas não houve unwind simbólico completo.
- Defeito confirmado nos arquivos: projeto contendo somente `amxdtype`; faltavam os dicionários do envelope de projeto do modelo Max Audio Effect instalado. A relação causal é fortemente compatível com o dump; posteriormente o proprietário confirmou a carga dos dois arquivos revisados sem o crash anterior.
- Alteração restrita a `scripts/build-audio-descriptors.mjs` e seu teste: preencher projeto para os dois AMXDs. Comparação dos arquivos revisados verifica identidade de todo o payload além de `project` e igualdade byte a byte dos seis companions. Nenhuma mudança em DSP, IDs, parâmetros, AMXD writer genérico ou MIDI legado.
- RED: versão de projeto ausente. GREEN: envelope nos dois arquivos; 12 mutantes removendo/deformando dicionários ou omitindo o wrapper de um dos dispositivos foram mortos. `npm test` 748 static +363 source, depois lint/TS passaram.
- Nova pasta ignorada `gate-a-load-fix-r1`; originais preservados para perícia, **não para reuso**. Sem instalação, controle de apps, upgrade de Max ou reset de preferências. Procedimento, hashes e status estão na bancada/handoff.

### Reteste real Task 2 — 2026-09-06

- Carga dos dois AMXDs de `gate-a-load-fix-r1` sem crash, com prints. Analisador antes do alvo de ganho. Caminho copiado pelo menu **Copy Max for Live Path**, enviado por Enter; print confirma `target_prepared`.
- Após orientação para mode 0 / arm, proprietário relata reação do ganho aos ataques e restauração do ajuste manual por `off`; print posterior confirma `remote_active`. Nenhum WAV de resposta foi recebido: o proprietário cobrou coleta quantitativa, corretamente distinguindo-a de escuta. Relato de som seco é compatível com aplicação direta do transiente ao ganho; não significa latência medida ou avaliação dos doze descritores.
- Remoção, Activator, alvo apagado, save/reload/duplicação, Node/SDK e null estéreo continuam pendentes. Não confundir botão do rodapé com erro Max: o agente fez essa inferência sem confirmação e corrigiu a orientação.
- Atualização documental sem alteração de código, build, instalação ou operação dos aplicativos. Não repetir gates automatizados como se validassem a latência real.
- Coleta preparada: `gate-a-load-fix-r1/bench-48k.wav` gerado (220 pulsos / 112 s); SHA256 e instruções das três tracks em `internal/NATIVE-AUDIO-VALIDATION.md`. 9 testes focados de gerador/medidor passaram. Só prova das ferramentas; aguardar os dois WAVs reais (Remote/controle), sem saída física/DC, e configurações reais para medir.

### Evidência Task 2 antes da falha de carga — 2026-09-06 (histórico)

- RED/GREEN em referência por amostra, metering WAV, identidade/arm, persistência e estrutura do Max. O teste do Activator reproduziu função ausente antes da correção; um avaliador de grafo encontrou entradas invertidas de `pow~`, corrigidas conforme documentação primária.
- 24 testes focados passam. O avaliador executa a recorrência do patch em 24.000 amostras a 44,1/48/96 kHz, mas **não substitui Max real**, compilação MSP, PDC ou medição de CPU.
- 57 mutantes mortos pelos testes reais; baseline antes/depois verde e SHA256 de fontes/testes inalterado. Inclui offsets assinados/P95, RIFF, auth/Origin/Host/epoch, fila limitada, arquivo de pareamento, ID inválido, OFF/load/delete/Activator, persistência e fios DSP.
- Casos que inicialmente não distinguiam tamanho RIFF, alinhamento PCM ou troca por outro ID válido foram fortalecidos. Uma rodada concorrente a edições foi descartada; somente a repetição final com hashes inalterados conta como evidência.
- Regressão: `npm test` (747 static +363 source), depois `npm run lint`/TS, com DEV_SYNC=0. Task 1 já tinha 24 cenários headless AUD aprovados; Task 2 não altera a página. Sem build de extensão, instalação, controle de apps ou ação remota.
- Acrescentados, dentro da bancada da Task 2, `rc-latency-target.maxpat` e `scripts/generate-native-latency-fixture{,.test}.mjs`: ganho linear conhecido e 220 pulsos isolados, para evitar ambiguidade de um synth arbitrário. WAV tem canal DC e **não deve ser ouvido nem enviado a saída física**.
- Modulate permanece indisponível por falta de alvo bipolar comprovado. O protótipo só arma Remote explicitamente; alvo não persiste nem rearma ao carregar/copiar. A tela cabe nos 169 px de altura do Live; estado de rede não sobrescreve estado musical.
- RED/GREEN adicional: carregamento do entry Node por runner externo falhava ao depender de `require.main`. `rc-bridge.cjs` agora registra handlers incondicionalmente; cliente testável separado em `rc-probe-client.cjs`, incluído byte a byte no builder. Lint extra dos helpers e sintaxe ES5 do controle Max também passou.
- Gate A: **WAITING_FOR_OWNER_EVIDENCE**. Todas as medições/capacidades reais estão `NOT RUN` na bancada. Não promover este protótipo a feature final nem iniciar Tasks 3–6 sem esses resultados.

## Mapa do código existente e dos novos módulos

Todos os paths seguintes são relativos à worktree. Os itens marcados **novo** não existem no baseline.

| Responsabilidade | Path |
|---|---|
| Browser capture/lifecycle | `static/phone-v3/audio-processor.js` |
| Browser Worklet/FFT/cadência | `static/phone-v3/audio-descriptor-{worklet,stream}.js` |
| Referência de fórmulas/shaping | `static/phone-v3/audio-descriptors.js`, `audio-spectral-descriptors.js` |
| Timing atual e novo conjunto T/D | `static/phone-v3/audio-detector-timing.js` |
| Gráficos/knobs/cards | `static/phone-v3/audio-workspace.js`, `audio-timeline.js`, `style.css` |
| Composição do app | `static/phone-v3/app.js`, `index.html` |
| Catálogo de 12 IDs/cores/unidades | `static/shared/audio-descriptor-catalog.js` |
| Contrato compartilhado validável sem DOM — **novo** | `static/shared/native-audio-contract.js` |
| Seleção/subscription Browser/Track — **novo** | `static/phone-v3/audio-source-controller.js` |
| Host ponte, registro, transações e identidade — **novos** | `src/native-audio/{bridge,registry,commands,targets}.ts` |
| Host HTTP/WS/lifecycle/autorização | `src/server/{http,ws,state,command-dispatch}.ts`, `src/extension.ts` |
| Catálogo de comandos | `src/live/catalog/{index,types}.ts` |
| Proteção de ownership — **novo** | `src/live/native-target-ownership.ts` |
| Limite com mapping antigo | `src/live/mappings.ts`, `continuous-target-actuator.ts` |
| Fonte Max e assets locais — **novos** | `max/audio-descriptors/` (arquivos discriminados nas tarefas) |
| Builder nativo — **novo** | `scripts/build-audio-descriptors.mjs` |
| Distribuição atual | `scripts/amxd.js`, `scripts/package-tester-kit.mjs`, `build.ts` |

Não expandir `app.js` ou `mappings.ts` com todo o protocolo novo. Não reutilizar o sender MIDI como analisador. Não presumir que o escritor AMXD de container JSON congela assets.

## Contratos de integração propostos

Estes tipos são o contrato v1 a codificar, não APIs já existentes. O arquivo compartilhado é uma IIFE, como o catálogo existente: expõe `globalThis.NativeAudioContract`, sem sintaxe export em script clássico. Host/testes importam esse arquivo por efeito colateral e leem o mesmo objeto global; declarar o global em `static/shared/native-audio-contract.d.ts`. Não manter implementação ESM separada. O companion Node usa os mesmos bytes copiados pelo builder como `native-audio-contract.cjs`, com require por efeito colateral, evitando depender do package type do diretório pai; o gate A prova compatibilidade com seu Node embutido. Verificar igualdade byte a byte entre fonte e cópia na distribuição.

```ts
type Descriptor = 'transient'|'kick'|'snare'|'brightness'|'centroid'|
  'rolloff'|'flux'|'flatness'|'spread'|'low'|'mid'|'high';
type Values = Record<Descriptor, number>; // exatamente 12, finitos, 0..1
type TrackRef = { kind: 'track'|'return'|'master'; index: number };
type SourceBinding = { bindingId: string; instanceId: string; deviceId: string;
  track: TrackRef; deviceIndex: number; catalogGeneration: number };
type SourceSelection = { kind:'browser' } | { kind:'track'; track:TrackRef;
  deviceIndex?:number; bindingId?:string };
type SourceList = { tracks:Array<{ track:TrackRef; name:string;
  devices:Array<{ deviceIndex:number; compatible:boolean;
    bindingId?:string; code?:string }> }>; bindings:SourceBinding[] };
type TargetRef = { track: TrackRef; deviceIndex: number|null;
  kind: 'device-param'|'volume'|'pan'|'send'; parameterIndex: number;
  catalogGeneration: number; fingerprint: string };
type TargetCapability = { target: TargetRef;
  modulationKind: 'bipolar'|'unipolar'|'unknown'; remoteSupported: boolean };
type Slot = { slot: number; descriptor: Descriptor; target: TargetRef;
  mode: 'modulate'|'remote'; amount: number; min: number; max: number;
  enabled: boolean }; // slot 0..11; amount -1..1; 0<=min<=max<=1
type Settings = { sensitivity: number; releaseMs: number; curve: number;
  window: 1|2|4; toneMs: number; textureMs: number; bandsMs: number;
  attacksGain: number; toneGain: number; textureGain: number; bandsGain: number;
  releaseBeats: number; toneBeats: number; textureBeats: number; bandsBeats: number;
  syncMode: 'free'|'sync' };
type DeviceSnapshot = { instanceId: string; deviceId: string; revision: number;
  enabled: boolean; settings: Settings; slots: Slot[]; bpm: number;
  tempoAvailable: boolean; profile: 'native-fast-v1'; needsRelink: boolean };
type Frame = { version: 1; hostEpoch: string; instanceId: string; seq: number;
  captureSample: number; sampleRate: number; signalVectorSize: number;
  fftSize: number; hopSize: number; configRevision: number; enabled: boolean;
  dspRunning: boolean; spectralReady: boolean;
  values: Values; amplitude: { rms: number; envelope: number };
  peaks: { transient: number; kick: number; snare: number } };
type ConfigChange = { kind: 'settings'; patch: Partial<Settings> } |
  { kind: 'enabled'; enabled: boolean } |
  { kind: 'prepare-slot'; slot: Slot } |
  { kind: 'commit-slot'; preparedId: string } |
  { kind: 'remove-slot'; slot: number };
type DeviceCommand = { version: 1; commandId: string; hostEpoch: string;
  instanceId: string; expectedRevision: number; change: ConfigChange };
type DeviceAck = { commandId: string; ok: boolean; code: string;
  snapshot: DeviceSnapshot; preparedId?: string };
type Exchange = { version: 1; hostEpoch: string; instanceId: string;
  pairNonce?: number; frame?: Frame; snapshot?: DeviceSnapshot; ack?: DeviceAck };
type ExchangeReply = { version: 1; hostEpoch: string; acceptedSeq: number|null;
  telemetryHz: 1|30; command?: DeviceCommand };
```

Rules: UUIDs for instance/device/binding/commands/epoch; runtime instance changes on load. Integers nonnegative and safe for seq/revision/sample count; seq strictly increases per epoch+instance, wrap means new handshake. `parameterIndex` is device parameter or send index; volume/pan require 0 and deviceIndex null. V1 supports top-level devices; nested rack targets are unavailable with `target_ineligible`, never flattened by guesswork. Master uses index 0. fingerprint is 64-character SHA256 hex of canonical identity metadata, not a human name; SDK-only handles cannot enter a hash expected to match Max. `TargetCapability` is server/device-verified evidence, never a caller-supplied authorization for Modulate. Settings include saved FREE times, not resolved SYNC ms; Max resolves its own BPM. Unknown keys, coercion, invalid floats, oversized arrays and >12 slots reject atomically. DSP stopped (`dspRunning=false`) and FFT warming (`spectralReady=false`) are explicit even while heartbeats remain healthy; hide unavailable values instead of presenting placeholder zero as measurement. Enforce this state in graph/cards as well as wire decoding.

Host-to-page event: `{ type:'native_audio_state', bindingId, generation, status, snapshot?, frame?, receivedAgeMs, code? }`; `status` is one of the eight states in spec §7. No bridge bearer, nonce, pid or private path goes to the browser. On initial snapshot select source only after user intent; do not autostart.

Page commands through existing role-gated command dispatcher:

- `getNativeAudioSources {}` → `SourceList`, including tracks without a compatible device so the UI can select them and explain placement; read.
- `subscribeNativeAudio {bindingId, generation}` / `unsubscribeNativeAudio {bindingId, generation}` → viewer-safe subscription for authenticated session, not device state mutation.
- `pairNativeAudio {track, deviceIndex, catalogGeneration}` → controller, live-write (only writes the nonce to an existing compatible device).
- `configureNativeAudio {bindingId, expectedRevision, change}` → controller, live-write for this entire command (including native slot operations); viewer rejected before side effects. The current dispatcher classifies commands by name, so do not invent per-payload middleware semantics.

Global bootstrap sessions/roles stay unchanged. Scene/MIDI/PERF actions are not valid native bridge commands.

### Task 0 — baseline and bounded execution setup

**Files:** read the existing modules above; update only this progress table and, when needed, the ignored local handoff. No functional edit.

**Interfaces:** consumes baseline Git revision; produces a recorded current starting revision and gate output paths, not an assumed clean tree.

- [x] Run from authorized worktree:

```powershell
$env:ABLETON_RC_DEV_SYNC='0'
git status --short --branch
git log -1 --format='%H %s'
git config user.name
git config user.email
node --version
npm test
npm run lint
```

- [x] Classify new/third-party changes before continuing. If tests fail, preserve logs and diagnose the failing baseline; do not label it a regression caused by this feature. Do not rebuild a package or restart servers just for orientation.
- [x] Record version/status and next task here. Read spec §§1–9. Keep SOLO. No commit needed for orientation alone.

### Task 1 — versioned contract and musical timing down to 1/128

**Files:** create `static/shared/native-audio-contract.js`, `static/shared/native-audio-contract.d.ts`, `static/shared/native-audio-contract.test.mjs`; modify `static/phone-v3/audio-detector-timing.js`, `static/phone-v3/audio-detector-timing.test.mjs`, `static/phone-v3/audio-descriptors.js`, `static/phone-v3/audio-descriptors.test.mjs`, and timing assertions in `tests/ui/audio-spectral-workspace.spec.mjs`. Create `tests/helpers/native-audio-fixtures.mjs` for host tests (not a runtime asset).

**Interfaces:** `validateFrame(input: unknown): Frame` and `validateExchange(input: unknown): Exchange` throw an Error with stable `.code`; `validateChange(input: unknown): ConfigChange`; `AudioDetectorTiming.steps(key): number[]`, `preferences(settings,bpm)`, `resolve(settings,clock)`, `label(beats,bpm)` retain current signatures. Add `AudioDetectorTiming.divisions()` returning `{beats,label}[]`. Fixture helper exports `makeFrame(patch={})`, `makeSnapshot(patch={})`, `makeBinding(patch={})` with consistent valid UUIDs, exact zero-filled twelve values, settings defaults from spec, and caller patches last. Default frame is enabled, dspRunning and spectralReady, seq 1, configRevision 1, Fs48000/vector64/FFT2048/hop1024; snapshot revision 1 and no slots. Helpers create new nested objects on each call; no shared mutable fixture state.

- [x] Add failing tests, including this behavior (use existing VM loader for timing):

```js
assert.equal(timing.resolve({ releaseMs:45, releaseBeats:4/128 },
  { syncMode:'sync', bpm:120 }).releaseMs, 15.625);
assert.ok(Math.abs(timing.resolve({ releaseBeats:(4/128)*2/3 },
  { syncMode:'sync', bpm:240 }).releaseMs - 5.208333333333333) < 1e-9);
assert.equal(timing.resolve({ releaseMs:45, releaseBeats:4/128 },
  { syncMode:'free', bpm:120 }).releaseMs, 45);
const invalid = makeFrame();
invalid.values.transient = NaN;
assert.throws(() => validateFrame(invalid),
  { code:'invalid_frame' });
```

- [x] Run `node --test static/shared/native-audio-contract.test.mjs static/phone-v3/audio-detector-timing.test.mjs`; expect missing module and current resolver's rounded/clamped/wrong division failures. Record RED.
- [x] Implement explicit sorted division table, preserving old beat values with epsilon matching of only allowed choices. Keep float DSP times and formatted labels separate:

```js
const divisions = [128,64,32,16,8,4,2,1].flatMap(d =>
  [[1,''],[2/3,' T'],[3/2,' D']].map(([m,suffix]) =>
    ({ beats:4/d*m, label:`1/${d}${suffix}` }))
).sort((a,b) => a.beats-b.beats);
const milliseconds = (beats,bpm) => beats*60000/bpm;
```

- [x] Separate FREE UI minimum from DSP lower bound: DSP accepts positive SYNC release <10 ms; FREE interactions still clamp 10..500. Raise common max to 360000 ms for dotted whole note at 1 BPM. Test OFF, existing saved preferences, gain exclusions, rapid tempo updates/focus, 1/128T at 1000 BPM, 1/1D at 1 BPM, unknown beat values and invalid BPM. No new BPM detector.
- [x] Implement validators with explicit whitelist, exact twelve keys, finite numbers, UUID/array/size bounds and frozen version. Same decoder used by bridge and page; do not merely type-cast input. GREEN focused tests plus affected workspace/DSP tests; mutate lower-bound clamp, float rounding and extra-key rejection individually and prove tests catch them.
- [x] Run `npm test`, then `npm run lint`; stage this task's exact paths and local unsigned commit `feat: extend audio timing and define native descriptor contract`.

### Task 2 — native fast prototype, capability proof and gate A

**Files (new):** `max/audio-descriptors/device.maxpat`, `rc-fast-attacks.maxpat`, `rc-native-slot.maxpat`, `rc-device-control.js`, `rc-bridge.cjs`, `rc-probe-client.cjs`, `rc-latency-target.maxpat`; `scripts/build-audio-descriptors.mjs`, `scripts/audio-descriptors-device.test.mjs`, `scripts/native-audio-reference.mjs`, `scripts/native-audio-reference.test.mjs`, `scripts/measure-native-audio-latency.mjs`, `scripts/measure-native-audio-latency.test.mjs`, `scripts/native-audio-capability-probe.mjs`, `scripts/native-audio-capability-probe.test.mjs`, `scripts/generate-native-latency-fixture.mjs`, `scripts/generate-native-latency-fixture.test.mjs`; `internal/NATIVE-AUDIO-VALIDATION.md`. Use existing `scripts/amxd.js` without changing old devices. The capability probe is a test helper, not a production service or distributable asset.

**Interfaces:** builder `stageNativeDevice(outDir: string): Promise<string[]>` returns all generated relative paths; reference `createFastDetector({sampleRate,settings})` returns `{push(left:number,right:number):number, reset():void}` for broad transient; measurement `measureOnsets({reference:Float32Array,response:Float32Array,sampleRate:number,threshold:number,minGapMs:number}): {count:number,misses:number,falsePositives:number,medianMs:number|null,p95Ms:number|null,maxMs:number|null}` uses threshold rising edges with refractory minGapMs and one-to-one matching (no matches => null metrics, never success). CLI WAV reader supports PCM16/24/32 and float32 RIFF only, rejects unsupported formats instead of guessing. Probe `startCapabilityProbe({privateDir:string}):Promise<{port:number,stop():Promise<void>}>` binds only 127.0.0.1 on an ephemeral port, issues an ephemeral test credential and accepts only contract-shaped exchanges; it never calls SDK or controls a parameter. User enters its isolated rendezvous path in the experimental companion. Automated tests own fixture/temp paths and stop the probe. Do not replace production rendezvous or require task 4 to exist for this capability check.

- [x] Write numeric tests for native fast formula and latency metering, including known offsets:

```js
const reference = new Float32Array(48000);
const response = new Float32Array(48000);
for (let p=1000; p<47000; p+=1000) { reference[p]=1; response[p+240]=1; }
const result = measureOnsets({ reference,response,sampleRate:48000,
  threshold:0.5,minGapMs:10 });
assert.equal(result.p95Ms,5);
assert.equal(result.misses,0);
```

- [x] Run `node --test scripts/native-audio-reference.test.mjs scripts/measure-native-audio-latency.test.mjs scripts/audio-descriptors-device.test.mjs`; expect absent modules/assets before writing implementation.
- [x] Implement the per-sample recurrence in spec §4.1 as the JS **test reference** and MSP objects in the patch; JS reference never runs in the shipped musical path. Connect stereo `plugin~` directly to `plugout~`; branch energy separately. Initial slot arms explicit Remote, one target chosen locally in Max and id0 release. Modulate wiring exists but arm is unavailable until bipolar capability is proved. Expose `_RC PairNonce` and version; add local OFF before connecting any real target.
- [x] Builder reads source `.maxpat`, uses `writePatch(...,'audio')`, copies declared companions to output folder. Unit tests parse emitted container with `readPatch`, verify `aaaa`, both untouched signal wires, no delay/FFT/network object between plugin/plugout, no Node object feeding slot signal, and id0 release path. These structural tests do not claim Max runtime success.
- [x] Implement metering with rising-edge indices, a bounded association window (100 ms), sorted delay distribution and nearest-rank P95. Count unmatched reference/response separately. Test silence, missing hits, negative/control-route offsets, unequal lengths and repeated edges. CLI accepts explicit channel assignment and writes measurements only to caller-specified evidence directory; include raw file hashes and all measurement parameters.
- [x] Prepare manual protocol `internal/NATIVE-AUDIO-VALIDATION.md`: user loads experimental folder, routes isolated pulses and audio-reference gain target, closes Max editor, records ≥200 attacks and control route. Never ask the agent to click Live. Store WAVs/logs in ignored `.agent-context/runtime/native-audio/`, summary metrics and settings (not private recordings) in validation doc.
- [ ] In the same real runtime, user proves: Node for Max reads the isolated probe rendezvous and HTTP client works; SDK sees `_RC PairNonce` and exact 24-bit nonce through its existing parameter editor; persistent device UUID and newly generated runtime UUID behave differently on save/load/duplicate as specified; target LOM paths correlate with SDK catalog without ID equality assumptions; Modulate zero neutrality only for proven bipolar targets and rejection for unipolar/unknown targets; Remote takeover/release; independent stereo pass-through null comparison. Never discover polarity by audibly sweeping a user's synth. Record literal versions and errors, not “should work”.
- [ ] **Gate A:** approve only with transient P95 ≤10 ms reference measurement, no isolated misses, safe target release, valid pair/identity and supported Node runtime. Measure Remote and any eligible Modulate mode separately. Lack of proven bipolar targets can leave Modulate unavailable, visibly documented, while explicit native Remote remains a valid prototype; it is not permission to silently change saved mode. No exact-node-copy mapping auto-arm until copy detection tested. If waiting for user recordings, record `WAITING_FOR_OWNER_EVIDENCE` and stop broad implementation. Do not discard the prototype or switch silently to SDK transport.
- [x] GREEN numeric/structural tests; mutate sample offset, one stereo wire and missing id0 cleanup separately. Run `npm test`, then `npm run lint`; exact-path unsigned commit `feat: prototype native audio attack modulation`. Commit can preserve a clearly experimental prototype before manual gate approval; subsequent tasks require Gate A passed.

### Task 3 — spectral DSP and all twelve shaped signals

**Files:** create `max/audio-descriptors/rc-spectrum.maxpat`, `rc-spectral-reduce.maxpat`, `rc-group-shaper.maxpat`; modify `device.maxpat`, `rc-fast-attacks.maxpat`, `rc-device-control.js`, builder asset list, `scripts/native-audio-reference.mjs` and tests; create `scripts/native-audio-parity.test.mjs` and fixture generator `scripts/generate-native-audio-fixtures.mjs`.

**Interfaces:** native DSP yields twelve ordered signal outlets in the `Descriptor` order from contract plus RMS/envelope and frame geometry. `makeAudioFixtures({sampleRate:number,seconds:number,seed:number}): Record<string,{left:Float32Array,right:Float32Array}>` in fixture generator exports deterministic silence, tones 80/1000/6000 Hz, impulses, white/pink noise, sweeps and antiphase cases. `compareDescriptors(expected:Values,actual:Values,{fftSize,sampleRate}): {ok:boolean, failures:string[]}` in reference module implements spec tolerances.

- [ ] Add RED reference/asset tests, with antiphase and high-band correctness made explicit:

```js
const fixtures = makeAudioFixtures({ sampleRate:48000, seconds:1, seed:7 });
assert.equal(fixtures.antiphase.left.length,48000);
for (let i=0; i<48000; i++)
  assert.equal(fixtures.antiphase.right[i],-fixtures.antiphase.left[i]);
const expected = makeFrame().values;
assert.equal(compareDescriptors(expected, {...expected,high:NaN},
  {fftSize:2048,sampleRate:48000}).ok,false);
```

The zero-vector example checks invalid-value rejection only. Numerical parity cases compute expected values using the existing spectral module with matching FFT normalization on a named fixture, not the new Max algorithm. Actual parity tests consume recorded native exports and fail/skip explicitly if absent; never substitute reference for actual.

- [ ] Run `node --test scripts/native-audio-parity.test.mjs scripts/native-audio-reference.test.mjs scripts/audio-descriptors-device.test.mjs`; record missing new behavior/assets as RED.
- [ ] Implement per-channel `pfft~` spectra, frame-boundary DSP reductions and held outputs using spec formulas; normalize FFT magnitude/window explicitly before comparison. Use independent fast attack filter/envelope path. Frame reduction pseudocode:

```text
for each eligible bin: P=(PL+PR)/2; M=sqrt(P)
accumulate sum(P), sum(M), sum(f*M), sum(f*f*M), sum(log(P))
retain normalized magnitude per bin for next-frame L1 flux
at frame boundary: derive centroid/spread/flatness/rolloff/bands,
                   publish once and reset accumulators
```

Rolloff needs total power before crossing cumulative 95%; use bounded per-frame bin storage/double buffering, not a threshold based on previous-frame total. Allocate once per window change; no JS per-bin work or unbounded dict history. Handle zero bins explicitly for flatness. Brightness uses the existing log-frequency magnitude formula, with tested normalization, not an alias for high RMS.

- [ ] Implement group gain/smoothing, fast release, 1/128 T/D timing and local Live-tempo observer in Max. Preserve separate FREE preferences and shaping state on BPM edits. Verify `window` switches only spectral analysis; resetting FFT invalidates first flux and publishes readiness metadata, not stale measurements.
- [ ] User records native fixture outputs at 44.1/48/96k, all windows, mono-equivalent and stereo antiphase; compare to reference tolerances. Quantify kick/snare onset misses/cross-band responses separately on isolated hit fixtures; report mixed-music limitations without classifier claims. Log CPU and audio dropouts at 1/4/8 devices and twelve slots active; measurement owns release decision, not fabricated CPU percentages.
- [ ] GREEN deterministic tests + real parity evidence; mutation tests break Hann correction, stereo power averaging, flux reset and Hz-gain exclusion one at a time. `npm test`, then `npm run lint`; unsigned exact-path commit `feat: add native spectral audio descriptors`.

### Task 4 — authenticated local bridge, binding and bounded telemetry

**Files:** create `src/native-audio/bridge.ts`, `registry.ts`, `tests/native-audio-bridge.test.mjs`, `tests/native-audio-registry.test.mjs`; modify `src/server/http.ts`, `state.ts`, `src/extension.ts`, `max/audio-descriptors/rc-bridge.cjs`, `rc-device-control.js`. Shared decoders from task 1. Add `scripts/native-audio-bridge-client.test.mjs` for companion without needing max-api installed (dependency injection).

**Interfaces:** `NativeAudioRegistry({now:()=>number})` exposes `bind(binding:SourceBinding):void`, `acceptFrame(frame:Frame):boolean`, `acceptSnapshot(snapshot:DeviceSnapshot):boolean`, `touch(instanceId:string):void` for a validated heartbeat, `getState(bindingId:string):{status:string,frame?:Frame,snapshot?:DeviceSnapshot}`, `remove(instanceId:string):void`; `NativeAudioBridge({registry,actualPort,privateDir,now})` exposes async `start()`, `stop()`, `handle(req,res):Promise<boolean>` (false for nonmatching route). Companion `createBridgeClient({http,fs,maxApi,now,rendezvousPath})` exposes `start()`, `publish(frame:Frame)`, `stop()`; runtime supplies real builtin modules, tests use fakes. Registry emits sanitized events through host composition, no Live writes in `acceptFrame`. `touch` cannot refresh the timestamp of a missing DSP frame; heartbeat and measurement freshness have separate clocks.

- [ ] Add RED tests for freshness, routing and writer isolation:

```js
let now=0;
const registry = new NativeAudioRegistry({now:()=>now});
const binding = makeBinding();
registry.bind(binding);
assert.equal(registry.acceptFrame(makeFrame({seq:2})),true);
assert.equal(registry.acceptFrame(makeFrame({seq:1})),false);
now=251;
assert.equal(registry.getState(binding.bindingId).status,'track-stale');
```

`binding` uses the same fixture instance UUID as `makeFrame`; tests stub host mapping/SDK entrypoints with functions that throw if telemetry reaches them.

- [ ] Run `node --import tsx --test tests/native-audio-bridge.test.mjs tests/native-audio-registry.test.mjs` and `node --test scripts/native-audio-bridge-client.test.mjs`; expect missing classes/routes before implementation.
- [ ] Implement private atomic rendezvous and authenticated exchange per spec §6, including Windows ACL verification and second-live-host conflict. Restrict cleanup to own epoch file. Test permissions failure, stale rendezvous, 401/rotation, unexpected redirect, interrupted write, port fallback, HTTPS route rejection, forged Origin/Host, LAN peer, wrong bearer, oversized body and log redaction. No network listener on Max. Readiness requires nonce challenge with selected SDK device, not just version/name.
- [ ] Companion latest-only loop and idle long-poll behavior:

```text
publish(frame): overwrite latest; merge only <=100ms attack peaks
exchange loop: send latest + pending ACK; at most one request
host idle response: wait <=1s, wake for pending config/subscriber
active response: immediate, next send limited to 30Hz
reconnect: reread rendezvous; clear old command/frame epoch; fetch snapshot
```

- [ ] Test fake slow server with 1000 publishes: one in-flight and one latest frame, bounded peaks, no replay of intermediate frames. Device OFF still heartbeats; silence stays live; stale label 250 ms, disconnected 3 s. Subscriber changes adjust telemetry without changing DSP scheduling or native ON/OFF. Sequence/revision/epoch rejection cannot resurrect retired bindings.
- [ ] GREEN focused tests; mutate bearer/peer checks, nonce matching, stale cutoff, queue cap and callback generation guard; all corresponding tests must fail. `npm test`, then `npm run lint`; exact-path unsigned commit `feat: bridge native audio state over authenticated loopback`.

### Task 5 — transactional configuration, target ownership and persistence

**Files:** create `src/native-audio/commands.ts`, `targets.ts`, `src/live/native-target-ownership.ts`, `tests/native-audio-commands.test.mjs`, `tests/native-audio-targets.test.mjs`, `tests/native-target-ownership.test.mjs`; modify `src/live/catalog/index.ts`, `src/server/command-dispatch.ts`, `src/live/mappings.ts` only at conflict boundaries, `rc-device-control.js`, `rc-native-slot.maxpat`, `device.maxpat` and related tests.

**Interfaces:** `configureNativeAudio({bindingId,expectedRevision,change},session):Promise<DeviceAck>`; pure precondition `assertNativeWriteAllowed(role:'viewer'|'controller'|'admin',actualRevision:number,expectedRevision:number):void` throws coded Error; `prepareNativeTarget(target:TargetRef):Promise<{preparedId:string,target:TargetRef}>`, valid for 2 s and consumed once on commit; `NativeTargetOwnership` exposes `reserve(targetKey:string,ownerId:string):boolean`, `release(targetKey:string,ownerId:string):boolean`, `owner(targetKey:string):string|null`. Refactor/export existing physical target-key resolution if needed; Browser and native must share the same identity, not independently stringify indices. Store device state in Max/pattr with schema version 1, distinct persistent UUID and runtime UUID.

- [ ] Write RED authorization and stale revision tests:

```js
assert.throws(() => assertNativeWriteAllowed('viewer',1,1),
  {code:'unauthorized'});
assert.throws(() => assertNativeWriteAllowed('controller',1,0),
  {code:'revision_conflict'});
assert.doesNotThrow(() => assertNativeWriteAllowed('controller',1,1));
```

In addition to these pure tests, integration tests send a fixture binding/settings request through the existing authenticated dispatcher with a transport spy. The viewer and stale-revision cases must leave spy call count at zero; controller is a real test session, not middleware bypass. Cover successful confirmed ACK to prove the handler does not merely reject every request.

- [ ] Run `node --import tsx --test tests/native-audio-commands.test.mjs tests/native-audio-targets.test.mjs tests/native-target-ownership.test.mjs`; expect missing handlers/ownership guard failures.
- [ ] Add explicit command side-effect entries and existing session authentication. Read/subscription is viewer-safe; no privilege escalation from UI. Implement one transaction/device, expectedRevision, applied ACK and timeout; error codes `unauthorized`, `revision_conflict`, `config_timeout`, `device_missing`, `device_stale`, `target_changed`, `target_conflict`, `target_ineligible`, `modulation_kind_unsupported`, `needs_relink`, `unsupported_version`, `bridge_permissions` are stable and translated later. Max local knob edits increment revision and supersede pending outdated requests. Preparing a slot does not increment revision; successful commit/change/remove increments once. Cache the last 32 command IDs with their ACK in the current host epoch for duplicate suppression; clear on epoch change, do not persist pending commands.
- [ ] Implement prepare/revalidate/commit for indexed SDK→LOM targets. Resolving target never begins modulation. At commit, compare catalog generation/fingerprint, acquire shared ownership then engage Max slot; rollback reservation if ACK rejects. For lost ACK, reconcile snapshot before releasing reservation or retrying; device may already be modulating. Key lifecycle pseudocode:

```text
prepare -> resolve without attach -> token(2s)
commit -> revalidate + reserve -> native attach -> confirmed snapshot
unknown ACK -> pending/unknown ownership -> read actual state, no blind retry
  explicit remove/OFF -> native detach (id0 for both object types) -> ACK -> release reservation
phone loss -> keep native state and reservation
```

- [ ] Test all twelve slots, descriptor fan-out to different targets, duplicate physical target rejection across native devices and Browser, quantized/self target rejection, target deletion, track/device reorder/rename, undo, send-index changes, duplicate devices, Set reload and differing browser/local settings. Device local OFF is always reachable. Max restore must be safe before bridge starts; host restart blocks conflicting acquisitions until registry reconciles device state. No active reference may be cleared just because a client disconnected.
- [ ] User proves actual Modulate/Remote semantics, release of automation ownership, persistence and copy desarming. Without that evidence, keep capability experimental and document manual gate open. GREEN tests; mutation proof for viewer, expectedRevision, two-phase attach, conflicts and disconnect cleanup. `npm test`, then `npm run lint`; exact-path unsigned commit `feat: control native descriptor mappings safely`.

### Task 6 — source selector, device-backed controls and native MAP

**Files:** create `static/phone-v3/audio-source-controller.js`, `audio-source-controller.test.mjs`, `tests/ui/audio-native-source.spec.mjs`; modify `static/phone-v3/{app.js,index.html,style.css,audio-workspace.js,audio-timeline.js,mapping-mode.js,mapping-input-contract.js}`, affected tests, `src/server/ws.ts`, `static/panel/mappings.js`, `static/shared/i18n-catalog.js` and source catalog integration as needed. Preserve current descriptor IDs and Browser dispatcher.

**Interfaces:** `createAudioSourceController({browser,commands,onState,onFrame})` returns `{select(source:SourceSelection):Promise<number>,setEnabled(enabled):Promise<void>,configure(change):Promise<void>,accept(event):void,dispose():void}`; the returned number is the new generation. An unbound track is a valid selection and shows missing/connecting until compatible device binding exists. Browser dependency has async `start()`, `stop()` and subscription controlled only by this adapter; `commands(name:string,args:object):Promise<unknown>` calls the named role-gated commands above. `select` increments generation before awaiting old shutdown; no hidden auto-start. UI consumes only its current generation/binding and confirmed snapshot. Runtime app instantiates the controller; the module itself remains testable with injected dependencies.

- [ ] Add RED state test with a spy browser and fake command transport:

```js
const binding = makeBinding();
const snapshot = makeSnapshot({enabled:true});
let browserStarts=0;
const sent=[];
const paintedFrames=[];
const controller = createAudioSourceController({
  browser:{start:async()=>{browserStarts++;},stop:async()=>{}},
  commands:async(name,args)=>{
    sent.push({name,args});
    if (name==='getNativeAudioSources') return {tracks:[],bindings:[binding]};
    if (name==='configureNativeAudio') return {
      commandId:'00000000-0000-4000-8000-000000000007',ok:true,code:'ok',
      snapshot:{...snapshot,revision:2,enabled:false}
    };
    return {snapshot};
  },
  onState:()=>{},onFrame:frame=>paintedFrames.push(frame)
});
const generation = await controller.select({kind:'track',track:binding.track,
  deviceIndex:binding.deviceIndex,bindingId:binding.bindingId});
assert.equal(browserStarts,0);
const event={type:'native_audio_state',bindingId:binding.bindingId,
  generation,status:'track-ready',snapshot,frame:makeFrame(),receivedAgeMs:0};
controller.accept({...event,generation:generation-1});
assert.equal(paintedFrames.length,0);
controller.accept(event);
assert.equal(paintedFrames.length,1);
await controller.setEnabled(false);
const off=sent.findLast(item=>item.name==='configureNativeAudio');
assert.equal(off.args.change.kind,'enabled');
assert.equal(off.args.change.enabled,false);
```

Import `makeBinding`, `makeSnapshot`, `makeFrame` from the task 1 helper. Add a separate missing-device case with a track row but no binding: it must show `track-missing` and never call `browser.start` or insert a Max device. The valid-event assertion prevents a vacuous implementation that ignores every frame.

- [ ] Run `node --test static/phone-v3/audio-source-controller.test.mjs`; expect absent adapter and ownership behavior. Implement adapter and hooks in app, not a second DSP controller hidden in workspace. Stop and disconnect current Browser capture before Track subscription, and ignore late microphone-start promise results. Selecting Browser after Track presents OFF until explicit user start.
- [ ] Add compact source selector and track/device state near Audio input; multiple compatible devices on one track require explicit choice with chain index. Missing device instruction includes exact new .amxd name and after-instrument placement. Viewer sees settings read-only; enable/map requires controller. OFF/error/pending/stale distinguish local intent from actual device state. No success toast before ACK.
- [ ] Reuse existing twelve cards, group knobs, Hz labels, normalized graph scale and legend. Track frames enter graph directly, not `sendControl`. Add RMS/envelope from device without retired gate threshold/legend/shading on active amplitude view; preserve existing `sensor.audio.gate` mappings for Browser outside visual cleanup. Track offers only channels actually supplied, not fake Gate/pitch values. Graph history rejects old binding and exposes attack peak visualization semantics.
- [ ] Connect group knobs and global SYNC to confirmed Track settings; pending knob intent coalesces and reverts/refreshes on rejection without stealing focus. Opening another phone shows device state, not its localStorage values. Browser's saved FREE/SYNC preferences remain unchanged. Existing Browser mappings must not also fire on native telemetry.
- [ ] Native MAP selects a descriptor, native slot, eligible target and explicit Modulate/Remote semantics. Display target conflicts and native ownership in phone/panel. Existing browser mappings remain editable but cannot write an owned native target. No MIDI insertion attempt or automatic old mapping migration.
- [ ] Run adapter/workspace/timeline/mapping focused tests and `npx playwright test tests/ui/audio-native-source.spec.mjs tests/ui/audio-spectral-workspace.spec.mjs`. Test seven existing viewports, stage on/off, touch and keyboard; two authenticated sessions, viewer denial, local Max update vs phone drag, lost Wi-Fi, late ACK, rapid source switches, no device/removal, and zero `getUserMedia` calls in Track. Stubbed UI tests are not proof of Live connectivity.
- [ ] Mutation-proof generation filter, no-microphone guard, telemetry-to-mapping isolation and role-disabled UI. `npm test`, then `npm run lint`; exact-path unsigned commit `feat: add native track audio workspace`.

### Task 7 — portable device folder, bilingual docs and gate B

**Files:** modify `scripts/build-audio-descriptors.mjs`, `build.ts`, `scripts/package-tester-kit.mjs`, `scripts/package-tester-kit.test.mjs`, `scripts/audio-descriptors-device.test.mjs`; create `max/audio-descriptors/manifest.json`; modify `docs/{USER-GUIDE,USER-GUIDE.pt-BR,CUSTOMIZATION,CUSTOMIZATION.pt-BR,INSTALL,INSTALL.pt-BR,AUDIO-AUDIT,AUDIO-AUDIT.pt-BR,SECURITY,SECURITY.pt-BR,PRIVACY,PRIVACY.pt-BR}.md`, `docs/index.html`, `docs/site-i18n.js`, `static/shared/i18n-catalog.js`, `internal/TESTER-GUIDE.md`, `internal/NATIVE-AUDIO-VALIDATION.md` as relevant. Worktree security docs only; preserve unrelated main checkout.

**Interfaces:** `max/audio-descriptors/manifest.json` declares version 1 and exact relative assets; `stageNativeDevice(outDir)` from task 2 generates `RC-Audio-Descriptors/RC-Audio-Descriptors.amxd` and all companions, returns all relative files for checksums. `build.ts` calls builder after static copy into `dist/static`, without writing installed AppData. Tester-kit manifest supports old two flat MIDI .amxd files plus new folder, one canonical list used by staging and hashes.

- [ ] RED packaging test verifies every relative dependency and checksum, not just the main .amxd:

```js
const files = await stageNativeDevice(tempDir);
assert.ok(files.includes('RC-Audio-Descriptors/RC-Audio-Descriptors.amxd'));
assert.ok(files.includes('RC-Audio-Descriptors/rc-bridge.cjs'));
assert.ok(files.includes('RC-Audio-Descriptors/rc-spectrum.maxpat'));
assert.ok(files.every(file => !file.includes('..')));
```

Use a fresh OS temp directory through test helpers; clean only verified test-owned paths. Add a case omitting rc-spectrum from staged manifest: it must fail dependency closure validation.

- [ ] Run `node --test scripts/package-tester-kit.test.mjs scripts/audio-descriptors-device.test.mjs`; record RED. Implement canonical asset closure and deterministic build, preserving old Sender/Receiver bytes. Do not claim the amxd writer freezes Node/scripts/patchers. Exclude test fixtures, credentials and private rendezvous from dist and kit.
- [ ] Document installation of the entire folder, Browser vs Track, native mapping differences, local device OFF, missing/stale/error handling, new timings, linear RMS bands, no BPM detector, max slots/devices, one-host-per-user limit, and measured latency conditions. Replace stale tester steps requesting retired pitch controls or four cards. Do not describe unmeasured OS support as validated.
- [ ] **Gate B:** user loads folder in clean supported Windows/macOS environment without repo/search paths/extra npm packages; verifies signal, descriptors, pairing, save/reopen and target release. Verify actual permission model/rendezvous ACL per platform. Missing OS evidence means that platform remains explicitly experimental. Unsupported Max APIs or bundle failures are visible capability failures, not fallback to high-latency modulation.
- [ ] GREEN packaging/docs tests; mutation proof removes one companion and introduces one secret/private path into asset manifest, both rejected. `npm test`, then `npm run lint`; exact-path unsigned commit `feat: package and document native track audio`.

### Task 8 — final regression, release boundary and continuation

**Files:** validation doc, this progress table, existing ignored handoff and Workflow Main task pointer. Change product source only for newly proven in-scope defects, each with RED/GREEN regression.

**Interfaces:** consumes gate A/B evidence and all automated outputs; produces an honest readiness matrix, exact tested commit and next manual action. No feature is marked stable on static tests alone.

- [ ] Run canonical gate with dev sync disabled:

```powershell
$env:ABLETON_RC_DEV_SYNC='0'
npm run ci
git diff --check
git status --short --branch
```

- [ ] Verify Browser-only regression, twelve IDs/units, preserved Follow-off flag, unrelated MIDI features, no new LAN listener, no audio buffers in frames, no native telemetry invoking SDK writes, and old settings migration. Review changed diff in-place SOLO; avoid rewriting unrelated large modules.
- [ ] Run/record each mutation guard from tasks 1–7 with byte/status restoration. Check no transient mutation remains. Inspect responsive screenshots from headless test artifacts if allowed; no user-app control. New gates must not be skipped under a generic “Max unavailable” result without recording native validation as pending.
- [ ] Have owner confirm real modulation with intended synth, no sticking after OFF/removal, ongoing sound with Wi-Fi off, two-phone state coherence, sync at new divisions, and acceptable descriptor behavior on actual music. Physical latency, quality and responsiveness are separate checkboxes, not inferred from an attractive graph.
- [ ] Update progress, real performance table, unsupported cases and next action. Set capability/release status to experimental until required real gates pass. Producing a release .ablx or updating installed files requires the existing release authorization/gates and must not happen merely because implementation tests pass.
- [ ] If making final code/doc commit, `npm test`, then `npm run lint`, exact paths, unsigned human commit. Finalize/re-check curated repo context only after reviewing affected claims. Report exact commit and whether working tree is clean. No remote action.

## Pendências adjacentes — não esquecer, não misturar o escopo

- AUDIO SYNC 1/128 + T/D: incorporado na tarefa 1 e portado ao dispositivo na tarefa 3.
- Gate visual legado: limpeza pequena na tarefa 6; não apagar `sensor.audio.gate` armazenado ou mudar seu comportamento Browser.
- MIX: ainda pendente uma tarefa independente de redesign no estilo flat AUD + 8 knobs/8 faders. Preservar IDs 1..6, acrescentar 7/8, atualizar catálogos/mappings/templates/testes responsivos. Não presumir concluído por haver 12 slots nativos, que são outra coisa.
- Seletor de **dispositivo** de captura do Browser (deviceId, enumerateDevices após permissão) é uma melhoria independente; o seletor Browser/Track desta entrega não promete implementá-lo.
- Eixo vertical extra: não solicitado; usuário aceitou o range 0..ceiling já exibido.
- Follow/velocity mínimo antigo: feature aposentada a pedido do usuário por qualidade insatisfatória. Não gastar a implementação Track tentando reativá-la.

## Checklist do planejamento (não da implementação)

- [x] Desenho e plano juntos, em arquivos rastreáveis pelo Git, sem depender da conversa.
- [x] Baseline, worktree, limites de autorização e modo SOLO registrados.
- [x] Gate de áudio real precede integração extensa; números são metas, não promessas.
- [x] Contratos, paths, testes, segurança, estados, persistência e distribuição explicitados.
- [x] Melhorias adjacentes registradas sem confusão com feature implementada.
- [ ] Execução das tarefas 0–8: em andamento; Tasks 0–1 concluídas, protótipo da Task 2 preparado; Gate A manual pendente.

## Verificação da entrega inicial de planejamento — 2026-09-06 (histórico)

Revisão SOLO conferiu cobertura do desenho, dependências entre tarefas,
referências de arquivos e contratos de estado. Corrigidos no próprio plano:
neutralidade não universal de Modulate, dependência circular do protótipo na
ponte final, seleção de track ainda sem dispositivo, DSP/FFT indisponíveis e
separação de timing FREE/SYNC. Fontes primárias estão no spec.

`npm test` e, em seguida, `npm run lint` passaram nesta entrega com
`ABLETON_RC_DEV_SYNC=0`. São regressões do código existente; não validam o
dispositivo proposto. Não foi executado build/empacotamento, UI real ou teste
Live; nenhum código funcional foi modificado. A próxima implementação começa
na tarefa 0, usando o HEAD então observado, sem marcar testes físicos como feitos.
