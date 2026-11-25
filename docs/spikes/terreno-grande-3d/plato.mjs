/**
 * PORTÃO DA EDIÇÃO DO PLATÔ NO 3D (25/11/2026) — os gestos do reel "Terrain Modification Tool".
 *
 * Abre o terreno grande com o platô editável (`?plato=1&editar=1`). As posições das alças NA TELA vêm do espião
 * do editor (`window.__platoNaTela`, ligado só pelo harness com `window.__depurarPlato3d`); o estado, de
 * `window.__plato3d` / `window.__confirmacoes` / `window.__previas`.
 *   1. arrasta o canto mais à direita 90 px → o anel muda, 1 confirmação;
 *   2. outro canto com Esc no meio → nada muda, nenhuma confirmação a mais, a câmera não girou;
 *   3. o ↕ do centro 60 px para cima → a cota sobe sem nunca descer no caminho, pouco (< 12 m); com Shift, bem menos;
 *   4. a pílula do meio de um lado → os DOIS cantos daquele lado andam, os outros ficam;
 *   5. botão direito num canto → um a menos; duplo clique perto de um lado → um a mais;
 *   6. a bolinha mede o mesmo na tela perto e longe;
 *   7. o rótulo da curva NÃO acende com o mouse sobre o platô (e acende no terreno — prova que o detector vê);
 *   8. `?desenhar=1`: Esc no meio cancela; 4 cliques + clique no 1º entregam o contorno.
 * Fotos: contorno tracejado no meio do arraste, lado aceso, linha guia da altura. Sai com 1 se falhar.
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/terreno-grande-3d/plato.mjs [urlBase] [pastaDeSaida]
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

const urlBase = process.argv[2] ?? 'http://localhost:3201';
const saida = process.argv[3] ?? 'C:/tmp';
const MINIMO = 300;
const browser = await (await loadChromium()).launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const erros = [];
page.on('pageerror', (e) => erros.push('PAGEERROR ' + e));
await page.goto(`${urlBase}/docs/spikes/terreno-grande-3d/index.html?curvas=1&estilo=MAQUETE&plato=1&editar=1`);
await page.waitForSelector('canvas');
await page.waitForTimeout(Number(process.env.ESPERA ?? 5000));
const caixa = await page.locator('canvas').first().boundingBox();

const estado = () => page.evaluate(() => ({ plato: window.__plato3d, confirmacoes: window.__confirmacoes ?? 0 }));
const naTela = () => page.evaluate(() => window.__platoNaTela);
const foto = (nome) => page.screenshot({ path: `${saida}/${nome}`, clip: caixa });
/** Arrasta de `de` (px do cliente) por (dx, dy) em `passos`; `esc` aperta Esc no meio; `meio` tira foto no meio. */
async function arrastar(de, dx, dy, { esc = false, passos = 6, shift = false, meio = null } = {}) {
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(de.x, de.y);
  await page.waitForTimeout(120);
  await page.mouse.down();
  for (let k = 1; k <= passos; k++) {
    await page.mouse.move(de.x + (dx * k) / passos, de.y + (dy * k) / passos);
    await page.waitForTimeout(50);
    if (esc && k === Math.ceil(passos / 2)) await page.keyboard.press('Escape');
    if (meio && k === Math.ceil(passos / 2)) await foto(meio);
  }
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
  await page.waitForTimeout(700);
}
/** Conta pixels de uma foto (do canvas inteiro ou de um recorte) que passam em `teste(r, g, b)`. */
async function contar(clip, teste) {
  const png = await page.screenshot({ clip });
  return page.evaluate(
    async ({ b64, teste }) => {
      const f = new Function('r', 'g', 'b', `return ${teste};`);
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (f(d[i], d[i + 1], d[i + 2])) n++;
      return n;
    },
    { b64: png.toString('base64'), teste },
  );
}
const escuros = () => contar(caixa, 'r < 50 && g < 50 && b < 50');
/** Pixels brancos puros num quadrado de `r` px em volta de `p` — o tamanho do disco da bolinha na tela. */
const brancoEmVolta = (p, r = 12) => contar({ x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r }, 'r > 249 && g > 249 && b > 249');
const longe = () => page.mouse.move(caixa.x + 10, caixa.y + 10).then(() => page.waitForTimeout(300));

const falhas = [];
const inicio = await estado();
const t0 = await naTela();
if (!t0 || t0.cantos.length !== inicio.plato.anel.length) falhas.push('o espião __platoNaTela não respondeu');
await foto('plato-3d-antes.png');

// 1. o canto mais à direita, 90 px para a direita (foto no meio: o contorno tracejado).
{
  const k = t0.cantos.reduce((m, c, i, a) => (c.x > a[m].x ? i : m), 0);
  await arrastar(t0.cantos[k], 90, 0, { meio: 'plato-3d-tracejado.png' });
  const d = await estado();
  if (d.confirmacoes !== 1) falhas.push(`1º gesto: ${d.confirmacoes} confirmações (esperava 1)`);
  if (JSON.stringify(d.plato.anel) === JSON.stringify(inicio.plato.anel)) falhas.push('1º gesto: o anel não mudou');
}
// 2. outro canto com Esc no meio: nada muda, e a câmera não gira (as alças ficam no lugar).
const depois1 = await estado();
{
  const t = await naTela();
  const k = t.cantos.reduce((m, c, i, a) => (c.x < a[m].x ? i : m), 0);
  await arrastar(t.cantos[k], -60, 30, { esc: true });
  await longe();
  const d = await estado();
  if (d.confirmacoes !== 1) falhas.push(`Esc: ${d.confirmacoes} confirmações (esperava continuar 1)`);
  if (JSON.stringify(d.plato.anel) !== JSON.stringify(depois1.plato.anel)) falhas.push('Esc: o anel mudou');
  const t2 = await naTela();
  const andou = Math.max(...t.cantos.map((c, i) => Math.hypot(c.x - t2.cantos[i].x, c.y - t2.cantos[i].y)));
  if (andou > 3) falhas.push(`Esc: a câmera girou (as alças andaram ${andou.toFixed(0)} px)`);
}
// 3. o ↕ do centro: 60 px para cima em 12 passos — a cota nunca desce no caminho (realimentação), sobe pouco.
const depois2 = await estado();
{
  const t = await naTela();
  await page.evaluate(() => (window.__previas = []));
  await arrastar(t.altura, 0, -60, { passos: 12, meio: 'plato-3d-altura.png' });
  const previas = await page.evaluate(() => window.__previas ?? []);
  if (previas.some((c, i) => i > 0 && c < previas[i - 1] - 0.001)) falhas.push(`altura: com o mouse só subindo, a cota desceu (${previas.join(' → ')})`);
  const d = await estado();
  if (d.confirmacoes !== 2) falhas.push(`altura: ${d.confirmacoes} confirmações (esperava 2)`);
  const subidaNormal = d.plato.cotaM - depois2.plato.cotaM;
  if (!(subidaNormal > 0)) falhas.push(`altura: a cota não subiu (${depois2.plato.cotaM} → ${d.plato.cotaM})`);
  if (subidaNormal > 12) falhas.push(`altura: sensível demais — 60 px subiram ${subidaNormal.toFixed(2)} m`);
  const t2 = await naTela();
  await arrastar(t2.altura, 0, -60, { passos: 12, shift: true });
  const d2 = await estado();
  const fina = d2.plato.cotaM - d.plato.cotaM;
  if (!(fina > 0 && fina < subidaNormal / 4)) falhas.push(`altura com Shift: subiu ${fina.toFixed(2)} m (normal ${subidaNormal.toFixed(2)} m)`);
  console.log(JSON.stringify({ cotaAntes: depois2.plato.cotaM, normal: d.plato.cotaM, fino: d2.plato.cotaM }));
}
// 4. a pílula de um lado: arrasta para fora do centro — os dois cantos do lado andam, os outros não.
{
  const antes = await estado();
  const t = await naTela();
  const n = t.lados.length;
  const i = t.lados.reduce((m, c, k, a) => (c.y > a[m].y ? k : m), 0); // o lado mais baixo na tela
  const c = t.altura;
  const v = { x: t.lados[i].x - c.x, y: t.lados[i].y - c.y };
  const l = Math.hypot(v.x, v.y) || 1;
  await page.mouse.move(t.lados[i].x, t.lados[i].y);
  await page.waitForTimeout(300);
  await foto('plato-3d-lado-aceso.png');
  await arrastar(t.lados[i], (v.x / l) * 50, (v.y / l) * 50);
  const d = await estado();
  const mudaram = antes.plato.anel.map((p, k) => p.x !== d.plato.anel[k].x || p.y !== d.plato.anel[k].y);
  const esperado = antes.plato.anel.map((_, k) => k === i || k === (i + 1) % n);
  if (JSON.stringify(mudaram) !== JSON.stringify(esperado)) falhas.push(`lado ${i}: mudaram ${JSON.stringify(mudaram)} (esperava ${JSON.stringify(esperado)})`);
  if (d.confirmacoes !== antes.confirmacoes + 1) falhas.push('lado: sem confirmação');
  await longe();
  await foto('plato-3d-lado.png');
}
// 5. remover e inserir canto.
{
  const antes = await estado();
  const t = await naTela();
  await page.mouse.click(t.cantos[0].x, t.cantos[0].y, { button: 'right' });
  await page.waitForTimeout(700);
  const semUm = await estado();
  if (semUm.plato.anel.length !== antes.plato.anel.length - 1) falhas.push(`botão direito: ${antes.plato.anel.length} → ${semUm.plato.anel.length} cantos`);
  const t2 = await naTela();
  // Perto do meio de um lado, puxado 25 % para o centro (dentro do platô, longe da pílula).
  const alvo = { x: t2.lados[0].x + (t2.altura.x - t2.lados[0].x) * 0.25, y: t2.lados[0].y + (t2.altura.y - t2.lados[0].y) * 0.25 };
  await page.mouse.dblclick(alvo.x, alvo.y);
  await page.waitForTimeout(700);
  const comUm = await estado();
  if (comUm.plato.anel.length !== semUm.plato.anel.length + 1) falhas.push(`duplo clique: ${semUm.plato.anel.length} → ${comUm.plato.anel.length} cantos`);
}
// 6. a bolinha mede o mesmo na tela, longe e perto (roda do mouse).
{
  await longe();
  const t = await naTela();
  // O canto mais perto do centro do canvas: o zoom é para o centro, então ele continua na tela.
  const meioDaTela = { x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 };
  const k = t.cantos.reduce((m, c, i, l) => (Math.hypot(c.x - meioDaTela.x, c.y - meioDaTela.y) < Math.hypot(l[m].x - meioDaTela.x, l[m].y - meioDaTela.y) ? i : m), 0);
  const a = await brancoEmVolta(t.cantos[k]);
  await page.mouse.move(meioDaTela.x, meioDaTela.y);
  for (let k = 0; k < 4; k++) {
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(150);
  }
  await longe();
  await page.waitForTimeout(500);
  const t2 = await naTela();
  const dentro = (p) => p.x > caixa.x + 14 && p.x < caixa.x + caixa.width - 14 && p.y > caixa.y + 14 && p.y < caixa.y + caixa.height - 14;
  const b = dentro(t2.cantos[k]) ? await brancoEmVolta(t2.cantos[k]) : -1;
  await foto('plato-3d-perto.png');
  console.log(JSON.stringify({ discoLonge: a, discoPerto: b }));
  if (!(a > 10 && b > 10 && b / a < 1.6 && a / b < 1.6)) falhas.push(`bolinha mudou de tamanho com o zoom (${a} → ${b} px)`);
}
// 7. o rótulo da curva não acende sobre o platô (e acende no terreno, longe dele).
{
  await longe();
  const base = await escuros();
  const t = await naTela();
  // Sobre o platô: entre o centro e um canto (fora do ↕).
  const sobre = { x: (t.altura.x * 2 + t.cantos[0].x) / 3, y: (t.altura.y * 2 + t.cantos[0].y) / 3 };
  await page.mouse.move(sobre.x - 4, sobre.y - 4);
  await page.mouse.move(sobre.x, sobre.y, { steps: 4 });
  await page.waitForTimeout(800);
  await foto('plato-3d-hover-no-plato.png');
  const noPlato = await escuros();
  await longe();
  const fora = { x: caixa.x + caixa.width * 0.5, y: caixa.y + caixa.height * 0.78 };
  await page.mouse.move(fora.x - 4, fora.y - 4);
  await page.mouse.move(fora.x, fora.y, { steps: 4 });
  await page.waitForTimeout(800);
  await foto('plato-3d-hover-no-terreno.png');
  const noTerreno = await escuros();
  await longe();
  console.log(JSON.stringify({ escurosBase: base, noPlato, noTerreno }));
  if (noPlato - base >= MINIMO / 3) falhas.push(`o rótulo da curva acendeu sobre o platô (+${noPlato - base} px escuros)`);
  if (noTerreno - base < MINIMO) falhas.push(`o detector não viu a curva acender no terreno (+${noTerreno - base}) — o item 7 não provou nada`);
}

// 8. Desenhar no 3D (?desenhar=1).
{
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  p2.on('pageerror', (e) => erros.push('PAGEERROR(desenhar) ' + e));
  await p2.goto(`${urlBase}/docs/spikes/terreno-grande-3d/index.html?curvas=1&estilo=MAQUETE&desenhar=1`);
  await p2.waitForSelector('canvas');
  await p2.waitForTimeout(Number(process.env.ESPERA ?? 5000));
  const c2 = await p2.locator('canvas').first().boundingBox();
  const cx = c2.x + c2.width / 2;
  const cy = c2.y + c2.height / 2;
  const cantos = [
    [cx - 90, cy - 50],
    [cx + 90, cy - 50],
    [cx + 90, cy + 60],
    [cx - 90, cy + 60],
  ];
  // Esc cancela o que estava marcado.
  await p2.mouse.click(...cantos[0]);
  await p2.mouse.click(...cantos[1]);
  await p2.waitForTimeout(300);
  await p2.keyboard.press('Escape');
  await p2.waitForTimeout(300);
  // Com Shift (sem a trava de 90°): a câmera olha na diagonal, e um retângulo NA TELA travado alinharia 3 cantos.
  await p2.keyboard.down('Shift');
  for (const c of cantos) {
    await p2.mouse.click(...c);
    await p2.waitForTimeout(250);
  }
  await p2.keyboard.up('Shift');
  await p2.mouse.move(cx, cy + 10);
  await p2.waitForTimeout(400);
  await p2.screenshot({ path: `${saida}/plato-3d-desenhando.png`, clip: c2 });
  const antesDeFechar = await p2.evaluate(() => window.__anelDesenhado ?? null);
  if (antesDeFechar) falhas.push('desenhar: entregou o contorno antes de fechar');
  await p2.mouse.click(...cantos[0]);
  await p2.waitForTimeout(500);
  const anel = await p2.evaluate(() => window.__anelDesenhado ?? null);
  console.log(JSON.stringify({ desenhado: anel }));
  if (!anel) falhas.push('desenhar: clicar no 1º canto não fechou o contorno');
  else if (anel.length !== 4) falhas.push(`desenhar: ${anel.length} cantos (esperava 4 — o Esc tinha de ter limpado os 2 primeiros)`);
  await p2.close();
}

if (erros.length) falhas.push(...erros);
console.log(falhas.length ? `❌ ${falhas.join(' · ')}` : '✅ canto, lado e altura editam o platô; Esc desfaz; remover/inserir; bolinha fixa na tela; curva não acende sobre o platô; desenho no 3D');
await browser.close();
process.exit(falhas.length ? 1 : 0);
