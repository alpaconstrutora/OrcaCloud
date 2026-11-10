/**
 * Passeio pelo harness do corte 3D da unidade gerado pela Planta (F9).
 *
 *   npx vite --port 3148 --strictPort        # servidor NOVO, na frente
 *   PLAYWRIGHT_CORE=/c/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/decorado-da-planta/passeio.mjs [urlBase] [pastaDosPrints]
 *
 * O que só se vê no navegador: o 3D da Planta monta no diálogo com a unidade sozinha, trocar o lado e a altura não
 * quebra o desenho, e o "Enviar" gera um PNG de 1600 × 1000 que NÃO está vazio (pixels variados, não um fundo só).
 * Falha o exit em qualquer `pageerror` ou erro de console. Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

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

const urlBase = process.argv[2] ?? 'http://localhost:3148';
const prints = process.argv[3] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'decorado-'));
fs.mkdirSync(prints, { recursive: true });
const URL_DO_HARNESS = `${urlBase}/docs/spikes/decorado-da-planta/index.html`;

const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const erros = [];
const falhas = [];
const confere = (ok, frase) => {
  console.log(`${ok ? '✅' : '❌'} ${frase}`);
  if (!ok) falhas.push(frase);
};

try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && erros.push(`[console] ${m.text()}`));
  page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
  await page.goto(URL_DO_HARNESS, { waitUntil: 'networkidle' });

  // 1. O diálogo abre com a prévia em 3D, no formato da imagem, e diz os móveis.
  await page.waitForSelector('[data-testid=corte-previa] canvas', { timeout: 30000 });
  await page.waitForTimeout(3000);
  const previa = await page.getByTestId('corte-previa').boundingBox();
  confere(!!previa && Math.abs(previa.width / previa.height - 1.6) < 0.02, `a prévia tem o formato da imagem, 1,6 (${Math.round(previa?.width ?? 0)}×${Math.round(previa?.height ?? 0)})`);
  const janela = page.viewportSize();
  const dialogo = await page.locator('[role=dialog] > div').nth(1).boundingBox();
  confere(!!dialogo && dialogo.width < janela.width * 0.9, 'o diálogo não ocupa a tela inteira');
  confere((await page.getByTestId('corte-moveis').innerText()).includes('do kit sugerido'), 'unidade sem móvel: a prévia sai com o kit sugerido');
  await page.screenshot({ path: path.join(prints, '01-previa-sudeste.png') });

  // 2. Trocar o lado e a altura: o desenho segue lá (sem erro), e o print mostra cada um.
  await page.getByLabel('Olhar de').selectOption('NOROESTE');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(prints, '02-previa-noroeste.png') });
  await page.getByLabel('Paredes').selectOption('1200');
  await page.waitForTimeout(3000);
  confere((await page.locator('[data-testid=corte-previa] canvas').count()) === 1, 'baixar as paredes remonta o desenho e ele volta');
  await page.screenshot({ path: path.join(prints, '03-paredes-baixas.png') });
  await page.getByLabel('Olhar de').selectOption('SUDESTE');
  await page.getByLabel('Paredes').selectOption('2200');
  await page.waitForTimeout(3000);

  // 3. Enviar: o PNG sai com 1600 × 1000, não vazio, e com a assinatura do desenho.
  await page.getByRole('button', { name: 'Enviar ao Espelho 3D' }).click();
  await page.waitForSelector('[data-testid=png-enviado]', { timeout: 30000 });
  const fig = page.getByTestId('png-enviado');
  const largura = Number(await fig.getAttribute('data-largura'));
  const altura = Number(await fig.getAttribute('data-altura'));
  confere(largura === 1600 && altura === 1000, `o PNG enviado tem 1600 × 1000 (${largura} × ${altura})`);
  // Imagem "vazia" seria um fundo só: conta as cores distintas numa grade de amostras.
  const cores = await page.evaluate(async () => {
    const img = document.querySelector('[data-testid=png-enviado] img');
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const dados = g.getImageData(0, 0, c.width, c.height).data;
    const vistas = new Set();
    for (let y = 0; y < c.height; y += 20) for (let x = 0; x < c.width; x += 20) {
      const i = (y * c.width + x) * 4;
      vistas.add(`${dados[i] >> 4},${dados[i + 1] >> 4},${dados[i + 2] >> 4}`);
    }
    return vistas.size;
  });
  confere(cores >= 8, `o PNG tem desenho, não um fundo só (${cores} tons distintos na amostra)`);
  const envio = await page.evaluate(() => window.__envio);
  confere(envio?.tipologia === 'Tipo 1' && /\|[0-9a-f]{8}$/.test(envio?.assinatura ?? '') && envio?.tipo === 'image/png', `vai com a tipologia, a assinatura e o tipo PNG (${JSON.stringify(envio)})`);
  confere((await page.getByRole('dialog').count()) === 0, 'depois de enviar, o diálogo fecha');
  await page.screenshot({ path: path.join(prints, '04-png-enviado.png'), fullPage: true });
  await ctx.close();
} finally {
  await browser.close();
}

confere(erros.length === 0, `nenhum erro de console nem pageerror (${erros.length})`);
for (const e of erros) console.log(`   ${e}`);
console.log(`prints em ${prints}`);
process.exit(falhas.length > 0 ? 1 : 0);
