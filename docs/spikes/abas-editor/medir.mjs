/**
 * Mede se TODAS as abas cabem dentro do painel.
 *
 * É a única forma de pegar este defeito: a aba recortada existe no DOM, tem
 * `role="tab"`, é encontrável por `getByRole` — e mesmo assim o usuário não a vê.
 * O que denuncia é o retângulo, e jsdom não tem retângulo.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/abas-editor/medir.mjs [urlBase]
 *
 * Roda os dois modos e EXIGE que o antigo reprove — medição que aprova tudo não
 * mede nada.
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
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });

async function medir(query) {
  await page.goto(`${urlBase}/docs/spikes/abas-editor/index.html${query}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('[data-aba]');

  return page.evaluate(() => {
    const painel = document.querySelector('[data-painel]').getBoundingClientRect();
    return [...document.querySelectorAll('[data-aba]')].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        rotulo: el.getAttribute('title'),
        direita: Math.round(r.right),
        limite: Math.round(painel.right),
        // `right` além do limite = a aba está fora da área visível do painel,
        // que tem overflow-hidden. É literalmente o que o usuário não vê.
        cortada: r.right > painel.right + 0.5,
      };
    });
  });
}

const antes = await medir('?antes=1');
const depois = await medir('');
await browser.close();

const mostrar = (titulo, linhas) => {
  console.log(`\n${titulo}`);
  for (const l of linhas) {
    console.log(
      `  ${l.cortada ? '✖ CORTADA' : '✓        '}  ${l.rotulo.padEnd(14)} ` +
        `direita ${String(l.direita).padStart(4)} / limite ${l.limite}`,
    );
  }
};

mostrar('ANTES (flex-1, w-80):', antes);
mostrar('DEPOIS (grid-cols-4, w-96):', depois);

const antesReprova = antes.some((l) => l.cortada);
const depoisAprova = depois.every((l) => !l.cortada);

console.log(
  `\nantes reprova: ${antesReprova ? 'sim' : 'NÃO — a medição não discrimina'}` +
    `\ndepois aprova: ${depoisAprova ? 'sim' : 'NÃO'}`,
);

process.exit(antesReprova && depoisAprova ? 0 : 1);
