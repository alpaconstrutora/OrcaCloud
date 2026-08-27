/**
 * ESPESSURAS DIFERENTES — o caso do print de 27/08/2026.
 *
 * Envoltória de 300, divisória de 100 em T. Com espessura uniforme o defeito
 * era invisível: avanço de mitra e recuo até a face valem os dois t/2. Aqui
 * diferem por 100 mm.
 *
 * O que o print tem de mostrar:
 *   - a divisória ENCOSTA nas duas fachadas (sem vão, ambiente dividido em 2)
 *   - "int." da divisória = 6,00 − 0,15 − 0,15 = 5,70 (metade DA FACHADA)
 *     e NÃO 6,00 − 0,05 − 0,05 = 5,90 (metade dela mesma), que era o erro
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/wall-render/mista.mjs [urlBase]
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

async function loadChromium() {
  const pick = (m) => m.chromium ?? m.default?.chromium;
  try {
    const local = await import('playwright-core');
    if (pick(local)) return pick(local);
  } catch { /* segue para o caminho por env */ }
  const base = process.env.PLAYWRIGHT_CORE;
  if (!base) throw new Error('defina PLAYWRIGHT_CORE');
  return pick(await import(pathToFileURL(path.join(base, 'index.js')).href));
}

const urlBase = process.argv[2] ?? 'http://127.0.0.1:3103';
const aqui = path.dirname(fileURLToPath(import.meta.url));
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });

const erros = [];
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on('pageerror', (e) => { console.log('PAGEERROR:', e.message); erros.push(e.message); });
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });
await page.goto(`${urlBase}/docs/spikes/wall-render/index.html?mista=1&medidas=1`, {
  waitUntil: 'domcontentloaded',
});
await page.waitForSelector('canvas', { timeout: 30000 });
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(aqui, 'saida-mista.png') });
await page.close();

await browser.close();
console.log(erros.length ? `ERROS NO CONSOLE:\n${erros.join('\n')}` : 'sem erro de console');
console.log('print em docs/spikes/wall-render/saida-mista.png');
console.log('conferir: divisoria com "int. 5,70" (metade da FACHADA), nao 5,90');
