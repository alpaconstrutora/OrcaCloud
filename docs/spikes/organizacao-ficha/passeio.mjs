/**
 * Passeio do harness Minha Organização › Organização — MEDE na tela que a ficha
 * inteira usa uma régua tipográfica só (docs/planos/2026-10-19-organizacao-ficha-tipografia.md).
 *
 *   node docs/spikes/organizacao-ficha/passeio.mjs [urlBase] [outDir]
 *
 * O PostgREST é servido em memória (page.route), SÓ LEITURA: qualquer escrita
 * é recusada com 403 e conta como falha — nada chega ao Supabase.
 * Cada portão imprime ok/FALHA; exit 1 se algum falhar.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

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

const urlBase = process.argv[2] ?? 'http://127.0.0.1:3198';
const outDir = process.argv[3] ?? '.';
fs.mkdirSync(outDir, { recursive: true });
const EXE = process.env.CHROME_EXE;

const banco = {
  companies: [
    { id: 'co-1', org_id: 'org-1', razao_social: 'Alpa Construtora Harness Ltda', nome_fantasia: 'Alpa', code: '001',
      tipo: 'construtora', cnpj: '12.345.678/0001-90', status: 'ativa', is_headquarters: true, cor_sistema: '#2563eb',
      regime_tributario: 'lucro_presumido', telefone: '(51) 3333-0000', email_comercial: 'contato@harness.test',
      endereco_fiscal: { cep: '90000-000', logradouro: 'Rua do Harness', numero: '100', bairro: 'Centro', cidade: 'Porto Alegre', uf: 'RS' } },
    { id: 'co-2', org_id: 'org-1', razao_social: 'SPE Residencial Harness Ltda', code: '002', tipo: 'spe',
      cnpj: '98.765.432/0001-10', status: 'ativa', is_headquarters: false, cor_sistema: '#10b981' },
  ],
  company_partners: [
    { id: 'p-1', company_id: 'co-1', tipo_pessoa: 'pf', nome: 'Sócia Harness', documento: '000.000.000-00',
      participacao_pct: 60, is_administrador: true, is_assinante_legal: true, data_entrada: '2020-01-10' },
    { id: 'p-2', company_id: 'co-1', tipo_pessoa: 'pj', nome: 'Holding Harness S.A.', documento: '11.111.111/0001-11',
      participacao_pct: 40, is_administrador: false, is_assinante_legal: false },
  ],
  company_bank_accounts: [
    { id: 'b-1', company_id: 'co-1', banco_codigo: '748', banco_nome: 'Sicredi', agencia: '0101', conta: '12345-6',
      tipo_conta: 'corrente', is_principal: true, ativa: true, limite_credito: 50000, pix_tipo: 'cnpj', pix_chave: '12345678000190' },
  ],
};

const META = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
function filtrar(linhas, params) {
  let r = linhas;
  for (const [k, v] of params) {
    if (META.has(k) || k.includes('.')) continue;
    if (v.startsWith('eq.')) r = r.filter(x => String(x[k]) === v.slice(3));
    else if (v.startsWith('in.(')) { const set = v.slice(4, -1).split(',').map(s => s.replace(/"/g, '')); r = r.filter(x => set.includes(String(x[k]))); }
  }
  return r;
}

const escritas = [];
async function servir(route) {
  const req = route.request();
  const url = new URL(req.url());
  const m = url.pathname.match(/\/rest\/v1\/(.+)$/);
  if (!m) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  const tabela = m[1];
  if (req.method() !== 'GET' && req.method() !== 'HEAD') {
    escritas.push(`${req.method()} ${tabela}`);
    return route.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"harness só leitura"}' });
  }
  const linhas = filtrar(banco[tabela] ?? [], url.searchParams);
  const querObjeto = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
  return route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'content-range': `0-${Math.max(linhas.length - 1, 0)}/${linhas.length}` },
    body: JSON.stringify(querObjeto ? (linhas[0] ?? null) : linhas),
  });
}

let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok   ' : 'FALHA'} ${msg}`); if (!c) falhas++; };

// Tipografia de todo rótulo de campo e título de seção visível — o que o olho compara.
async function medir(page) {
  return page.evaluate(() => {
    const vis = (el) => el.offsetParent !== null;
    const est = (el) => { const s = getComputedStyle(el); return `${s.fontSize}/${s.fontWeight}/${s.textTransform}/${s.letterSpacing}`; };
    const rotulos = [...document.querySelectorAll('label')].filter(vis)
      .filter(l => l.nextElementSibling && /^(INPUT|SELECT|DIV)$/.test(l.nextElementSibling.tagName))
      .map(l => ({ t: l.textContent.trim().slice(0, 30), e: est(l) }));
    const secoes = [...document.querySelectorAll('h3')].filter(vis).filter(h => h.textContent.trim() !== 'Nova empresa' /* título de formulário, §21 */).map(h => ({ t: h.textContent.trim().slice(0, 30), e: est(h) }));
    const caixaAlta = [...document.querySelectorAll('body *')].filter(vis)
      .filter(el => getComputedStyle(el).textTransform === 'uppercase' && el.textContent.trim())
      // Exceção do guia: rótulo do KpiCard `md` é caixa alta por desenho (§4/§4.3).
      .filter(el => !(el.tagName === 'P' && el.classList.contains('tracking-wide') && el.nextElementSibling?.className.includes('font-bold')))
      .map(el => el.textContent.trim().slice(0, 30));
    const pesados = [...document.querySelectorAll('body *')].filter(vis)
      .filter(el => Number(getComputedStyle(el).fontWeight) >= 800 && el.children.length === 0 && el.textContent.trim())
      .map(el => `${el.tagName}:${el.textContent.trim().slice(0, 30)}`);
    return { rotulos, secoes, caixaAlta, pesados };
  });
}

const ROTULO = '12px/600/none/normal';
const SECAO = '14px/600/none/normal';

(async () => {
  const chromium = await loadChromium();
  const browser = await chromium.launch({ headless: true, ...(EXE ? { executablePath: EXE } : {}) });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  await page.route('**/rest/v1/**', servir);

  // ── ficha da organização ──────────────────────────────────────────────────
  await page.goto(`${urlBase}/docs/spikes/organizacao-ficha/index.html?modo=ficha`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Alpa Construtora Harness' }).waitFor({ timeout: 30000 });

  const ABRE_FORM = {
    'Sócios': 'Adicionar Sócio', 'Contas': 'Adicionar Conta', 'Filiais': 'Adicionar Filial',
    'Documentos': 'Adicionar Documento', 'Metas': 'Definir Metas', 'Departamentos': 'Novo Departamento',
    'Empresas do grupo': 'Nova empresa',
  };
  const abas = ['Organização', 'Identificação', 'Sócios', 'Contas', 'Financeiro', 'Tributário', 'Filiais', 'Documentos', 'Metas', 'Departamentos', 'Responsáveis', 'Empresas do grupo'];
  for (const aba of abas) {
    await page.getByRole('tab', { name: new RegExp(`^${aba}`) }).first().click();
    await page.waitForTimeout(700);
    // Abas de lista: abre o formulário para os rótulos estarem na tela.
    const abrir = ABRE_FORM[aba];
    if (abrir) { await page.getByRole('button', { name: abrir }).first().click(); await page.waitForTimeout(500); }
    const m = await medir(page);
    const rotErrados = m.rotulos.filter(r => r.e !== ROTULO);
    const secErradas = m.secoes.filter(s => s.e !== SECAO);
    // Siglas (PF/PJ, CNPJ) são texto já em maiúsculas — o que se procura é CSS uppercase.
    ok(rotErrados.length === 0, `[${aba}] ${m.rotulos.length} rótulo(s) em ${ROTULO}` + (rotErrados.length ? ` → fora: ${JSON.stringify(rotErrados.slice(0, 4))}` : ''));
    ok(secErradas.length === 0, `[${aba}] ${m.secoes.length} título(s) de seção em ${SECAO}` + (secErradas.length ? ` → fora: ${JSON.stringify(secErradas.slice(0, 4))}` : ''));
    ok(m.caixaAlta.length === 0, `[${aba}] nenhum texto com CSS uppercase` + (m.caixaAlta.length ? ` → ${JSON.stringify(m.caixaAlta.slice(0, 5))}` : ''));
    // font-black (900) só é permitido no h1 da tela (§20)
    // …e no título de formulário (§21 mantém o peso: `font-black text-slate-800 text-lg`).
    const pesadosForaH1 = m.pesados.filter(p => !p.startsWith('H1:') && p !== 'H3:Nova empresa');
    ok(pesadosForaH1.length === 0, `[${aba}] nada em font-black/extrabold fora do h1` + (pesadosForaH1.length ? ` → ${JSON.stringify(pesadosForaH1.slice(0, 5))}` : ''));
    await page.screenshot({ path: path.join(outDir, `ficha-${aba.normalize('NFD').replace(/[^\w]/g, '').toLowerCase()}.png`), fullPage: true });
  }

  // ── empresa do grupo aberta em "Gerenciar" (cabeçalho + barra próprios) ────
  await page.goto(`${urlBase}/docs/spikes/organizacao-ficha/index.html?modo=empresa`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'SPE Residencial Harness Ltda' }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(700);
  {
    const m = await medir(page);
    ok(m.caixaAlta.length === 0, `[empresa do grupo] nenhum texto com CSS uppercase` + (m.caixaAlta.length ? ` → ${JSON.stringify(m.caixaAlta.slice(0, 5))}` : ''));
    ok(m.rotulos.every(r => r.e === ROTULO), `[empresa do grupo] rótulos em ${ROTULO}`);
    const h2 = await page.getByRole('heading', { name: 'SPE Residencial Harness Ltda' }).evaluate(el => getComputedStyle(el).fontStyle);
    ok(h2 === 'normal', `[empresa do grupo] título sem itálico (${h2})`);
    await page.screenshot({ path: path.join(outDir, 'empresa-do-grupo.png'), fullPage: true });
  }

  // ── lista ─────────────────────────────────────────────────────────────────
  await page.goto(`${urlBase}/docs/spikes/organizacao-ficha/index.html?modo=lista`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { level: 1, name: 'Organizações' }).waitFor({ timeout: 30000 });
  {
    const [cor, esperado] = await page.getByText('Alpa Construtora Harness', { exact: true }).first().evaluate(el => {
      const sonda = document.createElement('span'); sonda.className = 'text-gray-700'; document.body.appendChild(sonda);
      const r = [getComputedStyle(el).color, getComputedStyle(sonda).color]; sonda.remove(); return r;
    });
    ok(cor === esperado, `[lista] nome da organização em gray-700 (§7): ${cor}`);
    await page.screenshot({ path: path.join(outDir, 'lista.png'), fullPage: true });
  }

  ok(escritas.length === 0, `nenhuma escrita tentada` + (escritas.length ? ` → ${escritas.join(', ')}` : ''));
  ok(erros.length === 0, `sem erro de página` + (erros.length ? ` → ${erros.slice(0, 3).join(' | ')}` : ''));
  await browser.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntodos os portões ok');
  process.exit(falhas ? 1 : 0);
})();
