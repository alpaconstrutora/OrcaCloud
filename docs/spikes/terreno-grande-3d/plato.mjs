/**
 * PORTÃO DA EDIÇÃO DO PLATÔ NO 3D (25/11/2026, P3 do platô desenhado — reel "Terrain Modification Tool").
 *
 * Abre o terreno grande com o platô editável (`?plato=1&editar=1`), acha as alças pela COR na foto (o disco branco puro da bolinha) e:
 *   1. arrasta a alça mais à direita 90 px para a direita → o anel muda e há 1 confirmação;
 *   2. arrasta outra alça e aperta Esc no meio → nada muda e nenhuma confirmação a mais;
 *   3. arrasta a ponta da seta (verde) 60 px para cima → a cota sobe e há mais 1 confirmação;
 *   4. (25/11, ajustes) botão direito numa bolinha → um canto a menos; duplo clique perto de um lado → um a mais;
 *      as bolinhas medem o mesmo na tela com zoom perto e longe (pedido: "do mesmo tamanho na tela em qualquer zoom");
 *   5. `?desenhar=1`: Esc no meio cancela; 4 cliques no terreno + clique no 1º canto entregam o contorno.
 * Lê o estado pelo espião do harness (`window.__plato3d`, `window.__confirmacoes`). Sai com 1 se falhar.
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

/** Centros dos grupos de pixels de uma cor (r,g,b ± tol), na tela. */
async function manchas(rgb, tol = 18, passo = 3, minimo = 4) {
  const png = await page.screenshot({ clip: caixa });
  return page.evaluate(
    async ({ b64, rgb, tol, passo, minimo }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const pts = [];
      for (let y = 0; y < c.height; y += passo)
        for (let x = 0; x < c.width; x += passo) {
          const i = (y * c.width + x) * 4;
          if (Math.abs(d[i] - rgb[0]) < tol && Math.abs(d[i + 1] - rgb[1]) < tol && Math.abs(d[i + 2] - rgb[2]) < tol) pts.push([x, y]);
        }
      // Agrupa por vizinhança simples (12 px).
      const grupos = [];
      for (const p of pts) {
        const g = grupos.find((g) => Math.hypot(g.x / g.n - p[0], g.y / g.n - p[1]) < 14);
        if (g) {
          g.x += p[0];
          g.y += p[1];
          g.n++;
        } else grupos.push({ x: p[0], y: p[1], n: 1 });
      }
      return grupos.filter((g) => g.n >= minimo).map((g) => ({ x: g.x / g.n, y: g.y / g.n, n: g.n }));
    },
    { b64: png.toString('base64'), rgb, tol, passo, minimo },
  );
}
/** As bolinhas dos cantos: o disco BRANCO puro (sem tone mapping), manchas pequenas — o rótulo da cota é maior. */
const bolinhas = async () => {
  const brancas = (await manchas([255, 255, 255], 6, 1, 6)).filter((m) => m.n <= 140);
  // Só a que tem o ARO AZUL em volta (os botões brancos do HTML entram na foto e não têm).
  const png = await page.screenshot({ clip: caixa });
  const comAro = await page.evaluate(
    async ({ b64, brancas }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const azul = (x, y) => {
        const i = (Math.round(y) * c.width + Math.round(x)) * 4;
        return d[i + 2] - d[i] > 90;
      };
      return brancas.map((b) => {
        let lados = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          let achou = false;
          for (let r = 2; r <= 9 && !achou; r++) achou = azul(b.x + dx * r, b.y + dy * r);
          if (achou) lados++;
        }
        return lados >= 3;
      });
    },
    { b64: png.toString('base64'), brancas },
  );
  return brancas.filter((_, i) => comAro[i]);
};
const estado = () => page.evaluate(() => ({ plato: window.__plato3d, confirmacoes: window.__confirmacoes ?? 0 }));
async function arrastar(de, dx, dy, { esc = false } = {}) {
  await page.mouse.move(caixa.x + de.x, caixa.y + de.y);
  await page.mouse.down();
  for (let k = 1; k <= 6; k++) {
    await page.mouse.move(caixa.x + de.x + (dx * k) / 6, caixa.y + de.y + (dy * k) / 6);
    await page.waitForTimeout(40);
    if (esc && k === 3) await page.keyboard.press('Escape');
  }
  await page.mouse.up();
  await page.waitForTimeout(700);
}

const falhas = [];
const inicio = await estado();
const alcas = (await bolinhas()).sort((a, b) => b.x - a.x);
if (alcas.length < 4) falhas.push(`esperava ≥ 4 alças, achei ${alcas.length}`);
await page.screenshot({ path: `${saida}/plato-3d-antes.png`, clip: caixa });

// 1. canto mais à direita, 90 px para a direita.
await arrastar(alcas[0], 90, 0);
const depois1 = await estado();
if (depois1.confirmacoes !== 1) falhas.push(`1º gesto: ${depois1.confirmacoes} confirmações (esperava 1)`);
if (JSON.stringify(depois1.plato.anel) === JSON.stringify(inicio.plato.anel)) falhas.push('1º gesto: o anel não mudou');
await page.screenshot({ path: `${saida}/plato-3d-canto.png`, clip: caixa });

// 2. outra alça com Esc no meio.
const alcas2 = (await bolinhas()).sort((a, b) => a.x - b.x);
await arrastar(alcas2[0], -60, 30, { esc: true });
const depois2 = await estado();
if (depois2.confirmacoes !== 1) falhas.push(`Esc: ${depois2.confirmacoes} confirmações (esperava continuar 1)`);
if (JSON.stringify(depois2.plato.anel) !== JSON.stringify(depois1.plato.anel)) falhas.push('Esc: o anel mudou');

// A câmera não pode ter girado com o Esc (a órbita religada com o botão apertado girava): as alças ficam no lugar.
// O rótulo da curva sob o mouse cobriria a bolinha: tira o mouse de cima (sem apertar) antes de contar.
await page.mouse.move(caixa.x + 20, caixa.y + caixa.height - 20);
await page.waitForTimeout(300);
const alcas2b = (await bolinhas()).sort((a, b) => a.x - b.x);
// A alça arrastada (a 1ª) fica de fora: o cursor em cima dela muda a mancha; as OUTRAS não podem ter andado.
if (process.env.DEPURAR) console.log(JSON.stringify({ alcas2, alcas2b }));
await page.screenshot({ path: `${saida}/plato-3d-esc.png`, clip: caixa });
const andou = alcas2.slice(1).map((a, i) => (alcas2b[i + 1] ? Math.hypot(a.x - alcas2b[i + 1].x, a.y - alcas2b[i + 1].y) : Infinity));
if (alcas2b.length !== alcas2.length || Math.max(...andou) > 4) falhas.push(`Esc: a câmera girou (alças andaram ${Math.round(Math.max(...andou))} px)`);
// 3. a seta (verde do PivotControls): a ponta = a mancha verde mais alta.
// Só manchas grandes: o ícone verde da barra do canto (4 px) não é a seta.
const verdes = (await manchas([120, 210, 140], 45)).filter((m) => m.n >= 8).sort((a, b) => a.y - b.y);
if (verdes.length === 0) falhas.push('não achei a seta verde');
else {
  await page.evaluate(() => (window.__previas = []));
  // Mais passos que os outros gestos: a realimentação (a seta subindo com a prévia) aparece como cota que DESCE.
  await page.mouse.move(caixa.x + verdes[0].x, caixa.y + verdes[0].y);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) {
    await page.mouse.move(caixa.x + verdes[0].x, caixa.y + verdes[0].y - 5 * k);
    await page.waitForTimeout(60);
  }
  await page.mouse.up();
  await page.waitForTimeout(700);
  const previas = await page.evaluate(() => window.__previas ?? []);
  const desceu = previas.some((c, i) => i > 0 && c < previas[i - 1] - 0.001);
  if (desceu) falhas.push(`seta: com o mouse só subindo, a cota da prévia desceu (${previas.join(' → ')})`);
  const depois3 = await estado();
  if (depois3.confirmacoes !== 2) falhas.push(`seta: ${depois3.confirmacoes} confirmações (esperava 2)`);
  if (!(depois3.plato.cotaM > depois2.plato.cotaM)) falhas.push(`seta: a cota não subiu (${depois2.plato.cotaM} → ${depois3.plato.cotaM})`);
  await page.screenshot({ path: `${saida}/plato-3d-seta.png`, clip: caixa });
  // Sensibilidade (prova em produção: 50 px ≈ +56 m num lote de 344 m): 60 px no lote de 346 m têm de dar pouco.
  const subidaNormal = depois3.plato.cotaM - depois2.plato.cotaM;
  if (subidaNormal > 12) falhas.push(`seta: sensível demais — 60 px subiram ${subidaNormal.toFixed(2)} m`);
  // Com Shift: ajuste fino (bem menor que o normal, mas ainda anda).
  const verdes2 = (await manchas([120, 210, 140], 45)).filter((m) => m.n >= 8).sort((a, b) => a.y - b.y);
  await page.keyboard.down('Shift');
  await page.mouse.move(caixa.x + verdes2[0].x, caixa.y + verdes2[0].y);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) {
    await page.mouse.move(caixa.x + verdes2[0].x, caixa.y + verdes2[0].y - 5 * k);
    await page.waitForTimeout(60);
  }
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForTimeout(700);
  const depois4 = await estado();
  const subidaFina = depois4.plato.cotaM - depois3.plato.cotaM;
  if (!(subidaFina > 0 && subidaFina < subidaNormal / 4)) falhas.push(`seta com Shift: subiu ${subidaFina.toFixed(2)} m (normal ${subidaNormal.toFixed(2)} m)`);
  console.log(JSON.stringify({ cotaAntes: depois2.plato.cotaM, normal: depois3.plato.cotaM, fino: depois4.plato.cotaM }));
}
// 4. Remover e inserir canto.
{
  const antes = await estado();
  const lista = (await bolinhas()).sort((a, b) => b.x - a.x);
  await page.mouse.click(caixa.x + lista[0].x, caixa.y + lista[0].y, { button: 'right' });
  await page.waitForTimeout(700);
  const semUm = await estado();
  if (semUm.plato.anel.length !== antes.plato.anel.length - 1) falhas.push(`botão direito: ${antes.plato.anel.length} → ${semUm.plato.anel.length} cantos`);
  if (semUm.confirmacoes !== antes.confirmacoes + 1) falhas.push('botão direito: sem confirmação');
  await page.screenshot({ path: `${saida}/plato-3d-sem-canto.png`, clip: caixa });
  const tri = await bolinhas();
  if (tri.length < 3) falhas.push(`depois de remover: ${tri.length} bolinhas`);
  else {
    const cx = tri.reduce((s, p) => s + p.x, 0) / tri.length;
    const cy = tri.reduce((s, p) => s + p.y, 0) / tri.length;
    const mx = (tri[0].x + tri[1].x) / 2;
    const my = (tri[0].y + tri[1].y) / 2;
    const alvo = { x: mx + (cx - mx) * 0.12, y: my + (cy - my) * 0.12 };
    await page.mouse.dblclick(caixa.x + alvo.x, caixa.y + alvo.y);
    await page.waitForTimeout(700);
    const comUm = await estado();
    if (comUm.plato.anel.length !== semUm.plato.anel.length + 1) falhas.push(`duplo clique: ${semUm.plato.anel.length} → ${comUm.plato.anel.length} cantos`);
    await page.screenshot({ path: `${saida}/plato-3d-canto-novo.png`, clip: caixa });
  }
  // Tamanho na tela: a mancha do aro de uma bolinha, longe e perto (roda do mouse), não pode mudar muito.
  const tam = async () => {
    const m = await bolinhas();
    return m.length ? m.reduce((s, p) => s + p.n, 0) / m.length : 0;
  };
  const longe = await tam();
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  for (let k = 0; k < 4; k++) {
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(700);
  const perto = await tam();
  await page.screenshot({ path: `${saida}/plato-3d-perto.png`, clip: caixa });
  console.log(JSON.stringify({ aroLonge: longe, aroPerto: perto }));
  if (!(longe > 0 && perto > 0 && perto / longe < 1.6 && longe / perto < 1.6)) falhas.push(`bolinha mudou de tamanho com o zoom (${longe.toFixed(0)} → ${perto.toFixed(0)} px)`);
}

// 5. Desenhar no 3D (?desenhar=1).
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
console.log(JSON.stringify({ alcas: alcas.length, anelAntes: inicio.plato.anel, anelDepois: depois1.plato.anel }));
console.log(falhas.length ? `❌ ${falhas.join(' · ')}` : '✅ canto e seta editam o platô; um confirmar por gesto; Esc desfaz; remover/inserir canto; bolinha de tamanho fixo; desenho no 3D');
await browser.close();
process.exit(falhas.length ? 1 : 0);
