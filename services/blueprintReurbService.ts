// services/blueprintReurbService.ts
//
// REURB (A5): os OCUPANTES de cada lote, lidos do Empreendimento ligado ao
// estudo (B3: `empreendimentos.blueprint_study_id`; lote ↔ unidade por
// `empreendimento_units.blueprint_lote_uid`) e das ocupações vigentes da
// unidade (`unit_occupancies` → `clients`). Só leitura: o cadastro e a
// importação da base de ocupantes (planilha) são do Empreendimento.

import { supabase } from '../lib/supabase';
import { empreendimentoService } from './empreendimentoService';
import { unitOccupancyService } from './unitOccupancyService';
import type { OcupanteDoLote } from '../utils/blueprintReurb';

export interface OcupantesDoEstudo {
  empreendimento: { id: string; nome: string } | null;
  /** Lotes que viraram unidade no Empreendimento. */
  lotesComUnidade: number;
  porLoteUid: Record<string, OcupanteDoLote[]>;
}

export const blueprintReurbService = {
  async ocupantesDoEstudo(studyId: string): Promise<OcupantesDoEstudo> {
    const { data, error } = await supabase.from('empreendimentos').select('id, name').eq('blueprint_study_id', studyId).limit(1);
    if (error) throw new Error(`blueprintReurb/empreendimento: ${error.message}`);
    const emp = data?.[0];
    if (!emp) return { empreendimento: null, lotesComUnidade: 0, porLoteUid: {} };
    const unidades = (await empreendimentoService.listAllUnitsForEmpreendimento(emp.id)).filter((u) => u.blueprint_lote_uid);
    const rotulos = Object.fromEntries(unidades.map((u) => [u.id, { unitName: u.name, towerName: u._tower_name }]));
    const ocupacoes = await unitOccupancyService.listByEmpreendimento(
      unidades.map((u) => u.id),
      rotulos,
    );
    const loteDaUnidade = new Map(unidades.map((u) => [u.id, u.blueprint_lote_uid as string]));
    const porLoteUid: Record<string, OcupanteDoLote[]> = {};
    for (const o of ocupacoes) {
      const uid = loteDaUnidade.get(o.unit_id);
      if (!uid) continue;
      (porLoteUid[uid] ??= []).push({ nome: o._client_name, documento: o._client_document ?? null, papel: o.role });
    }
    return { empreendimento: { id: emp.id, nome: emp.name }, lotesComUnidade: unidades.length, porLoteUid };
  },
};

/** Vários textos num .zip (os memoriais, um por lote). `pizzip` por import dinâmico. */
export async function zipDeTextos(arquivos: { nome: string; texto: string }[]): Promise<Uint8Array> {
  const PizZip = (await import('pizzip')).default;
  const zip = new PizZip();
  for (const a of arquivos) zip.file(a.nome, a.texto);
  return zip.generate({ type: 'uint8array', compression: 'DEFLATE' });
}
