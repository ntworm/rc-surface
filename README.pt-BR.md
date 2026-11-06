# RC Surface

[![PolyForm Noncommercial](https://img.shields.io/badge/license-PolyForm--Noncommercial-blue.svg)](LICENSE)
[![v2.1.0](https://img.shields.io/badge/version-2.1.0-blue.svg)](https://github.com/ntworm/rc-surface/releases/tag/v2.1.0)
[![CI](https://github.com/ntworm/rc-surface/actions/workflows/ci.yml/badge.svg)](https://github.com/ntworm/rc-surface/actions/workflows/ci.yml)
[![stars](https://img.shields.io/github/stars/ntworm/rc-surface.svg?style=social)](https://github.com/ntworm/rc-surface/stargazers)

**English:** [README.md](README.md) · [landing page](https://ntworm.github.io/rc-surface/)

[**:globe_with_meridians: Página em português**](https://ntworm.github.io/rc-surface/pt-br.html) — mapa interativo da superfície, passo a passo de instalação e guia visual no navegador.

O **RC Surface** é uma extensão para o Ableton Live 12, com código-fonte disponível, que transforma o navegador do celular ou tablet na sua rede local em um controlador de performance de baixa latência, mixer, modulador multissensorial e estação de gravação.

O host roda dentro do Ableton Live sobre o SDK oficial de Extensions; o cliente mobile roda em JavaScript puro no navegador via HTTPS/WSS local, sem instalar nenhum app no celular.

## Novo na 2.1.0

- **REC em três vistas.** Gravar, Arrangement e Clip dividem uma barra de captura. As tracks aparecem como linhas nativas com **ARM / SOLO / MUTE** e fader de volume; os grupos abrem no celular sem mudar o Set. Escolha um trecho entre dois markers, acompanhe um take em foco, e encontre os destinos e o **CLICK** no cabeçalho do REC.
- **A aba Rede.** O QR usa o endereço que alcança a sua rede, avaliado endereço por endereço: primeiro a saída, depois um gateway na mesma sub-rede, e por último hotspots, adaptadores virtuais e VPNs. A aba Rede do painel mostra o motivo, deixa fixar um endereço com **USAR** e tem **ACHAR CONFIGURAÇÃO** para quando o celular não abre. Ao trocar de rede, o servidor em execução emite um certificado; não é preciso reiniciar.
- **Correções no Mac.** O link do AbletonOSC liga junto com o servidor, não na ativação. O listener da posição do Live só roda enquanto um mapeamento de **Launch Clip** precisa dele, o que tira a maior parte do tráfego do log. Uma aba do celular em segundo plano mantém a conexão, os moduladores em execução voltam depois de reconectar, e a câmera pausa e avisa com a página escondida.
- **Confiabilidade.** O celular que retoma a sessão mantém a sua ficha, um caminho malformado recebe 400 em vez de erro do servidor, e o seletor de rede segura uma escolha pendente em vez de voltar atrás.
- **Compatibilidade.** Mapeamentos, presets e projetos da 2.0 continuam funcionando: instale a 2.1.0 e recarregue o navegador. A escolha de rede feita na prévia 2.0.1 ficava no navegador e não é aproveitada.

Veja a [versão 2.1.0](https://github.com/ntworm/rc-surface/releases/tag/v2.1.0) para os arquivos e as notas completas.

## Visão geral

A interface mobile é dividida em **sete páginas** e **quatro modos contextuais no cabeçalho**:

| Superfície | Função |
| :--- | :--- |
| **`PERF`** | 12 pads de performance (modos A/B/C/D), dois XY pads (Estático ou Física), 8 toggles de LFO/Square sincronizados (`T1`–`T8`) e 4 slots rápidos de snapshot. |
| **`MIX`** | 8 knobs rotativos mapeáveis (arco de `270°`) e 8 faders mapeáveis de altura completa. |
| **`SNP`** | 16 slots de snapshot para salvar e chamar estados completos da superfície instantaneamente. |
| **`SNS`** | Sensores de movimento (acelerômetro/giroscópio) e orientação 3D do celular com calibração de postura. |
| **`AUD`** | Análise de microfone em tempo real com 12 descritores espectrais/ataques por banda e loudness ITU-R BS.1770 ponderado K. |
| **`VID`** | Rastreamento local de mão pela câmera (MediaPipe Hands embutido) com entradas contínuas `X / Y / Z / PALM / FACE` e até 15 poses aprendidas (`G1`–`G15`). |
| **`REC`** | Estação de gravação com três visões locais — **GRAVAR / ARRANGEMENT / CLIP**, com **Gravar** como padrão — compartilhando uma barra de captura fixa (**REC / STOP**, **PRÉ-ROLL**, **PASSES**, **INÍCIO / FIM**, **CLICK**) e uma barra de modo fixa. Gravar mostra as linhas nativas de track e uma lista compacta de marcadores, e só a lista de tracks rola; essa visão não lê clips, takes nem waveforms. Arrangement acrescenta a timeline de marcadores com seleção local, os clips nativos do Arrangement na mesma timeline e a inspeção de takes; Clip captura uma cena vazia da Session. |
| **`MAP` · `TRN` · `AUT` · `CFG`** | Sobreposições de cabeçalho para mapeamento no celular (**Bind**, **Trigger Note**, **Launch Clip**), transporte/locators (`TRN`), loops de gesto XY (`AUT`) e configuração por controle (`CFG`). |

## Performance 2.0

- **Gravação (`REC`):** uma página global com três visões locais — **GRAVAR / ARRANGEMENT / CLIP** — em que **Gravar** é o padrão, com uma barra de captura fixa e uma barra de modo fixa compartilhadas. **Gravar** mostra a barra de captura (**REC / STOP**, **PRÉ-ROLL** `OFF / 1 / 2 / 4` compassos, **PASSES** `1 / 2 / 3 / ∞`, **INÍCIO / FIM**, **CLICK**) com as linhas nativas de track e uma lista compacta de marcadores; no celular deitado só a lista de tracks rola, e essa visão não lê clips, takes nem waveforms. **Arrangement** é o editor com a timeline de marcadores em escala de compassos e beats, clips nativos do Arrangement nos intervalos reais, `ZOOM` e foco de takes; **Clip** captura uma cena vazia da Session em todas as tracks armadas (`1 / 2 / 4 / 8 / 16` compassos, quantização de lançamento e `BACK TO ARR`). A seleção de marcador é local: define o trecho que o **REC** captura e nunca procura posição no Live. Os marcadores são preparados no Live e aparecem no catálogo; o celular não cria nenhum. As tracks do Live aparecem como linhas nativas, com **ARM / SOLO / MUTE** por linha e um fader horizontal de volume, mais **ARM ALL** e a expansão local de grupo; armar uma linha de grupo arma os descendentes armáveis dele. Em **Arrangement**, a linha da track oferece **TAKES** e o clip do Arrangement escolhido abre um foco exclusivo naquele clip exato, onde **GOOD / REVIEW / SEM NOTA** renomeiam o clip do take escolhido; não existe painel global de takes. A prévia de waveform é uma ação explícita, com o transporte parado, sobre um clip de áudio visível do Arrangement. Escutar, fazer comp e promover continuam no Live; veja o [Guia de Uso](docs/USER-GUIDE.pt-BR.md#16-rec-arrangement--clip).
- **Loops de gesto XY (`AUT`):** grave e repita movimentos de forma independente no `XY 1` e no `XY 2` após contagem `3–2–1`, sincronizados ao Live (`1–5 compassos`) ou livres (`1–30 segundos`).
- **Mapeamento direto no celular (`MAP`):** vincule qualquer controle ou sensor a parâmetros do Live (**Bind**), dispare notas MIDI quantizadas via `RC-Midi-Receiver.amxd` (**Trigger Note**) ou acione clips da Session e regras de avanço (**Launch Clip**). Pontos de curva e do Burst exigem segurar por `0,6 s`, evitando edições acidentais ao rolar a tela.
- **Modo Config (`CFG`):** configure cada pad individualmente (modos A/B/C/D e envelope do Burst no modo D), os moduladores `T1`–`T8` e o comportamento Estático/Física independente de cada XY (atrito, quique, velocidade e rastro).
- **Prévia da forma de onda do LFO:** visualize a forma ativa do modulador (senoide, triangular, rampa ascendente/descendente e pulso quadrado com swing/ratchet) e o limite de frequência no modal SYNC antes de enviar ao Live.
- **Visão expandida (`VID`) e MIDI Thru:** treine até 15 poses de mão (`3–6` capturas por pose, revisão `RETAKE / KEEP` e política de perda de rastreamento) e mapeie orientação `PALM` e `FACE` normalizada (`0–1`). O `RC-Midi-Receiver.amxd` repassa o MIDI de entrada byte a byte (`midiin → midiout`).
- **Loudness ponderado K:** acompanhe loudness momentâneo, de curto prazo e integrado ao lado de 12 descritores espectrais e de ataque por banda na aba `AUD`.
- **Controle pelo teclado no desktop:** ajuste qualquer controle contínuo (knob, fader, XY pad, toggle, square) pelo teclado quando o cliente estiver em foco.

## Início rápido

1. **Requisitos:** Ableton Live 12.4.5+ Suite (Beta) com suporte ao SDK de Extensions, navegador mobile moderno na mesma rede Wi-Fi/LAN confiável e **AbletonOSC** (portas `11000` / `11001`) para `REC`, `Launch Clip`, `TRN` e sincronia de beat; o AbletonOSC é opcional para controle básico.
2. **Download:** baixe `RC-Surface-2.1.0.ablx` e `RC-Midi-Receiver.amxd` (mais o `RC-Audio-Sender.amxd` opcional) no kit recebido ou no [versão 2.1.0](https://github.com/ntworm/rc-surface/releases/tag/v2.1.0) e confira com o `SHA256SUMS.txt`.
3. **Instalação:** dê dois cliques no `RC-Surface-2.1.0.ablx` para instalar no Live (reinicie o Live se já estiver aberto) e ative o **RC Surface** em *Options → Preferences → Extensions*.
4. **Conexão:** abra o painel do RC Surface no Live, escaneie o QR code com o celular e aceite o certificado HTTPS local autoassinado uma única vez. Se o celular não abrir a página, use a aba **Rede** do painel: ela mostra o endereço que o QR usa e tem **ACHAR CONFIGURAÇÃO**.
5. **Performance e Mapeamento:** use as 7 abas para tocar ou toque em **MAP** no cabeçalho para vincular parâmetros, disparar notas MIDI ou lançar clips.

> **Atualizando da versão 1.x:** o RC Surface `2.0.0` salva projetos, presets e mapeamentos em `storageDirectory/surface-v2/` (schema 2). Configure a versão 2.0 do zero; arquivos 1.x existentes permanecem intactos. Veja [`docs/INSTALL.pt-BR.md`](docs/INSTALL.pt-BR.md) para detalhes.

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

## Segurança e limitações

> [!WARNING]
> **Aviso de segurança**: o RC Surface executa um servidor HTTPS/WebSocket na sua rede local. Ações de controlador e administração exigem tokens de sessão rotativos, mas o sistema foi projetado exclusivamente para redes domésticas ou de estúdio confiáveis. Não exponha portas na internet pública nem compartilhe QR codes/URLs de sessão. Veja [SECURITY.pt-BR.md](docs/SECURITY.pt-BR.md) para o modelo completo de ameaças.

- **Processamento local:** os quadros da câmera e o áudio do microfone são processados localmente no navegador do celular; mídia bruta nunca sai do aparelho.
- **Escopo do AbletonOSC:** mapeamentos contínuos de parâmetros e sensores funcionam de forma independente via SDK; `REC`, `Launch Clip`, `AUT` em `SYNC`, Deep Sync e transporte por locators exigem o AbletonOSC.
- **Devices Max for Live:** o modo `Trigger Note` exige o `RC-Midi-Receiver.amxd` na track MIDI de destino. Substitua instâncias antigas (v1) em Sets salvos para não manter portas UDP legadas abertas.

## Licença

PolyForm Noncommercial 1.0.0 — livre para uso, redistribuição e modificação sem fins comerciais; a venda comercial deste software ou de versões modificadas não é permitida. Veja a [LICENSE](LICENSE) para o texto completo e o aviso obrigatório.
© Gabriel Worm · <https://github.com/ntworm/rc-surface>.

Ableton e Live são marcas registradas da Ableton AG. O RC Surface é um projeto independente, sem vínculo, endosso ou patrocínio da Ableton AG.
