/**
 * Arrasta o POLEGAR da barra de rolagem horizontal do Gantt até a borda esquerda,
 * com o mouse de verdade, e registra a cada passo: scrollLeft, passos de recuo e
 * se o polegar "pulou" (scrollLeft andando para a direita com o mouse indo para a
 * esquerda). Ao fim, solta e registra de novo.
 *
 *   PLAYWRIGHT_CORE=… node docs/spikes/gantt-rolagem/arrastar-barra.mjs [urlBase] [consulta]
 *
 * Sai com código ≠ 0 se a rolagem andar para a DIREITA durante o arrasto para a
 * esquerda (o "travar"), ou se ao soltar na borda a timeline não recuar.
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
const consulta = process.argv[3] ?? 'escala=week&recuo=1&tarefas=300';
const chromium = await loadChromium();
// Sem --hide-scrollbars (padrão do Playwright em headless): sem isso não há barra para arrastar.
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome', ignoreDefaultArgs: ['--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const SC = '[data-gantt-rolador]';
await page.goto(`${urlBase}/docs/spikes/gantt-rolagem/index.html?${consulta}`, { waitUntil: 'networkidle' });
await page.waitForSelector(SC);
await page.waitForTimeout(800);

const estado = () => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const barra = el.offsetHeight - el.clientHeight; // altura da barra horizontal
    const xPolegar = r.left + (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth * el.clientWidth;
    return { scrollLeft: Math.round(el.scrollLeft), scrollWidth: el.scrollWidth, passos: window.__harness.passos, barra, xPolegar: Math.round(xPolegar), yBarra: Math.round(r.top + el.clientHeight + barra / 2) };
}, SC);

const e0 = await estado();
const trilha = [];
if (e0.barra < 4) {
    console.log(JSON.stringify({ erro: 'sem barra de rolagem horizontal visível', e0 }));
    await browser.close();
    process.exit(2);
}
await page.mouse.move(e0.xPolegar, e0.yBarra);
await page.mouse.down();
let x = e0.xPolegar;
let anterior = e0.scrollLeft;
let pulos = 0;
let recuouSegurando = false;
for (let i = 0; i < 60; i++) {
    x -= 15;
    await page.mouse.move(x, e0.yBarra, { steps: 2 });
    await page.waitForTimeout(40);
    const e = await estado();
    if (e.scrollLeft > anterior + 5) pulos++;
    if (e.passos > e0.passos) recuouSegurando = true;
    trilha.push([Math.round(x), e.scrollLeft, e.passos]);
    anterior = e.scrollLeft;
    if (x < e0.xPolegar - 900) break;
}
const antesDeSoltar = await estado();
await page.mouse.up();
await page.waitForTimeout(600);
const depoisDeSoltar = await estado();

const falhas = [];
if (pulos > 0) falhas.push(`a rolagem pulou para a direita ${pulos}× durante o arrasto para a esquerda`);
if (antesDeSoltar.scrollLeft <= 1 && depoisDeSoltar.passos <= antesDeSoltar.passos) falhas.push('soltou na borda e a timeline não recuou');
console.log(JSON.stringify({ consulta, e0, recuouSegurando, pulos, antesDeSoltar, depoisDeSoltar, trilha: trilha.slice(-12), falhas }, null, 2));
await browser.close();
if (falhas.length) process.exit(1);
