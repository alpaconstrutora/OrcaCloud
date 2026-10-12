/**
 * Fotografa o 3D do terreno grande e mede o que aparece.
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/terreno-grande-3d/fotografar.mjs [urlBase] [pastaDeSaida] [query]
 */
import { pathToFileURL } from 'node:url';
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

const urlBase = process.argv[2] ?? 'http://localhost:3201';
const saida = process.argv[3] ?? 'C:/tmp';
const query = process.argv[4] ?? '';
const browser = await (await loadChromium()).launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const erros = [];
page.on('pageerror', (e) => erros.push('PAGEERROR ' + e));
page.on('console', (m) => m.type() === 'error' && erros.push('CONSOLE ' + m.text()));
await page.goto(`${urlBase}/docs/spikes/terreno-grande-3d/index.html${query}`);
await page.waitForSelector('canvas');
await page.waitForTimeout(4000);
const nome = `terreno-3d${query.replace(/[?=&.]/g, '_')}.png`;
await page.screenshot({ path: `${saida}/${nome}` });
const info = await page.evaluate(() => window.__terreno);
console.log('relevo:', JSON.stringify(info), '· print:', nome, '· erros:', erros.length ? erros : 'nenhum');
await browser.close();
