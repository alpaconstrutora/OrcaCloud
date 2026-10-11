/**
 * Dirige o harness da gaveta do mapa com Leaflet e fundos REAIS.
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/mapa-do-lote/fotografar.mjs [urlBase] [pastaDeSaida]
 *
 * Portão: cola a coordenada → o mapa vai lá (zoom 18); clica 4 cantos a
 * ±(dx, dy) pixels do centro; "Usar esta área" entrega vértices que batem com
 * a conversão Web Mercator desses pixels (< 1 m); fundos Ruas e Relevo
 * carregam ladrilhos; nenhum erro de console.
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

const urlBase = process.argv[2] ?? 'http://localhost:3197';
const saida = process.argv[3] ?? 'C:/tmp';
const CENTRO = { lat: -22.6164, lon: -46.0412 };
const ZOOM = 18;

// Web Mercator: pixel global no zoom z ↔ lat/lon.
const TAM = 256 * 2 ** ZOOM;
const px = (lat, lon) => ({
  x: ((lon + 180) / 360) * TAM,
  y: ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * TAM,
});
const geo = (x, y) => ({
  lon: (x / TAM) * 360 - 180,
  lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / TAM))) * 180) / Math.PI,
});

const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
const erros = [];
page.on('pageerror', (e) => erros.push('PAGEERROR ' + e));
page.on('console', (m) => {
  if (m.type() === 'error') erros.push('CONSOLE ' + m.text());
});

await page.goto(`${urlBase}/docs/spikes/mapa-do-lote/index.html`);
await page.waitForSelector('.leaflet-container');
await page.fill('#mapa-busca', '-22,6164, -46,0412');
await page.press('#mapa-busca', 'Enter');
await page.waitForTimeout(400);
await page.waitForFunction(() => document.querySelectorAll('img.leaflet-tile-loaded').length >= 4, null, { timeout: 20000 });

const caixa = await page.locator('[data-testid="mapa-do-lote"]').boundingBox();
const cx = caixa.x + caixa.width / 2;
const cy = caixa.y + caixa.height / 2;
const c = px(CENTRO.lat, CENTRO.lon);
const DX = 110;
const DY = 90;
const cantos = [
  [-DX, -DY],
  [DX, -DY],
  [DX, DY],
  [-DX, DY],
];
const esperados = cantos.map(([dx, dy]) => geo(c.x + dx, c.y + dy));
for (const [dx, dy] of cantos) {
  await page.mouse.click(cx + dx, cy + dy);
  await page.waitForTimeout(120);
}
await page.screenshot({ path: `${saida}/mapa-do-lote-ruas.png` });
const medidas = await page.locator('[data-testid="medidas-da-area"]').innerText();

await page.getByRole('tab', { name: 'Relevo' }).click();
// O OpenTopoMap leva ~0,7–1,4 s por ladrilho (medido com curl em 11/10/2026): espera carregar, não um tempo fixo.
await page
  .waitForFunction(() => [...document.querySelectorAll('img.leaflet-tile-loaded')].filter((i) => i.src.includes('opentopomap')).length >= 4, null, { timeout: 30000 })
  .catch(() => {});
const ladrilhosRelevo = await page.evaluate(() => [...document.querySelectorAll('img.leaflet-tile-loaded')].filter((i) => i.src.includes('opentopomap')).length);
await page.screenshot({ path: `${saida}/mapa-do-lote-relevo.png` });

await page.getByRole('button', { name: 'Usar esta área' }).click();
const area = await page.evaluate(() => window.__area);

const m = (a, b) => Math.hypot((a.lat - b.lat) * 111_000, (a.lon - b.lon) * 102_700);
const vertices = area.pontosMm.map((p, i) => ({ i, p }));
// Os vértices entregues voltam a lat/lon pela georreferência (origem = centro da caixa, norte para cima).
const g = area.georreferencia;
const dist = vertices.map(({ p }, i) => {
  const lat = g.latitude + p.y / 1000 / 110_784;
  const lon = g.longitude + p.x / 1000 / (111_320 * Math.cos((g.latitude * Math.PI) / 180));
  return m({ lat, lon }, esperados[i]);
});

console.log('medidas na tela:', medidas.replace(/\n+/g, ' | '));
console.log('medidas entregues:', JSON.stringify(area.medidas));
console.log('georreferência:', JSON.stringify(area.georreferencia), 'nova =', area.georreferenciaNova);
console.log('distância vértice entregue × pixel clicado (m):', dist.map((d) => d.toFixed(2)).join(', '));
console.log('ladrilhos do Relevo carregados:', ladrilhosRelevo);
console.log('erros:', erros.length ? erros : 'nenhum');
const ok = dist.every((d) => d < 1) && ladrilhosRelevo > 0 && erros.length === 0 && area.medidas.serveCopernicus;
console.log(ok ? '✅ PORTÃO PASSOU' : '❌ PORTÃO FALHOU');
await browser.close();
process.exit(ok ? 0 : 1);
