# Guia de customização

Este guia explica onde mexer no RC Surface sem duplicar código antigo.
Foi escrito para mantenedores e contribuidores.

Leia antes:

- `CONTRIBUTING.md`
- `internal/README.md`

## Arquitetura atual

Backend:

- `src/extension.ts` — só o bootstrap.
- `src/server/state.ts` — ciclo de vida do servidor.
- `src/server/http.ts` — HTTP e arquivos estáticos.
- `src/server/ws.ts` — clientes WebSocket, dispatch, tratamento de snapshot.
- `src/server/cert.ts` — geração do certificado autoassinado e checagem de SAN.
- `src/live/mappings.ts` — registro de comandos, motor de mapeamento, curvas, suavização e modos de evento.
- `src/live/safe-input.ts` — takeover contínuo, estados de perda e filtragem de sensores.
- `src/live/project-config.ts` — perfis `.rcsurface` versionados, religamento semântico, backup atômico e rollback.
- `src/live/state.ts` — loop de playhead e estado do Live.
- `src/server/autostart.ts` — se o bridge toma a rede no carregamento. Só o início automático é gateado; o botão Start do painel nunca consulta isso.
- `src/ui/panel.ts` — diálogos do painel do Ableton.
- `src/runtime/safety.ts` — handlers de segurança do processo.

Frontend:

- `static/phone-v3/` — cliente de performance do celular.
- `static/panel/` — interface do painel do Ableton.
- `static/admin/` — painel administrativo.

Todos os clientes estáticos são JavaScript de navegador puro. Sem bundler. Os
testes ficam ao lado dos arquivos estáticos.

## Ciclo de desenvolvimento

Instalar:

```powershell
npm install
```

Conferir:

```powershell
npm test
npx tsc --noEmit
```

Buildar:

```powershell
npm run build
npm run build:prod
npm run package
```

Recarga a quente:

- Mudou `static/**`: recarregue o navegador do celular ou do painel.
- Mudou `src/**`: rebuild, depois desabilite e habilite a extensão no Ableton Live.
- `npm run watch` sincroniza os arquivos buildados no AppData do Ableton durante o desenvolvimento.

## Nomes de controle

As atualizações de controle usam:

```javascript
{ name: "pad-1", value: 1 }
```

Grupos canônicos:

- `pad-1` a `pad-12`
- `knob-1` a `knob-8`
- `fader-1` a `fader-8`
- `xy-1.x`, `xy-1.y`, `xy-2.x`, `xy-2.y`
- `toggle-1` a `toggle-4`
- `button-1` a `button-4`
- `sensor.motion.*`
- `sensor.orient.*`
- `sensor.audio.*`
- `sensor.vision.*`

Antes de acrescentar um controle:

1. Procure no código atual.
2. Reaproveite o dono que já existe.
3. Emita pelo fluxo de snapshot e controles que já existe.
4. Acrescente a entrada de alvo no painel e na administração, se o usuário puder mapear.
5. Escreva testes.
6. Atualize este arquivo, se for público.

## Controles do celular

Arquivos principais:

- `static/phone-v3/index.html` — DOM.
- `static/phone-v3/style.css` — layout e visual.
- `static/phone-v3/app.js` — estado do app, WebSocket, sensores, snapshots.
- `static/phone-v3/controls.js` — controles de toque.
- `static/phone-v3/mode-engine.js` — comportamento dos modos escalares.
- `static/phone-v3/mapping-mode.js` — fluxo de MAP no celular e editor de destino.

Modos de pad:

- A: momentâneo, volta a zero ao soltar.
- B: hold e edição, mantém o último valor.
- C: toggle com máximo editável enquanto segurado.
- D: burst, pulso de attack e release.

Se o comportamento de modo mudar, atualize:

- `static/phone-v3/mode-engine.js`
- `static/phone-v3/controls.js`
- `static/phone-v3/mode-engine.test.mjs`
- testes de interface específicos, como `static/phone-v3/stutter-mode.test.mjs`

## Modo MAP no celular

O fluxo de MAP do celular deixa o usuário criar e editar mapeamentos sem abrir
o painel do Ableton. Ele usa o mesmo registro de comandos do backend que a
interface do painel e da administração.

Arquivos principais:

- `static/phone-v3/index.html` — botão MAP e contêineres do overlay.
- `static/phone-v3/app.js` — `window.sendPhoneCommand`, callbacks de resposta de comando, limitação de telemetria no modo de mapeamento, e eventos do ciclo de vida do WebSocket.
- `static/phone-v3/mapping-mode.js` — estado do mapeamento no celular, interceptação de seleção, seletor de destino, presets, fluxo de trigger note e editor completo.
- `static/phone-v3/style.css` — destaque do MAP, overlay, árvore de destinos, controles de nota MIDI e visual do editor de curva.
- `static/phone-v3/mapping-mode.test.mjs` e `static/phone-v3/mobile-ui.test.mjs` — regressões estáticas de interface.

Comportamentos importantes:

- O modo MAP intercepta eventos de toque e clique na fase de captura em controles `[data-name]`. Não deixe gestos normais de performance vazarem enquanto o MAP está ativo.
- Os controles de performance visíveis são escolhidos direto na interface ao vivo. A lista de controles de fallback ainda inclui sensores e todos os controles canônicos.
- Os XY pads são mapeados por eixo: `xy-1.x`, `xy-1.y`, `xy-2.x`, `xy-2.y`.
- O seletor de destino precisa preservar a hierarquia: Song / Main / Master, Tracks, Return Tracks, devices e parâmetros. Evite listas planas na escolha de destino que o usuário vê.
- Os destinos podem incluir `trackKind: "track" | "return" | "main"`. Preserve esse campo ao acrescentar alvos de mapeamento; o roteamento do backend depende dele.
- Os destinos de trigger note usam `mode: "trigger_note"` com `type: "device_param"`, por compatibilidade com o motor de mapeamento. A identidade é track + nota MIDI, não o slot de device ou parâmetro.
- Os mapeamentos são compartilhados por nome de controle entre os celulares conectados. Chaves antigas no formato `client-id::control` servem apenas como entrada de migração: a camada de mapeamento do celular as dobra sobre o controle canônico e remove a chave com escopo na escrita. Use sempre o helper local `mappingKey()`, em vez de remontar chaves.

Campos do editor hoje expostos no celular:

- `mode`: `continuous`, `toggle`, `trigger_note`
- `curve`: `linear`, `exponential`, `logarithmic`, `s-curve`
- `targetScale`: `auto`, `linear`, `geometric`
- `inMin`, `inMax`, `outMin`, `outMax`
- `drive`, `compressor`, `smooth`, `threshold`
- `midiNote`, pelos seletores de Pitch e Oitava
- `midiVelocity`
- `takeoverMode`: `scale` (padrão), `pickup`, ou o avançado `jump`
- `neutralPolicy` e `neutralValue`, para o comportamento em perda de sinal

O canvas de curva é uma prévia visual local da resposta do mapeamento. Se a
implementação de curva do backend mudar, atualize tanto os testes do backend
quanto a matemática da prévia no celular.

Modos de mapping aposentados/não suportados são descartados na leitura e rejeitados na criação.

## Camada de entrada segura

Os mapeamentos contínuos usam soft takeover por padrão. O backend lê o valor
confirmado do parâmetro no Live, parte desse valor, e escala o movimento do
celular até a captura. Um loop de reconciliação com o host, a cada 500 ms,
rearma o takeover quando o Live muda o destino com o celular parado. O `jump`
continua disponível apenas como mapeamento explícito ou preferência de projeto.

Pads momentâneos, trigger notes e stutters passam por fora do takeover e soltam
no cancelamento do toque ou na desconexão. O estado de toggle e de LFO é
preservado. A perda de sensor usa um hold curto seguido de release suave até o
valor neutro do mapeamento. Nunca apague um mapeamento como parte da
recuperação de erro.

As primitivas de segurança do lado do celular ficam em
`static/phone-v3/safe-input-layer.js`:

- timeout de áudio, rejeição de outlier, hold e release, e recuperação suave;
- um descritor de pose estática de 47 dimensões, combinando 42 coordenadas normalizadas de landmark com cinco dimensões de articulação, para abertura dos dedos e oposição do polegar;
- tolerância por gesto, aprendida a partir das próprias capturas de cada slot, com o limiar base como piso, para a calibração só conseguir ampliar a aceitação;
- templates de gesto treinados apenas no modo de aprendizado e imutáveis em performance.

A suavização da posição da mão fica em
`static/phone-v3/vision-processor.js`, onde um filtro One Euro estabiliza
X/Y/Z e abre o próprio corte para movimento rápido.

O MediaPipe Hands e o Camera Utilities são dependências de runtime do npm,
copiadas para `dist/static/phone-v3/vendor/mediapipe/` pelo build. Por isso a
visão inicia sem CDN nem conexão com a internet depois que a extensão foi
buildada.

Os valores de movimento e orientação recebem a mesma filtragem de jitter e de
picos confirmados no backend, antes do takeover e do dispatch de mapeamento.

## Perfis de projeto do set

Os mapeamentos e o estado de segurança específico do set são guardados como
arquivos `.rcsurface` com versão de schema, no diretório `projects/` do
armazenamento da extensão. As escritas são validadas e atômicas, e o arquivo
anterior é mantido como `.bak` para rollback. Comandos de importação e
exportação dão portabilidade entre computadores.

O SDK atual não expõe o caminho nem o nome do Live Set. A associação usa, por
isso, uma impressão digital semântica do set e assinaturas de destino (nomes,
tipos, faixas, quantização e posições de track, device e parâmetro). Os handles
do SDK são IDs de sessão, não IDs persistentes, e têm peso apenas como
diagnóstico fraco. Correspondências de alta confiança religam sozinhas; as de
confiança média ou ambíguas pedem confirmação; destinos de baixa confiança são
preservados, mas ficam desconectados.

## Visão

A visão é de uma mão só, por decisão de projeto.

Arquivos:

- `static/phone-v3/vision-processor.js`
- `static/phone-v3/vision-processor.test.mjs`
- `static/phone-v3/safe-input-layer.js`
- `static/phone-v3/app.js`
- `static/panel/app.js`

Diagnósticos de visão em tempo de execução:

- `sensor.vision.active`
- `sensor.vision.x`
- `sensor.vision.y`
- `sensor.vision.z`
- `sensor.vision.palm`
- `sensor.vision.face`
- `sensor.vision.fist`
- `sensor.vision.pinch`
- `sensor.vision.victory`
- `sensor.vision.rotateVal`
- `sensor.vision.open`
- `sensor.vision.fingers`
- `sensor.vision.pinch_x`
- `sensor.vision.pinch_y`
- `sensor.vision.pinch_z`
- `sensor.vision.color.r`
- `sensor.vision.color.g`
- `sensor.vision.color.b`
- `sensor.vision.gesture.1`
- `sensor.vision.gesture.2`
- `sensor.vision.gesture.3`

Os controles públicos de mapeamento de visão são deliberadamente mais
estreitos: `x/y/z` direto, os quatro detectores opcionais, `rotateVal`, o Pinch
Clutch `pinch_x/y/z`, e os três slots numerados de pose aprendida. `active`,
`palm`, `face`, contagem de dedos, dedos individuais, lateralidade da mão e RGB
do quadro inteiro seguem como diagnóstico e não devem entrar num seletor só
porque a telemetria existe.

Não reintroduza nomes de duas mãos vindos de planos antigos, a não ser que o
usuário peça uma migração nova.

## Áudio

Arquivos:

- `static/phone-v3/audio-processor.js` — captura, o laço de quadro, e o que é publicado.
- `static/phone-v3/audio-analysis-controls.js` — todas as primitivas de análise, cada uma testável sozinha.
- `static/phone-v3/audio-descriptors.js` — DSP puro de transiente/kick/snare/brilho: subidas por banda comparadas à energia recente da própria banda, joelho suave para sensibilidade, release exponencial e curva de resposta. `normalizeSettings` é o único clamp de todo ajuste de detector.
- `static/phone-v3/audio-spectral-descriptors.js` — oito medidas espectrais definidas.
- `static/shared/audio-descriptor-catalog.js` — IDs, grupos, três tons por família e escalas de leitura em Hz compartilhados. Preserve a ordem do catálogo e contraste das marcas >=3:1 contra #0e0e0e. Curvas e amostras dos descritores são contínuas; os botões nomeados da legenda identificam sem depender só da cor.
- `static/phone-v3/audio-workspace.js`, `audio-timeline.js` — os doze cartões agrupados, o controle único de visão do gráfico e históricos limitados selecionáveis. As visões normalizadas se ajustam à curva visível mais alta e publicam esse teto em `#audio-timeline[data-scale]`; a amplitude mantém escala própria para RMS/envelope, sem o antigo limiar do Gate no gráfico.
- `static/phone-v3/audio-descriptor-stream.js` — janelas contíguas de amostras e buffers FFT reutilizados.
- `static/phone-v3/audio-descriptor-worklet.js` — captura contínua com uma mensagem de descritores pendente, confirmada pelo consumidor.
- `static/phone-v3/style.css` — knobs planos com arco organizados por grupo (rolagem horizontal de grupos em telas baixas) e barra separada de JANELA. Regras dos controles aposentados foram excluídas; não reserve linhas vazias no grid.
- `static/phone-v3/audio-detector-timing.js` — subdivisões em semínimas para RELEASE/SUAVE: 1/128..1/1, retas/tercinas/pontuadas, ordenadas por duração. Escolhas `*Beats` e tempos FREE `*Ms` ficam independentes; app.js resolve milissegundos fracionários quando BPM do Live/SYNC muda pelo caminho de configurações do worklet. RELEASE no DSP aceita 1,25..360000 ms (1/128 T a 1000 BPM até 1/1 D a 1 BPM); a interface FREE continua 10..500 ms e SUAVE 0..200 ms. Só rótulos arredondam. Mudanças de BPM preservam knobs ativos. Bandas continuam RMS linear, sem ponderação de loudness.
- `static/phone-v3/audio-processor.test.mjs`, `audio-analysis-controls.test.mjs`
- `static/phone-v3/app.js`
- `static/panel/app.js`

### Descritores rápidos

Transient mede um ataque novo; Kick e Snare o ponderam pela energia espectral
grave e da faixa superior. São heurísticas, não classificação de instrumentos.
Brilho preserva o centroide logarítmico por potência (100–12000 Hz); o novo
Centroide usa magnitude na faixa completa. São relacionados, com escalas
distintas. Fórmulas e unidades estão no
[Guia](./USER-GUIDE.pt-BR.md#detectores-de-áudio-integrados).
Timbre usa Hann 2N com hop N; ataques preservam janela retangular N. No
fallback, AnalyserNode usa Blackman (média quadrática .3046) com correção da
energia das bandas. Sem fila por descritor, ganho automático ou lookahead.
O pacote legado `controls` aceita lotes completos legados4/atuais12 de descritores.
O `control_frame` negociado compartilha uma cadência limitada entre controles e
áudio; `app.js` publica o conjunto de descritores atomicamente nesse fluxo.
Snapshots novos usam `controlsRealtime:true` e nunca atuam no Live. Preserve o
leitor legado; negocie `hello.controlStreamVersion=1` antes de trocar o caminho.
Amplie zero/reset, catálogo, limites e despacho de mapeamento juntos.
O caminho rápido dos descritores independe das análise de amplitude e do
snapshot geral de 30 Hz. A captura contínua usa um AudioWorklet só de descritores;
o modo de compatibilidade identificado na tela usa análise por quadro de animação.
As escritas em parâmetros não se sobrepõem e retêm apenas o destino mais recente.
Preserve essa separação: suavização extra, desenho da
UI ou quadros antigos enfileirados não devem atrasar o envio dos controles.
Valide a latência física do microfone até o Live separadamente; uma janela de
DSP não é um resultado de ponta a ponta.

### Primitivas de amplitude

`audio-analysis-controls.js` mantém `HystereticGate`, `OnsetGate` e
`VelocityWindow` para as fontes atuais de amplitude. Não há análise de nota,
clareza tonal ou BPM do áudio. Preferências aposentadas não são carregadas.
Os descritores e seu tempo musical são configurados pelos módulos próprios.

### Escutar uma track

`static/RC-Audio-Sender.amxd`, gerado por `scripts/build-audio-sender.js` com o
leitor de contêiner em `scripts/amxd.js`. Regere em vez de editar o binário:

```powershell
node scripts/build-audio-sender.js static/RC-Midi-Receiver.amxd static/RC-Audio-Sender.amxd
```

Ele existe porque o SDK de Extensions não expõe áudio: sem medidor, sem buffer,
sem stream, apenas uma renderização offline do arrangement. Ele manda bytes MIDI
crus para a UDP `9000`, que é onde o `RC-Midi-Receiver.amxd` já escuta, porque um
Max Audio Effect não consegue rotear MIDI para uma track que não seja a dele.
Esse caminho independente de pitch para MIDI não alimenta os descritores de
áudio do navegador.

Controles públicos de áudio (todos finitos e normalizados em `0..1` na fronteira do mapeamento):

- `sensor.audio.rms`
- `sensor.audio.envelope`
- `sensor.audio.gate`
- `sensor.audio.attack`
- `sensor.audio.transient`
- `sensor.audio.kick`
- `sensor.audio.snare`
- `sensor.audio.brightness`
- `sensor.audio.{centroid,rolloff,flux,flatness,spread,low,mid,high}`

Prefira estender `sensor.audio.*` com valores normalizados, sem novos namespaces.

## Interface de mapeamento

Arquivos:

- `static/panel/index.html`
- `static/panel/app.js`
- `static/panel/mappings.js`
- `static/panel/mappings.test.mjs`
- `static/phone-v3/mapping-mode.js`
- `static/phone-v3/mapping-mode.test.mjs`

A interface de mapeamento precisa dar conta de:

- vários destinos por controle;
- edição inline de curva e faixa por destino;
- avisos de conflito sem `alert()` bloqueante;
- fluxo de substituição que remove o mapeamento antigo antes de gravar o novo;
- atualização do gráfico ao vivo enquanto os sliders são arrastados;
- binding pelo celular primeiro, através do modo MAP;
- mapeamentos de trigger note com reaproveitamento do `RC-Midi-Receiver.amxd` e fallback manual;
- tracks normais, return tracks e destinos de main/master.

Não acrescente outro modal se a edição inline resolver.

## Comandos do backend

O registro de comandos fica em `src/live/mappings.ts`.

O modo MAP do celular depende hoje destes comandos:

- `getTargets`
- `getMappings`
- `setMapping`
- `removeMapping`
- `getClients`
- `listPresets`
- `savePreset`
- `loadPreset`
- `deletePreset`
- `addUdpReceiverToTrack`

Ao acrescentar um comando:

1. Adicione o handler no registro de comandos atual.
2. Mantenha os argumentos serializáveis em JSON.
3. Retorne dado de diagnóstico, não apenas sucesso booleano.
4. Escreva o teste do lado do código em `tests/*.test.mjs`.
5. Ligue a interface só depois que o teste do handler passar.

## Protocolo WebSocket

Mensagens tipadas do celular, como `snapshot`, `ping` e atualização de nome de
exibição, não são comandos do Live. Os envelopes de comando são separados.

Ao acrescentar um tipo de mensagem:

- atualize a filtragem de dispatch em `src/server/ws.ts`, se necessário;
- preserve o formato de `controls[]` do snapshot;
- acrescente testes, para evitar poluir o log com "foreign msg".

## Checklist de documentação

Atualize a documentação quando o comportamento público mudar:

- Instalação, certificados, rede: `docs/INSTALL.md`, `docs/SECURITY.md`.
- Fluxo de dados, privacidade: `docs/PRIVACY.md`.
- Novos controles ou sensores: `docs/CUSTOMIZATION.md`, `README.md`.

> Ao mexer nesses arquivos, atualize também a versão em português ao lado
> (`docs/*.pt-BR.md`). Uma tradução defasada é pior que nenhuma.
