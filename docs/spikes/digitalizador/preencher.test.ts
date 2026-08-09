/**
 * Spike C — rodada 2: derivar ambiente por PREENCHIMENTO a partir do rótulo.
 *
 * ⚠️ NÃO fica em `__tests__/`: depende de PDF em caminho absoluto e quebraria o
 * CI. Para rodar:
 *   cp docs/spikes/digitalizador/preencher.test.ts __tests__/__spikeC2.test.ts
 *   npx vitest run __tests__/__spikeC2.test.ts
 *
 * POR QUE MUDAR DE ABORDAGEM. A rodada 1 tentou reconstruir a topologia: virar
 * retângulo de parede em eixo e fechar o contorno. Bateu em dois muros de uma vez
 * — a parede é polígono solto e o vão de porta interrompe o traço. Cada um exige
 * um algoritmo próprio, e errar qualquer um dos dois zera o resultado.
 *
 * O preenchimento contorna os dois. Não precisa que a parede seja eixo: ela só
 * precisa ser BARREIRA. E o rótulo "a=19.49 m²" que o arquiteto escreveu dentro
 * do cômodo é semente exata — a planta diz onde cada ambiente está.
 *
 * O vão de porta continua sendo furo na barreira, e o preenchimento vaza por ele.
 * Isso é MEDIDO aqui, não escondido: se a mancha de um rótulo alcançar outro
 * rótulo, os dois ambientes vazaram um no outro e o caso é reportado como tal.
 */

import { describe, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const PDF = 'C:/D/ORÇACLOUD/PROJETO INICIAL-REGULARIZAÇÃO-R06-A0.pdf';
const REGIAO = { x0: 1780, x1: 2330, y0: 1840, y1: 2270 };

/** Pixels por ponto de papel. 4 px/pt ≈ 8,8 mm por pixel a 1:100. */
const PX_POR_PT = 4;
/** Grupos de espessura que contam como BARREIRA. Vem do ambiente para varrer. */
const FAIXAS: number[][] = JSON.parse(process.env.FAIXAS ?? '[[0.5,0.7]]');
/** ESCALA 1/100: 1 pt de papel = 35,28 mm reais. */
const MM_POR_PT = (25.4 / 72) * 100;

describe('spikeC2', () => {
  it('preenche a partir do rotulo', async () => {
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

    // ── Extrair segmentos com espessura ─────────────────────────────────────
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

    const W = Math.ceil((REGIAO.x1 - REGIAO.x0) * PX_POR_PT);
    const H = Math.ceil((REGIAO.y1 - REGIAO.y0) * PX_POR_PT);
    const paraPx = (p: { x: number; y: number }) => ({
      px: Math.round((p.x - REGIAO.x0) * PX_POR_PT),
      // Y do PDF cresce para cima; o da grade cresce para baixo.
      py: Math.round((REGIAO.y1 - p.y) * PX_POR_PT),
    });

    // ── Rasterizar as barreiras ─────────────────────────────────────────────
    // Barreira = traço de parede (0,60 pt). O arco de porta NÃO entra: ele
    // atravessa o vão e fecharia o cômodo por acidente, inflando a área.
    const barreira = new Uint8Array(W * H);
    const marcar = (x: number, y: number) => {
      // Traço de 3 px: 1 px deixa vazar na diagonal, que é o furo clássico do
      // preenchimento em 4-vizinhos.
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const X = x + dx;
          const Y = y + dy;
          if (X >= 0 && X < W && Y >= 0 && Y < H) barreira[Y * W + X] = 1;
        }
      }
    };

    let nBarreira = 0;
    for (const s of segs) {
      if (!dentro(s.a) || !dentro(s.b)) continue;
      if (!FAIXAS.some(([lo, hi]: number[]) => s.lw > lo && s.lw < hi)) continue;
      nBarreira++;
      const A = paraPx(s.a);
      const B = paraPx(s.b);
      const passos = Math.max(Math.abs(B.px - A.px), Math.abs(B.py - A.py), 1);
      for (let i = 0; i <= passos; i++) {
        marcar(
          Math.round(A.px + ((B.px - A.px) * i) / passos),
          Math.round(A.py + ((B.py - A.py) * i) / passos),
        );
      }
    }

    // ── Sementes: os rótulos de área ────────────────────────────────────────
    const rotulos = texto.items
      .map((it: any) => ({ s: String(it.str).trim(), x: it.transform[4], y: it.transform[5] }))
      .filter((it: any) => /^a\s*=\s*[\d.,]+\s*m/i.test(it.s) && dentro(it))
      .map((it: any) => ({
        declarada: Number(it.s.replace(/[^\d.,]/g, '').replace(',', '.')),
        ...paraPx(it),
      }));

    // ── Preencher ───────────────────────────────────────────────────────────
    // Cada rótulo preenche numa geração PRÓPRIA. Compartilhar o mapa fazia um
    // único vazamento tomar a planta e deixar todos os seguintes sem ponto de
    // partida — o que mede a ordem dos rótulos, não a geometria.
    const geracao = new Int32Array(W * H).fill(-1);
    const dono = new Int32Array(W * H).fill(-1);
    const resultados: any[] = [];

    rotulos.forEach((r: any, idx: number) => {
      // O rótulo é texto: o pixel exato dele pode cair sobre a própria letra, que
      // não é barreira mas pode estar colada numa. Procurar um ponto livre perto.
      let inicio = -1;
      busca: for (let raio = 0; raio < 40; raio++) {
        for (let dy = -raio; dy <= raio; dy++) {
          for (let dx = -raio; dx <= raio; dx++) {
            const X = r.px + dx;
            const Y = r.py + dy + Math.round(6 * PX_POR_PT); // abaixo do texto
            if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
            const k = Y * W + X;
            if (!barreira[k]) { inicio = k; break busca; }
          }
        }
      }
      if (inicio === -1) {
        resultados.push({ declarada: r.declarada, derivada: null, nota: 'sem ponto de partida' });
        return;
      }

      const fila = [inicio];
      geracao[inicio] = idx;
      let n = 0;
      let invadiu = new Set<number>();
      let tocouBorda = false;

      while (fila.length) {
        const k = fila.pop()!;
        n++;
        const x = k % W;
        const y = (k - x) / W;
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) tocouBorda = true;

        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = x + dx;
          const Y = y + dy;
          if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
          const kk = Y * W + X;
          if (barreira[kk]) continue;
          if (geracao[kk] === idx) continue;
          // Alcançar o território de outro rótulo = os dois vazaram um no outro.
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
        declarada: r.declarada,
        derivada: Number(areaM2.toFixed(2)),
        erroPct: Number(erro.toFixed(1)),
        vazou: invadiu.size > 0,
        tocouBorda,
      });
    });

    const bons = resultados.filter(
      (r) => r.derivada !== null && !r.tocouBorda && Math.abs(r.erroPct) <= 25,
    );
    const erros = bons.map((r) => Math.abs(r.erroPct)).sort((a, b) => a - b);

    writeFileSync(
      process.env.SAIDA ?? 'spikeC2-result.json',
      JSON.stringify(
        {
          segmentosBarreira: nBarreira,
          grade: `${W} x ${H} px`,
          mmPorPixel: Number((MM_POR_PT / PX_POR_PT).toFixed(2)),
          rotulos: rotulos.length,
          dentroDe2pct: bons.filter((r) => Math.abs(r.erroPct) <= 2).length,
          dentroDe5pct: bons.filter((r) => Math.abs(r.erroPct) <= 5).length,
          erroMedianoPct: erros.length ? erros[Math.floor(erros.length / 2)] : null,
          vazaram: resultados.filter((r) => r.vazou).length,
          tocaramBorda: resultados.filter((r) => r.tocouBorda).length,
          resultados,
        },
        null,
        1,
      ),
    );
  }, 300000);
});
