/**
 * Passeio do harness Configurações Fiscais — MEDE na tela o que o plano
 * docs/planos/2026-10-25-rh-configuracoes-fiscais-abas-tabela.md promete.
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/configuracoes-fiscais/passeio.mjs [urlBase] [outDir]
 *
 * O PostgREST é servido por um banco EM MEMÓRIA (page.route) — nenhuma leitura ou
 * escrita chega ao Supabase. Cada portão imprime ok/FALHA; exit 1 se algum falhar.
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

const urlBase = process.argv[2] ?? 'http://127.0.0.1:3141';
const outDir = process.argv[3] ?? '.';
fs.mkdirSync(outDir, { recursive: true });

// ── banco em memória (tabelas de 2025, vigência o ano inteiro) ─────────────────
const ANO = new Date().getFullYear();
const vig = { valid_from: `${ANO}-01-01`, valid_to: `${ANO}-12-31` };
function bancoInicial() {
  return {
    inss_brackets: [
      { id: 'i1', ...vig, min_value: 0, max_value: 1518, rate: 0.075, deduction: 0 },
      { id: 'i2', ...vig, min_value: 1518.01, max_value: 2793.88, rate: 0.09, deduction: 22.77 },
      { id: 'i3', ...vig, min_value: 2793.89, max_value: 4190.83, rate: 0.12, deduction: 106.59 },
      { id: 'i4', ...vig, min_value: 4190.84, max_value: 8157.41, rate: 0.14, deduction: 190.4 },
    ],
    irrf_brackets: [
      { id: 'r1', ...vig, min_value: 0, max_value: 2428.8, rate: 0, deduction: 0 },
      { id: 'r2', ...vig, min_value: 2428.81, max_value: 2826.65, rate: 0.075, deduction: 182.16 },
      { id: 'r3', ...vig, min_value: 2826.66, max_value: 3751.05, rate: 0.15, deduction: 394.16 },
      { id: 'r4', ...vig, min_value: 3751.06, max_value: 4664.68, rate: 0.225, deduction: 675.49 },
      { id: 'r5', ...vig, min_value: 4664.69, max_value: null, rate: 0.275, deduction: 908.73 },
    ],
    fgts_config: [{ id: 'f1', ...vig, rate: 0.08 }],
  };
}
let banco = bancoInicial();
const escritas = [];
const leituras = {};   // "inss_brackets" → n de GETs

async function servir(route) {
  const req = route.request();
  const url = new URL(req.url());
  const m = url.pathname.match(/\/rest\/v1\/(.+)$/);
  if (!m) return route.continue();
  const tabela = m[1];
  const metodo = req.method();
  const querObjeto = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
  const responder = (status, corpo) => route.fulfill({
    status, contentType: 'application/json', headers: { 'content-range': '0-0/*' },
    body: corpo === undefined ? '' : JSON.stringify(corpo),
  });
  if (!banco[tabela]) banco[tabela] = [];
  const linhas = banco[tabela];
  const id = url.searchParams.get('id');
  const alvo = id?.startsWith('eq.') ? linhas.filter(x => x.id === id.slice(3)) : linhas;

  if (metodo === 'GET') {
    leituras[tabela] = (leituras[tabela] ?? 0) + 1;
    // O stub não aplica a vigência: todas as linhas valem no ano do harness.
    const ord = [...alvo].sort((a, b) => (a.min_value ?? 0) - (b.min_value ?? 0));
    if (querObjeto) return ord.length ? responder(200, ord[0]) : responder(406, { code: 'PGRST116', message: 'no rows' });
    return responder(200, ord);
  }
  const corpo = req.postData() ? JSON.parse(req.postData()) : {};
  escritas.push({ metodo, tabela, id: id?.slice(3), corpo });
  if (metodo === 'POST') {
    const novos = (Array.isArray(corpo) ? corpo : [corpo]).map(o => ({ id: crypto.randomUUID(), ...o }));
    linhas.push(...novos);
    return responder(201, querObjeto ? novos[0] : novos);
  }
  if (metodo === 'PATCH') { alvo.forEach(x => Object.assign(x, corpo)); return responder(200, alvo); }
  if (metodo === 'DELETE') { banco[tabela] = linhas.filter(x => !alvo.includes(x)); return responder(200, alvo); }
  return responder(200, []);
}

// ── portões ──────────────────────────────────────────────────────────────────
const portoes = [];
const exigir = (ok, texto) => { portoes.push(`${ok ? 'ok   ' : 'FALHA'} ${texto}`); };

const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
const erros = [];
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
let dialogoNativo = 0;
page.on('dialog', d => { dialogoNativo++; d.dismiss(); });
page.on('pageerror', e => erros.push(`PAGEERROR ${e.message}`));
page.on('console', msg => { if (msg.type() === 'error') erros.push(`console ${msg.text().slice(0, 200)}`); });
await page.route('**/rest/v1/**', servir);
// Limpa o localStorage só na 1ª carga da aba — o portão 10 recarrega e confere a persistência.
await page.addInitScript(() => { try { if (!sessionStorage.getItem('harness')) { localStorage.clear(); sessionStorage.setItem('harness', '1'); } } catch { /* */ } });
await page.goto(`${urlBase}/docs/spikes/configuracoes-fiscais/index.html`, { waitUntil: 'networkidle' });

const linhas = () => page.locator('table tbody tr');
const aba = (nome) => page.getByRole('tab', { name: new RegExp(nome) });
const textoDaTabela = () => page.locator('table').innerText();

try {
  await page.getByText('1.518,00').first().waitFor({ timeout: 30000 });

  // 1. Título + três abas
  exigir(await page.locator('h1', { hasText: 'Configurações Fiscais' }).count() === 1, 'h1 "Configurações Fiscais"');
  const abas = await page.getByRole('tab').allInnerTexts();
  exigir(abas.some(t => t.includes('Tabela INSS')) && abas.some(t => t.includes('Tabela IRRF')) && abas.some(t => t.includes('Fundo de Garantia (FGTS)')),
    `três abas: ${abas.map(t => t.replace(/\s+/g, ' ')).join(' | ')}`);
  exigir(await page.getByRole('tab', { selected: true }).innerText().then(t => t.includes('INSS')), 'INSS é a aba inicial');
  exigir(abas.find(t => t.includes('INSS'))?.includes('4'), 'contador de faixas na aba INSS = 4');

  // 2. Toolbar acoplada: busca + engrenagem + ajuste de largura
  exigir(await page.getByPlaceholder('Buscar faixa de INSS...').count() === 1, 'busca na toolbar acoplada');
  exigir(await page.getByTitle('Ajustar largura das colunas ao conteúdo').count() === 1, 'botão de ajuste de largura (autofit)');
  const ths = await page.locator('table thead th').allInnerTexts();
  exigir(['Faixa', 'Vigência', 'Base inicial', 'Base final', 'Alíquota', 'Parcela a deduzir', 'Ações'].every(h => ths.some(t => t.trim() === h)),
    `cabeçalhos sentence case: ${ths.map(t => t.trim()).filter(Boolean).join(' · ')}`);
  exigir(await linhas().count() === 4, 'INSS: 4 linhas');
  const largAntes = await page.locator('table').evaluate(t => t.getBoundingClientRect().width);
  const thBg = await page.locator('table thead tr').evaluate(tr => getComputedStyle(tr).backgroundColor);
  exigir(thBg === 'rgb(255, 255, 255)', `cabeçalho branco (§6.11): ${thBg}`);
  await page.screenshot({ path: path.join(outDir, '01-inss.png'), fullPage: true });

  await page.getByTitle('Ajustar largura das colunas ao conteúdo').click();
  await page.waitForTimeout(400);
  const largDepois = await page.locator('table').evaluate(t => t.getBoundingClientRect().width);
  const card = await page.locator('table').evaluate(t => t.closest('.overflow-auto').getBoundingClientRect().width);
  exigir(largDepois <= card + 1, `autofit: tabela ${Math.round(largAntes)}→${Math.round(largDepois)}px cabe no card de ${Math.round(card)}px`);

  // 3. Editar a 2ª faixa: alíquota 9 → 9,5 e Enter
  const getsAntes = leituras.inss_brackets;
  const l2 = linhas().nth(1);
  await l2.locator('button[title="Editar"]').click();
  const inputs = l2.locator('input[type=number]');
  exigir(await inputs.count() === 4, 'linha em edição: 4 campos numéricos (base inicial, final, alíquota, dedução)');
  const fonteInput = await inputs.first().evaluate(i => { const s = getComputedStyle(i); return `${s.fontSize}/${s.fontWeight}/${s.color}`; });
  exigir(fonteInput.startsWith('14px/400/'), `campo inline text-sm font-normal (§7.1): ${fonteInput}`);
  exigir(await page.getByRole('button', { name: 'Nova faixa' }).isDisabled(), '"Nova faixa" desligada durante a edição');
  await inputs.nth(2).fill('9,5'.replace(',', '.'));
  await inputs.nth(2).press('Enter');
  await page.getByText('9,5%').first().waitFor({ timeout: 5000 });
  const patch = escritas.find(e => e.metodo === 'PATCH' && e.tabela === 'inss_brackets');
  exigir(patch?.id === 'i2' && Math.abs(patch.corpo.rate - 0.095) < 1e-9 && !('valid_from' in patch.corpo),
    `PATCH só da faixa i2, rate 0.095, vigência intocada: ${JSON.stringify(patch)}`);
  exigir(leituras.inss_brackets === getsAntes && await linhas().count() === 4, `edição atualiza a linha local, sem recarregar (§22): GETs ${getsAntes}→${leituras.inss_brackets}`);

  // 4. Nova faixa: começa onde a última termina; base final vazia = "em diante"
  await page.getByRole('button', { name: 'Nova faixa' }).click();
  exigir(await linhas().count() === 5, 'nova faixa aparece como 5ª linha em edição');
  const nova = linhas().nth(4);
  const minNova = await nova.locator('input[type=number]').first().inputValue();
  exigir(minNova === '8157.42', `base inicial sugerida = última base final + 0,01: ${minNova}`);
  await nova.locator('input[type=number]').nth(2).fill('15');
  await nova.getByTitle('Gravar (Enter)').click();
  await page.getByText('15,0%').first().waitFor({ timeout: 5000 });
  const post = escritas.find(e => e.metodo === 'POST' && e.tabela === 'inss_brackets');
  exigir(post && post.corpo.max_value === null && Math.abs(post.corpo.rate - 0.15) < 1e-9 && post.corpo.valid_from === `${ANO}-01-01`,
    `POST da faixa nova: ${JSON.stringify(post?.corpo)}`);
  exigir((await linhas().nth(4).innerText()).includes('Em diante'), 'faixa sem base final mostra "Em diante"');
  await page.screenshot({ path: path.join(outDir, '02-inss-editado.png'), fullPage: true });

  // 5. Excluir com useConfirm (nunca nativo)
  await linhas().nth(4).locator('button[title="Excluir"]').click();
  await page.getByText('Excluir faixa de INSS?').waitFor({ timeout: 5000 });
  await page.screenshot({ path: path.join(outDir, '03-confirmar-exclusao.png') });
  await page.locator('button', { hasText: /^Excluir$/ }).click();
  await page.waitForTimeout(500);
  exigir(escritas.some(e => e.metodo === 'DELETE' && e.tabela === 'inss_brackets') && await linhas().count() === 4, 'exclusão grava DELETE e tira a linha');

  // 6. Busca filtra
  await page.getByPlaceholder('Buscar faixa de INSS...').fill('12,0%');
  exigir(await linhas().count() === 1, 'busca "12,0%" deixa 1 linha');
  await page.getByPlaceholder('Buscar faixa de INSS...').fill('');

  // 7. IRRF
  await aba('Tabela IRRF').click();
  await page.getByText('908,73').first().waitFor({ timeout: 5000 });
  exigir(await linhas().count() === 5, 'IRRF: 5 linhas');
  exigir((await textoDaTabela()).includes('Em diante'), 'IRRF: última faixa "Em diante"');
  exigir((await page.locator('p', { hasText: 'Imposto de Renda' }).count()) === 1, 'subtítulo acompanha a aba (§20)');
  await page.screenshot({ path: path.join(outDir, '04-irrf.png'), fullPage: true });

  // 8. FGTS
  await aba('FGTS').click();
  await page.getByText('8,0%').first().waitFor({ timeout: 5000 });
  exigir(await linhas().count() === 1, 'FGTS: 1 linha');
  exigir(await page.getByRole('button', { name: 'Nova faixa' }).count() === 0, 'FGTS sem "Nova faixa"');
  await linhas().first().locator('button[title="Editar"]').click();
  const rate = linhas().first().locator('input[type=number]');
  await rate.fill('8.5');
  await rate.press('Enter');
  await page.getByText('8,5%').first().waitFor({ timeout: 5000 });
  exigir(escritas.some(e => e.metodo === 'PATCH' && e.tabela === 'fgts_config' && Math.abs(e.corpo.rate - 0.085) < 1e-9), 'FGTS: PATCH rate 0.085');
  await page.screenshot({ path: path.join(outDir, '05-fgts.png'), fullPage: true });

  // 9. Clonar tabelas: confirmação do app com o ano de origem; cancelar não grava
  const antes = escritas.length;
  await page.getByRole('button', { name: 'Clonar tabelas' }).click();
  await page.getByText(`Clonar tabelas para ${ANO}?`).waitFor({ timeout: 5000 });
  await page.screenshot({ path: path.join(outDir, '06-clonar.png') });
  exigir(await page.locator('select').filter({ has: page.locator(`option[value="${ANO - 1}"]`) }).count() >= 1, 'confirmação de clonar traz o ano de origem');
  await page.locator('button', { hasText: /^Cancelar$/ }).click();
  exigir(escritas.length === antes, 'cancelar o clonar não grava');

  // 10. Aba persiste (usePersistedState)
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  exigir(await page.getByRole('tab', { selected: true }).innerText().then(t => t.includes('FGTS')), 'aba ativa persiste após recarregar');
} catch (e) {
  erros.push('EXCEÇÃO ' + (e?.message ?? e).split('\n')[0]);
  await page.screenshot({ path: path.join(outDir, 'erro.png'), fullPage: true }).catch(() => {});
}

exigir(dialogoNativo === 0, `nenhum diálogo nativo (prompt/confirm): ${dialogoNativo}`);
exigir(erros.length === 0, `sem erro de página/console${erros.length ? ':\n  ' + erros.join('\n  ') : ''}`);
console.log(portoes.join('\n'));
await browser.close();
process.exit(portoes.some(p => p.startsWith('FALHA')) ? 1 : 0);
