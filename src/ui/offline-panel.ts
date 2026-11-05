// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import fs from "node:fs/promises";
import path from "node:path";

async function readAsset(panelDir: string, relative: string): Promise<string> {
  const file = path.resolve(panelDir, relative);
  const staticDir = path.resolve(panelDir, "..");
  if (!file.startsWith(staticDir + path.sep)) throw new Error("Panel asset outside static directory");
  return await fs.readFile(file, "utf8");
}

/** The stopped server cannot resolve relative resources from a data: page. */
export async function buildOfflinePanel(panelDir: string, autostart: boolean): Promise<string> {
  let html = await readAsset(panelDir, "index.html");
  const font = await fs.readFile(path.resolve(panelDir, "../fonts/DepartureMono-Regular.woff2"));
  const css = (await readAsset(panelDir, "style.css"))
    .replace('url("../fonts/DepartureMono-Regular.woff2")', `url("data:font/woff2;base64,${font.toString("base64")}")`);
  html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>${css}</style>`);
  for (const match of [...html.matchAll(/<script src="([^"]+)"><\/script>/g)]) {
    const script = (await readAsset(panelDir, match[1]!))
      .replace(/<\/script/gi, closing => closing.replace("/", "\\/"));
    html = html.replace(match[0], () => `<script>${script}</script>`);
  }
  const globals = `<script>
    window.INITIAL_PORT = null;
    window.INITIAL_IS_RUNNING = false;
    window.INITIAL_CLIENTS = [];
    window.INITIAL_AUTOSTART = ${autostart};
  </script>`;
  return html.replace('<body>', () => `<body>${globals}`);
}
