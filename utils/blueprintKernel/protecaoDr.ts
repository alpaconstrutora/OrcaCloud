/**
 * PROTEÇÃO DR — o que o quadro tem, DERIVADO do declarado (E3.1, 29/09/2026).
 *
 * Duas fontes, uma leitura: os DRs declarados como PEÇA (`Quadro.drs`) e o
 * legado `Circuito.protecaoDR: true`, que continua valendo como um DR
 * individual de 30 mA sem corrente nominal — todo desenho anterior lê igual.
 * Quando um DR declarado já cobre o circuito, a marca legada não gera peça
 * duplicada. Nada aqui grava: é índice, refeito a cada leitura.
 */
import type { BlueprintModel, Circuito, DispositivoDPS, DispositivoDR, ObjectId } from './model';

export interface DRDoQuadro extends DispositivoDR {
  quadroId: ObjectId;
  /** Veio de `Circuito.protecaoDR` (sem In, sem polos) — declarar a peça substitui. */
  legado: boolean;
}

export const PREFIXO_DO_DR_LEGADO = 'legado:';

/** "40 A / 30 mA", "30 mA" (sem In), "40 A / 30 mA · 4P". */
export function rotuloDoDR(d: Pick<DispositivoDR, 'inA' | 'idnMa' | 'polos'>): string {
  const partes = [d.inA != null ? `${String(d.inA).replace('.', ',')} A / ${d.idnMa} mA` : `${d.idnMa} mA`];
  if (d.polos) partes.push(`${d.polos}P`);
  return partes.join(' · ');
}

/** Os DRs de um quadro: declarados + um legado por circuito marcado que nenhum declarado cobre. */
export function drsDoQuadro(model: BlueprintModel, quadroId: ObjectId): DRDoQuadro[] {
  const q = (model.quadros ?? []).find((x) => x.id === quadroId);
  if (!q) return [];
  const declarados: DRDoQuadro[] = (q.drs ?? []).map((d) => ({ ...d, circuitoIds: [...d.circuitoIds], quadroId, legado: false }));
  const temGeral = declarados.some((d) => d.geral);
  const cobertos = new Set(declarados.flatMap((d) => d.circuitoIds));
  const legados: DRDoQuadro[] = (model.circuitos ?? [])
    .filter((c) => c.quadroId === quadroId && c.protecaoDR === true && !temGeral && !cobertos.has(c.id))
    .map((c) => ({ id: `${PREFIXO_DO_DR_LEGADO}${c.id}`, quadroId, inA: null, idnMa: 30, polos: null, geral: false, circuitoIds: [c.id], legado: true }));
  return [...declarados, ...legados];
}

/** Todos os DRs do desenho. */
export function drsDoModelo(model: BlueprintModel): DRDoQuadro[] {
  return (model.quadros ?? []).flatMap((q) => drsDoQuadro(model, q.id));
}

/**
 * O DR que protege um circuito: o individual/de grupo que o cita; senão o
 * geral do quadro; senão nenhum. O mais específico primeiro, porque é ele que
 * o unifilar desenha no ramal.
 */
export function drDoCircuito(model: BlueprintModel, circuito: Pick<Circuito, 'id' | 'quadroId'>): DRDoQuadro | null {
  const drs = drsDoQuadro(model, circuito.quadroId);
  return drs.find((d) => !d.geral && d.circuitoIds.includes(circuito.id)) ?? drs.find((d) => d.geral) ?? null;
}

/** Protegido por DR de alta sensibilidade (≤ 30 mA) — o que a 5.1.3.2.2 pede. */
export function circuitoComDR30(model: BlueprintModel, circuito: Pick<Circuito, 'id' | 'quadroId'>): boolean {
  const d = drDoCircuito(model, circuito);
  return d != null && d.idnMa <= 30;
}

/** "DPS classe II · 20 kA · Up 1,5 kV · desconexão 20 A" — só o que foi declarado. */
export function rotuloDoDPS(d: DispositivoDPS): string {
  const f = (v: number) => String(v).replace('.', ',');
  const partes = [`DPS classe ${d.classe}`];
  if (d.inKa != null) partes.push(`${f(d.inKa)} kA`);
  if (d.upKv != null) partes.push(`Up ${f(d.upKv)} kV`);
  if (d.disjuntorDesconexaoA != null) partes.push(`desconexão ${f(d.disjuntorDesconexaoA)} A`);
  return partes.join(' · ');
}
