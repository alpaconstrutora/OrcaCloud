/**
 * O ímã prende SOBRE a parede, e a marca aparece?
 *
 *   npx vite --port 3107
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/encaixe-osnap/passeio.mjs [urlBase]
 *
 * ⚠️ A prova é por COORDENADA e por PIXEL, não por "parece certo":
 *
 *   1. o terminal criado perto do meio da parede tem de cair EM y = 3030 (o
 *      eixo) ou y = 3105/2955 (as faces) — e NÃO em 3000 nem 3100, que são o
 *      que a grade de 100 mm daria. Um passeio que aceitasse "perto" aprovaria
 *      o mundo sem encaixe nenhum, que é o que se quer reprovar;
 *   2. a MARCA é magenta (#c026d3) e essa cor não é usada em mais nada no
 *      desenho — procurá-la nos pixels responde "ela apareceu?" sem depender de
 *      alguém olhar o print;
 *   3. com o encaixe DESLIGADO, o mesmo gesto tem de cair na grade. Sem este
 *      terceiro caso, o passeio não distingue "o ímã funciona" de "a parede
 *      calhou de estar na grade".
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

const urlBase = process.argv[2] ?? 'http://localhost:3107';
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

await page.goto(`${urlBase}/docs/spikes/encaixe-osnap/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const caixa = await page.locator('canvas').boundingBox();
// A vista inicial é conhecida por construção: 0,05 px/mm, origem a 60 px da
// borda esquerda e a 60 px do RODAPÉ (o Y do modelo aponta para cima).
const ESCALA = 0.05;
const tela = (p) => ({
  x: caixa.x + p.x * ESCALA + 60,
  y: caixa.y + caixa.height - 60 - p.y * ESCALA,
});

const lerDump = async () => JSON.parse(await page.locator('#dump').textContent());

/** A contagem roda DENTRO da página, lendo o canvas real. */
const contarMagenta = () =>
  page.evaluate(() => {
    const c = document.querySelector('canvas');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      // #c026d3 com folga para a suavização de bordas.
      if (Math.abs(d[i] - 192) < 40 && d[i + 1] < 80 && Math.abs(d[i + 2] - 211) < 45) n++;
    }
    return n;
  });

const falhas = [];
const linhas = [];

// ── 1. LIGADO: mover perto do meio da parede ─────────────────────────────────
// O meio é (3510, 3030). Miramos 40 mm ACIMA do eixo — dentro do alcance
// (SNAP_PX 12 ÷ 0,05 = 240 mm) e longe de 3000/3100 da grade.
const alvo = tela({ x: 3510, y: 3070 });
await page.mouse.move(alvo.x, alvo.y);
await page.waitForTimeout(250);

const magentaLigado = await contarMagenta();
linhas.push(`pixels magenta com encaixe LIGADO: ${magentaLigado}`);
if (magentaLigado < 20) falhas.push('a MARCA do encaixe não apareceu na tela');

await page.mouse.click(alvo.x, alvo.y);
await page.waitForTimeout(200);
const d1 = await lerDump();
const t1 = d1.terminais[0];
linhas.push(`terminal com encaixe LIGADO: ${JSON.stringify(t1)}`);
if (!t1) falhas.push('nenhum terminal foi criado');
else {
  const naParede = [2955, 3030, 3105].includes(t1.y);
  const naGrade = t1.y % 100 === 0;
  if (!naParede) falhas.push(`y=${t1.y} não é o eixo (3030) nem as faces (2955/3105)`);
  if (naGrade && !naParede) falhas.push(`y=${t1.y} é ponto de GRADE — o ímã não agiu`);
}

await page.screenshot({ path: path.join(aqui, 'ligado.png') });

// ── 2. DESLIGADO: o mesmo gesto tem de cair na grade ─────────────────────────
await page.locator('#alternar').click();
await page.waitForTimeout(150);
await page.mouse.move(alvo.x + 3, alvo.y + 3);
await page.waitForTimeout(200);

const magentaDesligado = await contarMagenta();
linhas.push(`pixels magenta com encaixe DESLIGADO: ${magentaDesligado}`);
if (magentaDesligado > magentaLigado / 4) {
  falhas.push('a marca continua aparecendo com o encaixe desligado');
}

await page.mouse.click(alvo.x + 3, alvo.y + 3);
await page.waitForTimeout(200);
const d2 = await lerDump();
const t2 = d2.terminais[1];
linhas.push(`terminal com encaixe DESLIGADO: ${JSON.stringify(t2)}`);
if (!t2) falhas.push('o segundo terminal não foi criado');
else if (t2.y % 100 !== 0) {
  falhas.push(`com o ímã desligado, y=${t2.y} devia ser múltiplo de 100 (grade)`);
}

await page.screenshot({ path: path.join(aqui, 'desligado.png') });

if (erros.length) falhas.push(`erros no console: ${erros.join(' | ')}`);

console.log(linhas.join('\n'));
console.log(falhas.length ? `\n❌ ${falhas.length} FALHA(S):\n- ${falhas.join('\n- ')}` : '\n✅ tudo passou');
await browser.close();
process.exit(falhas.length ? 1 : 0);
