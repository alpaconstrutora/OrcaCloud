// utils/blueprintCasasDoLoteamento.ts
//
// CASAS DO LOTEAMENTO (26/10/2026, etapa 2 de docs/planos/2026-10-26-planta-empreendimento-tres-etapas.md): cada lote
// vira o modelo de uma PLANTA PRÓPRIA (decisão do usuário: "uma planta por lote") — um pavimento com as divisas do
// lote — onde a Casa automática roda como numa planta comum. Puro: a tela e o serviço só repassam.
//
// - As coordenadas são as do loteamento (o kernel já as limita a ±1 km): a georreferência vai junto, igual, e a
//   topografia do loteamento continua valendo no mesmo lugar.
// - Os papéis dos lados são os que o loteamento mede (`medirLote`: a FRENTE é o lado que encosta numa via). Lote de
//   esquina fica com as duas frentes — a casa se implanta pela mais longa, as regras somam as duas como testada.
// - Programa: o comum (o da tela Casa automática), com dormitórios, suítes, banheiros e vagas da unidade do lote
//   quando cadastrados. A área da unidade é IGNORADA: no loteamento ela é a área do LOTE (decisão do usuário).

import { applyBatch, applyCommand, emptyModel, type BlueprintModel, type BoundaryPapel, type Command, type Lote, type ObjectId } from './blueprintKernel';
import { medirLote, rotuloDoLote, type PapelDoLado } from './blueprintLoteamento';
import { comandosDoLote, type LoteFechado } from './blueprintLoteDigitado';
import type { ProgramaCurtoDaCasa } from './blueprintPrograma';
import type { EmpreendimentoUnit } from '../types/empreendimento';

export type UnidadeDoLote = Pick<EmpreendimentoUnit, 'id' | 'name'> &
  Partial<Pick<EmpreendimentoUnit, 'blueprint_lote_uid' | 'bedrooms' | 'suites' | 'bathrooms' | 'parking_spaces' | 'private_area'>> & {
    bedrooms?: number | null;
    suites?: number | null;
    bathrooms?: number | null;
    parking_spaces?: number | null;
  };

export interface LoteParaCasa {
  loteId: ObjectId;
  loteUid: string;
  rotulo: string;
  areaM2: number;
  /** Pode virar casa; senão o `motivo` diz por quê. */
  elegivel: boolean;
  motivo: string | null;
  /** A unidade do Empreendimento ligada a este lote (`blueprint_lote_uid`). */
  unidade: UnidadeDoLote | null;
}

const PAPEL: Record<PapelDoLado, BoundaryPapel> = { FRENTE: 'FRENTE', FUNDO: 'FUNDOS', LATERAL_DIREITA: 'LATERAL_DIREITA', LATERAL_ESQUERDA: 'LATERAL_ESQUERDA' };

export function lotesParaCasas(model: BlueprintModel, unidades: UnidadeDoLote[]): LoteParaCasa[] {
  const porUid = new Map(unidades.filter((u) => u.blueprint_lote_uid).map((u) => [u.blueprint_lote_uid as string, u]));
  return (model.lotes ?? []).map((lote) => {
    const m = medirLote(model, lote);
    const motivo =
      lote.tipo === 'REMANESCENTE'
        ? 'Lote remanescente — não é lote de casa.'
        : lote.tipo === 'ENCRAVADO'
          ? 'Lote encravado — sem frente para via.'
          : null;
    return {
      loteId: lote.id,
      loteUid: lote.uid,
      rotulo: rotuloDoLote(model, lote),
      areaM2: Math.round(m.areaMm2 / 1e4) / 100,
      elegivel: motivo === null,
      motivo,
      unidade: porUid.get(lote.uid) ?? null,
    };
  });
}

/** O lote como `LoteFechado` (anel do lote, papéis do loteamento) — a entrada de `comandosDoLote`. */
export function loteFechadoDoLote(model: BlueprintModel, lote: Lote): LoteFechado {
  const m = medirLote(model, lote);
  const papelDe = new Map(m.lados.map((l) => [l.indice, PAPEL[l.papel]]));
  return {
    anel: lote.pontos.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
    lados: lote.pontos.map((_, i) => ({ papel: papelDe.get(i) ?? null, medidaMm: null, confrontante: m.lados.find((l) => l.indice === i)?.confrontante ?? null })),
    vertices: lote.pontos.map(() => null),
    areaMm2: m.areaMm2,
    perimetroMm: m.perimetroMm,
    erroDeFechamentoMm: 0,
    compensacao: 'NENHUMA',
    problema: lote.pontos.length < 3 ? 'O lote precisa de pelo menos três vértices.' : null,
    descricao: '',
  };
}

/**
 * O MODELO da planta do lote: um pavimento (a altura do pavimento do loteamento) com as divisas do lote e a
 * georreferência do loteamento. Nada do loteamento vai junto (quadras, outros lotes, vias).
 */
export function modeloDoLote(model: BlueprintModel, lote: Lote): { model: BlueprintModel; levelId: ObjectId } | { problema: string } {
  const nivel = model.levels.find((l) => l.id === lote.levelId);
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: nivel?.name || 'Térreo', elevationMm: 0, defaultHeightMm: nivel?.defaultHeightMm ?? 2800 }).model;
  const levelId = m.levels[0].id;
  try {
    const comandos: Command[] = comandosDoLote(m, levelId, loteFechadoDoLote(model, lote), {});
    if (model.georreferencia) comandos.push({ type: 'SetGeorreferencia', georreferencia: model.georreferencia });
    m = applyBatch(m, comandos).model;
  } catch (e) {
    return { problema: `${rotuloDoLote(model, lote)}: ${e instanceof Error ? e.message : String(e)}` };
  }
  return { model: m, levelId };
}

/** O programa da casa do lote: o comum, com o que a unidade tiver de dormitórios/suítes/banheiros/vagas. */
export function programaDoLote(comum: ProgramaCurtoDaCasa, unidade: UnidadeDoLote | null): { curto: ProgramaCurtoDaCasa; avisos: string[] } {
  if (!unidade) return { curto: comum, avisos: [] };
  const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
  const curto: ProgramaCurtoDaCasa = {
    ...comum,
    ...(num(unidade.bedrooms) != null && num(unidade.bedrooms)! >= 1 ? { dormitorios: num(unidade.bedrooms)! } : {}),
    ...(num(unidade.suites) != null ? { suites: num(unidade.suites)! } : {}),
    ...(num(unidade.bathrooms) != null && num(unidade.bathrooms)! >= 1 ? { banheiros: num(unidade.bathrooms)! } : {}),
    ...(num(unidade.parking_spaces) != null ? { vagas: num(unidade.parking_spaces)! } : {}),
  };
  const avisos = unidade.private_area ? [`${unidade.name}: a área da unidade (${unidade.private_area} m²) é a do lote — ignorada no programa da casa.`] : [];
  return { curto, avisos };
}
