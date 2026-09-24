# Encontrabilidade: Google, outros buscadores e IAs

Estado em 24/09/2026. Este documento explica por que a landing page não aparecia
nas buscas, o que já foi resolvido no repositório e o que só o dono das contas
(Google, Bing, GitHub) consegue fazer.

## Diagnóstico

1. **A URL da landing tem três dias.** O repositório foi renomeado em 21/09
   (`ableton-rc-surface` → `rc-surface`). O GitHub redireciona o endereço do
   repositório, mas **não redireciona o GitHub Pages**: a página antiga,
   `ntworm.github.io/ableton-rc-surface/`, passou a dar 404, e a nova,
   `ntworm.github.io/rc-surface/`, ainda não foi descoberta. As buscas ainda
   mostram o repositório com o nome antigo e trechos desatualizados ("MediaPipe
   CDN"), que é o cache velho dos buscadores.
2. **Nada avisava os buscadores.** Não havia sitemap da landing nem cadastro no
   Google Search Console. O `sitemap.xml` do domínio (gerado pelo repositório do
   portfólio, `ntworm/ntworm.github.io`) lista só as páginas do portfólio.
3. **O português não existia para o Google.** A tradução acontecia no navegador,
   ao clicar em PT, na mesma URL. Buscadores indexam uma URL por idioma; sem uma
   URL em português, nenhuma busca em português podia cair na landing.
4. **Título e descrição não usavam as palavras que as pessoas buscam.** O título
   era "RC Surface 1.0.0 — Operator Sheet". Ninguém pesquisa "operator sheet";
   pesquisam "controlar Ableton pelo celular", "phone as MIDI controller for
   Ableton", "Ableton controller app"...
5. **O nome é genérico.** "RC Surface" disputa com carrinhos de controle remoto
   (RC) e com o Microsoft Surface. Em títulos, posts e descrições, escreva sempre
   junto de "Ableton Live" (por exemplo, "RC Surface — Ableton Live controller in
   your phone's browser"). Use "for Ableton Live" como descrição, nunca como parte
   do nome do produto (marca da Ableton AG).
6. **Quase nenhum link de fora.** O Google descobre e ranqueia páginas pelos links
   que apontam para elas. Hoje praticamente só o GitHub e o portfólio apontam.

O que já estava certo: repositório público com descrição, homepage e 12 topics;
landing com texto real no HTML (não depende de JavaScript para existir);
`og:image`; `robots.txt` do domínio liberando todos os robôs, inclusive os de IA.

## O que foi feito neste repositório

| Arquivo | Para quê |
| --- | --- |
| `docs/index.html` (bloco `seo:begin`/`seo:end` do `<head>`) | Título e descrição com as palavras certas, `canonical`, `hreflang` EN/PT, Open Graph/Twitter e dados estruturados JSON-LD (`SoftwareApplication`, `SoftwareSourceCode`, `WebPage`, `FAQPage`). |
| `docs/pt-br.html` | A landing em português com URL própria e o texto já traduzido no HTML: indexável pelo Google e legível por robôs de IA que não rodam JavaScript. Abre em português mesmo para quem escolheu EN antes. |
| `docs/sitemap.xml` | As duas URLs, pareadas por idioma. É o arquivo que se envia ao Search Console e ao Bing. |
| `docs/llms.txt`, `docs/llms-full.txt` | Resumo e documentação completa em texto puro, no formato [llmstxt.org](https://llmstxt.org), para assistentes de IA e ferramentas como o GitMCP. |
| `docs/36ca8499c958cd2fd48e5d1c5f193fd1.txt`, `scripts/indexnow.mjs`, `.github/workflows/indexnow.yml` | IndexNow: depois de cada publicação do Pages que muda a landing, avisa Bing, Yandex, Seznam e Naver — e, pelo Bing, o ChatGPT Search, o Copilot e o DuckDuckGo. A chave é pública por definição. |
| `CITATION.cff` | Ativa o "Cite this repository" do GitHub e dá metadados limpos para indexadores acadêmicos e de IA. |
| `README.pt-BR.md` | README completo em português, com link a partir do README em inglês. |
| `scripts/build-site.mjs` (`npm run build:site`) e `scripts/build-site.test.mjs` | Gera os arquivos acima a partir das fontes (landing, catálogo `docs/site-i18n.js`, docs em inglês) e faz o `npm test` falhar se algum ficar desatualizado. |

**Manutenção:** depois de mexer em `docs/index.html`, `docs/site-i18n.js`, nos
docs em inglês ou na versão do `package.json`, rode `npm run build:site`. O
`npm test` avisa se você esquecer.

## O que só você pode fazer

### 1. Google Search Console — o passo que mais importa

1. Abra <https://search.google.com/search-console> e clique em **Adicionar
   propriedade** → **Prefixo do URL** → `https://ntworm.github.io/rc-surface/`.
2. Verificação pelo método **Arquivo HTML**: baixe o `google….html` que o Google
   oferece, coloque em `docs/` deste repositório e faça push. (Ou use o método
   **Tag HTML** e acrescente a `<meta name="google-site-verification" …>` ao
   bloco gerado em `scripts/build-site.mjs`.)
3. Em **Sitemaps**, envie `sitemap.xml`.
4. Em **Inspeção de URL**, cole `https://ntworm.github.io/rc-surface/` e clique em
   **Solicitar indexação**. Repita com `https://ntworm.github.io/rc-surface/pt-br.html`.
5. Nos dias seguintes, acompanhe **Páginas** (o que foi indexado) e, depois,
   **Desempenho** (por quais buscas as pessoas chegam).

Dica: se quiser cobrir o portfólio e todos os projetos de uma vez, crie também a
propriedade `https://ntworm.github.io/` e verifique pelo repositório do portfólio.

### 2. Bing Webmaster Tools — Bing, DuckDuckGo, Yahoo, Ecosia, ChatGPT Search e Copilot

1. Abra <https://www.bing.com/webmasters> e use **Importar do Google Search
   Console** (depois do passo 1, é um clique).
2. Confirme que o sitemap entrou.
3. Depois do merge deste trabalho, rode uma vez à mão: **Actions → IndexNow →
   Run workflow**. Daí em diante ele roda sozinho a cada publicação do Pages que
   mudar a landing.

### 3. Repositório do portfólio (`ntworm/ntworm.github.io`)

O `robots.txt` só vale na raiz do domínio, e a raiz é o portfólio. Duas mudanças
lá:

**a) Anunciar o sitemap da landing.** Em `site/public/robots.txt`, acrescente uma
linha:

```text
User-agent: *
Allow: /
Sitemap: https://ntworm.github.io/sitemap.xml
Sitemap: https://ntworm.github.io/rc-surface/sitemap.xml
```

**b) Redirecionar a URL antiga.** Como o projeto não usa mais o caminho
`/ableton-rc-surface/`, quem responde por ele agora é o portfólio. Crie
`site/public/ableton-rc-surface/index.html` com:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>RC Surface moved</title>
<link rel="canonical" href="https://ntworm.github.io/rc-surface/">
<meta http-equiv="refresh" content="0; url=https://ntworm.github.io/rc-surface/">
<script>location.replace('https://ntworm.github.io/rc-surface/' + location.hash);</script>
</head>
<body><p>RC Surface moved to <a href="https://ntworm.github.io/rc-surface/">ntworm.github.io/rc-surface</a>.</p></body>
</html>
```

O Google trata um `refresh` imediato como redirecionamento permanente, então o
que a URL antiga tinha de reputação passa para a nova, e links antigos (fóruns,
posts) voltam a funcionar.

A página do projeto no portfólio já aponta para a landing; vale acrescentar
também o link da versão em português.

### 4. Configurações do repositório no GitHub

- **Topics** (máximo 20; hoje são 12). Acrescente: `midi-controller`,
  `max-for-live`, `ableton-live-12`, `live-performance`, `music-production`,
  `hand-tracking`, `gesture-control`, `remote-control`.
- **Description** (aparece no Google como título do resultado do GitHub):
  "Turn your phone's browser into a wireless controller for Ableton Live 12 —
  pads, XY, faders, motion sensors, audio and hand tracking. No app.
  Source-available (PolyForm Noncommercial)."
- **Social preview** (Settings → General → Social preview): envie o
  `docs/og-image.png` (1200×630). É a imagem que aparece quando alguém cola o link
  do repositório no WhatsApp, Discord, X ou LinkedIn.
- **Fixe o repositório** no perfil (github.com/ntworm → Customize your pins) e
  cite o RC Surface no README do perfil (`ntworm/ntworm`).

### 5. Links de fora — o que mais pesa depois do Search Console

Sempre com o nome junto de "Ableton Live" e o link da **landing** (não só do
GitHub), para concentrar a relevância numa URL:

- **Fórum da KVR Audio** — você já divulgou o RC Setlist lá; um tópico
  "[FREE] RC Surface 1.0 — use your phone as an Ableton Live controller" segue o
  mesmo formato.
- **Fórum da Ableton** e o canal `#extensions` do Discord oficial (seguindo as
  regras de cada um).
- **Reddit**: r/ableton e r/WeAreTheMusicMakers (respeite as regras de
  autopromoção de cada subreddit).
- **YouTube**: o vídeo de instalação (`docs/assets/videos/01_install_open_narrated.mp4`)
  publicado com um título buscável, por exemplo "Control Ableton Live from your
  phone — free, no app (RC Surface)", e uma versão em português ("Controle o
  Ableton Live pelo celular, sem app"). O YouTube é o segundo maior buscador e os
  vídeos aparecem no Google.
- **Comunidades brasileiras** de produção musical e Ableton (grupos de Facebook,
  Discord e Telegram), com o link da página em português.
- **AlternativeTo** e **Product Hunt**: cadastro do projeto, com descrição factual
  de o que ele faz.
- A página do **Gumroad** também deve apontar para a landing.

### 6. Assistentes de IA (ChatGPT, Claude, Gemini, Perplexity)

- As IAs com busca na web encontram o projeto pelos buscadores: o ChatGPT e o
  Copilot usam o Bing, o Gemini usa o Google. Os passos 1, 2 e 5 valem para elas.
- O `llms.txt`, o `llms-full.txt`, o README em inglês e português e o JSON-LD já
  estão publicados.
- O `robots.txt` do portfólio libera todos os robôs (`User-agent: *`), inclusive
  GPTBot, ClaudeBot e PerplexityBot. Mantenha assim.

### 7. Como medir

- No Google: `site:ntworm.github.io/rc-surface` mostra o que foi indexado.
- No Search Console: **Páginas** e **Desempenho**.
- Daqui a algumas semanas, pergunte a um assistente com busca "how can I control
  Ableton Live from my phone's browser?" e veja se o RC Surface aparece.

Expectativa: depois do Search Console, a indexação costuma levar de alguns dias a
duas semanas; buscas pelo nome aparecem primeiro, e buscas genéricas ("controlar
Ableton pelo celular") dependem principalmente dos links de fora do passo 5.
