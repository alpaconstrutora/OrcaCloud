/**
 * Passeio: Plano de Suprimentos em abas (§19.1) + tabela (§6.10).
 *
 *  1. ordem da anatomia: barra de abas → KPIs → tabela;
 *  2. abas por prazo com contagem; ação primária e "Módulo Aquisições" na barra;
 *  3. a aba recorta a tabela;
 *  4. o botão de auto-ajuste existe e muda as larguras;
 *  5. nenhum rótulo de cabeçalho em duas linhas, nenhuma coluna fora do card,
 *     nenhuma pílula no corpo da tabela;
 *  6. sem plano (`?vazio`): estado vazio e "Gerar plano de compras" na barra — que,
 *     clicado, traz a tabela.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/plano-suprimentos/passeio.mjs [urlBase] [pastaDosPrints]
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
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const erros = [];
page.on('pageerror', (e) => erros.push('PAGEERROR: ' + String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') erros.push('CONSOLE: ' + m.text().slice(0, 300)); });
const falhas = [];
const confere = (ok, msg, extra) => { if (!ok) falhas.push(msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); };
const espera = (ms = 400) => page.waitForTimeout(ms);

const medir = () => page.evaluate(() => {
    const tablist = document.querySelector('[role=tablist]');
    const kpi = [...document.querySelectorAll('p')].find((p) => /Total estimado/i.test(p.textContent));
    const tabela = document.querySelector('table');
    const antes = (a, b) => !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const linhasDoTexto = (el) => {
        const tops = new Set();
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
            if (!n.textContent.trim()) continue;
            const r = document.createRange(); r.selectNodeContents(n);
            for (const rect of r.getClientRects()) if (rect.width > 0) tops.add(Math.round(rect.top));
        }
        return tops.size;
    };
    const card = tabela?.closest('.rounded-\\[10px\\]') ?? tabela?.parentElement;
    const ths = tabela ? [...tabela.querySelectorAll('thead th')].filter((th) => th.textContent.trim()) : [];
    const direita = card ? card.getBoundingClientRect().right : 0;
    return {
        ordem: { abasAntesDosKpis: antes(tablist, kpi), kpisAntesDaTabela: antes(kpi, tabela) },
        abas: tablist ? [...tablist.querySelectorAll('[role=tab]')].map((t) => t.textContent.trim()) : [],
        botoesDaBarra: tablist ? [...tablist.parentElement.querySelectorAll('button:not([role=tab])')].map((b) => b.textContent.trim()) : [],
        linhas: tabela ? tabela.querySelectorAll('tbody tr').length : 0,
        larguras: ths.map((th) => Math.round(th.getBoundingClientRect().width)),
        cabecalhoQuebrado: ths.filter((th) => linhasDoTexto(th) > 1).map((th) => th.textContent.trim()),
        colunasFora: ths.filter((th) => th.getBoundingClientRect().right > direita + 1).map((th) => th.textContent.trim()),
        pilulas: tabela ? tabela.querySelectorAll('tbody .rounded-full').length : 0,
    };
});

await page.goto(`${urlBase}/docs/spikes/plano-suprimentos/index.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('table');
await espera(500);
const m1 = await medir();
await page.screenshot({ path: path.join(outDir, '01-todos.png'), fullPage: true });
confere(m1.ordem.abasAntesDosKpis && m1.ordem.kpisAntesDaTabela, '1: abas → KPIs → tabela', m1.ordem);
confere(m1.abas.join('|') === 'Todos9|Atrasados3|Próximos 7 dias2|Próximos 30 dias2|Futuro1|Sem data1', '2: abas por prazo com contagem', m1.abas);
confere(m1.botoesDaBarra.some((b) => /Atualizar plano/.test(b)) && m1.botoesDaBarra.some((b) => /Módulo Aquisições/.test(b)), '2: ações na barra de abas', m1.botoesDaBarra);
confere(m1.linhas === 9, '3: Todos mostra os 9 insumos', m1.linhas);
confere(m1.cabecalhoQuebrado.length === 0, '5: nenhum rótulo de cabeçalho em duas linhas', m1.cabecalhoQuebrado);
confere(m1.colunasFora.length === 0, '5: nenhuma coluna fora do card', m1.colunasFora);
confere(m1.pilulas === 0, '5: sem pílula no corpo da tabela', m1.pilulas);

await page.getByRole('tab', { name: /Atrasados/ }).click();
await espera();
const m2 = await medir();
await page.screenshot({ path: path.join(outDir, '02-atrasados.png'), fullPage: true });
confere(m2.linhas === 3, '3: a aba Atrasados recorta a tabela (3)', m2.linhas);

await page.getByRole('tab', { name: /Todos/ }).click();
await espera();
const antes = (await medir()).larguras;
await page.getByTitle(/Ajustar largura/i).first().click();
await espera(500);
const depois = (await medir()).larguras;
await page.screenshot({ path: path.join(outDir, '03-auto-ajuste.png'), fullPage: true });
confere(antes.join() !== depois.join(), '4: o auto-ajuste muda as larguras', { antes, depois });

await page.goto(`${urlBase}/docs/spikes/plano-suprimentos/index.html?vazio`, { waitUntil: 'networkidle' });
await page.waitForSelector('[role=tablist]');
await espera(400);
const vazio = await page.getByText('Nenhum plano de suprimentos gerado').count();
await page.screenshot({ path: path.join(outDir, '04-vazio.png'), fullPage: true });
confere(vazio === 1, '6: estado vazio sem plano');
await page.getByRole('button', { name: /Gerar plano de compras/ }).click();
await page.waitForSelector('table', { timeout: 5000 }).catch(() => {});
await espera(500);
const m3 = await medir();
confere(m3.linhas === 9, '6: gerar o plano traz a tabela', m3.linhas);

console.log(JSON.stringify({ m1, m2, antes, depois, m3, erros, falhas }, null, 2));
await browser.close();
if (falhas.length || erros.length) process.exit(1);
