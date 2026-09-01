/**
 * Arrasta uma viga para perto de um pilar e confere se os círculos grudaram.
 *
 *   npx vite --port 3103
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/conexao-automatica/passeio.mjs [urlBase]
 *
 * Três perguntas:
 *
 *   1. o canto da viga coincide EXATAMENTE com o canto do pilar? (coordenada —
 *      50 mm de erro dariam 2,5 px, invisíveis num print);
 *   2. o passeio distingue os dois mundos? O destino sem conexão é o ponto de
 *      grade (800, 1600), e ele é REPROVADO por nome;
 *   3. a marca verde aparece enquanto o gesto está grudado? (pixel — é o que
 *      explica o salto dos últimos milímetros).
 *
 * Depois, uma quarta: arrastar para LONGE do pilar não pode grudar em nada.
 * Encaixe que gruda sempre é encaixe que não se pode desligar.
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

const urlBase = process.argv[2] ?? 'http://localhost:3103';
const aqui = path.dirname(fileURLToPath(import.meta.url));

const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });

const erros = [];
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(String(e)));

await page.goto(`${urlBase}/docs/spikes/conexao-automatica/index.html`, {
  waitUntil: 'networkidle',
});
await page.waitForTimeout(400);

const caixa = await page.locator('canvas').boundingBox();

// Vista inicial conhecida por construção: 0,05 px/mm, origem a 60 px da borda
// esquerda e a 60 px do RODAPÉ (o Y do modelo aponta para cima).
const ESCALA = 0.05;
const tela = (p) => ({
  x: caixa.x + p.x * ESCALA + 60,
  y: caixa.y - p.y * ESCALA + (caixa.height - 60),
});

const ler = async () => JSON.parse(await page.locator('#dump').textContent());

// ── O arraste ────────────────────────────────────────────────────────────────
// Pega a viga pelo MEIO (é onde a mão pega) e leva a um ponto 37 mm à direita e
// 21 mm abaixo do alinhamento perfeito: perto o bastante para a conexão pegar,
// longe o bastante para a grade dar outra resposta.
const pegar = { x: 2500, y: 3000 };
const soltar = { x: 2500 + 837, y: 3000 + 1621 };

await page.mouse.move(tela(pegar).x, tela(pegar).y);
await page.mouse.down();
await page.mouse.move(tela(soltar).x, tela(soltar).y, { steps: 12 });
await page.waitForTimeout(150);

// O print SAI COM O BOTÃO AINDA APERTADO: a marca da conexão vive só enquanto o
// gesto dura, de propósito.
await page.screenshot({
  path: path.join(aqui, 'saida-conexao.png'),
  clip: {
    x: tela({ x: 3900, y: 0 }).x,
    y: tela({ x: 0, y: 5600 }).y,
    width: 300,
    height: 220,
  },
});

// Amostra do pixel no ponto de encontro, para provar que a marca verde está lá.
const verde = await page.evaluate((alvoTela) => {
  const c = document.querySelector('canvas');
  const ctx = c.getContext('2d');
  const r = c.getBoundingClientRect();
  // O canvas tem backing store maior que o CSS (devicePixelRatio).
  const fx = c.width / r.width;
  const fy = c.height / r.height;
  // Varre um quadradinho em volta do ponto: o anel tem 8 px de raio, então a
  // tinta não está exatamente no centro.
  let achou = null;
  for (let dx = -10; dx <= 10 && !achou; dx++) {
    for (let dy = -10; dy <= 10 && !achou; dy++) {
      const px = Math.round((alvoTela.x - r.left + dx) * fx);
      const py = Math.round((alvoTela.y - r.top + dy) * fy);
      const d = ctx.getImageData(px, py, 1, 1).data;
      // #059669 → (5, 150, 105). Tolerância folgada por causa da suavização.
      if (Math.abs(d[0] - 5) < 60 && Math.abs(d[1] - 150) < 60 && Math.abs(d[2] - 105) < 60) {
        achou = { r: d[0], g: d[1], b: d[2] };
      }
    }
  }
  return achou;
}, tela({ x: 4800, y: 4800 }));

await page.mouse.up();
await page.waitForTimeout(200);

const depois = await ler();

// ── Arrastar para longe não pode grudar ──────────────────────────────────────
await page.mouse.move(tela({ x: 3300, y: 4650 }).x, tela({ x: 3300, y: 4650 }).y);
await page.mouse.down();
await page.mouse.move(
  tela({ x: 3300 - 2137, y: 4650 - 1621 }).x,
  tela({ x: 3300 - 2137, y: 4650 - 1621 }).y,
  { steps: 12 },
);
await page.mouse.up();
await page.waitForTimeout(200);

const longe = await ler();
await browser.close();

// ── Conferência ──────────────────────────────────────────────────────────────
const falhas = [];
const txt = (p) => (p ? `(${p.x}, ${p.y})` : 'nenhum');
const eq = (p, q) => p && q && p.x === q.x && p.y === q.y;

// A viga andou (800, 1650): o canto de cima à direita, que era (4000, 3150), tem
// de cair em (4800, 4800), que é o canto de baixo à esquerda do pilar.
const ESPERADO = [
  { x: 1800, y: 4650 },
  { x: 4800, y: 4650 },
];
const DA_GRADE = [
  { x: 1800, y: 4600 },
  { x: 4800, y: 4600 },
];

if (!eq(depois.viga.pontos[0], ESPERADO[0]) || !eq(depois.viga.pontos[1], ESPERADO[1])) {
  const caiuNaGrade =
    eq(depois.viga.pontos[0], DA_GRADE[0]) && eq(depois.viga.pontos[1], DA_GRADE[1]);
  falhas.push(
    caiuNaGrade
      ? `a viga parou na GRADE ${txt(depois.viga.pontos[1])} — a conexão não pegou`
      : `viga em ${txt(depois.viga.pontos[0])}–${txt(depois.viga.pontos[1])}, ` +
        `esperado ${txt(ESPERADO[0])}–${txt(ESPERADO[1])}`,
  );
}

// O canto tem de existir em cima do canto do pilar — a prova direta do pedido.
const cantoDaViga = depois.vigaConexao.cantos.find((c) => c.x === 4800 && c.y === 4800);
const cantoDoPilar = depois.pilarConexao.cantos.find((c) => c.x === 4800 && c.y === 4800);
if (!cantoDaViga || !cantoDoPilar) {
  falhas.push(
    `os dois círculos não coincidem em (4800, 4800): viga ${cantoDaViga ? 'sim' : 'não'}, ` +
      `pilar ${cantoDoPilar ? 'sim' : 'não'}`,
  );
}

if (!verde) falhas.push('a marca verde da conexão não apareceu no ponto de encontro');

// Longe do pilar, o arraste tem de obedecer só à grade: (−2137, −1621) → (−2100, −1600).
const LONGE_ESPERADO = [
  { x: -300, y: 3050 },
  { x: 2700, y: 3050 },
];
if (!eq(longe.viga.pontos[0], LONGE_ESPERADO[0]) || !eq(longe.viga.pontos[1], LONGE_ESPERADO[1])) {
  falhas.push(
    `longe do pilar a viga foi para ${txt(longe.viga.pontos[0])}–${txt(longe.viga.pontos[1])}, ` +
      `esperado ${txt(LONGE_ESPERADO[0])}–${txt(LONGE_ESPERADO[1])} (só a grade)`,
  );
}

console.log('viga após o arraste:', JSON.stringify(depois.viga.pontos));
console.log('cantos da viga:', JSON.stringify(depois.vigaConexao.cantos));
console.log('marca verde:', verde ? JSON.stringify(verde) : 'não encontrada');
console.log('viga após o arraste para longe:', JSON.stringify(longe.viga.pontos));
console.log(erros.length ? `ERROS NO CONSOLE:\n${erros.join('\n')}` : 'sem erro de console');
console.log(falhas.length ? `FALHAS:\n- ${falhas.join('\n- ')}` : 'CONFERÊNCIA OK');
console.log('print em docs/spikes/conexao-automatica/saida-conexao.png');
process.exitCode = falhas.length || erros.length ? 1 : 0;
