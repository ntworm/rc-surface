# Compatibilidade — RC Surface

Versão `2.0.0`. Requisitos e evidências do produto; registros 1.0 não são gates novos da versão 2.0.

## Live

- Ableton Live 12.4.5+ Suite (Beta) com Extensions SDK `1.0.0-beta.0` (instalado a partir de `vendor/ableton-extensions-sdk-1.0.0-beta.0.tgz`, obtido da Ableton; o tarball não faz parte deste repositório — ver `vendor/README.md`).
- Padrão de duas tracks: uma track recebe o `RC-Midi-Receiver.amxd` (Receiver v2); a track com a fonte de áudio recebe o `RC-Audio-Sender.amxd` (o helper de áudio em Max, independente). A entrada do Sender precisa estar ativada no Receiver v2 que vai tocar.
- Veja `docs/INSTALL.pt-BR.md` para o passo a passo completo de instalação.

## Navegador (superfície do operador)

- Chrome desktop (versão estável atual) — console do operador + páginas administrativas avançadas.
- Chrome mobile na horizontal — console do operador em resoluções de celular (emulação do Pixel 5 e viewports equivalentes).
- A matriz Playwright (`tests/ui/*.spec.mjs`) cobre os dois projetos.

## Node + ferramentas

- Node `24.16.x` (faixa declarada: `>=24.16.0 <25`). Veja `engines.node` em `package.json`.
- npm 11.x para comandos de build e teste.
- Playwright `1.62.0` acompanha o Chromium `151.0.7922.34` (build Playwright `chromium-1234`) para os testes headless.

## Rede + portas

- Apenas WebSocket; sem MIDI por UDP. O Receiver v2 envia mensagens Max locais dentro do dispositivo; sem broadcast UDP.
- As portas de teste são definidas por worktree (veja `tests/ui/test-server.mjs` e `playwright.config.mjs`).

## Pacotes de terceiros

- `docs/THIRD-PARTY-NOTICES.md` (inglês) e `docs/THIRD-PARTY-NOTICES.pt-BR.md` (português) listam os componentes efetivamente empacotados no payload ABLX e no bundle do host, com os avisos de licença.
- [historical 1.0 distribution review](https://github.com/ntworm/rc-surface/blob/main/internal/DISTRIBUTION-REVIEW-1.0.md) registra a matriz de dependências e a conclusão explícita de que nenhum componente de terceiros precisa ser relicenciado para a candidata 1.0.

## Evidência atual e limites

O candidato instalado foi relatado como funcionando sem erro ou bug observado. É um relato de uso, não uma certificação exaustiva de cenários ou plataformas. Latência real, captura de áudio e preservação de takes precisam ser conferidas na configuração do usuário.

Regressões automatizadas usam mocks e navegadores isolados; não equivalem a hardware. A preparação final deve registrar commit/hash do pacote, seus gates atuais e revisão visual EN/PT. A versão continua 2.0.0; este documento não declara publicação. Os registros históricos 1.0 e “Receiver v2” descrevem outros ciclos, não o aceite da versão do produto 2.0.

Dados 1.x não migram: mappings/presets/projetos 2.0 usam `surface-v2` e schema 2. Um Set existente não ganha garantia de preservação de takes a partir dessa separação.

## Veja também

- `docs/INSTALL.md`, `docs/INSTALL.pt-BR.md` — passo a passo de instalação.
- `docs/THIRD-PARTY-NOTICES.md`, `docs/THIRD-PARTY-NOTICES.pt-BR.md` — avisos de terceiros.
- `internal/TESTER-GUIDE.md` — orientação atual com evidência histórica separada.
- [historical 1.0 distribution review](https://github.com/ntworm/rc-surface/blob/main/internal/DISTRIBUTION-REVIEW-1.0.md) — matriz de dependências e conclusão de distribuição.
- [arquivo de gates 1.0](https://github.com/ntworm/rc-surface/blob/main/internal/RELEASE-GATES-1.0.json) — somente evidência histórica.
