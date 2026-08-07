/**
 * Driver do Spike B — roda o harness num Chromium real e imprime os números.
 *
 * Uso:
 *   node docs/spikes/renderer/drive.mjs            # com janela (compositor real)
 *   node docs/spikes/renderer/drive.mjs --headless # sem janela (GL por software)
 *
 * O modo com janela é o que vale para o RNF-003: headless costuma cair em
 * renderização por software e mede outra máquina que não a do usuário.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

/**
 * O projeto não depende de Playwright — é ferramenta de spike, não de produção.
 * Resolve do node_modules local se existir; senão, aceita um caminho por env:
 *
 *   PLAYWRIGHT_CORE=/caminho/para/node_modules/playwright-core node drive.mjs
 */
async function loadChromium() {
  // playwright-core é CommonJS: importado por URL, os exports chegam em `default`.
  const pick = (mod) => mod.chromium ?? mod.default?.chromium;

  try {
    const local = await import('playwright-core');
    if (pick(local)) return pick(local);
  } catch {
    /* cai para o caminho por env */
  }

  const base = process.env.PLAYWRIGHT_CORE;
  if (!base) {
    throw new Error(
      'playwright-core não encontrado. Instale-o ou aponte PLAYWRIGHT_CORE para a pasta do pacote.',
    );
  }
  const chromium = pick(await import(pathToFileURL(path.join(base, 'index.js')).href));
  if (!chromium) throw new Error(`playwright-core em ${base} não expôs chromium`);
  return chromium;
}

const chromium = await loadChromium();
const headless = process.argv.includes('--headless');
// Relativo a este arquivo, não ao cwd: o driver precisa rodar de onde o
// playwright-core estiver instalado, que não é a raiz do projeto.
const page$ = path.join(path.dirname(fileURLToPath(import.meta.url)), 'harness.html');

// `channel: 'chrome'` usa o Chrome instalado na máquina, com a GPU real. É o que o
// RNF-003 cobra — o Chromium empacotado do Playwright costuma cair em GL por
// software e mediria outra máquina que não a do usuário.
const browser = await chromium.launch({
  headless,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
  args: [
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    // Sem estas três, o Chrome estrangula requestAnimationFrame para ~1 fps assim
    // que a janela sai da frente — e a medição vira artefato de foco, não de
    // desempenho. Foi exatamente o que aconteceu na primeira execução.
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(pathToFileURL(page$).href);

const gpu = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl');
  if (!gl) return 'sem webgl';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'renderer desconhecido';
});

const rows = [];
for (const target of [5000, 10000, 20000]) {
  for (const mode of ['svg', 'canvas2d', 'webgl']) {
    await page.bringToFront(); // reforça o anti-throttling acima
    rows.push(await page.evaluate(([m, t]) => window.runBench(m, t), [mode, target]));
  }
}

await browser.close();

console.log(JSON.stringify({ headless, gpu, rows }, null, 1));
