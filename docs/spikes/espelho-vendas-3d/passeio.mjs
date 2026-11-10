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

  // 1b. F5: a ficha traz a planta da tipologia; tocar amplia num diálogo (não em tela cheia) e Esc fecha.
  confere((await page.getByTestId('ficha-planta').count()) === 1, 'a ficha mostra a planta da tipologia');
  await page.getByTestId('ficha-planta').click();
  await page.waitForTimeout(400);
  const dialogo = await page.getByRole('dialog').boundingBox();
  const janela = page.viewportSize();
  confere(!!dialogo && dialogo.width <= janela.width && (await page.getByRole('dialog').getByRole('img').count()) === 1, 'tocar na planta abre o diálogo com a imagem');
  const painel = await page.locator('[role=dialog] > div').nth(1).boundingBox();
  confere(!!painel && painel.width < janela.width * 0.9 && painel.height < janela.height, `a planta ampliada não ocupa a tela inteira (${Math.round(painel?.width ?? 0)}×${Math.round(painel?.height ?? 0)} em ${janela.width}×${janela.height})`);
  await page.screenshot({ path: path.join(prints, '11-planta-ampliada.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  confere((await page.getByRole('dialog').count()) === 0 && !!(await fichaAberta(page)), 'Esc fecha a planta e a ficha continua aberta');

  // 1c. F6: a vista da janela — nos andares altos abre a foto; nos baixos o botão fica desligado e diz por quê.
  const botaoDaVista = page.getByRole('button', { name: 'Vista da janela' });
  confere((await botaoDaVista.count()) === 1 && (await botaoDaVista.isEnabled()), 'a ficha de um andar alto tem o botão "Vista da janela" ligado');
  await botaoDaVista.click();
  await page.waitForTimeout(400);
  confere((await page.getByRole('dialog').getByText(/Vista para a serra · 4º ao 19º pavimento/).count()) === 1, 'a vista abre num diálogo com a legenda e a faixa que ela cobre');
  await page.screenshot({ path: path.join(prints, '12-vista-da-janela.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

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

  // 6. O Estoque do corretor (F3): cores do corretor, ficha com as ações, e a contagem dos sem andar.
  page = await abrir(`${URL_DO_HARNESS}?corretor=1`, { width: 1366, height: 900 });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForTimeout(2500);
  const semAndar = await page.getByText(/3 unidades do estoque não têm andar/).count();
  confere(semAndar === 1, 'corretor: a tela conta os 3 imóveis sem andar');
  await page.getByRole('button', { name: /Unidades por andar/ }).click();
  await page.getByRole('button', { name: /^Unidade 101, Torre A, / }).click();
  await page.screenshot({ path: path.join(prints, '08-corretor.png') });
  const temProposta = await page.getByRole('button', { name: 'Fazer proposta' }).count();
  if (temProposta) await page.getByRole('button', { name: 'Fazer proposta' }).click();
  const avisoDoCorretor = await page.getByTestId('aviso').innerText();
  const semAcao = await page.getByText('Esta unidade não está disponível para reserva nem proposta.').count();
  confere(temProposta ? avisoDoCorretor === 'proposta: A101' : semAcao === 1, `corretor: a ficha da 101 ${temProposta ? 'abre a proposta do imóvel A101' : 'diz que a unidade não está disponível'}`);
  await page.getByRole('button', { name: '2D', exact: true }).click();
  confere((await page.locator('canvas').count()) === 0, 'corretor: o seletor volta ao 2D');
  await page.context().close();

  // 7. A aba do investidor (F4): faixa de VGV, troca de obra, ficha com preço e sem ação.
  page = await abrir(`${URL_DO_HARNESS}?investidor=1`, { width: 1366, height: 900 });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForTimeout(2500);
  confere((await page.getByText('VGV vendido').count()) === 1 && (await page.getByText(/R\$\s?6\.840\.000/).count()) === 1, 'investidor: a faixa mostra o VGV vendido da obra');
  await page.getByRole('button', { name: /Unidades por andar/ }).click();
  await page.getByRole('button', { name: /^Unidade 101, / }).click();
  const fichaDoInvestidor = page.locator(FICHA).first();
  const textoDaFicha = await fichaDoInvestidor.innerText();
  confere(/Preço de tabela/.test(textoDaFicha) && (await fichaDoInvestidor.locator('button').count()) === 1, 'investidor: a ficha tem o preço de tabela e nenhuma ação');
  await page.screenshot({ path: path.join(prints, '09-investidor.png') });
  await page.getByRole('button', { name: 'Galeria Altavista' }).click();
  await page.waitForTimeout(1500);
  confere((await page.getByText(/R\$\s?1\.250\.000/).count()) === 1 && (await page.locator(FICHA).count()) === 0, 'investidor: trocar de obra troca os números e fecha a ficha');
  await page.context().close();

  page = await abrir(`${URL_DO_HARNESS}?investidor=1`, { width: 390, height: 844 });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForTimeout(2000);
  confere(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)), 'investidor: no celular (390 px) a página não rola de lado');
  await page.screenshot({ path: path.join(prints, '10-investidor-celular.png'), fullPage: true });
  await page.context().close();
} finally {
  await browser.close();
}

confere(erros.length === 0, `nenhum erro de console nem pageerror (${erros.length})`);
for (const e of erros) console.log(`   ${e}`);
console.log(`prints em ${prints}`);
process.exit(falhas.length > 0 ? 1 : 0);
