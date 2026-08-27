/**
 * Confere visualmente as CADEIAS DE COTA por lado.
 *
 * O que só o print responde: a cadeia sai FORA da planta? escalonada? o rótulo
 * é legível? Os números já são provados por teste de unidade
 * (`__tests__/blueprintCotasPorLado.test.ts`) — aqui se mede o que o teste não
 * alcança, que é onde os traços caem.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/wall-render/cotas.mjs [urlBase]
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
  ['saida-cotas-off.png', '?cotas=0'],
  ['saida-cotas-on.png', '?cotas=1'],
]) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('pageerror', (e) => erros.push(`[${nome}] ${e.message}`));
  await page.goto(`${urlBase}/docs/spikes/wall-render/index.html${query}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(aqui, nome) });
  await page.close();
}

await browser.close();
console.log(erros.length ? `ERROS NO CONSOLE:\n${erros.join('\n')}` : 'sem erro de console');
console.log('prints em docs/spikes/wall-render/ — off sem cadeia, on com cadeia FORA da planta');
