/**
 * Mede se cada linha do painel "Componentes" CABE nos 307 px do painel.
 *
 *   npx vite --port 3103
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/componentes/medir.mjs [urlBase]
 *
 * Três perguntas, e nenhuma delas jsdom responde:
 *
 *   1. nenhuma linha ultrapassa a borda do painel (o `overflow` recortaria, e a
 *      peça existiria no DOM sem o usuário nunca a ver — foi assim que a aba
 *      "Versões" sumiu, ver `docs/spikes/abas-editor/`);
 *   2. o painel não ganha rolagem HORIZONTAL, que empurraria a lixeira para fora
 *      da vista;
 *   3. a MEDIDA de cada peça continua legível — é ela que identifica a linha, e
 *      é a primeira coisa que um `truncate` mal posto engoliria.
 *
 * Termina com uma captura, porque medida não substitui olhar.
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
const page = await browser.newPage({ viewport: { width: 700, height: 1600 } });

const erros = [];
page.on('console', (m) => {
  if (m.type() === 'error') erros.push(m.text());
});
page.on('pageerror', (e) => erros.push(String(e)));

await page.goto(`${urlBase}/docs/spikes/componentes/index.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-painel] li button[aria-pressed]');

const medida = await page.evaluate(() => {
  const painel = document.querySelector('[data-painel]');
  const caixa = painel.getBoundingClientRect();
  const linhas = [...painel.querySelectorAll('li')].map((li) => {
    const r = li.getBoundingClientRect();
    const botao = li.querySelector('button[aria-pressed]');
    const lixeira = li.querySelector('button[aria-label^="Excluir"]');
    // A medida é o ÚLTIMO <span> do bloco de texto — o número que identifica a
    // peça. `scrollWidth > clientWidth` nele significa reticências.
    const spans = [...botao.querySelectorAll('span')];
    const medida = spans[spans.length - 1];
    return {
      rotulo: botao.textContent.trim().slice(0, 28),
      direita: Math.round(r.right),
      cortada: r.right > caixa.right + 0.5,
      semLixeira: !lixeira || lixeira.getBoundingClientRect().right > caixa.right + 0.5,
      medida: medida.textContent.trim(),
      medidaTruncada: medida.scrollWidth > medida.clientWidth + 0.5,
    };
  });
  return {
    limite: Math.round(caixa.right),
    largura: Math.round(caixa.width),
    rolagemHorizontal: painel.scrollWidth > painel.clientWidth + 0.5,
    grupos: [...painel.querySelectorAll('section button[aria-expanded]')].map((b) =>
      b.textContent.trim(),
    ),
    linhas,
  };
});

console.log(`painel: ${medida.largura} px (borda em ${medida.limite})`);
console.log(`rolagem horizontal: ${medida.rolagemHorizontal ? '✖ SIM' : '✓ não'}`);
console.log(`grupos: ${medida.grupos.join(' | ')}`);
console.log(`linhas: ${medida.linhas.length}`);
for (const l of medida.linhas) {
  const marca = l.cortada || l.semLixeira || l.medidaTruncada ? '✖' : '✓';
  console.log(
    `  ${marca} ${l.rotulo.padEnd(30)} medida "${l.medida}"` +
      `${l.medidaTruncada ? ' ← TRUNCADA' : ''}${l.cortada ? ' ← CORTADA' : ''}` +
      `${l.semLixeira ? ' ← LIXEIRA FORA' : ''}`,
  );
}

await page.screenshot({ path: 'docs/spikes/componentes/painel.png', fullPage: true });
await browser.close();

if (erros.length) console.log(`\nerros no console:\n  ${erros.join('\n  ')}`);

const ok =
  medida.linhas.length > 0 &&
  !medida.rolagemHorizontal &&
  medida.linhas.every((l) => !l.cortada && !l.semLixeira && !l.medidaTruncada) &&
  erros.length === 0;

console.log(`\n${ok ? '✓ painel cabe' : '✖ reprovou'}`);
process.exit(ok ? 0 : 1);
