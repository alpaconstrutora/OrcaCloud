/**
 * Traça um contorno pela FACE, com ponteiro de verdade, e confere o resultado.
 *
 * Duas perguntas, dois tipos de prova:
 *
 *   1. "o ponto clicado é o canto da parede, e o canto FECHA?" — prova por
 *      coordenada: o dump do harness traz os eixos e o ambiente derivado. Print
 *      não serve aqui, porque um vão de meia espessura no canto é invisível na
 *      escala da tela (é exatamente por isso que o defeito passou).
 *   2. "o rótulo saiu de cima da parede?" — prova por PIXEL: recorte apertado no
 *      meio do trecho em curso, para se ver o número fora da faixa.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/parede-face/passeio.mjs [urlBase]
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
  viewport: { width: 1200, height: 800 },
  deviceScaleFactor: 2,
});

const erros = [];
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(String(e)));

await page.goto(`${urlBase}/docs/spikes/parede-face/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const caixa = await page.locator('canvas').boundingBox();

// A vista inicial é conhecida por construção (0,05 px/mm; origem a 60 px da
// borda esquerda e a 60 px do RODAPÉ, porque o Y do modelo aponta para cima).
// Calcular o clique em vez de tentar: enquadrar por tentativa já errou o alvo
// duas vezes em harness anterior.
const ESCALA = 0.05;
const dx = 60;
const dy = caixa.height - 60;
const tela = (p) => ({
  x: caixa.x + p.x * ESCALA + dx,
  y: caixa.y - p.y * ESCALA + dy,
});

// Contorno pelo lado de FORA, no sentido do relógio na tela. Com "parede à
// direita" isso faz a parede nascer para dentro do que foi apontado.
const contorno = [
  { x: 2000, y: 9000 },
  { x: 14000, y: 9000 },
  { x: 14000, y: 2000 },
  { x: 2000, y: 2000 },
];

// Primeiro clique, e uma parada no MEIO do primeiro trecho para o print do
// rótulo: é ali que ele antes caía dentro da faixa da parede.
await page.mouse.move(tela(contorno[0]).x, tela(contorno[0]).y);
await page.mouse.down();
await page.mouse.up();

const meio = { x: 8000, y: 9000 };
await page.mouse.move(tela(meio).x, tela(meio).y, { steps: 8 });
await page.waitForTimeout(150);
await page.screenshot({
  path: path.join(aqui, 'saida-rotulo.png'),
  clip: {
    x: tela({ x: 4200, y: 9000 }).x,
    y: tela({ x: 0, y: 9000 }).y - 90,
    width: 300,
    height: 180,
  },
});

for (const p of contorno.slice(1)) {
  await page.mouse.move(tela(p).x, tela(p).y, { steps: 6 });
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(80);
}
// Volta ao primeiro ponto: é o clique que FECHA o contorno.
await page.mouse.move(tela(contorno[0]).x, tela(contorno[0]).y, { steps: 6 });
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(200);

await page.screenshot({ path: path.join(aqui, 'saida-contorno.png') });

const dump = JSON.parse(await page.locator('#dump').textContent());

// ── Conferência ──────────────────────────────────────────────────────────────
const falhas = [];
const eq = (p, q) => p.x === q.x && p.y === q.y;

if (dump.paredes.length !== 4) falhas.push(`paredes: ${dump.paredes.length}, esperado 4`);

for (let i = 0; i < dump.paredes.length; i++) {
  const atual = dump.paredes[i];
  const proxima = dump.paredes[(i + 1) % dump.paredes.length];
  if (!eq(atual.b, proxima.a)) {
    falhas.push(
      `canto ${i} aberto: ${JSON.stringify(atual.b)} ≠ ${JSON.stringify(proxima.a)}`,
    );
  }
}

// O ponto CLICADO tem de ser canto do corpo: com a parede à direita e o contorno
// no sentido do relógio, o eixo fica meia espessura para dentro em cada lado.
const xs = dump.paredes.flatMap((w) => [w.a.x, w.b.x]);
const ys = dump.paredes.flatMap((w) => [w.a.y, w.b.y]);
const esperado = { x0: 2600, x1: 13400, y0: 2600, y1: 8400 };
if (Math.min(...xs) !== esperado.x0) falhas.push(`x mínimo ${Math.min(...xs)} ≠ ${esperado.x0}`);
if (Math.max(...xs) !== esperado.x1) falhas.push(`x máximo ${Math.max(...xs)} ≠ ${esperado.x1}`);
if (Math.min(...ys) !== esperado.y0) falhas.push(`y mínimo ${Math.min(...ys)} ≠ ${esperado.y0}`);
if (Math.max(...ys) !== esperado.y1) falhas.push(`y máximo ${Math.max(...ys)} ≠ ${esperado.y1}`);

const areaEsperada = (esperado.x1 - esperado.x0) * (esperado.y1 - esperado.y0);
if (dump.ambientes.length !== 1) {
  falhas.push(`ambientes: ${dump.ambientes.length}, esperado 1 (contorno não fechou)`);
} else if (dump.ambientes[0].areaMm2 !== areaEsperada) {
  falhas.push(`área ${dump.ambientes[0].areaMm2} ≠ ${areaEsperada}`);
}

// ── Barra de espaço inverte o lado ───────────────────────────────────────────
//
// Duas coisas para provar. (1) A tecla realmente inverte: o mesmo traçado, com o
// lado invertido, tem de produzir eixo do OUTRO lado da linha clicada. (2)
// Invertendo no MEIO da cadeia, a junção não pode mitrar — mitrar ali corrigiria
// a ponta da parede anterior por uma conta do lado novo e a deixaria torta, com o
// eixo fora de paralelo com o que a pessoa traçou.
const clicar = async (p) => {
  const t = tela(p);
  await page.mouse.move(t.x, t.y, { steps: 5 });
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(80);
};

// Cadeia nova, acima do contorno anterior (a vista mostra até y ≈ 14800 mm).
// Primeiro trecho com a parede à DIREITA…
await clicar({ x: 4000, y: 11000 });
await clicar({ x: 10000, y: 11000 });
// …espaço, e o segundo trecho com a parede à ESQUERDA.
await page.keyboard.press('Space');
await page.waitForTimeout(80);
await clicar({ x: 10000, y: 13000 });
await page.waitForTimeout(150);

const depois = JSON.parse(await page.locator('#dump').textContent());
if (depois.alinhamento !== 'ESQUERDA') {
  falhas.push(`espaço não inverteu o lado: ${depois.alinhamento}`);
}
const novas = depois.paredes.slice(4);
if (novas.length !== 2) {
  falhas.push(`trechos após a inversão: ${novas.length}, esperado 2`);
} else {
  // Trecho 1: traçado em y=11000 indo para +x, parede à direita → eixo em y menor.
  if (novas[0].a.y !== 10400 || novas[0].b.y !== 10400) {
    falhas.push(`antes da inversão o eixo saiu em ${novas[0].a.y}, esperado 10400`);
  }
  // Trecho 2: traçado em x=10000 subindo, parede à ESQUERDA → eixo em x menor
  // (à direita seria 10600).
  if (novas[1].a.x !== 9400 || novas[1].b.x !== 9400) {
    falhas.push(`depois da inversão o eixo saiu em ${novas[1].a.x}, esperado 9400`);
  }
  // A junção NÃO mitra: a ponta do trecho 1 fica onde nasceu.
  if (novas[0].b.x !== 10000) {
    falhas.push(`a ponta do trecho anterior foi mexida (${novas[0].b.x}), devia ficar em 10000`);
  }
}

await page.screenshot({ path: path.join(aqui, 'saida-inversao.png') });
await browser.close();

console.log(JSON.stringify(dump.paredes, null, 1));
console.log('após inverter:', depois.alinhamento, JSON.stringify(depois.paredes.slice(4)));
console.log(erros.length ? `ERROS NO CONSOLE:\n${erros.join('\n')}` : 'sem erro de console');
console.log(falhas.length ? `FALHAS:\n- ${falhas.join('\n- ')}` : 'CONFERÊNCIA OK');
console.log('prints em docs/spikes/parede-face/');
process.exitCode = falhas.length || erros.length ? 1 : 0;
