# DISTRIBUTION-REVIEW-1.0 — RC Surface

Revisão de distribuição, dependências e licenças para a candidata 1.0.
Data: 2026-09-14. Owner: `argos-main-2ecffebf-20260914`.

## 1. Matriz de componentes

Colunas: componente; versão resolvida no lock; caminho; licença; origem;
onde é distribuído; obrigação de aviso; estado.

### Dependências de produção (entram no produto)

| Componente | Versão | Licença | Distribuído como | Aviso |
|---|---|---|---|---|
| @ableton-extensions/sdk | 1.0.0-beta.0 (tarball local) | Ableton Extensions SDK License | Bundle host (`dist/extension.js`) | Sim (NOTICE + THIRD-PARTY) |
| ws | 8.21.0 | MIT | Bundle host | Sim |
| selfsigned | 5.5.0 | MIT | Bundle host | Sim |
| @peculiar/x509 | 1.14.3 | MIT | Bundle host | Sim |
| @peculiar/asn1-schema | 2.8.0 | MIT | Bundle host | Sim |
| asn1js | 3.0.10 | BSD-3-Clause | Bundle host | Sim |
| pvutils | 1.1.5 | MIT | Bundle host | Sim |
| tslib | 2.8.1 | 0BSD | Bundle host | Sim |
| osc-min | 2.1.2 | zlib/libpng | Bundle host | Sim |
| @mediapipe/hands | 0.4.1675469240 | Apache-2.0 | Payload browser (`static/phone-v3/vendor/mediapipe`) | Sim (LICENSE vendado) |
| @mediapipe/camera_utils | 0.3.1675466862 | Apache-2.0 | Payload browser | Sim |

### Assets de browser no payload

| Componente | Caminho | Licença | Aviso |
|---|---|---|---|
| Departure Mono | `static/fonts/`, `docs/index.html` | MIT | Sim (LICENSE.txt + NOTICE) |
| OpenMoji (2 glifos) | `docs/index.html` | CC BY-SA 4.0 | Sim (NOTICE + landing) |

### Build/dev (não distribuídos no produto)

@ableton-extensions/cli (1.0.0-beta.0, tarball local), @playwright/test 1.62.0
(Apache-2.0), @types/node 24.13.1, @types/ws 8.18.1, @typescript-eslint/parser
8.65.0, esbuild 0.28.1 (MIT), eslint 9.39.5 (MIT), globals 14.0.0 (MIT),
tsx 4.22.4 (MIT), typescript 5.9.3 (Apache-2.0). Nenhum entra no ABLX; o
`build.ts` copia apenas `static/*`, MediaPipe e legal/.

### Estado por dependência

- **Mantida/usada**: ws, selfsigned, @peculiar/x509 (+asn1-schema/asn1js/pvutils/tslib), osc-min, MediaPipe, fontes.
- **Opcional**: — (oscilador AbletonOSC usa osc-min já listado).
- **Experimental (fora do pacote)**: Native Track / Audio Lab — excluídos por `build.ts` (`static/audio-lab` e `native-audio-contract.*` não entram no payload).
- **Removível com prova**: pkijs é dependência declarada de @peculiar/x509, mas o scan por símbolos distintivos (`CertificateChainValidationEngine`, `getCrypto`, `pkijs`) não o encontrou no bundle — tree-shaken pelo esbuild. Não está no payload.

### Hashes dos tarballs (não rastreados; ver `vendor/manifest.json`)

| Tarball | SHA256 |
|---|---|
| `vendor/ableton-extensions-sdk-1.0.0-beta.0.tgz` | `a10ec4d85d1b3af32de924ff77454b05bf3cfd5a0bfcd3b8a6c2bd74069d7a6c` |
| `vendor/ableton-extensions-cli-1.0.0-beta.0.tgz` | `ffbfcc18c65f1debe6ab368a53d7313aa1c8f746faed42da5178e793cbaf0fbc` |

## 2. Confronto com a licença do SDK/CLI (Restrictions)

A licença lida em `node_modules/@ableton-extensions/{sdk,cli}/LICENSE.md`:

- **Permite**: usar o SDK para desenvolver aplicações e publicar/vender/distribuir
  tais aplicações sob marca própria que usem partes ou todo o SDK.
- **Proíbe (cláusula a)**: vender, licenciar, sublicenciar, doar e/ou distribuir
  o Extensions SDK ou partes dele **fora da aplicação** para qualquer pessoa/entidade.
- Proíbe ainda engenharia reversa, uso de logos/marcas não entregues com o SDK
  e violação dos UI-guidelines; aplica as Branding and Trademark Guidelines da Ableton.

**Conclusão:** distribuir a aplicação (ABLX) que incorpora o SDK é permitido.
Distribuir o **código-fonte público do repositório contendo os tarballs do SDK/CLI
em `vendor/`** não tem permissão documentada — os tarballs são parte do material
entregue, fora da aplicação. Status em 2026-09-14: **`distribution-blocked` para
publicação da fonte**, até que exista documento/termo aplicável ou novo
provisionamento. Nenhuma permissão é deduzida do fato de o pacote ser baixável.
Resolução em 2026-09-21: ver seção 6.

## 3. Proposta de provisionamento (para decisão do responsável)

A publicação da fonte exige uma das rotas abaixo; a escolha é do responsável:

1. **Tarballs ignorados + caminho local**: remover os tarballs do rastreio público
   (permanecem em histórico; tratamento de histórico exige contrato específico),
   ignorá-los e exigir `vendor/ableton-extensions-{sdk,cli}-1.0.0-beta.0.tgz`
   obtidos pelo responsável da Ableton, com os hashes acima, antes do `npm ci`.
2. **Artefato CI autorizado**: credencial/artefato com acesso autorizado baixa os
   tarballs no runner (nunca publicados no repo/nas releases).
3. **Termo/documento Ableton** que autorize distribuição do SDK separado.

P02–P08 prosseguem localmente; publicação continua bloqueada sem rota escolhida.
Este contrato não autoriza retirar tarballs nem reescrever histórico.

## 4. Auditoria de dependências

- `npm ci` limpo: ok. `npm audit --json`: **1 high** — `js-yaml@4.3.1` transitiva
  via `eslint → @eslint/eslintrc` (fix disponível em versão mais nova; cadeia
  somente de build, não entra no payload). `npm audit --omit=dev --json`:
  **0 vulnerabilidades** conhecidas. Nenhuma high/critical aplicável ao produto;
  não bloqueia publicação. `npm audit fix --force` não executado.
- Deprecation avisado no install: `glob@10.5.0` (transitiva de ferramenta de dev);
  não afeta o payload.
- `globals@14.0.0` declarada como devDependency direta (o `eslint.config.js` a
  importa diretamente); lock regenerado com **1 linha adicionada**, sem atualização
  em massa dos demais pacotes.

## 5. Marca e coerência (S07)

- Nome do produto: **RC Surface** (manifest, README, NOTICE, landing).
  O nome usa a marca Ableton; não há licença de marca nem declaração de afiliação.
- Branding e Trademark Guidelines da Ableton são referenciadas pela licença do
  SDK como aplicáveis; a landing/README não alegam afiliação ou endosso.
- Coerência PolyForm/NOTICE/landing: licença-base PolyForm Noncommercial 1.0.0
  preservada (não é open source irrestrito — não afirmar isso na landing);
  NOTICE agora cobre o bundle esbuild real (ws/selfsigned/x509/asn1js/pvutils/
  tslib/osc-min/SDK) além de MediaPipe/Departure Mono/OpenMoji.
- **Decisões do responsável antes da publicação**: (a) confirmar apresentação do
  nome "RC Surface" com as guidelines da Ableton; (b) decidir rota de
  provisionamento do SDK (seção 3); (c) autorizar qualquer mudança de direitos
  de uso — nada foi alterado sem ordem. Nenhuma conclusão jurídica é emitida
  em nome do responsável.

## 6. Bloqueios resultantes

### Atualização 2026-09-21 — rota 1 executada

Decisão do responsável (Gabriel Worm, chat de 2026-09-21): rota 1 da seção 3.
Executado na task `rc-surface-release-prep-2026-09-21`:

- `vendor/*.tgz` deixou de ser rastreado (`git rm --cached`; regra em
  `.gitignore`). Só `vendor/manifest.json` (nomes, tamanhos, SHA256) e
  `vendor/README.md` permanecem versionados.
- `npm run check:vendor` (`scripts/check-vendor-sdk.mjs`) verifica os tarballs
  locais contra o manifesto antes de `npm ci`; nunca sobrescreve nem apaga.
- CI hospedada (`ci.yml`, `release.yml`) passou a usar a rota 2 da seção 3 como
  complemento: checkout do repositório **privado** `ntworm/rc-surface-vendor`
  com a deploy key somente-leitura registrada nele (segredo `VENDOR_SDK_KEY`
  no repositório público) e `check-vendor-sdk.mjs --from .vendor-private`.
  Repositório privado, deploy key e segredo criados em 2026-09-21 por ordem
  do responsável; sem o segredo a CI hospedada falha antes do `npm ci`
  (falha explícita, sem vazamento).
- Gate `distribution-publication` em `internal/RELEASE-GATES-1.0.json`:
  `passed`, com esta seção como rationale.

Limite conhecido: os commits alcançáveis a partir de `origin/main` desde
`0ea728c` (v0.6.0, 2026-08-01) ainda contêm os tarballs. Reescrever histórico
publicado é decisão separada do responsável (política Git §5) e não é condição
deste gate; a rota 1 impede novas cópias a partir de agora.

- ~~**`distribution-blocked`** (publicação da fonte/pacote público): até rota de
  provisionamento do SDK decidida e executada.~~ Resolvido em 2026-09-21 (acima).
- **Bloqueio de publicação** também exige: revalidação de S01/S02 (Live Suite
  Beta/exacta) e S07 na data do lançamento.
- Uso incorporado na ABLX: permitido pela licença lida; a candidata local segue.
