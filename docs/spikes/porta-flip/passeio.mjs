/**
 * Seleciona uma porta com clique REAL no canvas, aperta Girar/Espelhar no
 * painel, e confere que o modelo mudou — e mudou SÓ o eixo pedido.
 *
 * Duas provas, dois tipos:
 *
 *   1. estado — o dump traz `hingeAtStart`/`swingReversed` de cada porta.
 *      Girar não pode mexer no espelho, e vice-versa; é a decisão de produto
 *      ("dois eixos independentes") e ela não se vê em print.
 *   2. pixel — os quatro recortes mostram os quatro símbolos. O risco real é o
 *      SENTIDO do arco: errado, sai a "volta longa" de 270° em vez do quarto
 *      de círculo, e nenhum teste de unidade olha isso.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/porta-flip/passeio.mjs [urlBase]
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
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

const urlBase = process.argv[2] ?? 'http://localhost:3102';
const aqui = path.dirname(fileURLToPath(import.meta.url));

const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
});
const page = await browser.newPage({
  viewport: { width: 900, height: 900 },
  deviceScaleFactor: 2,
});

const erros = [];
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(String(e)));

await page.goto(`${urlBase}/docs/spikes/porta-flip/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const caixa = await page.locator('canvas').boundingBox();
const ESCALA = 0.05;
const dx = 60;
const dy = caixa.height - 60;
const tela = (p) => ({ x: caixa.x + p.x * ESCALA + dx, y: caixa.y - p.y * ESCALA + dy });

const ler = async () => JSON.parse(await page.locator('#dump').textContent());
const falhas = [];

/**
 * Recorte em volta de uma linha da tela, sem estourar o viewport.
 *
 * O mostrador de estado é escondido durante a captura: ele fica sobre o canto
 * do canvas e, no print, tapa justamente o símbolo que o print existe para
 * mostrar. Some só no instante da foto — quem abre o harness à mão continua
 * lendo o estado na tela.
 */
const recortar = async (arquivo, centroY) => {
  const alturaPagina = page.viewportSize().height;
  const topo = Math.max(0, Math.min(centroY - 115, alturaPagina - 230));
  await page.locator('#dump').evaluate((el) => (el.style.visibility = 'hidden'));
  await page.screenshot({
    path: path.join(aqui, arquivo),
    clip: { x: caixa.x, y: topo, width: 400, height: 230 },
  });
  await page.locator('#dump').evaluate((el) => (el.style.visibility = 'visible'));
};

// As quatro portas nascem com uma combinação cada — o print prova a geometria.
for (let i = 0; i < 4; i++) {
  await recortar(`saida-combinacao-${i}.png`, tela({ x: 0, y: i * 4000 }).y);
}

// A porta da PRIMEIRA parede (índice 0, perto do rodapé) nasce no padrão.
// Clicar no meio do vão seleciona a abertura, não a parede: o canvas dá
// prioridade à abertura, que está por cima e é menor.
const meioDoVao = tela({ x: 1500, y: 0 });
await page.mouse.click(meioDoVao.x, meioDoVao.y);
await page.waitForTimeout(150);

const aposClique = await ler();
if (!aposClique.selectedId || !aposClique.selectedId.startsWith('opn_')) {
  falhas.push(`clique no vão não selecionou a abertura: ${aposClique.selectedId}`);
}
const alvo = aposClique.selectedId;
const estadoDe = (d) => d.openings.find((o) => o.id === alvo);

const antes = estadoDe(aposClique);
if (antes && (antes.hingeAtStart !== true || antes.swingReversed !== false)) {
  falhas.push(`porta 0 devia nascer no padrão, veio ${JSON.stringify(antes)}`);
}

// GIRAR — só a dobradiça muda.
await page.getByRole('button', { name: /girar/i }).click();
await page.waitForTimeout(150);
const aposGirar = estadoDe(await ler());
if (aposGirar.hingeAtStart !== false) falhas.push('Girar não moveu a dobradiça');
if (aposGirar.swingReversed !== false) falhas.push('Girar mexeu no espelho — os eixos não são independentes');
await recortar('saida-apos-girar.png', meioDoVao.y);

// ESPELHAR — só o lado da folha muda (a dobradiça continua onde Girar deixou).
await page.getByRole('button', { name: /espelhar/i }).click();
await page.waitForTimeout(150);
const aposEspelhar = estadoDe(await ler());
if (aposEspelhar.swingReversed !== true) falhas.push('Espelhar não trocou o lado da folha');
if (aposEspelhar.hingeAtStart !== false) falhas.push('Espelhar mexeu na dobradiça — os eixos não são independentes');
await recortar('saida-apos-espelhar.png', meioDoVao.y);

// Girar de novo volta a dobradiça — são toggles, não valores fixos.
await page.getByRole('button', { name: /girar/i }).click();
await page.waitForTimeout(150);
const aposGirarDeNovo = estadoDe(await ler());
if (aposGirarDeNovo.hingeAtStart !== true) falhas.push('Girar duas vezes não voltou ao original');

// As outras três portas não podem ter sido tocadas.
const finais = (await ler()).openings.filter((o) => o.id !== alvo);
const esperadoOutras = [
  { hingeAtStart: false, swingReversed: false },
  { hingeAtStart: true, swingReversed: true },
  { hingeAtStart: false, swingReversed: true },
];
finais.forEach((o, i) => {
  const e = esperadoOutras[i];
  if (o.hingeAtStart !== e.hingeAtStart || o.swingReversed !== e.swingReversed) {
    falhas.push(`porta vizinha ${o.id} foi alterada: ${JSON.stringify(o)}`);
  }
});

await browser.close();

console.log('estado final:', JSON.stringify(await Promise.resolve(finais), null, 1));
console.log(erros.length ? `ERROS NO CONSOLE:\n${erros.join('\n')}` : 'sem erro de console');
console.log(falhas.length ? `FALHAS:\n- ${falhas.join('\n- ')}` : 'CONFERÊNCIA OK');
console.log('prints em docs/spikes/porta-flip/');
process.exitCode = falhas.length || erros.length ? 1 : 0;
