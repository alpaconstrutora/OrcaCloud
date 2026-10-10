/**
 * Passeio: prova no navegador que o Gantt navega para ANTES do início.
 *
 *  1. abre com o início do projeto colado na borda esquerda (enquadramento de antes);
 *  2. rolar para a esquerda mostra o período anterior ao início;
 *  3. chegar à borda recua mais um passo SEM a tela pular (a data na borda se mantém);
 *  3b. vários eventos de borda antes do re-render somam UM passo só;
 *  4. trocar de escala reabre no início, e o recuo segue funcionando depois;
 *  5. o recuo cresce até o teto de passos e para;
 *  6. roda para a direita não recua;
 *  7. sem barra de rolagem (timeline cabe na tela), a roda para a esquerda recua;
 *  8. evento de scroll sem movimento horizontal (rolagem vertical) não recua.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/gantt-antes-do-inicio/passeio.mjs [urlBase] [pastaDosPrints]
 *
 * Sai com código ≠ 0 se alguma verificação falhar.
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
const outDir = process.argv[3] ?? '.';
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 1400, height: 760 } });
const erros = [];
page.on('pageerror', (e) => erros.push('PAGEERROR: ' + String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') erros.push('CONSOLE: ' + m.text().slice(0, 300)); });

const falhas = [];
const confere = (ok, msg, extra) => { if (!ok) falhas.push(msg + (extra ? ' ' + JSON.stringify(extra) : '')); };

const SCROLLER = 'div.overflow-auto.rounded-3xl';
const estado = () => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const h = window.__harness;
    // Data na borda esquerda da área de barras = origem + scrollLeft / pxPerDay.
    const origem = new Date(h.primeiraColuna + 'T00:00:00');
    const bordaMs = origem.getTime() + (el.scrollLeft / h.pxPerDay) * 86400000;
    return {
        leadSteps: h.leadSteps, escala: h.timeScale, primeiraColuna: h.primeiraColuna,
        scrollLeft: Math.round(el.scrollLeft), anchorOffsetPx: Math.round(h.anchorOffsetPx),
        dataNaBorda: new Date(bordaMs).toISOString().slice(0, 10),
    };
}, SCROLLER);
const espera = (ms = 400) => page.waitForTimeout(ms);

await page.goto(`${urlBase}/docs/spikes/gantt-antes-do-inicio/index.html?escala=week`, { waitUntil: 'networkidle' });
await page.waitForSelector(SCROLLER);
await espera(600);

// 1. Abre no início
const e1 = await estado();
await page.screenshot({ path: path.join(outDir, '01-abre-no-inicio.png') });
confere(e1.leadSteps === 1, '1: recuo inicial deveria ser 1 passo', e1);
confere(Math.abs(e1.scrollLeft - e1.anchorOffsetPx) <= 1, '1: deveria abrir com o início na borda', e1);
confere(e1.primeiraColuna < '2026-06-15', '1: a timeline deveria começar antes do início', e1);

// 2. Rolar um pouco para a esquerda mostra semanas antes do início, sem recuar ainda
await page.evaluate((sel) => { const el = document.querySelector(sel); el.scrollLeft = el.scrollLeft - 200; el.dispatchEvent(new Event('scroll')); }, SCROLLER);
await espera();
const e2 = await estado();
await page.screenshot({ path: path.join(outDir, '02-antes-do-inicio.png') });
confere(e2.dataNaBorda < '2026-06-15', '2: a borda deveria mostrar data anterior ao início', e2);
confere(e2.leadSteps === 1, '2: não deveria recuar antes de chegar à borda', e2);

// 3. Chegar à borda recua um passo e a data na borda se mantém
await page.evaluate((sel) => { const el = document.querySelector(sel); el.scrollLeft = 0; el.dispatchEvent(new Event('scroll')); }, SCROLLER);
await espera();
const e3antes = { dataNaBorda: e1.primeiraColuna };
const e3 = await estado();
await page.screenshot({ path: path.join(outDir, '03-recuou-sem-pular.png') });
confere(e3.leadSteps === 2, '3: chegar à borda deveria recuar 1 passo', e3);
confere(e3.scrollLeft > 0, '3: rolagem deveria ser compensada (não ficar em 0)', e3);
// Semana: tolerância de 1 dia pelo arredondamento de px.
const diffDias = Math.abs((new Date(e3.dataNaBorda) - new Date(e3antes.dataNaBorda)) / 86400000);
confere(diffDias <= 1, '3: a data na borda deveria se manter (tela não pula)', { e3, esperado: e3antes.dataNaBorda });

// 3b. Um único evento de borda = um único passo (vários eventos antes do re-render não somam)
const antesRajada = (await estado()).leadSteps;
await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    el.scrollLeft = 0;
    for (let i = 0; i < 5; i++) el.dispatchEvent(new Event('scroll'));
}, SCROLLER);
await espera();
const e3b = await estado();
confere(e3b.leadSteps === antesRajada + 1, '3b: rajada de eventos na borda deveria recuar 1 passo só', { antesRajada, e3b });

// 4. Trocar de escala reabre no início com o recuo inicial
await page.evaluate(() => window.__harness.setTimeScale('day'));
await espera(800);
const e4 = await estado();
await page.screenshot({ path: path.join(outDir, '04-escala-dia.png') });
confere(e4.escala === 'day' && e4.leadSteps === 1, '4: escala nova começa com recuo 1', e4);
confere(Math.abs(e4.scrollLeft - e4.anchorOffsetPx) <= 1, '4: escala nova reabre no início', e4);
// Voltar para semana reabre no início; o recuo que já tinha nela é reaproveitado
// (só mais histórico carregado à esquerda — o enquadramento é o mesmo).
await page.evaluate(() => window.__harness.setTimeScale('week'));
await espera(800);
const e4b = await estado();
confere(Math.abs(e4b.scrollLeft - e4b.anchorOffsetPx) <= 1, '4b: voltar para semana reabre no início', e4b);
// …e o recuo continua funcionando depois das trocas (a trava não ficou presa)
await page.evaluate((sel) => { const el = document.querySelector(sel); el.scrollLeft = 0; el.dispatchEvent(new Event('scroll')); }, SCROLLER);
await espera();
const e4c = await estado();
confere(e4c.leadSteps === e4b.leadSteps + 1, '4c: depois de trocar de escala, chegar à borda ainda recua', { e4b, e4c });

// 5. Escala mês: levar a barra de rolagem à borda, repetidamente, recua até o teto
//    (10 passos) e para. É por scroll (barra/trackpad), não pela roda: no Chrome,
//    giros horizontais SINTÉTICOS seguidos param de rolar o elemento — reproduzido
//    numa página HTML pura, sem React nem este código (10/10/2026).
await page.evaluate(() => window.__harness.setTimeScale('month'));
await espera(800);
const e5passos = [];
for (let i = 0; i < 16; i++) {
    await page.evaluate((sel) => { const el = document.querySelector(sel); el.scrollLeft = 0; }, SCROLLER);
    await espera(200);
    e5passos.push((await estado()).leadSteps);
}
const e5 = await estado();
await page.screenshot({ path: path.join(outDir, '05-escala-mes-teto.png') });
const monotono = e5passos.every((v, k) => k === 0 || v >= e5passos[k - 1]);
confere(monotono && e5passos[e5passos.length - 1] === 10, '5: recuo deveria crescer até o teto (10 na escala mês) e parar', { e5, e5passos });
confere(Math.max(...e5passos) <= 10, '5: recuo não pode passar do teto', { e5passos });
let box = await page.locator(SCROLLER).boundingBox();
await page.mouse.move(box.x + 700, box.y + 120);

// 6. Roda para a DIREITA não recua
await page.evaluate(() => window.__harness.setTimeScale('week'));
await espera(800);
const antesDireita = (await estado()).leadSteps;
await page.mouse.wheel(300, 0);
await espera();
const e6 = await estado();
confere(e6.leadSteps === antesDireita, '6: roda para a direita não deveria recuar', { antesDireita, e6 });

// 7. Timeline inteira cabe na tela (sem barra de rolagem): nenhum evento de scroll
//    acontece, então a roda para a esquerda é o único gesto — e ela tem de recuar.
await page.setViewportSize({ width: 3300, height: 760 });
await page.goto(`${urlBase}/docs/spikes/gantt-antes-do-inicio/index.html?escala=year&largura=3200`, { waitUntil: 'networkidle' });
await page.waitForSelector(SCROLLER);
await espera(600);
const semRolagem = await page.evaluate((sel) => { const el = document.querySelector(sel); return el.scrollWidth <= el.clientWidth; }, SCROLLER);
const e7antes = await estado();
box = await page.locator(SCROLLER).boundingBox();
await page.mouse.move(box.x + 700, box.y + 120);
await page.mouse.wheel(-300, 0);
await espera();
const e7 = await estado();
await page.screenshot({ path: path.join(outDir, '07-sem-rolagem-roda.png') });
confere(semRolagem, '7: cenário deveria estar sem barra de rolagem', { e7antes });
confere(e7.leadSteps === e7antes.leadSteps + 1, '7: sem barra de rolagem, a roda para a esquerda deveria recuar', { e7antes, e7 });

// 8. …mas evento de scroll SEM movimento horizontal (rolagem vertical com scrollLeft em 0)
//    não recua — senão rolar a lista de tarefas para baixo recuaria a timeline sozinho.
await page.evaluate((sel) => { const el = document.querySelector(sel); for (let i = 0; i < 3; i++) el.dispatchEvent(new Event('scroll')); }, SCROLLER);
await espera();
const e8 = await estado();
confere(e8.leadSteps === e7.leadSteps, '8: scroll sem movimento horizontal não deveria recuar', { e7, e8 });

console.log(JSON.stringify({ e1, e2, e3, e3b, e4, e4b, e4c, e5passos, e5, e6, semRolagem, e7antes, e7, e8, erros, falhas }, null, 2));
await browser.close();
if (falhas.length || erros.length) process.exit(1);
