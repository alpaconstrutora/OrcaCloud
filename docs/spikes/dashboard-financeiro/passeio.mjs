/**
 * Passeio do Dashboard financeiro: prints por estado + portões de comportamento.
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/dashboard-financeiro/passeio.mjs http://localhost:3197 <pasta-de-saida>
 *
 * Estados: real (Alpa, 28/10/2026) em 1440 e 390 px; período "Mês"; carregando; erro; vazio.
 * O service worker fica bloqueado: page.route não enxerga requisição feita por ele (PWA).
 */
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const ler = (n) => JSON.parse(fs.readFileSync(path.join(aqui, n), 'utf8'));
const HOJE = ler('fixture-hoje.json');
const TRIM = ler('fixture-periodo-trimestre.json');
const MES = ler('fixture-periodo-mes.json');
const APROV = ler('fixture-aprovacao.json');

async function loadChromium() {
    const base = process.env.PLAYWRIGHT_CORE;
    if (!base) throw new Error('defina PLAYWRIGHT_CORE');
    const m = await import(pathToFileURL(path.join(base, 'index.js')).href);
    return m.chromium ?? m.default?.chromium;
}

const urlBase = process.argv[2] ?? 'http://localhost:3197';
const saida = process.argv[3] ?? '.';
fs.mkdirSync(saida, { recursive: true });
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });

const portoes = [];
const exigir = (ok, t) => portoes.push(`${ok ? 'ok   ' : 'FALHA'} ${t}`);
const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const VAZIO_HOJE = {
    ...HOJE, vencido_receber: 0, vencido_receber_qtd: 0, vencido_receber_desde: null,
    vencido_pagar: 0, vencido_pagar_qtd: 0, vencido_pagar_desde: null,
    receber_7: 0, receber_7_qtd: 0, pagar_7: 0, pagar_7_qtd: 0,
    receber_30: 0, receber_30_qtd: 0, pagar_30: 0, pagar_30_qtd: 0, contas: [],
};
const VAZIO_PER = {
    recebido: 0, recebido_qtd: 0, pago: 0, pago_qtd: 0, credores: [], credores_qtd: 0, a_pagar_total: 0, sem_fornecedor_valor: 0, sem_fornecedor_qtd: 0,
    meses: MES.meses.map((m) => ({ ...m, recebido: 0, pago: 0 })),
};

/** Abre o harness com um cenário de respostas. */
async function abrir({ viewport, periodo = 'quarter', cenario = 'real' }) {
    const ctx = await browser.newContext({ viewport, serviceWorkers: 'block', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await ctx.addInitScript((p) => localStorage.setItem('financialDashboard:periodo', JSON.stringify(p)), periodo);
    const erros = [];
    const page = await ctx.newPage();
    page.on('pageerror', (e) => erros.push('PAGEERROR ' + e));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|\[FinancialDashboard\]/.test(m.text())) erros.push('CONSOLE ' + m.text().slice(0, 200)); });

    await page.route('**/rest/v1/rpc/**', async (r) => {
        const nome = r.request().url().split('/rpc/')[1].split('?')[0];
        const corpo = JSON.parse(r.request().postData() || '{}');
        if (cenario === 'carregando') return; // nunca responde
        if (cenario === 'erro' && nome.startsWith('fn_financial_dashboard')) {
            return r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"falha simulada"}' });
        }
        if (nome === 'fn_financial_dashboard_today') return r.fulfill(json(cenario === 'vazio' ? VAZIO_HOJE : HOJE));
        if (nome === 'fn_financial_dashboard_period') {
            if (cenario === 'vazio') return r.fulfill(json(VAZIO_PER));
            return r.fulfill(json(corpo.p_date_to === '2026-10-31' ? MES : TRIM));
        }
        if (nome === 'fn_approval_pending_summary') return r.fulfill(json(cenario === 'vazio' ? [] : APROV));
        return r.fulfill(json([]));
    });
    await page.goto(`${urlBase}/docs/spikes/dashboard-financeiro/index.html`, { waitUntil: 'domcontentloaded' });
    if (cenario !== 'carregando') {
        await page.waitForSelector('text=Saldo nos bancos', { timeout: 60000 }).catch(() => {});
        await page.waitForTimeout(1200);
    } else {
        await page.waitForTimeout(1500);
    }
    return { ctx, page, erros };
}

// O conteúdo rola dentro do <main> (como no app): o print de página inteira precisa do
// <main> sem limite de altura.
const soltarAltura = (page) => page.addStyleTag({ content: '.h-screen{height:auto!important;min-height:100vh} main{overflow:visible!important}' });

// ── 1. Real, desktop ──
{
    const { ctx, page, erros } = await abrir({ viewport: { width: 1440, height: 900 } });
    await page.screenshot({ path: path.join(saida, 'desktop-primeira-tela.png') });
    await soltarAltura(page);
    await page.screenshot({ path: path.join(saida, 'desktop.png'), fullPage: true });
    // O Intl separa "R$" do número com espaço não separável.
    const texto = (await page.locator('main').innerText()).replaceAll(String.fromCharCode(0xa0), ' ');
    exigir(texto.includes('R$ 3.132.268'), 'vencido a receber da Alpa (R$ 3.132.268) na tela');
    exigir(texto.includes('R$ 1.832.862'), 'vencido a pagar da Alpa (R$ 1.832.862) na tela');
    exigir(/1 de 2 contas · falta Sicredi/.test(texto), 'saldo diz que falta o Sicredi');
    // Texto de gráfico é SVG (fora do innerText): o nome acessível é que diz os números.
    const rotulos = (await page.locator('[role=img]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).join(' ');
    exigir(!rotulos.includes('Sem fornecedor'), 'sem fornecedor fora do ranking de credores');
    exigir(/R\$ 7\.500 em 15 títulos sem fornecedor informado/.test(texto), 'sem fornecedor como linha própria, com valor e quantidade');
    exigir(await page.getByRole('button', { name: 'Informar o fornecedor em Contas a pagar' }).count() === 1, 'sem fornecedor traz a ação de corrigir');
    exigir(rotulos.includes('out/26') && !rotulos.includes('nov/26'), 'gráfico para no mês corrente (sem nov/26 "zerado")');
    exigir(/out\/26\s+recebido R\$ 0 · pago R\$ 300/.test(texto), 'valores do período por extenso sob o gráfico (out/26: pago R$ 300)');
    exigir(!(await page.locator('svg text', { hasText: 'R$ 1 mil' }).count()), 'sem rótulo sobre coluna invisível fora do período');
    exigir(await page.locator('svg text', { hasText: 'R$ 532 mil' }).count() === 1, 'coluna visível fora do período mantém o rótulo (R$ 532 mil)');

    // Ações levam à tela que resolve
    await page.getByRole('button', { name: 'Cobrar em Contas a receber' }).click();
    exigir(await page.locator('[data-navegou="contas-a-receber"]').count() === 1, 'Cobrar → contas-a-receber');
    await page.getByRole('button', { name: 'Informar saldo na Conciliação' }).click();
    exigir(await page.locator('[data-navegou="bank-reconciliation"]').count() === 1, 'Informar saldo → bank-reconciliation');
    await page.getByRole('button', { name: 'Scorecard de obras da Inteligência' }).click();
    const aba = await page.evaluate(() => localStorage.getItem('financialIntelligence:tab'));
    exigir(aba === '"obras"' && await page.locator('[data-navegou="financial-intelligence"]').count() === 1, 'Scorecard → Inteligência na aba obras');

    // Botão desligado diz o motivo
    const prox = page.getByRole('button', { name: 'Próximo período' });
    exigir(await prox.isDisabled() && (await prox.getAttribute('title')) === 'Este já é o período atual', 'próximo período desligado com motivo');

    exigir(erros.length === 0, `sem erro no console (${erros.join(' | ')})`);
    await ctx.close();
}

// ── 1b. Teclado: foco por Tab REAL (não .focus(), que pode não acionar :focus-visible) ──
{
    const { ctx, page } = await abrir({ viewport: { width: 1440, height: 900 } });
    // Clique num texto não focável logo antes do grupo: o próximo Tab cai em "Mês".
    await page.getByRole('heading', { name: 'Resultado do período' }).click();
    await page.keyboard.press('Tab');
    // O anel tem transição: medir/capturar com ela no meio dá anel pela metade.
    await page.waitForTimeout(400);
    const medir = () => page.evaluate(() => {
        const el = document.activeElement;
        const sombra = el ? getComputedStyle(el).boxShadow : 'none';
        // a camada do anel é a que tem espalhamento ("0px 0px 0px Npx") e cor opaca
        const anel = (sombra.match(/(rgba?\([^)]*\)|oklab\([^)]*\)|oklch\([^)]*\)) 0px 0px 0px ([\d.]+)px/g) || [])
            .map((c) => ({ cor: c, px: Number(c.match(/([\d.]+)px$/)[1]) }))
            .find((c) => c.px > 0);
        return { nome: el?.getAttribute('aria-label') || el?.textContent?.trim(), anel };
    });
    const f1 = await medir();
    await page.screenshot({ path: path.join(saida, 'desktop-foco.png') });
    exigir(f1.nome === 'Mês' && f1.anel?.px >= 2 && !/\/ 0\.[0-4]/.test(f1.anel.cor), `Tab real cai em "Mês" com anel de 2px opaco (${JSON.stringify(f1)})`);
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
    await page.waitForTimeout(400);
    const f2 = await medir();
    await page.screenshot({ path: path.join(saida, 'desktop-foco-anterior.png') });
    exigir(f2.nome === 'Período anterior' && f2.anel?.px >= 2, `Tab segue para "Período anterior" com anel (${JSON.stringify(f2)})`);
    await ctx.close();
}

// ── 2. Real, celular ──
{
    const { ctx, page } = await abrir({ viewport: { width: 390, height: 844 } });
    await page.screenshot({ path: path.join(saida, 'mobile-primeira-tela.png') });
    await soltarAltura(page);
    await page.screenshot({ path: path.join(saida, 'mobile.png'), fullPage: true });
    const larg = await page.evaluate(() => document.documentElement.scrollWidth);
    exigir(larg <= 390, `sem rolagem lateral no celular (scrollWidth ${larg})`);
    // Rótulo que quebra num cartão e não no vizinho desalinha a fileira inteira.
    const alturas = await page.evaluate(() => ['Receber em 7 dias', 'Pagar em 7 dias', 'Receber em 30 dias', 'Pagar em 30 dias']
        .map((t) => [...document.querySelectorAll('p')].find((p) => p.textContent === t)?.getBoundingClientRect().height ?? -1));
    exigir(alturas.every((h) => h > 0 && h === alturas[0]), `rótulos de 7/30 dias numa linha só a 390px (${alturas.join(', ')})`);
    await ctx.close();
}

// ── 3. Período "Mês" ──
{
    const { ctx, page } = await abrir({ viewport: { width: 1440, height: 900 }, periodo: 'month' });
    await soltarAltura(page);
    await page.screenshot({ path: path.join(saida, 'desktop-mes.png'), fullPage: true });
    await ctx.close();
}

// ── 4. Carregando / 5. Erro / 6. Vazio ──
for (const cenario of ['carregando', 'erro', 'vazio']) {
    const { ctx, page } = await abrir({ viewport: { width: 1440, height: 900 }, cenario });
    await soltarAltura(page);
    await page.screenshot({ path: path.join(saida, `desktop-${cenario}.png`), fullPage: true });
    const texto = (await page.locator('main').innerText()).replaceAll(String.fromCharCode(0xa0), ' ');
    if (cenario === 'erro') {
        exigir(/Não foi possível carregar a posição de hoje/.test(texto), 'erro de Hoje com saída');
        exigir((texto.match(/Tentar de novo/g) || []).length === 2, 'uma mensagem por faixa (2 no total), não uma por gráfico');
    }
    if (cenario === 'vazio') exigir(/Nenhuma conta bancária ativa/.test(texto) && /Nenhum título vencido/.test(texto) && !/Cobrar em Contas/.test(texto), 'vazio: sem ação morta');
    await ctx.close();
}

await browser.close();
console.log(portoes.join('\n'));
process.exit(portoes.some((p) => p.startsWith('FALHA')) ? 1 : 0);
