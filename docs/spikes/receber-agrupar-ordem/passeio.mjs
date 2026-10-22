/**
 * Passeio: abre o harness, confere o seletor de ordem desligado sem agrupamento,
 * agrupa por cliente, alterna Crescente/Decrescente e repete em status e
 * vencimento — com print de cada estado e PORTÕES que reprovam (exit 1).
 *
 *   node docs/spikes/receber-agrupar-ordem/passeio.mjs [urlBase] [pastaDosPrints]
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// playwright-core não é dependência do app: pega o local, ou o de PLAYWRIGHT_CORE.
async function loadChromium() {
  const pick = (m) => m.chromium ?? m.default?.chromium;
  try { const local = await import('playwright-core'); if (pick(local)) return pick(local); } catch { /* segue */ }
  const base = process.env.PLAYWRIGHT_CORE;
  if (!base) throw new Error('defina PLAYWRIGHT_CORE');
  return pick(await import(pathToFileURL(path.join(base, 'index.js')).href));
}
const chromium = await loadChromium();

const urlBase = process.argv[2] ?? 'http://127.0.0.1:3121';
const outDir = process.argv[3] ?? '.';
const EXE = 'C:/Users/altai/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const browser = await chromium.launch({ headless: true, executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const erros = [];
page.on('pageerror', e => erros.push(e.message));
let falhas = 0;
const portao = (ok, msg) => { console.log(`${ok ? '✅' : '❌'} ${msg}`); if (!ok) falhas++; };

await page.goto(`${urlBase}/docs/spikes/receber-agrupar-ordem/index.html`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

const ordem = page.getByRole('combobox', { name: 'Ordem dos grupos' });
const grupos = () => page.$$eval('tbody span.font-semibold', els => els.map(e => e.textContent));

portao(await ordem.isDisabled(), 'sem agrupamento: seletor de ordem desligado');
portao((await ordem.getAttribute('title'))?.includes('para ordenar os grupos'), 'sem agrupamento: title diz o motivo');
await page.screenshot({ path: path.join(outDir, 'ordem-01-sem-grupo.png'), clip: { x: 0, y: 0, width: 1280, height: 120 } });

await page.selectOption('select[title="Agrupar os títulos"]', 'cliente');
portao(!(await ordem.isDisabled()), 'agrupado: seletor ligado');
const asc = await grupos();
console.log('   cliente asc:', asc.join(' | '));
portao(JSON.stringify(asc) === JSON.stringify(['Ângela Prado', 'Bruno Lima', 'Construtora Zeta', 'Maria Souza', 'Sem cliente']), 'cliente Crescente = A→Z com acento no lugar certo, "Sem cliente" no fim');
await page.screenshot({ path: path.join(outDir, 'ordem-02-cliente-crescente.png') });

await page.selectOption('select[aria-label="Ordem dos grupos"]', 'desc');
await page.waitForTimeout(400); // `transition-all` do "Agrupar" azul — print no meio sai desbotado
const desc = await grupos();
console.log('   cliente desc:', desc.join(' | '));
portao(JSON.stringify(desc) === JSON.stringify(['Maria Souza', 'Construtora Zeta', 'Bruno Lima', 'Ângela Prado', 'Sem cliente']), 'cliente Decrescente = Z→A, "Sem cliente" continua no fim');
await page.screenshot({ path: path.join(outDir, 'ordem-03-cliente-decrescente.png') });

// O dropdown aberto não sai em print headless (é nativo); mostra-se o valor escolhido.
await page.selectOption('select[title="Agrupar os títulos"]', 'status');
console.log('   status desc:', (await grupos()).join(' | '));
portao(JSON.stringify(await grupos()) === JSON.stringify(['Vencido', 'Recebido', 'Previsto']), 'status Decrescente = fluxo invertido (direção persiste ao trocar o campo)');

await page.selectOption('select[title="Agrupar os títulos"]', 'vencimento');
await page.selectOption('select[aria-label="Ordem dos grupos"]', 'asc');
console.log('   vencimento asc:', (await grupos()).join(' | '));
portao((await grupos())[0] === 'Agosto/2026', 'vencimento Crescente = mês mais antigo primeiro');

await page.reload({ waitUntil: 'networkidle' });
portao(await page.inputValue('select[aria-label="Ordem dos grupos"]') === 'asc' && await page.inputValue('select[title="Agrupar os títulos"]') === 'vencimento', 'recarregar mantém campo e ordem');

const larguraToolbar = await page.$eval('[data-toolbar]', el => el.scrollWidth <= el.clientWidth + 1);
portao(larguraToolbar, 'toolbar sem estouro horizontal');
portao(erros.length === 0, `sem erro de página${erros.length ? ': ' + erros.join(' / ') : ''}`);

await browser.close();
console.log(falhas ? `\n${falhas} portão(ões) reprovado(s)` : '\nTodos os portões passaram');
process.exit(falhas ? 1 : 0);
