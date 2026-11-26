/**
 * PORTÃO DO PAINEL DO PLATÔ NO 3D (25/11/2026) — o card "Bulldozed area" do reel da Hektar, e a escolha do usuário:
 * completo no painel lateral (padrão) ou compacto no rodapé.
 *
 * Abre o terreno grande com o platô editável e o painel (`?plato=1&editar=1&painel=1`):
 *   1. o card aparece à ESQUERDA e o selo do rodapé não;
 *   2. "Recolher para o rodapé" → o selo aparece com "Painel"; "Painel" → o card volta;
 *   3. o deslizante de cota: arrastar → a cota gravada muda UMA vez (ao soltar) e os volumes do card mudam;
 *   4. o card não deixa o arraste girar a câmera (as alças do platô ficam no lugar).
 * Sai com 1 se falhar.
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/terreno-grande-3d/painel.mjs [urlBase] [pastaDeSaida]
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

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

const urlBase = process.argv[2] ?? 'http://localhost:3201';
const saida = process.argv[3] ?? 'C:/tmp';
const browser = await (await loadChromium()).launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const erros = [];
page.on('pageerror', (e) => erros.push('PAGEERROR ' + e));
await page.goto(`${urlBase}/docs/spikes/terreno-grande-3d/index.html?curvas=1&estilo=MAQUETE&plato=1&editar=1&painel=1`);
await page.waitForSelector('canvas');
await page.waitForTimeout(Number(process.env.ESPERA ?? 5000));
const caixa = await page.locator('canvas').first().boundingBox();
const falhas = [];
const estado = () => page.evaluate(() => ({ plato: window.__plato3d, confirmacoes: window.__confirmacoes ?? 0, modo: window.__modoDoPainel, tela: window.__platoNaTela }));

// 1. o card à esquerda, sem o selo.
const card = page.getByTestId('painel-do-plato');
if (!(await card.isVisible())) falhas.push('o card do platô não apareceu (modo COMPLETO)');
const bb = await card.boundingBox();
if (bb && bb.x > caixa.x + caixa.width / 3) falhas.push(`o card não está à esquerda (x = ${Math.round(bb.x - caixa.x)} px)`);
if (await page.getByTestId('saldo-do-plato').count()) falhas.push('o selo do rodapé apareceu junto com o card');
await page.screenshot({ path: `${saida}/painel-completo.png`, clip: caixa });

// 2. Recolher → selo com "Painel" → card de novo.
await page.getByRole('button', { name: 'Recolher para o rodapé' }).click();
await page.waitForTimeout(400);
if ((await estado()).modo !== 'COMPACTO') falhas.push('Recolher não passou para o compacto');
if (!(await page.getByTestId('saldo-do-plato').isVisible())) falhas.push('no compacto, o selo do rodapé não apareceu');
if (await page.getByTestId('painel-do-plato').count()) falhas.push('no compacto, o card continuou');
await page.screenshot({ path: `${saida}/painel-compacto.png`, clip: caixa });
await page.getByRole('button', { name: 'Abrir painel' }).click();
await page.waitForTimeout(400);
if (!(await page.getByTestId('painel-do-plato').isVisible())) falhas.push('"Painel" não reabriu o card');

// 3. o deslizante: a cota grava UMA vez ao soltar e os volumes mudam.
{
  const antes = await estado();
  const corteAntes = await page.getByTestId('painel-plato-corte').textContent();
  const faixa = page.getByLabel('Cota do platô — deslizante');
  const fb = await faixa.boundingBox();
  const telaAntes = antes.tela;
  await page.mouse.move(fb.x + fb.width * 0.43, fb.y + fb.height / 2);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) {
    await page.mouse.move(fb.x + fb.width * (0.43 + 0.04 * k), fb.y + fb.height / 2);
    await page.waitForTimeout(60);
  }
  await page.mouse.up();
  await page.waitForTimeout(900);
  const depois = await estado();
  const corteDepois = await page.getByTestId('painel-plato-corte').textContent();
  console.log(JSON.stringify({ cotaAntes: antes.plato.cotaM, cotaDepois: depois.plato.cotaM, confirmacoes: [antes.confirmacoes, depois.confirmacoes], corteAntes, corteDepois }));
  if (!(depois.plato.cotaM > antes.plato.cotaM)) falhas.push(`deslizante: a cota não subiu (${antes.plato.cotaM} → ${depois.plato.cotaM})`);
  if (depois.confirmacoes !== antes.confirmacoes + 1) falhas.push(`deslizante: ${depois.confirmacoes - antes.confirmacoes} gravações (esperava 1)`);
  if (corteDepois === corteAntes) falhas.push('deslizante: os volumes do card não mudaram');
  // 4. a câmera não girou com o arraste no card (as alças do platô no mesmo lugar, a menos da cota).
  const andou = Math.max(...telaAntes.cantos.map((c, i) => Math.abs(c.x - depois.tela.cantos[i].x)));
  if (andou > 3) falhas.push(`o arraste no card girou a câmera (alças andaram ${andou.toFixed(0)} px na horizontal)`);
  await page.screenshot({ path: `${saida}/painel-depois-da-cota.png`, clip: caixa });
}

// 5. (PR 2) balanço de massa: Corte → aterro 0; volta a Corte e aterro → aterro de novo.
// Antes, a cota volta a 866 m pelo campo (o passo 3 subiu o platô acima de tudo: corte e aterro já eram 0).
{
  const campo = page.getByLabel('Cota do platô (m)');
  await campo.fill('866');
  await campo.press('Enter');
  await page.waitForTimeout(900);
  const aterroNivelando = await page.getByTestId('painel-plato-aterro').textContent();
  if (/^0 m³$/.test(aterroNivelando.trim())) falhas.push('a 866 m o caso não tem aterro — o passo 5 não provaria nada');
  const grupo = page.getByRole('radiogroup', { name: 'Balanço de massa' });
  await grupo.getByRole('radio', { name: 'Corte', exact: true }).click();
  await page.waitForTimeout(900);
  const aterro = await page.getByTestId('painel-plato-aterro').textContent();
  const corte = await page.getByTestId('painel-plato-corte').textContent();
  console.log(JSON.stringify({ modoCorte: { corte, aterro } }));
  if (!/^0 m³$/.test(aterro.trim())) falhas.push(`Corte: o aterro devia ser 0 (veio ${aterro})`);
  if (/^0 m³$/.test(corte.trim())) falhas.push('Corte: o corte não podia ser 0 a 866 m');
  if (!(await page.getByRole('button', { name: 'Equilíbrio' }).isDisabled())) falhas.push('Corte: o Equilíbrio devia estar desligado');
  await page.screenshot({ path: `${saida}/painel-modo-corte.png`, clip: caixa });
  await grupo.getByRole('radio', { name: 'Corte e aterro' }).click();
  await page.waitForTimeout(600);
}
// 6. (PR 2) talude Suave: os volumes mudam e aparece a largura.
{
  const antes = await page.getByTestId('painel-plato-corte').textContent();
  await page.getByRole('radiogroup', { name: 'Forma do talude' }).getByRole('radio', { name: 'Suave' }).click();
  await page.waitForTimeout(900);
  const depois = await page.getByTestId('painel-plato-corte').textContent();
  console.log(JSON.stringify({ suave: { antes, depois } }));
  if (!(await page.getByLabel('Largura do talude (m)').isVisible())) falhas.push('Suave: a largura do talude não apareceu');
  if (depois === antes) falhas.push('Suave: os volumes não mudaram');
  await page.screenshot({ path: `${saida}/painel-suave.png`, clip: caixa });
}

if (erros.length) falhas.push(...erros);
console.log(falhas.length ? `❌ ${falhas.join(' · ')}` : '✅ card à esquerda; Recolher/Painel trocam o modo; deslizante grava uma vez e refaz os volumes; câmera parada');
await browser.close();
process.exit(falhas.length ? 1 : 0);
