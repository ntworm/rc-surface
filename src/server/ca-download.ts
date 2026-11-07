// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
//
// The place where a phone or a computer gets the certificate authority.
// The certificate is served over plain HTTP on purpose: a device that has
// to trust a certificate cannot be asked to trust the page that carries it.

import * as http from 'node:http';

/** The name the file is offered under. */
const CA_FILE_NAME = 'RC-Surface-CA.crt';

/** The type the certificate of an authority is served with. */
const CA_CONTENT_TYPE = 'application/x-x509-ca-cert';

/** The page in Portuguese. */
const PORTUGUESE = {
  lang: 'pt-BR',
  title: 'RC Surface — o certificado deste computador',
  intro:
    'Instale o arquivo abaixo uma vez em cada celular e em cada computador que abre o RC Surface, e o navegador para de mostrar o aviso de segurança.',
  button: 'Baixar o certificado (RC-Surface-CA.crt)',
  sections: [
    {
      heading: 'No Android',
      steps: [
        'Toque no botão acima para baixar o arquivo RC-Surface-CA.crt.',
        'Não abra o arquivo pela notificação nem pela pasta Downloads: o Android recusa com "Não é possível instalar certificados de CA". A instalação é pelas Configurações.',
        'Abra Configurações e busque "certificado de CA", ou siga Segurança > Criptografia e credenciais > Instalar um certificado > Certificado de CA. Os nomes variam conforme a marca.',
        'Toque em Instalar assim mesmo, confirme com o PIN ou a digital e escolha o arquivo RC-Surface-CA.crt em Downloads.',
      ],
    },
    {
      heading: 'No iPhone',
      steps: [
        'Toque no botão acima e permita o download do perfil.',
        'Abra Ajustes > Perfil Baixado e toque em Instalar.',
        'Abra Ajustes > Geral > Sobre > Configurações de Confiança de Certificados e ative RC Surface local CA.',
      ],
    },
    {
      heading: 'No Windows',
      steps: [
        'Clique no botão acima e mantenha o arquivo baixado.',
        'Dê dois cliques no arquivo RC-Surface-CA.crt e clique em Instalar Certificado.',
        'Escolha Usuário Atual. Marque Colocar todos os certificados no repositório a seguir, clique em Procurar e escolha Autoridades de Certificação Raiz Confiáveis.',
        'Conclua e responda Sim ao aviso de segurança. Feche todas as janelas do navegador e abra de novo.',
      ],
    },
    {
      heading: 'No Mac',
      steps: [
        'Clique no botão acima para baixar o arquivo.',
        'Dê dois cliques no arquivo RC-Surface-CA.crt: ele abre o Acesso às Chaves. Adicione às chaves Início de Sessão.',
        'Dê dois cliques em RC Surface local CA, abra Confiança e escolha Sempre Confiar em Ao usar este certificado. Feche e confirme com a senha.',
        'Feche o navegador e abra de novo.',
      ],
    },
  ],
  limit:
    'Este certificado só vale para localhost e endereços privados da rede. Ele não serve para nenhum site da internet.',
  test: 'Abrir o RC Surface para testar',
};

/** The page in English. */
const ENGLISH: typeof PORTUGUESE = {
  lang: 'en',
  title: 'RC Surface — the certificate of this computer',
  intro:
    'Install the file below once on each phone and each computer that opens RC Surface, and the browser stops showing the security warning.',
  button: 'Download the certificate (RC-Surface-CA.crt)',
  sections: [
    {
      heading: 'On Android',
      steps: [
        'Tap the button above to download the file RC-Surface-CA.crt.',
        'Do not open the file from the notification or the Downloads folder: Android refuses with "Can\'t install CA certificates". It is installed from Settings.',
        'Open Settings and search for "CA certificate", or go to Security > Encryption and credentials > Install a certificate > CA certificate. The names vary by brand.',
        'Tap Install anyway, confirm with your PIN or fingerprint and pick RC-Surface-CA.crt in Downloads.',
      ],
    },
    {
      heading: 'On iPhone',
      steps: [
        'Tap the button above and allow the profile to download.',
        'Open Settings > Profile Downloaded and tap Install.',
        'Open Settings > General > About > Certificate Trust Settings and turn on RC Surface local CA.',
      ],
    },
    {
      heading: 'On Windows',
      steps: [
        'Click the button above and keep the downloaded file.',
        'Double-click RC-Surface-CA.crt and click Install Certificate.',
        'Choose Current User. Select Place all certificates in the following store, click Browse and choose Trusted Root Certification Authorities.',
        'Finish and answer Yes to the security warning. Close every browser window and open it again.',
      ],
    },
    {
      heading: 'On Mac',
      steps: [
        'Click the button above to download the file.',
        'Double-click RC-Surface-CA.crt: Keychain Access opens. Add it to the login keychain.',
        'Double-click RC Surface local CA, open Trust and set When using this certificate to Always Trust. Close and confirm with your password.',
        'Quit the browser and open it again.',
      ],
    },
  ],
  limit:
    'This certificate only covers localhost and private network addresses. It cannot vouch for any site on the internet.',
  test: 'Open RC Surface to test',
};

/** The words of the page, in the language the phone asks for. */
type PageCopy = typeof PORTUGUESE;

/** The style of the page: dark, inlined, and nothing that has to be fetched. */
const STYLE = `
:root { color-scheme: dark; }
body { margin: 0; background: #101014; color: #e9e9ef; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.55; }
main { max-width: 34rem; margin: 0 auto; padding: 2rem 1.25rem 3rem; }
h1 { font-size: 1.45rem; margin: 0 0 0.75rem; } h2 { font-size: 1.05rem; margin: 2rem 0 0.5rem; }
p, ol { margin: 0 0 1rem; } ol { padding-left: 1.25rem; } li { margin-bottom: 0.65rem; }
a { color: #8ab4ff; }
.limit { margin-top: 2rem; color: #a9a9b6; font-size: 0.92rem; }
.button { display: inline-block; padding: 0.95rem 1.3rem; border-radius: 0.6rem; background: #2f6feb; color: #fff; font-weight: 600; text-decoration: none; }
.test a { display: inline-block; padding: 0.8rem 1.1rem; border: 1px solid #3a3a45; border-radius: 0.6rem; text-decoration: none; }
`;

/**
 * Escapes the text that goes into the page. The angle bracket that closes
 * a step of a menu path is left alone: it is valid in the body of a page.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The language the phone asks for. */
function prefersPortuguese(req: http.IncomingMessage): boolean {
  const header = req.headers['accept-language'];
  if (typeof header !== 'string') return false;
  return header.trim().toLowerCase().startsWith('pt');
}

/**
 * The name of the computer the page was asked for: the phone reached this
 * computer by name, so the name is what the link back carries.
 */
function requestHostname(req: http.IncomingMessage): string {
  const header = req.headers.host;
  const host = typeof header === 'string' ? header.trim() : '';
  if (host) {
    const name = host.startsWith('[')
      ? host.slice(0, host.indexOf(']') + 1)
      : (host.split(':')[0] ?? '');
    if (name) return name;
  }
  const address = req.socket?.localAddress;
  return typeof address === 'string' && address ? address : 'localhost';
}

/** The list of steps, as the page shows it. */
function renderSteps(steps: string[]): string {
  return steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('');
}

/** One heading and its steps for each system. */
function renderSections(sections: PageCopy['sections']): string {
  return sections
    .map(
      (section) =>
        `<h2>${escapeHtml(section.heading)}</h2>\n<ol>${renderSteps(section.steps)}</ol>`,
    )
    .join('\n');
}

/** The page that says where to put the certificate. */
function renderPage(copy: PageCopy, testUrl: string): string {
  return `<!doctype html>
<html lang="${escapeHtml(copy.lang)}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(copy.title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>${escapeHtml(copy.title)}</h1>
<p>${escapeHtml(copy.intro)}</p>
<p><a class="button" href="/ca.crt">${escapeHtml(copy.button)}</a></p>
${renderSections(copy.sections)}
<p class="limit">${escapeHtml(copy.limit)}</p>
<p class="test"><a href="${escapeHtml(testUrl)}">${escapeHtml(copy.test)}</a></p>
</main>
</body>
</html>
`;
}

/** Answers with the certificate of the authority. */
function sendCertificate(res: http.ServerResponse, der: Buffer): void {
  res.writeHead(200, {
    'Content-Type': CA_CONTENT_TYPE,
    'Content-Disposition': `attachment; filename="${CA_FILE_NAME}"`,
    'Cache-Control': 'no-store',
    'Content-Length': String(der.length),
  });
  res.end(der);
}

/** Answers with the page that says where to put the certificate. */
function sendPage(res: http.ServerResponse, req: http.IncomingMessage, httpsPort: number): void {
  const copy = prefersPortuguese(req) ? PORTUGUESE : ENGLISH;
  const body = renderPage(copy, `https://${requestHostname(req)}:${httpsPort}/`);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': String(Buffer.byteLength(body)),
  });
  res.end(body);
}

/** Answers that there is nothing here. */
function sendNotFound(res: http.ServerResponse): void {
  res.writeHead(404, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end('Not found');
}

/**
 * The listener that hands the authority of this computer to the phone.
 * Nothing else is answered here.
 */
export function createCaDownloadListener(
  getCaDer: () => Buffer | null,
  httpsPort: number,
): (req: http.IncomingMessage, res: http.ServerResponse) => void {
  return (req, res) => {
    const path = (req.url ?? '').split('?')[0] ?? '';
    if (req.method !== 'GET' || (path !== '/ca.crt' && path !== '/ca' && path !== '/ca/')) {
      sendNotFound(res);
      return;
    }
    const der = getCaDer();
    if (!der) {
      sendNotFound(res);
      return;
    }
    if (path === '/ca.crt') {
      sendCertificate(res, der);
      return;
    }
    sendPage(res, req, httpsPort);
  };
}
