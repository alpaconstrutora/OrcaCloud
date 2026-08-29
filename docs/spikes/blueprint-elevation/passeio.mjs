/**
 * Passeio pelas 4 elevações do harness.
 *
 *   node docs/spikes/blueprint-elevation/passeio.mjs [urlBase]
 *
 * Sobe nada — assume o `npm run dev` já rodando (porta 3100). Para cada direção
 * tira um print e falha o exit em qualquer `pageerror` ou erro de console.
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
  if (!base) throw new Error('defina PLAYWRIGHT_CORE ou instale playwright-core');
  return pick(await import(pathToFileURL(path.join(base, 'index.js')).href));
}

const urlBase = process.argv[2] ?? 'http://localhost:3100';
const aqui = path.dirname(fileURLToPath(import.meta.url));
const DIRECOES = ['FRENTE', 'FUNDOS', 'LATERAL_DIREITA', 'LATERAL_ESQUERDA'];

const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
});
const page = await browser.newPage({ viewport: { width: 1100, height: 720 }, deviceScaleFactor: 2 });

const erros = [];
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(String(e)));

for (const dir of DIRECOES) {
  const qs = `dir=${dir}&cotas=1&rotulos=1${dir === 'FRENTE' ? '&internas=1' : ''}`;
  await page.goto(`${urlBase}/docs/spikes/blueprint-elevation/index.html?${qs}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('canvas');
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(aqui, `saida-${dir.toLowerCase()}.png`) });
}

await browser.close();
if (erros.length) {
  console.error(`ERROS:\n${erros.join('\n')}`);
  process.exit(1);
}
console.log('sem erro de console · prints em docs/spikes/blueprint-elevation/');
