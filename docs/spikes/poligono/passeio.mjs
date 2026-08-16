/**
 * Desenha polígonos com ponteiro de verdade e confere o que saiu.
 *
 * Duas provas, de naturezas diferentes:
 *
 *   1. "o contorno FECHOU?" — por coordenada: o dump traz o número de paredes e
 *      de ambientes derivados. Um canto com folga de meia espessura é invisível
 *      na escala da tela, e é exatamente por isso que não se prova por print.
 *   2. "o gesto responde?" — por PIXEL: prévia no meio do arraste e resultado
 *      depois do segundo clique.
 *
 *   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
 *     node docs/spikes/poligono/passeio.mjs [urlBase]
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

const falhas = [];
const erros = [];

/**
 * Desenha um polígono de `lados` e devolve o estado final.
 *
 * O gesto é o do editor: clique no centro, mover até o vértice, clique fecha.
 */
async function desenhar(lados, { print } = {}) {
  const page = await browser.newPage({
    viewport: { width: 900, height: 900 },
    deviceScaleFactor: 2,
  });
  page.on('console', (m) => m.type() === 'error' && erros.push(`[${lados}] ${m.text()}`));
  page.on('pageerror', (e) => erros.push(`[${lados}] ${String(e)}`));

  await page.goto(`${urlBase}/docs/spikes/poligono/index.html?lados=${lados}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(400);

  const caixa = await page.locator('canvas').boundingBox();
  // Vista inicial conhecida por construção: 0,05 px/mm, origem a 60 px da borda
  // esquerda e do RODAPÉ (o Y do modelo aponta para cima).
  const ESCALA = 0.05;
  const tela = (p) => ({
    x: caixa.x + p.x * ESCALA + 60,
    y: caixa.y - p.y * ESCALA + (caixa.height - 60),
  });

  const centro = { x: 6000, y: 6000 };
  const vertice = { x: 10000, y: 6000 };

  await page.mouse.click(tela(centro).x, tela(centro).y);
  await page.waitForTimeout(120);

  // Parada no meio do caminho: é onde a PRÉVIA tem de estar desenhada.
  await page.mouse.move(tela(vertice).x, tela(vertice).y, { steps: 10 });
  await page.waitForTimeout(150);
  if (print) {
    await page.locator('#dump').evaluate((el) => (el.style.visibility = 'hidden'));
    await page.screenshot({ path: path.join(aqui, `saida-previa-${lados}.png`) });
    await page.locator('#dump').evaluate((el) => (el.style.visibility = 'visible'));
  }

  await page.mouse.click(tela(vertice).x, tela(vertice).y);
  await page.waitForTimeout(200);

  const estado = JSON.parse(await page.locator('#dump').textContent());
  if (print) {
    await page.locator('#dump').evaluate((el) => (el.style.visibility = 'hidden'));
    await page.screenshot({ path: path.join(aqui, `saida-${lados}-lados.png`) });
    await page.locator('#dump').evaluate((el) => (el.style.visibility = 'visible'));
  }

  await page.close();
  return estado;
}

// ── Cada número de lados produz N paredes e UM ambiente ─────────────────────
for (const lados of [3, 4, 5, 6, 8, 12]) {
  // 4 lados tem print obrigatório: é o caso do defeito relatado (o quadrado
  // saindo como losango). 3 e 6 mostram ímpar e par no mesmo olhar.
  const e = await desenhar(lados, { print: lados === 3 || lados === 4 || lados === 6 });

  if (e.paredes !== lados) {
    falhas.push(`${lados} lados produziram ${e.paredes} paredes`);
  }
  // A prova que importa: canto com folga não fecha contorno, e sem contorno
  // fechado não há ambiente. Um polígono que não deriva ambiente é decoração.
  if (e.ambientes !== 1) {
    falhas.push(`${lados} lados: ${e.ambientes} ambientes derivados, esperado 1`);
  }
  // Cantos compartilhados: a ponta de um lado é o começo do seguinte.
  for (let i = 0; i < e.eixos.length; i++) {
    const atual = e.eixos[i];
    const proxima = e.eixos[(i + 1) % e.eixos.length];
    if (atual[2] !== proxima[0] || atual[3] !== proxima[1]) {
      falhas.push(`${lados} lados: canto ${i} não fechou (${atual} → ${proxima})`);
    }
  }
}

// ── A área DECRESCE com o número de lados, para a mesma apótema ─────────────
//
// O arraste fixa a APÓTEMA (a distância até o meio do lado), então todos os
// polígonos circunscrevem o mesmo círculo: quanto mais lados, mais perto dele
// por fora — ou seja, MENOR área. Era o contrário quando o arraste fixava o
// raio até o vértice, e a inversão desta conferência é o que prova que a
// medida mudou de fato, não só o desenho.
const tri = await desenhar(3);
const doze = await desenhar(12);
if (!(doze.areaM2[0] < tri.areaM2[0])) {
  falhas.push(`área não decresceu com os lados: 3 → ${tri.areaM2[0]}, 12 → ${doze.areaM2[0]}`);
}

await browser.close();

console.log(`triângulo ${tri.areaM2[0]} m² · dodecágono ${doze.areaM2[0]} m²`);
console.log(erros.length ? `ERROS NO CONSOLE:\n${erros.join('\n')}` : 'sem erro de console');
console.log(falhas.length ? `FALHAS:\n- ${falhas.join('\n- ')}` : 'CONFERÊNCIA OK');
console.log('prints em docs/spikes/poligono/');
process.exitCode = falhas.length || erros.length ? 1 : 0;
