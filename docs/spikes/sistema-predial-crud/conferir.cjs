// Conferência visual do campo "Sistema predial" sobre este harness (index.html).
// Nenhuma escrita chega ao banco: toda chamada REST é respondida aqui.
// Uso: npx vite --port 3157 (na raiz) e depois `node docs/spikes/sistema-predial-crud/conferir.cjs`;
// VAZIO=1 mostra o estado sem sistemas. Prints em $OUT (padrão C:/tmp/pwtest/sistema-predial).
const { chromium } = require('C:/tmp/pwtest/node_modules/playwright-core');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:3157';
const OUT = (process.env.OUT || 'C:/tmp/pwtest/sistema-predial') + (process.env.VAZIO ? '-vazio' : '');
fs.mkdirSync(OUT, { recursive: true });
const EXE = 'C:/Users/altai/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';

const ORG = '00000000-0000-0000-0000-0000000000a1';
const now = '2026-10-15T00:00:00Z';
const sis = (id, name, slug, norm_ref, sort_order, is_active = true) =>
  ({ id, organization_id: ORG, name, slug, description: null, norm_ref, is_active, sort_order, created_at: now, updated_at: now });
let sistemas = [
  sis('s1', 'Elevadores', 'elevadores', 'NBR 16083', 10),
  sis('s2', 'Bombas e recalque', 'bombas', null, 20),
  sis('s3', 'Gerador', 'gerador', null, 80),
];
if (process.env.VAZIO) sistemas = [];
const plano = { id: 'p1', empreendimento_id: 'e1', organization_id: ORG, name: 'Plano de Manutenção — Residencial Harness', status: 'VIGENTE', norm_ref: 'NBR 5674', valid_from: '2026-10-01', notes: null, created_at: now, updated_at: now };
const item = { id: 'i1', plan_id: 'p1', organization_id: ORG, building_system_id: 's1', asset_id: null, description: 'Manutenção preventiva mensal', periodicity_value: 1, periodicity_unit: 'MES', last_executed_at: null, next_due_date: '2026-11-15', responsible_type: 'EMPRESA_ESPECIALIZADA', is_active: true, alerted_for_due_date: null, alerted_stage: null, created_at: now, updated_at: now };
const writes = [];
const log = [];
const push = s => { log.push(s); console.log(s); };

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', e => push('PAGEERROR ' + e));
  p.on('console', m => { if (m.type() === 'error') push('CONSOLE ' + m.text().slice(0, 200)); });

  // Genérica PRIMEIRO (a última registrada casa antes).
  await ctx.route(/\/(rest|auth|storage|functions)\/v1\//, r => {
    const req = r.request();
    if (req.method() === 'HEAD') return r.fulfill({ status: 200, headers: { 'content-range': '*/0', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' }, body: '' });
    if (req.method() !== 'GET') { writes.push(`${req.method()} ${req.url()}`); return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await ctx.route(/\/rest\/v1\/maintenance_plans/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([plano]) }));
  await ctx.route(/\/rest\/v1\/maintenance_plan_items/, r => {
    const req = r.request();
    if (req.method() === 'HEAD') {
      const usa = req.url().includes('building_system_id=eq.s1');
      return r.fulfill({ status: 200, headers: { 'content-range': usa ? '0-0/1' : '*/0', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' }, body: '' });
    }
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData());
      writes.push('POST maintenance_plan_items ' + JSON.stringify({ building_system_id: body.building_system_id, description: body.description }));
      return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ...item, ...body, id: 'i2' }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([item]) });
  });
  await ctx.route(/\/rest\/v1\/building_systems/, r => {
    const req = r.request();
    const url = new URL(req.url());
    const m = req.method();
    if (m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sistemas) });
    if (m === 'POST') {
      const body = JSON.parse(req.postData());
      writes.push('POST building_systems ' + req.postData());
      const novo = sis('s' + (sistemas.length + 10), body.name, body.slug, body.norm_ref, body.sort_order);
      sistemas = [...sistemas, novo];
      return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(novo) });
    }
    if (m === 'PATCH') {
      const id = url.searchParams.get('id').replace('eq.', '');
      const patch = JSON.parse(req.postData());
      writes.push(`PATCH building_systems ${id} ${req.postData()}`);
      sistemas = sistemas.map(s => (s.id === id ? { ...s, ...patch } : s));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sistemas.find(s => s.id === id)) });
    }
    if (m === 'DELETE') {
      const id = url.searchParams.get('id').replace('eq.', '');
      writes.push(`DELETE building_systems ${id}`);
      sistemas = sistemas.filter(s => s.id !== id);
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id }]) });
    }
    return r.fallback();
  });

  await p.goto(BASE + '/docs/spikes/sistema-predial-crud/index.html', { waitUntil: 'domcontentloaded' });
  await p.getByText('Manutenção preventiva mensal').waitFor({ timeout: 60000 });
  await p.screenshot({ path: OUT + '/0-aba.png' });

  await p.getByRole('button', { name: 'Novo item' }).click();
  await p.getByText('Novo item do plano').waitFor();
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + '/1-gaveta.png' });

  // Abre o seletor
  await p.locator('#item-sistema').click();
  await p.getByText('Sistemas prediais', { exact: true }).waitFor();
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + '/2-seletor.png' });

  if (process.env.VAZIO) { await b.close(); return; }
  // Novo sistema
  await p.getByRole('button', { name: 'Novo', exact: true }).click();
  await p.locator('#sistema-nome').fill('Piscina');
  await p.locator('#sistema-norma').fill('NBR 10339');
  await p.screenshot({ path: OUT + '/3-novo.png' });
  await p.getByRole('button', { name: 'Cadastrar e escolher' }).click();
  await p.waitForTimeout(600);
  push('campo após cadastrar: ' + await p.locator('#item-sistema').innerText());
  await p.screenshot({ path: OUT + '/4-escolhido.png' });

  // Editar "Bombas e recalque"
  await p.locator('#item-sistema').click();
  await p.getByText('Sistemas prediais', { exact: true }).waitFor();
  await p.waitForTimeout(300);
  const linhaBombas = p.locator('div.flex.items-center', { hasText: 'Bombas e recalque' }).last();
  await linhaBombas.getByTitle('Editar').click();
  await p.locator('#sistema-nome').fill('Bombas de recalque');
  await p.screenshot({ path: OUT + '/5-editar.png' });
  await p.getByRole('button', { name: 'Salvar', exact: true }).click();
  await p.waitForTimeout(500);

  // Excluir "Elevadores" (em uso: 1 item) → oferece desativar
  const linhaElev = p.locator('div.flex.items-center', { hasText: 'Elevadores' }).last();
  await linhaElev.getByTitle('Excluir').click();
  await p.getByText('Desativar em vez de excluir?').waitFor();
  await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '/6-desativar.png' });
  await p.getByRole('button', { name: 'Desativar', exact: true }).click();
  await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + '/7-desativados.png' });

  // Excluir "Gerador" (sem uso) → confirma exclusão
  const linhaGer = p.locator('div.flex.items-center', { hasText: 'Gerador' }).last();
  await linhaGer.getByTitle('Excluir').click();
  await p.getByText('Excluir o sistema predial?').waitFor();
  await p.screenshot({ path: OUT + '/8-excluir.png' });
  await p.locator('button:not([title])').filter({ hasText: /^Excluir$/ }).click();
  await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + '/9-apos-excluir.png' });

  // Esc fecha só o seletor
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + '/9b-apos-esc.png' });
  push('gaveta do item segue aberta após Esc: ' + await p.getByText('Novo item do plano').isVisible());

  // Salvar item com o sistema escolhido
  await p.getByPlaceholder('Ex: Limpeza e desinfecção do reservatório').fill('Tratamento da água da piscina');
  await p.getByRole('button', { name: 'Salvar item' }).click();
  await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '/10-tabela.png' });
  push('tabela: ' + (await p.locator('table tbody').first().innerText()).replace(/\s+/g, ' ').slice(0, 300));

  push('ESCRITAS (respondidas aqui, nenhuma chegou ao banco):\n  ' + writes.join('\n  '));
  fs.writeFileSync(OUT + '/log.txt', log.join('\n'));
  await b.close();
})().catch(e => { push('FATAL ' + e); fs.writeFileSync(OUT + '/log.txt', log.join('\n')); process.exit(1); });
