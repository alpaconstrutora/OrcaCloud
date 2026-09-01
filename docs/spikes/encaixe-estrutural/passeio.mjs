/**
 * Clica perto do canto e perto da ponta do eixo de uma VIGA, e confere onde o
 * ponto aterrissou.
 *
 *   npx vite --port 3103
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/encaixe-estrutural/passeio.mjs [urlBase]
 *
 * A prova é por COORDENADA, não por print: 15 mm de diferença entre o canto
 * (y = 3385) e o ponto de grade ao lado (y = 3400) dão 0,75 px na escala da
 * tela — invisível num screenshot, e é exatamente por isso que a falta de
 * encaixe no concreto passou despercebida. O print serve só para a terceira
 * pergunta, que é de desenho: os pontos de conexão APARECEM nos cantos?
 *
 * Cada alvo vem com o que a grade daria no lugar, e o passeio REPROVA se o
 * resultado for o da grade — medição que não distingue os dois mundos não mede
 * nada.
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

await page.goto(`${urlBase}/docs/spikes/encaixe-estrutural/index.html`, {
  waitUntil: 'networkidle',
});
await page.waitForTimeout(400);

const caixa = await page.locator('canvas').boundingBox();

// A vista inicial é conhecida por construção (0,05 px/mm; origem a 60 px da
// borda esquerda e a 60 px do RODAPÉ, porque o Y do modelo aponta para cima).
const ESCALA = 0.05;
const tela = (p) => ({
  x: caixa.x + p.x * ESCALA + 60,
  y: caixa.y - p.y * ESCALA + (caixa.height - 60),
});

const clicar = async (p) => {
  const t = tela(p);
  await page.mouse.move(t.x, t.y, { steps: 5 });
  await page.waitForTimeout(60);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(80);
};

// ── 1. o canto inferior esquerdo da viga ─────────────────────────────────────
// Mira 56 mm fora dele — dentro do raio de encaixe (240 mm), e longe demais da
// ponta do eixo (608 mm) para ela concorrer.
await clicar({ x: 2040, y: 3345 });
await clicar({ x: 2000, y: 9000 });
await page.keyboard.press('Escape');
await page.waitForTimeout(120);

// ── 2. a ponta do eixo, do outro lado ────────────────────────────────────────
await clicar({ x: 6050, y: 4040 });
await clicar({ x: 9000, y: 4000 });
await page.keyboard.press('Escape');
await page.waitForTimeout(150);

// ── 3. o print dos pontos de conexão ─────────────────────────────────────────
// Recorte apertado na ponta esquerda da viga: é onde as duas coisas convivem —
// o quadrado da alça, no eixo, e os círculos dos cantos.
await page.screenshot({
  path: path.join(aqui, 'saida-pontos.png'),
  clip: {
    x: tela({ x: 1400, y: 0 }).x,
    y: tela({ x: 0, y: 5200 }).y,
    width: 260,
    height: 190,
  },
});

const dump = JSON.parse(await page.locator('#dump').textContent());
await browser.close();

// ── Conferência ──────────────────────────────────────────────────────────────
const falhas = [];
const eq = (p, q) => p && q && p.x === q.x && p.y === q.y;
const txt = (p) => (p ? `(${p.x}, ${p.y})` : 'nenhum');

const ALVOS = [
  { nome: 'canto da viga', esperado: { x: 2000, y: 3385 }, grade: { x: 2000, y: 3300 } },
  { nome: 'ponta do eixo', esperado: { x: 6010, y: 4000 }, grade: { x: 6100, y: 4000 } },
];

if (dump.paredes.length !== ALVOS.length) {
  falhas.push(`paredes criadas: ${dump.paredes.length}, esperado ${ALVOS.length}`);
}

ALVOS.forEach((alvo, i) => {
  const a = dump.paredes[i]?.a;
  if (eq(a, alvo.esperado)) return;
  falhas.push(
    eq(a, alvo.grade)
      ? `${alvo.nome}: caiu na GRADE ${txt(a)} — o encaixe no concreto não pegou`
      : `${alvo.nome}: ${txt(a)} ≠ ${txt(alvo.esperado)}`,
  );
});

// A peça tem de OFERECER os quatro cantos, senão o item acima passaria por
// acaso (um canto certo e três inexistentes).
if (dump.conexao.cantos.length !== 4) {
  falhas.push(`cantos oferecidos: ${dump.conexao.cantos.length}, esperado 4`);
}
if (dump.conexao.eixo.length !== 2) {
  falhas.push(`pontas de eixo oferecidas: ${dump.conexao.eixo.length}, esperado 2`);
}

console.log('conexão:', JSON.stringify(dump.conexao));
console.log('paredes:', JSON.stringify(dump.paredes));
console.log(erros.length ? `ERROS NO CONSOLE:\n${erros.join('\n')}` : 'sem erro de console');
console.log(falhas.length ? `FALHAS:\n- ${falhas.join('\n- ')}` : 'CONFERÊNCIA OK');
console.log('print em docs/spikes/encaixe-estrutural/saida-pontos.png');
process.exitCode = falhas.length || erros.length ? 1 : 0;
