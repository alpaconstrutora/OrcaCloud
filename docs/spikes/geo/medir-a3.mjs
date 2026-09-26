/**
 * A3 — portão de navegador da ortofoto e do DEM (ver `main.ts`).
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/geo/medir-a3.mjs [urlBase] [pastaDeSaida]
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
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') erros.push(m.text());
});
let falhas = 0;
const ok = (c, m) => {
  console.log(`${c ? '✅' : '❌'} ${m}`);
  if (!c) falhas++;
};

await page.goto(`${urlBase}/docs/spikes/geo/index.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__a3, null, { timeout: 20000 });
const a3 = await page.evaluate(() => window.__a3);
await page.screenshot({ path: path.join(saida, 'a3-ortofoto.png') });

ok(!a3.erroOrto, `ortofoto preparada no navegador ${a3.erroOrto ?? ''}`);
if (a3.orto) {
  ok(a3.orto.residuoPx < 1, `encaixe: desvio ${a3.orto.residuoPx.toFixed(4)} px < 1`);
  ok(Math.abs(a3.orto.pixelM - 0.5) < 0.001, `pixel no chão ${a3.orto.pixelM.toFixed(4)} m (0,5 m no arquivo)`);
  ok(a3.orto.largura < 200 && a3.orto.altura <= 100, `recortada na área do lote + 30 m: ${a3.orto.largura}×${a3.orto.altura} de 200×100`);
  ok(a3.orto.pixelDaOrigem[0] === 100 && a3.orto.pixelDaOrigem[1] === 50, `a origem do desenho cai no pixel (100, 50) do arquivo (${a3.orto.pixelDaOrigem})`);
  ok(JSON.stringify(a3.orto.corNaOrigem) === JSON.stringify([100, 50, 150, 255]), `e a cor lá é a do arquivo: ${a3.orto.corNaOrigem}`);
  ok(Math.abs(a3.orto.rotacaoMrad) > 3 && Math.abs(a3.orto.rotacaoMrad) < 10, `giro pela convergência meridiana: ${a3.orto.rotacaoMrad.toFixed(2)} mrad`);
}
ok(!a3.erroDem, `DEM lido no navegador (Deflate + float32) ${a3.erroDem ?? ''}`);
if (a3.dem) {
  ok(a3.dem.pontos === 1999 && a3.dem.semValor === 1, `DEM: ${a3.dem.pontos} pontos, ${a3.dem.semValor} NODATA`);
  ok(a3.dem.preliminar === false, 'DEM de 1 m: levantamento, não preliminar');
}
ok(erros.length === 0, `sem erro de console (${erros.join(' | ')})`);

await browser.close();
console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas > 0 ? 1 : 0);
