/**
 * A REDE DE HIDRANTES AUTOMÁTICA (30/09/2026, E3.1 do roadmap de incêndio).
 *
 * Bomba → geral → colunas de incêndio → ramais → hidrantes, como o projetista
 * faz num edifício: os hidrantes empilhados (o abrigo junto à escada, andar a
 * andar) viram UMA coluna que atravessa as lajes; em cada pavimento um ramal no
 * forro sai da coluna e desce até a válvula. Tudo nasce SUGERIDO, num lote só,
 * e Ctrl+Z desfaz — o molde de `planejarAgua`.
 *
 *  - COLUNA: hidrantes a menos de `raioDaColunaMm` em planta formam um grupo
 *    (união por proximidade); a coluna fica a 30 cm do grupo em x, para não
 *    sobrepor a descida do ramal. Ela sobe da cota do ramal no pavimento da
 *    bomba até a cota do ramal no último pavimento com hidrante, partida em cada
 *    cota onde algo encosta (o kernel liga trecho a trecho pelas PONTAS).
 *  - GERAL: da bomba sobe à cota do ramal e corre em L até as colunas — um
 *    tronco em y = y da bomba, PARTIDO em cada x de coluna, e um braço por x.
 *  - Relançar: os trechos sugeridos de incêndio do lançamento anterior são
 *    apagados no mesmo lote; hidrante que já chega à bomba por tubo CONFIRMADO
 *    não é religado.
 *
 * O registro de recalque não é posto aqui: ele vai no PASSEIO, e o limite do
 * lote é outra fonte. A conferência cobra que ele exista e esteja na rede.
 */
import { applyBatch, type BlueprintModel, type Command, type ObjectId, type Terminal } from './blueprintKernel';
import { redeDeIncendio } from './blueprintCalculoIncendio';

export interface HipotesesDaRedeDeHidrantes {
  /** Cota do ramal no forro, mm do piso. */
  cotaDoRamalMm: number;
  /** Raio em planta que junta hidrantes numa mesma coluna. */
  raioDaColunaMm: number;
  /** DN de partida da rede (o ajuste pela velocidade vem do cálculo). */
  dnMm: number;
}

export const HIPOTESES_REDE_DE_HIDRANTES_PADRAO: HipotesesDaRedeDeHidrantes = { cotaDoRamalMm: 2600, raioDaColunaMm: 2000, dnMm: 65 };

export function hipotesesDaRedeDaColuna(raw: unknown): HipotesesDaRedeDeHidrantes {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const p = HIPOTESES_REDE_DE_HIDRANTES_PADRAO;
  const num = (x: unknown, padrao: number) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.round(x) : padrao);
  return { cotaDoRamalMm: num(r.cotaDoRamalMm, p.cotaDoRamalMm), raioDaColunaMm: num(r.raioDaColunaMm, p.raioDaColunaMm), dnMm: num(r.dnMm, p.dnMm) };
}

export interface ColunaDoPlano {
  x: number;
  y: number;
  hidranteIds: ObjectId[];
  /** Do pavimento da fonte ao hidrante mais longe dela (para cima ou para baixo). */
  pavimentos: number;
}

export interface PlanoDaRedeDeHidrantes {
  motivo: string | null;
  colunas: ColunaDoPlano[];
  /** Hidrantes que o plano liga, e os que já chegavam à bomba por tubo confirmado. */
  aLigar: ObjectId[];
  jaLigados: ObjectId[];
  /** Trechos sugeridos do lançamento anterior, apagados no mesmo lote. */
  apagados: number;
  comandos: Command[];
  metros: number;
}

const COMBATE = new Set(['HIDRANTE_SIMPLES', 'HIDRANTE_DUPLO', 'MANGOTINHO']);
const DESVIO_DA_COLUNA_MM = 300;

export function planejarRedeDeHidrantes(model: BlueprintModel, hip: HipotesesDaRedeDeHidrantes = HIPOTESES_REDE_DE_HIDRANTES_PADRAO): PlanoDaRedeDeHidrantes {
  const vazio = (motivo: string): PlanoDaRedeDeHidrantes => ({ motivo, colunas: [], aLigar: [], jaLigados: [], apagados: 0, comandos: [], metros: 0 });
  const sugeridos = (model.trechos ?? []).filter((t) => t.disciplina === 'INCENDIO' && t.sugerido);
  const semSugeridos: BlueprintModel = { ...model, trechos: (model.trechos ?? []).filter((t) => !(t.disciplina === 'INCENDIO' && t.sugerido)) };
  // A fonte: a bomba, senão a caixa só de incêndio (E3.2, gravidade — a coluna DESCE dela).
  const bomba =
    (model.terminais ?? []).find((t) => t.disciplina === 'INCENDIO' && t.tipoHidraulico === 'BOMBA_INCENDIO') ??
    (model.terminais ?? []).find((t) => t.disciplina === 'INCENDIO' && t.tipoHidraulico === 'RESERVATORIO') ??
    // Fase B (D-3): a caixa de água fria com parcela de incêndio, por gravidade.
    (model.terminais ?? []).find((t) => t.disciplina === 'AGUA_FRIA' && t.tipoHidraulico === 'RESERVATORIO' && (t.volumeRtiL ?? 0) > 0);
  if (!bomba) return vazio('lance a bomba de incêndio (ou a caixa de incêndio) primeiro — a rede parte dela');
  const hidrantes = (model.terminais ?? []).filter((t) => t.disciplina === 'INCENDIO' && t.tipoHidraulico && COMBATE.has(t.tipoHidraulico));
  if (hidrantes.length === 0) return vazio('nenhum hidrante ou mangotinho no desenho');

  // Quem já chega à bomba pela rede CONFIRMADA não é religado.
  const confirmada = redeDeIncendio(semSugeridos);
  const daBomba = new Set<string>();
  if (confirmada.noDaFonte) {
    const adj = new Map<string, string[]>();
    for (const x of confirmada.tubos) {
      adj.set(x.de, [...(adj.get(x.de) ?? []), x.para]);
      adj.set(x.para, [...(adj.get(x.para) ?? []), x.de]);
    }
    const fila = [confirmada.noDaFonte];
    daBomba.add(confirmada.noDaFonte);
    while (fila.length) for (const v of adj.get(fila.pop()!) ?? []) if (!daBomba.has(v)) (daBomba.add(v), fila.push(v));
  }
  const jaLigados = hidrantes.filter((h) => daBomba.has(confirmada.noDoTerminal.get(h.id) ?? '')).map((h) => h.id);
  const aLigar = hidrantes.filter((h) => !jaLigados.includes(h.id));
  const apagar: Command[] = sugeridos.map((t) => ({ type: 'DeleteTrecho', trechoId: t.id }) as Command);
  if (aLigar.length === 0) return { motivo: null, colunas: [], aLigar: [], jaLigados, apagados: sugeridos.length, comandos: apagar, metros: 0 };

  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm || a.id.localeCompare(b.id));
  const idx = new Map(niveis.map((l, i) => [l.id, i]));
  const i0 = idx.get(bomba.levelId)!;

  // Grupos por proximidade em planta (união-busca).
  const pai = aLigar.map((_, i) => i);
  const raiz = (i: number): number => (pai[i] === i ? i : (pai[i] = raiz(pai[i])));
  for (let i = 0; i < aLigar.length; i++)
    for (let j = i + 1; j < aLigar.length; j++)
      if (Math.hypot(aLigar[i].at.x - aLigar[j].at.x, aLigar[i].at.y - aLigar[j].at.y) <= hip.raioDaColunaMm) pai[raiz(i)] = raiz(j);
  const grupos = new Map<number, Terminal[]>();
  aLigar.forEach((h, i) => grupos.set(raiz(i), [...(grupos.get(raiz(i)) ?? []), h]));

  const cr = hip.cotaDoRamalMm;
  const dn = hip.dnMm;
  const novos: Command[] = [];
  let metros = 0;
  const add = (levelId: ObjectId, ax: number, ay: number, ca: number, bx: number, by: number, cb: number) => {
    if (ax === bx && ay === by && ca === cb) return;
    novos.push({ type: 'AddTrecho', levelId, disciplina: 'INCENDIO', a: { x: ax, y: ay }, b: { x: bx, y: by }, cotaAMm: ca, cotaBMm: cb, bitolaMm: dn, sugerido: true } as Command);
    metros += Math.hypot(bx - ax, by - ay, cb - ca) / 1000;
  };

  const colunas: ColunaDoPlano[] = [];
  for (const membros of [...grupos.values()].sort((a, b) => a[0].id.localeCompare(b[0].id))) {
    const cx = Math.round(membros.reduce((s, h) => s + h.at.x, 0) / membros.length) + DESVIO_DA_COLUNA_MM;
    const cy = Math.round(membros.reduce((s, h) => s + h.at.y, 0) / membros.length);
    // A coluna vai do pavimento da fonte ao hidrante mais longe dela — para cima (bomba)
    // ou para baixo (caixa no alto) —, partida nas cotas onde algo encosta.
    const niveisDoGrupo = membros.map((h) => idx.get(h.levelId)!);
    const baixo = Math.min(i0, ...niveisDoGrupo);
    const topo = Math.max(i0, ...niveisDoGrupo);
    for (let k = baixo; k <= topo; k++) {
      const nivel = niveis[k];
      const cotas = new Set<number>([cr]);
      if (k > baixo) cotas.add(0);
      if (k < topo) cotas.add(nivel.defaultHeightMm);
      const ordenadas = [...cotas].sort((a, b) => a - b).filter((c) => (k === baixo ? c >= cr : true) && (k === topo ? c <= cr : true));
      for (let q = 0; q + 1 < ordenadas.length; q++) add(nivel.id, cx, cy, ordenadas[q], cx, cy, ordenadas[q + 1]);
    }
    // Os ramais: da coluna, no forro, até sobre o hidrante; e a descida até a válvula.
    for (const h of membros) {
      add(h.levelId, cx, cy, cr, h.at.x, h.at.y, cr);
      add(h.levelId, h.at.x, h.at.y, cr, h.at.x, h.at.y, h.cotaMm);
    }
    colunas.push({ x: cx, y: cy, hidranteIds: membros.map((h) => h.id), pavimentos: topo - baixo + 1 });
  }

  // O geral: sobe da bomba e corre em y = y da bomba, partido em cada x; um braço por x.
  const nivelDaBomba = niveis[i0].id;
  const bx = bomba.at.x;
  const by = bomba.at.y;
  add(nivelDaBomba, bx, by, bomba.cotaMm, bx, by, cr);
  const xs = [...new Set([bx, ...colunas.map((c) => c.x)])].sort((a, b) => a - b);
  for (let q = 0; q + 1 < xs.length; q++) add(nivelDaBomba, xs[q], by, cr, xs[q + 1], by, cr);
  for (const x of new Set(colunas.map((c) => c.x))) {
    const ys = [...new Set([by, ...colunas.filter((c) => c.x === x).map((c) => c.y)])].sort((a, b) => a - b);
    for (let q = 0; q + 1 < ys.length; q++) add(nivelDaBomba, x, ys[q], cr, x, ys[q + 1], cr);
  }

  return { motivo: null, colunas, aLigar: aLigar.map((h) => h.id), jaLigados, apagados: sugeridos.length, comandos: [...apagar, ...novos], metros };
}

/** Prova o plano: aplicado numa cópia, todo hidrante a ligar chega à bomba. */
export function conferirPlanoDaRede(model: BlueprintModel, plano: PlanoDaRedeDeHidrantes): { ok: true } | { ok: false; motivo: string } {
  if (plano.comandos.length === 0) return { ok: true };
  let depois: BlueprintModel;
  try {
    depois = applyBatch(model, plano.comandos).model;
  } catch (e) {
    return { ok: false, motivo: `o kernel recusou o lote: ${(e as Error).message}` };
  }
  const rede = redeDeIncendio(depois);
  if (!rede.noDaFonte) return { ok: false, motivo: 'a bomba não ficou ligada à rede' };
  const adj = new Map<string, string[]>();
  for (const x of rede.tubos) {
    adj.set(x.de, [...(adj.get(x.de) ?? []), x.para]);
    adj.set(x.para, [...(adj.get(x.para) ?? []), x.de]);
  }
  const vistos = new Set([rede.noDaFonte]);
  const fila = [rede.noDaFonte];
  while (fila.length) for (const v of adj.get(fila.pop()!) ?? []) if (!vistos.has(v)) (vistos.add(v), fila.push(v));
  const soltos = plano.aLigar.filter((id) => !vistos.has(rede.noDoTerminal.get(id) ?? ''));
  return soltos.length ? { ok: false, motivo: `${soltos.length} hidrante(s) não chegaram à bomba` } : { ok: true };
}
