/**
 * Passeio: Planejamento › Recursos — Funções, Trabalhadores e Alocação em tabela.
 *
 * Em cada aba:
 *  a. é uma tabela (StandardTable), não grade de cards, com uma linha por registro;
 *  b. o botão de auto-ajuste de largura existe e, clicado, muda as larguras;
 *  c. a coluna Ações cabe no card (sem rolagem lateral escondendo-a);
 * e ainda:
 *  1. Funções: duas funções com o mesmo nome são duas linhas; clicar na linha abre o
 *     formulário com o nome dela, à vista;
 *  2. Trabalhadores: função e equipe aparecem pelo nome;
 *  3. Alocação: as três situações e a sobrecarga aparecem; "Confirmar" grava a
 *     alocação (a sugestão vira Alocado).
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/recursos-tabelas/passeio.mjs [urlBase] [pastaDosPrints]
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

await page.goto(`${urlBase}/docs/spikes/recursos-tabelas/index.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('table');
await espera(500);

const medirTabela = () => page.evaluate(() => {
    const tabela = document.querySelector('table');
    const card = document.querySelector('#raiz > div > div');
    const ths = [...tabela.querySelectorAll('thead th')].filter((th) => th.textContent.trim());
    const acoes = ths.find((th) => th.textContent.trim() === 'Ações');
    // Linhas REAIS de texto de cada rótulo de cabeçalho (a altura do <th> é a da fileira).
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
    // Células de valor curto que NÃO podem sair truncadas (texto livre longo pode, com title).
    const curtas = [...tabela.querySelectorAll('tbody td')].filter((td) => {
        const s = td.querySelector('span'); if (!s) return false;
        const t = s.textContent.trim();
        return t.length > 0 && t.length <= 14 && s.scrollWidth > s.clientWidth + 1;
    }).map((td) => td.textContent.trim());
    return {
        cabecalhoQuebrado: ths.filter((th) => linhasDoTexto(th) > 1).map((th) => th.textContent.trim()),
        curtasTruncadas: curtas,
        linhas: tabela.querySelectorAll('tbody tr').length,
        larguras: ths.map((th) => Math.round(th.getBoundingClientRect().width)),
        acoesVisivel: !!acoes && acoes.getBoundingClientRect().right <= card.getBoundingClientRect().right + 1,
        cards: document.querySelectorAll('.grid .rounded-3xl, .grid .rounded-2xl').length,
    };
});
const autoAjuste = async () => {
    const antes = await medirTabela();
    await page.getByTitle(/Ajustar largura/i).first().click();
    await espera(500);
    const depois = await medirTabela();
    return { antes: antes.larguras, depois: depois.larguras, mudou: antes.larguras.join() !== depois.larguras.join() };
};
const semQuebra = (nome, m) => {
    confere(m.cabecalhoQuebrado.length === 0, nome + ': nenhum rótulo de cabeçalho em duas linhas', m.cabecalhoQuebrado);
    confere(m.curtasTruncadas.length === 0, nome + ': nenhum valor curto truncado', m.curtasTruncadas);
};
const aba = async (nome) => { await page.getByRole('button', { name: nome, exact: true }).click(); await espera(500); };

// ── Funções ──
const f = await medirTabela();
await page.screenshot({ path: path.join(outDir, '01-funcoes.png'), fullPage: true });
confere(f.linhas === 5, 'Funções: uma linha por função (5, duas PEDREIRO)', f);
confere(f.cards === 0, 'Funções: sem grade de cards', f);
confere(f.acoesVisivel, 'Funções: coluna Ações cabe no card', f);
semQuebra('Funções', f);
const fAj = await autoAjuste();
confere(fAj.mudou, 'Funções: auto-ajuste muda as larguras', fAj);
await page.screenshot({ path: path.join(outDir, '02-funcoes-auto-ajuste.png'), fullPage: true });
const pedreiros = await page.locator('tbody tr', { hasText: 'PEDREIRO' }).count();
confere(pedreiros === 2, 'Funções: as duas PEDREIRO, cada uma na sua linha', { pedreiros });
await page.locator('tbody tr', { hasText: 'ELETRICISTA' }).click();
await espera(700);
const form = await page.evaluate(() => {
    const input = document.querySelector('input[name="name"]');
    if (!input) return null;
    const r = input.getBoundingClientRect();
    return { valor: input.value, aVista: r.top >= 0 && r.bottom <= window.innerHeight };
});
confere(form?.valor === 'ELETRICISTA' && form?.aVista, 'Funções: clicar na linha abre o formulário dela, à vista', form);
await page.screenshot({ path: path.join(outDir, '03-funcoes-editar.png') });
await page.getByRole('button', { name: 'Cancelar' }).click();

// ── Trabalhadores ──
await aba('Trabalhadores');
const t = await medirTabela();
await page.screenshot({ path: path.join(outDir, '04-trabalhadores.png'), fullPage: true });
confere(t.linhas === 3 && t.cards === 0, 'Trabalhadores: tabela com 3 linhas, sem cards', t);
confere(t.acoesVisivel, 'Trabalhadores: coluna Ações cabe no card', t);
semQuebra('Trabalhadores', t);
const maria = await page.locator('tbody tr', { hasText: 'Maria Aparecida Souza' }).innerText();
confere(/SERVENTE/.test(maria) && /Equipe Estrutura/.test(maria), 'Trabalhadores: função e equipe pelo nome', { maria });
const tAj = await autoAjuste();
confere(tAj.mudou, 'Trabalhadores: auto-ajuste muda as larguras', tAj);

// ── Alocação ──
await aba('Alocação');
const a = await medirTabela();
const textoAloc = await page.locator('tbody').innerText();
await page.screenshot({ path: path.join(outDir, '05-alocacao.png'), fullPage: true });
confere(a.cards === 0 && a.linhas >= 4, 'Alocação: tabela, sem cards', a);
confere(a.acoesVisivel, 'Alocação: coluna Ações cabe no card', a);
semQuebra('Alocação', a);
confere(/Alocado/.test(textoAloc) && /Sugestão/.test(textoAloc) && /Incompleta/.test(textoAloc), 'Alocação: as três situações', { textoAloc });
// Sobrecarga VISÍVEL (não basta estar no DOM: atrás de um nome truncado ela sumia).
const sobrecarga = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Sobrecarga"]')].map((el) => {
    const r = el.getBoundingClientRect();
    const td = el.closest('td').getBoundingClientRect();
    return { visivel: r.width > 0 && r.left >= td.left && r.right <= td.right + 0.5 };
}));
confere(sobrecarga.length === 2 && sobrecarga.every((s) => s.visivel), 'Alocação: sobrecarga do João visível nas duas tarefas sobrepostas', sobrecarga);
const sugestoesAntes = (textoAloc.match(/Sugestão/g) || []).length;
const aAj = await autoAjuste();
confere(aAj.mudou, 'Alocação: auto-ajuste muda as larguras', aAj);
await page.getByRole('button', { name: 'Confirmar' }).first().click();
await espera(500);
const gravado = await page.evaluate(() => window.__gravado);
const textoDepois = await page.locator('tbody').innerText();
const sugestoesDepois = (textoDepois.match(/Sugestão/g) || []).length;
confere(!!gravado?.itemSchedules, 'Alocação: Confirmar grava as alocações', gravado);
confere(sugestoesDepois === sugestoesAntes - 1, 'Alocação: a sugestão confirmada vira Alocado', { sugestoesAntes, sugestoesDepois });
await page.screenshot({ path: path.join(outDir, '06-alocacao-confirmado.png'), fullPage: true });

console.log(JSON.stringify({ f, fAj, t, tAj, a, aAj, sugestoesAntes, sugestoesDepois, erros, falhas }, null, 2));
await browser.close();
if (falhas.length || erros.length) process.exit(1);
