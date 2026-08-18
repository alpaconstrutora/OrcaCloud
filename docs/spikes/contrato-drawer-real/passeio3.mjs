/**
 * Prova visual: depois de escolher a organização no seletor interno, o campo
 * Empreendimento mostra uma legenda "Mostrando empreendimentos de: <org>" —
 * antes não havia nenhuma indicação de qual organização filtrava a lista.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/contrato-drawer-real/passeio3.mjs [urlBase]
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

async function loadChromium() {
  const pick = (m) => m.chromium ?? m.default?.chromium;
  try {
    const local = await import('playwright-core');
    if (pick(local)) return pick(local);
  } catch { /* segue para env */ }
  const base = process.env.PLAYWRIGHT_CORE;
  if (!base) throw new Error('defina PLAYWRIGHT_CORE');
  return pick(await import(pathToFileURL(path.join(base, 'index.js')).href));
}

const urlBase = process.argv[2] ?? 'http://localhost:3103';
const outDir = process.argv[3] ?? '.';
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(`${urlBase}/docs/spikes/contrato-drawer-real/index2.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=Organização *', { timeout: 15000 });
const legendaAntes = await page.locator('text=Mostrando empreendimentos de:').isVisible().catch(() => false);

await page.selectOption('select:near(:text("Organização"))', { label: 'Organização Teste' });
await page.waitForTimeout(400);
const legendaDepois = await page.locator('text=Mostrando empreendimentos de:').isVisible().catch(() => false);
const textoLegenda = legendaDepois ? await page.locator('text=Mostrando empreendimentos de:').innerText() : null;

await page.locator('label:has-text("Empreendimento")').scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(outDir, 'legenda-empreendimento.png') });

await browser.close();
console.log(JSON.stringify({ legendaAntes, legendaDepois, textoLegenda }, null, 2));
