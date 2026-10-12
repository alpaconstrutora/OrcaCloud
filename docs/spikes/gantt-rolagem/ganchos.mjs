/**
 * Compara a COR da barra de resumo (etapa) com a dos ganchos das pontas, em pixels de tela.
 * Pedido de 12/10/2026 (com print): "as cores devem ser as mesmas" — a barra era cinza a 35%
 * e os ganchos, o mesmo cinza sólido (bem mais escuro).
 *
 *   PLAYWRIGHT_CORE=… node docs/spikes/gantt-rolagem/ganchos.mjs [urlBase] [pasta do print] [parâmetros extras]
 * Sai com código ≠ 0 se a diferença entre barra e gancho passar de 6 em algum canal.
 */
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import path from 'node:path';
async function loadChromium() {
    const pick = (m) => m.chromium ?? m.default?.chromium;
    try { const local = await import('playwright-core'); if (pick(local)) return pick(local); } catch { /* env */ }
    return pick(await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.js')).href));
}

const urlBase = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? '.';
const extra = process.argv[4] ? '&' + process.argv[4] : '';
const DSF = 2;
const browser = await (await loadChromium()).launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 1500, height: 800 }, deviceScaleFactor: DSF });
await page.goto(`${urlBase}/docs/spikes/gantt-rolagem/index.html?layout=app&escala=month&tarefas=12${extra}`, { waitUntil: 'networkidle' });
await page.waitForSelector('[class*="group/summary-bar"]'); await page.waitForTimeout(700);

const caixa = await page.evaluate(() => {
    const r = document.querySelector('[class*="group/summary-bar"]').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
});
const png = await page.screenshot({ clip: { x: caixa.x - 4, y: caixa.y - 4, width: Math.min(caixa.w + 8, 1400), height: caixa.h + 20 } });
await sharp(png).toFile(path.join(outDir, 'ganchos.png'));
const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
const px = (cx, cy) => { // cx, cy em px CSS relativos ao recorte
    const i = (Math.round(cy * DSF) * info.width + Math.round(cx * DSF)) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
};
const ox = 4, oy = 4; // margem do recorte
// Logo abaixo da borda de cima: longe do texto de % (centrado na barra).
const meioY = oy + 3;
// Barra: amostras perto de cada ponta, dentro da borda de 1px.
const barraEsq = px(ox + 4, meioY);
const barraDir = px(ox + caixa.w - 4, meioY);
// Gancho: o triângulo sólido fica junto ao canto de cima de cada ponta.
const ganchoEsq = px(ox + 1.5, oy + caixa.h + 1.5);
const ganchoDir = px(ox + caixa.w - 1.5, oy + caixa.h + 1.5);
const dif = (a, b) => Math.max(...a.map((v, k) => Math.abs(v - b[k])));
const r = { barraEsq, ganchoEsq, difEsq: dif(barraEsq, ganchoEsq), barraDir, ganchoDir, difDir: dif(barraDir, ganchoDir) };
console.log(JSON.stringify(r));
await browser.close();
if (r.difEsq > 6 || r.difDir > 6) { console.error('Gancho com cor diferente da barra'); process.exit(1); }
