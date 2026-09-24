# RC Surface

[![PolyForm Noncommercial](https://img.shields.io/badge/license-PolyForm--Noncommercial-blue.svg)](LICENSE)
[![v1.0.0](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/ntworm/rc-surface/releases)
[![CI](https://github.com/ntworm/rc-surface/actions/workflows/ci.yml/badge.svg)](https://github.com/ntworm/rc-surface/actions/workflows/ci.yml)
[![stars](https://img.shields.io/github/stars/ntworm/rc-surface?style=social)](https://github.com/ntworm/rc-surface/stargazers)

**English:** [README.md](README.md) · [landing page](https://ntworm.github.io/rc-surface/)

[**:globe_with_meridians: Página em português**](https://ntworm.github.io/rc-surface/pt-br.html) — visão geral, passo a passo de instalação e mapa de todos os controles, no navegador.

O RC Surface é uma extensão para o Ableton Live, com código-fonte disponível, que transforma o navegador do celular num controlador de performance, mixagem, mapeamento e sensores.

> [!WARNING]
> **Aviso de segurança**: esta extensão sobe um servidor WebSocket na sua rede local. Ações de controlador e de administração exigem tokens de sessão, mas o bridge ainda assim só deve ser usado em redes confiáveis. Não compartilhe URLs de QR nem de administração. Veja o [SECURITY.pt-BR.md](docs/SECURITY.pt-BR.md) para o modelo de ameaças.

O lado do computador é feito sobre o SDK de Extensions do Ableton. O lado do celular é JavaScript de navegador puro: nenhum app nativo, nenhum bundler, nada para instalar no celular.

## Destaques

- 12 pads de performance com os modos A/B/C/D.
- Dois XY pads: um padrão, de controle direto (`xy-1`), e um joystick com física (`xy-2`).
- 4 LFOs (`toggle-1`..`toggle-4`), 4 botões de stutter (`button-1`..`button-4`) e atalhos de performance (CAP, OFF, 4 slots de snapshot).
- Sensores do celular: movimento, orientação, áudio e rastreio de mãos opcional pela câmera,
  com o MediaPipe Hands embutido (sem CDN).
- Visão de uma mão só, por decisão de projeto.
- CALIBRAR contextual em SNS/AUD/VID: postura estável, resposta dos controles de áudio
  e checagem de luz e rastreio da câmera, com estados e reset independentes.
- Modo **MAP** no celular, para ligar controles a parâmetros do Live sem sair da
  interface móvel.
- Mapeamentos de trigger note no celular, para mandar notas MIDI a uma track MIDI escolhida
  pelo receiver de Max for Live incluído.
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

## Novidades da 1.0

- **Modo Config (CFG):** ajustes por controle para os controles de performance: modos dos pads (A/B/C/D), modos dos stutters (A/B/C/D), forma de onda dos LFOs, alcance do arrasto dos knobs, valor de reset dos faders no toque duplo e física do XY 2 (atrito, quique). Abra o `CFG` no header do celular (segure o `CFG` para limpar todos os ajustes) ou clique com o botão direito num controle, no painel de mapeamento do desktop, para abrir o menu daquele controle. Os ajustes ficam salvos por controle no `localStorage`, na chave `ableton-rc:control_config`.
- **Prévia da forma de onda do LFO:** o modal de ajustes do SYNC desenha a forma ativa do LFO (senoide, triangular, rampa para cima, rampa para baixo, quadrada), para você ver a curva que vai mandar para o Live, incluindo a subdivisão travada de 32 tempos e o teto de cada forma (senoide até 4 Hz, quadrada até 12 Hz).
- **Controle pelo teclado no desktop:** todo controle contínuo (knob, fader, XY pad, toggle, stutter) aceita ajustes pelo teclado quando o cliente está em foco, então o painel de mapeamento do desktop e a interface do celular usam o mesmo modelo de gesto.
- **Loudness ponderado K:** a aba AUD mostra loudness momentâneo, de curto prazo e integrado com ponderação K (ITU-R BS.1770), ao lado dos doze descritores.

## Integração com o AbletonOSC (Transport Lite e Deep Sync)

O RC Surface tem integração opcional com o **AbletonOSC**, que libera transporte e sincronia no beat direto pelo celular:

- **Transport Lite**: toque no botão `TRN` do header para abrir o transporte em tela cheia. Controle Play, Stop, locator anterior/próximo e pule para qualquer locator. Tem uma busca que filtra a lista de locators na hora.
- **Metrônomo visual**: o botão `TRN` pisca no ritmo do Live (o tempo 1 pisca em verde, os outros em azul).
- **Ajustes de Deep Sync**: toque no ícone de engrenagem (`⚙`) ao lado do `SYNC` (ou segure o `SYNC`) para abrir os ajustes. Escolha a fonte de clock (AbletonOSC, simulador de BPM do SDK ou Free/interno) e configure subdivisões, deslocamento de fase, swing e formas dos LFOs e stutters. Os ajustes ficam salvos no navegador.
- **Atalho para o alvo selecionado**: toque em `Selecionado no Live` na tela de mapeamento do celular para buscar a track e o device selecionados no Live e já filtrar a lista.

Para usar os recursos do AbletonOSC, deixe a extensão **AbletonOSC** rodando no Ableton Live (porta de saída `11000`, porta de entrada `11001`). A extensão detecta sozinha e mostra o estado (`SINCRONIZADO` / `SDK` / `FREE`).

## Status da versão candidata

A versão do código é 1.0.0; este repositório gera uma versão candidata local para
navegador, o que não significa que exista uma release pública v1.0.0. O Native Track e a
latência de ponta a ponta medida continuam pendentes de validação pelo responsável.

## Início rápido

1. Instale o Ableton Live 12.4.5+ Suite (Beta) com suporte ao SDK de Extensions.
2. Pegue a versão candidata local de teste ou um arquivo em [Releases](https://github.com/ntworm/rc-surface/releases), ou gere com
   `npm run build:prod-ablx`.
3. Instale o `.ablx` no Live.
4. Abra o RC Surface pelo menu Extensions.
5. Escaneie o QR de performance com o celular.
6. Aceite o aviso de certificado autoassinado, uma vez.
7. Toque. A aba **MIX**, dentro do cliente do celular, tem oito knobs e oito faders.
8. Toque em **MAP**, perto do indicador de BPM, para ligar os controles do celular a
   parâmetros do Live, incluindo os doze descritores de áudio, ou disparar notas MIDI fixas.

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
- `toggle-1` a `toggle-4`
- `button-1` a `button-4`
- `sensor.motion.*`
- `sensor.orient.*`
- `sensor.audio.rms`
- `sensor.audio.envelope`
- `sensor.audio.gate`
- `sensor.audio.attack`
- `sensor.audio.{transient,kick,snare,brightness,centroid,rolloff,flux,flatness,spread,low,mid,high}`
- `sensor.vision.{x,y,z,fist,pinch,victory,rotateVal,open}`
- `sensor.vision.{pinch_x,pinch_y,pinch_z}`
- `sensor.vision.{gesture.1,gesture.2,gesture.3}`

Tamanho da palma, sinal da palma virada, detalhe dos dedos e cor do quadro inteiro são
diagnósticos, não entradas públicas de mapeamento.

A visão é de uma mão só. Não acrescente nomes de controle para mão esquerda/direita sem um plano de migração explícito.

## Segurança

Câmera e microfone no celular exigem HTTPS. A extensão gera um certificado autoassinado por instalação e inclui os IPs atuais da rede local na lista SAN do certificado.

O tráfego fica na rede local. O cenário suportado é uma rede confiável, de estúdio ou de
casa; túneis públicos, redirecionamento de porta e proxies reversos públicos estão fora do
suporte e do modelo de ameaças da v1.0. Comandos de escrita exigem credenciais de
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
- O AbletonOSC é opcional, mas necessário para o Deep Sync e o transporte por locators.
- As trigger notes MIDI exigem o `RC-Midi-Receiver.amxd` na User Library do Ableton.

## Licença

PolyForm Noncommercial 1.0.0 — livre para uso, redistribuição e modificação sem fins
comerciais; a venda comercial deste software ou de versões modificadas não é permitida.
Veja a [LICENSE](LICENSE) para o texto completo e o aviso obrigatório (em inglês).
© Gabriel Worm · <https://github.com/ntworm/rc-surface>.

Ableton e Live são marcas registradas da Ableton AG. O RC Surface é um projeto
independente, sem vínculo, endosso ou patrocínio da Ableton AG.
