/**
 * Confere visualmente o toggle "Medidas" — cota de comprimento em cada parede.
 *
 * Duas capturas do MESMO modelo, só variando `?medidas=`: OFF tem que sair
 * limpa (como sempre foi); ON tem que mostrar um número ao lado de cada trecho
 * de parede grande o bastante, sem cair em cima da própria parede — é o defeito
 * que motivou `rotuloDoTraco` (a cota sobreposta à faixa em zoom out).
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/wall-render/medidas.mjs [urlBase]
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

const erros = [];

async function capturar(medidas, arquivo) {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 800 },
    deviceScaleFactor: 2,
  });
  page.on('console', (m) => m.type() === 'error' && erros.push(`[${arquivo}] ${m.text()}`));
  page.on('pageerror', (e) => erros.push(`[${arquivo}] ${String(e)}`));

  await page.goto(`${urlBase}/docs/spikes/wall-render/index.html?medidas=${medidas ? 1 : 0}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(aqui, arquivo) });
  await page.close();
}

await capturar(false, 'saida-medidas-off.png');
await capturar(true, 'saida-medidas-on.png');

await browser.close();

console.log(erros.length ? `ERROS NO CONSOLE:\n${erros.join('\n')}` : 'sem erro de console');
console.log('prints em docs/spikes/wall-render/ — confira à mão: off sem números, on com números fora da faixa das paredes');
process.exitCode = erros.length ? 1 : 0;
