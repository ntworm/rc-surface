# Compatibilidade

Requisitos e evidências atuais do RC Surface 2.1.0.

## Live

- Ableton Live 12.4.5+ Suite (Beta) com Extensions SDK `1.0.0-beta.0` (instalado a partir de `vendor/ableton-extensions-sdk-1.0.0-beta.0.tgz`, obtido da Ableton; o tarball não faz parte deste repositório — ver `vendor/README.md`).
- Padrão de duas tracks: uma track recebe o `RC-Midi-Receiver.amxd` (Receiver v2); a track com a fonte de áudio recebe o `RC-Audio-Sender.amxd` (o helper de áudio em Max, independente). A entrada do Sender precisa estar ativada no Receiver v2 que vai tocar.
- Veja `docs/INSTALL.pt-BR.md` para o passo a passo completo de instalação.

## Navegador (superfície do operador)

- Chrome desktop (versão estável atual) — console do operador + páginas administrativas avançadas.
- Chrome mobile na horizontal — console do operador em resoluções de celular (emulação do Pixel 5 e viewports equivalentes).
- A matriz Playwright (`tests/ui/*.spec.mjs`) cobre os dois projetos.

## Node e ferramentas

- Node `24.16.x` (faixa declarada: `>=24.16.0 <25`). Veja `engines.node` em `package.json`.
- npm 11.x para comandos de build e teste.
- Playwright `1.62.0` acompanha o Chromium `151.0.7922.34` (build Playwright `chromium-1234`) para os testes headless.

## Rede e portas

- Apenas WebSocket; sem MIDI por UDP. O Receiver v2 envia mensagens Max locais dentro do dispositivo; sem broadcast UDP.
- As portas de teste são definidas por worktree (veja `tests/ui/test-server.mjs` e `playwright.config.mjs`).

## Pacotes de terceiros

- `docs/THIRD-PARTY-NOTICES.md` (inglês) e `docs/THIRD-PARTY-NOTICES.pt-BR.md` (português) listam os componentes efetivamente empacotados no payload ABLX e no bundle do host, com os avisos de licença.
- A [revisão da distribuição](https://github.com/ntworm/rc-surface/blob/main/internal/DISTRIBUTION-REVIEW-1.0.md) registra a matriz de dependências e a conclusão explícita de que nenhum componente de terceiros precisa ser relicenciado.

## Evidência atual e limites

Os checks desta versão são automatizados. Latência real, captura de áudio, WebView e preservação de takes precisam ser conferidos na configuração do usuário.

Regressões automatizadas usam mocks e navegadores isolados; não equivalem a hardware. A preparação final deve registrar commit/hash do pacote, seus gates atuais e revisão visual EN/PT. Este documento não declara publicação.

Mappings, presets e projetos usam `surface-v2` e schema 2. Dados da linha 1.x não migram. Um Set existente não ganha garantia de preservação de takes a partir dessa separação.

## Veja também

- `docs/INSTALL.md`, `docs/INSTALL.pt-BR.md` — passo a passo de instalação.
- `docs/THIRD-PARTY-NOTICES.md`, `docs/THIRD-PARTY-NOTICES.pt-BR.md` — avisos de terceiros.
- `internal/TESTER-GUIDE.md` — orientação atual com evidência histórica separada.
- [revisão da distribuição](https://github.com/ntworm/rc-surface/blob/main/internal/DISTRIBUTION-REVIEW-1.0.md) — matriz de dependências e conclusão de distribuição.
- [arquivo de gates](https://github.com/ntworm/rc-surface/blob/main/internal/RELEASE-GATES-1.0.json) — os gates registrados.
