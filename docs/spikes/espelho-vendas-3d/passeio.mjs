/**
 * Passeio pelo harness do Espelho de Vendas 3D.
 *
 *   npx vite --port 3147 --strictPort        # servidor NOVO, na frente
 *   PLAYWRIGHT_CORE=/c/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/espelho-vendas-3d/passeio.mjs [urlBase] [pastaDosPrints]
 *
 * É a rede de segurança do `@ts-nocheck` de `components/espelho3d/Espelho3DCena.tsx`: falha o exit em QUALQUER
 * `pageerror` ou erro de console, e confere o que só existe no navegador — o toque numa unidade abre a ficha
 * (prova que há prédio debaixo do ponteiro, não só um canvas montado), arrastar gira sem trocar a seleção, a
 * tela de celular não rola de lado e, sem WebGL, a lista assume.
 *
 * ⚠️ SERVIDOR NOVO: o dev server serve o que tinha em memória quando subiu (ver `docs/spikes/blueprint-3d`).
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

async function loadChromium() {
  const pick = (m) => m.chromium ?? m.default?.chromium;
  try {
    const local = await import('playwright-core');
    if (pick(local)) return pick(local);
  } catch {
    /* segue */
  }
  const base = process.env.PLAYWRIGHT_CORE;
  if (!base) throw new Error('defina PLAYWRIGHT_CORE ou instale playwright-core');
  return pick(await import(pathToFileURL(path.join(base, 'index.js')).href));
}

const urlBase = process.argv[2] ?? 'http://localhost:3147';
const prints = process.argv[3] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'espelho3d-'));
fs.mkdirSync(prints, { recursive: true });
const URL_DO_HARNESS = `${urlBase}/docs/spikes/espelho-vendas-3d/index.html`;
const FICHA = 'section[aria-label^="Ficha da unidade"]';

const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const erros = [];
const falhas = [];
const confere = (ok, frase) => {
  console.log(`${ok ? '✅' : '❌'} ${frase}`);
  if (!ok) falhas.push(frase);
};
async function abrir(url, viewport) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && erros.push(`[console] ${m.text()}`));
  page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
  await page.goto(url, { waitUntil: 'networkidle' });
  return page;
}
const fichaAberta = (page) => page.locator(FICHA).first().getAttribute('aria-label', { timeout: 500 }).catch(() => null);

try {
  // 1. Computador: o desenho monta e o toque acha uma unidade.
  let page = await abrir(URL_DO_HARNESS, { width: 1366, height: 900 });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(prints, '01-computador.png') });
  const caixa = await page.locator('canvas').boundingBox();
  let ficha = null;
  for (const [fx, fy] of [[0.5, 0.5], [0.42, 0.45], [0.58, 0.55], [0.35, 0.6], [0.65, 0.5]]) {
    await page.mouse.click(caixa.x + caixa.width * fx, caixa.y + caixa.height * fy);
    await page.waitForTimeout(400);
    ficha = await fichaAberta(page);
    if (ficha) break;
  }
  confere(!!ficha, `tocar no desenho abre a ficha de uma unidade (${ficha ?? 'nenhuma'})`);
  await page.screenshot({ path: path.join(prints, '02-ficha.png') });

  // 2. Arrastar gira a câmera e NÃO troca nem fecha a ficha.
  await page.mouse.move(caixa.x + caixa.width * 0.5, caixa.y + caixa.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(caixa.x + caixa.width * 0.75, caixa.y + caixa.height * 0.4, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  confere((await fichaAberta(page)) === ficha, 'arrastar para girar não troca a unidade escolhida');
  await page.screenshot({ path: path.join(prints, '03-girado.png') });

  // 3. Destacar e a lista por andar.
  await page.getByRole('radio', { name: /Vendidas/ }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(prints, '04-destaque.png') });
  await page.getByRole('radio', { name: /Vendidas/ }).click();
  await page.getByRole('button', { name: /Unidades por andar/ }).click();
  const naLista = await page.locator('#espelho3d-lista button').count();
  confere(naLista > 0, `a lista por andar abre com as unidades (${naLista})`);
  await page.locator('#espelho3d-lista button').first().click();
  const pelaLista = await fichaAberta(page);
  confere(!!pelaLista && pelaLista !== ficha, `escolher na lista abre a ficha dela (${pelaLista ?? 'nenhuma'})`);
  await page.screenshot({ path: path.join(prints, '05-lista.png'), fullPage: true });
  await page.context().close();

  // 4. Celular: o desenho cabe e a página não rola de lado.
  page = await abrir(URL_DO_HARNESS, { width: 390, height: 844 });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForTimeout(2500);
  const rolaDeLado = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  confere(!rolaDeLado, 'no celular (390 px) a página não rola de lado');
  await page.screenshot({ path: path.join(prints, '06-celular.png'), fullPage: true });
  await page.context().close();

  // 5. Sem WebGL: nenhum canvas, o aviso e a lista já aberta.
  page = await abrir(`${URL_DO_HARNESS}?sem3d=1`, { width: 1366, height: 900 });
  await page.waitForTimeout(1200);
  const semCanvas = (await page.locator('canvas').count()) === 0;
  const aviso = await page.getByRole('status').innerText().catch(() => '');
  const abertas = await page.locator('#espelho3d-lista button').count();
  confere(semCanvas && /não desenha 3D/.test(aviso) && abertas > 0, `sem WebGL: sem canvas, com o aviso e a lista aberta (${abertas} unidades)`);
  await page.screenshot({ path: path.join(prints, '07-sem-webgl.png') });
  await page.context().close();
} finally {
  await browser.close();
}

confere(erros.length === 0, `nenhum erro de console nem pageerror (${erros.length})`);
for (const e of erros) console.log(`   ${e}`);
console.log(`prints em ${prints}`);
process.exit(falhas.length > 0 ? 1 : 0);
