/**
 * Spike C — rodada 5: as curvas que eu vinha descartando.
 *
 * Nas rodadas 1 a 4, todos os extratores tinham esta linha:
 *
 *     else if (t === OPS.curveTo) { k += 6; at = null; }
 *
 * Ou seja: descartei TODAS as curvas do PDF. E o arco de giro da porta é
 * exatamente uma curva. A evidência que separaria porta de guarda-corpo e de
 * borda de terraço estava no arquivo o tempo todo, e eu declarei o problema
 * "semântico" sem ter olhado para ela.
 *
 * Este script só mede: quantas curvas existem na região, que raio têm, e se o
 * centro delas cai perto de ponta de parede. Nenhuma heurística de porta ainda.
 *
 *   node docs/spikes/digitalizador/arcos.mjs "caminho.pdf" [x0 x1 y0 y1]
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
const X0 = Number(process.argv[3] ?? 1780);
const X1 = Number(process.argv[4] ?? 2330);
const Y0 = Number(process.argv[5] ?? 1840);
const Y1 = Number(process.argv[6] ?? 2270);
const MM_POR_PT = (25.4 / 72) * 100;

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

let ctm = [1, 0, 0, 1, 0, 0];
let lw = 1;
const pilha = [];
const retas = [];
const curvas = [];

for (let i = 0; i < ops.fnArray.length; i++) {
  const fn = ops.fnArray[i];
  const args = ops.argsArray[i];
  if (fn === OPS.save) pilha.push({ ctm: [...ctm], lw });
  else if (fn === OPS.restore) { const e = pilha.pop(); if (e) { ctm = e.ctm; lw = e.lw; } }
  else if (fn === OPS.transform) ctm = mul(args, ctm);
  else if (fn === OPS.setLineWidth) lw = args[0];
  else if (fn === OPS.constructPath) {
    const [tipos, coords] = args;
    let k = 0;
    let at = null;
    const esc = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1;
    const lwPt = lw * esc;
    for (const t of tipos) {
      if (t === OPS.moveTo) { at = ap(ctm, coords[k], coords[k + 1]); k += 2; }
      else if (t === OPS.lineTo) {
        const p = ap(ctm, coords[k], coords[k + 1]); k += 2;
        if (at) retas.push({ a: at, b: p, lw: lwPt });
        at = p;
      } else if (t === OPS.curveTo) {
        // Bézier cúbica: 3 pontos de controle. O primeiro ponto é `at`.
        const c1 = ap(ctm, coords[k], coords[k + 1]);
        const c2 = ap(ctm, coords[k + 2], coords[k + 3]);
        const fim = ap(ctm, coords[k + 4], coords[k + 5]);
        k += 6;
        if (at) curvas.push({ ini: at, c1, c2, fim, lw: lwPt });
        at = fim;
      } else if (t === OPS.rectangle) {
        const [x, y, w, h] = coords.slice(k, k + 4); k += 4;
        const c = [ap(ctm, x, y), ap(ctm, x + w, y), ap(ctm, x + w, y + h), ap(ctm, x, y + h)];
        for (let j = 0; j < 4; j++) retas.push({ a: c[j], b: c[(j + 1) % 4], lw: lwPt });
        at = null;
      } else at = null;
    }
  }
}

const dentro = (p) => p.x >= X0 && p.x <= X1 && p.y >= Y0 && p.y <= Y1;
const curvasNaRegiao = curvas.filter((c) => dentro(c.ini) && dentro(c.fim));

console.log(`curvas na folha inteira: ${curvas.length}`);
console.log(`curvas na região: ${curvasNaRegiao.length}`);

// ── Caracterizar cada curva ─────────────────────────────────────────────────
// Para um arco de circunferência aproximado por Bézier, a corda ini→fim e a
// posição dos pontos de controle dão o raio. Não preciso do ajuste exato: só
// da ordem de grandeza, para ver se bate com largura de porta.
const info = curvasNaRegiao.map((c) => {
  const corda = Math.hypot(c.fim.x - c.ini.x, c.fim.y - c.ini.y);
  // Flecha: distância do ponto médio da curva à corda.
  const meio = {
    x: (c.ini.x + 3 * c.c1.x + 3 * c.c2.x + c.fim.x) / 8,
    y: (c.ini.y + 3 * c.c1.y + 3 * c.c2.y + c.fim.y) / 8,
  };
  const mx = (c.ini.x + c.fim.x) / 2;
  const my = (c.ini.y + c.fim.y) / 2;
  const flecha = Math.hypot(meio.x - mx, meio.y - my);
  // Raio pela relação corda/flecha: R = (c²/4 + f²) / (2f)
  const raio = flecha > 0.01 ? (corda * corda / 4 + flecha * flecha) / (2 * flecha) : Infinity;
  return { c, cordaPt: corda, cordaMm: corda * MM_POR_PT, raioMm: raio * MM_POR_PT, lw: c.lw };
});

const porLargura = new Map();
for (const c of curvasNaRegiao) {
  const key = c.lw.toFixed(2);
  porLargura.set(key, (porLargura.get(key) ?? 0) + 1);
}
console.log('\ncurvas por espessura de traço:');
[...porLargura.entries()].sort((a, b) => b[1] - a[1])
  .forEach(([w, n]) => console.log(`  ${w.padStart(6)} pt   ${n}`));

// Raio na faixa de porta: 600 a 1600 mm (folha de 60 cm a 1,6 m).
const candidatasPorta = info.filter((i) => i.raioMm >= 600 && i.raioMm <= 1600);
console.log(`\ncurvas com raio de porta (600-1600 mm): ${candidatasPorta.length}`);
for (const i of candidatasPorta.slice(0, 20)) {
  console.log(
    `  raio ${String(Math.round(i.raioMm)).padStart(5)} mm   corda ${String(Math.round(i.cordaMm)).padStart(5)} mm` +
      `   lw ${i.lw.toFixed(2)} pt   ini (${Math.round(i.c.ini.x)}, ${Math.round(i.c.ini.y)})`,
  );
}

// Distribuição de raio, para escolher a faixa com evidência.
const faixas = [0, 200, 400, 600, 800, 1000, 1300, 1600, 2500, 5000, 1e9];
console.log('\ndistribuição de raio (mm):');
for (let i = 0; i < faixas.length - 1; i++) {
  const n = info.filter((v) => v.raioMm >= faixas[i] && v.raioMm < faixas[i + 1]).length;
  if (n) console.log(`  ${String(faixas[i]).padStart(6)} a ${String(faixas[i + 1]).padStart(6)}   ${n}`);
}
