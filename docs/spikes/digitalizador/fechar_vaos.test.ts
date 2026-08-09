/**
 * Spike C — rodada 3: fechar vão de abertura por colinearidade — TENTATIVA
 * REPROVADA, mantida no repo pelo motivo de ter falhado.
 *
 * NÃO fica em `__tests__/`: depende de PDF em caminho absoluto.
 *   cp docs/spikes/digitalizador/fechar_vaos.test.ts __tests__/__spikeC3.test.ts
 *   npx vitest run __tests__/__spikeC3.test.ts
 *
 * POR QUE NÃO "ponta solta mais próxima". Medido antes de escrever qualquer
 * heurística (ver pontas.test.ts): a maioria dos pares de pontas soltas mais
 * próximas na faixa de 0,60 pt não é vão de porta — é grade de guarda-corpo,
 * barras verticais paralelas e próximas, na MESMA espessura da parede.
 * Proximidade sozinha confunde os dois.
 *
 * O filtro que os separa: um vão de porta continua o MESMO EIXO da parede —
 * as duas pontas são colineares com a direção da parede que terminam. Duas
 * barras de guarda-corpo são paralelas mas DESLOCADAS: mesma direção, offset
 * perpendicular diferente de zero. Bridging só entra colinear.
 */
import { describe, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const PDF = 'C:/D/ORÇACLOUD/PROJETO INICIAL-REGULARIZAÇÃO-R06-A0.pdf';
const REGIAO = { x0: 1780, x1: 2330, y0: 1840, y1: 2270 };
const PX_POR_PT = 4;
const MM_POR_PT = (25.4 / 72) * 100;

// Vão de porta/janela real: 500 a 2500 mm. Fora disso não é abertura.
const GAP_MIN_MM = 400;
const GAP_MAX_MM = 2500;
// Tolerância de desvio da reta, em pt de papel (perpendicular ao eixo).
const TOL_COLINEAR_PT = 2;

describe('spikeC3', () => {
  it('fecha vaos por colinearidade e remede', async () => {
    const require = createRequire(import.meta.url);
    const pdfjs: any = await import(
      pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href
    );
    const OPS = pdfjs.OPS;

    const doc = await pdfjs.getDocument({
      data: new Uint8Array(readFileSync(PDF)),
      disableWorker: true,
      isEvalSupported: false,
    }).promise;
    const page = await doc.getPage(1);
    const ops = await page.getOperatorList();
    const texto = await page.getTextContent();

    const mul = (m: number[], n: number[]) => [
      m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
      m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
      m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
    ];
    const ap = (m: number[], x: number, y: number) => ({
      x: m[0] * x + m[2] * y + m[4],
      y: m[1] * x + m[3] * y + m[5],
    });

    let ctm = [1, 0, 0, 1, 0, 0];
    let lw = 1;
    const pilha: { ctm: number[]; lw: number }[] = [];
    const segs: { a: { x: number; y: number }; b: { x: number; y: number }; lw: number }[] = [];

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];
      if (fn === OPS.save) pilha.push({ ctm: [...ctm], lw });
      else if (fn === OPS.restore) {
        const e = pilha.pop();
        if (e) { ctm = e.ctm; lw = e.lw; }
      } else if (fn === OPS.transform) ctm = mul(args, ctm);
      else if (fn === OPS.setLineWidth) lw = args[0];
      else if (fn === OPS.constructPath) {
        const [tipos, coords] = args;
        let k = 0;
        let at: { x: number; y: number } | null = null;
        const esc = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1;
        const lwPt = lw * esc;
        for (const t of tipos) {
          if (t === OPS.moveTo) { at = ap(ctm, coords[k], coords[k + 1]); k += 2; }
          else if (t === OPS.lineTo) {
            const p = ap(ctm, coords[k], coords[k + 1]); k += 2;
            if (at) segs.push({ a: at, b: p, lw: lwPt });
            at = p;
          } else if (t === OPS.curveTo) { k += 6; at = null; }
          else if (t === OPS.rectangle) {
            const [x, y, w, h] = coords.slice(k, k + 4); k += 4;
            const c = [ap(ctm, x, y), ap(ctm, x + w, y), ap(ctm, x + w, y + h), ap(ctm, x, y + h)];
            for (let j = 0; j < 4; j++) segs.push({ a: c[j], b: c[(j + 1) % 4], lw: lwPt });
            at = null;
          } else at = null;
        }
      }
    }

    const dentro = (p: { x: number; y: number }) =>
      p.x >= REGIAO.x0 && p.x <= REGIAO.x1 && p.y >= REGIAO.y0 && p.y <= REGIAO.y1;
    const comp = (s: any) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);

    const paredes = segs.filter(
      (s) => dentro(s.a) && dentro(s.b) && s.lw > 0.5 && s.lw < 0.7 && comp(s) > 1,
    );

    // ── Vértices fundidos + direção de cada segmento que neles termina ──────
    const TOL = 3;
    type V = { x: number; y: number; grau: number; dirs: { x: number; y: number }[] };
    const vertices: V[] = [];
    const idxDe = (p: { x: number; y: number }) => {
      for (let i = 0; i < vertices.length; i++) {
        if (Math.hypot(vertices[i].x - p.x, vertices[i].y - p.y) <= TOL) return i;
      }
      vertices.push({ x: p.x, y: p.y, grau: 0, dirs: [] });
      return vertices.length - 1;
    };
    for (const s of paredes) {
      const d = { x: s.b.x - s.a.x, y: s.b.y - s.a.y };
      const n = Math.hypot(d.x, d.y) || 1;
      const u = { x: d.x / n, y: d.y / n };
      const ia = idxDe(s.a);
      const ib = idxDe(s.b);
      vertices[ia].grau++; vertices[ia].dirs.push(u);
      vertices[ib].grau++; vertices[ib].dirs.push({ x: -u.x, y: -u.y });
    }

    const soltas = vertices.filter((v) => v.grau === 1);

    // ── Bridging só colinear ─────────────────────────────────────────────────
    const pontes: { a: V; b: V; distMm: number }[] = [];
    const usados = new Set<number>();
    const candidatos: { i: number; j: number; distMm: number }[] = [];

    for (let i = 0; i < soltas.length; i++) {
      for (let j = i + 1; j < soltas.length; j++) {
        const a = soltas[i], b = soltas[j];
        const distPt = Math.hypot(a.x - b.x, a.y - b.y);
        const distMm = distPt * MM_POR_PT;
        if (distMm < GAP_MIN_MM || distMm > GAP_MAX_MM) continue;

        // A direção do segmento que TERMINA em `a` deve apontar praticamente
        // para `b` (colinear), e vice-versa — não só "paralela em algum lugar".
        const u = a.dirs[0];
        const rumo = { x: b.x - a.x, y: b.y - a.y };
        const nRumo = Math.hypot(rumo.x, rumo.y) || 1;
        const rumoU = { x: rumo.x / nRumo, y: rumo.y / nRumo };
        // Distância perpendicular de b à reta que passa por a na direção u.
        const perp = Math.abs(u.x * rumoU.y - u.y * rumoU.x) * distPt;
        if (perp > TOL_COLINEAR_PT) continue;

        candidatos.push({ i, j, distMm: Math.round(distMm) });
      }
    }

    candidatos.sort((p, q) => p.distMm - q.distMm);
    for (const c of candidatos) {
      if (usados.has(c.i) || usados.has(c.j)) continue;
      usados.add(c.i); usados.add(c.j);
      pontes.push({ a: soltas[c.i], b: soltas[c.j], distMm: c.distMm });
    }

    // ── Rasterizar: parede + pontes ──────────────────────────────────────────
    const W = Math.ceil((REGIAO.x1 - REGIAO.x0) * PX_POR_PT);
    const H = Math.ceil((REGIAO.y1 - REGIAO.y0) * PX_POR_PT);
    const paraPx = (p: { x: number; y: number }) => ({
      px: Math.round((p.x - REGIAO.x0) * PX_POR_PT),
      py: Math.round((REGIAO.y1 - p.y) * PX_POR_PT),
    });
    const barreira = new Uint8Array(W * H);
    const marcar = (x: number, y: number) => {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && X < W && Y >= 0 && Y < H) barreira[Y * W + X] = 1;
      }
    };
    const tracar = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const A = paraPx(a), B = paraPx(b);
      const passos = Math.max(Math.abs(B.px - A.px), Math.abs(B.py - A.py), 1);
      for (let i = 0; i <= passos; i++) {
        marcar(Math.round(A.px + ((B.px - A.px) * i) / passos), Math.round(A.py + ((B.py - A.py) * i) / passos));
      }
    };
    for (const s of paredes) tracar(s.a, s.b);
    for (const p of pontes) tracar(p.a, p.b);

    // ── Sementes e preenchimento independente ────────────────────────────────
    const rotulos = texto.items
      .map((it: any) => ({ s: String(it.str).trim(), x: it.transform[4], y: it.transform[5] }))
      .filter((it: any) => /^a\s*=\s*[\d.,]+\s*m/i.test(it.s) && dentro(it))
      .map((it: any) => ({
        declarada: Number(it.s.replace(/[^\d.,]/g, '').replace(',', '.')),
        ...paraPx(it),
      }));

    const geracao = new Int32Array(W * H).fill(-1);
    const dono = new Int32Array(W * H).fill(-1);
    const resultados: any[] = [];

    rotulos.forEach((r: any, idx: number) => {
      let inicio = -1;
      busca: for (let raio = 0; raio < 40; raio++) {
        for (let dy = -raio; dy <= raio; dy++) for (let dx = -raio; dx <= raio; dx++) {
          const X = r.px + dx, Y = r.py + dy + Math.round(6 * PX_POR_PT);
          if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
          const k = Y * W + X;
          if (!barreira[k]) { inicio = k; break busca; }
        }
      }
      if (inicio === -1) { resultados.push({ declarada: r.declarada, derivada: null, nota: 'sem ponto de partida' }); return; }

      const fila = [inicio];
      geracao[inicio] = idx;
      let n = 0;
      const invadiu = new Set<number>();
      let tocouBorda = false;
      while (fila.length) {
        const k = fila.pop()!;
        n++;
        const x = k % W, y = (k - x) / W;
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) tocouBorda = true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = x + dx, Y = y + dy;
          if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
          const kk = Y * W + X;
          if (barreira[kk]) continue;
          if (geracao[kk] === idx) continue;
          if (dono[kk] !== -1 && dono[kk] !== idx) invadiu.add(dono[kk]);
          geracao[kk] = idx;
          if (dono[kk] === -1) dono[kk] = idx;
          fila.push(kk);
        }
      }
      const mmPorPx = MM_POR_PT / PX_POR_PT;
      const areaM2 = (n * mmPorPx * mmPorPx) / 1_000_000;
      const erro = ((areaM2 - r.declarada) / r.declarada) * 100;
      resultados.push({
        declarada: r.declarada, derivada: Number(areaM2.toFixed(2)),
        erroPct: Number(erro.toFixed(1)), vazou: invadiu.size > 0, tocouBorda,
      });
    });

    const fecharam = resultados.filter((r) => r.derivada !== null && !r.tocouBorda && !r.vazou);
    const erros = fecharam.map((r) => Math.abs(r.erroPct)).sort((a, b) => a - b);

    writeFileSync(
      'spikeC3-result.json',
      JSON.stringify(
        {
          pontasSoltas: soltas.length,
          candidatosColineares: candidatos.length,
          pontesCriadas: pontes.length,
          pontes: pontes.map((p) => ({ a: { x: Math.round(p.a.x), y: Math.round(p.a.y) }, b: { x: Math.round(p.b.x), y: Math.round(p.b.y) }, mm: p.distMm })),
          fecharam: fecharam.length,
          de: resultados.length,
          dentroDe2pct: fecharam.filter((r) => Math.abs(r.erroPct) <= 2).length,
          erroMedianoPct: erros.length ? erros[Math.floor(erros.length / 2)] : null,
          resultados,
        },
        null, 1,
      ),
    );
  }, 300000);
});
