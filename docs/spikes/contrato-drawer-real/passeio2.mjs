/**
 * Prova: conta quantas vezes o front chama cost_centers_v2 (via PostgREST)
 * ANTES e DEPOIS de escolher a organização no seletor interno do
 * ContractModal (fluxo de "Todas as Organizações" no topo). Antes da
 * correção, essa 2ª chamada nunca acontecia — a lista ficava vazia para
 * sempre naquela sessão do modal.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/contrato-drawer-real/passeio2.mjs [urlBase]
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
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const costCenterRequests = [];
page.on('request', req => {
  if (req.url().includes('cost_centers_v2')) costCenterRequests.push(req.url());
});
const consoleErrors = [];
page.on('pageerror', err => consoleErrors.push(String(err)));

await page.goto(`${urlBase}/docs/spikes/contrato-drawer-real/index2.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=Organização *', { timeout: 15000 });
const antesDeEscolherOrg = costCenterRequests.length;

// Escolhe a organização semeada no seletor interno (pickedOrgId).
await page.selectOption('select:near(:text("Organização"))', { label: 'Organização Teste' });
await page.waitForTimeout(600);
const depoisDeEscolherOrg = costCenterRequests.length;

await browser.close();

console.log(JSON.stringify({ antesDeEscolherOrg, depoisDeEscolherOrg, urlsChamadas: costCenterRequests, consoleErrors }, null, 2));

if (depoisDeEscolherOrg <= antesDeEscolherOrg) {
  console.error('FALHA: escolher a organização no seletor interno NÃO disparou nova busca de cost_centers_v2.');
  process.exit(1);
}
console.log('OK: escolher a organização disparou nova busca (a correção funciona).');
