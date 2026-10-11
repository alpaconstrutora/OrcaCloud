/**
 * Mede o POLEGAR das barras de rolagem lendo os pixels do print (o navegador não expõe o
 * polegar ao DOM), em três estados: mouse fora da área, mouse sobre a área, mouse sobre
 * o polegar. Para as duas barras (vertical e horizontal).
 *
 *   PLAYWRIGHT_CORE=… node docs/spikes/barras-rolagem/medir.mjs [urlBase] [pastaDosPrints]
 *
 * Usa `sharp` (do node_modules da frente) para ler os pixels. O Chromium do Playwright em
 * headless esconde as barras (`--hide-scrollbars`) — aqui ele é desligado.
 * Saída: JSON com { reservado, vertical: {repouso, area, polegar}, horizontal: {...} },
 * cada estado com { espessura (px do polegar), cor (rgb no meio do polegar) }.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

async function loadChromium() {
    const pick = (m) => m.chromium ?? m.default?.chromium;
    try {
        const local = await import('playwright-core');
        if (pick(local)) return pick(local);
    } catch { /* env */ }
    return pick(await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.js')).href));
}

const urlBase = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? '.';
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome', ignoreDefaultArgs: ['--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
await page.goto(`${urlBase}/docs/spikes/barras-rolagem/index.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('#area');
await page.waitForTimeout(300);

const g = await page.evaluate(() => {
    const el = document.getElementById('area');
    const r = el.getBoundingClientRect();
    return {
        left: r.left + el.clientLeft, top: r.top + el.clientTop,
        clientWidth: el.clientWidth, clientHeight: el.clientHeight,
        reservadoV: el.offsetWidth - el.clientWidth - el.clientLeft * 2,
        reservadoH: el.offsetHeight - el.clientHeight - el.clientTop * 2,
    };
});

/** Polegar ao longo de uma linha transversal à barra: conta os pixels "não-fundo". */
async function polegar(eixo, nome) {
    // Faixa da barra: vertical = coluna à direita do conteúdo; horizontal = linha abaixo.
    const clip = eixo === 'v'
        ? { x: Math.round(g.left + g.clientWidth), y: Math.round(g.top + 20), width: g.reservadoV, height: 1 }
        : { x: Math.round(g.left + 20), y: Math.round(g.top + g.clientHeight), width: 1, height: g.reservadoH };
    const buf = await page.screenshot({ clip });
    await page.screenshot({ path: path.join(outDir, `${eixo}-${nome}.png`), clip: { x: clip.x - 20, y: clip.y - 20, width: clip.width + 40, height: clip.height + 40 } });
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const px = [];
    for (let i = 0; i < info.width * info.height; i++) px.push([data[i * info.channels], data[i * info.channels + 1], data[i * info.channels + 2]]);
    const fundo = (p) => p[0] > 248 && p[1] > 248 && p[2] > 248; // branco do trilho transparente sobre bg-white
    const marcados = px.filter((p) => !fundo(p));
    const meio = marcados[Math.floor(marcados.length / 2)] ?? null;
    return { espessura: marcados.length, cor: meio ? `rgb(${meio.join(',')})` : null, luminancia: meio ? Math.round(0.2126 * meio[0] + 0.7152 * meio[1] + 0.0722 * meio[2]) : null };
}

const fora = { x: 860, y: 580 };
const res = { reservado: { vertical: g.reservadoV, horizontal: g.reservadoH } };
for (const eixo of ['v', 'h']) {
    await page.mouse.move(fora.x, fora.y); await page.waitForTimeout(250);
    const repouso = await polegar(eixo, 'repouso');
    await page.mouse.move(g.left + 200, g.top + 150); await page.waitForTimeout(250);
    const area = await polegar(eixo, 'area');
    const sobre = eixo === 'v'
        ? { x: g.left + g.clientWidth + g.reservadoV / 2, y: g.top + 20 }
        : { x: g.left + 20, y: g.top + g.clientHeight + g.reservadoH / 2 };
    await page.mouse.move(sobre.x, sobre.y); await page.waitForTimeout(250);
    const sobrePolegar = await polegar(eixo, 'polegar');
    res[eixo === 'v' ? 'vertical' : 'horizontal'] = { repouso, area, polegar: sobrePolegar };
}
// Critérios do plano (item 1). Falha = exit 1.
const falhas = [];
for (const eixo of ['vertical', 'horizontal']) {
    const r = res[eixo];
    if (res.reservado[eixo] !== 8) falhas.push(`${eixo}: espaço reservado ${res.reservado[eixo]}px (deve continuar 8)`);
    if (!(r.repouso.espessura > 0 && r.repouso.espessura <= 5)) falhas.push(`${eixo}: em repouso o polegar tem ${r.repouso.espessura}px (deve ser fino, ≤ 5)`);
    if (r.polegar.espessura !== 8) falhas.push(`${eixo}: sob o mouse o polegar tem ${r.polegar.espessura}px (deve alargar para 8)`);
    if (!(r.area.luminancia < r.repouso.luminancia)) falhas.push(`${eixo}: mouse sobre a área não deu mais contraste (${r.repouso.cor} → ${r.area.cor})`);
    if (!(r.polegar.luminancia < r.area.luminancia)) falhas.push(`${eixo}: polegar sob o mouse não escureceu`);
}
res.falhas = falhas;
console.log(JSON.stringify(res, null, 2));
await browser.close();
if (falhas.length) process.exit(1);
