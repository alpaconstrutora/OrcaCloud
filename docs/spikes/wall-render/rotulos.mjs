/**
 * Rótulo de ambiente no desenho — nome, área e perímetro.
 *
 * O que só o print responde: o rótulo fica DENTRO do cômodo? centrado? some
 * quando o cômodo é pequeno demais para o texto? As três são de pixel, e
 * nenhuma delas aparece em teste de unidade.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/wall-render/rotulos.mjs [urlBase]
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
for (const [nome, query] of [
  ['saida-rotulos-off.png', '?rotulos=0'],
  ['saida-rotulos-on.png', '?rotulos=1'],
  // Espessuras diferentes: dois ambientes, um deles estreito.
  ['saida-rotulos-mista.png', '?mista=1&rotulos=1'],
]) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('pageerror', (e) => erros.push(`[${nome}] ${e.message}`));
  await page.goto(`${urlBase}/docs/spikes/wall-render/index.html${query}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(aqui, nome) });
  await page.close();
}

await browser.close();
console.log(erros.length ? `ERROS NO CONSOLE:\n${erros.join('\n')}` : 'sem erro de console');
console.log('prints em docs/spikes/wall-render/ — off sem rotulo, on com nome/area/perimetro DENTRO do comodo');
