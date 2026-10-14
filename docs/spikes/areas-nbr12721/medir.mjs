/**
 * Mede a tela "Áreas NBR 12721" num Chrome real. É um PORTÃO (exit ≠ 0 reprova).
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/areas-nbr12721/medir.mjs [urlBase] [pastaDeSaida]
 *
 * O que ele afirma, em cada uma das sete abas:
 *  1. nenhuma rolagem horizontal da página nem de tabela na largura útil do app (1.340 px);
 *  2. nenhum erro de página;
 * e no fluxo:
 *  3. "Aplicar sugestões" zera a contagem da aba Classificação;
 *  4. classificar o Hall como "descoberta 0,6" pelo drawer muda o coeficiente do Quadro II
 *     (o número que a tela mostra ANTES ≠ DEPOIS);
 *  5. as frações fecham 1.000 milésimos.
 * Salva um PNG por aba.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

async function loadChromium() {
  const pick = (m) => m.chromium ?? m.default?.chromium;
  try {
    const local = await import('playwright-core');
    if (pick(local)) return pick(local);
  } catch {
    /* segue para o caminho por env */
  }
  const base = process.env.PLAYWRIGHT_CORE;
  if (!base) throw new Error('defina PLAYWRIGHT_CORE');
  return pick(await import(pathToFileURL(path.join(base, 'index.js')).href));
}

const urlBase = process.argv[2] ?? 'http://127.0.0.1:3111';
const saida = process.argv[3] ?? 'C:/tmp';
fs.mkdirSync(saida, { recursive: true });

const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1340, height: 1000 }, deviceScaleFactor: 1 });
const erros = [];
page.on('pageerror', (e) => erros.push('PAGEERROR ' + e));
page.on('console', (m) => {
  if (m.type() === 'error') erros.push('CONSOLE ' + m.text());
});
const falhas = [];
const conferir = (ok, msg) => {
  console.log(`${ok ? '✅' : '❌'} ${msg}`);
  if (!ok) falhas.push(msg);
};

await page.goto(`${urlBase}/docs/spikes/areas-nbr12721/index.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="tela-areas-nbr12721"]', { timeout: 30000 });

const transbordo = () =>
  page.evaluate(() => {
    const doc = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const tabelas = [...document.querySelectorAll('table')].map((t) => {
      const caixa = t.parentElement;
      return caixa ? caixa.scrollWidth - caixa.clientWidth : 0;
    });
    return { doc, tabela: Math.max(0, ...tabelas) };
  });
const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
// Nome exato + o contador opcional ('Classificação 3') — 'Quadro I' não pode casar 'Quadro II'.
const aba = (nome) => page.getByRole('tab', { name: new RegExp(`^${escapar(nome)}\\s*\\d*$`) });

const coefDo101 = async () => {
  await aba('Quadro II').click();
  await page.waitForTimeout(200);
  const linha = page.locator('tbody tr', { hasText: /^101/ }).first();
  return (await linha.innerText()).replace(/\s+/g, ' ');
};

// 1-2: cada aba, fotografada e medida.
for (const nome of ['Classificação', 'Quadro I', 'Quadro II', 'Quadro IV-B', 'Frações', 'Pendências', 'Hipóteses']) {
  await aba(nome).click();
  await page.waitForTimeout(250);
  const t = await transbordo();
  conferir(t.doc <= 0, `${nome}: página sem rolagem horizontal (${t.doc} px)`);
  conferir(t.tabela <= 0, `${nome}: tabela sem rolagem horizontal (${t.tabela} px)`);
  await page.screenshot({ path: path.join(saida, `nbr12721-${nome.replace(/\W+/g, '-').toLowerCase()}.png`), fullPage: true });
}

// 3: aplicar sugestões.
await aba('Classificação').click();
const antesDasSugestoes = await aba('Classificação').innerText();
await aba('Pendências').click();
const pendenciaSugestao = await page.locator('tbody').innerText();
conferir(pendenciaSugestao.includes(`${antesDasSugestoes.replace(/\D+/g, '')} ambiente(s) entraram pela sugestão`), `Pendências conta os mesmos ambientes da aba Classificação (${antesDasSugestoes.replace(/\s+/g, ' ')})`);
await aba('Classificação').click();
await page.getByRole('button', { name: /Aplicar sugestões/ }).click();
await page.waitForTimeout(250);
const depoisDasSugestoes = await aba('Classificação').innerText();
conferir(/\d/.test(antesDasSugestoes) && !/\d/.test(depoisDasSugestoes), `"Aplicar sugestões" zera a contagem da aba ("${antesDasSugestoes}" → "${depoisDasSugestoes}")`);

// 4: classificar o Hall pelo drawer muda o coeficiente do 101 no Quadro II.
const antes = await coefDo101();
await aba('Classificação').click();
await page.locator('tbody tr', { hasText: 'Hall' }).first().getByRole('button', { name: 'Classificar' }).click();
await page.getByLabel('Cobertura').selectOption('DESCOBERTA');
await page.getByLabel('Coeficiente de equivalência').fill('0,6');
await page.waitForTimeout(600); // a animação de entrada do Sheet — a foto sem ela sai sem o drawer
await page.screenshot({ path: path.join(saida, 'nbr12721-drawer.png') });
await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
await page.waitForTimeout(300);
const depois = await coefDo101();
conferir(antes !== depois, `classificar o Hall muda a linha do 101 no Quadro II\n     antes:  ${antes}\n     depois: ${depois}`);

// 5: frações fecham 1000.
await aba('Frações').click();
const totalFracoes = await page.locator('tbody tr').last().innerText();
conferir(/1\.000,0000/.test(totalFracoes), `frações fecham 1.000 milésimos (${totalFracoes.replace(/\s+/g, ' ')})`);

conferir(erros.length === 0, `sem erro de página${erros.length ? ':\n     ' + erros.join('\n     ') : ''}`);
await browser.close();
console.log(falhas.length ? `\n❌ ${falhas.length} falha(s)` : '\n✅ tudo conferido');
process.exit(falhas.length ? 1 : 0);
