/**
 * Passeio do item 4 (marca): PortalView direto (?direto=1) em 390×844, como o
 * colaborador vê pelo link. Rede fictícia. Fotografa o logo quadrado, o
 * horizontal e o "sem logo", valor escondido/visível, cada aba e o vazio.
 *
 *   PLAYWRIGHT_CORE=/c/tmp/pwtest/node_modules/playwright-core \
 *     [LARGURA=360] node docs/spikes/portal-colaborador-previa/passeio-marca.mjs http://127.0.0.1:3119 <saida> <logo-quadrado.png> <logo-horizontal.png>
 *
 * Os logos são passados por caminho (não versionados): em produção vêm de
 * `organizations.logo_url`.
 */
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const pick = (m) => m.chromium ?? m.default?.chromium;
const chromium = pick(await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.js')).href));
const [urlBase = 'http://127.0.0.1:3119', outDir = '.', logoQuadrado, logoHorizontal] = process.argv.slice(2);
const dataUri = (f) => f ? `data:image/png;base64,${readFileSync(f).toString('base64')}` : null;

const local = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const base = (organization, holerites) => ({
    fn_colab_portal_summary: { employee: { id: 'emp-1', name: 'Claudinei da Costa Vieira', role: 'Mestre de Obras', status: 'ATIVO', hire_date: '2024-10-16' }, ferias_saldo: 30, pontos_pendentes: 2, treinamentos_vencendo: 1, ausencias_mes: 1, organization },
    fn_colab_portal_payroll_runs: holerites,
    fn_colab_portal_time_entries: [
        { id: 'p1', date: local(-1), hours_worked: 8, overtime_hours: 2, status: 'PENDENTE', project_name: 'Residencial Jardim das Flores' },
        { id: 'p2', date: local(-2), hours_worked: 8, overtime_hours: 0, status: 'APROVADO', project_name: 'Residencial Jardim das Flores' },
    ],
    fn_colab_portal_absences: [
        { id: 'a1', tipo: 'LICENCA_MEDICA', data_inicio: '2026-10-05', data_fim: '2026-10-07', dias: 3, status: 'APROVADO' },
    ],
    fn_colab_portal_ged_documents: [
        { id: 'd1', nome: 'ASO admissional', categoria: 'Saúde', storage_path: 'x/aso.pdf', data_validade: local(-5) },
    ],
    fn_colab_portal_trainings: [
        { id: 't1', course_nome: 'Trabalho em Altura', nr_referencia: 'NR-35', data_realizacao: '2024-11-20', data_validade: local(12) },
    ],
    academy_portal_list_enrollments: [{ id: 'm1', curso: 'NR-35 Trabalho em Altura', nr_referencia: 'NR-35', versao: 2, status: 'EM_ANDAMENTO', percentual: 40, data_limite: '2026-11-30' }],
});
const HOLERITES = [
    { id: 'r3', start_date: '2026-09-01', end_date: '2026-09-30', type: 'mensal', status: 'FECHADO', net: 3450.5 },
    { id: 'r2', start_date: '2026-09-01', end_date: '2026-09-30', type: 'adiantamento', status: 'FECHADO', net: 1200 },
    { id: 'r1', start_date: '2026-08-01', end_date: '2026-08-31', type: 'mensal', status: 'FECHADO', net: 3398.12 },
];

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const erros = [];

async function abrir(RPC) {
    const ctx = await browser.newContext({ viewport: { width: Number(process.env.LARGURA ?? 390), height: 844 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', e => erros.push(String(e)));
    await page.route('**/rest/v1/**', (route) => {
        const fn = new URL(route.request().url()).pathname.split('/rpc/')[1];
        return route.fulfill({ json: fn ? (RPC[fn] ?? []) : [] });
    });
    await page.route('**/realtime/**', r => r.abort());
    await page.goto(`${urlBase}/docs/spikes/portal-colaborador-previa/index.html?direto=1`);
    await page.getByText('Claudinei da Costa Vieira').first().waitFor();
    await page.waitForTimeout(400);
    return { ctx, page };
}

const foto = (page, nome, full = false) => page.screenshot({ path: `${outDir}/${nome}.png`, fullPage: full });

// 1) logo quadrado (Alpa): Holerites escondido → visível; cada aba
{
    const { ctx, page } = await abrir(base({ name: 'Alpa Construtora e Incorporadora', logo_url: dataUri(logoQuadrado) }, HOLERITES));
    await page.getByText('Último holerite').waitFor();
    await foto(page, 'm1-holerites-escondido');
    await page.getByRole('button', { name: 'Mostrar valores' }).click();
    await page.waitForTimeout(500);
    await foto(page, 'm2-holerites-visivel', true);
    const nav = page.getByRole('navigation', { name: 'Seções do portal' });
    for (const [n, s] of [['m3', 'Ponto'], ['m4', 'Férias'], ['m5', 'Documentos'], ['m6', 'Treinamentos']]) {
        await nav.getByRole('button', { name: new RegExp(`^${s}`) }).click();
        await page.waitForTimeout(500);
        await foto(page, `${n}-${s.toLowerCase()}`);
    }
    console.log('valor lembrado após recarregar:', await (async () => {
        await page.reload(); await page.getByText('Último holerite').waitFor();
        return (await page.getByRole('button', { name: /valores/ }).getAttribute('aria-label'));
    })());
    await ctx.close();
}
// 2) logo horizontal (SPE)
{
    const { ctx, page } = await abrir(base({ name: 'Construção do Edifício Garden Cambuhy SPE', logo_url: dataUri(logoHorizontal) }, HOLERITES));
    await page.getByText('Último holerite').waitFor();
    await foto(page, 'm7-logo-horizontal');
    await ctx.close();
}
// 3) sem logo + sem holerite fechado
{
    const { ctx, page } = await abrir(base({ name: 'Construção do Edifício Garden Cambuhy SPE', logo_url: null }, []));
    await page.getByText('Nenhum holerite ainda').waitFor();
    await foto(page, 'm8-sem-logo-vazio');
    await ctx.close();
}
console.log('erros:', JSON.stringify(erros));
await browser.close();
