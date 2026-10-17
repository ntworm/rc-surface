# RC Surface

[![PolyForm Noncommercial](https://img.shields.io/badge/license-PolyForm--Noncommercial-blue.svg)](LICENSE)
[![v2.0.0](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/ntworm/rc-surface/releases)
[![CI](https://github.com/ntworm/rc-surface/actions/workflows/ci.yml/badge.svg)](https://github.com/ntworm/rc-surface/actions/workflows/ci.yml)
[![stars](https://img.shields.io/github/stars/ntworm/rc-surface?style=social)](https://github.com/ntworm/rc-surface/stargazers)

**English:** [README.md](README.md) · [landing page](https://ntworm.github.io/rc-surface/)

[**:globe_with_meridians: Página em português**](https://ntworm.github.io/rc-surface/pt-br.html) — visão geral, passo a passo de instalação e mapa de todos os controles, no navegador.

O RC Surface é uma extensão para o Ableton Live, com código-fonte disponível, que transforma o navegador do celular num controlador de performance, mixagem, mapeamento e sensores.

> [!WARNING]
> **Aviso de segurança**: esta extensão sobe um servidor WebSocket na sua rede local. Ações de controlador e de administração exigem tokens de sessão, mas o bridge ainda assim só deve ser usado em redes confiáveis. Não compartilhe URLs de QR nem de administração. Veja o [SECURITY.pt-BR.md](docs/SECURITY.pt-BR.md) para o modelo de ameaças.

O lado do computador é feito sobre o SDK de Extensions do Ableton. O lado do celular é JavaScript de navegador puro: nenhum app nativo, nenhum bundler, nada para instalar no celular.

**2.0.0 quebra compatibilidade:** projetos, presets, mappings e configurações de performance anteriores não são importados. Configure esta versão do zero em `storageDirectory/surface-v2/` (schema 2). Arquivos 1.x existentes não são apagados.

Oito toggles uniformes começam em Global. Square é a única onda de pulso de 0 até a amplitude, com swing/ratchet em Avançado; não há opção Stutter separada. CFG omite velocidade/amplitude controladas por toque e filtra subdivisões pelo teto real. Os dois XY com física têm rastro e atrito independente dos frames. Trocar onda preserva a ativação, inclusive Square; o preenchimento usa transformações, sem redimensionar a cada frame.

Onda, modo e tempo usam botões diretos no CFG. Subdivisão abre um editor compacto de valor da nota/ritmo conforme a onda efetiva em SYNC; FREE oculta esse campo. XY estático esconde os ajustes de física e os preserva para uma troca posterior. Os valores dos toggles preenchem toda a largura com a cor do modo.

Sete páginas: **PERF / MIX / SNP / SNS / AUD / VID / REC**. **MAP** é uma sobreposição; **AUT**, no cabeçalho do PERF, grava movimentos independentes dos XY após contagem 3–2–1 em SYNC (1–5 compassos) ou FREE (1–30 segundos em passos de um segundo). REC seleciona **ARRANGEMENT / CLIP**: timeline de marcadores com grade de compassos e beats, Zoom, START/END (`1–10` passagens ou `∞`, ou FREE até STOP) e pré-roll OFF/1/2/4 no Arrangement, ou uma cena vazia da Session em todas as entradas armadas com duração nativa de 1/2/4/8/16 compassos, quantização de lançamento e `BACK TO ARR`. Ambas as vistas compartilham cartões de track com ARM MULTI/EXCLUSIVE, SOLO, MUTE, knobs de volume ao vivo e renomeação inline com clique duplo. VID aceita até quinze cartões de poses, com 3–6 capturas por pose, revisão RETAKE/KEEP, política contextual de perda de rastreamento e PALM/FACE como entradas reais do MAP.

## Destaques

- 12 pads de performance com os modos A/B/C/D.
- Dois XY pads (`xy-1`, `xy-2`), cada um configurável como estático ou com física própria (atrito, quique e velocidade) e automação independente de loop de gesto (`AUT`).
- Oito slots LFO (`toggle-1`..`toggle-8`), cada um com Square entre suas ondas e atalhos de performance (CAP, OFF, 4 slots de snapshot).
- Sétima página **REC** para gravação no Arrangement e em **CLIP** da Session direto pelo celular.
- Sensores do celular: movimento, orientação, áudio e rastreio de mãos opcional pela câmera,
  com o MediaPipe Hands embutido (sem CDN).
- Visão de uma mão só, por decisão de projeto, com até 15 poses aprendidas (`G1`–`G15`) e entradas contínuas `X / Y / Z / PALM / FACE` no MAP.
- CALIBRAR contextual em SNS/AUD/VID: postura estável, resposta dos controles de áudio
  e checagem de luz e rastreio da câmera, com estados e reset independentes.
- Modo **MAP** no celular para ligar controles a parâmetros do Live (**Bind**), mandar notas MIDI a uma track MIDI escolhida pelo receiver de Max for Live incluído (**Trigger Note**), ou disparar clips da Session, avançar listas de clips e parar tracks com regras opcionais *After it starts* (**Launch Clip**).
- Doze descritores de áudio: ataques, brilho, centroide, fluxo, flatness, dispersão,
  rolloff 95% e RMS de graves/médios/agudos. Cada ataque é medido dentro da própria banda,
  comparado à energia recente daquela banda, então um bumbo e um chimbal movem controles
  diferentes. Cartões agrupados, curvas de histórico selecionáveis e poucos knobs por grupo
  (sensibilidade, release, curva, suavização, janela de análise).
- Faixas de mapeamento que conhecem o destino, percurso geométrico para frequências,
  limites quantizados e escrita de parâmetros sem fila, sempre com o valor mais recente;
  Smooth 0 não acrescenta rampa escondida.
- Controle em tempo real independente da telemetria do MAP, com primeiro envio imediato
  e lotes limitados a 8 ms. A latência real de ponta a ponta ainda precisa ser medida.
- Histórico de AUD ao vivo com curvas selecionáveis, doze descritores e controles agrupados;
  escolha da entrada de áudio do navegador, com aviso explícito de desconexão ou erro.
- Painel com QR code local, controles ao vivo, telemetria de CPU e editor de mapeamentos.
- Aba **MIX** no celular, com oito knobs e oito faders mapeáveis.
- Transporte bidirecional HTTPS/WSS na rede local.
- Backend modular em TypeScript, com `src/extension.ts` servindo só de bootstrap.

## Performance 2.0

- **Modo Config (CFG):** configure cada slot LFO (T1–T8), incluindo Square como onda, e escolha Estático ou Física de forma independente para cada XY. Cada física tem atrito, quique e velocidade próprios. Modos dos pads, sensibilidade dos knobs e reset dos faders continuam configuráveis. Abra `CFG` no header do celular; segure para limpar os ajustes. As configurações usam `ableton-rc:v3:control_config` e fazem parte dos novos projetos e presets.
- **CFG individual do pad:** acompanha o modo A/B/C/D efetivo: A tem nível ao tocar; B, toque opcional para zerar; C, nível lembrado ou fixo ao ligar; A/B/C têm curso e curva do arrasto. D tem duração SYNC/FREE, ataque e pico próprios. Ajustes fazem parte de projetos, presets e snapshots; nível de saída não é velocity MIDI. Segundo clique direito no mesmo controle fecha o CFG.
- **REC no Arrangement e na Session (`REC`):** alterne entre **ARRANGEMENT / CLIP**. No Arrangement, use a timeline em escala de compassos e beats com `ZOOM`, `START` no cursor ou num locator, `END` opcional (`1–10` passagens ou `∞`) ou `FREE` (até `STOP`) e `PRE-ROLL` (`OFF / 1 / 2 / 4` compassos). Em `CLIP`, grave uma cena explicitamente vazia da Session em todas as entradas armadas com duração nativa de `1 / 2 / 4 / 8 / 16` compassos, quantização de lançamento `Global / Nenhuma / 1 compasso / 1 beat` e `BACK TO ARR` com a Session ociosa. Os cartões de track mostram `ARM` observado (`ARM MULTI` ou `EXCLUSIVE`), `SOLO`, `MUTE`, knobs de volume de `270°` usáveis durante a gravação e renomeação inline com clique duplo. `STOP` tem prioridade e mantém as entradas armadas para o próximo take.
- **Loops de gesto XY (`AUT`):** toque em `AUT` no cabeçalho do `PERF` para gravar e repetir movimentos de forma independente no `XY 1` e no `XY 2` após contagem `3–2–1`, sincronizados ao Live (`1–5 compassos`) ou livres (`1–30 segundos`). Segure um XY por `0,6 s` (ou clique direito no desktop) com `AUT` ativo para abrir seus ajustes; mudar o tamanho do loop descarta a gravação daquele XY. `AUT` repete dados de controle e não escreve automação nativa do Arrangement no Live.
- **Edição por toque mais segura (segurar `0,6 s`):** em telas sensíveis ao toque, os pontos da curva de resposta no MAP e o pico do Burst no modo D só destravam após segurar por `0,6 s`, evitando alterações acidentais ao rolar a tela. Toque duplo restaura o padrão.
- **Cabeçalho contextual:** `AUT` aparece só no `PERF`, `CFG` no `PERF` e `MIX`, `CALIBRAR` em `SNS / AUD / VID` e `MAP` em todas as páginas exceto `REC`. Botões compartilhados mantêm posição fixa entre abas e `STAGE / SAIR` permanece acessível.
- **Visão expandida (`VID`) e MIDI Thru:** `+ ADICIONAR POSE` amplia o banco de 3 para 15 cartões (`3–6` capturas por pose, revisão `RETAKE / KEEP`, evidência de dobra dos dedos e política contextual de perda de rastreamento: segurar, segurar com tempo padrão de `10 s` ou soltar). `PALM` e `FACE` (orientação palma/dorso, sem rastreamento facial) entram ao lado de `X / Y / Z` como entradas normalizadas `0–1` no `MAP`. O `RC-Midi-Receiver.amxd` repassa o MIDI de entrada byte a byte (`midiin → midiout`) junto ao Trigger Note.
- **Prévia da forma de onda do LFO:** o modal de ajustes do SYNC desenha a forma ativa do LFO (senoide, triangular, rampa para cima, rampa para baixo, quadrada), para você ver a curva que vai mandar para o Live, incluindo a subdivisão travada de 32 tempos e o teto de cada forma (senoide até 4 Hz, quadrada até 15 Hz).
- **Controle pelo teclado no desktop:** todo controle contínuo (knob, fader, XY pad, toggle, square) aceita ajustes pelo teclado quando o cliente está em foco, então o painel de mapeamento do desktop e a interface do celular usam o mesmo modelo de gesto.
- **Loudness ponderado K:** a aba AUD mostra loudness momentâneo, de curto prazo e integrado com ponderação K (ITU-R BS.1770), ao lado dos doze descritores.

## Integração com o AbletonOSC (Transport Lite e Deep Sync)

O RC Surface tem integração opcional com o **AbletonOSC**, que libera gravação, lançamento de clips, transporte e sincronia no beat direto pelo celular:

- **Transport Lite (`TRN`)**: toque no botão `TRN` do header para abrir o transporte. Usa cabeçalho em duas linhas: `PLAY / STOP / PREV / NEXT` e, abaixo, `CLICK` (metrônomo compartilhado, nunca bloqueado pelo `REC`), a `Quantização Global` do Live (lida do Set ao abrir) e `REFRESH`, acima da lista de locators com busca.
- **Metrônomo visual**: o botão `TRN` pisca no ritmo do Live (o tempo 1 pisca em verde, os outros em azul).
- **Ajustes de Deep Sync**: toque no ícone de engrenagem (`⚙`) ao lado do `SYNC` (ou segure o `SYNC`) para abrir os ajustes. Escolha a fonte de clock (AbletonOSC, simulador de BPM do SDK ou Free/interno) e configure subdivisões, deslocamento de fase, swing e formas dos LFOs e squares. Os ajustes ficam salvos no navegador.
- **Atalho para o alvo selecionado**: toque em `Selecionado no Live` na tela de mapeamento do celular para buscar a track e o device selecionados no Live e já filtrar a lista.

Para usar os recursos do AbletonOSC, deixe a extensão **AbletonOSC** rodando no Ableton Live (porta de saída `11000`, porta de entrada `11001`). A extensão detecta sozinha, mostra o estado (`SINCRONIZADO` / `SDK` / `FREE`) e volta automaticamente para a porta `11001` assim que ela libera caso outra extensão a tenha ocupado brevemente na abertura do Live.

## Status da versão

A versão atual é a **2.0.0**. Instale o `RC-Surface-2.0.0.ablx` da página Releases do GitHub e confira com o `SHA256SUMS.txt`. A configuração começa do zero em `storageDirectory/surface-v2/` (schema 2); veja o [`docs/INSTALL.pt-BR.md`](docs/INSTALL.pt-BR.md) para a atualização incompatível.

## Início rápido

1. Instale o Ableton Live 12.4.5+ Suite (Beta) com suporte ao SDK de Extensions.
2. Baixe o `RC-Surface-2.0.0.ablx` (e o `RC-Midi-Receiver.amxd` se for usar Trigger Note) em [Releases](https://github.com/ntworm/rc-surface/releases), ou gere localmente com
   `npm run build:prod-ablx`.
3. Instale o `.ablx` no Live.
4. Abra o RC Surface pelo menu Extensions.
5. Escaneie o QR de performance com o celular.
6. Aceite o aviso de certificado autoassinado, uma vez.
7. Toque. A aba **MIX**, dentro do cliente do celular, tem oito knobs e oito faders.
8. Toque em **MAP**, perto do indicador de BPM, para ligar os controles do celular a
   parâmetros do Live (**Bind**), disparar notas MIDI fixas (**Trigger Note**) ou lançar clips da Session (**Launch Clip**).

O passo a passo completo está no [`docs/INSTALL.pt-BR.md`](docs/INSTALL.pt-BR.md).

## Documentação

- [`docs/USER-GUIDE.pt-BR.md`](docs/USER-GUIDE.pt-BR.md) — como usar o controlador no celular (modos, gestos, mapeamento pelo celular, snapshots, calibração, modo Stage).
- [`docs/INSTALL.pt-BR.md`](docs/INSTALL.pt-BR.md) — instalação, certificados, conexão do celular, solução de problemas.
- [`docs/CUSTOMIZATION.pt-BR.md`](docs/CUSTOMIZATION.pt-BR.md) — controles, sensores, mapeamentos, áudio, visão e pontos de extensão da interface.
- [`docs/FAQ.pt-BR.md`](docs/FAQ.pt-BR.md) — perguntas frequentes.
- [`docs/PRIVACY.pt-BR.md`](docs/PRIVACY.pt-BR.md) — fluxo de dados local.
- [`docs/SECURITY.pt-BR.md`](docs/SECURITY.pt-BR.md) — modelo de ameaças e política de certificados.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — fluxo de desenvolvimento e mapa do código (em inglês).

## Arquitetura

Backend:

```text
src/
  extension.ts          bootstrap: activate/deactivate
  context.ts            acesso ao contexto do SDK
  runtime/safety.ts     tratamento de exceções em tempo de execução
  ui/panel.ts           diálogos do painel no Ableton
  util/                 helpers e medição de CPU
  server/               HTTP, HTTPS, WebSocket, certificados, IDs de cliente
  live/                 mapeamentos, comandos, estado do Live
```

Clientes estáticos:

```text
static/
  phone-v3/             cliente de performance do celular
  panel/                interface do painel no Ableton
  admin/                painel administrativo
```

Testes:

```text
static/**/*.test.mjs
scripts/*.test.mjs
tests/*.test.mjs
```

## Desenvolvimento

Requisitos:

- Node.js 24.16.0 (a linha suportada é a Node 24.x).
- Ableton Live 12.4.5+ Suite (Beta) com suporte ao SDK de Extensions.
- Os tarballs do SDK e da CLI de Extensions do Ableton (`1.0.0-beta.0`), obtidos da
  Ableton e colocados em `vendor/`. São material licenciado e não ficam neste
  repositório; o README dentro de `vendor/` explica como obter e verificar.

Comandos:

```powershell
npm run check:vendor
npm ci
npm test
npx tsc --noEmit
npm run build
npm run ci
npm run build:prod-ablx
```

Recarga a quente:

- Mudanças em `static/**`: recarregue o navegador do painel ou do celular.
- Mudanças em `src/**`: faça o build de novo e depois desative e reative a extensão no Ableton Live.
- `ABLETON_RC_DEV_SYNC=1 npm run watch` ativa a sincronização dos builds com o AppData do
  Ableton durante o desenvolvimento. Builds normais nunca sobrescrevem arquivos instalados.

## Nomes dos controles

Grupos principais:

- `pad-1` a `pad-12`
- `knob-1` a `knob-8`
- `fader-1` a `fader-8`
- `xy-1.x`, `xy-1.y`, `xy-2.x`, `xy-2.y`
- `toggle-1` a `toggle-8`
- `sensor.motion.*`
- `sensor.orient.*`
- `sensor.audio.rms`
- `sensor.audio.envelope`
- `sensor.audio.gate`
- `sensor.audio.attack`
- `sensor.audio.{transient,kick,snare,brightness,centroid,rolloff,flux,flatness,spread,low,mid,high}`
- `sensor.vision.{x,y,z,palm,face,fist,pinch,victory,rotateVal,open}`
- `sensor.vision.{pinch_x,pinch_y,pinch_z}`
- `sensor.vision.gesture.1` a `sensor.vision.gesture.15`

`sensor.vision.palm` (escala da mão) e `sensor.vision.face` (orientação palma/dorso, normalizada `0–1`) são entradas públicas de mapeamento. Presença (`active`), detalhe de curvatura dos dedos e cor RGB do quadro inteiro permanecem como diagnósticos internos, não entradas públicas de mapeamento.

A visão é de uma mão só. Não acrescente nomes de controle para mão esquerda/direita sem um plano de migração explícito.

## Segurança

Câmera e microfone no celular exigem HTTPS. A extensão gera um certificado autoassinado por instalação e inclui os IPs atuais da rede local na lista SAN do certificado.

O tráfego fica na rede local. O cenário suportado é uma rede confiável, de estúdio ou de
casa; túneis públicos, redirecionamento de porta e proxies reversos públicos estão fora do
suporte e do modelo de ameaças da v2.0. Comandos de escrita exigem credenciais de
controlador ou de administração, que mudam a cada início do servidor; trate os QR codes e
as URLs gerados como senhas.

Chaves privadas não vão dentro dos pacotes `.ablx`.

O Receiver v2 usa o parâmetro do SDK da track escolhida para o Trigger Note e mensagens
internas do Max, opcionais, para o Audio Sender independente; nenhum dos dois abre UDP.
Troque as instâncias antigas nos Sets salvos: o Receiver anterior ainda expõe UDP `9000`
sem autenticação enquanto estiver carregado. Veja a
[migração v2 e a proteção dos devices antigos](docs/SECURITY.pt-BR.md#devices-max--migração-para-v2).
O transporte v2 ainda precisa passar pelo teste de roteamento e latência no Live.

Os controles principais e o rastreio de mãos pela câmera funcionam na rede local. Os
arquivos de runtime e de modelo do MediaPipe Hands vêm junto com a extensão. Os quadros
da câmera são processados no navegador do celular e este projeto não os envia a lugar nenhum.

## Validação da release

Testes automatizados, checagem de tipos, build de produção, empacotamento do `.ablx` e
do kit de teste são cobertos por scripts do repositório. A publicação final ainda exige
validação manual no Ableton Live e em aparelhos iOS/Android reais.

## Limitações atuais

- O Follow Detected Note, os controles tonais e o laboratório de diagnóstico deles foram removidos depois de resultados musicais pouco confiáveis. O MIDI Trigger e os devices Max independentes continuam disponíveis.
- Kick e Snare são heurísticas de ataque espectral, não reconhecimento de instrumento.
  A latência total do microfone até o Live precisa ser medida na montagem real.
- A validação final da release ainda precisa do Ableton Live e de celulares de verdade.
- O AbletonOSC é opcional para mapeamentos contínuos de parâmetros, mas necessário para o `REC`, `Launch Clip`, `AUT` em `SYNC`, Deep Sync e o transporte por locators.
- As trigger notes MIDI exigem o `RC-Midi-Receiver.amxd` na User Library do Ableton.

## Licença

PolyForm Noncommercial 1.0.0 — livre para uso, redistribuição e modificação sem fins
comerciais; a venda comercial deste software ou de versões modificadas não é permitida.
Veja a [LICENSE](LICENSE) para o texto completo e o aviso obrigatório (em inglês).
© Gabriel Worm · <https://github.com/ntworm/rc-surface>.

Ableton e Live são marcas registradas da Ableton AG. O RC Surface é um projeto
independente, sem vínculo, endosso ou patrocínio da Ableton AG.
