/**
 * Aponta e clica nos círculos âmbar, com ponteiro REAL, e confere o que saiu.
 *
 * Três provas, três tipos:
 *
 *   1. ACERTO — o clique precisa pegar a ponta. O raio da mira é `ALCA_PX / escala`,
 *      e errá-lo não dá erro nenhum: o clique simplesmente "não faz nada", que é
 *      o modo de falha mais caro de diagnosticar.
 *   2. ESTADO — depois do segundo clique as duas paredes têm que terminar NO
 *      MESMO ponto (é isso que fecha o canto), e nos casos 3 e 4 nada pode se
 *      mover.
 *   3. PIXEL — a prévia e o "mudou de cor". Um círculo que não muda ao ser
 *      clicado faz o usuário clicar de novo, e o segundo clique junta a coisa
 *      errada. Nenhum teste de unidade vê isso.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/juntar-pontas/passeio.mjs [urlBase]
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

await page.goto(`${urlBase}/docs/spikes/juntar-pontas/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const caixa = await page.locator('canvas').boundingBox();
const ESCALA = 0.05;
const dx = 60;
const dy = caixa.height - 60;
const tela = (p) => ({ x: caixa.x + p.x * ESCALA + dx, y: caixa.y - p.y * ESCALA + dy });

const ler = async () => JSON.parse(await page.locator('#dump').textContent());
const falhas = [];

const recortar = async (arquivo, centroY) => {
  const alturaPagina = page.viewportSize().height;
  const topo = Math.max(0, Math.min(centroY - 115, alturaPagina - 230));
  await page.locator('#dump').evaluate((el) => (el.style.visibility = 'hidden'));
  await page.screenshot({
    path: path.join(aqui, arquivo),
    clip: { x: caixa.x, y: topo, width: 460, height: 230 },
  });
  await page.locator('#dump').evaluate((el) => (el.style.visibility = 'visible'));
};

/** Onde termina cada parede, por id, para comparar antes/depois. */
const pontas = (d) => Object.fromEntries(d.walls.map((w) => [w.id, `${w.a.x},${w.a.y}|${w.b.x},${w.b.y}`]));

const inicial = await ler();
// 4 casos × 2 paredes × 2 extremos: NENHUMA delas encosta em nada, então toda
// ponta é solta. (A primeira versão dizia 8 — contava paredes, não pontas.)
if (inicial.soltas !== 16) {
  falhas.push(`16 pontas soltas esperadas (4 casos × 2 paredes × 2 pontas), vieram ${inicial.soltas}`);
}
const antesDeTudo = pontas(inicial);

/**
 * Faz o gesto completo: clica na ponta `a`, confere que ela ACENDEU, clica na
 * ponta `b`.
 *
 * A conferência do meio é o que distingue "o gesto falhou" de "o primeiro clique
 * nem chegou" — sem ela, um erro de mira apareceria no fim como "o canto não
 * fechou", que é o sintoma de meia dúzia de causas diferentes.
 */
async function juntar(rotulo, a, b, { print } = {}) {
  const pa = tela(a);
  await page.mouse.click(pa.x, pa.y);
  await page.waitForTimeout(120);

  const meio = await ler();
  if (!meio.escolhida) {
    falhas.push(`${rotulo}: o 1º clique não acendeu ponta nenhuma — mira errou o círculo`);
    return;
  }
  if (print) {
    // Move o cursor até a 2ª ponta SEM clicar: é o que produz a prévia do canto.
    const pb = tela(b);
    await page.mouse.move(pb.x, pb.y, { steps: 6 });
    await page.waitForTimeout(120);
    await recortar(print, pa.y);
  }

  const pb = tela(b);
  await page.mouse.click(pb.x, pb.y);
  await page.waitForTimeout(150);
}

// ── 1. Perpendicular exato ───────────────────────────────────────────────────
await juntar('caso 1', { x: 0, y: 3000 }, { x: 4000, y: 2500 }, { print: 'saida-previa-canto.png' });

const apos1 = await ler();
const canto1 = apos1.walls.filter((w) =>
  [w.a, w.b].some((p) => p.x === 0 && p.y === 2500),
);
if (canto1.length !== 2) {
  falhas.push(`caso 1: as duas paredes deviam terminar em (0, 2500); ${canto1.length} terminam lá`);
}
if (apos1.escolhida !== null) falhas.push('caso 1: a escolha não foi limpa depois de juntar');
await recortar('saida-canto-fechado.png', tela({ x: 0, y: 2500 }).y);

// ── 2. Um grau torto — o "levemente desalinhadas" do pedido ──────────────────
await juntar('caso 2', { x: 52, y: 8000 }, { x: 4000, y: 7500 });

const apos2 = await ler();
// O canto sai na altura do eixo horizontal (7500) e acompanha a inclinação da
// vertical — o eixo NÃO é endireitado, então o x do canto não é zero.
const canto2 = apos2.walls.filter((w) => [w.a, w.b].some((p) => p.y === 7500 && p.x > 0 && p.x < 100));
if (canto2.length !== 2) {
  falhas.push(`caso 2: canto torto não fechou; paredes em y=7500 com x pequeno: ${canto2.length}`);
}
await recortar('saida-canto-torto.png', tela({ x: 0, y: 7500 }).y);

// ── 3. Paralelas: tem que RECUSAR ────────────────────────────────────────────
const antesDo3 = await ler();
await juntar('caso 3', { x: 0, y: 12000 }, { x: 2000, y: 12500 });

const apos3 = await ler();
if (apos3.recusas !== antesDo3.recusas + 1) falhas.push('caso 3: paralelas NÃO foram recusadas');
for (const [id, geo] of Object.entries(pontas(antesDo3))) {
  if (pontas(apos3)[id] !== geo) falhas.push(`caso 3: a recusa mexeu na parede ${id}`);
}

// ── 4. Quase colineares: é VÃO, não canto ────────────────────────────────────
const antesDo4 = await ler();
await juntar('caso 4', { x: 3000, y: 15000 }, { x: 4000, y: 15030 });
const apos4 = await ler();
if (apos4.recusas !== antesDo4.recusas + 1) {
  falhas.push('caso 4: quase colineares NÃO foram recusadas — viraria canto a quilômetros');
}
for (const [id, geo] of Object.entries(pontas(antesDo4))) {
  if (pontas(apos4)[id] !== geo) falhas.push(`caso 4: a recusa mexeu na parede ${id}`);
}

// ── Desistir: clicar no vazio, e clicar de novo na MESMA ponta ───────────────
//
// O ponto "vazio" tem de estar DENTRO da viewport e longe de qualquer ponta:
// entre a faixa do caso 1 e a do caso 2.
const vazio = tela({ x: 7000, y: 4800 });
const p = tela({ x: 0, y: 15000 });
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(120);
if (!(await ler()).escolhida) falhas.push('desistir: o clique de escolha não acendeu');
await page.mouse.click(vazio.x, vazio.y);
await page.waitForTimeout(120);
if ((await ler()).escolhida !== null) falhas.push('clique no vazio não desistiu da escolha');

await page.mouse.click(p.x, p.y);
await page.waitForTimeout(120);
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(120);
if ((await ler()).escolhida !== null) falhas.push('clicar duas vezes na MESMA ponta não desmarcou');

const fim = await ler();
// Nenhuma parede dos casos recusados pode ter andado desde o começo.
const mexeu = Object.entries(pontas(fim)).filter(([id, geo]) => antesDeTudo[id] !== geo);
if (mexeu.length !== 4) {
  falhas.push(`só as 4 paredes dos casos 1 e 2 podiam mudar; mudaram ${mexeu.length}`);
}

await browser.close();

console.log('estado final:', JSON.stringify(fim.walls, null, 1));
console.log(erros.length ? `ERROS NO CONSOLE:\n${erros.join('\n')}` : 'sem erro de console');
console.log(falhas.length ? `FALHAS:\n- ${falhas.join('\n- ')}` : 'CONFERÊNCIA OK');
console.log('prints em docs/spikes/juntar-pontas/');
process.exitCode = falhas.length || erros.length ? 1 : 0;
