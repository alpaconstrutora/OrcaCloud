/**
 * Clica a parede SUL de um retângulo 4000×3000 mm, digita "5,00" no painel e
 * confere que a parede fecha no valor digitado, arrastando a vizinha (canto
 * fica fechado, 1 ambiente, área nova) — com ponteiro e teclado de verdade em
 * Chrome, não simulado.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/comprimento-editavel/passeio.mjs [urlBase]
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
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

const urlBase = process.argv[2] ?? 'http://localhost:3102';
const aqui = path.dirname(fileURLToPath(import.meta.url));

const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
});
const page = await browser.newPage({
  viewport: { width: 1200, height: 800 },
  deviceScaleFactor: 2,
});

const erros = [];
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(String(e)));

await page.goto(`${urlBase}/docs/spikes/comprimento-editavel/index.html`, {
  waitUntil: 'networkidle',
});
await page.waitForTimeout(400);

const caixa = await page.locator('canvas').boundingBox();
// Vista inicial conhecida por construção: 0,05 px/mm; origem a 60 px da borda
// esquerda e a 60 px do RODAPÉ (Y do modelo aponta para cima).
const ESCALA = 0.05;
const dx = 60;
const dy = caixa.height - 60;
const tela = (p) => ({ x: caixa.x + p.x * ESCALA + dx, y: caixa.y - p.y * ESCALA + dy });

// Clica no MEIO da parede sul (eixo em y=0, de x=0 a x=4000).
const meio = tela({ x: 2000, y: 0 });
await page.mouse.click(meio.x, meio.y);
await page.waitForTimeout(150);

const campo = page.getByLabel(/comprimento da parede/i);
const antes = await campo.inputValue();

await page.screenshot({ path: path.join(aqui, 'saida-antes.png') });

await campo.fill('5,00');
await campo.press('Enter');
await page.waitForTimeout(200);

await page.screenshot({ path: path.join(aqui, 'saida-depois.png') });

const dump = JSON.parse(await page.locator('#dump').textContent());

const falhas = [];
if (antes !== '4,00') falhas.push(`comprimento antes de editar: "${antes}", esperado "4,00"`);

const sul = dump.paredes.find((w) => w.a.x === 0 && w.a.y === 0);
if (!sul) falhas.push('parede sul não encontrada no dump');
else if (sul.b.x !== 5000 || sul.b.y !== 0) {
  falhas.push(`ponta da parede sul ficou em ${JSON.stringify(sul.b)}, esperado {5000,0}`);
}

const leste = dump.paredes.find((w) => w.b.x === 4000 && w.b.y === 3000);
if (!leste) falhas.push('parede leste não encontrada no dump');
else if (leste.a.x !== 5000 || leste.a.y !== 0) {
  falhas.push(
    `vizinha (leste) não acompanhou: a=${JSON.stringify(leste.a)}, esperado {5000,0} — canto abriu`,
  );
}

if (dump.ambientes.length !== 1) {
  falhas.push(`ambientes: ${dump.ambientes.length}, esperado 1 (o canto abriu e o ambiente sumiu)`);
} else if (dump.ambientes[0].areaMm2 !== 13_500_000) {
  falhas.push(`área ${dump.ambientes[0].areaMm2}, esperado 13.500.000 (trapézio)`);
}

await browser.close();

console.log('antes:', antes);
console.log('dump:', JSON.stringify(dump, null, 1));
console.log(erros.length ? `ERROS NO CONSOLE:\n${erros.join('\n')}` : 'sem erro de console');
console.log(falhas.length ? `FALHAS:\n- ${falhas.join('\n- ')}` : 'CONFERÊNCIA OK');
console.log('prints em docs/spikes/comprimento-editavel/');
process.exitCode = falhas.length || erros.length ? 1 : 0;
