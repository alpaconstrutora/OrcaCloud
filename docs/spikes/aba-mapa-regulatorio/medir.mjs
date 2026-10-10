/**
 * Portão da aba Mapa Regulatório na Planta (exit ≠ 0 reprova). Fotografa as
 * duas abas e confere a ordem título → abas → KPIs no navegador real.
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/aba-mapa-regulatorio/medir.mjs [urlBase] [pastaDeSaida]
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const pick = (m) => m.chromium ?? m.default?.chromium;
const chromium = pick(await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.js')).href));
const urlBase = process.argv[2] ?? 'http://localhost:3171';
const saida = process.argv[3] ?? 'C:/tmp';
fs.mkdirSync(saida, { recursive: true });
const ALVO = `${urlBase}/docs/spikes/aba-mapa-regulatorio/index.html`;

const PLANTAS = [
  { id: 's1', name: 'Planta Torre A', status: 'RASCUNHO', updated_at: '2026-10-01T00:00:00Z' },
  { id: 's2', name: 'Planta Casa Térrea', status: 'PUBLICADO', updated_at: '2026-09-20T00:00:00Z' },
];
const MAPAS = [
  { id: 'm1', name: 'Plano Diretor Campinas', status: 'ATIVO', lei_referencia: 'LC 208/2018', organization_id: 'o1', master_cities: { name: 'Campinas', master_states: { code: 'SP' } } },
  { id: 'm2', name: 'Zoneamento Valinhos', status: 'RASCUNHO', lei_referencia: null, organization_id: 'o1', master_cities: { name: 'Valinhos', master_states: { code: 'SP' } } },
];

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const escritas = [];
// UM só handler para o Supabase: um segundo `route` com continue() fura o bloqueio
// (memória "2º page.route com continue() FURA o bloqueio de escritas").
await ctx.route(/supabase\.co\//, (route) => {
  const req = route.request();
  if (req.method() !== 'GET' && req.method() !== 'HEAD') { escritas.push(`${req.method()} ${req.url()}`); return route.abort(); }
  const u = req.url();
  const json = u.includes('/rest/v1/blueprint_studies') ? PLANTAS : u.includes('/rest/v1/regulatory_maps') ? MAPAS : [];
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
});
const page = await ctx.newPage();
const erros = [];
page.on('pageerror', (e) => erros.push('PAGEERROR ' + e));

const falhas = [];
const conferir = (ok, msg) => { console.log(`${ok ? '✅' : '❌'} ${msg}`); if (!ok) falhas.push(msg); };

await page.goto(ALVO);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByText('Planta Torre A').waitFor();
conferir((await page.locator('h1').textContent()) === 'Planta Inteligente', 'aba Plantas: h1 = Planta Inteligente');
await page.screenshot({ path: `${saida}/aba-plantas.png` });

await page.getByRole('tab', { name: 'Mapa Regulatório' }).click();
await page.getByText('Plano Diretor Campinas').waitFor();
conferir((await page.locator('h1').textContent()) === 'Mapa Regulatório', 'aba Mapa: h1 = Mapa Regulatório');
const y = async (loc) => (await loc.boundingBox()).y;
const yH1 = await y(page.locator('h1'));
const yAbas = await y(page.getByRole('tablist'));
const yKpi = await y(page.getByText('Total de mapas'));
const yTabela = await y(page.locator('table'));
conferir(yH1 < yAbas && yAbas < yKpi && yKpi < yTabela, `ordem título(${yH1}) → abas(${yAbas}) → KPIs(${yKpi}) → tabela(${yTabela})`);
// Ritmo §20.1: 24 px do título até as abas.
const fimH1Bloco = await page.locator('h1').evaluate((h) => h.parentElement.parentElement.getBoundingClientRect().bottom);
// Mede o CARD da barra (TabsBar), não o trilho de dentro: o card tem p-2 + borda.
const yCardAbas = await page.getByRole('tablist').evaluate((t) => t.parentElement.getBoundingClientRect().top);
conferir(Math.round(yCardAbas - fimH1Bloco) === 24, `título → abas = ${Math.round(yCardAbas - fimH1Bloco)} px (esperado 24)`);
const fimCard = await page.getByRole('tablist').evaluate((t) => t.parentElement.getBoundingClientRect().bottom);
const yGradeKpi = await page.getByText('Total de mapas').evaluate((el) => el.closest('.grid').getBoundingClientRect().top);
conferir(Math.round(yGradeKpi - fimCard) === 12, `abas → KPIs = ${Math.round(yGradeKpi - fimCard)} px (esperado 12, §20.1)`);
await page.screenshot({ path: `${saida}/aba-mapa.png` });
const botaoMapa = await page.getByRole('button', { name: /Novo mapa/ }).boundingBox();
await page.getByRole('tab', { name: 'Plantas' }).click();
await page.getByText('Planta Torre A').waitFor();
const botaoPlanta = await page.getByRole('button', { name: /Nova planta/ }).boundingBox();
conferir(Math.round(botaoMapa.y) === Math.round(botaoPlanta.y), `botão primário na mesma altura nas duas abas (${Math.round(botaoMapa.y)} / ${Math.round(botaoPlanta.y)})`);
await page.getByRole('tab', { name: 'Mapa Regulatório' }).click();
await page.getByText('Plano Diretor Campinas').waitFor();

await page.reload();
await page.getByText('Plano Diretor Campinas').waitFor();
conferir(true, 'recarregar mantém a aba Mapa Regulatório');

await page.goto(`${ALVO}?sem-permissao`);
await page.getByText('Planta Torre A').waitFor();
conferir((await page.getByRole('tablist').count()) === 0, 'sem permissão: sem barra de abas, mesmo com a aba salva');
await page.screenshot({ path: `${saida}/sem-permissao.png` });

// ── Tabela de zonas: botão de ajuste de largura (§6.1.2) ──
await page.goto(`${ALVO}?zonas`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.locator('table').waitFor();
const largura = (rotulo) => page.locator('th', { hasText: rotulo }).first().evaluate((th) => Math.round(th.getBoundingClientRect().width));
const usoAntes = await largura('Uso permitido');
const zonaAntes = await largura('Zona');
await page.screenshot({ path: `${saida}/zonas-antes.png` });
const botao = page.getByTitle('Ajustar largura das colunas ao conteúdo');
conferir((await botao.count()) === 1, 'tabela de zonas tem o botão de ajuste de largura');
await botao.click();
await page.waitForTimeout(300);
const usoDepois = await largura('Uso permitido');
const zonaDepois = await largura('Zona');
await page.screenshot({ path: `${saida}/zonas-depois.png` });
conferir(usoDepois > usoAntes, `"Uso permitido" (texto longo) alarga: ${usoAntes} → ${usoDepois} px`);
const textoCabe = await page.locator('input[value^="Residencial multifamiliar"]').evaluate((i) => i.scrollWidth <= i.clientWidth + 1);
conferir(textoCabe, 'o uso permitido mais longo cabe inteiro no campo depois do ajuste');
conferir(zonaDepois > 0, `"Zona" continua visível: ${zonaAntes} → ${zonaDepois} px`);
const ancorada = await page.evaluate(() => {
  const th = [...document.querySelectorAll('th')].find((t) => t.textContent.trim() === 'Ações');
  const wrap = th.closest('.overflow-auto');
  return { th: Math.round(th.getBoundingClientRect().right), dentro: Math.round(wrap.getBoundingClientRect().right), rolavel: wrap.scrollWidth > wrap.clientWidth };
});
conferir(ancorada.rolavel || Math.abs(ancorada.th - ancorada.dentro) <= 1, `Ações na borda direita ou tabela rolável (${JSON.stringify(ancorada)})`);
await page.reload();
await page.locator('table').waitFor();
conferir((await largura('Uso permitido')) === usoDepois, 'largura ajustada persiste ao recarregar');

conferir(escritas.length === 0, `nenhuma escrita tentada (${escritas.length})`);
conferir(erros.length === 0, `sem erro de página (${erros.join(' | ')})`);
await browser.close();
process.exit(falhas.length ? 1 : 0);
