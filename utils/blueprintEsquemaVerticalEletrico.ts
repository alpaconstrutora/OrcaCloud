/**
 * E4.5 — O ESQUEMA VERTICAL ELÉTRICO (29/09/2026, roadmap elétrico).
 *
 * O corte esquemático da instalação: os PAVIMENTOS com cota, cada QUADRO na
 * sua altura, o ALIMENTADOR de cada quadro-filho saindo do pai (com seção,
 * geral e comprimento) e as PRUMADAS de eletroduto que atravessam pavimentos.
 * É o irmão do esquema vertical hidrossanitário (`blueprintEsquemaVertical`):
 * mesma escala vertical, colunas sem escala na horizontal, legenda à direita.
 *
 * ─── O QUE É UMA PRUMADA ────────────────────────────────────────────────────
 *
 * Trecho ELÉTRICO vertical (mesmo x, y nas pontas, cotas diferentes) que não
 * é a descida ao próprio quadro (a ponta na cota de um quadro ali, a ≤ 200 mm
 * dele). Prumadas no mesmo (x, y) em pavimentos diferentes são UMA coluna —
 * P-1, P-2… por x e depois y.
 */
import type { BlueprintModel, ObjectId } from './blueprintKernel';
import type { Desenhista } from './blueprintExport';
import { COR_DA_DISCIPLINA } from './blueprintRede';
import { HIPOTESES_PADRAO, preDimensionarQuadroCompleto, type HipotesesEletricas } from './blueprintEletricaDimensionamento';

const COR = '#000000';
const COR_FRACA = '#555555';
const TEXTO_MM = 2.0;
const ESCALAS = [20, 25, 50, 75, 100, 125, 150, 200, 250];
const DESCIDA_AO_QUADRO_MM = 200;
const metros = (mm: number) => `${mm >= 0 ? '+' : '−'}${(Math.abs(mm) / 1000).toFixed(2).replace('.', ',')}`;

export interface PrumadaEletrica {
  nome: string;
  x: number;
  y: number;
  segmentos: { levelId: ObjectId; zA: number; zB: number; bitolaMm: number }[];
}

/** As prumadas de eletroduto do desenho, nomeadas P-1, P-2… por x e depois y. */
export function prumadasEletricas(model: BlueprintModel): PrumadaEletrica[] {
  const elevacao = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const grupos = new Map<string, PrumadaEletrica>();
  for (const t of model.trechos ?? []) {
    if (t.disciplina !== 'ELETRICA' || Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y) >= 1 || t.cotaAMm === t.cotaBMm) continue;
    // A descida ao próprio quadro (uma ponta na cota de um quadro a ≤ 200 mm) é ligação, não prumada.
    const quadroAli = (model.quadros ?? []).find((q) => q.levelId === t.levelId && Math.hypot(q.at.x - t.a.x, q.at.y - t.a.y) <= DESCIDA_AO_QUADRO_MM);
    if (quadroAli && (t.cotaAMm === quadroAli.cotaMm || t.cotaBMm === quadroAli.cotaMm)) continue;
    const z0 = elevacao.get(t.levelId) ?? 0;
    const chave = `${t.a.x},${t.a.y}`;
    const g = grupos.get(chave) ?? { nome: '', x: t.a.x, y: t.a.y, segmentos: [] };
    g.segmentos.push({ levelId: t.levelId, zA: z0 + Math.min(t.cotaAMm, t.cotaBMm), zB: z0 + Math.max(t.cotaAMm, t.cotaBMm), bitolaMm: t.bitolaMm });
    grupos.set(chave, g);
  }
  return [...grupos.values()]
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map((g, i) => ({ ...g, nome: `P-${i + 1}`, segmentos: g.segmentos.sort((s, r) => s.zA - r.zA) }));
}

/**
 * Desenha o esquema em (x0, y0) dentro de w × h mm; devolve quantos quadros
 * entraram (0 = "nenhum quadro", com o aviso escrito).
 */
export function desenharEsquemaVerticalEletrico(d: Desenhista, model: BlueprintModel, hip: HipotesesEletricas = HIPOTESES_PADRAO, x0: number, y0: number, w: number, h: number): number {
  const quadros = [...(model.quadros ?? [])];
  if (quadros.length === 0) {
    d.texto(x0, y0 + 4, 'Nenhum quadro de distribuição no desenho.', TEXTO_MM * 1.2, COR_FRACA);
    return 0;
  }
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  const elevacao = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const topo = niveis.length ? niveis[niveis.length - 1].elevationMm + niveis[niveis.length - 1].defaultHeightMm : 0;
  const prumadas = prumadasEletricas(model);
  const zDoQuadro = (q: (typeof quadros)[number]) => (elevacao.get(q.levelId) ?? 0) + q.cotaMm;
  const zs = [...quadros.map(zDoQuadro), ...prumadas.flatMap((p) => p.segmentos.flatMap((s) => [s.zA, s.zB]))];
  const zMin = Math.min(0, ...zs) - 300;
  const zMax = Math.max(topo, ...zs) + 300;

  const larguraDaLegenda = Math.min(120, w * 0.4);
  const larguraDoEsquema = w - larguraDaLegenda - 8;
  const MARGEM_ESQ = 34;
  const altura = h - 18;
  const den = ESCALAS.find((e) => (zMax - zMin) / e <= altura) ?? Math.ceil((zMax - zMin) / altura / 50) * 50;
  const yDe = (z: number) => y0 + 10 + (zMax - z) / den;
  // Colunas: os quadros por (x, y), depois as prumadas.
  quadros.sort((a, b) => a.at.x - b.at.x || a.at.y - b.at.y || zDoQuadro(a) - zDoQuadro(b));
  const colunas = quadros.length + prumadas.length;
  const passo = Math.min(34, Math.max(16, (larguraDoEsquema - MARGEM_ESQ) / colunas));
  const xDe = (i: number) => x0 + MARGEM_ESQ + passo * (i + 0.5);
  const xFim = x0 + MARGEM_ESQ + passo * colunas;
  const indiceDoQuadro = new Map(quadros.map((q, i) => [q.id, i]));

  // ── Pavimentos ───────────────────────────────────────────────────────────
  for (const n of niveis) {
    const y = yDe(n.elevationMm);
    d.linha(x0, y, xFim, y, { espessuraMm: 0.25, cor: COR_FRACA });
    d.texto(x0, y - 1.2, n.name, TEXTO_MM, COR);
    d.texto(x0, y + 2.6, metros(n.elevationMm), TEXTO_MM * 0.9, COR_FRACA);
  }
  const yTopo = yDe(topo);
  for (let x = x0; x < xFim; x += 3) d.linha(x, yTopo, Math.min(x + 1.5, xFim), yTopo, { espessuraMm: 0.2, cor: COR_FRACA });
  d.texto(x0, yTopo - 1.2, 'Cobertura', TEXTO_MM, COR);
  d.texto(x0, yTopo + 2.6, metros(topo), TEXTO_MM * 0.9, COR_FRACA);

  // ── Quadros e alimentadores ──────────────────────────────────────────────
  const cor = COR_DA_DISCIPLINA.ELETRICA;
  const LARG = Math.min(12, passo * 0.7);
  const ALT = 5;
  const predim = new Map(quadros.map((q) => [q.id, preDimensionarQuadroCompleto(model, q.id, hip)]));
  quadros.forEach((q, i) => {
    const x = xDe(i);
    const y = yDe(zDoQuadro(q));
    d.retangulo(x - LARG / 2, y - ALT / 2, LARG, ALT, { espessuraMm: 0.45, cor: COR });
    d.linha(x - LARG / 2, y + ALT / 2, x + LARG / 2, y - ALT / 2, { espessuraMm: 0.25, cor: COR });
    d.texto(x - LARG / 2, y - ALT / 2 - 1.2, q.nome, TEXTO_MM, COR);
    const r = predim.get(q.id);
    // O tipo embaixo só quando não é QD e o nome já não o diz ("QGBT" chamado "QGBT").
    if (r && r.tipo !== 'QD' && q.nome.trim().toUpperCase() !== r.tipo) d.texto(x - LARG / 2, y + ALT / 2 + 2.6, r.tipo, TEXTO_MM * 0.9, COR_FRACA);
    // O alimentador que CHEGA a este quadro, saindo do pai: em L, com seção, geral e metros.
    if (q.quadroPaiId && indiceDoQuadro.has(q.quadroPaiId)) {
      const pai = quadros[indiceDoQuadro.get(q.quadroPaiId) as number];
      const xp = xDe(indiceDoQuadro.get(pai.id) as number);
      const yp = yDe(zDoQuadro(pai));
      const dir = x >= xp ? 1 : -1;
      d.linha(xp + (dir * LARG) / 2, yp, x, yp, { espessuraMm: 0.6, cor });
      d.linha(x, yp, x, y + (yp > y ? ALT / 2 : -ALT / 2), { espessuraMm: 0.6, cor });
      const rot = [
        r?.secaoCalculada ? `${String(r.secaoCalculada.secaoMm2).replace('.', ',')} mm²` : null,
        r?.disjuntorGeralA != null ? `${r.disjuntorGeralA} A` : null,
        r?.alimentadorM != null ? `${String(Math.round(r.alimentadorM * 10) / 10).replace('.', ',')} m${r.alimentadorOrigem === 'ELETRODUTOS' ? ' (eletroduto)' : ''}` : null,
      ].filter((s): s is string => !!s);
      if (rot.length) d.texto(x + 1.2, (yp + y) / 2, rot.join(' · '), TEXTO_MM * 0.9, cor);
    } else if (!q.quadroPaiId) {
      // A entrada: seta que chega pela esquerda.
      d.linha(x - LARG / 2 - 6, y, x - LARG / 2, y, { espessuraMm: 0.6, cor });
      d.poligono([{ x: x - LARG / 2, y }, { x: x - LARG / 2 - 2.2, y: y - 1.1 }, { x: x - LARG / 2 - 2.2, y: y + 1.1 }], cor);
      d.texto(x - LARG / 2 - 9, y - 2.6, 'entrada', TEXTO_MM * 0.8, COR_FRACA);
    }
  });

  // ── Prumadas ─────────────────────────────────────────────────────────────
  prumadas.forEach((p, j) => {
    const x = xDe(quadros.length + j);
    let dnAnterior: number | null = null;
    let anterior: PrumadaEletrica['segmentos'][number] | null = null;
    for (const s of p.segmentos) {
      if (anterior && s.zA > anterior.zB && s.zA - anterior.zB <= 300) d.linha(x, yDe(s.zA), x, yDe(anterior.zB), { espessuraMm: 0.45, cor });
      anterior = s;
      d.linha(x, yDe(s.zB), x, yDe(s.zA), { espessuraMm: 0.45, cor });
      if (s.bitolaMm !== dnAnterior && yDe(s.zA) - yDe(s.zB) >= 5) {
        d.texto(x + 1.2, (yDe(s.zA) + yDe(s.zB)) / 2, `Ø${s.bitolaMm}`, TEXTO_MM * 0.9, cor);
        dnAnterior = s.bitolaMm;
      }
    }
    const zTopo = Math.max(...p.segmentos.map((s) => s.zB));
    d.texto(x - 3, yDe(zTopo) - 2, p.nome, TEXTO_MM * 1.1, COR);
  });
  d.texto(x0, y0 + h - 2, `Esquema vertical elétrico · escala vertical 1:${den} · colunas sem escala na horizontal`, TEXTO_MM, COR_FRACA);

  // ── Legenda ──────────────────────────────────────────────────────────────
  const xl = x0 + w - larguraDaLegenda;
  let yl = y0 + 10;
  d.texto(xl, yl, 'LEGENDA DOS QUADROS', 2.4, COR);
  yl += 5;
  for (const l of linhasDaLegendaEletrica(model, hip)) {
    d.texto(xl, yl, l, TEXTO_MM, COR);
    yl += 3.6;
  }
  return quadros.length;
}

/** Uma linha por quadro ("QGBT — QGBT · FFF 220 V · entrada · alimenta QD1, QD2") e uma por prumada. */
export function linhasDaLegendaEletrica(model: BlueprintModel, hip: HipotesesEletricas = HIPOTESES_PADRAO): string[] {
  const L: string[] = [];
  for (const q of model.quadros ?? []) {
    const r = preDimensionarQuadroCompleto(model, q.id, hip);
    if (!r) continue;
    const filhos = r.filhos.map((f) => f.nome);
    L.push(`${q.nome} — ${r.tipo}${r.unidade ? ` · un. ${r.unidade}` : ''} · ${r.ligacao}${r.tensaoV ? ` ${r.tensaoV} V` : ''} · ${r.paiNome ? `de ${r.paiNome}` : 'entrada'}${filhos.length ? ` · alimenta ${filhos.join(', ')}` : ''}`);
  }
  for (const p of prumadasEletricas(model)) L.push(`${p.nome} — prumada de eletroduto Ø${[...new Set(p.segmentos.map((s) => s.bitolaMm))].join('/')} (${p.segmentos.length} pavimento(s))`);
  return L;
}

/** Há o que desenhar: mais de um pavimento com quadro, algum quadro alimentado por outro, ou uma prumada. */
export function temEsquemaVerticalEletrico(model: BlueprintModel): boolean {
  const quadros = model.quadros ?? [];
  if (quadros.length === 0) return false;
  if (quadros.some((q) => q.quadroPaiId)) return true;
  if (new Set(quadros.map((q) => q.levelId)).size > 1) return true;
  return prumadasEletricas(model).length > 0;
}
