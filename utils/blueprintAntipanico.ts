/**
 * F5 (plano `2026-10-01-incendio-backlog-pos-roadmap.md`) — A BARRA ANTIPÂNICO.
 *
 * A porta de abrir por onde passa a ROTA DE FUGA (o percurso da E6.3) pede a
 * barra antipânico quando a ocupação reúne público (grupo F) ou quando o
 * pavimento dela tem população a partir de `POPULACAO_QUE_PEDE_ANTIPANICO` —
 * regra e número CONFERIR NA IT de saídas do CBMMG / NBR 11785.
 *
 * A marca é a que o kernel já tem desde a 0.84.0 (`Opening.emergencia`,
 * `ANTIPANICO`); a proposta só a acrescenta (`SetOpeningEmergencia`), mantendo
 * as outras marcas da porta. Porta de correr na rota não leva barra — fica de
 * fora (ela nem deveria ser saída de emergência; a análise de saídas diz).
 */
import type { BlueprintModel, Command, MarcaDeEmergencia, ObjectId } from './blueprintKernel';
import { MARCAS_DE_EMERGENCIA } from './blueprintKernel';
import type { PercursoDeFuga } from './blueprintRotaDeFuga';
import type { AnaliseDeSaidas } from './blueprintSaidasIncendio';

/** A partir de quantas pessoas no pavimento a porta da rota pede antipânico — CONFERIR NA IT. */
export const POPULACAO_QUE_PEDE_ANTIPANICO = 50;
/** Grupos em que toda porta da rota pede antipânico (reunião de público) — CONFERIR NA IT. */
const GRUPOS_QUE_PEDEM = new Set(['F']);

export interface PortaDaRota {
  openingId: ObjectId;
  levelId: ObjectId;
  /** Exigida pela regra? E por quê. */
  exigida: boolean;
  motivo: string;
  tem: boolean;
}

/** O centro do vão no eixo da parede, ao mm — o mesmo ponto que o grafo da rota usa como portal. */
function centroDoVao(model: BlueprintModel, openingId: ObjectId): { levelId: ObjectId; x: number; y: number } | null {
  const o = model.openings.find((x) => x.id === openingId);
  const w = o ? model.walls.find((x) => x.id === o.wallId) : null;
  if (!o || !w) return null;
  const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
  const s = o.offsetMm + o.widthMm / 2;
  return { levelId: w.levelId, x: Math.round(w.a.x + ((w.b.x - w.a.x) / L) * s), y: Math.round(w.a.y + ((w.b.y - w.a.y) / L) * s) };
}

/** As portas de abrir por onde a rota de fuga passa, e se cada uma pede (e tem) a barra. */
export function analisarAntipanico(model: BlueprintModel, percurso: PercursoDeFuga | null, saidas: AnaliseDeSaidas): PortaDaRota[] {
  if (!percurso) return [];
  const grupo = saidas.grupo;
  const pessoas = new Map(saidas.populacao.map((p) => [p.levelId, p.pessoas]));
  const portas: PortaDaRota[] = [];
  for (const o of model.openings) {
    if (o.kind !== 'door') continue;
    const c = centroDoVao(model, o.id);
    if (!c) continue;
    const naRota = percurso.ambientes.some((a) => a.rota.some((r) => r.levelId === c.levelId && r.pontos.some((p) => Math.abs(p.x - c.x) <= 2 && Math.abs(p.y - c.y) <= 2)));
    if (!naRota) continue;
    const n = pessoas.get(c.levelId) ?? 0;
    const porGrupo = !!grupo && GRUPOS_QUE_PEDEM.has(grupo);
    const exigida = porGrupo || n >= POPULACAO_QUE_PEDE_ANTIPANICO;
    const motivo = porGrupo ? `grupo ${grupo} (reunião de público) — CONFERIR NA IT` : `${n} pessoa(s) no pavimento ${exigida ? '≥' : '<'} ${POPULACAO_QUE_PEDE_ANTIPANICO} — CONFERIR NA IT`;
    portas.push({ openingId: o.id, levelId: c.levelId, exigida, motivo, tem: (o.emergencia ?? []).includes('ANTIPANICO') });
  }
  return portas;
}

/** A proposta: a marca ANTIPANICO em cada porta exigida que não tem (as outras marcas ficam). */
export function proporAntipanico(model: BlueprintModel, portas: readonly PortaDaRota[]): Command[] {
  return portas
    .filter((p) => p.exigida && !p.tem)
    .map((p) => {
      const atuais = model.openings.find((o) => o.id === p.openingId)?.emergencia ?? [];
      const marcas = MARCAS_DE_EMERGENCIA.filter((m) => m === 'ANTIPANICO' || atuais.includes(m)) as MarcaDeEmergencia[];
      return { type: 'SetOpeningEmergencia', openingId: p.openingId, marcas } as Command;
    });
}
