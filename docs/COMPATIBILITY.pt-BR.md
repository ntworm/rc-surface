# Compatibilidade — RC Surface

Build `1.0.0`. O que a versão candidata 1.0 suporta. A compatibilidade com hardware físico é acompanhada à parte, no gate `physical-hardware` (P09) e em `internal/TESTER-GUIDE.md`.

## Live

- Ableton Live 12+ com Extensions SDK `1.0.0-beta.0` (instalado a partir de `vendor/ableton-extensions-sdk-1.0.0-beta.0.tgz`, obtido da Ableton; o tarball não faz parte deste repositório — ver `vendor/README.md`).
- Padrão de duas tracks: uma track recebe o `RC-Midi-Receiver.amxd` (Receiver v2); a track com a fonte de áudio recebe o `RC-Audio-Sender.amxd` (o helper de áudio em Max, independente). A entrada do Sender precisa estar ativada no Receiver v2 que vai tocar.
- Veja `docs/INSTALL.pt-BR.md` para o passo a passo completo de instalação.

## Navegador (superfície do operador)

- Chrome desktop (versão estável atual) — console do operador + páginas administrativas avançadas.
- Chrome mobile na horizontal — console do operador em resoluções de celular (emulação do Pixel 5 e viewports equivalentes).
- A matriz Playwright (`tests/ui/*.spec.mjs`) cobre os dois projetos.

## Node + ferramentas

- Node `v24.19.0` (faixa declarada: `>=24.16.0 <25`). Veja `engines.node` em `package.json`.
- npm 11.x para comandos de build e teste.
- Playwright `1.62.0` acompanha o Chromium `151.0.7922.34` (build Playwright `chromium-1234`) para os testes headless.

## Rede + portas

- Apenas WebSocket; sem MIDI por UDP. O Receiver v2 envia mensagens Max locais dentro do dispositivo; sem broadcast UDP.
- As portas de teste são definidas por worktree (veja `tests/ui/test-server.mjs` e `playwright.config.mjs`).

## Pacotes de terceiros

- `docs/THIRD-PARTY-NOTICES.md` (inglês) e `docs/THIRD-PARTY-NOTICES.pt-BR.md` (português) listam os componentes efetivamente empacotados no payload ABLX e no bundle do host, com os avisos de licença.
- `internal/DISTRIBUTION-REVIEW-1.0.md` registra a matriz de dependências e a conclusão explícita de que nenhum componente de terceiros precisa ser relicenciado para a candidata 1.0.

## Testado em campo (aceitação v2) vs não medido

Cenários testados em campo (aceitação v2, registrados em `internal/TESTER-GUIDE.md`):

- Instalação só local, pelas fatias A+B (e R opcional).
- Roteamento em duas tracks com o par independente `RC-Audio-Sender` e `RC-Midi-Receiver`.
- Transporte só por WebSocket dentro do Live.
- Cobertura sintética com Playwright do console do operador e das páginas administrativas.

Não medido nesta entrega (gates permanecem `pending`/`blocked` por contrato):

- Latência de ida e volta (round-trip) em hardware real, na máquina do responsável (gate `physical-hardware`).
- Distribuição pública via rota SDK (gate `distribution-publication`).

## Veja também

- `docs/INSTALL.md`, `docs/INSTALL.pt-BR.md` — passo a passo de instalação.
- `docs/THIRD-PARTY-NOTICES.md`, `docs/THIRD-PARTY-NOTICES.pt-BR.md` — avisos de terceiros.
- `internal/TESTER-GUIDE.md` — cenários de aceitação v2 testados em campo.
- `internal/DISTRIBUTION-REVIEW-1.0.md` — matriz de dependências e conclusão de distribuição.
- `internal/RELEASE-GATES-1.0.json` — documento de gates atual.
