/**
 * Confere visualmente a PAREDE EM CAMADAS no canvas 2D.
 *
 * Três capturas do mesmo modelo, e cada uma responde a uma pergunta que teste
 * de unidade não responde:
 *
 *   `saida-camadas-on.png`   — as faixas somam a espessura, ficam DENTRO do
 *                              contorno, e o canto em L continua vivo;
 *   `saida-camadas-off.png`  — com o toggle desligado o desenho volta a ser
 *                              exatamente o de sempre (a passada nova não pode
 *                              deixar resíduo);
 *   `saida-camadas-zoom-out.png` — afastado, abaixo de `LIMIAR_CAMADAS_PX` a
 *                              parede volta a sólida em vez de virar borrão.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/wall-render/camadas.mjs [urlBase]
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

const urlBase = process.argv[2] ?? 'http://localhost:3100';
const aqui = path.dirname(fileURLToPath(import.meta.url));

const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
});

const erros = [];

async function capturar(qs, arquivo, afastar = 0, aproximar = 0) {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 800 },
    deviceScaleFactor: 2,
  });
  page.on('console', (m) => m.type() === 'error' && erros.push(`[${arquivo}] ${m.text()}`));
  page.on('pageerror', (e) => erros.push(`[${arquivo}] ${String(e)}`));

  await page.goto(`${urlBase}/docs/spikes/wall-render/index.html?${qs}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(400);

  // Zoom out por roda do mouse, como o usuário faria — é o caminho que passa
  // pelo mesmo cálculo de escala que decide o limiar das faixas.
  if (afastar > 0) {
    await page.mouse.move(600, 400);
    for (let i = 0; i < afastar; i++) {
      await page.mouse.wheel(0, 240);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(300);
  }

  // Close no CANTO superior esquerdo da envoltória: é onde a mitragem acontece,
  // e onde uma faixa que invadisse a parede vizinha apareceria.
  if (aproximar > 0) {
    await page.mouse.move(150, 450);
    for (let i = 0; i < aproximar; i++) {
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(300);
  }

  await page.screenshot({ path: path.join(aqui, arquivo) });
  await page.close();
}

await capturar('camadas=1', 'saida-camadas-on.png');
await capturar('camadas=0', 'saida-camadas-off.png');
await capturar('camadas=1', 'saida-camadas-zoom-out.png', 12);
await capturar('camadas=1', 'saida-camadas-canto.png', 0, 10);

await browser.close();

console.log(erros.length ? `ERROS NO CONSOLE:\n${erros.join('\n')}` : 'sem erro de console');
console.log('prints em docs/spikes/wall-render/ — confira à mão: faixas dentro do contorno, canto vivo, e sólida ao afastar');
process.exitCode = erros.length ? 1 : 0;
