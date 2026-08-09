/**
 * Spike C — etapa 1: descobrir ONDE cada desenho está na prancha.
 *
 * Uma folha A0 de aprovação traz 15 desenhos: plantas de vários pavimentos,
 * cortes, fachadas, locação, tabelas e carimbo. Interpretar a folha inteira de
 * uma vez não produz nada útil — a primeira coisa é recortar.
 *
 * O recorte aqui não é manual: os próprios títulos ("PLANTA PAV. 02") e os
 * rótulos de área ("a=19.49 m²") dizem onde os desenhos estão. Agrupando rótulo
 * por proximidade sai a caixa de cada um.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const pdfjs = await import(
  pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href
);

const caminho = process.argv[2];
const doc = await pdfjs.getDocument({
  data: new Uint8Array(readFileSync(caminho)),
  disableWorker: true,
  isEvalSupported: false,
}).promise;

const page = await doc.getPage(1);
const texto = await page.getTextContent();
const ops = await page.getOperatorList();
const OPS = pdfjs.OPS;

const itens = texto.items
  .filter((it) => it.str && it.str.trim())
  .map((it) => ({ s: it.str.trim(), x: it.transform[4], y: it.transform[5] }));

// ── Títulos de desenho ───────────────────────────────────────────────────────
const titulos = itens.filter((it) =>
  /^(PLANTA|CORTE|FACHADA|DETALHE|TABELA)/i.test(it.s),
);
console.log(`── ${titulos.length} títulos de desenho ──`);
for (const t of titulos) {
  console.log(`  (${String(Math.round(t.x)).padStart(5)}, ${String(Math.round(t.y)).padStart(5)})  ${t.s}`);
}

// ── Onde estão as imagens embutidas ──────────────────────────────────────────
// Se todas caírem na faixa das fachadas, as PLANTAS sao vetor puro e o braço
// de extração vetorial vale para elas.
const caixasImagem = [];
let ctm = [1, 0, 0, 1, 0, 0];
const pilha = [];
for (let i = 0; i < ops.fnArray.length; i++) {
  const fn = ops.fnArray[i];
  const args = ops.argsArray[i];
  if (fn === OPS.save) pilha.push([...ctm]);
  else if (fn === OPS.restore) ctm = pilha.pop() ?? ctm;
  else if (fn === OPS.transform) {
    const [a, b, c, d, e, f] = args;
    const [A, B, C, D, E, F] = ctm;
    ctm = [
      a * A + b * C, a * B + b * D,
      c * A + d * C, c * B + d * D,
      e * A + f * C + E, e * B + f * D + F,
    ];
  } else if (
    fn === OPS.paintImageXObject ||
    fn === OPS.paintJpegXObject ||
    fn === OPS.paintInlineImageXObject
  ) {
    // A imagem ocupa o quadrado unitário transformado pela CTM.
    caixasImagem.push({ x: ctm[4], y: ctm[5], w: Math.abs(ctm[0]), h: Math.abs(ctm[3]) });
  }
}

console.log(`\n── ${caixasImagem.length} imagens embutidas ──`);
const ys = caixasImagem.map((c) => c.y);
console.log(`  faixa Y: ${Math.round(Math.min(...ys))} a ${Math.round(Math.max(...ys))}`);
console.log(`  maior: ${Math.round(Math.max(...caixasImagem.map((c) => c.w)))} × ${Math.round(Math.max(...caixasImagem.map((c) => c.h)))} pt`);

// ── Agrupar rótulos de área por proximidade ──────────────────────────────────
const areas = itens
  .filter((it) => /^a\s*=\s*[\d.,]+\s*m/i.test(it.s))
  .map((it) => ({ ...it, m2: Number(it.s.replace(/[^\d.,]/g, '').replace(',', '.')) }));

const RAIO = 420; // pt — separa desenhos vizinhos na folha
const grupos = [];
for (const a of areas) {
  const g = grupos.find((gr) => Math.hypot(gr.cx - a.x, gr.cy - a.y) < RAIO);
  if (g) {
    g.itens.push(a);
    g.cx = g.itens.reduce((s, i) => s + i.x, 0) / g.itens.length;
    g.cy = g.itens.reduce((s, i) => s + i.y, 0) / g.itens.length;
  } else {
    grupos.push({ cx: a.x, cy: a.y, itens: [a] });
  }
}

console.log(`\n── ${grupos.length} agrupamentos de área (candidatos a desenho) ──`);
grupos
  .sort((p, q) => q.itens.length - p.itens.length)
  .forEach((g, i) => {
    const xs = g.itens.map((t) => t.x);
    const yy = g.itens.map((t) => t.y);
    const soma = g.itens.reduce((s, t) => s + t.m2, 0);
    // Titulo mais proximo do centro do grupo.
    const titulo = titulos
      .map((t) => ({ t, d: Math.hypot(t.x - g.cx, t.y - g.cy) }))
      .sort((p, q) => p.d - q.d)[0];
    console.log(
      `  #${i + 1}  ${String(g.itens.length).padStart(2)} ambientes  soma ${soma.toFixed(2)} m²` +
        `  caixa x[${Math.round(Math.min(...xs))}..${Math.round(Math.max(...xs))}]` +
        ` y[${Math.round(Math.min(...yy))}..${Math.round(Math.max(...yy))}]` +
        `  ~ "${titulo?.t.s ?? '?'}"`,
    );
  });
