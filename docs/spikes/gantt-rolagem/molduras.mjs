/**
 * Conta as MOLDURAS (borda + canto arredondado) entre a área rolável do Gantt e o rolador da
 * página, no layout da tela (`?layout=app`). Pedido de 12/10/2026: "parece haver duas bornas
 * arredondadas na vista gantt". Esperado: 1 (o card da vista); 2 = moldura dupla.
 *
 *   PLAYWRIGHT_CORE=… node docs/spikes/gantt-rolagem/molduras.mjs [urlBase] [pasta dos prints]
 * Sai com código ≠ 0 se houver mais de uma moldura.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
async function loadChromium() {
    const pick = (m) => m.chromium ?? m.default?.chromium;
    try { const local = await import('playwright-core'); if (pick(local)) return pick(local); } catch { /* env */ }
    return pick(await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.js')).href));
}
const urlBase = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? '.';
const browser = await (await loadChromium()).launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 1500, height: 800 }, deviceScaleFactor: 2 });
await page.goto(`${urlBase}/docs/spikes/gantt-rolagem/index.html?layout=app&escala=day&tarefas=40`, { waitUntil: 'networkidle' });
const SEL = '[data-gantt-rolador], [data-gantt-rolador]';
await page.waitForSelector(SEL); await page.waitForTimeout(700);
const r = await page.evaluate((sel) => {
    const molduras = [];
    for (let el = document.querySelector(sel); el && el.id !== 'rolador-pagina'; el = el.parentElement) {
        const cs = getComputedStyle(el);
        const borda = ['Top', 'Right', 'Bottom', 'Left'].some((l) => parseFloat(cs['border' + l + 'Width']) > 0 && cs['border' + l + 'Style'] !== 'none');
        const raio = parseFloat(cs.borderTopLeftRadius) > 0;
        if (borda && raio) molduras.push({ raio: cs.borderTopLeftRadius, sombra: cs.boxShadow !== 'none', classe: (el.className || '').toString().slice(0, 60) });
    }
    return molduras;
}, SEL);
await page.screenshot({ path: path.join(outDir, 'moldura.png'), clip: { x: 20, y: 200, width: 500, height: 420 } });
console.log(JSON.stringify({ molduras: r.length, detalhe: r }, null, 2));
await browser.close();
if (r.length > 1) { console.error('Moldura dupla: ' + r.length + ' molduras arredondadas'); process.exit(1); }
