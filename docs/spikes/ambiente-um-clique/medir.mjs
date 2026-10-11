/**
 * Portão da ferramenta "Ambiente" (F2) — exit ≠ 0 reprova.
 *
 * Varre uma linha horizontal no meio do canvas. Em cada ponto: passa o mouse e lê
 * o pixel, tira o mouse e lê de novo (a diferença é o REALCE), e clica (o id que
 * volta é o ambiente NOMEADO). Confere:
 *   1. os cliques acham exatamente 2 ambientes, cada um num trecho contíguo;
 *   2. o da esquerda na tela é o de menor X no modelo, e a proporção das larguras
 *      bate com 3000 × 5000 mm (um X espelhado trocaria os lados);
 *   3. realce e clique concordam: onde o clique acha ambiente o realce acende, e
 *      onde não acha, não acende.
 *
 *   npx vite --port 3191
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/ambiente-um-clique/medir.mjs [url] [pasta-dos-prints]
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

await page.goto(`${urlBase}/docs/spikes/ambiente-um-clique/index.html`);
const canvas = page.locator('canvas').first();
await canvas.waitFor();
await page.waitForTimeout(500);
const caixa = await canvas.boundingBox();

const doisQuadros = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const pixel = (x, y) =>
  page.evaluate(([x, y]) => {
    const c = document.querySelector('canvas');
    const b = c.getBoundingClientRect();
    const k = c.width / b.width;
    const d = c.getContext('2d').getImageData(Math.round((x - b.left) * k), Math.round((y - b.top) * k), 1, 1).data;
    return [d[0], d[1], d[2]];
  }, [x, y]);
const LONGE = { x: caixa.x + 3, y: caixa.y + 3 };

// A vista inicial do canvas não centraliza o desenho neste harness (fica no canto
// de cima). Em vez de supor onde a planta caiu, ACHA a faixa vertical em que um
// clique encontra ambiente e varre a linha do meio dela.
const linhasComAmbiente = [];
for (let y = caixa.y + 5; y < caixa.y + caixa.height - 5; y += 10) {
  for (let x = caixa.x + 5; x < caixa.x + caixa.width - 5; x += 40) {
    const n = await page.evaluate(() => window.__cliques.length);
    await page.mouse.click(x, y);
    if ((await page.evaluate(() => window.__cliques.length)) > n) {
      linhasComAmbiente.push(y);
      break;
    }
  }
}
conferir(linhasComAmbiente.length > 0, `a planta está na tela e algum clique acha ambiente (${linhasComAmbiente.length} linhas)`);
const yMeio = linhasComAmbiente.length
  ? (linhasComAmbiente[0] + linhasComAmbiente[linhasComAmbiente.length - 1]) / 2
  : caixa.y + caixa.height / 2;
const pontos = [];
for (let x = caixa.x + 6; x < caixa.x + caixa.width - 6; x += 7) {
  await page.mouse.move(x, yMeio);
  await doisQuadros();
  const aceso = await pixel(x, yMeio);
  await page.mouse.move(LONGE.x, LONGE.y);
  await doisQuadros();
  const apagado = await pixel(x, yMeio);
  const antes = await page.evaluate(() => window.__cliques.length);
  await page.mouse.click(x, yMeio);
  const depois = await page.evaluate((n) => window.__cliques.slice(n), antes);
  const realce = Math.abs(aceso[0] - apagado[0]) + Math.abs(aceso[1] - apagado[1]) + Math.abs(aceso[2] - apagado[2]);
  pontos.push({ x, id: depois[0] ?? null, realce });
}

// 1. Dois ambientes, cada um num trecho contíguo.
const trechos = [];
for (const p of pontos) {
  const ultimo = trechos[trechos.length - 1];
  if (ultimo && ultimo.id === p.id) ultimo.fim = p.x;
  else trechos.push({ id: p.id, ini: p.x, fim: p.x });
}
const comId = trechos.filter((t) => t.id !== null);
const ids = [...new Set(comId.map((t) => t.id))];
conferir(ids.length === 2, `os cliques acham 2 ambientes distintos (${ids.length})`);
conferir(comId.length === 2, `cada ambiente num trecho contíguo da linha (${comId.map((t) => `${t.id}:${t.ini.toFixed(0)}–${t.fim.toFixed(0)}`).join(' | ')})`);

// 2. Esquerda na tela = menor X no modelo; proporção 3000:5000.
const doModelo = await page.evaluate(() => window.__ambientes);
const esqModelo = [...doModelo].sort((a, b) => a.xMin - b.xMin)[0].id;
if (comId.length === 2) {
  conferir(comId[0].id === esqModelo, `o ambiente da esquerda na tela é o de menor X no modelo (${comId[0].id} × ${esqModelo})`);
  const razao = (comId[0].fim - comId[0].ini) / (comId[1].fim - comId[1].ini);
  conferir(Math.abs(razao - 0.6) < 0.12, `larguras na tela na proporção 3 m × 5 m (${razao.toFixed(2)} ≈ 0,60)`);
}

// 3. Realce e clique concordam.
const LIMIAR = 12;
const dentro = pontos.filter((p) => p.id !== null);
const fora = pontos.filter((p) => p.id === null);
const acesosDentro = dentro.filter((p) => p.realce > LIMIAR).length;
conferir(dentro.length > 0 && acesosDentro / dentro.length >= 0.8, `onde o clique acha ambiente, o realce acende (${acesosDentro}/${dentro.length}; a parede por cima não muda de cor)`);
conferir(fora.every((p) => p.realce <= LIMIAR), `onde o clique não acha ambiente, nada acende (${fora.filter((p) => p.realce > LIMIAR).length} acesos em ${fora.length})`);

// Print com o mouse sobre o ambiente da esquerda.
if (comId.length >= 1) {
  await page.mouse.move((comId[0].ini + comId[0].fim) / 2, yMeio);
  await doisQuadros();
}
await page.screenshot({ path: `${saida}/ambiente-um-clique.png` });

conferir(erros.length === 0, `sem erro de página (${erros.join(' | ')})`);
await browser.close();
process.exit(falhas.length ? 1 : 0);
