/**
 * Spike C — extração vetorial de parede a partir de PDF de projeto.
 *
 * ⚠️ NÃO fica em `__tests__/` de propósito: depende de um PDF em caminho
 * absoluto que só existe nesta máquina, e quebraria o CI. Para rodar, copie
 * para `__tests__/` e ajuste a constante PDF:
 *
 *   cp docs/spikes/digitalizador/extrair.test.ts __tests__/__spikeC.test.ts
 *   npx vitest run __tests__/__spikeC.test.ts
 *
 * Resultado registrado em docs/planos/2026-08-08-spike-c-digitalizador.md.
 */
import { describe, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { buildArrangement, emptyModel, type BlueprintModel } from '../utils/blueprintKernel';

const PDF = 'C:/D/ORÇACLOUD/PROJETO INICIAL-REGULARIZAÇÃO-R06-A0.pdf';
// Região da PLANTA PAV. 02, com folga para pegar a parede externa.
const REGIAO = { x0: 1780, x1: 2330, y0: 1840, y1: 2270 };
// ESCALA 1/100 declarada na prancha. 1 pt = 25,4/72 mm de papel.
const MM_POR_PT = (25.4 / 72) * 100;

describe('spikeC', () => {
  it('extrai e compara', async () => {
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

    // Montar modelo: cada traço vira uma "parede" de eixo. Espessura simbólica —
    // o que interessa aqui é a face fechada, não o corpo.
    const model: BlueprintModel = emptyModel();
    model.levels.push({ id: 'lvl_0001', name: 'PAV02', elevationMm: 0, defaultHeightMm: 2800 });
    let n = 0;
    for (const s of paredes) {
      const a = { x: Math.round(s.a.x * MM_POR_PT), y: Math.round(-s.a.y * MM_POR_PT) };
      const b = { x: Math.round(s.b.x * MM_POR_PT), y: Math.round(-s.b.y * MM_POR_PT) };
      if (a.x === b.x && a.y === b.y) continue;
      model.walls.push({
        id: `wal_${++n}`, levelId: 'lvl_0001', a, b, thicknessMm: 10, heightMm: 2800,
      });
    }

    const arr = buildArrangement(model, model.levels[0], 30);

    // Áreas declaradas pelo arquiteto dentro da mesma região.
    const declaradas = texto.items
      .map((it: any) => ({ s: String(it.str).trim(), x: it.transform[4], y: it.transform[5] }))
      .filter((it: any) => /^a\s*=\s*[\d.,]+\s*m/i.test(it.s) && dentro(it))
      .map((it: any) => Number(it.s.replace(/[^\d.,]/g, '').replace(',', '.')))
      .sort((a: number, b: number) => b - a);

    const derivadas = arr.spaces
      .map((s) => s.areaMm2 / 1_000_000)
      .filter((m2) => m2 >= 1)
      .sort((a, b) => b - a);

    // Despejo visual: cada grupo de espessura numa cor. Olhar resolve o que
    // adivinhar nao resolve — foi assim que o bug do canto de parede caiu.
    const cores: Record<string, string> = {
      '0.00': '#cbd5e1', '0.12': '#22c55e', '0.24': '#f59e0b',
      '0.48': '#a855f7', '0.60': '#dc2626', '0.84': '#0ea5e9',
    };
    const naRegiao = segs.filter((s) => dentro(s.a) && dentro(s.b) && comp(s) > 0.5);
    const linhas = naRegiao
      .map((s) => {
        const cor = cores[s.lw.toFixed(2)] ?? '#000000';
        const w = s.lw > 0.5 ? 1.6 : 0.4;
        return `<line x1="${s.a.x.toFixed(1)}" y1="${(-s.a.y).toFixed(1)}" x2="${s.b.x.toFixed(1)}" y2="${(-s.b.y).toFixed(1)}" stroke="${cor}" stroke-width="${w}"/>`;
      })
      .join('\n');
    writeFileSync(
      'docs/spikes/digitalizador/segmentos.svg',
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${REGIAO.x0} ${-REGIAO.y1} ${REGIAO.x1 - REGIAO.x0} ${REGIAO.y1 - REGIAO.y0}" width="1400" height="1600" style="background:#fff">
${linhas}
</svg>`,
    );

    writeFileSync(
      'spikeC-result.json',
      JSON.stringify(
        {
          segmentosNaRegiao: segs.filter((s) => dentro(s.a) && dentro(s.b)).length,
          candidatosParede: paredes.length,
          paredesNoModelo: model.walls.length,
          faces: arr.spaces.length,
          areaMaiorFace: Number((Math.max(0, ...arr.spaces.map((s) => s.areaMm2)) / 1e6).toFixed(2)),
          pontasSoltas: arr.danglingVertices.length,
          declaradas,
          somaDeclarada: Number(declaradas.reduce((a: number, b: number) => a + b, 0).toFixed(2)),
          derivadas: derivadas.map((v) => Number(v.toFixed(2))),
          somaDerivada: Number(derivadas.reduce((a, b) => a + b, 0).toFixed(2)),
        },
        null,
        1,
      ),
    );
  }, 300000);
});
