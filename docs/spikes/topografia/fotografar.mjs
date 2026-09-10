/**
 * Fotografa as três vistas do harness de curvas de nível.
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/topografia/fotografar.mjs [urlBase] [pastaDeSaida]
 *
 * Além do print, lê `window.__topografia` e o canvas: uma vista que montou sem
 * erro de console e com o número de curvas esperado é o que separa "a tela
 * abriu" de "a tela abriu vazia".
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

const urlBase = process.argv[2] ?? 'http://localhost:3100';
const saida = process.argv[3] ?? 'C:/tmp';

const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const erros = [];
page.on('pageerror', (e) => erros.push('PAGEERROR ' + e));
page.on('console', (m) => {
  if (m.type() === 'error') erros.push('CONSOLE ' + m.text());
});

let falhas = 0;
for (const [vista, extra] of [
  ['planta', ''],
  ['painel', ''],
  ['painel', '&fonte=dem'],
  ['corte', ''],
  ['3d', ''],
]) {
  erros.length = 0;
  await page.goto(`${urlBase}/docs/spikes/topografia/index.html?vista=${vista}${extra}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(vista === '3d' ? 4000 : 1200);
  const info = await page.evaluate(() => window.__topografia);
  const nome = `topografia-${vista}${extra ? '-dem' : ''}.png`;
  await page.screenshot({ path: path.join(saida, nome), fullPage: vista === 'painel' });
  const ruido = erros.filter((e) => !/WebGL|GPU|swiftshader/i.test(e));
  console.log(`${nome}: curvas=${info?.curvas} mestras=${info?.mestras} erros=${ruido.length}`);
  for (const e of ruido) console.log('   ' + e.slice(0, 200));
  if (ruido.length > 0 || !info || info.curvas === 0) falhas++;
}

await browser.close();
process.exit(falhas > 0 ? 1 : 0);
