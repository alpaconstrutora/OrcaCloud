/**
 * Arrasta uma ponta de parede num navegador de verdade e confere onde ela parou.
 *
 * Três medições, e a terceira é a que importa:
 *   1. arrastar move a ponta                         (a função existe)
 *   2. com orto LIGADO, o arraste enviesado sai reto  (a trava funciona)
 *   3. com orto DESLIGADO, o mesmo arraste sai torto  (a trava DISCRIMINA)
 *
 * Sem a terceira, a segunda não prova nada: um arraste que já fosse reto
 * passaria com ou sem trava.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/arrastar-ponta/medir.mjs [urlBase]
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

const urlBase = process.argv[2] ?? 'http://localhost:3103';

const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
});
const ALTURA = 700;
const page = await browser.newPage({ viewport: { width: 1000, height: ALTURA } });

/**
 * @param orto  liga a trava
 * @param desvioY  quantos pixels o arraste sobe — o "erro de mão" do usuário
 */
async function arrastar(orto, desvioY) {
  await page.goto(`${urlBase}/docs/spikes/arrastar-ponta/index.html?orto=${orto ? 1 : 0}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForFunction(() => Array.isArray(window.__paredes));

  // A parede de baixo, de (0,0) a (6000,0). Vamos puxar a ponta B.
  const alvo = await page.evaluate(() => {
    const w = window.__paredes.find((p) => p.a.y === 0 && p.b.y === 0);
    window.__selecionar(w.id);
    return w;
  });

  // A MESMA matemática de `paraTela`: escala inicial 0,05 px/mm, margem de 60 px
  // e a ORIGEM NO RODAPÉ — o Y do modelo cresce para cima, o da tela para baixo.
  //
  // ⚠️ Esta conta somava Y direto, como o canvas fazia antes de a inversão ser
  // corrigida (09/08/2026). Enquanto ficou assim, o script mirava 580 px acima
  // da alça, não pegava nada e relatava "o gesto não move nada" — um harness que
  // sempre reprova é um harness que ninguém roda.
  const paraTela = (p) => ({ x: 60 + p.x * 0.05, y: ALTURA - 60 - p.y * 0.05 });
  const de = paraTela(alvo.b);

  await page.waitForTimeout(120); // deixa a alça ser desenhada

  await page.mouse.move(de.x, de.y);
  await page.mouse.down();
  // Puxa 60 px para a direita e `desvioY` para cima — o erro que a trava corrige.
  await page.mouse.move(de.x + 60, de.y - desvioY, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(120);

  return page.evaluate(
    (id) => {
      const w = window.__paredes.find((p) => p.id === id) ?? window.__paredes.at(-1);
      return { a: w.a, b: w.b };
    },
    alvo.id,
  );
}

const inicial = { a: { x: 0, y: 0 }, b: { x: 6000, y: 0 } };

const comOrto = await arrastar(true, 25);
const semOrto = await arrastar(false, 25);
await browser.close();

const moveu = (r) => r.b.x !== inicial.b.x || r.b.y !== inicial.b.y;
const reto = (r) => r.a.y === r.b.y;

console.log(`\ninicial:            a=(${inicial.a.x},${inicial.a.y})  b=(${inicial.b.x},${inicial.b.y})`);
console.log(`COM orto (desvio):  a=(${comOrto.a.x},${comOrto.a.y})  b=(${comOrto.b.x},${comOrto.b.y})  ${reto(comOrto) ? '✓ reto' : '✖ TORTO'}`);
console.log(`SEM orto (desvio):  a=(${semOrto.a.x},${semOrto.a.y})  b=(${semOrto.b.x},${semOrto.b.y})  ${reto(semOrto) ? '✖ reto (não discrimina)' : '✓ torto, como esperado'}`);

const ok = moveu(comOrto) && reto(comOrto) && !reto(semOrto);
console.log(
  `\narrastou:        ${moveu(comOrto) ? 'sim' : 'NÃO — o gesto não move nada'}` +
    `\ntrava funciona:  ${reto(comOrto) ? 'sim' : 'NÃO'}` +
    `\ntrava discrimina: ${!reto(semOrto) ? 'sim' : 'NÃO — o teste aprovaria os dois'}`,
);

process.exit(ok ? 0 : 1);
