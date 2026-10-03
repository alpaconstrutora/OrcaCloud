/**
 * ESTUDO DE MASSA — O PAVIMENTO TIPO DO BLOCO EM L, U, T OU H (pendências de 03/10/2026, item 6 do plano
 * `2026-10-03-pendencias-estudo-de-massa.md`; a M6a deixou de fora "bloco que não é retângulo").
 *
 * O caminho retangular (`dividirPavimento`/`montarPavimentoTipo`) fica como está. Aqui o contorno ORTOGONAL (todos os
 * lados paralelos a dois eixos perpendiculares, no quadro do bloco):
 *
 *  1. GRADE: as linhas dos vértices dividem o contorno em células. Célula com vizinho nos DOIS eixos é NÓ (onde as
 *     asas se encontram: o canto do L, a junção do T e do H); as outras formam as ASAS (retângulos que correm num eixo
 *     só). Forma em escada (célula de asa com vizinho nos dois eixos sem ser nó) não é suportada — dito.
 *  2. CORREDORES: cada asa tem o seu, ao longo dela — central se a profundidade comporta duas unidades + corredor,
 *     senão lateral, do lado de dentro do bloco. No nó, os corredores das asas avançam até se cruzarem (o ponto do nó).
 *  3. NÚCLEO: no nó com mais asas, a parte livre SEM fachada (o canto de dentro do L) — escada, elevadores e hall. Parte
 *     livre sem fachada nos outros nós vira área comum (unidade sem janela não existe).
 *  4. UNIDADES: o resto são faixas entre o corredor e a fachada — as das asas e as partes dos nós com fachada —, que se
 *     encadeiam (a faixa de fora do L dobra o canto). Cada cadeia é cortada em unidades pela ÁREA alvo da tipologia; a
 *     que pega o canto pode sair em L (com duas fachadas: a unidade de canto).
 *  5. PAREDES: entre regiões diferentes (unidade × unidade, × corredor, × núcleo) e no contorno — das linhas da mesma
 *     grade, então as junções em T são exatas.
 *
 * Saída no formato da divisão retangular (`DivisaoDoPavimento`, esquema `ASAS`, com o plano em `ortogonal`): o painel
 * do bloco, o envio ao Empreendimento e a montagem leem o mesmo objeto. `dividirPavimentoDoBloco` e
 * `montarPavimentoTipoDoBloco` escolhem o caminho pelo contorno.
 */
import { applyBatch, pointInPolygon, signedArea, uidDeterministico, type BlueprintModel, type Bloco, type Command, type ObjectId, type Point, type Wall } from './blueprintKernel';
import { azimuteDaDirecao, pontoCardeal } from './blueprintGrafoEspacial';
import { FICHA_DO_ELEVADOR } from './blueprintNucleoVertical';
import {
  ALEM_MM,
  dividirPavimento,
  HIPOTESES_DO_PAVIMENTO_TIPO_PADRAO,
  montarPavimentoTipo,
  nomeDaUnidadeDaMassa,
  pavimentoTipoMontado,
  pisosAcimaDoSolo,
  quadroDoBloco,
  uidDoPavimentoTipo,
  type DivisaoDoPavimento,
  type EntradaDaDivisao,
  type HipotesesDoPavimentoTipo,
  type PavimentoTipoMontado,
  type QuadroDoBloco,
  type ResultadoDaDivisao,
  type RetLocal,
  type UnidadeDoPavimento,
} from './blueprintPavimentoTipoDaMassa';

export interface PlanoOrtogonal {
  /** O contorno no quadro do bloco (mm inteiros, lados nos eixos). */
  poligono: Point[];
  corredores: RetLocal[];
  nucleo: RetLocal | null;
  comuns: RetLocal[];
  /** As partes (retângulos) de cada unidade, na ordem de `DivisaoDoPavimento.unidades`. */
  partes: RetLocal[][];
}

type Ret = RetLocal;
const area = (r: Ret) => Math.max(0, r.a1 - r.a0) * Math.max(0, r.b1 - r.b0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const f1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('pt-BR');
const CARDINAIS = ['NORTE', 'LESTE', 'SUL', 'OESTE'] as const;
const TOL = 3;

const noMundo = (q: QuadroDoBloco, a: number, b: number): Point => ({ x: Math.round(q.o.x + q.u.x * a + q.v.x * b), y: Math.round(q.o.y + q.u.y * a + q.v.y * b) });

// ─── 1. O quadro e o contorno ortogonal ─────────────────────────────────────

/** O quadro do contorno ortogonal (u ao longo do lado mais longo) e o contorno nele, encaixado nos eixos. Null se não é ortogonal. */
export function quadroOrtogonal(pontos: readonly Point[]): { q: QuadroDoBloco; poligono: Point[] } | null {
  const n = pontos.length;
  if (n < 4) return null;
  let iMaior = 0;
  let maior = -1;
  for (let i = 0; i < n; i++) {
    const a = pontos[i];
    const b = pontos[(i + 1) % n];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l > maior) {
      maior = l;
      iMaior = i;
    }
  }
  const p0 = pontos[iMaior];
  const p1 = pontos[(iMaior + 1) % n];
  const u = { x: (p1.x - p0.x) / maior, y: (p1.y - p0.y) / maior };
  let v = { x: -u.y, y: u.x };
  const loc = (p: Point, vv: Point) => ({ a: (p.x - p0.x) * u.x + (p.y - p0.y) * u.y, b: (p.x - p0.x) * vv.x + (p.y - p0.y) * vv.y });
  // O contorno fica do lado +v do lado mais longo.
  if (pontos.reduce((s, p) => s + loc(p, v).b, 0) < 0) v = { x: -v.x, y: -v.y };
  const brutos = pontos.map((p) => loc(p, v));
  for (let i = 0; i < n; i++) {
    const a = brutos[i];
    const b = brutos[(i + 1) % n];
    if (Math.min(Math.abs(b.a - a.a), Math.abs(b.b - a.b)) > TOL) return null;
  }
  // Encaixe: valores de a (e de b) a menos de TOL viram o mesmo — os lados ficam exatamente nos eixos.
  const encaixe = (vals: number[]) => {
    const ord = [...vals].sort((x, y) => x - y);
    const grupos: number[][] = [];
    for (const x of ord) {
      const g = grupos[grupos.length - 1];
      if (g && x - g[g.length - 1] <= TOL) g.push(x);
      else grupos.push([x]);
    }
    return (x: number) => {
      const g = grupos.find((gg) => x >= gg[0] - 1e-9 && x <= gg[gg.length - 1] + 1e-9)!;
      return Math.round(g.reduce((s, y) => s + y, 0) / g.length);
    };
  };
  const ea = encaixe(brutos.map((p) => p.a));
  const eb = encaixe(brutos.map((p) => p.b));
  let poli = brutos.map((p) => ({ x: ea(p.a), y: eb(p.b) }));
  const minA = Math.min(...poli.map((p) => p.x));
  const minB = Math.min(...poli.map((p) => p.y));
  poli = poli.map((p) => ({ x: p.x - minA, y: p.y - minB }));
  // Sem repetidos nem colineares.
  const limpo: Point[] = [];
  for (const p of poli) if (!limpo.length || limpo[limpo.length - 1].x !== p.x || limpo[limpo.length - 1].y !== p.y) limpo.push(p);
  while (limpo.length > 1 && limpo[0].x === limpo[limpo.length - 1].x && limpo[0].y === limpo[limpo.length - 1].y) limpo.pop();
  const semColineares = limpo.filter((p, i) => {
    const a = limpo[(i - 1 + limpo.length) % limpo.length];
    const c = limpo[(i + 1) % limpo.length];
    return !((a.x === p.x && p.x === c.x) || (a.y === p.y && p.y === c.y));
  });
  if (semColineares.length < 4) return null;
  const W = Math.max(...semColineares.map((p) => p.x));
  const D = Math.max(...semColineares.map((p) => p.y));
  const o = { x: p0.x + u.x * minA + v.x * minB, y: p0.y + u.y * minA + v.y * minB };
  return { q: { o, u, v, W, D }, poligono: semColineares };
}

/** O comprimento do trecho de [p, q] (eixo) que está sobre o contorno. */
function sobreOContorno(poli: readonly Point[], p: Point, q: Point): number {
  let s = 0;
  const hor = p.y === q.y;
  for (let i = 0; i < poli.length; i++) {
    const a = poli[i];
    const b = poli[(i + 1) % poli.length];
    if (hor && a.y === b.y && a.y === p.y) {
      const lo = Math.max(Math.min(a.x, b.x), Math.min(p.x, q.x));
      const hi = Math.min(Math.max(a.x, b.x), Math.max(p.x, q.x));
      if (hi > lo) s += hi - lo;
    } else if (!hor && a.x === b.x && a.x === p.x) {
      const lo = Math.max(Math.min(a.y, b.y), Math.min(p.y, q.y));
      const hi = Math.min(Math.max(a.y, b.y), Math.max(p.y, q.y));
      if (hi > lo) s += hi - lo;
    }
  }
  return s;
}

/** As fachadas de um retângulo (lado → comprimento sobre o contorno). */
function fachadasDe(poli: readonly Point[], r: Ret): { a0: number; a1: number; b0: number; b1: number } {
  return {
    b0: sobreOContorno(poli, { x: r.a0, y: r.b0 }, { x: r.a1, y: r.b0 }),
    b1: sobreOContorno(poli, { x: r.a0, y: r.b1 }, { x: r.a1, y: r.b1 }),
    a0: sobreOContorno(poli, { x: r.a0, y: r.b0 }, { x: r.a0, y: r.b1 }),
    a1: sobreOContorno(poli, { x: r.a1, y: r.b0 }, { x: r.a1, y: r.b1 }),
  };
}

/** Os retângulos livres de `dentro` depois de tirar `ocupados` — células da grade das bordas, agrupadas por linha e coluna. */
function livres(dentro: Ret, ocupados: readonly Ret[]): Ret[] {
  const xs = [...new Set([dentro.a0, dentro.a1, ...ocupados.flatMap((r) => [r.a0, r.a1])])].filter((x) => x >= dentro.a0 && x <= dentro.a1).sort((x, y) => x - y);
  const ys = [...new Set([dentro.b0, dentro.b1, ...ocupados.flatMap((r) => [r.b0, r.b1])])].filter((y) => y >= dentro.b0 && y <= dentro.b1).sort((x, y) => x - y);
  const livre = (i: number, j: number) => {
    const ca = (xs[i] + xs[i + 1]) / 2;
    const cb = (ys[j] + ys[j + 1]) / 2;
    return !ocupados.some((r) => ca > r.a0 && ca < r.a1 && cb > r.b0 && cb < r.b1);
  };
  // Faixas por linha, depois as faixas iguais empilhadas viram um retângulo só.
  const faixas: Ret[] = [];
  for (let j = 0; j < ys.length - 1; j++) {
    let i = 0;
    while (i < xs.length - 1) {
      if (!livre(i, j)) {
        i++;
        continue;
      }
      let k = i;
      while (k < xs.length - 1 && livre(k, j)) k++;
      faixas.push({ a0: xs[i], b0: ys[j], a1: xs[k], b1: ys[j + 1] });
      i = k;
    }
  }
  const out: Ret[] = [];
  for (const f of faixas) {
    const acima = out.find((r) => r.a0 === f.a0 && r.a1 === f.a1 && r.b1 === f.b0);
    if (acima) acima.b1 = f.b1;
    else out.push({ ...f });
  }
  return out.filter((r) => area(r) > 0);
}

/** O trecho que dois retângulos compartilham numa borda (comprimento > 0), ou null. */
function bordaComum(r: Ret, s: Ret): { lado: 'a0' | 'a1' | 'b0' | 'b1'; ini: number; fim: number } | null {
  const sob = (lo1: number, hi1: number, lo2: number, hi2: number) => [Math.max(lo1, lo2), Math.min(hi1, hi2)] as const;
  if (r.a1 === s.a0 || r.a0 === s.a1) {
    const [ini, fim] = sob(r.b0, r.b1, s.b0, s.b1);
    if (fim > ini) return { lado: r.a1 === s.a0 ? 'a1' : 'a0', ini, fim };
  }
  if (r.b1 === s.b0 || r.b0 === s.b1) {
    const [ini, fim] = sob(r.a0, r.a1, s.a0, s.a1);
    if (fim > ini) return { lado: r.b1 === s.b0 ? 'b1' : 'b0', ini, fim };
  }
  return null;
}

// ─── 2. A divisão ────────────────────────────────────────────────────────────

interface Asa {
  ret: Ret;
  eixo: 'a' | 'b';
  corredor: Ret;
  /** Centro do corredor no eixo transversal. */
  centro: number;
  faixas: Ret[];
}

export function dividirPavimentoOrtogonal(e: EntradaDaDivisao, hipParcial: Partial<HipotesesDoPavimentoTipo> = {}): ResultadoDaDivisao {
  const hip = { ...HIPOTESES_DO_PAVIMENTO_TIPO_PADRAO, ...hipParcial };
  const nome = e.bloco.nome;
  const fo = quadroOrtogonal(e.bloco.pontos);
  if (!fo) return { ok: false, motivo: `"${nome}" não é retângulo nem tem os lados em dois eixos perpendiculares (L, U, T, H): a divisão automática do pavimento não trabalha nessa forma.` };
  const { q, poligono: P } = fo;
  const lista: { t: EntradaDaDivisao['produto']['tipologias'][number] }[] = [];
  for (const t of e.produto.tipologias) for (let k = 0; k < (e.porTipologia[t.id] ?? 0); k++) lista.push({ t });
  if (lista.length === 0) return { ok: false, motivo: `"${nome}" não recebe unidade no pavimento tipo (sem produto do uso do bloco, ou o pavimento é pequeno para o mix).` };
  const decisoes: string[] = [];
  const avisos: string[] = [];

  // Grade dos vértices.
  const xs = [...new Set(P.map((p) => p.x))].sort((a, b) => a - b);
  const ys = [...new Set(P.map((p) => p.y))].sort((a, b) => a - b);
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const dentro = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && pointInPolygon(P, { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 });
  const no = (i: number, j: number) => dentro(i, j) && (dentro(i - 1, j) || dentro(i + 1, j)) && (dentro(i, j - 1) || dentro(i, j + 1));
  const cel = (i: number, j: number): Ret => ({ a0: xs[i], b0: ys[j], a1: xs[i + 1], b1: ys[j + 1] });

  // Nós: células agrupadas (vizinhas nos 4 lados) — cada grupo tem de ser um retângulo cheio.
  const visto = new Set<string>();
  const nos: Ret[] = [];
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      if (!no(i, j) || visto.has(`${i},${j}`)) continue;
      const fila = [[i, j]];
      const grupo: number[][] = [];
      visto.add(`${i},${j}`);
      while (fila.length) {
        const [ci, cj] = fila.pop()!;
        grupo.push([ci, cj]);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = `${ci + di},${cj + dj}`;
          if (!visto.has(k) && no(ci + di, cj + dj)) {
            visto.add(k);
            fila.push([ci + di, cj + dj]);
          }
        }
      }
      const i0 = Math.min(...grupo.map((g) => g[0]));
      const i1 = Math.max(...grupo.map((g) => g[0]));
      const j0 = Math.min(...grupo.map((g) => g[1]));
      const j1 = Math.max(...grupo.map((g) => g[1]));
      if (grupo.length !== (i1 - i0 + 1) * (j1 - j0 + 1)) return { ok: false, motivo: `"${nome}": a junção das asas não é um retângulo — forma não suportada pela divisão automática (use L, U, T ou H de asas retangulares).` };
      nos.push({ a0: xs[i0], b0: ys[j0], a1: xs[i1 + 1], b1: ys[j1 + 1] });
    }
  if (nos.length === 0) return { ok: false, motivo: `"${nome}": contorno sem junção de asas.` };

  // Asas: células que não são nó, corridas num eixo só.
  const asas: Asa[] = [];
  const usada = new Set<string>();
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      if (!dentro(i, j) || no(i, j) || usada.has(`${i},${j}`)) continue;
      const hor = dentro(i - 1, j) || dentro(i + 1, j);
      const ver = dentro(i, j - 1) || dentro(i, j + 1);
      if (hor && ver) return { ok: false, motivo: `"${nome}": forma em escada — não suportada pela divisão automática (use L, U, T ou H de asas retangulares).` };
      let r = cel(i, j);
      usada.add(`${i},${j}`);
      if (hor) {
        let k = i + 1;
        while (dentro(k, j) && !no(k, j)) {
          if (dentro(k, j - 1) || dentro(k, j + 1)) return { ok: false, motivo: `"${nome}": forma em escada — não suportada pela divisão automática.` };
          usada.add(`${k},${j}`);
          r = { ...r, a1: xs[k + 1] };
          k++;
        }
      } else {
        let k = j + 1;
        while (dentro(i, k) && !no(i, k)) {
          if (dentro(i - 1, k) || dentro(i + 1, k)) return { ok: false, motivo: `"${nome}": forma em escada — não suportada pela divisão automática.` };
          usada.add(`${i},${k}`);
          r = { ...r, b1: ys[k + 1] };
          k++;
        }
      }
      asas.push({ ret: r, eixo: hor ? 'a' : 'b', corredor: r, centro: 0, faixas: [] });
    }

  // Corredor de cada asa: central se cabem duas unidades + corredor; senão lateral, do lado de dentro do bloco.
  const cx = P.reduce((s, p) => s + p.x, 0) / P.length;
  const cy = P.reduce((s, p) => s + p.y, 0) / P.length;
  const c = hip.corredorMm;
  for (const w of asas) {
    const [t0, t1] = w.eixo === 'a' ? [w.ret.b0, w.ret.b1] : [w.ret.a0, w.ret.a1];
    const prof = t1 - t0;
    const central = prof >= 2 * hip.profundidadeMinDaUnidadeMm + c;
    if (prof - c < 4000) return { ok: false, motivo: `"${nome}": uma asa tem ${f1(prof / 1000)} m de profundidade — tirando o corredor, a unidade ficaria com menos de 4 m.` };
    let c0: number;
    if (central) c0 = Math.round(t0 + (prof - c) / 2);
    else {
      const meio = (t0 + t1) / 2;
      const dentroDoBloco = w.eixo === 'a' ? cy : cx;
      c0 = dentroDoBloco >= meio ? t1 - c : t0;
    }
    const c1 = c0 + c;
    w.centro = (c0 + c1) / 2;
    w.corredor = w.eixo === 'a' ? { a0: w.ret.a0, b0: c0, a1: w.ret.a1, b1: c1 } : { a0: c0, b0: w.ret.b0, a1: c1, b1: w.ret.b1 };
    w.faixas =
      w.eixo === 'a'
        ? [{ ...w.ret, b1: c0 }, { ...w.ret, b0: c1 }].filter((f) => f.b1 - f.b0 >= 1)
        : [{ ...w.ret, a1: c0 }, { ...w.ret, a0: c1 }].filter((f) => f.a1 - f.a0 >= 1);
  }
  const esquemas = asas.map((w) => ((w.eixo === 'a' ? w.ret.b1 - w.ret.b0 : w.ret.a1 - w.ret.a0) >= 2 * hip.profundidadeMinDaUnidadeMm + c ? 'central' : 'lateral'));
  decisoes.push(
    `${nome}: ${asas.length} asa(s) e ${nos.length} nó(s) (${f1(q.W / 1000)} × ${f1(q.D / 1000)} m no total) → corredor de ${f1(c / 1000)} m em cada asa (${esquemas.filter((x) => x === 'central').length} central, ${esquemas.filter((x) => x === 'lateral').length} lateral), ligados nos nós.`,
  );

  // Nós: os corredores das asas avançam até se cruzarem.
  const corredores: Ret[] = asas.map((w) => w.corredor);
  const asasDoNo = nos.map((h) =>
    asas
      .map((w) => ({ w, b: bordaComum(h, w.ret) }))
      .filter((x): x is { w: Asa; b: NonNullable<ReturnType<typeof bordaComum>> } => !!x.b),
  );
  nos.forEach((h, k) => {
    const lig = asasDoNo[k];
    const hor = lig.filter((x) => x.b.lado === 'a0' || x.b.lado === 'a1');
    const ver = lig.filter((x) => x.b.lado === 'b0' || x.b.lado === 'b1');
    const nb = hor.length ? hor[0].w.centro : (h.b0 + h.b1) / 2;
    const na = ver.length ? ver[0].w.centro : (h.a0 + h.a1) / 2;
    const clip = (r: Ret): Ret => ({ a0: Math.max(h.a0, r.a0), b0: Math.max(h.b0, r.b0), a1: Math.min(h.a1, r.a1), b1: Math.min(h.b1, r.b1) });
    const add = (r: Ret) => {
      const x = clip(r);
      if (area(x) > 0) corredores.push({ a0: Math.round(x.a0), b0: Math.round(x.b0), a1: Math.round(x.a1), b1: Math.round(x.b1) });
    };
    for (const { w, b } of lig) {
      if (b.lado === 'a0') add({ a0: h.a0, a1: na + c / 2, b0: w.centro - c / 2, b1: w.centro + c / 2 });
      if (b.lado === 'a1') add({ a0: na - c / 2, a1: h.a1, b0: w.centro - c / 2, b1: w.centro + c / 2 });
      if (b.lado === 'b0') add({ b0: h.b0, b1: nb + c / 2, a0: w.centro - c / 2, a1: w.centro + c / 2 });
      if (b.lado === 'b1') add({ b0: nb - c / 2, b1: h.b1, a0: w.centro - c / 2, a1: w.centro + c / 2 });
      // O corredor da asa fora do eixo do nó: um trecho até ele.
      if ((b.lado === 'a0' || b.lado === 'a1') && Math.abs(w.centro - nb) > 1) add({ a0: na - c / 2, a1: na + c / 2, b0: Math.min(w.centro, nb) - c / 2, b1: Math.max(w.centro, nb) + c / 2 });
      if ((b.lado === 'b0' || b.lado === 'b1') && Math.abs(w.centro - na) > 1) add({ b0: nb - c / 2, b1: nb + c / 2, a0: Math.min(w.centro, na) - c / 2, a1: Math.max(w.centro, na) + c / 2 });
    }
  });

  // Partes livres dos nós; núcleo no nó com mais asas, na parte sem fachada.
  const fach = (r: Ret) => {
    const f = fachadasDe(P, r);
    return f.a0 + f.a1 + f.b0 + f.b1;
  };
  const tocaCorredor = (r: Ret) => corredores.some((k) => bordaComum(r, k));
  const iNucleo = nos.map((h, k) => ({ k, n: asasDoNo[k].length, a: area(h) })).sort((x, y) => y.n - x.n || y.a - x.a)[0].k;
  let nucleo: Ret | null = null;
  const comuns: Ret[] = [];
  const pecas: Ret[] = asas.flatMap((w) => w.faixas);
  nos.forEach((h, k) => {
    const partes = livres(h, corredores);
    let resto = partes;
    if (k === iNucleo && e.nucleoM2 > 0) {
      const candidatas = partes.filter(tocaCorredor).sort((x, y) => fach(x) - fach(y) || area(y) - area(x));
      if (candidatas.length) {
        nucleo = candidatas[0];
        resto = partes.filter((p) => p !== nucleo);
        const m2 = area(nucleo) / 1e6;
        decisoes.push(`Núcleo de ${f1(e.nucleoM2)} m² (M2) no nó ${fach(nucleo) === 0 ? 'do lado de dentro (sem fachada)' : 'com a menor fachada'}: ${f1(m2)} m² — ${e.elevadores} elevador(es), shaft, escada e o hall.`);
        if (m2 < e.nucleoM2 * 0.8) avisos.push(`O núcleo no nó tem ${f1(m2)} m², menos que os ${f1(e.nucleoM2)} m² da M2: confira as peças.`);
      } else avisos.push('Nenhuma parte do nó encosta no corredor: o núcleo ficou para o projetista.');
    }
    // Parte sem fachada também entra: encostada numa faixa, ela a prolonga (a unidade tem fachada pelo resto). Só a
    // cadeia sem fachada NENHUMA vira área comum — unidade sem janela não existe.
    pecas.push(...resto);
  });

  // Cadeias de peças encostadas (sem corredor entre elas).
  const viz = pecas.map((p, i) => pecas.map((s, j) => (i !== j && bordaComum(p, s) ? j : -1)).filter((j) => j >= 0));
  const naCadeia = new Array(pecas.length).fill(false);
  const cadeias: number[][] = [];
  for (let i = 0; i < pecas.length; i++) {
    if (naCadeia[i]) continue;
    const comp: number[] = [];
    const fila = [i];
    naCadeia[i] = true;
    while (fila.length) {
      const x = fila.pop()!;
      comp.push(x);
      for (const y of viz[x])
        if (!naCadeia[y]) {
          naCadeia[y] = true;
          fila.push(y);
        }
    }
    // Em CAMINHOS: começa numa ponta (menos vizinhos restantes) e anda preferindo seguir reto (o vizinho do lado
    // oposto ao de onde veio); o que sobra de um componente que ramifica vira outro caminho. (Antes, componente que
    // não era caminho virava peça por peça — e uma peça de nó inteira virava uma unidade de 116 m².)
    const resta = new Set(comp);
    while (resta.size) {
      const grau = (x: number) => viz[x].filter((y) => resta.has(y)).length;
      const ini = [...resta].sort((x, y) => grau(x) - grau(y) || x - y)[0];
      const ordem = [ini];
      resta.delete(ini);
      for (;;) {
        const atual = ordem[ordem.length - 1];
        const cand = viz[atual].filter((y) => resta.has(y));
        if (!cand.length) break;
        const ant = ordem.length > 1 ? ordem[ordem.length - 2] : null;
        const ladoAnt = ant != null ? bordaComum(pecas[atual], pecas[ant])?.lado : null;
        const oposto = ladoAnt ? ({ a0: 'a1', a1: 'a0', b0: 'b1', b1: 'b0' } as const)[ladoAnt] : null;
        const reto = oposto ? cand.find((y) => bordaComum(pecas[atual], pecas[y])?.lado === oposto) : undefined;
        const prox = reto ?? cand[0];
        ordem.push(prox);
        resta.delete(prox);
      }
      cadeias.push(ordem);
    }
  }

  // Peça de CANTO (entra por um eixo, sai pelo outro): só o trecho na faixa da saída é a dobra; o resto, do lado da
  // entrada, é reto — separado, para poder ser cortado (sem isso o canto inteiro de um nó virava uma unidade só).
  for (let k = 0; k < cadeias.length; k++) {
    const ch = cadeias[k];
    for (let pos = 1; pos < ch.length - 1; pos++) {
      const pc = pecas[ch[pos]];
      const bA = bordaComum(pc, pecas[ch[pos - 1]]);
      const bP = bordaComum(pc, pecas[ch[pos + 1]]);
      if (!bA || !bP) continue;
      const eixoA = bA.lado === 'a0' || bA.lado === 'a1' ? 'a' : 'b';
      const eixoP = bP.lado === 'a0' || bP.lado === 'a1' ? 'a' : 'b';
      if (eixoA === eixoP) continue;
      // Três trechos: o reto ANTES da dobra (do lado da entrada, fora da faixa da saída), a DOBRA (o quadrado onde a
      // faixa da entrada cruza a da saída) e o reto DEPOIS (do lado da saída, fora da faixa da entrada).
      const trechos = partirCanto(pc, bA, bP);
      if (trechos.length < 2) continue;
      pecas[ch[pos]] = trechos[0];
      for (let t = 1; t < trechos.length; t++) {
        pecas.push(trechos[t]);
        ch.splice(pos + t, 0, pecas.length - 1);
      }
      pos += trechos.length - 1;
      pos++;
    }
  }

  // Cadeia sem fachada nenhuma: área comum.
  const cadeiasComFachada = cadeias.filter((ch) => {
    if (ch.some((i) => fach(pecas[i]) > 0)) return true;
    for (const i of ch) comuns.push(pecas[i]);
    return false;
  });
  cadeias.length = 0;
  cadeias.push(...cadeiasComFachada);
  if (comuns.length) avisos.push(`${comuns.length} parte(s) de nó sem fachada ficaram como área comum (unidade sem janela não existe).`);

  // Unidades nas cadeias: cada uma vai para a cadeia menos cheia (pela área alvo); depois a cadeia é cortada pela área.
  const capacidade = cadeias.map((ch) => ch.reduce((s, i) => s + area(pecas[i]), 0));
  const alvo = (i: number) => lista[i].t.areaPrivativaM2 * 1e6;
  const minAlvo = Math.min(...lista.map((_, i) => alvo(i)));
  const usaveis = cadeias.map((_, k) => capacidade[k] >= 0.6 * minAlvo);
  cadeias.forEach((ch, k) => {
    if (!usaveis[k]) for (const i of ch) comuns.push(pecas[i]);
  });
  const porCadeia: number[][] = cadeias.map(() => []);
  const soma = cadeias.map(() => 0);
  lista.forEach((_, i) => {
    let melhor = -1;
    let razao = Infinity;
    cadeias.forEach((_c, k) => {
      if (!usaveis[k]) return;
      const r = (soma[k] + alvo(i)) / capacidade[k];
      if (r < razao) {
        razao = r;
        melhor = k;
      }
    });
    if (melhor < 0) return;
    porCadeia[melhor].push(i);
    soma[melhor] += alvo(i);
  });
  // Rebalanceia: a repartição gulosa deixa cadeia curta com uma unidade esticada (f = 2). Move uma unidade da cadeia
  // mais apertada para a mais folgada enquanto o pior desvio |log f| cair.
  const desvio = (cap: number, sm: number) => (sm > 0 ? Math.abs(Math.log(cap / sm)) : cap >= 0.6 * minAlvo ? Math.log(cap / minAlvo + 1) : 0);
  for (let it = 0; it < 4 * lista.length; it++) {
    const ks = cadeias.map((_, k) => k).filter((k) => usaveis[k]);
    const pior = () => Math.max(...ks.map((k) => desvio(capacidade[k], soma[k])));
    const antes = pior();
    let melhorMov: { de: number; para: number; u: number; valor: number } | null = null;
    for (const de of ks)
      for (const para of ks) {
        if (de === para) continue;
        for (const u of porCadeia[de]) {
          soma[de] -= alvo(u);
          soma[para] += alvo(u);
          const v = pior();
          soma[de] += alvo(u);
          soma[para] -= alvo(u);
          if (v < antes - 1e-6 && (!melhorMov || v < melhorMov.valor)) melhorMov = { de, para, u, valor: v };
        }
      }
    if (!melhorMov) break;
    const { de, para, u } = melhorMov;
    porCadeia[de] = porCadeia[de].filter((x) => x !== u);
    porCadeia[para].push(u);
    soma[de] -= alvo(u);
    soma[para] += alvo(u);
  }
  // Dentro de cada cadeia, as unidades na ordem do produto (a numeração segue a posição de envio).
  for (const us of porCadeia) us.sort((x, y) => x - y);
  const partesDe = new Map<number, Ret[]>();
  cadeias.forEach((ch, k) => {
    const us = porCadeia[k];
    if (!us.length) {
      if (usaveis[k]) for (const i of ch) comuns.push(pecas[i]);
      return;
    }
    const f = capacidade[k] / soma[k];
    if (f < 0.9) avisos.push(`Uma faixa: as unidades ficaram ${f1((1 - f) * 100)} % menores que a área alvo para caber.`);
    else if (f > 1.15) avisos.push(`Uma faixa: as unidades ficaram ${f1((f - 1) * 100)} % maiores que a área alvo (sobra área — confira o mix).`);
    // Corte pela ÁREA acumulada, peça por peça, na ordem da cadeia:
    //  - peça de CANTO (entra por um eixo, sai pelo outro) nunca é cortada: vai inteira para a unidade atual se ainda
    //    falta mais da metade dela; senão a unidade atual fecha antes e o canto abre a próxima;
    //  - peça RETA é cortada perpendicular à corrida, a partir do lado por onde a cadeia entra;
    //  - a última unidade da cadeia fica com o que sobrar (absorve os arredondamentos).
    const alvos = us.map((i) => alvo(i) * f);
    let iu = 0;
    let falta = alvos[0];
    let atual: Ret[] = [];
    // A área da cadeia ainda sem dono: a cada unidade fechada, os alvos das que faltam são reescalados para somar
    // exatamente ela — um canto que estourou uma unidade não deixa a última sem lugar.
    let restante = capacidade[k];
    const fecha = () => {
      partesDe.set(us[iu], atual);
      restante -= atual.reduce((sm, r) => sm + area(r), 0);
      atual = [];
      iu++;
      const somaResto = alvos.slice(iu).reduce((sm, x) => sm + x, 0);
      if (somaResto > 0) for (let j = iu; j < alvos.length; j++) alvos[j] *= restante / somaResto;
      falta = alvos[iu];
    };
    const ultima = () => iu >= us.length - 1;
    ch.forEach((ip, pos) => {
      const peca0 = pecas[ip];
      const bAnt = pos > 0 ? bordaComum(peca0, pecas[ch[pos - 1]]) : null;
      const bProx = pos < ch.length - 1 ? bordaComum(peca0, pecas[ch[pos + 1]]) : null;
      const eixoDe = (lado: string) => (lado === 'a0' || lado === 'a1' ? 'a' : 'b');
      if (bAnt && bProx && eixoDe(bAnt.lado) !== eixoDe(bProx.lado)) {
        const a = area(peca0);
        // Fecha antes do canto só a unidade quase cheia (70 % do alvo) — senão ela ficaria com um resto minúsculo.
        if (!ultima() && atual.length > 0 && falta < a / 2 && falta <= 0.3 * alvos[iu]) fecha();
        atual.push(peca0);
        falta -= a;
        if (!ultima() && falta <= 1) fecha();
        return;
      }
      // Lado de entrada: o que encosta na peça anterior; na primeira, o oposto do que encosta na próxima.
      const oposto = { a0: 'a1', a1: 'a0', b0: 'b1', b1: 'b0' } as const;
      const entrada: 'a0' | 'a1' | 'b0' | 'b1' = bAnt ? bAnt.lado : bProx ? oposto[bProx.lado] : peca0.a1 - peca0.a0 >= peca0.b1 - peca0.b0 ? 'a0' : 'b0';
      let peca = { ...peca0 };
      while (area(peca) > 0) {
        const a = area(peca);
        if (ultima() || falta >= a - 1) {
          atual.push(peca);
          falta -= a;
          if (!ultima() && falta <= 1) fecha();
          break;
        }
        const larg = entrada === 'a0' || entrada === 'a1' ? peca.b1 - peca.b0 : peca.a1 - peca.a0;
        const comp = Math.max(1, Math.round(falta / larg));
        let parte: Ret;
        if (entrada === 'a0') [parte, peca] = [{ ...peca, a1: peca.a0 + comp }, { ...peca, a0: peca.a0 + comp }];
        else if (entrada === 'a1') [parte, peca] = [{ ...peca, a0: peca.a1 - comp }, { ...peca, a1: peca.a1 - comp }];
        else if (entrada === 'b0') [parte, peca] = [{ ...peca, b1: peca.b0 + comp }, { ...peca, b0: peca.b0 + comp }];
        else [parte, peca] = [{ ...peca, b0: peca.b1 - comp }, { ...peca, b1: peca.b1 - comp }];
        atual.push(parte);
        fecha();
      }
    });
    if (atual.length) partesDe.set(us[Math.min(iu, us.length - 1)], [...(partesDe.get(us[Math.min(iu, us.length - 1)]) ?? []), ...atual]);
  });

  // As unidades no formato da divisão.
  const unidades: UnidadeDoPavimento[] = [];
  const partes: Ret[][] = [];
  const rua = e.direcaoDaRua ?? null;
  lista.forEach(({ t }, i) => {
    const ps = (partesDe.get(i) ?? []).filter((r) => area(r) > 0);
    if (!ps.length) {
      avisos.push(`Uma unidade de ${t.nome} não coube nas faixas.`);
      return;
    }
    // Fachadas da unidade: bordas das partes sobre o contorno, por direção (normal para fora).
    const porDirecao = new Map<string, number>();
    for (const r of ps) {
      const f = fachadasDe(P, r);
      for (const [lado, l] of Object.entries(f)) if (l > 0) porDirecao.set(lado, (porDirecao.get(lado) ?? 0) + l);
    }
    const principal = [...porDirecao.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
    const normalLocal = principal === 'b0' ? { a: 0, b: -1 } : principal === 'b1' ? { a: 0, b: 1 } : principal === 'a0' ? { a: -1, b: 0 } : principal === 'a1' ? { a: 1, b: 0 } : { a: 0, b: -1 };
    const normal = { x: q.u.x * normalLocal.a + q.v.x * normalLocal.b, y: q.u.y * normalLocal.a + q.v.y * normalLocal.b };
    const az = azimuteDaDirecao(normal, e.rotacaoNorteDeg);
    const cosRua = rua ? normal.x * rua.x + normal.y * rua.y : null;
    const caixa: Ret = { a0: Math.min(...ps.map((r) => r.a0)), b0: Math.min(...ps.map((r) => r.b0)), a1: Math.max(...ps.map((r) => r.a1)), b1: Math.max(...ps.map((r) => r.b1)) };
    if (!principal) avisos.push(`Unidade ${nomeDaUnidadeDaMassa(e.ordinalDoTipo, i + 1)}: sem fachada.`);
    unidades.push({
      posicao: i + 1,
      numero: nomeDaUnidadeDaMassa(e.ordinalDoTipo, i + 1),
      tipologiaId: t.id,
      tipologiaNome: t.nome,
      anel: contornoDasPartes(ps).map((p) => noMundo(q, p.x, p.y)),
      areaM2: r2(ps.reduce((s, r) => s + area(r), 0) / 1e6),
      alvoM2: t.areaPrivativaM2,
      lado: principal === 'b1' || principal === 'a1' ? 'B' : 'A',
      canto: porDirecao.size >= 2,
      fachadaAzimuteGraus: az,
      orientacao: pontoCardeal(az),
      solCardinal: CARDINAIS[Math.round((((az % 360) + 360) % 360) / 90) % 4],
      posicaoNoLote: cosRua == null ? null : cosRua > 0.7 ? 'FRENTE' : cosRua < -0.7 ? 'FUNDOS' : 'LATERAL',
      local: caixa,
    });
    partes.push(ps);
  });
  const fora = unidades.filter((u) => u.areaM2 > 1.25 * u.alvoM2 || u.areaM2 < 0.75 * u.alvoM2);
  if (fora.length) avisos.push(`${fora.length} unidade(s) fora de ±25 % da área alvo (canto e fim de faixa): ${fora.map((u) => `${u.numero} (${f1(u.areaM2)} m² de ${f1(u.alvoM2)})`).join(', ')} — confira o mix ou ajuste à mão.`);
  decisoes.push(
    `${unidades.length} unidade(s) no pavimento tipo (${unidades.filter((u) => u.canto).length} de canto, ${partes.filter((p) => p.length > 1 && !ehRetangulo(p)).length} em L): ${e.produto.tipologias
      .filter((t) => (e.porTipologia[t.id] ?? 0) > 0)
      .map((t) => `${e.porTipologia[t.id]} × ${t.nome}`)
      .join(', ')}.`,
  );
  return {
    ok: true,
    divisao: {
      blocoId: e.bloco.id,
      nomeDoBloco: nome,
      esquema: 'ASAS',
      larguraM: r2(q.W / 1000),
      profundidadeM: r2(q.D / 1000),
      ordinalDoTipo: e.ordinalDoTipo,
      unidades,
      elevadores: e.elevadores,
      decisoes,
      avisos,
      quadro: q,
      corredor: corredores[0],
      nucleo,
      profundidades: { a: 0, b: 0 },
      ortogonal: { poligono: P, corredores, nucleo, comuns, partes },
    },
  };
}

/**
 * Uma peça de canto em trechos, na ordem da corrida: [reto antes?, dobra, reto depois?]. `bA` é a borda com a peça
 * anterior (por onde entra), `bP` com a seguinte (por onde sai) — em eixos diferentes.
 */
function partirCanto(pc: Ret, bA: NonNullable<ReturnType<typeof bordaComum>>, bP: NonNullable<ReturnType<typeof bordaComum>>): Ret[] {
  let nucleo = { ...pc };
  let antes: Ret | null = null;
  let depois: Ret | null = null;
  const entraEmA = bA.lado === 'a0' || bA.lado === 'a1';
  if (entraEmA) {
    // Corre em a: o reto antes fica em a, fora da faixa da saída [bP.ini, bP.fim].
    if (bA.lado === 'a1' && bP.fim < nucleo.a1) [antes, nucleo] = [{ ...nucleo, a0: bP.fim }, { ...nucleo, a1: bP.fim }];
    if (bA.lado === 'a0' && bP.ini > nucleo.a0) [antes, nucleo] = [{ ...nucleo, a1: bP.ini }, { ...nucleo, a0: bP.ini }];
    // Sai em b: o reto depois fica em b, fora da faixa da entrada [bA.ini, bA.fim].
    if (bP.lado === 'b1' && bA.fim < nucleo.b1) [depois, nucleo] = [{ ...nucleo, b0: bA.fim }, { ...nucleo, b1: bA.fim }];
    if (bP.lado === 'b0' && bA.ini > nucleo.b0) [depois, nucleo] = [{ ...nucleo, b1: bA.ini }, { ...nucleo, b0: bA.ini }];
  } else {
    if (bA.lado === 'b1' && bP.fim < nucleo.b1) [antes, nucleo] = [{ ...nucleo, b0: bP.fim }, { ...nucleo, b1: bP.fim }];
    if (bA.lado === 'b0' && bP.ini > nucleo.b0) [antes, nucleo] = [{ ...nucleo, b1: bP.ini }, { ...nucleo, b0: bP.ini }];
    if (bP.lado === 'a1' && bA.fim < nucleo.a1) [depois, nucleo] = [{ ...nucleo, a0: bA.fim }, { ...nucleo, a1: bA.fim }];
    if (bP.lado === 'a0' && bA.ini > nucleo.a0) [depois, nucleo] = [{ ...nucleo, a1: bA.ini }, { ...nucleo, a0: bA.ini }];
  }
  return [antes, nucleo, depois].filter((r): r is Ret => !!r && area(r) >= 1);
}

/** As partes formam um retângulo só? */
function ehRetangulo(ps: readonly Ret[]): boolean {
  const caixa = { a0: Math.min(...ps.map((r) => r.a0)), b0: Math.min(...ps.map((r) => r.b0)), a1: Math.max(...ps.map((r) => r.a1)), b1: Math.max(...ps.map((r) => r.b1)) };
  return Math.abs(area(caixa) - ps.reduce((s, r) => s + area(r), 0)) < 1;
}

/** O contorno (anel) da união de retângulos que se encostam — pela grade das bordas. */
export function contornoDasPartes(ps: readonly Ret[]): Point[] {
  const xs = [...new Set(ps.flatMap((r) => [r.a0, r.a1]))].sort((a, b) => a - b);
  const ys = [...new Set(ps.flatMap((r) => [r.b0, r.b1]))].sort((a, b) => a - b);
  const em = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= xs.length - 1 || j >= ys.length - 1) return false;
    const ca = (xs[i] + xs[i + 1]) / 2;
    const cb = (ys[j] + ys[j + 1]) / 2;
    return ps.some((r) => ca > r.a0 && ca < r.a1 && cb > r.b0 && cb < r.b1);
  };
  // Arestas da borda orientadas (anti-horário), depois encadeadas.
  const arestas = new Map<string, Point>();
  const chave = (p: Point) => `${p.x},${p.y}`;
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < ys.length - 1; j++) {
      if (!em(i, j)) continue;
      if (!em(i, j - 1)) arestas.set(chave({ x: xs[i], y: ys[j] }), { x: xs[i + 1], y: ys[j] });
      if (!em(i + 1, j)) arestas.set(chave({ x: xs[i + 1], y: ys[j] }), { x: xs[i + 1], y: ys[j + 1] });
      if (!em(i, j + 1)) arestas.set(chave({ x: xs[i + 1], y: ys[j + 1] }), { x: xs[i], y: ys[j + 1] });
      if (!em(i - 1, j)) arestas.set(chave({ x: xs[i], y: ys[j + 1] }), { x: xs[i], y: ys[j] });
    }
  const [k0] = arestas.keys();
  if (!k0) return [];
  const [x0, y0] = k0.split(',').map(Number);
  const anel: Point[] = [{ x: x0, y: y0 }];
  let atual = arestas.get(k0)!;
  let guarda = 0;
  while ((atual.x !== x0 || atual.y !== y0) && guarda++ < 10000) {
    anel.push(atual);
    atual = arestas.get(chave(atual))!;
  }
  // Sem colineares.
  return anel.filter((p, i) => {
    const a = anel[(i - 1 + anel.length) % anel.length];
    const c = anel[(i + 1) % anel.length];
    return !((a.x === p.x && p.x === c.x) || (a.y === p.y && p.y === c.y));
  });
}

// ─── 3. A montagem no kernel ─────────────────────────────────────────────────

function paredeNoPonto(paredes: readonly Wall[], p: Point): { w: Wall; off: number; len: number } | null {
  for (const w of paredes) {
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const t = ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / len;
    const dist = Math.abs((p.x - w.a.x) * dy - (p.y - w.a.y) * dx) / len;
    if (dist <= 3 && t >= 0 && t <= len) return { w, off: t, len };
  }
  return null;
}

export function montarPavimentoTipoOrtogonal(model: BlueprintModel, b: Bloco, d: DivisaoDoPavimento, hipParcial: Partial<HipotesesDoPavimentoTipo> = {}): PavimentoTipoMontado {
  const hip = { ...HIPOTESES_DO_PAVIMENTO_TIPO_PADRAO, ...hipParcial };
  const plano = d.ortogonal;
  if (!plano) throw new Error('Divisão sem o plano ortogonal.');
  const avisos: string[] = [];
  const ja = pavimentoTipoMontado(model, b);
  if (ja) throw new Error(`O pavimento tipo de "${b.nome}" já está montado ("${ja.name}"). Para refazer, remova esse pavimento (as cópias se desvinculam) e monte de novo.`);
  const q = d.quadro;
  const P = plano.poligono;
  const pisos = pisosAcimaDoSolo(model, b);
  const iTipo = Math.min(pisos.length, d.ordinalDoTipo) - 1;
  const comandos: Command[] = [];
  let m = model;
  const aplicar = (cs: Command[]) => {
    if (cs.length === 0) return;
    m = applyBatch(m, cs).model;
    comandos.push(...cs);
  };

  // 1. O pavimento tipo.
  aplicar([{ type: 'AddLevel', name: `${b.nome} · ${d.ordinalDoTipo}º pav (tipo)`.slice(0, 60), elevationMm: pisos[iTipo] ?? 0, defaultHeightMm: b.peDireitoMm, uid: uidDoPavimentoTipo(b) }]);
  const tipo = m.levels[m.levels.length - 1].id;

  // 2. As regiões numa grade só: -1 fora, 0 corredor, 1 núcleo, 2 área comum, 10 + k a unidade k.
  const regioes: { r: Ret; id: number }[] = [
    ...plano.corredores.map((r) => ({ r, id: 0 })),
    ...(plano.nucleo ? [{ r: plano.nucleo, id: 1 }] : []),
    ...plano.comuns.map((r) => ({ r, id: 2 })),
    ...plano.partes.flatMap((ps, k) => ps.map((r) => ({ r, id: 10 + k }))),
  ];
  const xs = [...new Set([...P.map((p) => p.x), ...regioes.flatMap((x) => [x.r.a0, x.r.a1])])].sort((a, c) => a - c);
  const ys = [...new Set([...P.map((p) => p.y), ...regioes.flatMap((x) => [x.r.b0, x.r.b1])])].sort((a, c) => a - c);
  const rot: number[][] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    rot.push([]);
    for (let j = 0; j < ys.length - 1; j++) {
      const ca = (xs[i] + xs[i + 1]) / 2;
      const cb = (ys[j] + ys[j + 1]) / 2;
      if (!pointInPolygon(P, { x: ca, y: cb })) {
        rot[i].push(-1);
        continue;
      }
      const reg = regioes.find((x) => ca > x.r.a0 && ca < x.r.a1 && cb > x.r.b0 && cb < x.r.b1);
      rot[i].push(reg ? reg.id : 2); // sobra sem dono = área comum
    }
  }
  const rotulo = (i: number, j: number) => (i < 0 || j < 0 || i >= xs.length - 1 || j >= ys.length - 1 ? -1 : rot[i][j]);

  // 3. Paredes: borda entre rótulos diferentes; segmentos colineares contíguos de mesma espessura viram um.
  type Seg = { fixo: number; ini: number; fim: number; ext: boolean };
  const verticais: Seg[] = [];
  const horizontais: Seg[] = [];
  for (let i = 0; i <= xs.length - 1; i++)
    for (let j = 0; j < ys.length - 1; j++) {
      const l = rotulo(i - 1, j);
      const r = rotulo(i, j);
      if (l === r || (l === -1 && r === -1)) continue;
      verticais.push({ fixo: xs[i], ini: ys[j], fim: ys[j + 1], ext: l === -1 || r === -1 });
    }
  for (let j = 0; j <= ys.length - 1; j++)
    for (let i = 0; i < xs.length - 1; i++) {
      const s0 = rotulo(i, j - 1);
      const s1 = rotulo(i, j);
      if (s0 === s1 || (s0 === -1 && s1 === -1)) continue;
      horizontais.push({ fixo: ys[j], ini: xs[i], fim: xs[i + 1], ext: s0 === -1 || s1 === -1 });
    }
  const juntar = (segs: Seg[]) => {
    const out: Seg[] = [];
    for (const s of [...segs].sort((x, y) => x.fixo - y.fixo || Number(x.ext) - Number(y.ext) || x.ini - y.ini)) {
      const u = out[out.length - 1];
      if (u && u.fixo === s.fixo && u.ext === s.ext && u.fim === s.ini) u.fim = s.fim;
      else out.push({ ...s });
    }
    return out;
  };
  const girado = Math.abs(q.u.x * q.u.y) > 1e-9;
  const parede = (a0: number, b0: number, a1: number, b1: number, ext: boolean): Command => {
    let [pa0, pb0, pa1, pb1] = [a0, b0, a1, b1];
    if (girado && !ext) {
      // Bloco girado: a interna passa ALEM_MM de cada encontro (o kernel só corta em interseção exata).
      const l = Math.hypot(a1 - a0, b1 - b0) || 1;
      const da = ((a1 - a0) / l) * ALEM_MM;
      const db = ((b1 - b0) / l) * ALEM_MM;
      [pa0, pb0, pa1, pb1] = [a0 - da, b0 - db, a1 + da, b1 + db];
    }
    return { type: 'AddWall', levelId: tipo, a: noMundo(q, pa0, pb0), b: noMundo(q, pa1, pb1), thicknessMm: ext ? hip.paredeExternaMm : hip.paredeInternaMm, heightMm: b.peDireitoMm };
  };
  const paredes: Command[] = [...juntar(verticais).map((s) => parede(s.fixo, s.ini, s.fixo, s.fim, s.ext)), ...juntar(horizontais).map((s) => parede(s.ini, s.fixo, s.fim, s.fixo, s.ext))];
  aplicar(paredes);

  // 4. Ambientes: corredor, núcleo, áreas comuns; cada unidade como Unidade (E2.2).
  const espacoEm = (r: Ret) => {
    const c = noMundo(q, (r.a0 + r.a1) / 2, (r.b0 + r.b1) / 2);
    return m.spaces.find((s) => s.levelId === tipo && pointInPolygon(s.ring, c)) ?? null;
  };
  const nomes: Command[] = [];
  const nomeados = new Set<string>();
  const nomear = (r: Ret, nome: string) => {
    const s = espacoEm(r);
    if (!s || nomeados.has(s.id)) return;
    nomeados.add(s.id);
    nomes.push({ type: 'NameSpace', spaceId: s.id, name: nome });
  };
  for (const r of plano.corredores) nomear(r, 'Circulação');
  if (plano.nucleo) nomear(plano.nucleo, 'Núcleo (escada, elevadores e hall)');
  for (const r of plano.comuns) nomear(r, 'Área comum');
  const numerosLivres = d.unidades.filter((u) => !(m.unidades ?? []).some((x) => x.numero === u.numero));
  if (numerosLivres.length < d.unidades.length) avisos.push('Algumas unidades já existiam com o mesmo número no estudo: não foram recriadas.');
  aplicar([...nomes, ...numerosLivres.map((u): Command => ({ type: 'AddUnidade', numero: u.numero, tipologia: u.tipologiaNome }))]);
  const vinculos: Command[] = [];
  for (const u of numerosLivres) {
    const k = d.unidades.indexOf(u);
    const maior = [...plano.partes[k]].sort((x, y) => area(y) - area(x))[0];
    const s = maior ? espacoEm(maior) : null;
    const und = (m.unidades ?? []).find((x) => x.numero === u.numero);
    if (!s || !und) {
      avisos.push(`Unidade ${u.numero}: o ambiente não fechou no desenho.`);
      continue;
    }
    vinculos.push({ type: 'SetUnidadeDoAmbiente', spaceId: s.id, unidadeId: und.id, nome: `Apto ${u.numero}` });
  }
  aplicar(vinculos);

  // 5. Portas: cada região abre para o corredor no trecho comum mais longo.
  const paredesDoTipo = m.walls.filter((w) => w.levelId === tipo);
  const portas: Command[] = [];
  const ocupados = new Map<ObjectId, { ini: number; fim: number }[]>();
  const abrir = (id: number, rotuloDaRegiao: string) => {
    // Trechos contíguos da borda região × corredor.
    const trechos: { fixo: number; ini: number; fim: number; vertical: boolean }[] = [];
    for (let i = 0; i <= xs.length - 1; i++)
      for (let j = 0; j < ys.length - 1; j++) {
        const l = rotulo(i - 1, j);
        const r = rotulo(i, j);
        if ((l === id && r === 0) || (l === 0 && r === id)) trechos.push({ fixo: xs[i], ini: ys[j], fim: ys[j + 1], vertical: true });
      }
    for (let j = 0; j <= ys.length - 1; j++)
      for (let i = 0; i < xs.length - 1; i++) {
        const s0 = rotulo(i, j - 1);
        const s1 = rotulo(i, j);
        if ((s0 === id && s1 === 0) || (s0 === 0 && s1 === id)) trechos.push({ fixo: ys[j], ini: xs[i], fim: xs[i + 1], vertical: false });
      }
    const juntos: typeof trechos = [];
    for (const t of trechos.sort((x, y) => Number(x.vertical) - Number(y.vertical) || x.fixo - y.fixo || x.ini - y.ini)) {
      const u = juntos[juntos.length - 1];
      if (u && u.vertical === t.vertical && u.fixo === t.fixo && u.fim === t.ini) u.fim = t.fim;
      else juntos.push({ ...t });
    }
    const t = juntos.sort((x, y) => y.fim - y.ini - (x.fim - x.ini))[0];
    if (!t || t.fim - t.ini < hip.portaMm + 500) {
      avisos.push(`${rotuloDaRegiao}: sem frente para o corredor onde caiba a porta.`);
      return;
    }
    const meio = (t.ini + t.fim) / 2;
    const centro = t.vertical ? noMundo(q, t.fixo, meio) : noMundo(q, meio, t.fixo);
    const hit = paredeNoPonto(paredesDoTipo, centro);
    if (!hit) {
      avisos.push(`${rotuloDaRegiao}: não achei a parede do corredor para a porta.`);
      return;
    }
    const p0 = paredeNoPonto([hit.w], t.vertical ? noMundo(q, t.fixo, t.ini) : noMundo(q, t.ini, t.fixo));
    const p1 = paredeNoPonto([hit.w], t.vertical ? noMundo(q, t.fixo, t.fim) : noMundo(q, t.fim, t.fixo));
    const lo = Math.min(p0?.off ?? 0, p1?.off ?? hit.len) + 250;
    const hi = Math.max(p0?.off ?? 0, p1?.off ?? hit.len) - 250;
    if (hi - lo < hip.portaMm) {
      avisos.push(`${rotuloDaRegiao}: a frente para o corredor é estreita para a porta.`);
      return;
    }
    const off = Math.round(Math.min(hi - hip.portaMm, Math.max(lo, hit.off - hip.portaMm / 2)));
    const lista = ocupados.get(hit.w.id) ?? [];
    if (lista.some((o) => off < o.fim + 100 && off + hip.portaMm > o.ini - 100)) return;
    ocupados.set(hit.w.id, [...lista, { ini: off, fim: off + hip.portaMm }]);
    portas.push({ type: 'AddOpening', wallId: hit.w.id, kind: 'door', offsetMm: off, widthMm: hip.portaMm, heightMm: hip.alturaPortaMm, sillMm: 0 });
  };
  d.unidades.forEach((u, k) => abrir(10 + k, `Unidade ${u.numero}`));
  if (plano.nucleo) abrir(1, 'Núcleo');
  if (plano.comuns.length) abrir(2, 'Área comum');
  aplicar(portas);

  // 6. Núcleo: elevadores encostados no lado que dá para o corredor, shaft ao lado, escada no fundo.
  const n = plano.nucleo;
  if (n) {
    const lados: { lado: 'a0' | 'a1' | 'b0' | 'b1'; l: number }[] = (['a0', 'a1', 'b0', 'b1'] as const).map((lado) => ({
      lado,
      l: plano.corredores.reduce((s, k) => {
        const bc = bordaComum(n, k);
        return s + (bc && bc.lado === lado ? bc.fim - bc.ini : 0);
      }, 0),
    }));
    const frente = lados.sort((x, y) => y.l - x.l)[0].lado;
    // Quadro do núcleo: s ao longo da frente, t da frente para o fundo.
    const ao = (s: number, t: number): Point => {
      if (frente === 'b1') return noMundo(q, n.a0 + s, n.b1 - t);
      if (frente === 'b0') return noMundo(q, n.a1 - s, n.b0 + t);
      if (frente === 'a1') return noMundo(q, n.a1 - t, n.b1 - s);
      return noMundo(q, n.a0 + t, n.b0 + s);
    };
    const S = frente === 'b0' || frente === 'b1' ? n.a1 - n.a0 : n.b1 - n.b0;
    const T = frente === 'b0' || frente === 'b1' ? n.b1 - n.b0 : n.a1 - n.a0;
    const anel = (s0: number, t0: number, s1: number, t1: number) => [ao(s0, t0), ao(s1, t0), ao(s1, t1), ao(s0, t1)];
    const ficha = FICHA_DO_ELEVADOR.find((f) => f.capacidade === 8)!;
    const [ew, ed] = ficha.caixaMm;
    const pecas: Command[] = [];
    let s = 200;
    for (let i = 0; i < d.elevadores; i++) {
      if (s + ew > S - 200 || ed + 400 > T) {
        avisos.push('O núcleo não comporta todos os elevadores.');
        break;
      }
      pecas.push({ type: 'AddNucleo', levelId: tipo, tipo: 'ELEVADOR', ring: anel(s, 200, s + ew, 200 + ed), rotulo: `${b.nome} · E${i + 1}`.slice(0, 40), capacidade: 8, pocoMm: ficha.pocoMm, casaDeMaquinasMm: ficha.casaDeMaquinasMm });
      s += ew + 100;
    }
    if (s + 1000 <= S - 200 && 1200 <= T) pecas.push({ type: 'AddNucleo', levelId: tipo, tipo: 'SHAFT', ring: anel(s, 200, s + 1000, 1200), rotulo: `${b.nome} · shaft`.slice(0, 40) });
    const tEsc = T - 200 - hip.larguraDaEscadaMm / 2;
    if (tEsc - hip.larguraDaEscadaMm / 2 > 200 + ed + 1500 && S > 2600) pecas.push({ type: 'AddEscada', levelId: tipo, pontos: [ao(300, tEsc), ao(S - 300, tEsc)], larguraMm: hip.larguraDaEscadaMm, rotulo: `${b.nome} · escada` });
    else avisos.push('O núcleo é raso para escada e elevadores juntos: a escada ficou para o projetista.');
    aplicar(pecas);
  }

  // 7. Os demais pavimentos como cópias vivas do tipo.
  const copias: Command[] = [];
  for (let i = iTipo + 1; i < pisos.length; i++) copias.push({ type: 'AddLevel', name: `${b.nome} · ${i + 1}º pav`.slice(0, 60), elevationMm: pisos[i], defaultHeightMm: b.peDireitoMm, tipoDeId: tipo, uid: uidDeterministico(`massa:pavimento-tipo:${b.uid}:copia:${i + 1}`) });
  aplicar(copias);
  if (iTipo > 0) avisos.push(`O ${iTipo === 1 ? '1º pavimento (térreo)' : 'pavimento abaixo do tipo'} ficou para o projetista: portaria, lazer, pilotis.`);

  const areasDesenhadas = d.unidades.map((u, k) => {
    const maior = [...plano.partes[k]].sort((x, y) => area(y) - area(x))[0];
    const sp = maior ? espacoEm(maior) : null;
    return { numero: u.numero, areaM2: sp ? r2(Math.abs(signedArea(sp.ring)) / 1e6) : 0 };
  });
  const bruta = Math.abs(signedArea(P)) / 1e6;
  const somaUnidades = areasDesenhadas.reduce((s, x) => s + x.areaM2, 0);
  return { comandos, model: m, tipoLevelId: tipo, copias: copias.length, areasDesenhadas, eficienciaDesenhadaPct: bruta > 0 ? Math.round((somaUnidades / bruta) * 1000) / 10 : null, avisos };
}

// ─── 4. Os despachantes ──────────────────────────────────────────────────────

/** A divisão do pavimento tipo do bloco: retângulo pelo caminho da M6a; L, U, T, H pelo ortogonal. */
export function dividirPavimentoDoBloco(e: EntradaDaDivisao, hip: Partial<HipotesesDoPavimentoTipo> = {}): ResultadoDaDivisao {
  return quadroDoBloco(e.bloco) ? dividirPavimento(e, hip) : dividirPavimentoOrtogonal(e, hip);
}

/** A montagem pela divisão que veio. */
export function montarPavimentoTipoDoBloco(model: BlueprintModel, b: Bloco, d: DivisaoDoPavimento, hip: Partial<HipotesesDoPavimentoTipo> = {}): PavimentoTipoMontado {
  return d.ortogonal ? montarPavimentoTipoOrtogonal(model, b, d, hip) : montarPavimentoTipo(model, b, d, hip);
}
