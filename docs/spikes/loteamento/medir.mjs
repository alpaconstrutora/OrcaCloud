/**
 * Mede o desenho do LOTEAMENTO no canvas real, e é um PORTÃO (exit ≠ 0 reprova).
 *
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/loteamento/medir.mjs [urlBase] [pastaDeSaida]
 *
 * O que ele afirma, e por quê:
 *
 *  1. Os números do motor (áreas, testada, confrontantes) — se o motor calcular
 *     errado, o desenho continua bonito e ninguém vê.
 *  2. PIXELS de cada família no canvas. É a única prova de que a família
 *     ALCANÇA a tela: jsdom não pinta, então nenhum teste de componente pode
 *     dizer isso. Contar pixel é portão barato (lição da fase 14 da topografia,
 *     onde o harness passou e o lote pequeno reprovou em produção).
 *  3. O controle `?vazio=1`: o MESMO canvas sem loteamento tem de dar zero. Sem
 *     essa metade, "achei pixels" não discrimina nada — a medição poderia estar
 *     contando o fundo da tela.
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

const urlBase = process.argv[2] ?? 'http://localhost:3100';
const saida = process.argv[3] ?? 'C:/tmp';
const ALVO = `${urlBase}/docs/spikes/loteamento/index.html`;

const chromium = await loadChromium();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const erros = [];
page.on('pageerror', (e) => erros.push('PAGEERROR ' + e));
page.on('console', (m) => {
  if (m.type() === 'error') erros.push('CONSOLE ' + m.text());
});

/** Conta pixels por cor no canvas do editor, com tolerância por canal. */
async function contarCores(p) {
  return p.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const perto = (r, g, b, alvo, tol = 10) =>
      Math.abs(r - alvo[0]) <= tol && Math.abs(g - alvo[1]) <= tol && Math.abs(b - alvo[2]) <= tol;
    // ⚠️ A cor da caixa da via (#e5e7eb) é PARECIDA com o fundo do canvas: a
    // primeira medição contou 155 mil px de "via" no controle vazio, ou seja,
    // estava medindo o fundo. Por isso a via é contada só como "cinza que NÃO é
    // o fundo", e o veredito se apoia no verde e no traço, que são inequívocos.
    const cores = {
      verde: [187, 247, 208],
      branco: [255, 255, 255],
    };
    const conta = { branco: 0, verde: 0, tracoEscuro: 0, total: width * height };
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 32) continue;
      // ⚠️ A área pública é pintada com `globalAlpha = 0.7` SOBRE o branco, então
      // o pixel final não é o #bbf7d0 nominal: vira ~(207, 249, 222). Procurar a
      // cor exata dava zero e parecia "não pintou". O que identifica o verde é a
      // RELAÇÃO entre os canais, não o valor nominal.
      if (g > r + 15 && g > b + 8 && g > 180) conta.verde += 1;
      // ⚠️ O miolo do lote é branco, e o FUNDO do canvas também (#ffffff): contar
      // branco mediria a tela vazia. Fica no relatório como referência, fora do
      // veredito — quem decide são o verde e o traço.
      else if (perto(r, g, b, cores.branco, 2)) conta.branco += 1;
      // O contorno do lote (#475569) e o tracejado da quadra (#334155).
      else if (r < 100 && g < 110 && b < 130) conta.tracoEscuro += 1;
    }
    return conta;
  });
}

/**
 * Abre e AFASTA a vista até o loteamento caber.
 *
 * ⚠️ A vista nasce em 0,05 px/mm (1 m = 50 px): cabem 25 m de largura, e este
 * loteamento tem 96 m. Sem afastar, a praça fica fora da tela e a medição
 * acusaria "não pintou" uma coisa que pintou — foi o que aconteceu na primeira
 * rodada. O gesto é o real: roda do mouse sobre o canvas, como o usuário faz.
 */
async function abrir(url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const canvas = await page.$('canvas');
  if (canvas) {
    const caixa = await canvas.boundingBox();
    if (caixa) {
      await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
      // Cada passo afasta 1/1,15; 12 passos levam 0,05 a ~0,0093 px/mm (1 m = 9 px),
      // e os 96 m do loteamento passam a caber nos 1280 px da janela.
      for (let i = 0; i < 12; i += 1) await page.mouse.wheel(0, 120);
      await page.waitForTimeout(400);
    }
  }
  await page.waitForTimeout(600);
}

const linhas = [];
let falhas = 0;
const exigir = (ok, texto) => {
  linhas.push(`${ok ? 'ok  ' : 'FALHA'} ${texto}`);
  if (!ok) falhas += 1;
};

// ── 1. COM loteamento ────────────────────────────────────────────────────────
await abrir(ALVO);
const dados = await page.evaluate(() => window.__loteamento ?? null);
const comDesenho = await contarCores(page);
await page.screenshot({ path: path.join(saida, 'loteamento-desenho.png') });

if (!dados) {
  exigir(false, 'window.__loteamento não existe — o harness não montou');
} else {
  exigir(dados.quadras === 1 && dados.lotes === 5 && dados.vias === 2 && dados.areasPublicas === 1,
    `modelo: ${dados.quadras} quadra · ${dados.lotes} lotes · ${dados.vias} vias · ${dados.areasPublicas} área pública`);

  // 12 × 30 = 360 m², e a testada é o lado de 12 m que dá na Rua 1.
  exigir(dados.loteDoMeio?.areaM2 === 360, `lote do meio: ${dados.loteDoMeio?.areaM2} m² (esperado 360)`);
  exigir(dados.loteDoMeio?.testadaM === 12, `testada: ${dados.loteDoMeio?.testadaM} m (esperado 12)`);

  const papeis = (dados.loteDoMeio?.lados ?? []).map((l) => l.papel);
  exigir(papeis.filter((p) => p === 'FRENTE').length === 1, `1 frente (achou ${papeis.filter((p) => p === 'FRENTE').length})`);
  exigir(papeis.includes('FUNDO'), 'tem FUNDO');
  exigir(papeis.filter((p) => p.startsWith('LATERAL')).length === 2, '2 laterais');

  // O lote do meio confronta rua na frente e os vizinhos nas laterais.
  const conf = (dados.loteDoMeio?.lados ?? []).find((l) => l.papel === 'FRENTE')?.confrontante;
  exigir(conf === 'Rua 1', `confrontante da frente: ${conf} (esperado "Rua 1")`);
  const laterais = (dados.loteDoMeio?.lados ?? []).filter((l) => l.papel.startsWith('LATERAL')).map((l) => l.confrontante);
  exigir(laterais.every((c) => typeof c === 'string' && c.includes('Lote')),
    `confrontantes das laterais: ${laterais.join(' · ')}`);

  // Quadro de áreas: 5 lotes de 360 = 1.800 m², que é a gleba inteira aqui.
  const lotes = dados.areas.find((a) => a.chave === 'LOTES');
  exigir(lotes?.quantidade === 5 && Math.abs((lotes?.areaM2 ?? 0) - 1800) < 0.5,
    `quadro de áreas · lotes: ${lotes?.quantidade} un, ${lotes?.areaM2} m²`);
  const verde = dados.areas.find((a) => a.chave === 'VERDE');
  exigir(Math.abs((verde?.areaM2 ?? 0) - 540) < 0.5, `área verde: ${verde?.areaM2} m² (18 × 30 = 540)`);
  // A via entra pela FAIXA (102 m × 12 m), não pelo comprimento do eixo.
  exigir(Math.abs(dados.areaDaViaM2 - 1224) < 1, `faixa da Rua 1: ${dados.areaDaViaM2} m² (102 × 12 = 1.224)`);
}

if (!comDesenho) {
  exigir(false, 'não achei o canvas');
} else {
  linhas.push(`      pixels: branco ${comDesenho.branco} · verde ${comDesenho.verde} · traço ${comDesenho.tracoEscuro}`);
  exigir(comDesenho.verde > 2000, `a área verde pintou (${comDesenho.verde} px)`);
  exigir(comDesenho.tracoEscuro > 500, `os contornos de lote e quadra pintaram (${comDesenho.tracoEscuro} px)`);
}

// ── 2. O CONTROLE: sem loteamento, a mesma medição tem de dar ~zero ──────────
await abrir(`${ALVO}?vazio=1`);
const semDesenho = await contarCores(page);
await page.screenshot({ path: path.join(saida, 'loteamento-vazio.png') });
if (!semDesenho) {
  exigir(false, 'controle: não achei o canvas');
} else {
  linhas.push(`      controle: branco ${semDesenho.branco} · verde ${semDesenho.verde} · traço ${semDesenho.tracoEscuro}`);
  exigir(semDesenho.verde < 200, `sem loteamento não há verde (${semDesenho.verde} px)`);
  exigir(semDesenho.tracoEscuro < (comDesenho?.tracoEscuro ?? 0) / 4, `sem loteamento quase não há traço (${semDesenho.tracoEscuro} px)`);
}

exigir(erros.length === 0, erros.length === 0 ? 'nenhum erro de console' : `erros: ${erros.slice(0, 3).join(' | ')}`);

console.log(linhas.join('\n'));
console.log(falhas === 0 ? '\n✅ loteamento desenha e mede certo' : `\n❌ ${falhas} falha(s)`);
await browser.close();
process.exit(falhas === 0 ? 0 : 1);
