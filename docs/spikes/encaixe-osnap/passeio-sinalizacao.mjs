/**
 * A SINALIZAÇÃO do traçado de trecho, medida em navegador de verdade.
 *
 *   npx vite --port 3120
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core  *     node docs/spikes/encaixe-osnap/passeio-sinalizacao.mjs
 *
 * ⚠️ A prova é por PIXEL AZUL (#2563eb — a cor de prévia do editor, e nenhuma
 * peça de instalação a usa): os anéis e a linha em curso são feitos dela. Antes
 * da mudança, traçar um trecho não desenhava nada entre um clique e outro, e a
 * contagem tem de ser zero nesse estado.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const base = process.env.PLAYWRIGHT_CORE;
const m = await import(pathToFileURL(path.join(base, 'index.js')).href);
const chromium = m.chromium ?? m.default?.chromium;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });
const erros = [];
page.on('pageerror', (e) => erros.push(String(e)));
await page.goto('http://localhost:3120/docs/spikes/encaixe-osnap/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const caixa = await page.locator('canvas').boundingBox();
const E = 0.05;
const tela = (p) => ({ x: caixa.x + p.x * E + 60, y: caixa.y + caixa.height - 60 - p.y * E });
const azuis = () =>
  page.evaluate(() => {
    const c = document.querySelector('canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - 37) < 40 && Math.abs(d[i + 1] - 99) < 40 && Math.abs(d[i + 2] - 235) < 40) n++;
    }
    return n;
  });

const linhas = [];
const falhas = [];

// Dois pontos na parede, com a ferramenta TERMINAL.
await page.mouse.click(tela({ x: 2010, y: 3030 }).x, tela({ x: 2010, y: 3030 }).y);
await page.waitForTimeout(150);
await page.mouse.click(tela({ x: 4010, y: 3030 }).x, tela({ x: 4010, y: 3030 }).y);
await page.waitForTimeout(150);

// terminal → selecionar → rede
await page.locator('#ferramenta').click();
await page.waitForTimeout(100);
await page.locator('#ferramenta').click();
await page.waitForTimeout(200);
linhas.push(`ferramenta: ${JSON.parse(await page.locator('#dump').textContent()).ferramenta}`);

// 1. Passar o cursor SOBRE o primeiro ponto: o anel de alvo tem de aparecer.
const a = tela({ x: 2010, y: 3030 });
await page.mouse.move(a.x, a.y);
await page.waitForTimeout(250);
const sobrevoo = await azuis();
linhas.push(`azul com o cursor SOBRE a peça: ${sobrevoo}`);
if (sobrevoo < 20) falhas.push('o anel do ALVO não aparece ao passar sobre a peça');
await page.screenshot({ path: new URL('./sinal-alvo.png', import.meta.url).pathname.slice(1) });

// 2. Clicar: a origem fica marcada, e a linha em curso segue o cursor.
await page.mouse.click(a.x, a.y);
await page.waitForTimeout(150);
const b = tela({ x: 4010, y: 3030 });
await page.mouse.move(b.x, b.y);
await page.waitForTimeout(250);
const emCurso = await azuis();
linhas.push(`azul com a ORIGEM marcada e a linha em curso: ${emCurso}`);
if (emCurso <= sobrevoo) {
  falhas.push('depois do primeiro clique não há mais sinalização que antes dele');
}
await page.screenshot({ path: new URL('./sinal-em-curso.png', import.meta.url).pathname.slice(1) });

// 3. Escape cancela: a sinalização some.
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
const depoisDoEsc = await azuis();
linhas.push(`azul depois do Escape: ${depoisDoEsc}`);
// ⚠️ NÃO é zero, e não deve ser: o cursor continua sobre uma peça, com a
// ferramenta ativa, então o anel do ALVO segue desenhado — é o estado correto.
// O que tem de sumir é a ORIGEM e a LINHA. Um limiar de "zero" aqui reprovaria
// o comportamento certo, e foi o que reprovou na primeira medição.
if (depoisDoEsc > emCurso / 3) falhas.push('o Escape não cancelou o trecho em curso');
if (depoisDoEsc < 20) falhas.push('o anel do alvo sumiu junto — o Escape apagou demais');

if (erros.length) falhas.push(`erros: ${erros.join(' | ')}`);
for (const l of linhas) console.log(l);
for (const f of falhas) console.log(`❌ ${f}`);
if (!falhas.length) console.log('✅ tudo passou');
await browser.close();
process.exit(falhas.length ? 1 : 0);
