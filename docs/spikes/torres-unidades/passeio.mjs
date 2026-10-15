/**
 * Passeio do harness Torres & Unidades — MEDE na tela o que o plano
 * docs/planos/2026-10-14-torres-unidades-reorganizacao.md promete.
 *
 *   node docs/spikes/torres-unidades/passeio.mjs [urlBase] [outDir]
 *
 * O PostgREST é servido por um banco EM MEMÓRIA (page.route) — nenhuma leitura ou
 * escrita chega ao Supabase. Começa como no print do usuário: uma torre "Torre Única"
 * com 4 unidades e sem pavimentos. Cada portão imprime ok/FALHA; exit 1 se algum falhar.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

async function loadChromium() {
  const pick = (m) => m.chromium ?? m.default?.chromium;
  try {
    const local = await import('playwright-core');
    if (pick(local)) return pick(local);
  } catch { /* segue para o caminho por env */ }
  const base = process.env.PLAYWRIGHT_CORE;
  if (!base) throw new Error('defina PLAYWRIGHT_CORE');
  return pick(await import(pathToFileURL(path.join(base, 'index.js')).href));
}

const urlBase = process.argv[2] ?? 'http://127.0.0.1:3197';
const outDir = process.argv[3] ?? '.';
fs.mkdirSync(outDir, { recursive: true });

// ── banco em memória ─────────────────────────────────────────────────────────
function bancoInicial() {
  const torre = { id: 'torre-1', empreendimento_id: 'emp-1', name: 'Torre Única', sort_order: 0 };
  return {
    empreendimentos: [{ id: 'emp-1', organization_id: 'org-1', name: 'Residencial Harness' }],
    empreendimento_towers: [torre],
    empreendimento_floors: [],
    empreendimento_units: ['101', '102', '103', '104'].map((n, i) => ({
      id: `u-${n}`, tower_id: 'torre-1', name: n, floor: 1, typology: '2 dorm.',
      private_area: 32.39, common_area: null, status: 'DISPONIVEL', sort_order: i,
    })),
  };
}
let banco = bancoInicial();
const contagem = {};   // "GET empreendimento_floors" → n

const META = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
function filtrar(linhas, params) {
  let r = linhas;
  for (const [k, v] of params) {
    if (META.has(k) || k.includes('.')) continue;   // filtro de tabela embutida: o stub não junta tabelas
    if (v.startsWith('eq.')) r = r.filter(x => String(x[k]) === v.slice(3));
    else if (v.startsWith('in.(')) { const set = v.slice(4, -1).split(',').map(s => s.replace(/"/g, '')); r = r.filter(x => set.includes(String(x[k]))); }
    else if (v === 'is.null') r = r.filter(x => x[k] == null);
  }
  return r;
}

async function servir(route) {
  const req = route.request();
  const url = new URL(req.url());
  const m = url.pathname.match(/\/rest\/v1\/(.+)$/);
  if (!m) return route.continue();
  const tabela = m[1];
  const metodo = req.method();
  const querObjeto = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
  const responder = (status, corpo, extra = {}) => route.fulfill({
    status, contentType: 'application/json', headers: { 'content-range': '0-0/*', ...extra },
    body: corpo === undefined ? '' : JSON.stringify(corpo),
  });
  contagem[`${metodo} ${tabela}`] = (contagem[`${metodo} ${tabela}`] ?? 0) + 1;

  if (tabela.startsWith('rpc/')) return responder(200, null);
  if (!banco[tabela]) banco[tabela] = [];          // auditoria e afins: aceita e esquece
  const linhas = banco[tabela];
  const alvo = filtrar(linhas, url.searchParams);

  if (metodo === 'HEAD') return responder(200, undefined, { 'content-range': `0-${alvo.length}/${alvo.length}` });
  if (metodo === 'GET') {
    if (querObjeto) return alvo.length ? responder(200, alvo[0]) : responder(406, { code: 'PGRST116', message: 'no rows', details: 'Results contain 0 rows' });
    return responder(200, alvo);
  }
  const corpo = req.postData() ? JSON.parse(req.postData()) : {};
  if (metodo === 'POST') {
    const novos = (Array.isArray(corpo) ? corpo : [corpo]).map(o => ({ id: o.id ?? crypto.randomUUID(), created_at: new Date().toISOString(), ...o }));
    linhas.push(...novos);
    return responder(201, querObjeto ? novos[0] : novos);
  }
  if (metodo === 'PATCH') {
    alvo.forEach(x => Object.assign(x, corpo));
    return responder(200, querObjeto ? alvo[0] : alvo);
  }
  if (metodo === 'DELETE') {
    banco[tabela] = linhas.filter(x => !alvo.includes(x));
    return responder(200, querObjeto ? alvo[0] ?? null : alvo);
  }
  return responder(200, []);
}

// ── portões ──────────────────────────────────────────────────────────────────
const portoes = [];
const exigir = (ok, texto) => { portoes.push(`${ok ? 'ok   ' : 'FALHA'} ${texto}`); };

const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
const erros = [];

async function abrir(modo, viewport = { width: 1600, height: 1000 }) {
  banco = bancoInicial();
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', e => erros.push(`[${modo}] PAGEERROR ${e.message}`));
  page.on('console', msg => { if (msg.type() === 'error') erros.push(`[${modo}] console ${msg.text().slice(0, 200)}`); });
  await page.route('**/rest/v1/**', servir);
  await page.goto(`${urlBase}/docs/spikes/torres-unidades/index.html?modo=${modo}`, { waitUntil: 'networkidle' });
  await page.getByText(modo === 'caracteristicas' ? '101' : 'Torre Única').first().waitFor({ timeout: 30000 });
  return { ctx, page };
}

const h3 = (page, nome) => page.locator('h3', { hasText: new RegExp(`^${nome}$`) });
const confirmar = async (page, rotulo) => {
  const botao = page.getByRole('button', { name: rotulo, exact: true }).last();
  await botao.waitFor({ timeout: 5000 });
  await botao.click();
};

// ── 1. modo empreendimento, 1600px ───────────────────────────────────────────
{
  const { ctx, page } = await abrir('empreendimento');
  await page.screenshot({ path: path.join(outDir, '01-inicial.png'), fullPage: true });

  exigir(await h3(page, 'Terreno').count() === 1, 'seção Terreno com título h3');
  exigir(await h3(page, 'Torres').count() === 1, 'seção Torres com título h3');
  const rotulosTerreno = await page.locator('section', { has: h3(page, 'Terreno') }).locator('label').allInnerTexts();
  exigir(rotulosTerreno.length === 5, `Terreno com 5 rótulos visíveis (${rotulosTerreno.join(' | ')})`);
  exigir(await page.getByLabel('Área total (m²)').inputValue() === '1200', 'Terreno vem preenchido com o valor do empreendimento');
  const salvarTerreno = page.getByRole('button', { name: 'Salvar terreno' });
  exigir(await salvarTerreno.isDisabled(), '"Salvar terreno" desligado sem alteração');
  await page.getByLabel('Área total (m²)').fill('1250');
  exigir(await salvarTerreno.isEnabled(), '"Salvar terreno" liga depois de alterar um campo');
  await salvarTerreno.click();
  await page.getByText('Terreno salvo.').waitFor({ timeout: 5000 }).then(() => exigir(true, 'toast "Terreno salvo." aparece'), () => exigir(false, 'toast "Terreno salvo." aparece'));
  const patchTerreno = banco.empreendimentos[0];
  exigir(patchTerreno.terreno_area === 1250, `PATCH do terreno levou a área nova (${patchTerreno.terreno_area})`);

  // Nada de "Adicionar Terreno" nem inputs soltos sem rótulo antes das torres.
  exigir(await page.getByText('Adicionar Terreno').count() === 0, 'botão "Adicionar Terreno" não existe mais');
  exigir(await page.getByPlaceholder('Nome (ex: Torre A)').count() === 0, 'linha de inputs sem rótulo da nova torre não existe mais');

  // Nova torre → painel
  await page.getByRole('button', { name: 'Nova torre' }).click();
  await page.getByRole('heading', { name: 'Nova torre' }).waitFor();
  await page.waitForTimeout(500);   // fim da animação de entrada do painel
  await page.screenshot({ path: path.join(outDir, '02-nova-torre.png') });
  await page.getByRole('button', { name: 'Salvar torre' }).click();
  exigir(await page.getByText('Informe o nome da torre ou bloco.').isVisible(), 'nome vazio: erro inline no painel (sem toast)');
  await page.getByLabel('Nome *').fill('Torre B');
  await page.getByLabel('Nº de pavimentos').fill('10');
  await page.getByLabel('Unidades por pavimento').fill('2');
  const getsTorresAntes = contagem['GET empreendimento_towers'] ?? 0;
  await page.getByRole('button', { name: 'Salvar torre' }).click();
  await page.getByText('Torre B').first().waitFor();
  await page.waitForTimeout(500);
  exigir((contagem['GET empreendimento_towers'] ?? 0) === getsTorresAntes, `criar torre não recarrega a lista (§22) — GET torres ${getsTorresAntes}→${contagem['GET empreendimento_towers']}`);
  exigir(await page.getByRole('heading', { name: 'Nova torre' }).isHidden(), 'painel Nova torre fecha depois de salvar');
  // a torre nova já abre: Pavimentos e Unidades visíveis
  exigir(await h3(page, 'Pavimentos').count() === 1 && await h3(page, 'Unidades').count() === 1, 'torre nova abre expandida, com seções Pavimentos e Unidades');

  // Pavimentos: rótulos e geração desligada sem pavimentos
  const secPav = page.locator('div.space-y-4', { has: h3(page, 'Pavimentos') }).first();
  const rotulosPav = await secPav.locator('form label').allInnerTexts();
  exigir(rotulosPav.join('|') === 'Nome *|Tipo *|Nº inicial *|Repete|Un./pav.', `Pavimentos com 5 rótulos (${rotulosPav.join(' | ')})`);
  const gerarPav = page.getByRole('button', { name: /Gerar a partir dos pavimentos/ });
  exigir(await gerarPav.isDisabled(), '"Gerar a partir dos pavimentos" desligado sem pavimentos');
  const motivo = await gerarPav.locator('..').getAttribute('title');
  exigir(/Cadastre os pavimentos/.test(motivo ?? ''), `botão desligado diz o motivo (${motivo})`);

  await secPav.getByLabel('Nome *').fill('Pavimento Tipo');
  await secPav.getByLabel('Nº inicial *').fill('1');
  await secPav.getByLabel('Repete').fill('3');
  await secPav.getByLabel('Un./pav.').fill('2');
  exigir(await secPav.getByText('Andares: 1 → 3').isVisible(), 'prévia "Andares: 1 → 3" antes de adicionar');
  const getsPavAntes = contagem['GET empreendimento_floors'] ?? 0;
  await secPav.getByRole('button', { name: 'Adicionar pavimento' }).click();
  await secPav.locator('tbody tr', { hasText: 'Pavimento Tipo' }).waitFor();
  exigir((contagem['GET empreendimento_floors'] ?? 0) === getsPavAntes, `adicionar pavimento não recarrega a lista (§22) — GET ${getsPavAntes}→${contagem['GET empreendimento_floors']}`);
  exigir(await secPav.getByText('3 andares · 6 unidades').isVisible(), 'resumo "3 andares · 6 unidades" no título de Pavimentos');
  exigir(await gerarPav.isEnabled() && /\(6\)/.test(await gerarPav.innerText()), `"Gerar a partir dos pavimentos (6)" liga (${await gerarPav.innerText()})`);

  // Gerar a partir dos pavimentos → confirma → 6 unidades
  await gerarPav.click();
  const dialogo = page.getByText('Gerar 6 unidades a partir dos pavimentos?');
  exigir(await dialogo.isVisible(), 'confirmação cita a contagem dos pavimentos');
  await confirmar(page, 'Gerar unidades');
  await page.getByText('6 unidades geradas a partir dos pavimentos.').waitFor({ timeout: 5000 });
  const secUni = page.locator('div.space-y-4', { has: h3(page, 'Unidades') }).first();
  exigir(await secUni.getByText('6 unid.', { exact: true }).isVisible(), 'Unidades mostra "6 unid." depois de gerar');
  exigir(await h3(page, 'Pavimentos').count() === 1, 'a torre continua aberta depois de gerar');

  // Gerar de novo: agora substitui — a confirmação diz isso
  await gerarPav.click();
  exigir(await page.getByText(/As 6 unidades atuais de "Torre B" serão excluídas e substituídas/).isVisible(), 'com unidades existentes, a confirmação avisa a substituição');
  await page.screenshot({ path: path.join(outDir, '03-confirma-substituir.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Gerar em série: 2 pav × 2 un → +4
  await secUni.getByRole('button', { name: 'Gerar em série' }).click();
  await page.getByRole('heading', { name: 'Gerar unidades em série' }).waitFor();
  const serie = page.locator('form', { has: page.getByLabel('Nº de pavimentos *') });
  await serie.getByLabel('Nº de pavimentos *').fill('2');
  await serie.getByLabel('Unidades por pavimento *').fill('2');
  await serie.getByLabel('Pavimento inicial').fill('20');
  exigir(await serie.getByText(/De 2001 a 2102/).isVisible(), 'prévia da numeração "De 2001 a 2102"');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, '04-gerar-em-serie.png') });
  await serie.getByRole('button', { name: 'Gerar 4 unidades' }).click();
  await confirmar(page, 'Gerar');
  await page.getByText('4 unidades acrescentadas.').waitFor({ timeout: 5000 });
  exigir(await secUni.getByText('10 unid.', { exact: true }).isVisible(), 'série acrescenta: 6 + 4 = "10 unid."');

  // Nova unidade: 13 rótulos, erro inline, ESC com alteração pergunta
  await secUni.getByRole('button', { name: 'Nova unidade' }).click();
  await page.getByRole('heading', { name: 'Nova unidade' }).waitFor();
  const formNova = page.locator('form', { has: page.getByRole('button', { name: 'Salvar unidade' }) });
  const rotulosNova = await formNova.locator('label').allInnerTexts();
  exigir(rotulosNova.length === 13, `Nova unidade com 13 rótulos (${rotulosNova.join(' | ')})`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, '05-nova-unidade.png') });
  await formNova.getByRole('button', { name: 'Salvar unidade' }).click();
  exigir(await formNova.getByText('Informe a identificação da unidade.').isVisible(), 'Nova unidade: nome vazio dá erro inline');
  await formNova.getByLabel('Unidade (ex: 101) *').fill('999');
  await page.keyboard.press('Escape');
  exigir(await page.getByText('Sair sem salvar?').isVisible(), 'ESC com campo preenchido pede confirmação');
  await page.getByRole('button', { name: 'Continuar editando' }).click();
  await formNova.getByLabel('Área privativa (m²)').fill('55');
  await formNova.getByRole('button', { name: 'Salvar unidade' }).click();
  await page.getByText('Unidade 999 criada.').waitFor({ timeout: 5000 });
  exigir(await secUni.getByText('11 unid.', { exact: true }).isVisible(), 'Nova unidade entra na tabela: "11 unid."');
  const u999 = banco.empreendimento_units.find(u => u.name === '999');
  exigir(u999?.tower_id && u999.total_area === 55 && u999.position_type === null, `payload da unidade: torre, total_area=55, enum vazio=null (${JSON.stringify({ t: u999?.tower_id, ta: u999?.total_area, p: u999?.position_type })})`);

  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outDir, '06-final-1600.png'), fullPage: true });
  await ctx.close();
}

// ── 2. modo estudo (Viabilidade/Planta IA): sem Terreno ──────────────────────
{
  const { ctx, page } = await abrir('estudo');
  exigir(await h3(page, 'Terreno').count() === 0, 'estudo (sem empreendimento): seção Terreno não aparece');
  exigir(await h3(page, 'Torres').count() === 1, 'estudo: seção Torres aparece');
  await page.screenshot({ path: path.join(outDir, '07-estudo.png'), fullPage: true });
  await ctx.close();
}

// ── 3. modo leitura: Nova torre desligada com motivo ─────────────────────────
{
  const { ctx, page } = await abrir('leitura');
  const nova = page.getByRole('button', { name: 'Nova torre' });
  exigir(await nova.isDisabled(), 'somente leitura: "Nova torre" desligado');
  exigir(/Sem permissão/.test(await nova.locator('..').getAttribute('title') ?? ''), 'somente leitura: motivo no título');
  await page.getByText('Torre Única').first().click();
  await h3(page, 'Unidades').waitFor();
  exigir(await page.getByRole('button', { name: 'Nova unidade' }).isDisabled(), 'somente leitura: "Nova unidade" desligado (fieldset)');
  await ctx.close();
}

// ── 4. mobile 390px: botões da linha Unidades não estouram ───────────────────
{
  const { ctx, page } = await abrir('empreendimento', { width: 390, height: 900 });
  await page.getByText('Torre Única').first().click();
  await h3(page, 'Unidades').waitFor();
  const larguraDoc = await page.evaluate(() => document.documentElement.scrollWidth);
  exigir(larguraDoc <= 390, `390px: sem rolagem horizontal da página (scrollWidth=${larguraDoc})`);
  const acoes = await page.locator('div.space-y-4', { has: h3(page, 'Unidades') }).first()
    .getByRole('button', { name: 'Nova unidade' }).boundingBox();
  exigir(acoes && acoes.x + acoes.width <= 390, `390px: "Nova unidade" dentro da tela (x+w=${acoes && Math.round(acoes.x + acoes.width)})`);
  await page.screenshot({ path: path.join(outDir, '08-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Nova unidade' }).click();
  await page.getByRole('heading', { name: 'Nova unidade' }).waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, '09-mobile-nova-unidade.png') });
  await ctx.close();
}

// ── 5. Características Adicionais: o painel de unidade usa os mesmos campos ──
{
  const { ctx, page } = await abrir('caracteristicas');
  await page.getByRole('button', { name: 'Nova Unidade' }).click();
  await page.getByRole('heading', { name: 'Nova Unidade' }).waitFor();
  await page.waitForTimeout(500);
  const painel = page.locator('div.fixed', { has: page.getByRole('heading', { name: 'Nova Unidade' }) }).last();
  const rotulos = await painel.locator('label').allInnerTexts();
  exigir(rotulos.length === 14 && rotulos[0] === 'Torre *', `Características › Nova Unidade: Torre + 13 campos (${rotulos.length}: ${rotulos.slice(0, 3).join(' | ')}…)`);
  exigir(await painel.getByLabel('Torre *').inputValue() === 'torre-1', 'Características: torre já vem escolhida');
  await page.screenshot({ path: path.join(outDir, '10-caracteristicas-nova.png') });
  await painel.getByRole('button', { name: 'Salvar unidade' }).click();
  exigir(await painel.getByText('Informe a identificação da unidade.').isVisible(), 'Características: nome vazio dá erro inline');
  await painel.getByLabel('Unidade (ex: 101) *').fill('501');
  await painel.getByLabel('Área comum (m²)').fill('10');
  await painel.getByRole('button', { name: 'Salvar unidade' }).click();
  await page.getByText('Unidade criada com sucesso').waitFor({ timeout: 5000 })
    .then(() => exigir(true, 'Características: criar unidade salva'), () => exigir(false, 'Características: criar unidade salva'));
  const u501 = banco.empreendimento_units.find(u => u.name === '501');
  exigir(u501?.tower_id === 'torre-1' && u501.total_area === 10, `Características: payload com torre e total_area (${JSON.stringify({ t: u501?.tower_id, ta: u501?.total_area })})`);

  // Editar: o formulário vem preenchido a partir do registro (unitFormFromRecord)
  await page.waitForTimeout(600);
  await page.locator('tr', { hasText: '102' }).first().getByRole('button', { name: /Editar/ }).first().click();
  await page.getByRole('heading', { name: 'Editar Unidade' }).waitFor();
  const painelEd = page.locator('div.fixed', { has: page.getByRole('heading', { name: 'Editar Unidade' }) }).last();
  exigir(await painelEd.getByLabel('Unidade (ex: 101) *').inputValue() === '102' && await painelEd.getByLabel('Área privativa (m²)').inputValue() === '32.39',
    'Características › Editar: campos vêm preenchidos (102, 32.39)');
  await painelEd.getByLabel('Tipologia').fill('3 dorm.');
  await painelEd.getByRole('button', { name: 'Salvar unidade' }).click();
  await page.getByText('Unidade atualizada com sucesso').waitFor({ timeout: 5000 })
    .then(() => exigir(true, 'Características: editar unidade salva'), () => exigir(false, 'Características: editar unidade salva'));
  exigir(banco.empreendimento_units.find(u => u.name === '102')?.typology === '3 dorm.', 'Características: PATCH levou a tipologia nova');
  await ctx.close();
}

await browser.close();
console.log(portoes.join('\n'));
if (erros.length) console.log('\nERROS DE PÁGINA/CONSOLE:\n' + erros.join('\n'));
const falhas = portoes.filter(p => p.startsWith('FALHA')).length;
console.log(`\n${portoes.length - falhas}/${portoes.length} portões ok`);
process.exit(falhas ? 1 : 0);
