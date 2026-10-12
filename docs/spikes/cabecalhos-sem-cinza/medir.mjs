/**
 * Conta, no navegador, quantos elementos do CABEÇALHO ainda têm fundo ou texto CINZA
 * (R≈G≈B), olhando a cor realmente renderizada (composta sobre branco), não o nome da
 * classe. Cobre: cabeçalho do Gantt, `StandardTable` (harness do Plano de Suprimentos) e a
 * grade do Planejamento (via harness do Gantt não — a grade é medida pela trava estática).
 *
 *   PLAYWRIGHT_CORE=… node docs/spikes/cabecalhos-sem-cinza/medir.mjs [urlBase] [pastaDosPrints]
 *
 * Sai com código ≠ 0 se sobrar cinza.
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
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });

/** Roda no navegador: lista os elementos cinza dentro de `raizSel`. */
const cinzas = (raizSel) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const sobreBranco = (css) => { // cor efetiva sobre branco → [r,g,b] ou null se transparente
        cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#fff'; cx.fillRect(0, 0, 1, 1);
        cx.fillStyle = css; cx.fillRect(0, 0, 1, 1);
        const d = cx.getImageData(0, 0, 1, 1).data;
        cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#fff'; cx.fillRect(0, 0, 1, 1);
        const base = cx.getImageData(0, 0, 1, 1).data;
        return (d[0] === base[0] && d[1] === base[1] && d[2] === base[2]) ? null : [d[0], d[1], d[2]];
    };
    const ehCinza = (rgb) => rgb && Math.max(...rgb) - Math.min(...rgb) <= 14 && Math.max(...rgb) <= 253;   // gray-50 (249,250,251) conta: é o cinza claro do cabeçalho antigo
    const achados = [];
    const raiz = document.querySelector(raizSel);
    if (!raiz) return { erro: 'raiz não encontrada: ' + raizSel };
    let total = 0;
    for (const el of [raiz, ...raiz.querySelectorAll('*')]) {
        const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
        total++;
        const cs = getComputedStyle(el);
        const fundo = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? sobreBranco(cs.backgroundColor) : null;
        const temTexto = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        const texto = temTexto ? sobreBranco(cs.color) : null;
        if (ehCinza(fundo)) achados.push({ tipo: 'fundo', rgb: fundo.join(','), el: (el.className || el.tagName).toString().slice(0, 70) });
        if (ehCinza(texto)) achados.push({ tipo: 'texto', rgb: texto.join(','), el: (el.textContent || '').trim().slice(0, 24) });
    }
    return { elementos: total, cinza: achados.length, exemplos: achados.slice(0, 10) };
};

const res = {};
// 1) Cabeçalho do Gantt (linha de mês + colunas fixas + datas): o 1º `.sticky.top-0` do Gantt
const gantt = await browser.newPage({ viewport: { width: 1700, height: 900 } });
await gantt.goto(`${urlBase}/docs/spikes/gantt-rolagem/index.html?layout=app&escala=day&tarefas=40`, { waitUntil: 'networkidle' });
await gantt.waitForSelector('[data-gantt-rolador]'); await gantt.waitForTimeout(700);
await gantt.evaluate(() => { document.querySelector('[data-gantt-rolador] .sticky.top-0').id = 'cab-gantt'; });
res.gantt = await gantt.evaluate(cinzas, '#cab-gantt');
await gantt.screenshot({ path: path.join(outDir, 'gantt.png'), clip: { x: 0, y: 160, width: 1700, height: 200 } });

// 2) StandardTable (thead)
const st = await browser.newPage({ viewport: { width: 1500, height: 700 } });
await st.goto(`${urlBase}/docs/spikes/plano-suprimentos/index.html`, { waitUntil: 'networkidle' });
await st.waitForSelector('table thead'); await st.waitForTimeout(400);
await st.evaluate(() => { document.querySelector('table thead').id = 'cab-tabela'; });
res.standardTable = await st.evaluate(cinzas, '#cab-tabela');
await st.screenshot({ path: path.join(outDir, 'tabela.png'), clip: { x: 0, y: 100, width: 1500, height: 260 } });

console.log(JSON.stringify(res, null, 2));
await browser.close();
const falhas = Object.entries(res).filter(([, v]) => v.erro || v.cinza > 0);
if (falhas.length) { console.error('Ainda há cinza no cabeçalho:', falhas.map(([k]) => k).join(', ')); process.exit(1); }
