/**
 * Passeio: o Planejamento sem faixa de título, com o voltar no ribbon.
 *
 *  1. não há título visível nem subtítulo acima do ribbon;
 *  2. o ribbon começa no topo da tela (sem a faixa de ~60 px que havia);
 *  3. o voltar está DENTRO do ribbon, antes do seletor de vista, só ícone,
 *     com nome acessível, e clicar nele chama `onBack`;
 *  4. continua existindo um `h1` (para leitor de tela) com o nome do planejamento;
 *  5. o orçamento vinculado aparece na dica de "Sincronizar" (aba Orçamento).
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/planejamento-sem-titulo/passeio.mjs [urlBase] [pastaDosPrints] [prefixo]
 *
 * Com `prefixo=antes` só tira o print (para comparar com a versão anterior).
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
const prefixo = process.argv[4] ?? 'depois';
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 1400, height: 420 } });
const erros = [];
page.on('pageerror', (e) => erros.push('PAGEERROR: ' + String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') erros.push('CONSOLE: ' + m.text().slice(0, 300)); });

await page.goto(`${urlBase}/docs/spikes/planejamento-sem-titulo/index.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('[role=toolbar]');
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(outDir, `${prefixo}-cabecalho.png`) });

const medida = await page.evaluate(() => {
    const raiz = document.getElementById('raiz').getBoundingClientRect();
    const toolbar = document.querySelector('[role=toolbar]');
    const h1 = document.querySelector('h1');
    const voltar = document.querySelector('[aria-label^="Voltar para Gestão de Planejamento"]');
    // O botão do seletor de vista mostra a vista atual ("Gantt").
    const vista = [...toolbar.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Gantt');
    const visivel = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
    return {
        ribbonTopoRelativo: Math.round(toolbar.getBoundingClientRect().top - raiz.top),
        h1Texto: h1?.textContent ?? null,
        h1Visivel: visivel(h1),
        voltarDentroDoRibbon: !!voltar && toolbar.contains(voltar),
        voltarTemTexto: (voltar?.textContent ?? '').trim().length > 0,
        voltarAntesDaVista: !!voltar && !!vista && !!(voltar.compareDocumentPosition(vista) & Node.DOCUMENT_POSITION_FOLLOWING),
        voltarAltura: voltar ? Math.round(voltar.getBoundingClientRect().height) : null,
        subtituloVisivel: [...document.querySelectorAll('p')].some((p) => /Orçamento vinculado/.test(p.textContent) && visivel(p)),
    };
});

if (prefixo === 'antes') {
    console.log(JSON.stringify({ medida, erros }, null, 2));
    await browser.close();
    process.exit(0);
}

const falhas = [];
const confere = (ok, msg) => { if (!ok) falhas.push(msg); };
confere(!medida.h1Visivel, '1: o título não deveria aparecer');
confere(!medida.subtituloVisivel, '1: o subtítulo não deveria aparecer');
confere(medida.ribbonTopoRelativo <= 1, '2: o ribbon deveria começar no topo da tela');
confere(medida.voltarDentroDoRibbon, '3: o voltar deveria estar dentro do ribbon');
confere(!medida.voltarTemTexto, '3: o voltar é só ícone');
confere(medida.voltarAntesDaVista, '3: o voltar vem antes do seletor de vista');
await page.click('[aria-label^="Voltar para Gestão de Planejamento"]');
const voltou = await page.evaluate(() => window.__voltou ?? 0);
confere(voltou === 1, '3: clicar no voltar deveria chamar onBack');
confere(/Casa de Formação/.test(medida.h1Texto ?? ''), '4: deveria haver h1 com o nome do planejamento');

await page.getByRole('tab', { name: 'Orçamento' }).click().catch(async () => page.getByText('Orçamento', { exact: true }).first().click());
await page.waitForTimeout(300);
const dicaSync = await page.locator('button', { hasText: 'Sincronizar' }).first().getAttribute('title');
confere(/Orçamento vinculado: Casa de Formação/.test(dicaSync ?? ''), '5: a dica de Sincronizar deveria dizer o orçamento vinculado');
await page.screenshot({ path: path.join(outDir, `${prefixo}-aba-orcamento.png`) });

console.log(JSON.stringify({ medida, voltou, dicaSync, erros, falhas }, null, 2));
await browser.close();
if (falhas.length || erros.length) process.exit(1);
