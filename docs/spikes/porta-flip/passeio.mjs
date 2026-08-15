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

// ── Tamanho da abertura (pedido de 14/08/2026) ──────────────────────────────
//
// A porta está numa parede de 3000 mm, começando em 1050 — cabem no máximo
// 1950 mm de largura. A parede tem 2800 de pé-direito.
const campoLargura = page.getByRole('textbox', { name: /largura da abertura/i });
const campoAltura = page.getByRole('textbox', { name: /altura da abertura/i });

if ((await campoLargura.inputValue()) !== '900') {
  falhas.push(`largura exibida: "${await campoLargura.inputValue()}", esperado "900"`);
}

await campoLargura.fill('800');
await campoLargura.press('Enter');
await page.waitForTimeout(150);
const aposLargura = estadoDe(await ler());
if (aposLargura.widthMm !== 800) falhas.push(`largura não aplicou: ${aposLargura.widthMm}`);
if (aposLargura.heightMm !== 2100) falhas.push('mexer na largura mexeu na altura');
await recortar('saida-largura-800.png', meioDoVao.y);

await campoAltura.fill('2400');
await campoAltura.press('Enter');
await page.waitForTimeout(150);
const aposAltura = estadoDe(await ler());
if (aposAltura.heightMm !== 2400) falhas.push(`altura não aplicou: ${aposAltura.heightMm}`);
if (aposAltura.widthMm !== 800) falhas.push('mexer na altura mexeu na largura');

// RECUSA: 2500 mm de largura estouraria a parede (1050 + 2500 > 3000).
await campoLargura.fill('2500');
await campoLargura.press('Enter');
await page.waitForTimeout(150);
const aposRecusa = estadoDe(await ler());
if (aposRecusa.widthMm !== 800) {
  falhas.push(`largura impossível foi ACEITA: ${aposRecusa.widthMm}`);
}
const textoErro = (await page.locator('#erro').textContent()) ?? '';
if (!/1950 mm/.test(textoErro)) {
  falhas.push(`a recusa não disse a largura máxima: "${textoErro}"`);
}

// RECUSA: altura de 3000 num pé-direito de 2800 — é a trava que impede área
// líquida e volume NEGATIVOS no quantitativo.
await campoAltura.fill('3000');
await campoAltura.press('Enter');
await page.waitForTimeout(150);
if (estadoDe(await ler()).heightMm !== 2400) falhas.push('altura maior que a parede foi ACEITA');
if (!/2800 mm/.test((await page.locator('#erro').textContent()) ?? '')) {
  falhas.push('a recusa de altura não citou o pé-direito');
}

// ── Mover arrastando (pedido de 15/08/2026) ─────────────────────────────────
//
// A porta está numa parede de 3000 mm e agora tem 800 de largura: pode deslizar
// de 0 a 2200. Ela JÁ está selecionada desde o clique lá em cima, que é o que
// libera o arraste (mesma convenção da alça de parede: selecionar, depois pegar).
const offsetInicial = estadoDe(await ler()).offsetMm;

/** Aperta no meio do vão, arrasta até `xMm` no eixo da parede e solta. */
const arrastarPara = async (xMm, { soltar = true } = {}) => {
  const atual = estadoDe(await ler());
  const centroAtual = atual.offsetMm + atual.widthMm / 2;
  const de = tela({ x: centroAtual, y: 0 });
  const ate = tela({ x: xMm, y: 0 });
  await page.mouse.move(de.x, de.y);
  await page.mouse.down();
  // Vários passos: um salto único não exercita a prévia nem o grampo.
  await page.mouse.move(ate.x, ate.y, { steps: 10 });
  if (soltar) await page.mouse.up();
  await page.waitForTimeout(150);
};

// 1. Arraste comum: o centro do vão vai para 2000 mm → offset 2000 − 400 = 1600.
await arrastarPara(2000);
const aposArrasto = estadoDe(await ler());
if (aposArrasto.offsetMm === offsetInicial) {
  falhas.push(`o arraste não moveu a abertura (segue em ${offsetInicial})`);
}
if (Math.abs(aposArrasto.offsetMm - 1600) > 20) {
  falhas.push(`arraste parou em ${aposArrasto.offsetMm}, esperado ~1600`);
}
if (aposArrasto.widthMm !== 800 || aposArrasto.heightMm !== 2400) {
  falhas.push('arrastar mexeu no TAMANHO da abertura');
}
await recortar('saida-movida.png', meioDoVao.y);

// 2. GRAMPO: puxar muito além da ponta da parede para no máximo (3000 − 800),
//    sem recusa e sem saltar de volta.
await arrastarPara(6000);
const aposGrampo = estadoDe(await ler());
if (aposGrampo.offsetMm !== 2200) {
  falhas.push(`grampo falhou: parou em ${aposGrampo.offsetMm}, esperado 2200`);
}
if (((await page.locator('#erro').textContent()) ?? '').length > 0) {
  falhas.push('o grampo deixou o kernel recusar — o arraste devia ter parado antes');
}

// 3. ESCAPE no meio do arraste não move nada. Com o botão ainda apertado, o
//    print mostra a PRÉVIA: a abertura já desenhada no lugar novo, com a
//    distância até o início da parede.
await arrastarPara(300, { soltar: false });
await recortar('saida-arrastando.png', meioDoVao.y);
await page.keyboard.press('Escape');
await page.mouse.up();
await page.waitForTimeout(150);
if (estadoDe(await ler()).offsetMm !== 2200) {
  falhas.push('Escape no meio do arraste mesmo assim moveu a abertura');
}

// 4. O teste de acerto NOVO: apertar na parede LONGE do vão seleciona a parede,
//    e o arraste ali não empurra a porta. Com o teste antigo (frouxo, acertava a
//    quase um metro), este gesto arrastaria a porta.
const naParede = tela({ x: 400, y: 0 });
await page.mouse.move(naParede.x, naParede.y);
await page.mouse.down();
await page.mouse.move(tela({ x: 900, y: 0 }).x, naParede.y, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(150);
const aposParede = await ler();
if (!String(aposParede.selectedId).startsWith('wal_')) {
  falhas.push(`clique longe do vão devia selecionar a PAREDE, veio ${aposParede.selectedId}`);
}
if (estadoDe(aposParede).offsetMm !== 2200) {
  falhas.push('arrastar na parede, fora do vão, empurrou a abertura');
}

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
  // O tamanho das vizinhas também tem que estar intacto: redimensionar é por
  // abertura, não por parede.
  if (o.widthMm !== 900 || o.heightMm !== 2100) {
    falhas.push(`tamanho da vizinha ${o.id} foi alterado: ${JSON.stringify(o)}`);
  }
  // Posição também: arrastar é por abertura.
  if (o.offsetMm !== 1050) {
    falhas.push(`posição da vizinha ${o.id} foi alterada: ${JSON.stringify(o)}`);
  }
});

await browser.close();

console.log('estado final:', JSON.stringify(await Promise.resolve(finais), null, 1));
console.log(erros.length ? `ERROS NO CONSOLE:\n${erros.join('\n')}` : 'sem erro de console');
console.log(falhas.length ? `FALHAS:\n- ${falhas.join('\n- ')}` : 'CONFERÊNCIA OK');
console.log('prints em docs/spikes/porta-flip/');
process.exitCode = falhas.length || erros.length ? 1 : 0;
