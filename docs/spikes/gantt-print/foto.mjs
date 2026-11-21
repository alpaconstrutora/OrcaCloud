/**
 * Foto do harness `gantt-print` (escala dia e semana) e a ordem do card: a barra de
 * opções tem de vir ANTES do rolador do Gantt, dentro do mesmo card.
 *
 *   PLAYWRIGHT_CORE=/c/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/gantt-print/foto.mjs [urlBase] [pastaDeSaida]
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const mod = await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.js')).href);
const chromium = mod.chromium ?? mod.default?.chromium;
const urlBase = process.argv[2] ?? 'http://localhost:3100';
const saida = process.argv[3] ?? '.';

const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 1460, height: 900 } });
const erros = [];
page.on('pageerror', (e) => erros.push(String(e)));
for (const escala of ['day', 'week']) {
    await page.goto(`${urlBase}/docs/spikes/gantt-print/index.html?escala=${escala}`);
    await page.waitForSelector('[data-gantt-rolador]');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(saida, `gantt-print-${escala}.png`), fullPage: true });
}
const ordem = await page.evaluate(() => {
    const barra = document.querySelector('[role=region][aria-label="Opções da ferramenta"]');
    const rolador = document.querySelector('[data-gantt-rolador]');
    if (!barra || !rolador) return 'faltou elemento';
    const mesmoCard = barra.parentElement === rolador.parentElement.parentElement;
    const antes = !!(barra.compareDocumentPosition(rolador) & Node.DOCUMENT_POSITION_FOLLOWING);
    return { mesmoCard, barraAntesDoGantt: antes, texto: barra.textContent };
});
console.log(JSON.stringify({ ordem, erros }, null, 2));
await browser.close();
