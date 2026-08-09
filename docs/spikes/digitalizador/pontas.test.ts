/**
 * Spike C — rodada 3, etapa de medição: caracterizar as pontas soltas da
 * parede antes de escrever qualquer heurística de fechamento.
 *
 * NÃO fica em `__tests__/`: depende de PDF em caminho absoluto.
 *   cp docs/spikes/digitalizador/pontas.test.ts __tests__/__spikeC3.test.ts
 *   npx vitest run __tests__/__spikeC3.test.ts
 */
import { describe, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const PDF = 'C:/D/ORÇACLOUD/PROJETO INICIAL-REGULARIZAÇÃO-R06-A0.pdf';
const REGIAO = { x0: 1780, x1: 2330, y0: 1840, y1: 2270 };
const MM_POR_PT = (25.4 / 72) * 100;

describe('spikeC3-medir', () => {
  it('mede as pontas soltas', async () => {
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

    // Fundir extremidades a até 3 pt (mesma tolerância de snap do kernel em mm
    // equivalente) num vértice único, e contar quantos segmentos incidem nele.
    const TOL = 3;
    type V = { x: number; y: number; grau: number };
    const vertices: V[] = [];
    const idxDe = (p: { x: number; y: number }) => {
      for (let i = 0; i < vertices.length; i++) {
        if (Math.hypot(vertices[i].x - p.x, vertices[i].y - p.y) <= TOL) return i;
      }
      vertices.push({ x: p.x, y: p.y, grau: 0 });
      return vertices.length - 1;
    };
    for (const s of paredes) {
      vertices[idxDe(s.a)].grau++;
      vertices[idxDe(s.b)].grau++;
    }

    const soltas = vertices.filter((v) => v.grau === 1);

    // Para cada ponta solta, distância até a ponta solta mais próxima.
    const pares: { d: number; a: V; b: V }[] = [];
    for (let i = 0; i < soltas.length; i++) {
      for (let j = i + 1; j < soltas.length; j++) {
        const d = Math.hypot(soltas[i].x - soltas[j].x, soltas[i].y - soltas[j].y);
        pares.push({ d, a: soltas[i], b: soltas[j] });
      }
    }
    pares.sort((p, q) => p.d - q.d);

    writeFileSync(
      'spikeC3-result.json',
      JSON.stringify(
        {
          totalVertices: vertices.length,
          pontasSoltas: soltas.length,
          // As N distâncias mais curtas entre pontas soltas, em pt e em mm reais.
          menoresDistancias: pares.slice(0, 30).map((p) => ({
            pt: Number(p.d.toFixed(1)),
            mm: Math.round(p.d * MM_POR_PT),
            a: { x: Math.round(p.a.x), y: Math.round(p.a.y) },
            b: { x: Math.round(p.b.x), y: Math.round(p.b.y) },
          })),
        },
        null,
        1,
      ),
    );
  }, 300000);
});
