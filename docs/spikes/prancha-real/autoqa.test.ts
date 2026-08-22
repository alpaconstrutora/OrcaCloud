/**
 * Auto-QA da geração de paredes, ponta a ponta, sem ninguém clicando.
 *
 *   cp docs/spikes/prancha-real/autoqa.test.ts __tests__/__autoqa.test.ts
 *   npx vitest run __tests__/__autoqa.test.ts --reporter=verbose
 *   rm __tests__/__autoqa.test.ts
 *
 * ⚠️ Fica FORA de `__tests__/` porque depende de um PDF em caminho absoluto
 * que só existe nesta máquina — a mesma razão do `extrair.test.ts`.
 *
 * ─── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
 *
 * Eu vinha pedindo ao usuário os três números que decidem o próximo passo:
 * quantas paredes saem, quantas ele apaga, quantos vãos absurdos aparecem. Ele
 * perguntou por que eu não simulava sozinho. A resposta certa é que eu podia —
 * tenho o PDF, a aferição real, o código de produção e o kernel.
 *
 * ─── O GABARITO VEM DA PRÓPRIA PRANCHA ──────────────────────────────────────
 *
 * É o achado mais reaproveitável do Spike C: todo projeto brasileiro aprovado
 * escreve a área de cada ambiente (`a=17.83 m²`) porque a prefeitura exige.
 * Isso dispensa anotar planta à mão para medir precisão — compara-se área
 * derivada contra área declarada, e "erro ≤ 2%" vira medível em dado real.
 */
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  gerarParedes,
  ptParaModelo,
  type ParaPixel,
  type SegmentoVetor,
} from '../../../utils/blueprintVetor';
import {
  applyBatch,
  buildArrangement,
  emptyModel,
  polygonArea,
  type Command,
  type Point,
} from '../../../utils/blueprintKernel';
import type { Underlay } from '../../../utils/blueprintUnderlay';

const PDF = 'C:/D/ORÇACLOUD/PROJETO INICIAL-REGULARIZAÇÃO-R06-A0.pdf';

/** A aferição REAL do usuário: escala declarada 1:100, exata. */
const U: Underlay = {
  origemXMm: 0,
  origemYMm: 0,
  mmPorPixel: (25.4 / 150) * 100,
  rotacaoMrad: 0,
};

/** As plantas da folha, em pt do espaço do PDF. */
const PLANTAS = [
  ['PAV. 01', { x0: 1700, x1: 2400, y0: 2750, y1: 3250 }],
  ['PAV. 02', { x0: 1700, x1: 2400, y0: 2200, y1: 2700 }],
] as const;

const ESPESSURA_PAREDE_PT = 0.6;
const ALTURA_MM = 2800;

describe('auto-QA da geração', () => {
  it('mede o resultado inteiro', async () => {
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
    const vp = page.getViewport({ scale: 150 / 72 });
    const M = [...vp.transform] as ParaPixel;

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
    const pilha: any[] = [];
    const segs: SegmentoVetor[] = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];
      if (fn === OPS.save) pilha.push({ ctm: [...ctm], lw });
      else if (fn === OPS.restore) { const e = pilha.pop(); if (e) { ctm = e.ctm; lw = e.lw; } }
      else if (fn === OPS.transform) ctm = mul(args, ctm);
      else if (fn === OPS.setLineWidth) lw = args[0];
      else if (fn === OPS.constructPath) {
        const [tipos, coords] = args;
        let k = 0; let atual: any = null;
        const esc = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1;
        const larguraPt = lw * esc;
        for (const t of tipos) {
          if (t === OPS.moveTo) { atual = ap(ctm, coords[k], coords[k + 1]); k += 2; }
          else if (t === OPS.lineTo) {
            const p = ap(ctm, coords[k], coords[k + 1]); k += 2;
            if (atual) segs.push({ a: atual, b: p, larguraPt });
            atual = p;
          } else if (t === OPS.curveTo) { k += 6; atual = null; }
          else if (t === OPS.rectangle) {
            const [x, y, w, h] = coords.slice(k, k + 4); k += 4;
            const c = [ap(ctm, x, y), ap(ctm, x + w, y), ap(ctm, x + w, y + h), ap(ctm, x, y + h)];
            for (let j = 0; j < 4; j++) segs.push({ a: c[j], b: c[(j + 1) % 4], larguraPt });
            atual = null;
          } else atual = null;
        }
      }
    }

    // ── O gabarito: os rótulos `a=NN.NN m²` que a prefeitura obriga ─────────
    const rotulos: { area: number; x: number; y: number }[] = [];
    for (const it of texto.items as any[]) {
      const m = String(it.str ?? '').match(/a\s*=\s*([\d.,]+)/i);
      if (!m) continue;
      const area = Number(m[1].replace(',', '.'));
      if (Number.isFinite(area) && area > 0) {
        rotulos.push({ area, x: it.transform[4], y: it.transform[5] });
      }
    }

    const doGrupo = segs.filter((s) => Math.abs(s.larguraPt - ESPESSURA_PAREDE_PT) < 0.01);

    for (const [nome, R] of PLANTAS) {
      const c = [{ x: R.x0, y: R.y0 }, { x: R.x1, y: R.y1 }].map((p) => ptParaModelo(U, p, M));
      const lim = {
        x0: Math.min(c[0].x, c[1].x), x1: Math.max(c[0].x, c[1].x),
        y0: Math.min(c[0].y, c[1].y), y1: Math.max(c[0].y, c[1].y),
      };
      const paredes = gerarParedes(doGrupo, U, M, lim);

      // ── 1. Entra no kernel do jeito que o editor faz ────────────────────
      let modelo = emptyModel();
      modelo.levels.push({ id: 'n1', name: 'Térreo', elevationMm: 0 });
      const cmds: Command[] = paredes.map((p) => ({
        type: 'AddWall', levelId: 'n1', a: p.a, b: p.b,
        thicknessMm: p.espessuraMm, heightMm: ALTURA_MM,
      }));
      const r = applyBatch(modelo, cmds);
      modelo = r.model;
      const criadas = modelo.walls.length;

      // ── 2. Ambientes e pontas soltas, pelo kernel ───────────────────────
      const arr = buildArrangement(modelo, modelo.levels[0]);

      // ── 3. Vãos candidatos — a MESMA regra do BlueprintEditor ───────────
      const grau = new Map<string, { p: Point; n: number }>();
      for (const w of modelo.walls) {
        for (const e of [w.a, w.b]) {
          const k = `${e.x},${e.y}`;
          const at = grau.get(k);
          if (at) at.n += 1; else grau.set(k, { p: e, n: 1 });
        }
      }
      const soltas = [...grau.values()].filter((v) => v.n === 1).map((v) => v.p);
      const pares: { mm: number; a: Point; b: Point }[] = [];
      for (let i = 0; i < soltas.length; i++) {
        for (let j = i + 1; j < soltas.length; j++) {
          const mm = Math.round(Math.hypot(soltas[i].x - soltas[j].x, soltas[i].y - soltas[j].y));
          if (mm < 400 || mm > 3000) continue;
          pares.push({ mm, a: soltas[i], b: soltas[j] });
        }
      }
      pares.sort((p, q) => p.mm - q.mm);
      const usada = new Set<string>();
      const vaos: typeof pares = [];
      for (const p of pares) {
        const ka = `${p.a.x},${p.a.y}`, kb = `${p.b.x},${p.b.y}`;
        if (usada.has(ka) || usada.has(kb)) continue;
        usada.add(ka); usada.add(kb); vaos.push(p);
      }

      const total = paredes.reduce((t, p) => t + p.comprimentoMm, 0) / 1000;
      console.log(`\n═══ ${nome} ═══`);
      console.log(` paredes geradas: ${paredes.length} · aceitas pelo kernel: ${criadas} · ${total.toFixed(1)} m`);
      console.log(` pontas soltas: ${soltas.length} · vãos oferecidos: ${vaos.length}`);
      if (vaos.length) {
        const mm = vaos.map((v) => v.mm).sort((a, b) => a - b);
        console.log(`   vãos (cm): ${mm.map((x) => (x / 10).toFixed(0)).join(', ')}`);
      }
      console.log(` AMBIENTES fechados: ${arr.spaces.length}`);

      // ── 3b. QUÃO LONGE cada ponta solta está de outra parede ────────────
      //
      // É o número que decide o que construir a seguir. Se as pontas param a
      // poucos centímetros de outra parede, o que falta é MITRAR o canto — o
      // eixo abrange só a sobreposição do par e para antes do encontro. Se
      // param a mais de meio metro, são vãos de porta de verdade, e aí o
      // bloqueio é o semântico do Spike C, que mitragem nenhuma resolve.
      const distPontoSeg = (p: Point, a: Point, b: Point) => {
        const vx = b.x - a.x, vy = b.y - a.y;
        const L2 = vx * vx + vy * vy;
        if (L2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
        let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
      };
      const distancias: number[] = [];
      for (const s of soltas) {
        let melhor = Infinity;
        for (const w of modelo.walls) {
          // A parede que TEM esta ponta não conta como vizinha dela.
          const ehDona =
            (w.a.x === s.x && w.a.y === s.y) || (w.b.x === s.x && w.b.y === s.y);
          if (ehDona) continue;
          melhor = Math.min(melhor, distPontoSeg(s, w.a, w.b));
        }
        if (Number.isFinite(melhor)) distancias.push(melhor);
      }
      distancias.sort((x, y) => x - y);
      const faixa = (lo: number, hi: number) =>
        distancias.filter((d) => d >= lo && d < hi).length;
      console.log(
        ` ponta solta → parede mais próxima:` +
          ` <5cm ${faixa(0, 50)} · 5-15cm ${faixa(50, 150)} · 15-30cm ${faixa(150, 300)}` +
          ` · 30-60cm ${faixa(300, 600)} · >60cm ${faixa(600, Infinity)}`,
      );
      console.log(
        `   mediana ${(distancias[Math.floor(distancias.length / 2)] / 10).toFixed(1)} cm`,
      );

      // ── 4. Contra o GABARITO da própria prancha ─────────────────────────
      const doTrecho = rotulos.filter(
        (l) => l.x >= R.x0 && l.x <= R.x1 && l.y >= R.y0 && l.y <= R.y1,
      );
      console.log(` rótulos a=… na região: ${doTrecho.length}` +
        (doTrecho.length ? ` (${doTrecho.map((l) => l.area.toFixed(2)).join(', ')} m²)` : ''));

      for (const s of arr.spaces) {
        const areaM2 = Math.abs(polygonArea(s.ring)) / 1e6;
        // Casa o ambiente com o rótulo que está DENTRO dele.
        const dentro = doTrecho.filter((l) => {
          const p = ptParaModelo(U, { x: l.x, y: l.y }, M);
          let d = false;
          for (let i = 0, j = s.ring.length - 1; i < s.ring.length; j = i++) {
            const a = s.ring[i], b = s.ring[j];
            if ((a.y > p.y) !== (b.y > p.y) &&
                p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) d = !d;
          }
          return d;
        });
        const alvo = dentro[0];
        console.log(
          `   ambiente ${areaM2.toFixed(2)} m²` +
            (alvo
              ? ` · declarado ${alvo.area.toFixed(2)} m² · erro ${(((areaM2 - alvo.area) / alvo.area) * 100).toFixed(1)}%`
              : ' · sem rótulo dentro'),
        );
      }
    }
  }, 300000);
});
