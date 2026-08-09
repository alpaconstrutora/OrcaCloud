/**
 * Spike C — etapa 2: os traços da região são separáveis?
 *
 * Um PDF vetorial ter a geometria não significa ter as PAREDES. Os 37 mil
 * segmentos da prancha misturam parede, cota, hachura, mobiliário, arco de porta
 * e contorno de letra. Jogar tudo no arranjo planar produziria centenas de faces
 * de 2 cm², não ambientes.
 *
 * Este script não tenta extrair parede ainda. Ele mede se existe SINAL que
 * separe — espessura de traço, cor, comprimento. Se não houver, o braço vetorial
 * morre aqui e o multimodal passa a ser o caminho, mesmo em PDF vetorial.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const pdfjs = await import(
  pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href
);
const OPS = pdfjs.OPS;

const caminho = process.argv[2];
// Caixa da PLANTA PAV. 02, com folga: os rótulos ficam DENTRO dos cômodos, então
// a parede externa cai fora da caixa deles.
const X0 = Number(process.argv[3] ?? 1700);
const X1 = Number(process.argv[4] ?? 2400);
const Y0 = Number(process.argv[5] ?? 1850);
const Y1 = Number(process.argv[6] ?? 2650);

const doc = await pdfjs.getDocument({
  data: new Uint8Array(readFileSync(caminho)),
  disableWorker: true,
  isEvalSupported: false,
}).promise;
const page = await doc.getPage(1);
const ops = await page.getOperatorList();

// ── Percorrer mantendo estado gráfico (CTM, espessura, cor) ──────────────────
let ctm = [1, 0, 0, 1, 0, 0];
let larguraLinha = 1;
let cor = '#000000';
const pilha = [];

const mul = (m, n) => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];
const aplicar = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

const segmentos = [];

for (let i = 0; i < ops.fnArray.length; i++) {
  const fn = ops.fnArray[i];
  const args = ops.argsArray[i];

  if (fn === OPS.save) pilha.push({ ctm: [...ctm], larguraLinha, cor });
  else if (fn === OPS.restore) {
    const e = pilha.pop();
    if (e) ({ ctm, larguraLinha, cor } = { ...e, ctm: e.ctm });
  } else if (fn === OPS.transform) ctm = mul(args, ctm);
  else if (fn === OPS.setLineWidth) larguraLinha = args[0];
  else if (fn === OPS.setStrokeRGBColor) {
    cor = `#${args.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  } else if (fn === OPS.constructPath) {
    const [tipos, coords] = args;
    let k = 0;
    let atual = null;
    // A espessura em PONTOS de papel: a CTM pode escalar o traço.
    const escalaCtm = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1;
    const larguraPt = larguraLinha * escalaCtm;

    for (const t of tipos) {
      if (t === OPS.moveTo) {
        atual = aplicar(ctm, coords[k], coords[k + 1]);
        k += 2;
      } else if (t === OPS.lineTo) {
        const p = aplicar(ctm, coords[k], coords[k + 1]);
        k += 2;
        if (atual) segmentos.push({ a: atual, b: p, larguraPt, cor });
        atual = p;
      } else if (t === OPS.curveTo) {
        k += 6;
        atual = null;
      } else if (t === OPS.rectangle) {
        const [x, y, w, h] = coords.slice(k, k + 4);
        k += 4;
        const c = [
          aplicar(ctm, x, y), aplicar(ctm, x + w, y),
          aplicar(ctm, x + w, y + h), aplicar(ctm, x, y + h),
        ];
        for (let j = 0; j < 4; j++) {
          segmentos.push({ a: c[j], b: c[(j + 1) % 4], larguraPt, cor });
        }
        atual = null;
      } else {
        atual = null;
      }
    }
  }
}

const naRegiao = segmentos.filter(
  (s) =>
    s.a.x >= X0 && s.a.x <= X1 && s.a.y >= Y0 && s.a.y <= Y1 &&
    s.b.x >= X0 && s.b.x <= X1 && s.b.y >= Y0 && s.b.y <= Y1,
);

const comp = (s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
const vivos = naRegiao.filter((s) => comp(s) > 0.5);

console.log(`segmentos na folha inteira: ${segmentos.length}`);
console.log(`dentro da região [${X0}..${X1}] × [${Y0}..${Y1}]: ${naRegiao.length} (${vivos.length} com comprimento)`);

// ── Histograma de espessura ──────────────────────────────────────────────────
const porLargura = new Map();
for (const s of vivos) {
  const chave = s.larguraPt.toFixed(2);
  const g = porLargura.get(chave) ?? { n: 0, somaComp: 0 };
  g.n++;
  g.somaComp += comp(s);
  porLargura.set(chave, g);
}
console.log('\n── espessura de traço (pt) ──');
[...porLargura.entries()]
  .sort((a, b) => b[1].n - a[1].n)
  .slice(0, 12)
  .forEach(([w, g]) =>
    console.log(`  ${w.padStart(6)} pt  ${String(g.n).padStart(5)} segmentos  comprimento médio ${(g.somaComp / g.n).toFixed(1)} pt`),
  );

// ── Histograma de comprimento ────────────────────────────────────────────────
const faixas = [0.5, 2, 5, 10, 25, 50, 100, 200, 1000];
console.log('\n── comprimento do segmento (pt) ──');
for (let i = 0; i < faixas.length - 1; i++) {
  const n = vivos.filter((s) => comp(s) >= faixas[i] && comp(s) < faixas[i + 1]).length;
  if (n) console.log(`  ${String(faixas[i]).padStart(5)} a ${String(faixas[i + 1]).padStart(5)}  ${String(n).padStart(5)}`);
}

// ── Cores ────────────────────────────────────────────────────────────────────
const porCor = new Map();
for (const s of vivos) porCor.set(s.cor, (porCor.get(s.cor) ?? 0) + 1);
console.log('\n── cor do traço ──');
[...porCor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  .forEach(([c, n]) => console.log(`  ${c}  ${n}`));

// ── Orientação: quanto é ortogonal? ──────────────────────────────────────────
const ortogonais = vivos.filter((s) => {
  const dx = Math.abs(s.b.x - s.a.x);
  const dy = Math.abs(s.b.y - s.a.y);
  return dx < 0.05 || dy < 0.05;
}).length;
console.log(`\nortogonais: ${ortogonais} de ${vivos.length} (${((ortogonais / vivos.length) * 100).toFixed(0)}%)`);
