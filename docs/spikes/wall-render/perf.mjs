/**
 * Mede o custo de UM redesenho do canvas do editor com a planta carregada.
 *
 * O Spike B mediu o renderer ISOLADO com 20 mil objetos. Isto mede o componente
 * de verdade, com ambientes derivados, aberturas e grade — que é o que o RNF-003
 * cobra e o que nunca tinha sido medido.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

async function loadChromium() {
  const pick = (m) => m.chromium ?? m.default?.chromium;
  try { const l = await import('playwright-core'); if (pick(l)) return pick(l); } catch { /* env */ }
  return pick(await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.js')).href));
}

const urlBase = process.argv[2] ?? 'http://localhost:3102';
const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
  args: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(`${urlBase}/docs/spikes/wall-render/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

// Panorâmica contínua por 2 s, contando quadros entregues.
const fps = await page.evaluate(() => new Promise((resolve) => {
  const canvas = document.querySelector('canvas');
  let n = 0;
  const t0 = performance.now();
  function tick(now) {
    const t = now - t0;
    if (t >= 2000) { resolve(Math.round((n / t) * 1000)); return; }
    // Dispara re-render real movendo a vista pela roda.
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: n % 2 ? 120 : -120, clientX: 400, clientY: 300, bubbles: true }));
    n++;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}));

await browser.close();
console.log(`fps do editor sob zoom continuo: ${fps}`);
