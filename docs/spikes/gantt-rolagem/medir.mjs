/**
 * Mede a rolagem do Gantt: nós do DOM, e pausas de quadro (rAF) durante rolagem
 * horizontal, vertical e ao chegar na borda esquerda (recuo da timeline).
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/gantt-rolagem/medir.mjs [urlBase] [consulta extra...]
 *
 * Cada consulta extra é um cenário (ex.: "escala=day&recuo=0"). Sem cenários,
 * roda o conjunto padrão (dia e semana, antes × depois do recuo).
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

async function loadChromium() {
    const pick = (m) => m.chromium ?? m.default?.chromium;
    try {
        const local = await import('playwright-core');
        if (pick(local)) return pick(local);
    } catch { /* env */ }
    return pick(await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.js')).href));
}

const urlBase = process.argv[2] ?? 'http://localhost:3100';
const cenarios = process.argv.slice(3).length ? process.argv.slice(3) : [
    'escala=day&recuo=0', 'escala=day&recuo=1',
    'escala=week&recuo=0', 'escala=week&recuo=1',
];
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
const SC = 'div.overflow-auto.rounded-3xl';

async function quadros(page, acao) {
    await page.evaluate(() => {
        window.__q = []; let t = performance.now();
        const loop = (agora) => { window.__q.push(agora - t); t = agora; if (window.__rodando) requestAnimationFrame(loop); };
        window.__rodando = true; requestAnimationFrame(loop);
    });
    const t0 = Date.now();
    await acao();
    const dur = Date.now() - t0;
    await page.waitForTimeout(300);
    return page.evaluate((dur) => {
        window.__rodando = false;
        const q = window.__q.slice(1).sort((a, b) => a - b);
        const p = (x) => Math.round(q[Math.min(q.length - 1, Math.floor(q.length * x))] ?? 0);
        return { duracaoMs: dur, quadros: q.length, p50: p(0.5), p95: p(0.95), max: Math.round(q[q.length - 1] ?? 0), acima50ms: q.filter((v) => v > 50).length };
    }, dur);
}

const resultado = [];
for (const c of cenarios) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const t0 = Date.now();
    await page.goto(`${urlBase}/docs/spikes/gantt-rolagem/index.html?${c}`, { waitUntil: 'networkidle' });
    await page.waitForSelector(SC);
    await page.waitForTimeout(800);
    const carga = Date.now() - t0;
    const info = await page.evaluate(() => ({ colunas: window.__harness.colunas, passos: window.__harness.passos, nos: window.__harness.nos() }));
    const box = await page.locator(SC).boundingBox();
    await page.mouse.move(box.x + 800, box.y + 300);

    const horizontal = await quadros(page, async () => {
        for (let i = 0; i < 30; i++) { await page.mouse.wheel(150, 0); await page.waitForTimeout(16); }
    });
    const vertical = await quadros(page, async () => {
        for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(16); }
    });
    // Arrastar a barra = scrollLeft em passos, como o polegar faz.
    const barra = await quadros(page, async () => {
        await page.evaluate(async (sel) => {
            const el = document.querySelector(sel);
            for (let i = 0; i < 40; i++) {
                el.scrollLeft = Math.max(0, el.scrollLeft - 120);
                await new Promise((r) => requestAnimationFrame(r));
            }
        }, SC);
    });
    const depois = await page.evaluate(() => ({ colunas: window.__harness.colunas, passos: window.__harness.passos, nos: window.__harness.nos() }));
    resultado.push({ cenario: c, cargaMs: carga, ...info, horizontal, vertical, barraParaEsquerda: barra, depoisDaBorda: depois });
    await page.close();
}
console.log(JSON.stringify(resultado, null, 2));
await browser.close();
