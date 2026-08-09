/**
 * Spike C — rodada 5: detectar porta pelo ARCO DE GIRO e fechar só esses vãos.
 *
 * NÃO fica em `__tests__/`: depende de PDF em caminho absoluto.
 *   cp docs/spikes/digitalizador/porta_por_arco.test.ts __tests__/__spikeC5.test.ts
 *   npx vitest run __tests__/__spikeC5.test.ts
 *
 * As rodadas 1 a 4 descartavam toda curva do PDF (`curveTo` era pulado). O arco
 * de giro da porta é justamente uma curva — a evidência que separa porta de
 * guarda-corpo e de borda de terraço estava no arquivo, ignorada.
 *
 * Geometria do símbolo de porta em planta: dobradiça em H sobre a parede; folha
 * desenhada perpendicular, de H até H+perp*R; arco varrendo dessa ponta até
 * H+eixo*R, que é a outra ombreira. Ou seja, o CENTRO do arco é a dobradiça e o
 * RAIO é a largura do vão. Fechar o vão = ligar o centro às pontas do arco.
 */
import { describe, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const PDF = 'C:/D/ORÇACLOUD/PROJETO INICIAL-REGULARIZAÇÃO-R06-A0.pdf';
const REGIAO = { x0: 1780, x1: 2330, y0: 1840, y1: 2270 };
const PX_POR_PT = 4;
const MM_POR_PT = (25.4 / 72) * 100;

/** Faixa de raio que caracteriza folha de porta. Medido: 730 e 832 mm. */
const RAIO_MIN_MM = 550;
const RAIO_MAX_MM = 1700;

describe('spikeC5', () => {
  it('fecha vao por arco e remede', async () => {
    const require = createRequire(import.meta.url);
    const pdfjs: any = await import(
      pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href
    );
    const OPS = pdfjs.OPS;

    const doc = await pdfjs.getDocument({
      data: new Uint8Array(readFileSync(PDF)),
      disableWorker: true, isEvalSupported: false,
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
      x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5],
    });

    let ctm = [1, 0, 0, 1, 0, 0];
    let lw = 1;
    const pilha: any[] = [];
    const retas: any[] = [];
    const curvas: any[] = [];

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
        let at: any = null;
        const esc = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1;
        const lwPt = lw * esc;
        for (const t of tipos) {
          if (t === OPS.moveTo) { at = ap(ctm, coords[k], coords[k + 1]); k += 2; }
          else if (t === OPS.lineTo) {
            const p = ap(ctm, coords[k], coords[k + 1]); k += 2;
            if (at) retas.push({ a: at, b: p, lw: lwPt });
            at = p;
          } else if (t === OPS.curveTo) {
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

    const dentro = (p: any) =>
      p.x >= REGIAO.x0 && p.x <= REGIAO.x1 && p.y >= REGIAO.y0 && p.y <= REGIAO.y1;
    const comp = (s: any) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);

    // ── Achar o centro de cada arco candidato a porta ────────────────────────
    const portas: { centro: any; a: any; b: any; raioMm: number }[] = [];
    for (const c of curvas) {
      if (!dentro(c.ini) || !dentro(c.fim)) continue;
      const corda = Math.hypot(c.fim.x - c.ini.x, c.fim.y - c.ini.y);
      if (corda < 1) continue;
      const meio = {
        x: (c.ini.x + 3 * c.c1.x + 3 * c.c2.x + c.fim.x) / 8,
        y: (c.ini.y + 3 * c.c1.y + 3 * c.c2.y + c.fim.y) / 8,
      };
      const mx = (c.ini.x + c.fim.x) / 2;
      const my = (c.ini.y + c.fim.y) / 2;
      const flecha = Math.hypot(meio.x - mx, meio.y - my);
      if (flecha < 0.01) continue;
      const R = (corda * corda / 4 + flecha * flecha) / (2 * flecha);
      const raioMm = R * MM_POR_PT;
      if (raioMm < RAIO_MIN_MM || raioMm > RAIO_MAX_MM) continue;

      // Centro: sobre a mediatriz da corda, do lado OPOSTO à barriga do arco.
      const ux = (c.fim.x - c.ini.x) / corda;
      const uy = (c.fim.y - c.ini.y) / corda;
      const px = -uy, py = ux;
      const d = Math.sqrt(Math.max(0, R * R - (corda / 2) * (corda / 2)));
      const op1 = { x: mx + px * d, y: my + py * d };
      const op2 = { x: mx - px * d, y: my - py * d };
      // O certo é o que fica a R de `ini` E longe da barriga.
      const centro =
        Math.hypot(op1.x - meio.x, op1.y - meio.y) > Math.hypot(op2.x - meio.x, op2.y - meio.y)
          ? op1 : op2;

      portas.push({ centro, a: c.ini, b: c.fim, raioMm: Math.round(raioMm) });
    }

    // ── Rasterizar: parede + os dois raios de cada porta ─────────────────────
    const W = Math.ceil((REGIAO.x1 - REGIAO.x0) * PX_POR_PT);
    const H = Math.ceil((REGIAO.y1 - REGIAO.y0) * PX_POR_PT);
    const paraPx = (p: any) => ({
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
    const tracar = (a: any, b: any) => {
      const A = paraPx(a), B = paraPx(b);
      const n = Math.max(Math.abs(B.px - A.px), Math.abs(B.py - A.py), 1);
      for (let i = 0; i <= n; i++) {
        marcar(Math.round(A.px + ((B.px - A.px) * i) / n), Math.round(A.py + ((B.py - A.py) * i) / n));
      }
    };

    // COM_FINO: inclui o traco de 0,24 pt, que na rodada 2 fechou alguns vaos
    // por acidente (folha e arco de porta estao nele). Serve de linha de base
    // para saber se o arco ACRESCENTA algo ou so repete o que ja fechava.
    const COM_FINO = process.env.COM_FINO === '1';
    const COM_ARCO = process.env.COM_ARCO !== '0';
    const paredes = retas.filter(
      (s) => dentro(s.a) && dentro(s.b) && comp(s) > 1 &&
        ((s.lw > 0.5 && s.lw < 0.7) || (COM_FINO && s.lw > 0.2 && s.lw < 0.3)),
    );
    for (const s of paredes) tracar(s.a, s.b);
    // Ligar o centro (dobradiça) às duas pontas do arco: uma delas é a outra
    // ombreira, e essa é a que fecha o vão.
    if (COM_ARCO) for (const p of portas) { tracar(p.centro, p.a); tracar(p.centro, p.b); }

    // ── Preencher a partir dos rótulos ───────────────────────────────────────
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
          if (!barreira[Y * W + X]) { inicio = Y * W + X; break busca; }
        }
      }
      if (inicio === -1) { resultados.push({ declarada: r.declarada, derivada: null }); return; }

      const fila = [inicio];
      geracao[inicio] = idx;
      let n = 0;
      const invadiu = new Set<number>();
      let borda = false;
      while (fila.length) {
        const k = fila.pop()!;
        n++;
        const x = k % W, y = (k - x) / W;
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) borda = true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = x + dx, Y = y + dy;
          if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
          const kk = Y * W + X;
          if (barreira[kk] || geracao[kk] === idx) continue;
          if (dono[kk] !== -1 && dono[kk] !== idx) invadiu.add(dono[kk]);
          geracao[kk] = idx;
          if (dono[kk] === -1) dono[kk] = idx;
          fila.push(kk);
        }
      }
      const mmPx = MM_POR_PT / PX_POR_PT;
      const areaM2 = (n * mmPx * mmPx) / 1_000_000;
      resultados.push({
        declarada: r.declarada,
        derivada: Number(areaM2.toFixed(2)),
        erroPct: Number((((areaM2 - r.declarada) / r.declarada) * 100).toFixed(1)),
        vazou: invadiu.size > 0, borda,
      });
    });

    const ok = resultados.filter((r) => r.derivada !== null && !r.borda && !r.vazou);
    const erros = ok.map((r) => Math.abs(r.erroPct)).sort((a, b) => a - b);

    writeFileSync('spikeC5-result.json', JSON.stringify({
      config: `fino=${COM_FINO} arco=${COM_ARCO}`,
      portasDetectadas: portas.length,
      raios: portas.map((p) => p.raioMm),
      fecharam: ok.length, de: resultados.length,
      dentroDe2pct: ok.filter((r) => Math.abs(r.erroPct) <= 2).length,
      erroMediano: erros.length ? erros[Math.floor(erros.length / 2)] : null,
      resultados,
    }, null, 1));
  }, 300000);
});
