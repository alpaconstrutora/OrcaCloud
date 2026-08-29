/**
 * Passeio pela vista 3D do harness.
 *
 *   node docs/spikes/blueprint-3d/passeio.mjs [urlBase]
 *
 * Assume `npm run dev` já rodando (porta 3100). Confere que a cena carrega, que
 * o chunk do three só entra ao montar a aba, e falha o exit em QUALQUER
 * `pageerror` ou erro de console — a rede de segurança do `@ts-nocheck`.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

async function loadChromium() {
  const pick = (m) => m.chromium ?? m.default?.chromium;
  try {
    const local = await import('playwright-core');
    if (pick(local)) return pick(local);
  } catch {
    /* segue */
  }
  const base = process.env.PLAYWRIGHT_CORE;
  if (!base) throw new Error('defina PLAYWRIGHT_CORE ou instale playwright-core');
  return pick(await import(pathToFileURL(path.join(base, 'index.js')).href));
}

const urlBase = process.argv[2] ?? 'http://localhost:3100';
const aqui = path.dirname(fileURLToPath(import.meta.url));

const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 1100, height: 720 }, deviceScaleFactor: 2 });

const erros = [];
const requisicoes = [];
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(String(e)));
page.on('request', (r) => requisicoes.push(r.url()));

async function cena(qs, nome, esperaMs = 1800) {
  await page.goto(`${urlBase}/docs/spikes/blueprint-3d/index.html?${qs}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForTimeout(esperaMs);
  await page.screenshot({ path: path.join(aqui, `saida-${nome}.png`) });
}

await cena('laje=1&arestas=1', 'casa');
const usouThree = requisicoes.some((u) => /three|3d-viewer|Blueprint3DViewer/i.test(u));

await cena('niveis=terreo&laje=1', 'terreo');
await cena('paredes=150', 'stress', 2500);

await browser.close();

console.log(usouThree ? 'chunk three carregado ao abrir a aba (esperado)' : 'AVISO: não vi request de chunk three');
if (erros.length) {
  console.error(`ERROS:\n${erros.join('\n')}`);
  process.exit(1);
}
console.log('sem erro de console · prints em docs/spikes/blueprint-3d/');
