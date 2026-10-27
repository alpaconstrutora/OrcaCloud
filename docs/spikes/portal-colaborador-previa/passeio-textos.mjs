/**
 * Passeio do item 3 (textos): abre a prévia e fotografa cada seção com dados
 * fictícios que exercitam datas, status, tipos e validades. Rede fictícia.
 *
 *   PLAYWRIGHT_CORE=/c/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/portal-colaborador-previa/passeio-textos.mjs http://127.0.0.1:3118 <pasta-saida>
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const pick = (m) => m.chromium ?? m.default?.chromium;
const chromium = pick(await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.js')).href));
const urlBase = process.argv[2] ?? 'http://127.0.0.1:3118';
const outDir = process.argv[3] ?? '.';

const dia = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const futuro = new Date(Date.now() + 10 * 86400000).toISOString();
const RPC = {
    fn_colab_portal_summary: { employee: { id: 'emp-1', name: 'Claudinei da Costa Vieira', role: 'Mestre de Obras', status: 'ATIVO', hire_date: '2024-10-16' }, ferias_saldo: 30, pontos_pendentes: 2, treinamentos_vencendo: 1, ausencias_mes: 1 },
    fn_colab_portal_time_entries: [
        { id: 'p1', date: dia(-1), hours_worked: 8, overtime_hours: 2, status: 'PENDENTE', project_name: 'Residencial Jardim das Flores' },
        { id: 'p2', date: dia(-2), hours_worked: 8, overtime_hours: 0, status: 'APROVADO', project_name: 'Residencial Jardim das Flores' },
        { id: 'p3', date: dia(-3), hours_worked: 7.5, overtime_hours: 0, status: 'REJEITADO', project_name: null },
    ],
    fn_colab_portal_absences: [
        { id: 'a1', tipo: 'LICENCA_MEDICA', data_inicio: '2026-09-01', data_fim: '2026-09-03', dias: 3, status: 'APROVADO' },
        { id: 'a2', tipo: 'FALTA', data_inicio: '2026-08-14', data_fim: '2026-08-14', dias: 1, status: 'CANCELADO' },
        { id: 'a3', tipo: 'FERIAS', data_inicio: '2026-12-15', data_fim: '2027-01-03', dias: 20, status: 'SOLICITADO' },
    ],
    fn_colab_portal_payroll_runs: [
        { id: 'r1', start_date: '2026-09-01', end_date: '2026-09-30', type: 'mensal', status: 'FECHADO', net: 3450.5 },
        { id: 'r2', start_date: '2026-09-01', end_date: '2026-09-30', type: 'adiantamento', status: 'FECHADO', net: 1200 },
    ],
    fn_colab_portal_ged_documents: [
        { id: 'd1', nome: 'ASO admissional', categoria: 'Saúde', storage_path: 'x/aso.pdf', data_validade: dia(-5) },
        { id: 'd2', nome: 'Ficha de EPI', categoria: 'Segurança', storage_path: 'x/epi.pdf', data_validade: dia(200) },
    ],
    fn_colab_portal_trainings: [
        { id: 't1', course_nome: 'Trabalho em Altura', nr_referencia: 'NR-35', data_realizacao: '2024-11-20', data_validade: dia(12) },
        { id: 't2', course_nome: 'Segurança na Construção', nr_referencia: 'NR-18', data_realizacao: '2025-03-02', data_validade: dia(300) },
    ],
    academy_portal_list_enrollments: [{ id: 'm1', curso: 'NR-35 Trabalho em Altura', nr_referencia: 'NR-35', versao: 2, status: 'NAO_INICIADO', percentual: 0, data_limite: '2026-11-30' }],
};

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const erros = [];
page.on('pageerror', e => erros.push(String(e)));
await page.route('**/rest/v1/**', async (route) => {
    const u = new URL(route.request().url());
    const fn = u.pathname.split('/rpc/')[1];
    if (u.pathname.endsWith('/portal_tokens')) return route.fulfill({ json: [{ id: 't1', org_id: 'x', employee_id: 'emp-1', token: 'tok', expires_at: futuro, is_active: true }] });
    return route.fulfill({ json: fn ? (RPC[fn] ?? []) : [] });
});
await page.route('**/realtime/**', r => r.abort());

await page.goto(`${urlBase}/docs/spikes/portal-colaborador-previa/index.html`);
await page.getByRole('tab', { name: /Prévia do Portal/ }).click();
const select = page.getByLabel('Ver o portal como');
await select.waitFor();
await page.waitForFunction(() => !document.querySelector('#previa-colaborador')?.disabled);
await select.selectOption('emp-1');
const f = page.frameLocator('iframe[title^="Prévia do Portal do Colaborador"]');
await f.getByText('Saldo de férias').waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/t0-inicio.png` });

const secoes = ['Ponto', 'Férias', 'Holerites', 'Documentos', 'Treinamentos'];
const texto = {};
for (const [i, s] of secoes.entries()) {
    await f.getByRole('navigation', { name: 'Seções do portal' }).getByRole('button', { name: s }).click();
    await page.waitForTimeout(500);
    // rola o conteúdo para baixo do cabeçalho dentro do iframe
    await f.locator('nav[aria-label="Seções do portal"]').evaluate(n => n.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${outDir}/t${i + 1}-${s.toLowerCase()}.png` });
    texto[s] = (await f.locator('nav[aria-label="Seções do portal"] ~ div').last().innerText()).replace(/\s+/g, ' ').slice(0, 400);
}
console.log(JSON.stringify(texto, null, 1));
console.log('erros:', JSON.stringify(erros));
await browser.close();
