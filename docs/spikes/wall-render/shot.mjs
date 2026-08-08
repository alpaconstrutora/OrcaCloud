/**
 * Tira print do harness de parede e recorta um canto ampliado.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/wall-render/shot.mjs [urlBase] [zoomIn]
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

async function loadChromium() {
  const pick = (m) => m.chromium ?? m.default?.chromium;
  try {
    const local = await import('playwright-core');
    if (pick(local)) return pick(local);
  } catch {
    /* segue para o caminho por env */
  }
  const base = process.env.PLAYWRIGHT_CORE;
  if (!base) throw new Error('defina PLAYWRIGHT_CORE');
  return pick(await import(pathToFileURL(path.join(base, 'index.js')).href));
}

const urlBase = process.argv[2] ?? 'http://localhost:3102';
const zoomIn = Number(process.argv[3] ?? 6);
const aqui = path.dirname(fileURLToPath(import.meta.url));

const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });

const erros = [];
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(String(e)));

await page.goto(`${urlBase}/docs/spikes/wall-render/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

// SEM zoom: o modelo foi dimensionado para que o canto (0,0) do mundo caia em
// (60,60) na tela na vista inicial (0,05 px/mm, deslocamento 60). Enquadramento
// por calculo, nao por tentativa — as duas tentativas anteriores erraram o alvo.
const canvas = page.locator('canvas');
const caixa = await canvas.boundingBox();
await page.waitForTimeout(200);

await page.screenshot({ path: path.join(aqui, 'saida-completa.png') });
// Recorte apertado no canto superior esquerdo da sala, que na vista ampliada
// fica proximo da origem do canvas.
await page.screenshot({
  path: path.join(aqui, 'saida-canto.png'),
  clip: { x: caixa.x, y: caixa.y, width: 260, height: 220 },
});

await browser.close();
console.log(erros.length ? `ERROS NO CONSOLE:\n${erros.join('\n')}` : 'sem erro de console');
console.log('prints em docs/spikes/wall-render/');
