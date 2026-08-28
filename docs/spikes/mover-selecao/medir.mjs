/**
 * Laça e arrasta num navegador de verdade, e confere onde o desenho parou.
 *
 * Cinco medições, e a TERCEIRA e a QUINTA são as que provam o trabalho:
 *   1. o laço da esquerda para a direita pega SÓ o que está inteiro dentro
 *      (a parede que apenas cruza o retângulo fica de fora)
 *   2. modo SOLTAR: o bloco anda e todos os comprimentos ficam idênticos
 *   3. modo MANTER JUNÇÕES: a vizinha NÃO selecionada muda de comprimento e o
 *      vértice continua único — sem ela, a segunda não provaria que os dois
 *      modos são diferentes de fato; um bloco que andasse igual nos dois
 *      passaria nas duas
 *   4. a medição selecionada anda junto com as paredes
 *   5. junção em T (`?t=1`): a divisória que morre no MEIO do corpo da parede
 *      movida acompanha e continua VERTICAL. Era o furo do casamento por
 *      coordenada exata: sem vértice compartilhado, nada disparava, e a
 *      divisória ficava pendurada no ar mesmo com o modo ligado
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

async function abrir(vizinhas, comT = false) {
  await page.goto(
    `${urlBase}/docs/spikes/mover-selecao/index.html?vizinhas=${vizinhas ? 1 : 0}&t=${comT ? 1 : 0}`,
    { waitUntil: 'networkidle' },
  );
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

async function arrastarDe(pontoMundo, deltaMundo, olharAntesDeSoltar) {
  const de = paraTela(pontoMundo);
  const para = paraTela({ x: pontoMundo.x + deltaMundo.x, y: pontoMundo.y + deltaMundo.y });
  await page.mouse.move(de.x, de.y);
  await page.mouse.down();
  await page.mouse.move(para.x, para.y, { steps: 10 });
  // Espia COM O BOTÃO AINDA APERTADO: o anel de alerta é prévia, e prévia que só
  // se pode conferir depois de soltar não serve para nada.
  let espiada = null;
  if (olharAntesDeSoltar) {
    await page.waitForTimeout(150);
    espiada = await olharAntesDeSoltar();
  }
  await page.mouse.up();
  await page.waitForTimeout(150);
  return espiada;
}

/**
 * Tem pixel ÂMBAR (`COR_ALERTA`, #d97706) perto deste ponto de tela?
 *
 * Lê o canvas de verdade. É a única prova possível de que o anel foi DESENHADO:
 * a lista de juntas soltas já é coberta por teste de unidade, e conferi-la de
 * novo aqui provaria o cálculo outra vez, não o desenho.
 */
async function temAmbarPerto(pontoMundo, raioPx = 22) {
  const t = paraTela(pontoMundo);
  return page.evaluate(
    ({ x, y, raio }) => {
      const cv = document.querySelector('canvas');
      const ctx = cv.getContext('2d');
      const escala = cv.width / cv.getBoundingClientRect().width;
      const px = Math.round(x * escala);
      const py = Math.round(y * escala);
      const lado = Math.round(raio * 2 * escala);
      const d = ctx.getImageData(px - lado / 2, py - lado / 2, lado, lado).data;
      for (let i = 0; i < d.length; i += 4) {
        // #d97706 com folga para o antialias das bordas do traço.
        if (Math.abs(d[i] - 0xd9) < 26 && Math.abs(d[i + 1] - 0x77) < 26 && Math.abs(d[i + 2] - 0x06) < 26) {
          return true;
        }
      }
      return false;
    },
    { x: t.x, y: t.y, raio: raioPx },
  );
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

// ── 5. Junção em T: a divisória acompanha ───────────────────────────────────
// A divisória vai de (3000,0) a (3000,4000): o pé dela morre no MEIO do corpo
// da sul, sem compartilhar vértice com ninguém. Laça só a sul e empurra 1000 mm
// para baixo. O ponto de agarre é 1500 — sobre a sul, longe da divisória.
await abrir(true, true);
const antesT = await ler();
const sulT = antesT.paredes.find((w) => w.a.y === 0 && w.b.y === 0 && w.a.x === 0);
const divisoria = antesT.paredes.find((w) => w.a.x === 3000 && w.b.x === 3000);
await lacar({ x: -500, y: -500 }, { x: 6500, y: 500 });
const selT = await ler();
await arrastarDe({ x: 1500, y: 0 }, { x: 0, y: -1000 });
const comT = await ler();

// ── 6. O anel âmbar da junta que vai soltar, DURANTE o arraste ──────────────
// Deslize PARALELO: o canto oeste (0,0) não tem como ser mantido, e o pé da
// leste vira um T e sobrevive. O anel tem de aparecer no primeiro e não no
// segundo — senão ele é enfeite, não aviso.
await abrir(true);
await lacar({ x: -500, y: -500 }, { x: 6500, y: 1000 });
const espiada = await arrastarDe({ x: 3000, y: 0 }, { x: 500, y: 0 }, async () => ({
  noCantoQueSolta: await temAmbarPerto({ x: 0, y: 0 }),
  noCantoQueFica: await temAmbarPerto({ x: 6000, y: 0 }),
}));

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

const divisoriaDepois = comT.paredes.find((w) => w.id === divisoria.id);
const sulTDepois = comT.paredes.find((w) => w.id === sulT.id);
const tAcompanha =
  // só a sul foi laçada — se a divisória entrasse na seleção, ela andaria por
  // ser selecionada e a medição não provaria nada
  selT.selecionados.length === 1 &&
  selT.selecionados[0] === sulT.id &&
  sulTDepois.a.y === -1000 &&
  // o pé desceu junto com o corpo que o hospeda…
  divisoriaDepois.a.y === -1000 &&
  // …e a divisória continua VERTICAL: não foi entortada para alcançá-lo
  divisoriaDepois.a.x === divisoriaDepois.b.x;

const anelAvisaEDiscrimina = espiada.noCantoQueSolta && !espiada.noCantoQueFica;

console.log(`
laço esq→dir pegou:   ${janela.selecionados.length} (esperado 1 — só a parede inteiramente dentro)
laço dir→esq pegou:   ${intersecao.selecionados.length} (esperado > 1 — tudo que toca)

SOLTAR  sul: a=(${sulMovido.a.x},${sulMovido.a.y})  comp ${comprimento(sulMovido)}  |  leste a=(${lesteMovido.a.x},${lesteMovido.a.y})  comp ${comprimento(lesteMovido)}
MANTER  sul: a=(${sulEsticado.a.x},${sulEsticado.a.y})  comp ${comprimento(sulEsticado)}  |  leste a=(${lesteEsticado.a.x},${lesteEsticado.a.y})  comp ${comprimento(lesteEsticado)}

medição 1º ponto x:   ${comMedicao.medicoes[0].pontos[0].x} (esperado 3000)

T  sul a=(${sulTDepois.a.x},${sulTDepois.a.y})  |  divisória a=(${divisoriaDepois.a.x},${divisoriaDepois.a.y}) b=(${divisoriaDepois.b.x},${divisoriaDepois.b.y}) (esperada vertical, a.y=-1000)
`);

console.log(
  `laço discrimina:        ${lacoDiscrimina ? 'sim' : 'NÃO — os dois modos pegam o mesmo'}\n` +
    `soltar é rígido:        ${moverERigido ? 'sim' : 'NÃO'}\n` +
    `manter puxa a vizinha:  ${esticarPuxaAVizinha ? 'sim' : 'NÃO — o teste aprovaria os dois modos'}\n` +
    `medição anda junto:     ${medicaoAndouJunto ? 'sim' : 'NÃO'}\n` +
    `T acompanha sem torcer: ${tAcompanha ? 'sim' : 'NÃO — o furo do casamento por coordenada exata'}\n` +
    `anel avisa no arraste:  ${espiada.noCantoQueSolta ? 'sim' : 'NÃO — o desencosto segue invisível até soltar'}\n` +
    `anel discrimina:        ${!espiada.noCantoQueFica ? 'sim' : 'NÃO — aparece até onde a junta sobrevive'}`,
);

process.exit(
  lacoDiscrimina &&
    moverERigido &&
    esticarPuxaAVizinha &&
    medicaoAndouJunto &&
    tAcompanha &&
    anelAvisaEDiscrimina
    ? 0
    : 1,
);
