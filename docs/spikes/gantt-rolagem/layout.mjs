/**
 * Gantt no layout da tela (`?layout=app`): a barra horizontal está À VISTA sem rolar a
 * página? O cabeçalho de datas continua visível depois de rolar o Gantt para baixo?
 *
 *   PLAYWRIGHT_CORE=… node docs/spikes/gantt-rolagem/layout.mjs [urlBase] [pastaDosPrints] [consulta]
 *
 * Sai com código ≠ 0 se a barra horizontal estiver fora da janela ou o cabeçalho sumir.
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
const consulta = process.argv[4] ?? 'layout=app&escala=day&tarefas=300';
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome', ignoreDefaultArgs: ['--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const SC = '[data-gantt-rolador]';
await page.goto(`${urlBase}/docs/spikes/gantt-rolagem/index.html?${consulta}`, { waitUntil: 'networkidle' });
await page.waitForSelector(SC);
await page.waitForTimeout(900);

const medir = () => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const barraH = el.offsetHeight - el.clientHeight - el.clientTop * 2;
    const cab = el.querySelector('.sticky.top-0');
    return {
        janela: window.innerHeight,
        altura: Math.round(r.height), topo: Math.round(r.top), fundo: Math.round(r.bottom),
        barraHorizontal: barraH,
        barraHorizontalAVista: barraH > 0 && r.bottom <= window.innerHeight + 0.5,
        rolaSozinhoNaVertical: el.scrollHeight > el.clientHeight + 1,
        cabecalhoTopo: cab ? Math.round(cab.getBoundingClientRect().top) : null,
    };
}, SC);

const m1 = await medir();
await page.screenshot({ path: path.join(outDir, 'layout-01-inicio.png') });
// rola o Gantt (por dentro, se ele rolar sozinho; senão, a página) 2000px para baixo
await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el.scrollHeight > el.clientHeight + 1) el.scrollTop += 2000;
    else document.getElementById('rolador-pagina').scrollTop += 2000;
}, SC);
await page.waitForTimeout(400);
const m2 = await medir();
await page.screenshot({ path: path.join(outDir, 'layout-02-rolado.png') });

const falhas = [];
if (!m1.barraHorizontalAVista) falhas.push('barra horizontal fora da janela ao abrir');
if (!(m2.cabecalhoTopo !== null && m2.cabecalhoTopo >= 0 && m2.cabecalhoTopo <= m2.topo + 2)) falhas.push('cabeçalho de datas sumiu ao rolar o Gantt');
console.log(JSON.stringify({ consulta, inicio: m1, depoisDeRolar: m2, falhas }, null, 2));
await browser.close();
if (falhas.length) process.exit(1);
