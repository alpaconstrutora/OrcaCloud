/**
 * Passeio: no ContractModal DE PRODUÇÃO, clica no campo Centro de Custo e
 * verifica se o drawer permanece aberto. Loga erros de console/página —
 * se houver uma exceção JS ao clicar, ela aparece aqui.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/contrato-drawer-real/passeio.mjs [urlBase]
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

async function loadChromium() {
  const pick = (m) => m.chromium ?? m.default?.chromium;
  try {
    const local = await import('playwright-core');
    if (pick(local)) return pick(local);
  } catch { /* segue para o caminho por env */ }
  const base = process.env.PLAYWRIGHT_CORE;
  if (!base) throw new Error('defina PLAYWRIGHT_CORE');
  return pick(await import(pathToFileURL(path.join(base, 'index.js')).href));
}

const urlBase = process.argv[2] ?? 'http://localhost:3103';
const outDir = process.argv[3] ?? '.';
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleMsgs = [];
page.on('console', msg => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => consoleMsgs.push(`[pageerror] ${err}`));

await page.goto(`${urlBase}/docs/spikes/contrato-drawer-real/index.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=Centro de Custo', { timeout: 15000 });
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outDir, '01-modal-aberto.png') });

const triggerCC = page.locator('label:has-text("Centro de Custo") + div button, label:has-text("Centro de Custo") ~ div button').first();
await triggerCC.scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(outDir, '02-antes-do-clique.png') });
await triggerCC.click();
await page.waitForTimeout(500);

const drawerVisivel = await page.locator('text=Selecionar Centro de Custo').isVisible().catch(() => false);
const isOpenState = await page.locator('[data-el="log"]').innerText();
await page.screenshot({ path: path.join(outDir, '03-apos-clique.png') });

await browser.close();

console.log(JSON.stringify({ drawerVisivel, isOpenState, consoleMsgs }, null, 2));
if (!drawerVisivel) {
  console.error('FALHA reproduzida: drawer não ficou visível após o clique no ContractModal real.');
  process.exit(1);
}
console.log('Drawer abriu e permaneceu visível.');
