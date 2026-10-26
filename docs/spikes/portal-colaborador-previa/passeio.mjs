/**
 * Passeio: aba "Prévia do Portal" → escolhe colaborador → moldura de celular
 * com a faixa; depois a aba Treinamentos (curso travado). Rede fictícia.
 *
 *   PLAYWRIGHT_CORE=/c/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/portal-colaborador-previa/passeio.mjs http://localhost:3117 <pasta-saida>
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const pick = (m) => m.chromium ?? m.default?.chromium;
const chromium = pick(await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.js')).href));
const urlBase = process.argv[2] ?? 'http://localhost:3117';
const outDir = process.argv[3] ?? '.';

const futuro = new Date(Date.now() + 10 * 86400000).toISOString();
const passado = new Date(Date.now() - 10 * 86400000).toISOString();
const RPC = {
    fn_colab_portal_summary: { employee: { id: 'emp-1', name: 'Claudinei da Costa Vieira', role: 'Mestre de Obras', status: 'ATIVO', hire_date: '2024-10-16' }, ferias_saldo: 30, pontos_pendentes: 0, treinamentos_vencendo: 1, ausencias_mes: 0 },
    academy_portal_list_enrollments: [{ id: 'm1', curso: 'NR-35 Trabalho em Altura', nr_referencia: 'NR-35', versao: 1, status: 'NAO_INICIADO', percentual: 0, data_limite: '2026-11-30' }],
};

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const erros = [];
page.on('pageerror', e => erros.push(String(e)));
page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
await page.route('**/rest/v1/**', async (route) => {
    const u = new URL(route.request().url());
    const fn = u.pathname.split('/rpc/')[1];
    if (u.pathname.endsWith('/portal_tokens')) {
        return route.fulfill({ json: [
            { id: 't1', org_id: 'x', employee_id: 'emp-1', token: 'tok-claudinei', expires_at: futuro, is_active: true, employee: { name: 'Claudinei da Costa Vieira' } },
            { id: 't3', org_id: 'x', employee_id: 'emp-3', token: 'tok-maria', expires_at: passado, is_active: true, employee: { name: 'Maria Souza' } },
        ] });
    }
    if (fn) return route.fulfill({ json: RPC[fn] ?? [] });
    return route.fulfill({ json: [] });
});
await page.route('**/realtime/**', r => r.abort());

await page.goto(`${urlBase}/docs/spikes/portal-colaborador-previa/index.html`);
await page.getByRole('tab', { name: /Prévia do Portal/ }).click();
const select = page.getByLabel('Ver o portal como');
await select.waitFor();
await page.waitForTimeout(300);
console.log('aba ativa:', await page.locator('[role=tab][aria-selected=true]').textContent());
await page.screenshot({ path: `${outDir}/01-aba-previa.png` });
const opcoes = await select.locator('option').evaluateAll(os => os.map(o => `${o.disabled ? '[x] ' : ''}${o.textContent}`));
console.log('opções:', JSON.stringify(opcoes));

await select.selectOption('emp-1');
const frame = page.frameLocator('iframe[title^="Prévia do Portal do Colaborador"]');
await frame.getByRole('note').waitFor();
await page.waitForTimeout(400);
await page.screenshot({ path: `${outDir}/02-previa-inicio.png` });

await frame.getByRole('button', { name: /Trein/ }).click();
await frame.getByText('NR-35 Trabalho em Altura').waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/03-previa-treinos.png` });

const faixa = await frame.getByRole('note').boundingBox();
console.log('faixa:', JSON.stringify(faixa));
console.log('erros:', JSON.stringify(erros.filter(e => !/realtime|websocket|ERR_FAILED/i.test(e))));
await browser.close();
