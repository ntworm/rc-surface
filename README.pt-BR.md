# RC Surface

[![PolyForm Noncommercial](https://img.shields.io/badge/license-PolyForm--Noncommercial-blue.svg)](LICENSE)
[![v2.1.0](https://img.shields.io/badge/version-2.1.0-blue.svg)](https://github.com/ntworm/rc-surface/releases/tag/v2.1.0)
[![CI](https://github.com/ntworm/rc-surface/actions/workflows/ci.yml/badge.svg)](https://github.com/ntworm/rc-surface/actions/workflows/ci.yml)

**English:** [README.md](README.md) · [landing page](https://ntworm.github.io/rc-surface/)

[Página em português](https://ntworm.github.io/rc-surface/pt-br.html) — mapa interativo da superfície, passo a passo de instalação e guia visual no navegador.

O RC Surface é uma extensão para o Ableton Live 12 que serve uma superfície de controle no navegador do celular ou tablet. Faz o trabalho de um controlador físico — pads, knobs, faders, XY, mixer, transporte e gravação — e usa os sensores de movimento, o microfone e a câmera do celular como fontes de controle. A extensão roda dentro do Live no SDK oficial de Extensions. Ela serve a superfície por HTTPS/WSS local, e o cliente mobile roda em JavaScript puro no navegador.

## Requisitos

- Ableton Live 12.4.5+ Suite (Beta) com o SDK oficial de Extensions.
- Um celular ou tablet na mesma rede Wi-Fi/LAN confiável: Safari no iOS 15.4+ ou Chromium no Android, na horizontal.
- **AbletonOSC** (UDP `11000` / `11001`), opcional: os mapeamentos de parâmetro e os sensores funcionam sem ele; `REC`, `Launch Clip`, `TRN`, `AUT` em `SYNC` e o Deep Sync exigem AbletonOSC.

## Início rápido

1. **Download.** Baixe `RC-Surface-2.1.0.ablx` e `RC-Midi-Receiver.amxd` (mais o `RC-Audio-Sender.amxd` opcional) na [versão 2.1.0](https://github.com/ntworm/rc-surface/releases/tag/v2.1.0) e confira os arquivos com o `SHA256SUMS.txt`.
2. **Instalação.** Dê dois cliques no `RC-Surface-2.1.0.ablx` para instalar no Live (reinicie o Live se ele já estiver aberto) e ative o **RC Surface** em *Options → Preferences → Extensions*.
3. **Conexão.** Abra o painel do RC Surface no Live e escaneie o QR code com o celular. Instale uma única vez a autoridade certificadora local deste computador, pela página simples na porta HTTPS + 1; a seção **Certificado** da aba **Rede** do painel aponta essa página. Se o celular não abrir a página, use a aba **Rede**: ela mostra o endereço que o QR usa e tem **ACHAR CONFIGURAÇÃO**.
4. **Controle.** Use as 7 abas da superfície para controlar o Live. Toque em **MAP** no cabeçalho para vincular parâmetros, disparar notas MIDI ou lançar clips.

> **Armazenamento:** o RC Surface salva projetos, presets e mapeamentos em `storageDirectory/surface-v2/` (schema 2). Veja o [Guia de Instalação](docs/INSTALL.pt-BR.md).

## Páginas

| Página | O que faz |
| :--- | :--- |
| **`PERF`** | 12 pads de performance (modos A/B/C/D), dois XY pads (Estático ou Física), 8 toggles de LFO/Square sincronizados (`T1`–`T8`) e 4 slots de snapshot. |
| **`MIX`** | 8 knobs rotativos mapeáveis (arco de `270°`) e 8 faders mapeáveis de altura completa. |
| **`SNP`** | 16 slots de snapshot que guardam e chiamam estados completos da superfície. |
| **`SNS`** | Sensores de movimento (acelerômetro/giroscópio) e orientação 3D do celular com calibração de postura. |
| **`AUD`** | Análise de microfone em tempo real com 12 descritores espectrais/ataques por banda. |
| **`VID`** | Rastreamento local de mão pela câmera (MediaPipe Hands embutido) com entradas contínuas `X / Y / Z / PALM / FACE` e até 15 poses aprendidas (`G1`–`G15`). O `RC-Midi-Receiver.amxd` repassa o MIDI de entrada byte a byte (`midiin → midiout`). |
| **`REC`** | Estação de gravação com três visões locais — **GRAVAR / ARRANGEMENT / CLIP**, com **Gravar** como padrão — compartilhando uma barra de captura fixa (**REC / STOP**, **PRÉ-ROLL**, **PASSES**, **INÍCIO / FIM**, **CLICK**) e uma barra de modo fixa. Gravar mostra as linhas nativas de track e uma lista compacta de marcadores; só a lista de tracks rola, e essa visão não lê clips, takes nem waveforms. Arrangement acrescenta a timeline de marcadores, os clips nativos do Arrangement e a inspeção de takes. Clip captura uma cena vazia da Session. |
| **`MAP`** | Sobreposição de cabeçalho para o mapeamento no celular: vincule um controle ou sensor a um parâmetro do Live (**Bind**), dispare notas MIDI quantizadas via `RC-Midi-Receiver.amxd` (**Trigger Note**) ou acione clips da Session e regras de avanço (**Launch Clip**). Os pontos de curva e do Burst exigem segurar por `0,6 s`. |
| **`TRN`** | Sobreposição de cabeçalho para transporte e locators. |
| **`AUT`** | Sobreposição de cabeçalho para loops de gesto XY: grave e repita movimentos no `XY 1` e no `XY 2` após contagem `3–2–1`, sincronizados ao Live (`1–5 compassos`) ou livres (`1–30 segundos`). |
| **`CFG`** | Modo Config (CFG): configure cada pad individualmente (modos A/B/C/D e envelope do Burst no modo D), os moduladores `T1`–`T8` e o comportamento Estático/Física independente de cada XY (atrito, quique, velocidade e rastro). |

## Performance 2.0

- **Prévia da forma de onda do LFO:** visualize a forma ativa do modulador (senoide, triangular, rampa ascendente/descendente e pulso quadrado com swing/ratchet) e o limite de frequência no modal SYNC antes de enviar ao Live.
- **Controle pelo teclado no desktop:** ajuste qualquer controle contínuo (knob, fader, XY pad, toggle, square) pelo teclado quando o cliente estiver em foco.
- **Loudness ponderado K:** acompanhe o loudness momentâneo, de curto prazo e integrado na aba `AUD`, com ponderação ITU-R BS.1770.

## O que há de novo na 2.1.0

- **REC.** Três vistas (Gravar, Arrangement, Clip) dividem uma barra de captura; as tracks aparecem com **ARM / SOLO / MUTE** e fader de volume.
- **Aba Rede.** O QR usa o endereço que alcança a rede. A aba mostra o motivo da escolha, **USAR** fixa um endereço e **ACHAR CONFIGURAÇÃO** lista cada endereço com o próprio QR.
- **Certificado local.** Uma autoridade certificadora deste computador assina o certificado do servidor para localhost e endereços privados da rede. A seção **Certificado** da aba **Rede** leva a uma página de instalação na porta HTTPS + 1.
- **CFG.** Toque em **CFG** no topo para entrar no modo de configuração e depois toque num pad, knob, fader ou XY para editar as opções dele.
- **AUT.** Os avisos de AUT aparecem uma vez, no toast amarelo.
- **macOS.** O link do AbletonOSC liga junto com o servidor. O listener da posição do Live só roda enquanto um mapeamento de **Launch Clip** precisa dele.
- **Correções.** O celular que retoma a sessão mantém a sua ficha; um caminho malformado recebe 400; o seletor de rede mantém uma escolha pendente.
- **Compatibilidade.** Mapeamentos, presets e projetos da 2.0 funcionam sem mudança; recarregue o navegador depois de instalar. Gravar e reproduzir ainda não foram verificados no Live no macOS.

Veja a [versão 2.1.0](https://github.com/ntworm/rc-surface/releases/tag/v2.1.0) para os arquivos e as notas completas.

## Documentação

- [Guia de Uso](docs/USER-GUIDE.pt-BR.md) — abas da superfície, gestos, modos de mapeamento, snapshots, calibração e modo Stage.
- [Guia de Instalação](docs/INSTALL.pt-BR.md) — certificados, rede local, devices Max for Live e solução de problemas.
- [Personalização e Catálogo de Controles](docs/CUSTOMIZATION.pt-BR.md) — catálogo completo de nomes de controles (`pad-*`, `knob-*`, `fader-*`, `xy-*`, `toggle-*`, `sensor.*`) e pontos de extensão.
- [Compatibilidade](docs/COMPATIBILITY.pt-BR.md) · [Contratos](docs/CONTRACTS.pt-BR.md) · [Perguntas Frequentes (FAQ)](docs/FAQ.pt-BR.md)
- [Política de Segurança](docs/SECURITY.pt-BR.md) · [Privacidade](docs/PRIVACY.pt-BR.md) · [Contribuindo (EN)](CONTRIBUTING.md)

## Desenvolvimento

Requer **Node.js 24.16.0** (linha Node 24.x) e os tarballs do SDK/CLI de Extensions do Ableton (`1.0.0-beta.0`) em `vendor/` (veja `vendor/README.md`).

```powershell
npm run check:vendor
npm ci
npm test
npm run lint
npm run ci
npm run build:prod-ablx
```

## Segurança

> [!WARNING]
> **Aviso de segurança:** o RC Surface executa um servidor HTTPS/WebSocket na sua rede local. Ações de controlador e administração exigem tokens de sessão rotativos, mas o sistema é projetado exclusivamente para redes domésticas ou de estúdio confiáveis. Não exponha portas na internet pública nem compartilhe QR codes/URLs de sessão. Veja [SECURITY.pt-BR.md](docs/SECURITY.pt-BR.md) para o modelo completo de ameaças.

- **Processamento local.** Os quadros da câmera e o áudio do microfone são processados localmente no navegador do celular; mídia bruta nunca sai do aparelho.
- **Devices Max for Live.** O `Trigger Note` exige o `RC-Midi-Receiver.amxd` na track MIDI de destino. Substitua instâncias antigas (v1) em Sets salvos para não manter portas UDP legadas abertas.

## Licença

PolyForm Noncommercial 1.0.0 — livre para uso, redistribuição e modificação sem fins comerciais; a venda comercial deste software ou de versões modificadas não é permitida. Veja a [LICENSE](LICENSE) para o texto completo e o aviso obrigatório.
© Gabriel Worm · <https://github.com/ntworm/rc-surface>.

Ableton e Live são marcas registradas da Ableton AG. O RC Surface é um projeto independente, sem vínculo, endosso ou patrocínio da Ableton AG.
