/**
 * Passeio: o aviso de abastecimento do Planejamento não ocupa mais faixa própria.
 *
 *  1. o ícone com contador está DENTRO do ribbon, à esquerda da tela cheia;
 *  2. entre o ribbon e a grade não há nada além do respiro de 24px (`space-y-6`);
 *  3. o resumo (etapas, insumos, custo) está no `title` do ícone;
 *  4. o clique abre o painel lateral com uma linha por etapa, e nenhuma célula
 *     corta texto (no drawer, texto livre quebra linha);
 *  5. Escape fecha o painel e ele sai do DOM;
 *  6. sem risco (`?sem-risco`), o ícone não aparece.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/planejamento-aviso-abastecimento/passeio.mjs [urlBase] [pastaDosPrints]
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
const confere = (ok, msg, extra) => { if (!ok) falhas.push(msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); };

const AVISO = '[aria-label^="Ver "][aria-label$="de abastecimento"]';

await page.goto(`${urlBase}/docs/spikes/planejamento-aviso-abastecimento/index.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('[role=toolbar]');
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(outDir, '01-ribbon-com-aviso.png') });

const m = await page.evaluate((sel) => {
    const toolbar = document.querySelector('[role=toolbar]');
    const aviso = document.querySelector(sel);
    const telaCheia = document.querySelector('[aria-label="Tela cheia"]');
    const card = toolbar.parentElement; // card de cromo do ribbon
    const grade = document.querySelector('[data-grade]');
    return {
        avisoNoRibbon: !!aviso && toolbar.contains(aviso),
        avisoAntesDaTelaCheia: !!aviso && !!telaCheia && !!(aviso.compareDocumentPosition(telaCheia) & Node.DOCUMENT_POSITION_FOLLOWING),
        contador: aviso?.parentElement?.textContent?.trim() ?? null,
        title: aviso?.getAttribute('title') ?? null,
        alturaAviso: aviso ? Math.round(aviso.getBoundingClientRect().height) : null,
        alturaTelaCheia: telaCheia ? Math.round(telaCheia.getBoundingClientRect().height) : null,
        vaoRibbonGrade: Math.round(grade.getBoundingClientRect().top - card.getBoundingClientRect().bottom),
    };
}, AVISO);
confere(m.avisoNoRibbon, '1: o aviso deveria estar dentro do ribbon', m);
confere(m.avisoAntesDaTelaCheia, '1: o aviso vem antes da tela cheia', m);
confere(m.contador === '8', '1: o contador deveria mostrar 8 etapas', m);
confere(m.alturaAviso === m.alturaTelaCheia, '1: o aviso tem a altura da tela cheia (mesma fileira)', m);
confere(m.vaoRibbonGrade === 24, '2: entre ribbon e grade só o respiro de 24px', m);
confere(/8 etapas em risco/.test(m.title ?? '') && /126 insumos/.test(m.title ?? '') && /254\.752,28/.test(m.title ?? ''), '3: resumo no title', m);

await page.click(AVISO);
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outDir, '02-painel-aberto.png') });
const p = await page.evaluate(() => {
    const titulo = [...document.querySelectorAll('h2')].find((h) => h.textContent === 'Etapas em risco de abastecimento');
    const painel = titulo?.closest('[role=dialog]') ?? titulo?.parentElement?.parentElement?.parentElement;
    const linhas = painel ? painel.querySelectorAll('tbody tr').length : 0;
    const cortadas = painel ? [...painel.querySelectorAll('tbody td span')].filter((s) => s.scrollWidth > s.clientWidth + 1).map((s) => s.textContent) : [];
    // Coluna saindo pela direita = tabela mais larga que o painel (a coluna Custo
    // saiu cortada na 1ª rodada, e o teste de célula acima não via: o texto cabia na
    // célula, a CÉLULA é que não cabia no painel).
    const caixa = titulo?.closest('.flex.flex-col') ?? painel;
    const direitaDoPainel = caixa ? caixa.getBoundingClientRect().right : 0;
    const colunasFora = painel ? [...painel.querySelectorAll('thead th')].filter((th) => th.getBoundingClientRect().right > direitaDoPainel - 16 + 1 && th.textContent.trim()).map((th) => th.textContent.trim()) : [];
    // Linhas REAIS do rótulo (a altura do <th> é a da linha inteira do cabeçalho).
    const linhasDoTexto = (el) => {
        const tops = new Set();
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (!n.textContent.trim()) continue;
            const r = document.createRange();
            r.selectNodeContents(n);
            for (const rect of r.getClientRects()) if (rect.width > 0) tops.add(Math.round(rect.top));
        }
        return tops.size;
    };
    const cabecalhoQuebrado = painel ? [...painel.querySelectorAll('thead th')].filter((th) => th.textContent.trim() && linhasDoTexto(th) > 1).map((th) => th.textContent.trim()) : [];
    return { abriu: !!titulo, linhas, cortadas, colunasFora, cabecalhoQuebrado, direitaDoPainel: Math.round(direitaDoPainel) };
});
confere(p.abriu, '4: o clique deveria abrir o painel', p);
confere(p.linhas === 8, '4: uma linha por etapa', p);
confere(p.cortadas.length === 0, '4: nenhuma célula cortando texto', p);
confere(p.colunasFora.length === 0, '4: nenhuma coluna passando da borda do painel', p);
confere(p.cabecalhoQuebrado.length === 0, '4: nenhum cabeçalho quebrando em duas linhas', p);

await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const fechou = await page.evaluate(() => ![...document.querySelectorAll('h2')].some((h) => h.textContent === 'Etapas em risco de abastecimento'));
confere(fechou, '5: Escape fecha o painel e ele sai do DOM');

await page.goto(`${urlBase}/docs/spikes/planejamento-aviso-abastecimento/index.html?sem-risco`, { waitUntil: 'networkidle' });
await page.waitForSelector('[role=toolbar]');
await page.waitForTimeout(300);
const semIcone = (await page.locator(AVISO).count()) === 0;
await page.screenshot({ path: path.join(outDir, '03-sem-risco.png') });
confere(semIcone, '6: sem risco, sem ícone');

console.log(JSON.stringify({ m, p, fechou, semIcone, erros, falhas }, null, 2));
await browser.close();
if (falhas.length || erros.length) process.exit(1);
