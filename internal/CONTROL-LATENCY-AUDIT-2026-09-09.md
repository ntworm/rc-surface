# Control latency audit / Auditoria de latência

Current: r8 narrows LFO bandwidth to 4 Hz and corrects Auto pin clearing through
controls → app serializer → host. See r8 evidence at the end; r7 notes below are
historical. Physical audio/latency and owner waveform acceptance remain pending.

Scope: active `src/`, `static/phone-v3/`, `static/panel/`, `static/admin/`,
their tests and the bundled SDK implementation. Not a claim of measured Live,
Wi-Fi or audio-buffer latency. No install, push, tag or public release.

## Confirmed defects / Defeitos confirmados

### r7 follow-up: pause animation (2026-09-10)

Owner reports stutter responsive, no apparent issue; accepts continuing. LFO
alignment improved, but high-frequency noise/jitter still failed. Do not reopen
Receiver/XY/stutter microtests or declare the high-frequency investigation closed.

Confirmed RED: browser SYNC branch used frozen playhead even after Stop, whereas
host already free-ran. r7 advances local phase when paused/internal clock; Play
re-locks to the absolute beat. Host stopped-clock fallback now honors pinned
LFO subdivision (previously chose rate's table entry instead). Three browser
regressions and one host regression failed before the patch and pass afterward.
No stutter engine/axes changes, transport mutation or per-frame control messages.
Existing fallback20Hz ceiling retained; no new limit or physical rate claim.

The owner's SYNC→FREE jump is recorded, lower priority, not declared fixed here.

#### High-rate decision, not implementation

Keeping SDK parameter writes retains the existing editable target-automation
workflow, but would require a measured, explicitly supported frequency range;
no universal threshold has been established for this machine/Set.

A native Max oscillator is a candidate for signal-rate delivery, not an automatic
drop-in. Official references checked2026-09-10:

- [live.remote~](https://docs.cycling74.com/reference/live.remote~/): signal input
  can be applied sample-accurately with one buffer latency, but parameter control
  disables that parameter's automation during ownership. Smoothing defaults1ms
  and downsamples signal input. No promise of identical recorded target envelopes.
- [live.modulate~](https://docs.cycling74.com/reference/live.modulate~/): signal-rate
  modulation leaves the nominal value editable, but applies an offset with
  parameter-dependent scaling. This is not the current absolute-value mapping
  contract and does not establish recording the generated wave as target points.

Before choosing a native technique, ask whether editable generated target curves
are required or recording LFO rate/depth/activation can meet the user's workflow.
No implementation of either option, no new AMXD or license/platform promise.

### r6 follow-up: stutter + FREE phase (2026-09-09)

The r5 owner trial failed for fast LFO shape and stutter backlog. The earlier
XY acceptance does not approve these modulators.

- Confirmed RED: analog `button-N` went through discrete FIFO. A held SDK
  promise replayed stale amplitudes. r6 routes it through the physical-target
  latest-value actuator, sharing one writer with LFO/XY. Explicit toggle/MIDI
  mappings remain ordered. OFF and client clear bypass smoothing and supersede
  unsent pulses; one SDK call already sent cannot be recalled.
- Confirmed RED: missing stutter depth setter/snapshot integration and reversed
  axes. r6 uses X=rate, Y=depth and Mode B release by amplitude; legacy snapshots
  without depth keep the current amplitude. No ratchet-data reinterpretation.
- Confirmed RED: FREE LFO recomputed elapsed history using each new frequency.
  At t=12.123s, changing rate .2→.9 changed normalized output .985697→.755142
  without advancing time. r6 preserves phase, timestamps configuration updates,
  and integrates FREE LFO snapshot rate ramps across dropped ticks.
- Independent scoped read-only review: no blocking defect found; 22 targeted
  tests passed. Full CI initially passed 698 static + 416 host + 126 UI tests,
  lint, TypeScript and production build. Final rerun recorded in runtime log.

**Not resolved/proven:** fast LFO fidelity in actual Live automation. The SDK's
`DeviceParameter.setValue` returns a callback-completed Promise; no guaranteed
sample cadence was found. A 4ms generator target is not a 4ms delivery guarantee.
SYNC at120BPM/subdivision1/16 can request32Hz, despite older nominal20Hz comments.
No new frequency ceiling has been added. Browser SYNC preview can freeze with
stopped transport while the host falls back; it is not measured target readback.

Read-only Live check found a stopped120BPM session and Auto Filter Frequency
as a continuous0..1 parameter, internal LFO amount0. The API returned no Set path.
Owner was asked for the saved `.als` to count recorded points and compare the
LFO segment with stutter after bar50. Screenshots alone cannot certify point
density or distinguish generation, SDK cadence and automation thinning.

PT-BR: eixos, amplitude, fila analógica/OFF e fase FREE corrigidos localmente.
O LFO rápido continua **não aprovado**. Obter o `.als` antes de afirmar taxa real;
se a entrega não sustentar a onda, decidir com o dono entre motor nativo no Live
e faixa de frequências validada. Não reabrir microtestes de Receiver/XY aceitos.

| Path | Before | Correction |
| --- | --- | --- |
| `app.js:onControl/sendLoop` | XY/MIX/pads/sensors only actuated from snapshots, 33 ms normally and 500 ms during MAP | Negotiated `control_frame` independent of visual snapshots; leading immediate + trailing 8 ms throttle, never debounce |
| `mappings.ts` → actuator | Smooth 0 still interpolated timed controls; sub-10ms cadence switched to another writer | One physical-target continuous actuator, immediate when no explicit smoothing, drain latest on SDK completion |
| `write-scheduler.ts` | One slow target held all discrete queues | Independent per-key drains; per-key FIFO and clear invalidation retained |
| LFO mapped to continuous parameter | Analog LFO samples accumulated in a discrete FIFO | Latest-only physical-target actuator; explicit toggle/boolean/note modes remain ordered |
| Main picker | Every device parameter rendered flat before tracks | Reuse track/device hierarchy; Tempo remains global/direct; duplicate search listener removed |

## Bounded protocol / Protocolo limitado

- Host `hello.controlStreamVersion=1` enables the new path per socket. The new
  phone falls back on old hosts; old phones continue using old packets. Updating
  only the host does not retroactively speed up old pages: reload is required.
- New snapshots set `controlsRealtime:true`: visual/admin data only. They cannot
  actuate controls or the legacy motion/orientation fallback, replay old pads,
  or echo another performer's values back to Live.
- Shared control/audio batch: first immediate, at most 125 subsequent frames/s,
  maximum 128 entries; finite normalized scalar or XY only. Discrete duplicates
  in one frame are intentional ordered edges; unchanged discrete heartbeats are
  deduplicated. Equal continuous sensor samples stay fresh for filter recovery.
- Continuous unsent history is replaced, not replayed. Pending samples expire
  after 120 ms of congestion. Discrete expiry/overflow closes the socket and
  invokes existing host safe-loss; no stale press is replayed after reconnect.
- Same authentication (`live-write`), payload and 300/s sustained / 600 burst
  limits. Shared control/audio 125 + modulator config 120 + snapshots 31 +
  gate/command allowance 20 + heartbeat 1 = 297/s. This is a modeled envelope,
  not a guarantee for arbitrarily many concurrent modulator gestures.
- New and old protocol paths retain tests. Rollback: restore the previous
  candidate and reload the page; mappings/presets are not migrated or deleted.

## Timers retained deliberately / Tempos mantidos de propósito

| Area | Timing | Why it does not add an artificial control wait |
| --- | --- | --- |
| Snapshot/admin/remote display | 33–500 ms, admin gates 50–1000 ms | Observability only on negotiated clients; no Live actuation |
| SDK state + OSC fallback reads | 500 ms | Polls transport/state feedback, not outbound parameter commands; listeners provide updates where available |
| LFO/stutter engine | 4 ms | Host-local generation; no phone audio round trip |
| Explicit Smooth + release | actuator tick 20 ms, user-defined ramp | Intentional musical/safety envelope; Smooth 0 bypasses the ramp |
| Gesture, audio FFT, gate/release | frame/window/envelope dependent | Detection and intentional behavior, not network debounce; do not silently change musical meaning |
| Transport clicks and MIDI packets | immediate calls, SDK completion ordering | SDK `setValue` directly enters `withinTransaction`; JS SDK contains no polling delay in this write method |
| Reconnect, heartbeat, UI highlights | various | Lifecycle or visual timers, not normal connected control cadence |

The host data model behind `withinTransaction` is outside this repository. Browser
event loop throttling, Wi-Fi contention, SDK transaction completion, Live UI refresh
and audio buffers still impose latency. 8 ms is not measured end-to-end latency.

## Verification / Verificação

RED reproductions cover flat Main, timed XY concurrent SDK writes, head-of-line
blocking, and stale LFO playback; new stream tests cover first/trailing delivery,
continuous gestures, edge order, bounds, backlog, reconnect, remote echo and
mixed-version behavior. Real WebSocket tests enforce authorization and visual-only
snapshots; browser tests exercise real pointer moves with MAP open on desktop and
mobile layouts. Final command results and candidate hash are recorded in the
master plan and candidate README after the final run.

Two OSC tests initially failed because other local Node processes owned all three
production listener ports. Tests now allocate private loopback ports and a private
destination; no process was stopped and production port/security settings are
unchanged. This distinguishes environment conflict from control regression.

## Próximo teste humano (uma rodada, sem microtestes do Receiver)

Na candidata nova e com a página recarregada: use XY/Pan e MIX em movimentos rápidos
com MAP aberto e fechado; confira movimento durante o gesto e a posição final.
Confira Main → dispositivo → parâmetro no picker. O benchmark de áudio/latência
gravado continua pendente, separado dessa conferência funcional.
## 2026-09-10 r8 follow-up — LFO bandwidth

User offered limiting the usable LFO range or changing technique, then requested
resolution. Chosen: preserve editable target automation, narrow LFO to4Hz.
Confirmed previous code allowed64Hz at120BPM with pinned1/32 beat, while FREE
and paused fallback used20Hz. UI/host now FREE .1–4Hz; SYNC Auto filters musical
divisions, pinned too-fast values slow by octaves. No actuator/throttle changes.

Independent review additionally reproduced stale host pin after selecting Auto,
and preview exceeding cap from malformed snapshot rate2. Both fixed with
RED/GREEN proof: explicit JSON null clears LFO pin only; .rate finite/clamped.
Omission remains a partial-update no-op, stutter untouched. Real-browser settings
tests show effective subdivision and frequency on desktop/mobile.

Auto null is retained through the real app.js WebSocket serializer; independent
re-review approved the final fix after the new wire regression passed.
Fresh CI:717 static +431 host +128 UI =1276 PASS; lint/TS/build. All74 members
of the r8 ABLX match build hashes. Artifact location/hash in the master plan.
Log: `.agent-context/runtime/lfo-bandwidth-r8-ci.log`. Modeled14–19ms sampling
checks exact written sine values and bounded interpolation with duplicate
suppression; it is NOT a Live measurement. Actual SDK delivery/automation point
density and physical audio latency remain unmeasured. No claim of native-rate
fidelity or seamless SYNC/FREE transition. Do one integrated LFO check, not the
old fragmented Receiver/stutter battery. r7 and older artifacts preserved.
