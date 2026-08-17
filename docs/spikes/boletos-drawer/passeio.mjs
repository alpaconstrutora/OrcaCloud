/**
 * Passeio: abre o harness, clica em Centro de Custo e em Plano de Contas, e
 * tira print de cada drawer aberto — prova visual (não só typecheck) de que o
 * padrão de Locações (HierarchicalSelect panelVariant="drawer") ficou igual
 * nos dois campos de Boletos.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/boletos-drawer/passeio.mjs [urlBase]
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
const outDir = process.argv[3] ?? '.';
const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
});

const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
await page.goto(`${urlBase}/docs/spikes/boletos-drawer/index.html`, { waitUntil: 'networkidle' });

await page.waitForSelector('text=Centro de Custo');
await page.screenshot({ path: path.join(outDir, '01-inicial.png') });

// Trigger = botão FILHO DIRETO do wrapper do HierarchicalSelect (o Sheet fica
// dentro do mesmo wrapper, então um seletor "qualquer button com —" pegaria
// também a opção "limpar" de dentro do drawer aberto).
const triggerCC = page.locator('[data-field="centro-custo"] > div > button').first();
const triggerPC = page.locator('[data-field="plano-contas"] > div > button').first();

await triggerCC.click();
await page.waitForSelector('text=Selecionar Centro de Custo');
await page.waitForTimeout(200);
const drawerCC = await page.locator('text=Selecionar Centro de Custo').isVisible();
await page.screenshot({ path: path.join(outDir, '02-drawer-centro-custo.png') });
// Busca por código
await page.fill('input[placeholder="Buscar por código ou nome..."]', 'Alpha');
await page.waitForTimeout(150);
await page.screenshot({ path: path.join(outDir, '03-drawer-centro-custo-busca.png') });
// Fecha clicando fora (overlay)
await page.mouse.click(850, 50);
await page.waitForTimeout(200);

await triggerPC.click();
await page.waitForSelector('text=Selecionar Plano de Contas');
await page.waitForTimeout(200);
const drawerPC = await page.locator('text=Selecionar Plano de Contas').isVisible();
await page.screenshot({ path: path.join(outDir, '04-drawer-plano-contas.png') });
await page.fill('input[placeholder="Buscar por código ou nome..."]', 'Mão de Obra');
await page.waitForTimeout(150);
await page.screenshot({ path: path.join(outDir, '05-drawer-plano-contas-busca.png') });

await browser.close();

console.log(JSON.stringify({ drawerCC, drawerPC }, null, 2));

if (!drawerCC || !drawerPC) {
  console.error('FALHA: drawer não abriu para um dos dois campos');
  process.exit(1);
}
console.log('OK: os dois campos abrem o drawer com busca, igual ao padrão de Locações.');
