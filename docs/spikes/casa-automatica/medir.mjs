/**
 * Portão da "Casa automática" — exit ≠ 0 reprova.
 *
 * F0: a página abre sem erro de JS, o canvas aparece e o lote de prova tem 4 divisas
 * TERRENO com uma FRENTE. Cada fase seguinte acrescenta aqui as suas conferências
 * (ver "Verificação ponta a ponta" no plano): ambientes atendidos, TO ≤ zona, luz e
 * tomada por ambiente, circuitos, conflitos bloqueantes, `criados` = `diff.created`.
 *
 *   npx vite --port 3192
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/casa-automatica/medir.mjs [url] [pasta-dos-prints]
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const pick = (m) => m.chromium ?? m.default?.chromium;
const chromium = pick(await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.js')).href));
const urlBase = process.argv[2] ?? 'http://127.0.0.1:3192';
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

await page.goto(`${urlBase}/docs/spikes/casa-automatica/index.html`);
await page.locator('canvas').first().waitFor();
await page.waitForTimeout(500);
const estado = await page.evaluate(() => window.__estado);

conferir(erros.length === 0, `sem erro de JS na página${erros.length ? `: ${erros.join(' | ')}` : ''}`);
conferir(estado?.divisas === 4, `lote de prova com 4 divisas TERRENO (${estado?.divisas})`);
conferir(estado?.frente === 1, `uma divisa FRENTE (${estado?.frente})`);
console.log(`plano: ${estado?.plano == null ? 'sem plano (F0)' : 'presente'}`);

await page.screenshot({ path: path.join(saida, 'casa-automatica.png') });
await browser.close();
if (falhas.length) {
  console.log(`\n❌ ${falhas.length} conferência(s) reprovada(s)`);
  process.exit(1);
}
console.log('\n✅ portão aprovado');
