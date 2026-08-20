/**
 * Laça e arrasta num navegador de verdade, e confere onde o desenho parou.
 *
 * Quatro medições, e a TERCEIRA é a que prova o trabalho:
 *   1. o laço da esquerda para a direita pega SÓ o que está inteiro dentro
 *      (a parede que apenas cruza o retângulo fica de fora)
 *   2. modo MOVER: o bloco anda e todos os comprimentos ficam idênticos
 *   3. modo ESTICAR: a vizinha NÃO selecionada muda de comprimento e o vértice
 *      continua único — sem ela, a segunda não provaria que os dois modos são
 *      diferentes de fato; um bloco que andasse igual nos dois passaria nas duas
 *   4. a medição selecionada anda junto com as paredes
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/mover-selecao/medir.mjs [urlBase]
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
const LARGURA = 1000;
const ALTURA = 700;

// A MESMA matemática de `paraTela`: escala inicial 0,05 px/mm, margem de 60 px e
// a ORIGEM NO RODAPÉ — o Y do modelo cresce para cima, o da tela para baixo.
const ESCALA = 0.05;
const MARGEM = 60;
const paraTela = (p) => ({ x: MARGEM + p.x * ESCALA, y: ALTURA - MARGEM - p.y * ESCALA });

const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
});
const page = await browser.newPage({ viewport: { width: LARGURA, height: ALTURA } });

async function abrir(vizinhas) {
  await page.goto(`${urlBase}/docs/spikes/mover-selecao/index.html?vizinhas=${vizinhas ? 1 : 0}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForFunction(() => Array.isArray(window.__paredes));
  await page.waitForTimeout(150);
}

const ler = () =>
  page.evaluate(() => ({
    paredes: window.__paredes,
    medicoes: window.__medicoes,
    selecionados: window.__selecionados,
  }));

async function lacar(deMundo, paraMundo) {
  const de = paraTela(deMundo);
  const para = paraTela(paraMundo);
  await page.mouse.move(de.x, de.y);
  await page.mouse.down();
  await page.mouse.move(para.x, para.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(100);
}

async function arrastarDe(pontoMundo, deltaMundo) {
  const de = paraTela(pontoMundo);
  const para = paraTela({ x: pontoMundo.x + deltaMundo.x, y: pontoMundo.y + deltaMundo.y });
  await page.mouse.move(de.x, de.y);
  await page.mouse.down();
  await page.mouse.move(para.x, para.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

const comprimento = (w) => Math.round(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y));
const mesmoPonto = (p, q) => p.x === q.x && p.y === q.y;

// ── 1. O laço discrimina ────────────────────────────────────────────────────
// Retângulo que envolve a parede SUL inteira e corta a LESTE e a OESTE pela
// metade. Da esquerda para a direita, só a SUL pode entrar.
await abrir(false);
const inicial = await ler();
const sul = inicial.paredes.find((w) => w.a.y === 0 && w.b.y === 0 && w.a.x === 0);
const leste = inicial.paredes.find((w) => w.a.x === 6000 && w.b.x === 6000);

await lacar({ x: -500, y: -500 }, { x: 6500, y: 1000 });
const janela = await ler();

await abrir(false);
await lacar({ x: 6500, y: 1000 }, { x: -500, y: -500 });
const intersecao = await ler();

// ── 2. MOVER: rígido ────────────────────────────────────────────────────────
await abrir(false);
await lacar({ x: -500, y: -500 }, { x: 6500, y: 1000 }); // só a SUL
await arrastarDe({ x: 3000, y: 0 }, { x: 0, y: -1000 });
const movido = await ler();

// ── 3. ESTICAR: a vizinha acompanha ─────────────────────────────────────────
await abrir(true);
await lacar({ x: -500, y: -500 }, { x: 6500, y: 1000 });
await arrastarDe({ x: 3000, y: 0 }, { x: 0, y: -1000 });
const esticado = await ler();

// ── 4. A medição anda junto ─────────────────────────────────────────────────
// Laço da direita para a esquerda cobrindo a sala inteira: pega tudo, inclusive
// a área medida que está no meio dela.
await abrir(false);
await lacar({ x: 7000, y: 5000 }, { x: -1000, y: -1000 });
await arrastarDe({ x: 3000, y: 0 }, { x: 2000, y: 0 });
const comMedicao = await ler();

await browser.close();

// ── Veredito ────────────────────────────────────────────────────────────────
const sulMovido = movido.paredes.find((w) => w.id === sul.id);
const lesteMovido = movido.paredes.find((w) => w.id === leste.id);
const sulEsticado = esticado.paredes.find((w) => w.id === sul.id);
const lesteEsticado = esticado.paredes.find((w) => w.id === leste.id);

const lacoDiscrimina =
  janela.selecionados.length === 1 &&
  janela.selecionados[0] === sul.id &&
  intersecao.selecionados.length > janela.selecionados.length;

const moverERigido =
  comprimento(sulMovido) === comprimento(sul) &&
  comprimento(lesteMovido) === comprimento(leste) &&
  sulMovido.a.y === -1000 &&
  mesmoPonto(lesteMovido.a, leste.a); // a vizinha ficou onde estava: DESENCOSTOU

const esticarPuxaAVizinha =
  comprimento(sulEsticado) === comprimento(sul) &&
  comprimento(lesteEsticado) === comprimento(leste) + 1000 &&
  mesmoPonto(sulEsticado.b, lesteEsticado.a); // o vértice continua ÚNICO

const medicaoAndouJunto = comMedicao.medicoes[0].pontos[0].x === 1000 + 2000;

console.log(`
laço esq→dir pegou:   ${janela.selecionados.length} (esperado 1 — só a parede inteiramente dentro)
laço dir→esq pegou:   ${intersecao.selecionados.length} (esperado > 1 — tudo que toca)

MOVER   sul: a=(${sulMovido.a.x},${sulMovido.a.y})  comp ${comprimento(sulMovido)}  |  leste a=(${lesteMovido.a.x},${lesteMovido.a.y})  comp ${comprimento(lesteMovido)}
ESTICAR sul: a=(${sulEsticado.a.x},${sulEsticado.a.y})  comp ${comprimento(sulEsticado)}  |  leste a=(${lesteEsticado.a.x},${lesteEsticado.a.y})  comp ${comprimento(lesteEsticado)}

medição 1º ponto x:   ${comMedicao.medicoes[0].pontos[0].x} (esperado 3000)
`);

console.log(
  `laço discrimina:        ${lacoDiscrimina ? 'sim' : 'NÃO — os dois modos pegam o mesmo'}\n` +
    `mover é rígido:         ${moverERigido ? 'sim' : 'NÃO'}\n` +
    `esticar puxa a vizinha: ${esticarPuxaAVizinha ? 'sim' : 'NÃO — o teste aprovaria os dois modos'}\n` +
    `medição anda junto:     ${medicaoAndouJunto ? 'sim' : 'NÃO'}`,
);

process.exit(
  lacoDiscrimina && moverERigido && esticarPuxaAVizinha && medicaoAndouJunto ? 0 : 1,
);
