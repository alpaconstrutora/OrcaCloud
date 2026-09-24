/**
 * Mede a ALTURA do ribbon nos dois arranjos, e recolhido.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/ribbon-altura/medir.mjs [urlBase]
 *
 * Exige que o arranjo ANTIGO reprove (painel em duas fileiras) — medição que
 * aprova tudo não mede nada.
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

const urlBase = process.argv[2] ?? 'http://localhost:3100';
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
// A MESMA janela do print do usuário.
const page = await browser.newPage({ viewport: { width: 1660, height: 780 } });

/** Altura do ribbon e em quantas fileiras o painel da aba quebrou. */
async function medir(query) {
  await page.goto(`${urlBase}/docs/spikes/ribbon-altura/index.html${query}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[role="toolbar"]');
  return page.evaluate(() => {
    const tb = document.querySelector('[role="toolbar"]');
    const painel = tb.lastElementChild;
    const grupos = painel ? [...painel.querySelectorAll('[role="group"]')] : [];
    return {
      altura: Math.round(tb.getBoundingClientRect().height),
      fileiras: new Set(grupos.map((g) => Math.round(g.getBoundingClientRect().top))).size,
      grupos: grupos.map((g) => g.getAttribute('aria-label')),
    };
  });
}

const antes = await medir('?antes=1');
const depois = await medir('');
// E recolhido, pelo botão.
await page.getByRole('button', { name: /recolher a faixa/i }).click();
await page.waitForTimeout(200);
const recolhido = await page.evaluate(() =>
  Math.round(document.querySelector('[role="toolbar"]').getBoundingClientRect().height),
);
await browser.close();

console.log(`ANTES     ${antes.altura} px · painel em ${antes.fileiras} fileira(s) · grupos: ${antes.grupos.join(', ')}`);
console.log(`DEPOIS    ${depois.altura} px · painel em ${depois.fileiras} fileira(s) · grupos: ${depois.grupos.join(', ')}`);
console.log(`RECOLHIDO ${recolhido} px`);
console.log(`ganho: ${antes.altura - depois.altura} px agrupando · ${antes.altura - recolhido} px recolhido`);

// O harness só vale se reprovar o arranjo velho.
if (antes.fileiras < 2) {
  console.error('✖ o arranjo ANTIGO coube numa fileira — a medição não discrimina nada');
  process.exit(1);
}
if (depois.fileiras !== 1 || depois.altura >= antes.altura || recolhido >= depois.altura) {
  console.error('✖ o arranjo novo não melhorou');
  process.exit(1);
}
console.log('✓ arranjo antigo reprovado, novo aprovado');
