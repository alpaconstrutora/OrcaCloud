/**
 * Passeio pelo editor: a planta de fundo e as medições, em Chrome de verdade.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/medicoes/passeio.mjs [urlBase]
 *
 * São quatro perguntas que nenhum teste de unidade alcança, porque todas se
 * respondem em PIXEL:
 *
 *   1. a imagem cai no lugar certo?
 *   2. ela continua colada no desenho depois do zoom?
 *   3. o traçado segue o cursor e fecha ao clicar no primeiro ponto?
 *   4. RECALIBRAR reposiciona as formas sobre o que foi traçado?
 *
 * Cada uma roda também com o defeito reintroduzido, e o passeio SÓ passa se a
 * versão defeituosa REPROVAR. Medição que aprova os dois casos não mede nada —
 * aconteceu quatro vezes no dia em que este módulo foi escrito.
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

const urlBase = process.argv[2] ?? 'http://localhost:3103';
const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
});

/**
 * Caixas das duas camadas, lidas do canvas.
 *
 * `imagem` é o retângulo preto que veio na planta de fundo; `forma` é o contorno
 * azul da medição traçada por cima dele. Comparar as duas é comparar o que o
 * usuário vê — e não o que o código diz que desenhou.
 */
const LEITOR = () => {
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const dpr = window.devicePixelRatio || 1;
  const d = ctx.getImageData(0, 0, w, h).data;

  const vazio = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity, n: 0 };
  const caixas = { imagem: { ...vazio }, forma: { ...vazio }, marca: { ...vazio } };

  const somar = (c, x, y) => {
    c.x1 = Math.min(c.x1, x);
    c.y1 = Math.min(c.y1, y);
    c.x2 = Math.max(c.x2, x);
    c.y2 = Math.max(c.y2, y);
    c.n += 1;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      // Preto do retângulo da imagem. A grade é cinza claro e a forma é azul —
      // nenhuma das duas chega perto deste limiar.
      if (r < 70 && g < 70 && b < 70) somar(caixas.imagem, x / dpr, y / dpr);
      // Marca vermelha (#e11d48) do canto superior esquerdo da imagem.
      else if (r > 180 && g < 80 && b < 110) somar(caixas.marca, x / dpr, y / dpr);
      // Azul do traço da medição (#2563eb). O preenchimento é `#2563eb22` sobre
      // branco, quase imperceptível, então o corte pega só o traço.
      else if (b > 150 && r < 120 && g < 140) somar(caixas.forma, x / dpr, y / dpr);
    }
  }
  return caixas;
};

/** Pixels âmbar (#d97706) — é a cor do traçado em curso e do primeiro vértice. */
const CONTA_AMBAR = () => {
  const canvas = document.querySelector('canvas');
  const { width: w, height: h } = canvas;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 180 && d[i + 1] > 90 && d[i + 1] < 160 && d[i + 2] < 60) n += 1;
  }
  return n;
};

async function abrir(query) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.goto(`${urlBase}/docs/spikes/medicoes/index.html${query}`, {
    waitUntil: 'networkidle',
  });
  // A cena do painel não tem canvas — esperar por ele travaria o passeio.
  await page.waitForSelector('body[data-pronto="1"]');
  if (!query.includes('painel')) await page.waitForSelector('canvas');
  return page;
}

/** Maior afastamento, em pixels de tela, entre as bordas das duas caixas. */
function afastamento(c) {
  if (c.imagem.n === 0 || c.forma.n === 0) return null;
  return Math.max(
    Math.abs(c.imagem.x1 - c.forma.x1),
    Math.abs(c.imagem.y1 - c.forma.y1),
    Math.abs(c.imagem.x2 - c.forma.x2),
    Math.abs(c.imagem.y2 - c.forma.y2),
  );
}

/**
 * Tolerância de 6 px de tela.
 *
 * O traço da medição é TRACEJADO (6 ligados, 4 desligados): num canto o traço
 * pode estar no intervalo desligado, e a caixa encolhe até um dash. Exigir
 * coincidência exata reprovaria o desenho certo.
 */
const TOLERANCIA = 6;

const resultados = [];
const registrar = (nome, ok, detalhe) => {
  resultados.push({ nome, ok, detalhe });
  console.log(`  ${ok ? '✓' : '✖'}  ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
};

// ── 1 e 2 — a imagem no lugar certo, e colada no zoom ────────────────────────
console.log('\n1 · Planta de fundo no lugar certo (e colada no zoom)');

for (const [rotulo, query, esperaAlinhado] of [
  ['fundo correto', '?cena=fundo', true],
  ['fundo dessincronizado (defeito)', '?cena=fundo&defeito=1', false],
]) {
  const page = await abrir(query);
  const parado = afastamento(await page.evaluate(LEITOR));

  // Zoom com a roda, sobre o canto superior esquerdo do desenho: é o gesto real,
  // e é onde a composição das duas transformações erra se estiver errada.
  await page.mouse.move(200, 200);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(150);
  const comZoom = afastamento(await page.evaluate(LEITOR));
  await page.close();

  const alinhado =
    parado !== null && comZoom !== null && parado <= TOLERANCIA && comZoom <= TOLERANCIA;
  registrar(
    rotulo,
    alinhado === esperaAlinhado,
    `parado ${parado === null ? 'sem camada' : `${parado.toFixed(0)} px`} · ` +
      `com zoom ${comZoom === null ? 'sem camada' : `${comZoom.toFixed(0)} px`}`,
  );
}

// ── 2 — a imagem não pode sair espelhada ────────────────────────────────────
//
// Coincidir as caixas prova ENQUADRAMENTO, não ORIENTAÇÃO: um retângulo virado
// de cabeça para baixo ocupa exatamente o mesmo retângulo. Por isso a imagem
// leva uma marca só no canto superior esquerdo — é ela que separa as duas
// coisas, e sem ela a conferência acima aprovaria uma planta espelhada.
console.log('\n2 · Orientação: o que está em cima na imagem fica em cima na tela');
{
  const page = await abrir('?cena=fundo');
  const c = await page.evaluate(LEITOR);
  await page.close();

  const meio = (c.imagem.y1 + c.imagem.y2) / 2;
  const marcaY = (c.marca.y1 + c.marca.y2) / 2;
  registrar(
    'a marca do topo da imagem é desenhada no topo',
    c.marca.n > 0 && marcaY < meio,
    c.marca.n === 0
      ? 'marca não encontrada'
      : `marca em y=${marcaY.toFixed(0)}, meio do desenho em y=${meio.toFixed(0)} — ` +
        (marcaY < meio ? 'no topo' : 'ESPELHADA na vertical'),
  );
}

// ── 3 — o traçado segue o cursor e fecha no primeiro ponto ───────────────────
console.log('\n3 · Traçado: segue o cursor, fecha no primeiro ponto');
{
  const page = await abrir('?cena=tracar');
  const caixa = await page.locator('canvas').boundingBox();
  const ponto = (x, y) => ({ x: caixa.x + x, y: caixa.y + y });

  const semNada = await page.evaluate(CONTA_AMBAR);

  const p = ponto(150, 150);
  await page.mouse.click(p.x, p.y);
  await page.mouse.move(ponto(400, 150).x, ponto(400, 150).y);
  await page.waitForTimeout(120);
  const seguindo = await page.evaluate(CONTA_AMBAR);

  registrar(
    'a linha em curso acompanha o cursor',
    semNada === 0 && seguindo > 50,
    `antes ${semNada} px âmbar · seguindo ${seguindo}`,
  );

  // Três vértices e um quarto clique de volta no primeiro: é como se fecha
  // polilinha em qualquer CAD, e é o gesto que o painel documenta.
  await page.mouse.click(ponto(400, 150).x, ponto(400, 150).y);
  await page.mouse.click(ponto(400, 350).x, ponto(400, 350).y);

  const antesDeFechar = await page.evaluate(() => window.__eventos.length);

  // Longe do primeiro ponto: NÃO pode fechar. Sem esta metade, o teste passaria
  // com um código que fechasse a qualquer clique.
  await page.mouse.click(ponto(250, 300).x, ponto(250, 300).y);
  const aposCliqueLonge = await page.evaluate(() => window.__eventos.length);

  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(120);
  const evs = await page.evaluate(() => window.__eventos);
  await page.close();

  const fechou =
    antesDeFechar === 0 &&
    aposCliqueLonge === 0 &&
    evs.length === 1 &&
    evs[0].tipo === 'POLIGONO' &&
    evs[0].pontos.length === 4;

  registrar(
    'clicar no primeiro vértice fecha a forma (e só ele)',
    fechou,
    `clique longe não fechou: ${aposCliqueLonge === 0 ? 'sim' : 'NÃO'} · ` +
      `forma final: ${evs.length === 1 ? `${evs[0].tipo} com ${evs[0].pontos.length} vértices` : `${evs.length} evento(s)`}`,
  );
}

// ── 5 — a barra e o painel cabem ────────────────────────────────────────────
//
// A barra ganhou um seletor de prancha e o painel ganhou três controles por
// linha, dentro de um `<aside>` com `overflow-hidden`. Item de flex NÃO encolhe
// abaixo do próprio conteúdo, e foi assim que duas abas sumiram desta mesma
// tela: existiam no DOM, eram achadas por `getByRole`, e ninguém as via.
// jsdom não tem retângulo; só o navegador responde isto.
console.log('\n4 · Barra e painel: nada recortado pelo overflow');

for (const [rotulo, query, esperaCoube] of [
  ['painel de 384 px (real)', '?cena=painel', true],
  ['painel estreitado a 256 px (defeito)', '?cena=painel&defeito=1', false],
]) {
  const page = await abrir(query);
  const recortados = await page.evaluate(() => {
    const dentro = (raiz, seletor) => {
      const lim = raiz.getBoundingClientRect().right;
      return [...raiz.querySelectorAll(seletor)]
        .filter((el) => el.getBoundingClientRect().right > lim + 0.5)
        .map((el) => el.getAttribute('aria-label') || el.textContent.slice(0, 24));
    };
    return [
      ...dentro(document.querySelector('[data-barra]'), 'select, button, input'),
      // `[role=tab]` entra explicitamente: a barra de abas deste painel já
      // sumiu duas vezes pelo `overflow-hidden`, e é o caso que motivou medir.
      ...dentro(document.querySelector('[data-painel]'), 'input, button, table, [role="tab"]'),
    ];
  });
  await page.close();

  const coube = recortados.length === 0;
  registrar(
    rotulo,
    coube === esperaCoube,
    coube ? 'nada ultrapassa a borda' : `recortado: ${recortados.join(', ')}`,
  );
}

// ── 4 — recalibrar reposiciona as formas ────────────────────────────────────
console.log('\n5 · Recalibrar — o teste que mais importa');

for (const [rotulo, query, esperaAlinhado] of [
  ['formas reposicionadas pela nova escala', '?cena=recalibrar', true],
  ['formas NÃO reposicionadas (defeito)', '?cena=recalibrar&defeito=1', false],
]) {
  const page = await abrir(query);
  const dist = afastamento(await page.evaluate(LEITOR));
  await page.close();

  const alinhado = dist !== null && dist <= TOLERANCIA;
  registrar(
    rotulo,
    alinhado === esperaAlinhado,
    dist === null ? 'sem camada' : `afastamento ${dist.toFixed(0)} px`,
  );
}

await browser.close();

const falhas = resultados.filter((r) => !r.ok);
console.log(
  `\n${resultados.length - falhas.length}/${resultados.length} conferências passaram.`,
);
if (falhas.length > 0) {
  console.log('Reprovadas: ' + falhas.map((f) => f.nome).join(', '));
}
process.exit(falhas.length === 0 ? 0 : 1);
