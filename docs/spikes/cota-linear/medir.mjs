/**
 * Portão do GESTO da cota linear (F5) — exit ≠ 0 reprova.
 *
 * Com a trava ortogonal LIGADA: três cliques numa linha horizontal e um DUPLO CLIQUE
 * abaixo, um pouco à direita do 1º ponto (o gesto que falhou no app real). Confere:
 *   1. grava UMA cota, com 4 pontos (3 medidos + a colocação) — não 5;
 *   2. os 3 medidos na MESMA reta (mesmo y);
 *   3. a colocação FORA da reta (y diferente), travada pelo 1º ponto (mesmo x dele).
 *
 *   npx vite --port 3191
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/cota-linear/medir.mjs [url] [pasta-dos-prints]
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
const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 });
await ctx.route(/supabase\.co\//, (r) => r.abort());
const page = await ctx.newPage();
const erros = [];
page.on('pageerror', (e) => erros.push(String(e)));
const falhas = [];
const conferir = (ok, msg) => { console.log(`${ok ? '✅' : '❌'} ${msg}`); if (!ok) falhas.push(msg); };

await page.goto(`${urlBase}/docs/spikes/cota-linear/index.html`);
const canvas = page.locator('canvas').first();
await canvas.waitFor();
await page.waitForTimeout(500);
const cx = await canvas.boundingBox();

// Uma linha horizontal no meio do canvas: início, um ponto intermediário, fim.
const y = cx.y + cx.height * 0.5;
const xs = [cx.x + cx.width * 0.2, cx.x + cx.width * 0.45, cx.x + cx.width * 0.8];
for (const x of xs) { await page.mouse.click(x, y); await page.waitForTimeout(120); }
// Colocação: abaixo e um pouco à direita do 1º ponto — o que fazia o orto cair na reta.
const colocacao = { x: xs[0] + 60, y: y + 70 };
await page.mouse.move(colocacao.x, colocacao.y);
await page.waitForTimeout(200);
await page.screenshot({ path: `${saida}/cota-linear-previa.png` });
await page.mouse.dblclick(colocacao.x, colocacao.y);
await page.waitForTimeout(300);
await page.screenshot({ path: `${saida}/cota-linear.png` });

const cotas = await page.evaluate(() => window.__cotas);
conferir(cotas.length === 1, `grava UMA cota (${cotas.length})`);
if (cotas.length === 1) {
  const p = cotas[0];
  console.log(`   (info) pontos: ${JSON.stringify(p)}`);
  conferir(p.length === 4, `4 pontos: 3 medidos + a colocação (${p.length})`);
  const medidos = p.slice(0, 3);
  conferir(medidos.every((q) => q.y === medidos[0].y), 'os 3 medidos na mesma reta (mesmo y)');
  const c = p[p.length - 1];
  conferir(c.y !== medidos[0].y, 'a colocação está FORA da reta dos medidos');
  conferir(c.x === medidos[0].x, 'a colocação travou pelo 1º ponto (mesmo x)');
}
conferir(erros.length === 0, `sem erro de página (${erros.join(' | ')})`);
await browser.close();
process.exit(falhas.length ? 1 : 0);
