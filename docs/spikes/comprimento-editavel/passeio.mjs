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

// ⚠️ CONTRATO NOVO desde 24/08/2026 — pedido do usuário: "quando alterar a
// medida de um lado, deve ser alterado automaticamente do outro lado também, a
// fim de manter a mesma geometria".
//
// Até então a vizinha acompanhava só o CANTO e o retângulo virava trapézio de
// 13.500.000 mm² — era isto que estas linhas conferiam, e o que passou a estar
// errado. Agora o LADO inteiro anda: o retângulo continua retângulo.
const leste = dump.paredes.find((w) => w.a.x === 5000 && w.a.y === 0);
if (!leste) {
  falhas.push('parede leste não encontrada partindo de {5000,0} — o canto não acompanhou');
} else if (leste.b.x !== 5000 || leste.b.y !== 3000) {
  falhas.push(
    `lado leste ficou oblíquo: b=${JSON.stringify(leste.b)}, esperado {5000,3000} — ` +
      'o lado não foi transladado, só o canto',
  );
}

// A parede NORTE tem de ter o mesmo comprimento novo da SUL — é o "outro lado"
// do pedido. Sem isto, o retângulo poderia estar fechado e ainda assim torto.
const norte = dump.paredes.find((w) => w.a.x === 5000 && w.a.y === 3000);
if (!norte) falhas.push('parede norte não encontrada partindo de {5000,3000}');
else if (norte.b.x !== 0 || norte.b.y !== 3000) {
  falhas.push(`parede norte ficou em ${JSON.stringify(norte.b)}, esperado {0,3000}`);
}

if (dump.ambientes.length !== 1) {
  falhas.push(`ambientes: ${dump.ambientes.length}, esperado 1`);
} else if (dump.ambientes[0].areaMm2 !== 15_000_000) {
  falhas.push(
    `área ${dump.ambientes[0].areaMm2}, esperado 15.000.000 (retângulo 5000×3000). ` +
      '13.500.000 = o trapézio antigo, ou seja o vínculo do lado oposto não rodou',
  );
}

await browser.close();

console.log('antes:', antes);
console.log('dump:', JSON.stringify(dump, null, 1));
console.log(erros.length ? `ERROS NO CONSOLE:\n${erros.join('\n')}` : 'sem erro de console');
console.log(falhas.length ? `FALHAS:\n- ${falhas.join('\n- ')}` : 'CONFERÊNCIA OK');
console.log('prints em docs/spikes/comprimento-editavel/');
process.exitCode = falhas.length || erros.length ? 1 : 0;
