// services/blueprintCasasDoLoteamentoService.ts
//
// CASAS DO LOTEAMENTO (26/10/2026, etapa 2 de docs/planos/2026-10-26-planta-empreendimento-tres-etapas.md): grava a
// PLANTA de cada lote — um estudo novo com o modelo da casa já lançada, a zona do loteamento e as premissas da casa
// (o programa do lote e o lote de origem). Falhou no meio: o estudo daquele lote é arquivado (nada pela metade).
//
// O platô de terraplenagem NÃO vai: a planta nova não tem a topografia do loteamento — abra a planta da casa para
// definir a terraplenagem (dito na tela).

import { supabase } from '../lib/supabase';
import { archiveStudy, createStudy, saveDraft } from './blueprintService';
import { blueprintCasaService } from './blueprintCasaService';
import { blueprintUrbanContextService, type UrbanContextInput } from './blueprintUrbanContextService';
import type { BlueprintModel } from '../utils/blueprintKernel';
import { premissasDaCasaDaColuna, type PremissasDaCasa } from '../utils/blueprintPremissasDaCasa';

export interface PlantaDaCasaDoLote {
  /** O estudo do loteamento. */
  loteamento: { studyId: string; organizationId: string; projectId: string | null; nome: string };
  loteUid: string;
  /** "Quadra A · Lote 12". */
  rotulo: string;
  /** O modelo com a casa (o `resultado` do plano). */
  modelo: BlueprintModel;
  premissas: PremissasDaCasa;
}

/** O nome da planta da casa de um lote. */
export const nomeDaPlantaDoLote = (loteamento: string, rotulo: string) => `${loteamento} · ${rotulo} — Casa`;

export async function criarPlantaDaCasaDoLote(p: PlantaDaCasaDoLote): Promise<{ studyId: string; nome: string }> {
  const nome = nomeDaPlantaDoLote(p.loteamento.nome, p.rotulo);
  const { study, branch } = await createStudy({ organizationId: p.loteamento.organizationId, name: nome, projectId: p.loteamento.projectId ?? undefined });
  try {
    await saveDraft(branch.id, p.modelo);
    // A zona do loteamento vale para o lote (mesmo lugar): copiada linha a linha, sem os ids.
    const ctx = await blueprintUrbanContextService.get(p.loteamento.studyId);
    if (ctx) {
      const { id: _id, study_id: _s, organization_id: _o, created_at: _c, updated_at: _u, ...resto } = ctx as typeof ctx & Record<string, unknown>;
      await blueprintUrbanContextService.save(study.id, p.loteamento.organizationId, resto as UrbanContextInput);
    }
    await blueprintCasaService.save(study.id, p.loteamento.organizationId, { ...p.premissas, loteDeOrigem: { estudoId: p.loteamento.studyId, loteUid: p.loteUid } });
  } catch (e) {
    await archiveStudy(study.id).catch(() => {});
    throw e;
  }
  return { studyId: study.id, nome };
}

/**
 * As plantas de casa que já existem para os lotes de um loteamento: `uid do lote → { estudo, nome }`. Só estudos
 * vivos (arquivado não conta). Pela premissa `loteDeOrigem` — nunca pelo nome, que a pessoa pode trocar.
 */
export async function plantasDosLotes(loteamentoStudyId: string): Promise<Map<string, { studyId: string; nome: string }>> {
  const { data, error } = await supabase.from('blueprint_study_casa').select('study_id, hipoteses').eq('hipoteses->loteDeOrigem->>estudoId', loteamentoStudyId);
  if (error) throw new Error(`casasDoLoteamento/plantas: ${error.message}`);
  const linhas = (data ?? []) as { study_id: string; hipoteses: unknown }[];
  if (linhas.length === 0) return new Map();
  const { data: estudos, error: e2 } = await supabase.from('blueprint_studies').select('id, name, status').in('id', linhas.map((l) => l.study_id)).neq('status', 'ARQUIVADO');
  if (e2) throw new Error(`casasDoLoteamento/estudos: ${e2.message}`);
  const vivos = new Map(((estudos ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  const out = new Map<string, { studyId: string; nome: string }>();
  for (const l of linhas) {
    const origem = premissasDaCasaDaColuna(l.hipoteses).loteDeOrigem;
    const nome = vivos.get(l.study_id);
    if (origem && nome) out.set(origem.loteUid, { studyId: l.study_id, nome });
  }
  return out;
}
