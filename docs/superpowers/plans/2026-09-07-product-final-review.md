# RC Surface — plano mestre de revisão final

## Handoff atual

Ler internal/HANDOFF-2026-09-13.md. Próxima frente solicitada: tratar sensores
conforme capacidades reais no PC/celular, sem avisos enganosos no desktop.
Ainda não implementada. R13 entregue aguarda validação física. Bootstrap do
Workflow Main passou na conferência do handoff; falha de orçamento abaixo é histórica.

## Atual — CALIBRAR contextual implementado, aguardando teste — 2026-09-13

Pedido aprovado: botão por SNS/AUD/VID; execução SOLO, sem Max novo.
Plano delimitado concluído: 2026-09-13-contextual-calibration.md nesta pasta.
SNS coleta1s estável; AUD5s de som tocando ajusta só RMS/envelope; VID4s verifica
luz/detecção e ativa apenas modos automáticos suportados/confirmados. Não muda
gestos, posição neutra da mão, confiança MediaPipe, detector timing ou volume Live.
Estados independentes, cancelamento, restauração e invalidação da entrada;
offsets antigos não são restaurados silenciosamente numa nova postura/sessão.

Verificação fresca: CI730 static+459 host+144 UI PASS, lint/TypeScript/build.
Log .agent-context/runtime/calibration-ci.log; capturas SNS/AUD568/VID inspecionadas.
Pacote .release-local/RC-Surface-1.0.0-calibration-r13.ablx:13.682.943bytes,
76arquivos idênticos ao build; SHA256
3B4A2D92A28ACD32AE51413B51B5793CBCB50099020033FD89F409DB9D45E6CC.
AMXDs não mudaram. R12 preservado. Nenhuma instalação, commit, merge ou push/tag.

Responsável já aceitou Stutter r12 com pequeno desvio temporal não medido.
Não repetir microtestes MIDI/XY/Stutter. Próximo: teste físico da calibração
SNS/AUD/VID. Bench de áudio/latência segue separado; calibração não o substitui.
Consolidação/release anterior permanece pendente, não declarada concluída:
main e landing possuem mudanças alheias preservadas. Não reiniciar auditoria geral.

## Limpeza concluída localmente — 2026-09-13

Pedido: retirar resíduos sem cortar funcionalidades/testes úteis. Execução SOLO,
Workflow Main + safe-refactor; bootstrap mantém erro de orçamento12382>10000,
rota existente preservada. Baseline CI1325PASS antes das alterações.

Retirados da árvore ativa: servidor UI antigo test-server.ts (o .mjs continua),
mock-server/sim-phone, test-commands/test-admin-broadcast sem autenticação atual,
builder/teste do diagnóstico MIDI encerrado e backup RC-Midi-Receiver.amxd.original.
São7 arquivos de texto/865 linhas e1 backup binário. Cópias exatas de todos os
arquivos alterados/retirados, inclusive não commitados, em archive/cleanup-2026-09-13
com LEIA-ME e SHA256. Não executar ferramentas aposentadas contra o Live.

Removidas6 funções sem chamadas e variáveis/imports sem uso; sem alteração de
timing, fase, protocolos, segurança ou funcionalidades. live-udp-midi.test.mjs
renomeado live-midi-trigger.test.mjs, conteúdo idêntico. Teste estrutural de
snapshots deixou de exigir wrapper morto e verifica o módulo real. CONTRIBUTING
documenta suites/gate seguro; índice interno corrige8 knobs/8 faders,12 descritores
e Follow removido. Testes de compatibilidade, segurança e AUDIO adiado mantidos.

CI final exit0:725 estáticos +459 host +138 UI =1322PASS; lint/TS/build PASS,
DEV_SYNC0. Somente3 testes retirados, todos do probe MIDI aposentado.
Log .agent-context/runtime/cleanup-final-ci.log; autorrevisão incremental contra
as cópias, sem confundir o diff desta limpeza com trabalho anterior.
R12 e ambos AMXDs mantêm SHA256 registrados abaixo. Não gerar/instalar outro
pacote só por esta limpeza; r12 continua candidato ao teste Stutter do dono.
Sem commit/push/tag, alterações em outros worktrees ou nova pendência manual.

## Correção r12 concluída localmente — regressão Stutter (2026-09-12)

Dono rejeita visual fixo e relata velocidade presa após escolher 1/128.
Causas reproduzidas: render cortava piscada acima de5Hz; pin ignorava rate;
Auto clampava várias posições à mesma divisão; FREE tinha zona morta no teto.
Correção SOLO: gate real em cada quadro, arrasto horizontal libera pin global
rebaseando S1–S4, vertical mantém pin; Auto só divisões alcançáveis; FREE1–15Hz
contínuo (ratchet eleva mínimo). Ajustes desativam opções incompatíveis com
BPM/swing/ratchet e expõem pedido→efetivo para presets antigos. A120BPM sem
swing/ratchet1/16=8Hz e1/128=64Hz, incompatível com teto15Hz. Não elevar o teto.
79 regressões focadas e12 UI desktop/mobile PASS. CI final exit0:
728 estáticos +459 host +138 UI =1325 PASS; lint/TS/build PASS, DEV_SYNC0.
Log .agent-context/runtime/stutter-fix-r12-ci.log. Autorrevisão, sem subagentes.
Pacote .release-local/stutter-fix-r12/RC-Surface-1.0.0-stutter-fix-r12.ablx,
13.677.422 bytes,74 arquivos conferidos contra o build; nenhum extra/ausente.
SHA256 9B6D2299F68EB03E2F1A645AFE4FCF10A70281C25A93C14C36EB031E43FF0BAC.
Delta binário r11: somente extension.js, controls.js, index.html, style.css e
i18n-catalog.js; nenhum arquivo adicionado/removido. R11 e hashes AMXD intactos.
LEIA-ME ao lado contém um teste integrado, sem reabrir testes MIDI/XY/MIX.
Nenhum novo Max/instalação/Set/commit/push/tag. Preserve r11 e AMXDs.
Os ensaios físicos não se tornam PASS por testes locais; AUDIO continua adiado.
Próximo passo: dono substitui ABLX/recarrega e confere Stutter; não repetir auditoria.

## Execução r11 — tetos por forma e interface enxuta (2026-09-12)

Dono autorizou gerar candidato para testar. Sem subagentes, novo Max, instalação,
commit/push/tag ou alteração do Set. R10 preservado. Tetos experimentais:
sine5 Hz, triangle8 Hz, ramps6 Hz, square15 Hz; Stutter15 Hz incluindo ratchet.
SYNC reduz por oitavas considerando o menor intervalo com swing; configurações
rápidas antigas podem desacelerar. FREE/snapshots antigos podem acelerar com
as novas faixas. Não confundir política do gerador com fidelidade medida no Live.

O dono rejeitou a primeira UI com AMP %, marcador amarelo, texto de atividade
e atalho adicional. Substituída por **somente taxa** em LFO/Stutter: Hz em FREE,
duração musical em SYNC (1/4=um tempo, 1/8=meio; T/D). Formas permanecem na
engrenagem existente. Brilho rápido fica estático, sem piscar falsamente devagar;
a explicação fica nos ajustes. Divisões do painel também usam unidades musicais,
sem mudar valores internos/presets. Auto Stutter agora limpa o pin na serialização.

Regressões RED/GREEN: tetos, fase, paridade host/preview/ratchet/swing, Auto wire,
UI desktop/mobile, unidade rítmica e remoção de informação excessiva.
CI final exit0: 726 estáticos +457 host +136 UI =1319 PASS; lint/TS/build PASS.
Log: .agent-context/runtime/shape-limits-r11-compact-ci.log.
ABLX gerado em .release-local/shape-limits-r11/RC-Surface-1.0.0-shape-limits-r11.ablx,
13.676.624 bytes; 74 arquivos/85 entradas ZIP, todos os hashes iguais ao build.
SHA256 61AD719279FE0D77DF732DD640399CA31BF4379CB9E164FD50C555EA674B42A8.
LEIA-ME/VERIFICACAO/SHA256SUMS ao lado. R10/MIDI confirmados inalterados.
Ensaio físico de forma/latência continua pendente;
AUDIO segue adiado, sem reabrir Receiver/XY/MIX já aceitos.
Plano: [Stutter e formas](2026-09-12-stutter-feedback-lfo-shapes.md).

## Execução atual — LFO pelo navegador (2026-09-12, r10)

Dono CANCELA explicitamente a alternativa Max r9: não aceitar dispositivo por
track. Manter L1–L4 pelo site e extensão existente; teto conservador de 4 Hz.
Sem novo plano/spec/aprovação intermediária. Depois pede execução sem subagentes;
conclusão e revisão executadas pelo agente principal. Não reabrir testes aceitos
de Receiver/Stutter/XY nem o ensaio de áudio adiado.

Implementado: fase ancorada por LFO no host e preview, liquidando o intervalo
na velocidade anterior antes de aplicar a nova. Alterações de rate/divisão não
reiniciam fase; Play/retomada/seek/fonte podem realinhar ao beat. FREE contínuo
0,1–4 Hz; Shift+arrasto horizontal com 1/4 da sensibilidade, sem salto ao soltar
Shift. SYNC Auto ganha divisões retas/T/D (10 velocidades a 120 BPM); pinos
rápidos antigos continuam limitados por oitavas. Leitura em Hz nos L1–L4 ativos.
Auto de presets antigos pode escolher divisão diferente: documentado EN/PT.

Entrega de valores: caminho normal já guarda só o destino mais recente. Corrigido
cancelar/recriar o mesmo alvo durante uma chamada SDK: trava física sobrevive
ao cancelamento lógico e impede duas escritas simultâneas. OFF não drena histórico.
Não promete recall de escrita já enviada, latência zero ou maior taxa física do SDK.

Removidos apenas quatro fontes do experimento cancelado: max/native-lfo/LEIA-ME.md,
max/native-lfo/rc-native-lfo-control-r9.js, scripts/build-native-lfo.mjs e
scripts/native-lfo-device.test.mjs. Artefatos r9 ignorados preservados para recuperação;
nenhuma alteração nos dispositivos MIDI ou experimento AUDIO.

Regressões RED/GREEN locais: pin/rate entre ticks, ritmos, FREE fino e cancel/restart.
Validação final: `ABLETON_RC_DEV_SYNC=0 npm run ci` PASS, exit0: 720 testes
estáticos +448 host +130 UI =1298; lint/TS/build de produção PASS. Log
`.agent-context/runtime/browser-lfo-r10-ci-final.log`; desktop/mobile conferidos
nas capturas `lfo-bandwidth-*.png`. Primeira CI expôs fixture de takeover AUDIO
assumindo que applyMapping confirmava entrega; agora aguarda o SDK antes de
liberar e verificar [1,0], sem alterar a política latest-only de produção.
Revisão final feita pelo agente principal; sem nova delegação após pedido do dono.

ABLX `.release-local/browser-lfo-r10/RC-Surface-1.0.0-browser-lfo-r10.ablx`:
13.676.077 bytes; 74/74 membros SHA256 idênticos ao build, 85 entradas ZIP,
sem testes/maps/segredos/experimento nativo. SHA256
`514581A5244B0CAB8C389CB125AB4F7172826597CFE6D236417C8E14BC468120`.
Receiver/Sender e recuperação r9 mantêm hashes anteriores. LEIA-ME e
VERIFICACAO acompanham; próximo passo é apenas o ensaio integrado LFO desse guia.
Fidelidade física e benchmark AUDIO/latência continuam sem PASS.
Nenhuma instalação, edição de Set, commit, push ou tag autorizada nesta rodada.

## Histórico cancelado — alternativa DSP nativa (2026-09-10, r9 experimental)

**Não executar o próximo passo histórico abaixo.** r9 cancelado pelo dono;
artefatos locais são somente recuperação, não candidato atual.

Dono rejeitou a fidelidade do r8 em teste real: senoide ainda angular/jitter nos
prints. Pediu pesquisar e implementar outra técnica, explicitamente SEM nova
rodada de plano/spec. Não reabrir testes aceitos de Stutter/Receiver/XY.

Novo experimento isolado em `max/native-lfo/`, gerado por
`scripts/build-native-lfo.mjs`: FREE 0,05–40Hz, `live.param~` Rate/Depth →
`cycle~` → amplitude normalizada → `live.remote~ @smoothing 0.1`.
Sem amostras de onda no SDK/WS, sem DC misturado à saída, áudio estéreo passa
direto. Seleção do último parâmetro tocado, validação de identidade/contínuo/
enabled/não-self, ARM manual, OFF/disable/reload liberam. AMXD+JS juntos.

Tradeoff informado: remote desativa automação direta do alvo; grava-se Rate/Depth
ou áudio. Não substitui L1–L4/browser, não implementa SYNC nem persistência de
mapping nesta experiência. LFO antigo deve ficar OFF. Não há novo ABLX porque
nenhum código da extensão foi alterado por r9. Guia EN/PT na pasta experimental.
Testes de artefato/controlador são distintos de carregamento/compilação no Max
e fidelidade física, ainda pendentes.

Conclusão da geração em2026-09-11: 12 testes novos PASS; suíte estática final729/729,
host431/431, lint/TS/sintaxe PASS. Reviewer independente native_lfo_r9_review sem
bloqueio para ensaio experimental (não release). Primeira tentativa de reviewer
interrompida por limite de uso; retomada concluiu. Uma execução intermediária teve
EADDRINUSE/heartbeat em sonda antiga, repetição final limpa sem mudança de rede;
um link fora do tester kit foi corrigido. Detalhes/logs em runtime/native-lfo-r9-*.
Artefato `.release-local/native-lfo-r9/RC-Native-LFO-r9.amxd`, SHA256
`8C8B6874317C4680B7BFA9F92FE3CD262F9EB962EFFA9EE0F88C7E9A805959D5`.
JS+LEIA-ME+SHA256SUMS+VERIFICACAO acompanham. Nenhuma instalação, Set editado,
commit, push, tag, nem ABLX novo. Próximo passo é o único teste integrado do guia.

## Rodada anterior — faixa de LFO para automação (2026-09-10, r8; teste físico insuficiente)

Goal: retirar o extremo que o dono confirmou virar ruído, preservando gravação
editável no parâmetro. Dono propôs limitar ou trocar técnica, depois pediu
“ajusta e resolve”; executar alternativa conservadora, sem migrar para Max.
Architecture: mesmo motor/actuator, sem nova fila, smoothing ou atraso de envio.
TypeScript host + browser JS, ESLint/TS existentes. Cap de produto 4Hz, não
medição/garantia física do SDK. A 60 amostras/s seriam15 pontos/ciclo; isso é
orçamento de desenho, NÃO taxa aferida no Live. SYNC anterior chegava a64Hz
com subdivisão fixada1/32 a120BPM. Hipótese de jitter do clock OSC não comprovada;
não alterar transporte global por inferência. Stutter r6 aceito permanece igual.

Plano via writing-plans, execução inline surgical-patch na worktree existente:

- [x] RED: testes host/browser gerando onda no rate máximo em FREE/SYNC,
  transporte pausado, BPM60/120/300, subdivisão antiga1/32. Assert frequência
  <=4Hz e SYNC ciclo com divisão musical, não apenas range0..1.
- [x] Implementar política idêntica em transport-clock.ts/controls.js:
  FREE `0.1 + 3.9 * rate`; SYNC auto filtra `[4,2,1,.5,.25,.125,.0625]`
  por `bpm/60/subdiv <=4`; subdivisão fixada rápida dobra até atender teto.
  Host aplica inclusive fallback, morph integral usa3.9, não19.9.
- [x] UI exibe limite e divisão efetiva das escolhas; guias EN/PT e landing
  documentam remapeamento da velocidade em presets/snapshots antigos.
- [x] Revisão independente lfo_r8_review encontrou pin preso ao voltar para Auto
  e rate inválido de snapshot acima do teto na UI. RED/GREEN para ambos.
  Auto envia null em controls.js E no serializador real app.js; host apaga
  somente LFO/null, ausência mantém semântica de atualização parcial.
  `.rate` rejeita não finitos/clampa0..1. Segunda revisão capturou serializador
  descartando null; corrigido com teste onModulatorState→WebSocket JSON.
  Revisão final do serializador: aprovado, sem bloqueio nesse escopo.
- [x] Rodar focados RED/GREEN; `npm run ci` com ABLETON_RC_DEV_SYNC=0;
  revisar diff; gerar ABLX r8 separado, verificar todos membros/hashes.
  PASS:717 static +431 host +128 UI =1276; lint/TS/build. Exit0.
  Log `.agent-context/runtime/lfo-bandwidth-r8-ci.log`. Screenshots Desktop/Mobile
  `lfo-bandwidth-*.png` conferidos. Git diff-check PASS (aviso CRLF preexistente).
  ABLX: `.release-local/lfo-bandwidth-r8/RC-Surface-1.0.0-lfo-bandwidth-r8.ablx`,
  13.674.847 bytes; 74/74 membros iguais ao build,85 entradas ZIP.
  SHA256 `76F50A2D7F5A72B706CDF718F7AE4803C05B261E602764CE5D0296F31EFED4CB`.
  Hash r7 e ambos AMXDs inalterados. LEIA-ME/SHA256SUMS ao lado do pacote.
- [x] Atualizar contexto + evidência e entregar um único ensaio integrado de
  LFO no máximo (FREE/SYNC), sem repetir Receiver/stutter. Sem instalar/push/tag.

Self-review: PASS trace (máximo/beat/fallback testados na saída real do motor);
PASS comandos (Node testes existentes + CI); PASS consumo (transport-clock pelo
host, controls por index.html); PASS lifecycle (OFF/pausa/Play preservados);
PASS clocks (epoch host; RAF browser permanece local); PASS scope (porLFO,
nenhum estado novo global de transporte); N/A endpoint; PASS eventos (pointer
real e RAF no fixture browser); PASS lint/import (sem dependência nova);
PASS API (não depende de contrato de taxa SDK não documentado).

## Rodada atual — LFO continua na pausa (2026-09-10)

Ensaio r6 do dono: stutter responsivo/sem problema aparente, aceito para seguir;
LFO sincronizado melhorou bastante, mas extremo rápido ainda vira ruído/jitter.
Não repetir testes do stutter nem declarar LFO rápido aprovado.

Design pedido pelo dono, seguido após “continua”: LFO ativo continua animando
durante Stop; Play retoma a fase absoluta do beat (inclusive ao voltar ao mesmo
ponto). FREE não fica dependente do transporte. Não redesenhar stutter, trocar
motor, impor novo teto, instalar ou publicar nesta correção. SYNC→FREE relatado
com salto e considerado menor pelo dono: registrar, não alegar resolvido aqui.

Implementação inline com executing-plans/surgical-patch, reutilizando worktree.
Node/TypeScript + browser JS; ESLint existente. Escopo:

- [x] RED em static/phone-v3/stutter-mode.test.mjs: ativar LFO real, fixar
  playhead parado, avançar RAF e afirmar `state.value` diferente; Play deve
  voltar à fórmula `sin(2π * beats/subdivision)`. Usar rate.4 (subdiv1), depth1.
  Testar clockSource=free com transporte ativo e ausência de amostras na rede.
- [x] controls.js: preservar `freqHz` derivado de SYNC/FREE; fase absoluta só
  quando `syncMode === 'sync' && playheadActive && clockSource !== 'free'`.
  Nos outros casos `state.phase += 2 * Math.PI * freqHz * dt / 1000`.
- [x] host-modulators.ts fallback LFO: respeitar subdivisão explicitamente
  fixada (`state.syncSubdivisionBeats ?? subdivisions[index]`) assim como UI.
  Teste em tests/host-modulator-phase-continuity.test.mjs, rate diferente do
  valor fixado, transporte parado/retomado. Manter o teto fallback20Hz existente;
  não confundir isso com limite do SYNC em reprodução nem com faixa validada.
- [x] Rodar `node --test --test-force-exit static/phone-v3/stutter-mode.test.mjs`
  e `node --import tsx --test --test-force-exit tests/host-modulator-phase-continuity.test.mjs`;
  depois `npm run ci` com ABLETON_RC_DEV_SYNC=0.
  PASS 701static +417host +126UI =1244, lint/TS/build. Log runtime/lfo-pause-r7-ci.log.
  Revisão independente lfo_pause_review: sem achados acionáveis,19/19 focados PASS.
- [x] Atualizar guias EN/PT + contexto afetado; candidata r7 separada, verificar
  hash de cada membro contra build, preservar r6. Sem nova bateria manual.
  `.release-local/lfo-pause-r7/RC-Surface-1.0.0-lfo-pause-r7.ablx`,13.673.916 bytes,
  SHA256 `96A1DF75AF0875A10E697A7EAF1F7EA3F81784E371F1CB796A6A1D84E1FD6EB3`.
  74/74 membros iguais ao build,85 entradas ZIP. Hash r6 inalterado.

Self-review: PASS trace (ramo de fase explica freeze); PASS comandos (arquivos
existentes); PASS consumo (controls.js no loop RAF e host no loop4ms); PASS
lifecycle (state.active preservado, Play religa fase absoluta); PASS relógios
(performance.now/dt só local; Date.now para extrapolar playhead); PASS escopo
(fase por LFO, transporte global existente); N/A endpoint novo; PASS eventos
(pointer real + RAF no VM); PASS lint/import (sem dependência nova); PASS API
(playheadActive/applyIncomingPlayheadState verificados em app.js).

Alta frequência: escolher técnica requer decisão sobre gravação. Documentação
oficial `https://docs.cycling74.com/reference/live.remote~/` confirma controle
por sinal e latência de um buffer, mas desabilita automação do alvo durante posse.
Portanto Max nativo NÃO é substituição transparente para o ensaio que grava a
curva diretamente no parâmetro. Nenhuma migração/cap novo aprovado neste passo.
live.modulate~ (`https://docs.cycling74.com/reference/live.modulate~/`) mantém
base editável, mas aplica offset com escala própria, não grava a onda gerada
como promessa deste projeto. Perguntar prioridade: curva completa editável no
alvo ou gravação de rate/depth/ativação para reproduzir o motor nativo.

## Rodada atual — stutter sem backlog e investigação da onda LFO (2026-09-09)

Goal: corrigir as falhas confirmadas da r5 sem confundir testes locais com
fidelidade de automação/audio no Live. Requisitos explícitos do dono:
stutter Y=amplitude, X=velocidade; amplitude responsiva; OFF sem trajetória antiga.
LFO de alta frequência permanece defeituoso no ensaio do dono e NÃO está aprovado.

Arquitetura aprovada/reutilizada: uma lane por parâmetro físico, uma escrita SDK
em voo e somente destino analógico mais recente; eventos MIDI/toggle continuam
ordenados. Nada de reinstalar, operar Set, commit/push/tag. ABLETON_RC_DEV_SYNC=0.
Skill writing-plans; implementador de UI atingiu limite antes de editar. Root
executou UI/host; agente modulator_review fez revisão final independente read-only.
Reusar esta worktree; baseline r5 CI passou mas probes adicionais reproduzem falhas.
Bootstrap Workflow Main continua falhando12382>10000; não contornar a configuração.

### T1 — host: stutter analógico, OFF e promessa lenta

Files: src/live/mappings.ts; tests/stutter-depth-coalesce.test.mjs.
- [x] RED: segurar setValue inicial; enviar vários gates/depths; liberar e verificar
  somente último valor. Após OFF a próxima escrita deve ser0, não gate atrasado.
  Compartilhar alvo LFO/stutter deve manter apenas um writer; event modes preservados.
- [x] Minimal fix no classificador de saída, reutilizando actuator:
  `const isModulatorOutput = /^(?:toggle|button)-\d+$/.test(controlName);`
  manter os overrides explícitos de toggle/trigger_note/mute/solo/arm.
- [x] Rodar `node --import tsx --test --test-force-exit tests/stutter-depth-coalesce.test.mjs tests/live-mappings-high-rate.test.mjs tests/live-mapping-write-cancellation.test.mjs` (29/29 na etapa T1).

### T2 — UI: eixo único, amplitude e recall

Files: static/phone-v3/controls.js, modules/snapshots.js; testes de stutter,
modulator-emit-coalescing e snapshots; docs/USER-GUIDE.md e .pt-BR.md.
- [x] RED gestos reais: `depth=clamp(startDepth+dy/150,0,1)` e
  `rate=clamp(startRate+dx/150,0,1)`; payload do host deve conter ambos.
- [x] ModeB usa amplitude baixa para soltar, como LFO, e preserva tap-off de
  stutter. Arrastar velocidade não cancela hold por rate baixo; A/C/D preservados.
- [x] Setter `.depth` válido/clamped e `currentControlStates` sincronizado;
  coleta e morph do snapshot incluem `.depth`, snapshots antigos preservam o atual.
- [x] Zebra representa depth, ratchet/count antigo permanece legível/restaurável,
  não é redefinido como outra coisa. Atualizar guias EN/PT para eixos e ModeB.
- [x] Rodar testes focados de browser em Node; revisão de spec e qualidade sem bloqueio.

### T3 — LFO: evidência antes de novo limite ou motor

Files de investigação: src/live/host-modulators.ts, transport-clock.ts,
continuous-target-actuator.ts, SDK DeviceParameter.setValue; gravação .als do dono.
- [x] Ler Live sem modificar: transporte parado120BPM, Auto Filter Frequency
  contínuo0..1; ferramenta não retornou caminho/nome do Set. Caminho pedido ao dono.
- [ ] Quantificar pontos/segundo da automação salva e separar trecho LFO/stutter.
  Sem arquivo, registrar essa limitação; screenshots não provam taxa de entrega.
- [x] Testar geração SYNC/limite e SDK lento; não alegar20Hz estável porque o
  gerador simulado roda250Hz. Nunca anunciar40–50writes/s como teto universal sem prova.
- [x] Reproduzir e corrigir descontinuidade FREE ao mudar rate se confirmada;
  não trocar por agendamento em histórico nem introduzir cap oculto.
- [ ] Se fidelidade alta exigir motor dentro do Live/Max ou reduzir intervalo de
  frequências, apresentar decisão arquitetural ao dono antes dessa expansão.

T3 local: 5 regressões de fase passam (mudança após12.123s, config entre ticks,
morph integrado inclusive além do fim, stutter sem reescrever fase, fallbackLFO).
FREE mudava .985697→.755142 no mesmo instante por rate. Agora contínuo.
Não há gravação `.als` disponível nesta sessão; pedido assíncrono ainda sem resposta.
**LFO rápido não aprovado**. SYNC32Hz a120BPM/1⁄16 confirmado no cálculo; não foi
adicionado cap. Preview SYNC parado pode divergir do fallback; pendência explícita.

### T4 — prova e entrega

- [x] Testes negativos/positivos focados; `npm run ci` completo com dev-sync0.
  698 static +416 host +126 UI =1240 testes; lint/TypeScript/build PASS.
  Logs `.agent-context/runtime/modulator-fix-r6-ci.log` e rerun `modulator-fix-r6-final-ci.log`.
- [x] Revisão final independente; atualizar registro/contexto afetado.
  modulator_review: sem bloqueio no escopo, 22 testes focados próprios PASS;
  não validou alta frequência física nem declarou release pronta.
- [x] Gerar nova candidata local somente com escopo e limites explícitos, comparar
  todos os arquivos do ZIP com build por hash e preservar r3/r4/r5. Não instalar.
- [x] Dizer claramente o que foi corrigido e o que depende da medição/decisão;
  não pedir outra bateria fragmentada de Receiver/XY já aceitos.

Entrega local: `.release-local/stutter-phase-r6/RC-Surface-1.0.0-stutter-phase-r6.ablx`,
13.673.827 bytes; SHA256 `4453F784ABA63EE0673281741B72DA8E5986C4BD2794A1121F08F31E3B0398FA`.
Final CI1240 PASS; 74/74 arquivos ZIP iguais ao build (85 entradas); hashes r4/r5
e AMXDs inalterados. LEIA-ME acompanha escopo, teste único e LFO rápido pendente.
Retomar pela T3: obter `.als` e medir antes de declarar fidelidade ou trocar motor.

Self-review: PASS test/impl trace (T1 classificador e T2 setters/payloads);
PASS comandos existentes Node/CI; PASS consumo por motor/mapping e snapshots;
PASS lifecycle (OFF latest, em voo não cancelável); PASS tempo (Node Date.now
epoch ms, UI performance.now para gestos, sem comparar relógios entre processos);
PASS estado por client/controle e lane física; N/A novo endpoint; PASS eventos
pointer reais nos testes; PASS lint/import ESM; PASS SDK verificado em
node_modules/@ableton-extensions/sdk/dist/index.mjs:212 (callback assíncrono,
sem contrato observado de frequência mínima/máxima).

## Trabalho atual — picker Main e auditoria de latência de controle

Dono relatou Main/Master com todos os parâmetros achatados e XY fluido localmente
mas saltando no Live. Autorizou correção e ampliou para todos os caminhos de controle.
Execução SOLO; preservar Receiver aceito e não voltar aos microtestes manuais.

Causa já rastreada: onControl só atualiza state.controls para XY/knobs/faders;
sendLoop transmite snapshots a33ms ou500ms com MAP/telemetryThrottle. Assim uma
opção de telemetria limita comandos de atuação a2Hz. Host ainda aplica dezipper
implícito ao XY mesmo Smooth0 e alterna writers por intervalo entre mensagens.
Main tem renderização flat própria, enquanto renderTrackGroup possui a hierarquia.

- [x] RED picker Main com dispositivos recolhíveis, filtros e destino correto.
- [x] RED fluxo rápido em MAP, último valor, backlog/desconexão e ausência de eco remoto.
- [x] Reusar renderTrackGroup para Main; Tempo global continua direto.
- [x] Separar gestos de snapshots: primeiro valor imediato, latest-only com cadência
  limitada, fila curta/fair; não aumentar budget de rede nem permitir replay pós-reconexão.
- [x] XY/knobs/faders no actuator físico único, Smooth0 sem rampa implícita;
  provar movimentos contínuos, concorrência, cancelamento e SDK lento.
- [x] Auditar src/static/SDK por timers/debounce/filas, classificar visual vs atuação,
  corrigir esperas artificiais confirmadas sem remover smoothing explícito/segurança.
- [x] CI + prova visual desktop/mobile; atualizar docs EN/PT e registro da auditoria.
- [x] Gerar candidata local consolidada se gates passarem, preservando r3 e sem instalar.

CONCLUÍDO localmente 2026-09-09. Evidência: npm run ci exit0,694 testes static +
404 host +126 UI; lint/TypeScript/build PASS, lint/build repetidos após docs.
Runtime: .agent-context/runtime/control-latency-ci.log e main-picker-*.png.
Auditoria: internal/CONTROL-LATENCY-AUDIT-2026-09-09.md. Além do XY, RED/GREEN
confirmou head-of-line no scheduler discreto e FIFO de trajetória antiga do LFO.
Protocolo additive controlStreamVersion1, controle/áudio compartilhados a8ms,
snapshot visual-only negociado, compat legado, sem aumentar300/s/burst600.
OSC testes agora isolados em portas efêmeras:3 portas de produção ocupadas por
outros processos causavam falha de bancada; nenhum processo foi encerrado.

Candidata .release-local/reviewed-r4/RC-Surface-1.0.0-reviewed-r4.ablx,
13673529bytes, SHA256 EB14558940101B10813B7631BB51F27459FCCB0E5D4019088314A9DB0C1B7240.
85 entradas ZIP,9 críticas conferidas contra build por hash; sem testes/maps/keys
ou Native Track. Receiver BC5104... é o v2.1.1 aceito; Sender F64862... intacto.
r3 SHA7DA2BDE2... preservado. Sem instalação, commits/push/tag/publicação.
PRÓXIMO: dono instala candidata/recarrega página e compara XY/MIX com MAP;
benchmark físico de áudio segue pendente. Não reabrir checklist fragmentada Receiver.

Não prometer1ms físico/fim-a-fim: eliminar waits evitáveis, medir limites locais,
documentar resolução/cadência/SDK. Atualizações discretas preservam bordas/OFF;
contínuas não devem acumular trajetórias antigas. Sem push/tag/release oficial.

## Decisão vigente do dono — encerrar testes fragmentados do Receiver

O dono considera o Receiver funcional após os testes já confirmados e pediu
explicitamente para seguir com o projeto, sem mais microtestes guiados.
ACEITE FUNCIONAL SUFICIENTE PARA PROSSEGUIR. Rodada manual ENCERRADA por decisão
do dono. Não retomar os passos históricos abaixo nem pedir novas confirmações
de SDK Notes, pad, Panic, Device On ou reabertura, salvo novo defeito relatado
ou pedido explícito de teste. O clique manual não é bloqueio para seguir.

Evidência disponível: nome/range/tipo lidos no Live, pacote Note Off531968,
relato de funcionamento normal, OFF/ON, Panic, Device On e save/reopen.
Casos adicionais não executados não viram PASS: ficam como limites de evidência,
fora desta rodada. Latência continua não medida, sem travar a programação.
Próximo foco de desenvolvimento: consolidar v2.1.1 e documentação na candidata
do produto; static já contém o AMXD corrigido, ABLX r3 ainda é histórica e deve
ser preservada. Não publicar/tag/push nem tratar como release oficial aprovada.

## Aceitação incremental v2.1.1 — MIDI básico confirmado (2026-09-09)

Após reiniciar o PC, dono recarregou a candidata r2. Print mostra Pad1 mapeado
para Piano V3 → Trigger C3. Ao roteiro OFF silencioso, ON toca/Activity pisca,
soltar sem nota presa, dono respondeu "deu certo" (confirmação consolidada,
não log individual de cada gesto).

Leitura posterior somente leitura: track0 Piano V3/device0 RC-Midi-Receiver
ativo; RC MIDI Packet v2 value531968, min0/max4194303, enabled, não quantizado.
Decode determinístico: sequência32, nota60/C3, velocity0 = Note Off. Prova que
um comando de soltura chegou ao parâmetro; não prova horário, latência, ordem
de toda a sequência nem execução MIDI na saída. Funcionamento audível vem do dono.

Panic incremental APROVADO pelo dono ("confirmado"): SDK Notes desliga, novos
pads ficam silenciosos, habilitar sozinho não toca e novo press volta a tocar.
Isso não testa flush DURANTE nota segurada; não inferir essa aprovação.
Device On off/on APROVADO pelo dono ("deu certo confirmado tb"): partindo de
SDK Notes ON, desativar/reativar Receiver deixa SDK Notes OFF e novos pads
silenciosos. Habilitar não toca sozinho; novo press volta a tocar.
Save/reopen básico APROVADO pelo dono ("confirmo cara ta certo seguimos pf"):
salvo com SDK Notes ON e nenhum pad pressionado; reabre silencioso/OFF, pad
bloqueado, habilitar não toca sozinho e novo press funciona. Esse caso não
prova restauração de um pacote Note On salvo durante nota segurada.
Roteiro adicional CANCELADO pelo dono conforme decisão no topo. Flush durante
nota segurada, restauração com Note On salvo, duas tracks e latência não têm
prova adicional coletada. Não são próximos passos a pedir ao dono nesta rodada.
T5 encerrado com aceite funcional do dono, sem atestar todos esses casos nem
aprovar release oficial. Sem escrita no Live pelo agente.

## Ensaio v2.1 — divergência de nome confirmada no Live

Leitura atual na track Piano V3: RC-Midi-Receiver ativo, Device On e
`RC Packet v2` expostos; este último Float, min0/max4194303, value0, enabled.
A permissão viewer foi resolvida pelo dono; o erro agora é upgrade_required.
O host exige `RC MIDI Packet v2`, mas o AMXD usa `RC Packet v2` como shortname
no atributo e no registro de parâmetros. DeviceParameter.name retorna o nome
curto (https://docs.cycling74.com/apiref/lom/deviceparameter/). Não é mais falha
de visibilidade e não há evidência de instalação antiga. T5 segue pendente.

Correção limitada ao ensaio autorizado, sem escrita no Live/instalação:
- [x] RED contrato extraído do AMXD (nome curto/long e registro) contra descoberta
  real do host; não usar somente fixture hardcoded que escondeu a divergência.
- [x] Alinhar todos os nomes ao contrato r3; título v2.1.1 para distinguir o arquivo.
  Preservar range, visibilidade, gate manual, decoder, Sender, fila e autorização.
- [x] Testes focados + gates próximos; gerar AMXD separado em
  `.release-local/receiver-manual-sdk-r2/`, preservar r1/r3, registrar hash.
- [x] Dono trocar somente Receiver; agente confirmar nome via API antes das notas.

Leitura real após troca pelo dono: track0 Piano V3, device0 RC-Midi-Receiver ativo,
device1 Piano V3. Enumeração e busca exata confirmam `RC MIDI Packet v2`, value0,
min0/max4194303, is_enabled=true, is_quantized=false. Contrato de nome/range/tipo
APROVADO via conector, sem notas nem escrita no Set pelo agente. Esse registro
precede a aceitação incremental acima; consultar o topo para o próximo passo.

Resultado local: RED2 (shortnames recusados), GREEN40 focados; npm test684static+
400host=1084, lint/TypeScript PASS. Logs receiver-name-r2-{tests,lint}.log.
Diff semântico do AMXD conferido contra r1: exatamente título e dois shortnames;
nenhuma mudança no grafo, projeto, range, visibilidade ou gates. AMXD33089bytes,
SHA256 `BC5104D5403D5E67108BA0D2D4D2FF4DC046D35EAE631A5F93536639EFDFDDEC`.
R1 e r3 preservados com hashes originais. Não instalada nem carregada pelo agente;
v2.1.1 passou na leitura real; aceitação manual parcial registrada no topo.
O teste agora deriva o contrato do AMXD e passa pelo handler, ocultação nas duas
listas e ON/OFF do host, sem simular execução Max nem enviar notas ao Set.

## Ensaio aprovado: Receiver v2.1 com SDK Notes manual

O dono aceitou testar o clique extra antes de decidir se limita o produto.
Implementação SOLO nesta worktree, sem instalação/commit/push/ABLX oficial.
Design aprovado: modo0 expõe o comando; gate Max nasce fechado; toggle comum
(não parâmetro Live) habilita SDK Notes. Carregamento, preset/device reload,
OFF, Panic e desativação fecham/limpam. Nenhuma leitura/handshake adicional por
nota. Sender local continua independente e opt-in. A API instalada r3 continua
compatível com o nome/range RC MIDI Packet v2; não exige nova ABLX neste ensaio.

Limite explícito: o comando modo0 é armazenável/automatizável. O bloqueio protege
enquanto OFF e ao abrir, não autentica comandos enquanto ON. Não automatizar/mapear
esse parâmetro interno; o dono deve excluir automações antigas antes de habilitar.
Não anunciar transporte não persistente nem imunidade ao Undo enquanto armado.
Self-review de ciclo: live.thisdevice notifica DEPOIS da inicialização. Abrir
Set/device novo nasce fechado, mas preset recall numa instância já armada pode
emitir valores antes desse reset; exige OFF manual antes de trocar preset.
Não alegar bloqueio retroativo; guias e LEIA-ME registram a limitação do ensaio.

- [x] T1 RED `scripts/midi-receiver-device.test.mjs`: visibilidade0; novo teste
  executa o grafo do artefato com semântica de gate/trigger, intercepta antes do
  decode e no flush; restore antes/depois da inicialização não passa até clique.
- [x] T2 `scripts/build-midi-receiver.js`: `packet → round → gate 1 0 → valid`;
  toggle `sdk-enable → t i b b b` fecha, limpa `set 0`, flush, só então abre.
  `loadbang`/`live.thisdevice`/`sel 0`/Panic disparam reset dos dois toggles.
  Texto v2.1 e botão SDK Notes; preservar envelope, decoder, SDK e Sender.
- [x] T3 gerar `static/RC-Midi-Receiver.amxd`, rodar testes focados e `npm test`.
  Não chamar build com sync; sempre ABLETON_RC_DEV_SYNC=0. Provar hashes r3 intactos.
- [x] T4 atualizar guias EN/PT/tester e aviso de migração; copiar somente novo
  Receiver para `.release-local/receiver-manual-sdk-r1/`, com instruções e hash.
- [ ] T5 dono carregar, agente ler contrato; só então testar nota, OFF/Panic,
  save/reopen e avaliar clique extra. Não confundir simulação com execução Max.

Resultado local: 7 falhas esperadas RED, 26 focados GREEN. npm test684static+
396host=1080; lint/TypeScript PASS. Logs receiver-manual-sdk-r1-{tests,lint}.log
em .agent-context/runtime. AMXD33077bytes, SHA256
`278B4A219AFBB0CA0182294B40F83F255B99BD112DD5BE0453AC64EB683FE8CB`.
LEIA-ME no diretório do ensaio contém procedimento incremental e limites.
R3 Receiver/ABLX preservados e hashes originais conferidos. Nenhuma instalação,
alteração de Set, commit ou publicação feita. Aceitação real v2.1 continua aberta.

Self-review: PASS trace (gate bloqueia antes de decode); PASS comandos (Node e
builders existentes); PASS uso (static é artefato, candidato separado); PASS
ciclo (load/preset/disable/Panic fecham, enable limpa antes de abrir); N/A relógio
(sem timers); PASS estado (gate por instância); PASS ambiente (sem rede nova);
N/A browser (inalterado); PASS imports (Node/AMXD helper existente); PASS API
(`live.thisdevice` inicialização/preset/enable documentados em
https://docs.cycling74.com/reference/live.thisdevice/; runtime será testado).

## Receiver r3 — aceitação bloqueada; diagnóstico autorizado (2026-09-08)

O dono carregou Receiver visualmente v2, mas Trigger Note pede versão nova.
Leitura real pelo conector no Set de teste: RC-Midi-Receiver antes de Piano V3;
somente Device On exposto. Busca por RC MIDI Packet v2 retorna not found.
Isso explica receiver_upgrade_required. O probe abaixo confirmou a restrição de
visibilidade da API. Não atribuir a cache/instalação nem declarar MIDI aceito.

Após autorização explícita do dono, foi criado diagnóstico local separado:
`.release-local/receiver-parameter-probe-r1/RC-Parameter-Probe-r1.amxd`.
Nove parâmetros sem conexões, sem objetos de áudio/MIDI/rede/scripts; compara
visibilidade0..4, hidden/shown e dois controles Float básicos. Nenhum Receiver,
Sender, ABLX r3 ou arquivo instalado foi substituído. Builder e testes em scripts/
não são entradas de release. LEIA-ME junto ao AMXD contém matriz e roteiro.

- [x] Gerar diagnóstico e testar isolamento, comparação e recusa de sobrescrita.
- [x] Dono carregou na track existente antes de Piano V3; índices atualizados,
  leitura sem notas/escritas: V0 e V0 Shown expostos em0..4194303, Float;
  controles Normal/Dial expostos; V1..V4 e V4 Shown ausentes. Busca exata confirmou.
- [x] Identificar causa: modo4 não automatizável fica fora de Device.parameters.
  Referência primária: https://docs.cycling74.com/apiref/lom/device/.
  Dados e limites em `.release-local/receiver-parameter-probe-r1/RESULTADO.md`.
- [ ] Corrigir com autorização e repetir aceitação real. NÃO apenas trocar4→0:
  modo0 armazena/automatiza valores; impedir replay de comandos ao restaurar Set.

Arquivo23162bytes; SHA256
`08EF76C3E6BDE204AD02E96D71D3EF8543A8B97ABE1E240A092FD23BFD08E185`.
Seis testes focados passaram (três novos +três do Receiver); são prova estrutural,
não carregamento/visibilidade Max. Trigger Note permanece BLOQUEADO neste Set.

## Candidata de teste r3 — revisão e empacotamento autorizados (2026-09-08)

Pedido atual: conferir implementação/planos, verificar novamente, gerar ABLX
nova e entregar a lista de testes. Isso autoriza pacote LOCAL de teste; não
instalação, firewall, commit/tag/push, publicação ou pipeline remoto oficial.
Preservar r2 e todas as alterações de outros worktrees.

- [x] Conferir plano vigente, limites históricos e diff de todas as correções.
- [x] Revisão externa read-only focada em MIDI v2/Tempo/migração; corrigir ou
  registrar qualquer impedimento confirmado antes da entrega.
- [x] CI completa fresca + audit de dependências de produção + diff/check.
- [x] Gerar `.release-local/reviewed-r3/RC-Surface-1.0.0-reviewed-r3.ablx` a
  partir desse build, copiar os dois AMXDs e verificar CRC/manifest/hashes/conteúdo.
- [x] Atualizar checklist com dados do pacote e separar Browser, Receiver v2 e
  bancada Native Track adiada. Nenhuma alegação de latência física comprovada.

Resultado: candidata r3 gerada localmente, 13.671.150 bytes; 73 arquivos (manifesto
normalizado +72 arquivos idênticos ao build), CRC aprovado e nenhum resíduo
proibido no pacote. SHA256:
`7DA2BDE2CA694A79ED3C125E1064071647C42FB17D612AA00CE9B67F669EF2DA`.
O manifesto permanece1.0.0. R2 preservada com hash anterior. Fonte: HEAD701e2ef
+ diff local das correções; nenhuma release/tag/commit nova criada nesta rodada.

A revisão externa encontrou dois P1 antes do pacote, ambos corrigidos com provas:

- `live.numbox` Int suporta apenas256 valores conforme referência Cycling74.
  O comando de22bits agora usa Float com unidade Int, e `round 1` antes do decode.
  Host recusa contrato quantizado; testes/AMXD alinhados. Referência:
  https://docs.cycling74.com/reference/live.numbox/ (Type/Unit Style).
- OFF só entrava na fila após a confirmação do ON: `[1,0,1]` com SDK lento
  produzia ON/ON/OFF. Agora reserva OFF imediatamente e avalia se ON foi enviado
  ao executar, preservando ON/OFF/ON sem reviver notas canceladas.

RED:3 assertions falharam; GREEN:55 testes focados. Reteste independente com
applyMapping real confirmou repetição, cancelamento e desconexão. Parecer novo:
**apto para candidata de teste no escopo revisado**, não aprovação de release.
Logs: `.agent-context/runtime/reviewed-r3-midi-{red,green}.log`.
CI final:675 static +396 host =**1071**, **122 UI**, nenhum skip/falha;
ESLint/TypeScript/build aprovados, `ABLETON_RC_DEV_SYNC=0`.
Audit produção:0 vulnerabilidades conhecidas na consulta. Node local24.19.0;
pipeline oficial fixa24.16.0 e não foi executado. Log: `reviewed-r3-ci-final.log`.

A candidata não contém Native Track/GateA. Essas tarefas continuam adiadas;
latência/musicalidade Browser, MIDI v2 em Live, instalação/macOS/Safari/sessão
longa e aceitação de rede seguem pendentes. Não afirmar “todos os planos históricos
concluídos”. O roteiro vigente está implementado; estes gates não são simulados.
Nada instalado, alterado em firewall, sincronizado para AppData ou publicado.

## Correções da revisão independente — 2026-09-08 (implementação local concluída)

Autorização: corrigir os achados confirmados. Execução SOLO nesta worktree;
base701e2ef. Não instalar, alterar firewall, operar Live, publicar ou empacotar.
O responsável respondeu “continua” à proposta de eliminar UDP dos dispositivos.

Direção: Tempo é global (sem assinatura de track); guias descrevem candidata.
Trigger Note é escrito pelo SDK no parâmetro de comando do Receiver v2 da
track selecionada, nunca por broadcast UDP. O Sender separado usa mensagens
internas do Max, com recepção explicitamente habilitada no Receiver (OFF padrão).
Receiver antigo é recusado, não convertido silenciosamente. Não modificar
cópias instaladas: trocar ambos os dispositivos é etapa manual de migração.
Alternativa descartada: UDP autenticado exigiria pareamento/segredo/runtime novo
e ainda teria uma porta exposta. SDK/Max interno remove esse listener por inteiro.
SDK não oferece envio direto de nota: o parâmetro inteiro transporta nota,
velocity e contador; sem automação, persistência do comando ou speed limit.
Essa troca NÃO comprova baixa latência: medir no Live antes de aceitar.

- [x] T1 `tests/project-config.test.mjs`: RED roundtrip de Tempo, assinatura antiga
  com dados da track e versão0 sem assinatura; GREEN normalizar captura/export/relink
  em `src/live/project-config.ts`, sem alterar entrada nem outras assinaturas.
- [x] T2 teste de contrato de INSTALL EN/PT; remover declaração de release publicada.
- [x] T3 RED host: duas tracks, Receiver ausente/antigo/duplicado, ON/OFF ordenados,
  mesmo destino capturado no OFF após reorder; cancelamento antes/depois de SDK lento.
  `src/live/midi-receiver.ts` owns SDK receiver command queue; `mappings.ts` owns
  binding/held-note lifetime. Nenhum fallback raw UDP. Fila limitada por Receiver.
- [x] T4 RED AMXD: nenhum socket/UDP, comando inteiro exposto e não persistente,
  decode correto 0..127, OFF e startup neutro. Builders em `scripts/` preservam
  envelope AMXD existente. Sender mantém DSP e estéreo; só transporte muda.
- [x] T5 guias EN/PT, SECURITY, changelog, tester e checklist: migração explícita,
  proteção nova não corrige Receiver velho já carregado. Firewall antigo continua
  relevante para cópias antigas; não afirmar teste externo/latência aprovado.
- [x] T6 `ABLETON_RC_DEV_SYNC=0`: npm test, npm run lint, build:prod, test:ui;
  diff/check, AMXD audit, mapa atualizado; sem ABLX/tag/push/install.

Provas: `node --import tsx --test tests/project-config.test.mjs`;
`node --import tsx --test tests/live-midi-receiver.test.mjs`;
`node --test scripts/audio-sender-device.test.mjs scripts/midi-receiver-device.test.mjs`.
Arquivos de teste executam lógica real com SDK controlado; não são aceitação Max.

Self-review: PASS trace (cada RED cobre seu mecanismo); PASS comandos (Node/tsx
instalados); PASS uso (host importa transporte, build copia AMXDs); PASS ciclo
(OFF usa destino capturado e invalida ON pendente); PASS tempo (sem novos relógios);
PASS estado (fila por objeto SDK, held por binding); PASS ambiente (sem listener
MIDI, telefone mantém WSS autenticado); N/A novos eventos browser; PASS lint/import
(sem dependências novas); PASS API (SDK local DeviceParameter.setValue e Max
live.numbox/send/receive documentados; integração/latência Live pendentes).

Referências: https://docs.cycling74.com/reference/live.numbox/
e https://docs.cycling74.com/reference/send/ (não são evidência de execução).

Registro local (sem instalar ou gerar ABLX):

- Tempo: os três casos novos falharam antes da correção; 14 testes do módulo
  passam depois. Perfis antigos funcionam sem herdar assinatura de track.
- MIDI: regressões reproduziram o destino errado e a ausência do transporte v2.
  Agora 11 testes dedicados cobrem destino, OFF, reorder, cancelamento, fila cheia
  e ocultação do parâmetro interno sem renumerar os parâmetros reais.
- AMXD: testes verificam estrutura/ausência de UDP; aritmética cobre todas as
  notas/velocities com sequência mínima/intermediária/máxima e float normalizado.
  Reexecutar ambos os builders produz arquivos byte a byte idênticos.
- `npm test`: **675 static +394 host =1069**, nenhuma falha/skip.
  `npm run lint` (ESLint/TypeScript) e `npm run build:prod` passaram.
  `npm run test:ui`: **122 passaram**, nenhum skip/falha. `git diff --check`
  passou; arquitetura/riscos e mapa de contexto atualizados.
  Logs ignorados: `.agent-context/runtime/confirmed-fixes-{test,ui}.log`.
- Dois contratos antigos exigiam declarar os devices testados no Live. Foram
  atualizados para exigir pendência do v2 e distinguir a evidência do UDP antigo.
- Revisão das correções solicitada ao verificador: sem parecer, limite de uso.
  Revisão local realizada; não declarar aprovação independente desta alteração.
- Alterações continuam locais, sem commit novo/push/tag/install/firewall. Outros
  worktrees preservados. ABLX r2 histórico intacto e **não contém estas correções**.

Próxima aceitação, apenas quando o responsável quiser: substituir os dois devices
em cópia do Set; verificar carregamento e ausência do listener antigo; Trigger Note
em duas tracks; OFF/repetição/desconexão/reorder; salvar/reabrir sem tocar nota;
Sender apenas no Receiver habilitado; medir latência e importar/exportar Tempo.
Checklist: `internal/RELEASE-CANDIDATE-CHECKLIST.pt-BR.md`, seção v2 no início.
Não retomar Gate A nativo, instalar ou empacotar automaticamente.

## Continuação — cards da landing (2026-09-08)

Checkpoint local salvo: `dcefd81` (registros) e `4c9709a` (produto/testes/guias).
Worktree limpo após os commits; main e landing-visual-fixes preservados.
Nova solicitação: atualizar os desenhos das abas e o acabamento dos cards,
principalmente MIX e AUD. Não muda a aplicação, nem publica/empacota a release.

Direção: manter a folha técnica escura e as cores do produto; desenhos vetoriais
nítidos, molduras e hierarquia consistentes. Sem screenshots simulando execução
real: os valores são exemplos estáticos. Sem nova dependência ou framework.

- [x] Conferir inventário: MIX já tem 8+8, mas arcos/valores são uniformes;
  AUD ainda desenha 6 knobs e WINDOW como knob, contradizendo os 10 reais.
- [x] Uniformizar as 7 figuras e os 6 cards de famílias, preservando conteúdo,
  navegação por teclado, traduções EN/PT e diagramas de comportamento corretos.
- [x] MIX: 4x2 knobs de arco com posições/valores distintos e 8 faders.
- [x] AUD: 12 leituras individuais, 4 grupos/10 knobs, WINDOW x1/x2/x4 separado,
  gráfico com escala, legenda e cores coerentes. Corrigir também o card Sensors.
- [x] Testes de contrato e UI para todas as abas/idiomas/tamanhos; lint.
- [x] Alteração separada para commit local `style(landing): align cards with current surface`.
  Sem push/tag/pacote. Identificação final pelo histórico Git, sem auto-referência.

Acabamento validado: `docs/surface-cards.css` compartilha molduras/tipografia,
suaviza a geometria das sete figuras e organiza as quatro famílias de descritores.
Figuras inativas deixam de esticar o desenho selecionado (regressão UI reproduzida).
Pedido adicional do responsável: curvas AUD menos exageradas. O exemplo seleciona
cinco curvas discretas, com picos curtos, doze itens de legenda e recorte explícito
na área 0–1. Pontos amostrados substituem curvas Bézier que extrapolavam a escala.
São exemplos desenhados, não dados coletados nem validação de áudio.

O fundo da figura MAP também passou de 6+6 para 8+8. Rótulos longos de SNS/VID
foram realinhados/encurtados para não sair dos painéis em português ou inglês.

Evidência final: `npm test` 670+380 =1050 testes; `npm run lint` sem erros;
`npm run test:ui` 122 testes, nenhum skip/falha. Testes da landing percorrem as
7 abas e as 6 famílias em EN/PT a 390/768/1440px; cobertura geral também a 320px.
Log: `.agent-context/runtime/landing-final-validation.log`; screenshots em
`test-results/landing-release-all-seven--*/landing-*.png` (ignorados).
Os dois ABLXs históricos e os arquivos dos outros worktrees não foram alterados.

## Direção anterior — consolidação local, release aberta (2026-09-08)

O responsável autorizou salvar o trabalho em commits locais na branch
`feat/audio-descriptors-v1`, preservando os outros worktrees.
Não integrar à main, criar tag, fazer push, executar release multiplataforma,
publicar landing ou gerar outro pacote oficial nesta etapa.
Ainda haverá alterações antes do lançamento; o teste de áudio será feito depois.
A r2 abaixo é um artefato histórico de teste, não o congelamento da release.

Validação desta consolidação: `npm test`, `npm run lint` e `npm run test:ui`
passaram localmente (663+380 testes de código,120 UI, nenhum skip/falha).
Log ignorado: `.agent-context/runtime/local-commit-validation.log`.
Não foi necessário recompilar ou empacotar; os dois ABLXs existentes permanecem.
Organização: registro documental de bancada/auditoria separado do conjunto
acoplado de código, testes, interface e guias. Novas mudanças partirão desse
checkpoint; publicação e aceite continuam pendentes.

> Execução SOLO com `superpowers:executing-plans`. **Leia este arquivo primeiro
> após qualquer retomada/compactação.** Não reabra a auditoria do zero. Marque
> cada bloco aqui com resultado, arquivo de evidência e próximo passo.

**Objetivo:** consolidar e revisar a candidata Browser do RC Surface, alinhar
produto/interface/documentos e entregar nova ABLX verificável. AUD aguarda teste
do responsável; Native Track continua fora do produto.

**Arquitetura:** preservar host TypeScript/SDK, superfícies JS existentes,
protocolo de 12 descritores e MIX8+8. Corrigir somente defeitos demonstrados,
conteúdo obsoleto e acabamento inconsistente; não reescrever o sistema.

**Stack:** Node >=24.16.0 <25; TypeScript, esbuild, Web Audio/AudioWorklet,
Playwright Chromium, extensão Live. Especificação: pedido do responsável nesta
conversa e inventário abaixo; auditorias anteriores são histórico, não roteiro atual.

## Estado e limites obrigatórios

- Worktree de execução: `ableton-rc-surface/.worktrees/audio-descriptors-v1`;
  branch `feat/audio-descriptors-v1`, base `6142b21`. Reutilizar, não criar outra.
- Preservar as 59 alterações/caminhos já existentes da candidata anterior.
- `ABLETON_RC_DEV_SYNC=0` em toda validação/build; nunca instalar/sincronizar Live,
  operar apps, mergear, publicar, push/tag ou apagar worktrees neste trabalho.
- Decisão nova do responsável (08/09): EXCLUIR Follow, Audio Lab tonal e seus
  controles/algoritmos aposentados, em vez de preservar código dormente.
  Remover UI, DSP tonal, vozes, traduções e testes exclusivos. Rejeitar modos
  aposentados em dados antigos sem convertê-los em controles contínuos.
  Preservar amplitude atual e compatibilidade mixer-6/IDs1–6. MIDI Trigger e Max Sender/Receiver
  independentes continuam válidos. Não confundir pitch de orientação/SNS ou
  seletores de nota MIDI fixa com a antiga detecção tonal da AUD.
- ABLX anterior preservada em `.release-local/RC-Surface-1.0.0-candidate-2026-09-07.ablx`.
  A nova entrega usará sufixo `reviewed-r2`, sem sobrescrever a anterior.
- Evidência local não certifica hardware, Safari, firewall externo, instalação
  ou latência. O teste de AUD é do responsável; Gate A nativo segue
  `PENDING_OWNER_DEFERRED`. Não afirmar que esses testes passaram.
- Workflow Main: único bundle `rc-surface-release-hardening-2026-09-01`.
  Bootstrap continua falhando no limite interno 12382>10000; usar a rota já
  estabelecida, sem modificar o gerador. Skills: Workflow Main, context loader,
  writing-plans, debugging/TDD, surgical-patch, safe-refactor, verification.

## Investigação inicial — achados concretos

| ID | Evidência | Decisão |
|---|---|---|
| R1 | Três worktrees; main16b12df e landingf38c8b9 não têm commits exclusivos contra HEAD6142b21; nenhum stash | Sem commits perdidos a integrar; não mergear |
| R1a | Worktree landing tem diff não commitado em index.html/site-i18n.js | Trazer seletivamente correções de entidades de tradução, legibilidade e geometria de MAP. Rejeitar desenho de knobs tonais aposentados |
| R1b | main tem duas alterações manuais em SECURITY.pt-BR.md: letra solta e nome de regra com typo | Não importar nem sobrescrever; cópia da candidata está correta |
| R2 | Guia PT, inventários EN/PT e CUSTOMIZATION ainda dizem knob/fader1..6 | Atualizar para8, preservando nota de compatibilidade1..6 |
| R2a | PRIVACY ainda descreve envio de pitch/note/BPM/clarity/bend e só4 descritores | Corrigir dados efetivamente enviados: amplitude4+descritores12; entrada selecionada armazenada localmente |
| R2b | FAQ/guias ainda recomendam CLARITY FLOOR/MIN NOTE e ajustes removidos | Substituir instruções atuais, marcar material histórico; não apagar documentação do Max Sender separado |
| R2c | Landing contém caminho obrigatório via AbletonOSC e chave duplicada lp.fig.160 que troca alvo MIDI por CLARITY | Corrigir caminho SDK e chave; remover drift entre HTML e catálogo EN/PT |
| R3 | Lint não cobre docs/site-i18n.js; não detectou chave duplicada. SNP ainda imprime Saved/Ready sem tradução | Ampliar lint para runtime da landing e chaves duplicadas; reproduzir e corrigir estados SNP EN/PT |
| R4 | 8+8 já implementado; seletor Browser/generation guard/presets/start-stop revistos | Reexecutar regressões, conferir snapshot real dos novos controles e screenshots; sem redesenho geral |
| R5 | Pacote anterior íntegro, mas não leva docs atualizadas como material de entrega | Novo ABLX + documentação/checklist revisados e hashes; manter artefatos privados fora do pacote |

Não há achado reproduzido adicional de DSP/host nesta investigação inicial.
Isso não é prova de ausência de bugs. Revisão por fronteiras + regressões:
bootstrap/Stop/start/storage, WS/auth/origin/rate limits, ownership de mapping,
presets/rollback, captura e interrupção, controles/setters/snapshots, docs/build.

## Bloco 1 — consolidar landing e eliminar deriva de tradução

Arquivos: `docs/index.html`, `docs/site-i18n.js`,
`tests/ui/landing-release.spec.mjs`, `eslint.config.js`, `package.json`.

- [x] Rodar baseline e registrar resultado antes de mudanças.
- [x] Regressão em DOM real EN/PT: textos não contêm entidades numéricas
  literais após tradução; legenda do alvo continua LIVE PARAMETER / MIDI.
  Exemplo: `expect(await page.locator('[data-i18n]').allTextContents()).not.toEqual(expect.arrayContaining([expect.stringMatching(/&#\d+;/)]))`.
- [x] Importar somente hunks compatíveis da landing solta, sem copiar arquivo
  inteiro: CSS sn-dial com valor não encolhível e legenda MAP; geometria MAP
  com ponto sobre curva; converter entidades numéricas em caracteres no catálogo.
- [x] Remover a definição duplicada de `lp.fig.160`; mantê-la para alvo.
  Corrigir HTML e `lp.controls.147` para caminho WSS→host→SDK→Live;
  AbletonOSC permanece serviço de clock opcional.
- [x] Incluir `docs/**/*.js` nas regras browser do lint e `no-dupe-keys:error`;
  lint deve passar após correção, não ignorar a landing.
- [x] Provar UI EN/PT320/390/768/1440 e verificar imagens locais, sem publicação.

## Bloco 2 — alinhar toda documentação vigente

Arquivos: `docs/USER-GUIDE{,.pt-BR}.md`,
`docs/CUSTOMIZATION{,.pt-BR}.md`, `docs/PRIVACY{,.pt-BR}.md`,
`docs/FAQ{,.pt-BR}.md`, `docs/AUDIO-AUDIT{,.pt-BR}.md`,
`README.md`, `CHANGELOG.md`, `internal/TESTER-GUIDE.md`.

- [x] Atualizar MIX para 8 knobs/8 faders em resumo e namespace; não alterar
  referências a seis abas, seis eixos ou template legado mixer-6.
- [x] Privacidade: documentar escolha deviceId guardada localmente, sem captura
  automática; descritores12+RMS/envelope/gate/attack; sem PCM pela rede.
- [x] Remover instruções atuais que exigem knobs Follow/tonais inexistentes.
  Excluir orientações do recurso removido; preservar Sender/Receiver independentes.
- [x] Revisar os textos vigentes da landing junto dos guias; mostrar unidades
  0–1/Hz, SYNC1/128T/D, RMS≠loudness, kick/snare heurísticos, não atraso zero.
- [x] Conferir INSTALL/SECURITY/README/build/version sem mudar requisitos,
  licença, firewall ou publicação de forma especulativa.

## Bloco 3 — revisar produto e regressões de integração

Arquivos: `static/phone-v3/modules/snapshots.js`,
`static/shared/i18n-catalog.js`, `tests/ui/mix-eight.spec.mjs`,
`tests/ui/control-polish.spec.mjs`; host/DSP só se aparecer falha demonstrável.

- [x] Testar captura/recall real de knob7/8 e fader7/8, não só chamar setter.
  Exemplo: salvar slot com `knob-8=.25,fader-8=.75`, zerar, recall, esperar
  `aria-valuenow` voltar aos valores salvos.
- [x] Reproduzir slot salvo/pronto ainda em inglês em PT; usar catálogo de
  traduções e manter flash Saved→Ready/Salvo→Pronto e semântica de captura.
- [x] Revisar regiões alteradas de host, presets, cancelamento e captura;
  manter deliberate Note Off e não prometer cancelar chamadas SDK já enviadas.
- [x] Executar suite completa de segurança/perfis/lifecycle/SNS/VID/transporte,
  escalabilidade MIX/AUD e controle por teclado; armazenar screenshots MIX/AUD.
- [x] Registrar código antigo preservado por motivo funcional/compatibilidade.
  Excluir somente módulos exclusivos da feature retirada por pedido do responsável.

## Bloco 4 — entrega e critério de encerramento

- [x] `$env:ABLETON_RC_DEV_SYNC='0'; npm run ci` com retorno0.
- [x] `npm audit --omit=dev --json`, `git diff --check`.
- [x] Gerar ABLX a partir do build recém-testado usando CLI instalada:
  `node node_modules/@ableton-extensions/cli/dist/cli.mjs package -i dist/static -o .release-local/RC-Surface-1.0.0-reviewed-r2.ablx`.
- [x] Inspecionar ZIP/manifest/entry, comparar conteúdo com build, CRC e SHA256.
  Excluir testes, certs, Audio Lab e native experimental; preservar os dois Max
  independentes e LICENSE/NOTICE.
- [x] Atualizar checklist e este documento com evidência final, fonte consolidada
  e pendências de campo separadas.
- [x] Finalizar mapa de contexto e fechar o bundle.
- [x] Entregar links ABLX/plano/checklist. Não declarar release pública ou
  hardware aprovado. Parar depois desta entrega; sem uma nova rodada infinita.

## Registro de execução — atualize aqui

- Baseline concluído: 756 testes static + 404 host; log `final-review-baseline.log`.
- Landing: entidades/legenda corrigidas e regressão EN/PT verde;
  lint ampliado para docs. Logs `final-review-landing-{red,green}.log`.
- SNP: captura, recarga e recall real 7–8 passam; SALVO/PRONTO corrigidos.
  Logs `final-review-snapshot-{red,green}.log`.
- Guias, FAQ, INSTALL, CUSTOMIZATION, PRIVACY e AUDIO-AUDIT EN/PT alinhados,
  assim como README/CHANGELOG/landing/tester checklist.
- Follow removido por fronteira: Browser/host/controles/CSS/traduções/Audio Lab;
  modos não suportados filtrados ao carregar e rejeitados em mutações/dispatch.
  Descritores12, amplitude4, LiveSYNC e MIDI Trigger preservados.
- Os planos anteriores são históricos. Este arquivo é o único roteiro ativo.

## Resultado r2 — 2026-09-08

- Correção adicional demonstrada pela CI: SYNC/FREE ainda chamava a antiga
  renderAudioAnalysisSettings; modules/sync.js agora chama o atual
  refreshAudioDetectorTiming. Regressão real de clique/BPM/FREE passa.
- Testes de legenda atualizados para RMS/envelope (Gate removido), sem reduzir
  a checagem de espaço/teclado/rolagem. Landing também perdeu os desenhos
  pitch/note/BPM e limiar de Gate, inclusive fallback HTML sem tradução.
- CI final:663 static+380 host=1.043,120 UI, zero skips/falhas;
  lint/TypeScript/build aprovados. Logs `final-review-r2-ci-final.log`.
- Audit produção:0 vulnerabilidades conhecidas; diff --check limpo.
- Pacote `.release-local/RC-Surface-1.0.0-reviewed-r2.ablx`:
  13.669.394 bytes,84 entradas,72 arquivos idênticos ao build;
  manifesto1.0.0/dist/extension.js e CRC aprovados.
- SHA256: `9EAD23555DFD27BF9AA419AEF870102FB2D76C932AB92D670544F43A17F4987C`.
- Nenhum resíduo do Follow em fontes/artefato de produção. Regressões de remoção
  e registros históricos retêm nomes antigos intencionalmente, não implementação.
- Capturas de MIX851/1280 e AUD568/1280 inspecionadas. Landing EN/PT validada
  em320/390/768/1440. Sem redesign abrangente ou expansão de dependências.
- Preservados worktrees main/landing, mudanças manuais não relacionadas e ABLX
  anterior. Nada instalado, sincronizado para AppData, commitado ou publicado.
- Skill safe-refactor delimitou a limpeza: preservar a amplitude e MIDI fixo;
  TDD/diagnóstico exigiram RED/GREEN para Follow, SYNC, tradução e snapshots.
- Bootstrap Workflow Main continua excedendo o orçamento de caracteres
  (12382>10000); rota já autorizada e bundle existente mantidos, sem alterar
  o gerador de workflow.
- Pendência do responsável: teste Browser AUD musical/físico. Native GateA
  permanece adiado e fora da ABLX. Testes automatizados não comprovam latência
  física, instalação no Live, Safari, sessão longa ou firewall de outra máquina.
- Checklist de entrega:
  `internal/RELEASE-CANDIDATE-CHECKLIST.pt-BR.md` (seção r2).
- Próximo: entregar ABLX/checklist e aguardar o teste do responsável.
  Não reabrir a revisão completa; novos problemas entram como correções delimitadas.
- Mapa finalizado e verificado `current`; execução local encerrada no bundle
  existente do Workflow Main. Nenhuma nova frente aberta.
