/**
 * Mede a barra de rolagem da área principal no Layout de produção.
 *
 *   node docs/spikes/barra-rolagem-area-principal/medir.mjs [urlBase] [outDir]
 *
 * Portões:
 *  - a <main> reserva o espaço da barra (offsetWidth − clientWidth = 8) com conteúdo
 *    curto E longo — se só a longa reservasse, o conteúdo pularia de lado;
 *  - a raiz da tela fica na mesma posição e largura nas duas;
 *  - gutter esquerdo continua 24px (§20.2);
 *  - com conteúdo longo a <main> rola e o cursor perto da borda marca
 *    data-barra-proxima="v" (a barra alarga).
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

async function loadChromium() {
  const pick = (m) => m.chromium ?? m.default?.chromium;
  try { const l = await import('playwright-core'); if (pick(l)) return pick(l); } catch { /* env */ }
  const base = process.env.PLAYWRIGHT_CORE;
  if (!base) throw new Error('defina PLAYWRIGHT_CORE');
  return pick(await import(pathToFileURL(path.join(base, 'index.js')).href));
}

const urlBase = process.argv[2] ?? 'http://127.0.0.1:3198';
const outDir = process.argv[3] ?? '.';
fs.mkdirSync(outDir, { recursive: true });
const chromium = await loadChromium();
// headless esconde as barras (`--hide-scrollbars`) — desligado, senão o print mente.
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? 'chrome', ignoreDefaultArgs: ['--hide-scrollbars'] });
const portoes = [];
const exigir = (ok, t) => portoes.push(`${ok ? 'ok   ' : 'FALHA'} ${t}`);
const erros = [];

async function medir(conteudo) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => erros.push(`[${conteudo}] ${e.message}`));
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto(`${urlBase}/docs/spikes/barra-rolagem-area-principal/index.html?conteudo=${conteudo}`, { waitUntil: 'networkidle' });
  await page.locator('[data-el="raiz-tela"]').waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const main = document.querySelector('main');
    const raiz = document.querySelector('[data-el="raiz-tela"]');
    const rm = main.getBoundingClientRect(), rr = raiz.getBoundingClientRect();
    return {
      gutterCss: getComputedStyle(main).scrollbarGutter,
      barra: main.offsetWidth - main.clientWidth,
      rola: main.scrollHeight > main.clientHeight,
      esquerda: Math.round(rr.left - rm.left),
      direita: Math.round(rm.right - rr.right),
      raizLeft: Math.round(rr.left), raizWidth: Math.round(rr.width),
      mainRight: Math.round(rm.right), mainTop: Math.round(rm.top),
    };
  });
  return { page, m };
}

const longo = await medir('longo');
const curto = await medir('curto');
console.log('longo', JSON.stringify(longo.m));
console.log('curto', JSON.stringify(curto.m));

exigir(longo.m.gutterCss === 'stable', `main com scrollbar-gutter: stable (${longo.m.gutterCss})`);
exigir(longo.m.rola, 'conteúdo longo: a <main> rola');
exigir(longo.m.barra === 8 && curto.m.barra === 8, `espaço da barra reservado nas duas (longo ${longo.m.barra}px, curto ${curto.m.barra}px)`);
exigir(longo.m.raizLeft === curto.m.raizLeft && longo.m.raizWidth === curto.m.raizWidth,
  `raiz da tela na mesma posição/largura curta × longa (${curto.m.raizLeft}/${curto.m.raizWidth} × ${longo.m.raizLeft}/${longo.m.raizWidth})`);
exigir(longo.m.esquerda === 24, `gutter esquerdo 24px (${longo.m.esquerda})`);
exigir(longo.m.direita === 32, `borda direita: 24px de gutter + 8px da barra (${longo.m.direita})`);

// cursor perto da barra → alarga
const p = longo.page;
await p.mouse.move(longo.m.mainRight - 12, longo.m.mainTop + 300);
await p.waitForTimeout(300);
const proxima = await p.evaluate(() => document.querySelector('main').getAttribute('data-barra-proxima'));
exigir(proxima === 'v', `cursor a 12px da borda: data-barra-proxima="v" (${proxima})`);
await p.screenshot({ path: path.join(outDir, 'longo-perto-da-barra.png') });
await p.mouse.move(800, 500);
await p.waitForTimeout(300);
await p.screenshot({ path: path.join(outDir, 'longo-repouso.png') });
await curto.page.screenshot({ path: path.join(outDir, 'curto.png') });

await browser.close();
console.log(portoes.join('\n'));
if (erros.length) console.log('\nERROS:\n' + erros.join('\n'));
const falhas = portoes.filter(x => x.startsWith('FALHA')).length;
console.log(`\n${portoes.length - falhas}/${portoes.length} portões ok`);
process.exit(falhas ? 1 : 0);
