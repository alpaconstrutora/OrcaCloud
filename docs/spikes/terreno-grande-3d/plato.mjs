/**
 * PORTÃO DA EDIÇÃO DO PLATÔ NO 3D (25/11/2026, P3 do platô desenhado — reel "Terrain Modification Tool").
 *
 * Abre o terreno grande com o platô editável (`?plato=1&editar=1`), acha as alças pela COR na foto (#2563eb) e:
 *   1. arrasta a alça mais à direita 90 px para a direita → o anel muda e há 1 confirmação;
 *   2. arrasta outra alça e aperta Esc no meio → nada muda e nenhuma confirmação a mais;
 *   3. arrasta a ponta da seta (verde) 60 px para cima → a cota sobe e há mais 1 confirmação.
 * Lê o estado pelo espião do harness (`window.__plato3d`, `window.__confirmacoes`). Sai com 1 se falhar.
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/terreno-grande-3d/plato.mjs [urlBase] [pastaDeSaida]
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

const urlBase = process.argv[2] ?? 'http://localhost:3201';
const saida = process.argv[3] ?? 'C:/tmp';
const browser = await (await loadChromium()).launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const erros = [];
page.on('pageerror', (e) => erros.push('PAGEERROR ' + e));
await page.goto(`${urlBase}/docs/spikes/terreno-grande-3d/index.html?curvas=1&estilo=MAQUETE&plato=1&editar=1`);
await page.waitForSelector('canvas');
await page.waitForTimeout(Number(process.env.ESPERA ?? 5000));
const caixa = await page.locator('canvas').first().boundingBox();

/** Centros dos grupos de pixels de uma cor (r,g,b ± tol), na tela. */
async function manchas(rgb, tol = 18) {
  const png = await page.screenshot({ clip: caixa });
  return page.evaluate(
    async ({ b64, rgb, tol }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const passo = 3;
      const pts = [];
      for (let y = 0; y < c.height; y += passo)
        for (let x = 0; x < c.width; x += passo) {
          const i = (y * c.width + x) * 4;
          if (Math.abs(d[i] - rgb[0]) < tol && Math.abs(d[i + 1] - rgb[1]) < tol && Math.abs(d[i + 2] - rgb[2]) < tol) pts.push([x, y]);
        }
      // Agrupa por vizinhança simples (12 px).
      const grupos = [];
      for (const p of pts) {
        const g = grupos.find((g) => Math.hypot(g.x / g.n - p[0], g.y / g.n - p[1]) < 14);
        if (g) {
          g.x += p[0];
          g.y += p[1];
          g.n++;
        } else grupos.push({ x: p[0], y: p[1], n: 1 });
      }
      return grupos.filter((g) => g.n >= 4).map((g) => ({ x: g.x / g.n, y: g.y / g.n, n: g.n }));
    },
    { b64: png.toString('base64'), rgb, tol },
  );
}
const estado = () => page.evaluate(() => ({ plato: window.__plato3d, confirmacoes: window.__confirmacoes ?? 0 }));
async function arrastar(de, dx, dy, { esc = false } = {}) {
  await page.mouse.move(caixa.x + de.x, caixa.y + de.y);
  await page.mouse.down();
  for (let k = 1; k <= 6; k++) {
    await page.mouse.move(caixa.x + de.x + (dx * k) / 6, caixa.y + de.y + (dy * k) / 6);
    await page.waitForTimeout(40);
    if (esc && k === 3) await page.keyboard.press('Escape');
  }
  await page.mouse.up();
  await page.waitForTimeout(700);
}

const falhas = [];
const inicio = await estado();
const alcas = (await manchas([37, 99, 235])).sort((a, b) => b.x - a.x);
if (alcas.length < 4) falhas.push(`esperava ≥ 4 alças, achei ${alcas.length}`);
await page.screenshot({ path: `${saida}/plato-3d-antes.png`, clip: caixa });

// 1. canto mais à direita, 90 px para a direita.
await arrastar(alcas[0], 90, 0);
const depois1 = await estado();
if (depois1.confirmacoes !== 1) falhas.push(`1º gesto: ${depois1.confirmacoes} confirmações (esperava 1)`);
if (JSON.stringify(depois1.plato.anel) === JSON.stringify(inicio.plato.anel)) falhas.push('1º gesto: o anel não mudou');
await page.screenshot({ path: `${saida}/plato-3d-canto.png`, clip: caixa });

// 2. outra alça com Esc no meio.
const alcas2 = (await manchas([37, 99, 235])).sort((a, b) => a.x - b.x);
await arrastar(alcas2[0], -60, 30, { esc: true });
const depois2 = await estado();
if (depois2.confirmacoes !== 1) falhas.push(`Esc: ${depois2.confirmacoes} confirmações (esperava continuar 1)`);
if (JSON.stringify(depois2.plato.anel) !== JSON.stringify(depois1.plato.anel)) falhas.push('Esc: o anel mudou');

// A câmera não pode ter girado com o Esc (a órbita religada com o botão apertado girava): as alças ficam no lugar.
const alcas2b = (await manchas([37, 99, 235])).sort((a, b) => a.x - b.x);
// A alça arrastada (a 1ª) fica de fora: o cursor em cima dela muda a mancha; as OUTRAS não podem ter andado.
const andou = alcas2.slice(1).map((a, i) => (alcas2b[i + 1] ? Math.hypot(a.x - alcas2b[i + 1].x, a.y - alcas2b[i + 1].y) : Infinity));
if (alcas2b.length !== alcas2.length || Math.max(...andou) > 4) falhas.push(`Esc: a câmera girou (alças andaram ${Math.round(Math.max(...andou))} px)`);
// 3. a seta (verde do PivotControls): a ponta = a mancha verde mais alta.
// Só manchas grandes: o ícone verde da barra do canto (4 px) não é a seta.
const verdes = (await manchas([120, 210, 140], 45)).filter((m) => m.n >= 8).sort((a, b) => a.y - b.y);
if (verdes.length === 0) falhas.push('não achei a seta verde');
else {
  await arrastar(verdes[0], 0, -60);
  const depois3 = await estado();
  if (depois3.confirmacoes !== 2) falhas.push(`seta: ${depois3.confirmacoes} confirmações (esperava 2)`);
  if (!(depois3.plato.cotaM > depois2.plato.cotaM)) falhas.push(`seta: a cota não subiu (${depois2.plato.cotaM} → ${depois3.plato.cotaM})`);
  await page.screenshot({ path: `${saida}/plato-3d-seta.png`, clip: caixa });
  console.log(JSON.stringify({ cotaAntes: depois2.plato.cotaM, cotaDepois: depois3.plato.cotaM }));
}
if (erros.length) falhas.push(...erros);
console.log(JSON.stringify({ alcas: alcas.length, anelAntes: inicio.plato.anel, anelDepois: depois1.plato.anel }));
console.log(falhas.length ? `❌ ${falhas.join(' · ')}` : '✅ canto e seta editam o platô; um confirmar por gesto; Esc desfaz');
await browser.close();
process.exit(falhas.length ? 1 : 0);
