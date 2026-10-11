/**
 * Portão do SEPARADOR DE AMBIENTE (F3) — exit ≠ 0 reprova.
 *
 * Com `kindDaDivisa = 'RESTRICAO'` no canvas:
 *   1. a ferramenta `separador` grava os trechos como DIVISA (nunca RESTRICAO);
 *   2. a ferramenta `divisa` (aba Terreno) continua respeitando a opção: RESTRICAO;
 *   3. o separador é traçado ABERTO e encadeado: 3 cliques = 2 trechos, e o 2º
 *      começa onde o 1º terminou.
 *
 *   npx vite --port 3191
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/separador-ambiente/medir.mjs [url] [pasta-dos-prints]
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const pick = (m) => m.chromium ?? m.default?.chromium;
const chromium = pick(await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.js')).href));
const urlBase = process.argv[2] ?? 'http://127.0.0.1:3191';
const saida = process.argv[3] ?? 'C:/tmp';
fs.mkdirSync(saida, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const falhas = [];
const conferir = (ok, msg) => { console.log(`${ok ? '✅' : '❌'} ${msg}`); if (!ok) falhas.push(msg); };

async function desenhar(tool, cliques) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 });
  await ctx.route(/supabase\.co\//, (r) => r.abort());
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  await page.goto(`${urlBase}/docs/spikes/separador-ambiente/index.html?tool=${tool}`);
  const canvas = page.locator('canvas').first();
  await canvas.waitFor();
  await page.waitForTimeout(400);
  const cx = await canvas.boundingBox();
  for (const [fx, fy] of cliques) {
    await page.mouse.click(cx.x + cx.width * fx, cx.y + cx.height * fy);
    await page.waitForTimeout(80);
  }
  await page.screenshot({ path: `${saida}/separador-${tool}.png` });
  await page.keyboard.press('Escape');
  const limites = await page.evaluate(() => window.__limites);
  await ctx.close();
  return { limites, erros };
}

// 1 + 3. Separador: três cliques num L → dois trechos encadeados, ambos DIVISA.
const sep = await desenhar('separador', [[0.3, 0.3], [0.6, 0.3], [0.6, 0.6]]);
conferir(sep.limites.length === 2, `separador: 3 cliques = 2 trechos (${sep.limites.length})`);
conferir(sep.limites.length > 0 && sep.limites.every((l) => l.kind === 'DIVISA'), `separador grava DIVISA mesmo com a opção da Divisa em RESTRICAO (${sep.limites.map((l) => l.kind).join(', ')})`);
if (sep.limites.length === 2) {
  const [t1, t2] = sep.limites;
  conferir(t1.b.x === t2.a.x && t1.b.y === t2.a.y, `o 2º trecho começa onde o 1º terminou (${JSON.stringify(t1.b)} = ${JSON.stringify(t2.a)})`);
}
conferir(sep.erros.length === 0, `separador: sem erro de página (${sep.erros.join(' | ')})`);

// 2. Divisa (aba Terreno): a opção continua valendo.
const div = await desenhar('divisa', [[0.3, 0.3], [0.6, 0.3]]);
conferir(div.limites.length === 1 && div.limites[0].kind === 'RESTRICAO', `divisa respeita a opção "Faixa restrita" (${div.limites.map((l) => l.kind).join(', ')})`);
conferir(div.erros.length === 0, `divisa: sem erro de página (${div.erros.join(' | ')})`);

await browser.close();
process.exit(falhas.length ? 1 : 0);
