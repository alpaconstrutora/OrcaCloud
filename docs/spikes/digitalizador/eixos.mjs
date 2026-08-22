/**
 * Spike C — rodada 6: RETÂNGULO → EIXO.
 *
 *   node docs/spikes/digitalizador/eixos.mjs <prancha.pdf> [x0 x1 y0 y1]
 *
 * É a única etapa pendente entre "extrair parede funciona" (rodada 1) e
 * "gerar parede editável no editor". Ela é GEOMÉTRICA, não semântica — não
 * depende do bloqueio de fechar vão que travou a derivação de AMBIENTE, e por
 * isso pode andar enquanto o multimodal segue adiado.
 *
 * O que a rodada 1 descobriu e não explorou: o CAD exporta cada parede como um
 * retângulo fechado INDEPENDENTE. Ela tratou isso como obstáculo ("falta parear
 * faces opostas") e partiu para pareamento por distância. Mas se cada parede é
 * um retângulo próprio, ela também é um SUBPATH próprio — e o agrupamento por
 * subpath entrega o retângulo de graça, sem heurística nenhuma.
 *
 * Esta rodada testa exatamente isso, e mede o que sobra para o pareamento
 * geométrico resolver.
 *
 * ── CRITÉRIO ────────────────────────────────────────────────────────────────
 * Não é "fechou ambiente" — ambiente é o problema semântico, e continua
 * bloqueado. É: os eixos derivados formam um conjunto que uma pessoa
 * reconheceria como as paredes da planta?
 *
 *   1. a espessura derivada AGRUPA em valores de construção (10/15/20/25 cm),
 *      em vez de espalhar? Espessura espalhada = pareamento errado.
 *   2. que fração dos segmentos de parede vira eixo?
 *   3. as pontas se encontram nos cantos?
 *   4. o desenho dos eixos, olhado, parece a planta?
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const pdfjs = await import(
  pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href
);
const OPS = pdfjs.OPS;

const caminho = process.argv[2] ?? 'C:/D/ORÇACLOUD/PROJETO INICIAL-REGULARIZAÇÃO-R06-A0.pdf';
// Região da PLANTA PAV. 02, a mesma das rodadas 1 e 2 — comparável de propósito.
const X0 = Number(process.argv[3] ?? 1780);
const X1 = Number(process.argv[4] ?? 2330);
const Y0 = Number(process.argv[5] ?? 1840);
const Y1 = Number(process.argv[6] ?? 2270);

/** Escala 1:100 declarada na prancha. 1 pt = 25,4/72 mm de papel. */
const MM_POR_PT = (25.4 / 72) * 100;
/** O grupo de espessura que a rodada 1 identificou como parede. */
const ESPESSURA_PAREDE_PT = 0.6;

const doc = await pdfjs.getDocument({
  data: new Uint8Array(readFileSync(caminho)),
  disableWorker: true,
  isEvalSupported: false,
}).promise;
const page = await doc.getPage(1);
const ops = await page.getOperatorList();

const mul = (m, n) => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];
const ap = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

// ── Extração, guardando A QUAL SUBPATH cada segmento pertence ────────────────
//
// É a única diferença em relação a `segmentos.mjs`, e é a diferença que importa:
// lá os segmentos saem numa lista plana e a informação de que quatro deles são
// o mesmo retângulo se perde na porta de saída.
let ctm = [1, 0, 0, 1, 0, 0];
let larguraLinha = 1;
const pilha = [];
const segmentos = [];
let subpath = 0;

for (let i = 0; i < ops.fnArray.length; i++) {
  const fn = ops.fnArray[i];
  const args = ops.argsArray[i];

  if (fn === OPS.save) pilha.push({ ctm: [...ctm], larguraLinha });
  else if (fn === OPS.restore) {
    const e = pilha.pop();
    if (e) {
      ctm = e.ctm;
      larguraLinha = e.larguraLinha;
    }
  } else if (fn === OPS.transform) ctm = mul(args, ctm);
  else if (fn === OPS.setLineWidth) larguraLinha = args[0];
  else if (fn === OPS.constructPath) {
    const [tipos, coords] = args;
    let k = 0;
    let atual = null;
    const escalaCtm = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1;
    const larguraPt = larguraLinha * escalaCtm;

    for (const t of tipos) {
      if (t === OPS.moveTo) {
        // Novo subpath: é aqui que uma parede termina e a próxima começa.
        subpath += 1;
        atual = ap(ctm, coords[k], coords[k + 1]);
        k += 2;
      } else if (t === OPS.lineTo) {
        const p = ap(ctm, coords[k], coords[k + 1]);
        k += 2;
        if (atual) segmentos.push({ a: atual, b: p, larguraPt, subpath });
        atual = p;
      } else if (t === OPS.curveTo) {
        k += 6;
        atual = null;
      } else if (t === OPS.rectangle) {
        const [x, y, w, h] = coords.slice(k, k + 4);
        k += 4;
        subpath += 1;
        const c = [
          ap(ctm, x, y), ap(ctm, x + w, y),
          ap(ctm, x + w, y + h), ap(ctm, x, y + h),
        ];
        for (let j = 0; j < 4; j++) {
          segmentos.push({ a: c[j], b: c[(j + 1) % 4], larguraPt, subpath });
        }
        atual = null;
      } else {
        atual = null;
      }
    }
  }
}

const comp = (s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
const dentro = (p) => p.x >= X0 && p.x <= X1 && p.y >= Y0 && p.y <= Y1;

const paredes = segmentos.filter(
  (s) =>
    Math.abs(s.larguraPt - ESPESSURA_PAREDE_PT) < 0.01 &&
    dentro(s.a) && dentro(s.b) &&
    comp(s) > 0.5,
);

console.log(`segmentos na folha: ${segmentos.length}`);
console.log(`do grupo de parede (${ESPESSURA_PAREDE_PT} pt) na região: ${paredes.length}`);

// ── Agrupar por subpath ──────────────────────────────────────────────────────
const porSubpath = new Map();
for (const s of paredes) {
  if (!porSubpath.has(s.subpath)) porSubpath.set(s.subpath, []);
  porSubpath.get(s.subpath).push(s);
}
console.log(`subpaths distintos: ${porSubpath.size}`);

const histLados = new Map();
for (const [, segs] of porSubpath) {
  histLados.set(segs.length, (histLados.get(segs.length) ?? 0) + 1);
}
console.log('\n── quantos segmentos tem cada subpath ──');
[...histLados.entries()]
  .sort((a, b) => a[0] - b[0])
  .forEach(([n, q]) => console.log(`  ${String(n).padStart(3)} segmento(s): ${q} subpath(s)`));

/**
 * Caixa orientada mínima de um conjunto de pontos.
 *
 * Para um retângulo o resultado é EXATO, e barato: a caixa mínima de um
 * polígono convexo tem um lado alinhado com uma das arestas, então testar a
 * direção de cada aresta basta. Sem calipers, sem casco convexo.
 */
function caixaOrientada(pontos) {
  let melhor = null;
  for (let i = 0; i < pontos.length; i++) {
    const p = pontos[i];
    const q = pontos[(i + 1) % pontos.length];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const n = Math.hypot(dx, dy);
    if (n < 1e-9) continue;
    const ux = dx / n;
    const uy = dy / n;

    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const r of pontos) {
      const u = r.x * ux + r.y * uy;
      const v = -r.x * uy + r.y * ux;
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (v < v0) v0 = v;
      if (v > v1) v1 = v;
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!melhor || area < melhor.area) {
      melhor = { area, ux, uy, u0, u1, v0, v1 };
    }
  }
  return melhor;
}

/**
 * Um subpath vira eixo se ele for de fato um retângulo.
 *
 * A prova é o PERÍMETRO: a soma dos segmentos tem de bater com o perímetro da
 * caixa orientada. Um "L", um contorno de mobília ou um trecho de hachura
 * também têm caixa — o que eles não têm é perímetro igual ao dela. Sem esta
 * conferência, qualquer coisa viraria parede.
 */
function eixoDoSubpath(segs) {
  const pontos = [];
  for (const s of segs) pontos.push(s.a, s.b);
  const c = caixaOrientada(pontos);
  if (!c) return null;

  const lu = c.u1 - c.u0;
  const lv = c.v1 - c.v0;
  const curto = Math.min(lu, lv);
  const longo = Math.max(lu, lv);
  if (curto < 1e-6 || longo < 1e-6) return null;

  const perimetroCaixa = 2 * (lu + lv);
  const somaSegs = segs.reduce((t, s) => t + comp(s), 0);
  // 12% de folga: o retângulo pode vir com o lado fechado repetido, ou sem o
  // último lado se o CAD contou com o `closePath`.
  const razao = somaSegs / perimetroCaixa;
  if (razao < 0.7 || razao > 1.3) return null;

  // Eixo: a mediana do lado LONGO, com a espessura sendo o lado curto.
  const meioV = (c.v0 + c.v1) / 2;
  const meioU = (c.u0 + c.u1) / 2;
  const paraXY = (u, v) => ({ x: u * c.ux - v * c.uy, y: u * c.uy + v * c.ux });

  const a = lu >= lv ? paraXY(c.u0, meioV) : paraXY(meioU, c.v0);
  const b = lu >= lv ? paraXY(c.u1, meioV) : paraXY(meioU, c.v1);

  return { a, b, espessuraPt: curto, comprimentoPt: longo, razao };
}

const eixos = [];
const sobraram = [];
for (const [, segs] of porSubpath) {
  const e = eixoDoSubpath(segs);
  if (e) eixos.push(e);
  else sobraram.push(segs);
}

console.log(`\neixos por subpath fechado: ${eixos.length}`);

// ── Etapa B: parear faces opostas ────────────────────────────────────────────
//
// A etapa A saiu com quase nada, e o histograma de lados explica por quê: 140
// dos 143 subpaths têm UM segmento só. Nesta prancha a parede não é um
// retângulo fechado — cada FACE é uma linha independente. A leitura da rodada 1
// ("cada parede é um polígono próprio") descrevia o efeito, não a estrutura.
//
// Então o pareamento por geometria é inevitável mesmo. O que o torna tratável é
// que ele NÃO precisa distinguir porta de borda externa: emparelhar duas faces
// da mesma parede é uma pergunta sobre paralelismo e distância, e as duas têm
// resposta no desenho. É o oposto do fechamento de vão, que é semântico.

const dir = (s) => {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const n = Math.hypot(dx, dy);
  return { ux: dx / n, uy: dy / n, n };
};

/**
 * Junta pedaços COLINEARES E ENCOSTADOS da mesma face.
 *
 * A folga é deliberadamente minúscula (0,5 pt ≈ 1,7 cm na obra): juntar com
 * folga grande atravessaria o vão da porta e devolveria uma parede onde há uma
 * passagem — exatamente o erro que a rodada 3 cometeu por outro caminho.
 */
function juntarColineares(segs) {
  const grupos = new Map();
  for (const s of segs) {
    const d = dir(s);
    // DIREÇÃO CANÔNICA — dobra o VETOR para o semiplano X positivo.
    //
    // ⚠️ A primeira versão desta rodada dobrava o ÂNGULO (`if (ang < 0) ang +=
    // π`), o que parece equivalente e não é: a direção (−1, 0) tem ângulo
    // exatamente π, escapava da correção e ia para a chave "180.0" enquanto
    // (1, 0) ia para "0.0" — a mesma face desenhada ao contrário virava duas.
    // Só apareceu quando o algoritmo foi portado para `utils/blueprintVetor.ts`
    // e um teste de unidade cobriu o caso.
    //
    // Os números publicados no plano (52 eixos, 68%) são os de ANTES desta
    // correção. Com ela: **58 eixos**, e as três espessuras dominantes ficam
    // idênticas (20 cm ×20, 15 cm ×11, 10 cm ×8) — os 6 eixos a mais estão
    // todos fora delas.
    let ux = d.ux;
    let uy = d.uy;
    if (ux < -1e-12 || (Math.abs(ux) <= 1e-12 && uy < 0)) {
      ux = -ux;
      uy = -uy;
    }
    const ang = Math.atan2(uy, ux);
    const off = -s.a.x * uy + s.a.y * ux;
    const chave = `${(ang * 180 / Math.PI).toFixed(1)}|${off.toFixed(1)}`;
    if (!grupos.has(chave)) grupos.set(chave, { ux, uy, itens: [] });
    const g = grupos.get(chave);
    const ua = s.a.x * ux + s.a.y * uy;
    const ub = s.b.x * ux + s.b.y * uy;
    g.itens.push({ u0: Math.min(ua, ub), u1: Math.max(ua, ub), off });
  }

  const saida = [];
  for (const [, g] of grupos) {
    g.itens.sort((a, b) => a.u0 - b.u0);
    let atual = null;
    for (const it of g.itens) {
      if (atual && it.u0 <= atual.u1 + 0.5) {
        atual.u1 = Math.max(atual.u1, it.u1);
      } else {
        if (atual) saida.push({ ...atual, ux: g.ux, uy: g.uy });
        atual = { ...it };
      }
    }
    if (atual) saida.push({ ...atual, ux: g.ux, uy: g.uy });
  }
  return saida;
}

const faces = juntarColineares(sobraram.flat());
console.log(`faces após juntar colineares encostadas: ${faces.length} (de ${sobraram.flat().length} segmentos)`);

/** Espessura de parede plausível, em pt de papel. 5 cm a 40 cm reais. */
const ESP_MIN_PT = 50 / MM_POR_PT;
const ESP_MAX_PT = 400 / MM_POR_PT;
/** Um par precisa se sobrepor de verdade, não se tocar de raspão. */
const SOBREPOSICAO_MIN_PT = 2;

const candidatos = [];
for (let i = 0; i < faces.length; i++) {
  for (let j = i + 1; j < faces.length; j++) {
    const A = faces[i];
    const B = faces[j];
    // Paralelas: mesma direção sem sinal, com 2° de folga.
    const cos = Math.abs(A.ux * B.ux + A.uy * B.uy);
    if (cos < Math.cos((2 * Math.PI) / 180)) continue;

    const dist = Math.abs(B.off - A.off);
    if (dist < ESP_MIN_PT || dist > ESP_MAX_PT) continue;

    const s0 = Math.max(A.u0, B.u0);
    const s1 = Math.min(A.u1, B.u1);
    const sobrepos = s1 - s0;
    if (sobrepos < SOBREPOSICAO_MIN_PT) continue;

    // Quanto da face MENOR o par cobre. Preferir o par que se explica melhor:
    // duas faces da mesma parede se acompanham de ponta a ponta.
    const cobertura = sobrepos / Math.min(A.u1 - A.u0, B.u1 - B.u0);
    candidatos.push({ i, j, dist, s0, s1, sobrepos, cobertura });
  }
}

// Guloso pela melhor explicação primeiro: cobertura alta e parede fina.
// Parede fina antes de grossa importa porque duas paredes paralelas de lados
// opostos de um corredor também são paralelas e se sobrepõem — o que as separa
// do par verdadeiro é a DISTÂNCIA.
candidatos.sort((a, b) => b.cobertura - a.cobertura || a.dist - b.dist);

// A face é consumida POR TRECHO, não inteira.
//
// A primeira versão marcava a face como usada de uma vez, e o desenho mostrou o
// preço: as paredes longas horizontais saíam certas e as verticais ficavam
// órfãs. Uma face de fachada de 8 m encosta em VÁRIAS paredes internas ao longo
// do comprimento; consumida pelo primeiro par, os outros trechos dela perdiam
// a contraparte. Não é caso raro — é como toda planta é.
const consumido = faces.map(() => []);
const livre = (k, s0, s1) => {
  const ocupado = consumido[k].reduce(
    (t, iv) => t + Math.max(0, Math.min(iv[1], s1) - Math.max(iv[0], s0)),
    0,
  );
  return 1 - ocupado / (s1 - s0);
};

const eixosPareados = [];
for (const c of candidatos) {
  // 60% do trecho livre nas DUAS faces: sem isto, o mesmo pedaço de parede
  // sairia duas vezes, com espessuras diferentes.
  if (livre(c.i, c.s0, c.s1) < 0.6 || livre(c.j, c.s0, c.s1) < 0.6) continue;
  consumido[c.i].push([c.s0, c.s1]);
  consumido[c.j].push([c.s0, c.s1]);
  const A = faces[c.i];
  const B = faces[c.j];
  const offMedio = (A.off + B.off) / 2;
  const pto = (u) => ({
    x: u * A.ux - offMedio * A.uy,
    y: u * A.uy + offMedio * A.ux,
  });
  eixosPareados.push({
    a: pto(c.s0),
    b: pto(c.s1),
    espessuraPt: c.dist,
    comprimentoPt: c.sobrepos,
    cobertura: c.cobertura,
  });
}

console.log(`eixos por pareamento de faces: ${eixosPareados.length}`);
const nUsadas = consumido.filter((c) => c.length > 0).length;
console.log(
  `faces com pelo menos um trecho emparelhado: ${nUsadas} de ${faces.length} ` +
    `(${((nUsadas / faces.length) * 100).toFixed(0)}%)`,
);
// Cobertura por COMPRIMENTO, que é o número honesto: uma face de 8 m com 20 cm
// emparelhados contaria como "usada" na conta de cima.
const totalFace = faces.reduce((t, f) => t + (f.u1 - f.u0), 0);
const totalUsado = consumido.reduce(
  (t, ivs) => t + ivs.reduce((u, iv) => u + (iv[1] - iv[0]), 0),
  0,
);
console.log(
  `comprimento de face emparelhado: ${((totalUsado / totalFace) * 100).toFixed(0)}%`,
);
const orfas = faces.filter((_, k) => consumido[k].length === 0);
eixos.push(...eixosPareados);

console.log(`\ntotal de eixos: ${eixos.length}`);
if (eixos.length === 0) {
  console.log('\nNENHUM eixo derivado — as conferências abaixo não têm o que medir.');
  process.exit(1);
}

// ── 1. A espessura agrupa em valor de construção? ────────────────────────────
console.log('\n── espessura derivada (cm) ──');
const histEsp = new Map();
for (const e of eixos) {
  const cm = Math.round((e.espessuraPt * MM_POR_PT) / 10);
  histEsp.set(cm, (histEsp.get(cm) ?? 0) + 1);
}
[...histEsp.entries()]
  .sort((a, b) => b[1] - a[1])
  .forEach(([cm, n]) => {
    const barra = '█'.repeat(Math.min(40, n));
    console.log(`  ${String(cm).padStart(3)} cm  ${String(n).padStart(4)}  ${barra}`);
  });

const top = [...histEsp.entries()].sort((a, b) => b[1] - a[1]);
const concentracao = top.slice(0, 3).reduce((t, [, n]) => t + n, 0) / eixos.length;
console.log(
  `\n  as 3 espessuras mais comuns concentram ${(concentracao * 100).toFixed(0)}% dos eixos`,
);

// ── 3. As pontas se encontram? ───────────────────────────────────────────────
//
// Numa planta as paredes se tocam nos cantos. Se cada eixo terminar sozinho no
// vazio, o pareamento produziu peças soltas, não uma planta.
const TOL_PT = 3; // ~10 cm a 1:100
let pontasComVizinho = 0;
const pontas = eixos.flatMap((e) => [e.a, e.b]);
for (let i = 0; i < pontas.length; i++) {
  for (let j = 0; j < pontas.length; j++) {
    if (i === j) continue;
    // A outra ponta do MESMO eixo não conta como encontro.
    if (Math.floor(i / 2) === Math.floor(j / 2)) continue;
    if (Math.hypot(pontas[i].x - pontas[j].x, pontas[i].y - pontas[j].y) < TOL_PT) {
      pontasComVizinho += 1;
      break;
    }
  }
}
console.log(
  `\npontas que encontram outra parede: ${pontasComVizinho} de ${pontas.length} ` +
    `(${((pontasComVizinho / pontas.length) * 100).toFixed(0)}%)`,
);

const somaComp = eixos.reduce((t, e) => t + e.comprimentoPt * MM_POR_PT, 0);
console.log(`comprimento total de parede: ${(somaComp / 1000).toFixed(1)} m`);
console.log(
  `comprimento médio por eixo: ${(somaComp / eixos.length / 1000).toFixed(2)} m`,
);

// ── 4. O desenho ─────────────────────────────────────────────────────────────
const saida = process.env.SVG ?? 'docs/spikes/digitalizador/eixos.svg';
const W = X1 - X0;
const H = Y1 - Y0;
const esc = 2;
const tx = (p) => ((p.x - X0) * esc).toFixed(1);
// Y do PDF cresce para cima; o do SVG, para baixo.
const ty = (p) => ((Y1 - p.y) * esc).toFixed(1);

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W * esc}" height="${H * esc}" `,
  `viewBox="0 0 ${W * esc} ${H * esc}"><rect width="100%" height="100%" fill="#fff"/>`,
  // O contorno original, apagado, para comparar contra o eixo.
  ...paredes.map(
    (s) =>
      `<line x1="${tx(s.a)}" y1="${ty(s.a)}" x2="${tx(s.b)}" y2="${ty(s.b)}" ` +
      `stroke="#cbd5e1" stroke-width="1"/>`,
  ),
  // As faces que NÃO acharam par, em âmbar: é a lista de defeitos, visível.
  ...orfas.map((f) => {
    const p = (u) => ({ x: u * f.ux - f.off * f.uy, y: u * f.uy + f.off * f.ux });
    const a = p(f.u0);
    const b = p(f.u1);
    return (
      `<line x1="${tx(a)}" y1="${ty(a)}" x2="${tx(b)}" y2="${ty(b)}" ` +
      `stroke="#f59e0b" stroke-width="2.4"/>`
    );
  }),
  // Os eixos derivados.
  ...eixos.map(
    (e) =>
      `<line x1="${tx(e.a)}" y1="${ty(e.a)}" x2="${tx(e.b)}" y2="${ty(e.b)}" ` +
      `stroke="#dc2626" stroke-width="1.6"/>`,
  ),
  '</svg>',
].join('');

writeFileSync(saida, svg);
console.log(`\ndesenho: ${saida}`);
console.log('  cinza = contorno original · vermelho = eixo derivado · âmbar = não virou eixo');
