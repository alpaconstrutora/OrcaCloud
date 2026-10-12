/**
 * Até onde a roda do mouse afasta a planta (12/10/2026: *"zoom - fica bloqueado
 * em um limite?"*). Afasta até a largura visível parar de crescer e informa o
 * máximo; o mapa de fundo tem de continuar desenhado lá longe.
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/mapa-de-fundo/afastar.mjs [urlBase] [pastaDeSaida]
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

const urlBase = process.argv[2] ?? 'http://localhost:3200';
const saida = process.argv[3] ?? 'C:/tmp';
const browser = await (await loadChromium()).launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 960, height: 660 } });
const erros = [];
page.on('pageerror', (e) => erros.push('PAGEERROR ' + e));
page.on('console', (m) => m.type() === 'error' && erros.push('CONSOLE ' + m.text()));
await page.goto(`${urlBase}/docs/spikes/mapa-de-fundo/index.html?fonte=RELEVO`);
await page.waitForFunction(() => window.__mapa?.enquadrado, null, { timeout: 20000 });
const largura = () => page.evaluate(() => (window.__mapa.limites.x1 - window.__mapa.limites.x0) / 1000);
const inicial = await largura();
await page.mouse.move(16 + 450, 16 + 300);
let anterior = 0;
let atual = inicial;
for (let i = 0; i < 80 && Math.abs(atual - anterior) > 0.01; i++) {
  anterior = atual;
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(60);
  atual = await largura();
}
await page.waitForTimeout(3500); // ladrilhos do nível afastado
await page.screenshot({ path: `${saida}/mapa-de-fundo-afastado.png`, clip: { x: 16, y: 16, width: 900, height: 600 } });
const centro = await page.evaluate(() => {
  const cv = document.querySelector('#raiz canvas');
  const d = cv.getContext('2d').getImageData(cv.width / 2 + 100, cv.height / 2 + 60, 1, 1).data;
  return [d[0], d[1], d[2]];
});
const mapaDesenhado = !(centro[0] === 255 && centro[1] === 255 && centro[2] === 255);
console.log(`largura visível: ${inicial.toFixed(0)} m no enquadramento → máximo ao afastar ${atual.toFixed(0)} m`);
console.log(`zoom do ladrilho lá longe: ${await page.evaluate(() => window.__mapa.zoom())}; mapa desenhado: ${mapaDesenhado}; erros: ${erros.length ? erros.join(' | ') : 'nenhum'}`);
const ok = atual > 4000 && mapaDesenhado && erros.length === 0;
console.log(ok ? '✅ PORTÃO PASSOU' : '❌ PORTÃO FALHOU');
await browser.close();
process.exit(ok ? 0 : 1);
