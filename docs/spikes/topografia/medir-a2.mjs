/**
 * A2 — prova das FEIÇÕES DO LEVANTAMENTO no painel e na planta reais.
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/topografia/medir-a2.mjs [urlBase] [pastaDeSaida]
 *
 * Portão (sai com 1 se falhar):
 *  - controle (`?levantamento` ausente): sem a seção de feições; a lista mostra
 *    os 5 pontos da versão com o número como placeholder;
 *  - `?levantamento=1`: 16 pontos; os nomes (C1, PO1…) nos campos; a seção
 *    conta Cerca 4 pontos / 1 linha, Muro 2 / 1 linha, Poste 2, Árvore 1 —
 *    igual ao motor; o código XY aparece como fora do catálogo; o repetido
 *    (P5b a 3 mm de P5) é acusado com "Remover repetidos"; KML desligado sem
 *    georreferência com o motivo no title;
 *  - planta: há pixels na cor da cerca (#65a30d) e do muro (#374151) na
 *    faixa onde as linhas passam, e NÃO no controle.
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

const urlBase = process.argv[2] ?? 'http://localhost:3100';
const saida = process.argv[3] ?? 'C:/tmp';
const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const erros = [];
page.on('pageerror', (e) => erros.push('PAGEERROR ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') erros.push('CONSOLE ' + m.text());
});
let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) falhas++;
};

async function abrir(extra, nome, fullPage) {
  erros.length = 0;
  await page.goto(`${urlBase}/docs/spikes/topografia/index.html?${extra}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(saida, nome), fullPage });
  const ruido = erros.filter((e) => !/WebGL|GPU|swiftshader/i.test(e));
  ok(ruido.length === 0, `${nome}: sem erro de console (${ruido.length})`);
  for (const e of ruido) console.log('   ' + e.slice(0, 200));
}

/** Conta pixels de uma cor (±12 por canal) no canvas da planta. */
async function pixelsDaCor(hex) {
  return page.evaluate((hex) => {
    const alvo = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    let n = 0;
    for (const c of document.querySelectorAll('canvas')) {
      const ctx = c.getContext('2d');
      if (!ctx || c.width === 0) continue;
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 200 && Math.abs(d[i] - alvo[0]) <= 12 && Math.abs(d[i + 1] - alvo[1]) <= 12 && Math.abs(d[i + 2] - alvo[2]) <= 12) n++;
      }
    }
    return n;
  }, hex);
}

// ── Controle ────────────────────────────────────────────────────────────────
await abrir('vista=painel', 'a2-painel-controle.png', true);
ok((await page.$('[data-testid="levantamento-feicoes"]')) === null, 'controle: sem a seção de feições');
ok((await page.getAttribute('input[aria-label="Nome do ponto 1"]', 'placeholder')) === '1', 'controle: nome vazio mostra o número');
await abrir('vista=planta', 'a2-planta-controle.png', false);
const cercaControle = await pixelsDaCor('#65a30d');
const muroControle = await pixelsDaCor('#374151');

// ── Com o levantamento ──────────────────────────────────────────────────────
await abrir('vista=painel&levantamento=1', 'a2-painel-levantamento.png', true);
{
  const a2 = await page.evaluate(() => window.__a2);
  ok(a2?.pontos === 16, `levantamento: 16 pontos no harness (${a2?.pontos})`);
  const linhas = await page.$$('[data-testid="lista-de-pontos"] input[aria-label^="Nome do ponto"]');
  ok(linhas.length === 16, `lista: 16 linhas (${linhas.length})`);
  ok((await page.inputValue('input[aria-label="Nome do ponto 6"]')) === 'C1', 'lista: nome C1 no 6º ponto');
  ok(((await page.getAttribute('input[aria-label="Nome do ponto 6"]', 'title')) ?? '').includes('Cerca · arame farpado'), 'lista: código, feição e descrição no title');
  const secao = (await page.textContent('[data-testid="levantamento-feicoes"]')) ?? '';
  ok(secao.includes('Cerca · 4 pontos · 1 linha'), 'seção: Cerca 4 pontos, 1 linha');
  ok(secao.includes('Muro · 2 pontos · 1 linha'), 'seção: Muro 2 pontos, 1 linha');
  ok(secao.includes('Poste · 2 pontos') && secao.includes('Árvore · 1 ponto'), 'seção: Poste 2, Árvore 1');
  ok(a2.contagem.porFeicao.CERCA === 4 && a2.contagem.porFeicao.MURO === 2 && a2.linhas.length === 2, `motor: ${JSON.stringify(a2.contagem.porFeicao)} · linhas ${a2.linhas.join(',')}`);
  ok(secao.includes('fora do catálogo (XY)'), 'seção: código XY dito fora do catálogo');
  ok(secao.includes('volta ao recarregar'), 'seção: estado da gravação visível');
  const dup = (await page.textContent('[data-testid="duplicados"]')) ?? '';
  ok(dup.includes('1 ponto repetido na mesma posição') && a2.duplicados.includes('POSICAO'), 'duplicados: P5b acusado (DOM e motor)');
  ok(!!(await page.$('[data-testid="duplicados"] button:has-text("Remover repetidos")')), 'duplicados: botão Remover repetidos');
  const kml = await page.$('[data-testid="levantamento-feicoes"] button:has-text("KML")');
  ok(!!kml && (await kml.isDisabled()) && ((await kml.getAttribute('title')) ?? '').includes('Onde fica'), 'KML: desligado sem georreferência, dizendo por quê');
}

await abrir('vista=planta&levantamento=1', 'a2-planta-levantamento.png', false);
const cerca = await pixelsDaCor('#65a30d');
const muro = await pixelsDaCor('#374151');
ok(cerca > 40 && cercaControle < 5, `planta: cerca desenhada (${cerca} px na cor; controle ${cercaControle})`);
ok(muro > muroControle + 20, `planta: muro desenhado (${muro} px; controle ${muroControle})`);

await browser.close();
console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas > 0 ? 1 : 0);
