// services/blueprintTerrenoDaPlanta.ts
//
// Empreendimento › Torres & Unidades › Terreno: os números do lote da PLANTA VINCULADA
// (`empreendimentos.blueprint_study_id`) para mostrar ao lado da ficha. Pedido de 21/10/2026 —
// plano docs/planos/2026-10-21-terreno-ficha-planta.md.
//
// Lê o RASCUNHO do ramo principal (o desenho como está agora): é o mesmo que a Planta mostra em
// Dados do lote e o mesmo que "Levar à ficha" grava — os dois lados comparam o mesmo número. As
// contas são as de `utils/blueprintTerrenoDaFicha.ts` (desenhado; profundidade = média das laterais).

import { supabase } from '../lib/supabase';
import { listBranches, loadBranchModel, ramoPrincipal } from './blueprintService';
import { divisasDoLote, medirTerreno } from '../utils/blueprintTerreno';
import { medidasDaPlantaParaFicha, type MedidasDaPlanta } from '../utils/blueprintTerrenoDaFicha';
import type { Boundary } from '../utils/blueprintKernel';
import type { Empreendimento } from '../types/empreendimento';

export type TerrenoDaPlanta =
  | { ok: true; plantaNome: string; medidas: MedidasDaPlanta }
  | { ok: false; motivo: string };

/** As divisas do lote do primeiro pavimento que tem lote — o editor mede por pavimento. */
function divisasDoPrimeiroPavimentoComLote(boundaries: Boundary[], niveis: { id: string }[]): Boundary[] {
  const doLote = divisasDoLote(boundaries);
  for (const n of niveis) {
    const doNivel = doLote.filter((b) => b.levelId === n.id);
    if (doNivel.length > 0) return doNivel;
  }
  return doLote;
}

export async function terrenoDaPlantaVinculada(
  empreendimento: Pick<Empreendimento, 'id' | 'organization_id' | 'blueprint_study_id'>,
): Promise<TerrenoDaPlanta> {
  const studyId = empreendimento.blueprint_study_id;
  if (!studyId) return { ok: false, motivo: 'Este empreendimento não está vinculado a uma planta (Incorporação › Planta Inteligente › Editar).' };

  const { data: study, error } = await supabase
    .from('blueprint_studies')
    .select('id, name, organization_id, status')
    .eq('id', studyId)
    .maybeSingle();
  if (error) throw new Error(`blueprintTerrenoDaPlanta: ${error.message}`);
  if (!study) return { ok: false, motivo: 'A planta vinculada não foi encontrada (ou é de uma organização que você não vê).' };
  const s = study as { name: string; organization_id: string; status: string };
  // Blindagem multi-tenant, como nas outras arestas Planta ↔ Empreendimento (massaAdapter).
  if (s.organization_id !== empreendimento.organization_id) return { ok: false, motivo: 'A planta vinculada é de outra organização.' };
  if (s.status === 'ARQUIVADO') return { ok: false, motivo: `A planta vinculada (${s.name}) está arquivada.` };

  const principal = ramoPrincipal(await listBranches(studyId));
  const model = principal ? await loadBranchModel(principal.id) : null;
  if (!model) return { ok: false, motivo: `A planta ${s.name} ainda não tem desenho.` };

  const limites = divisasDoPrimeiroPavimentoComLote(model.boundaries ?? [], model.levels ?? []);
  const terreno = medirTerreno(limites);
  if (!terreno?.fechado) return { ok: false, motivo: `A planta ${s.name} ainda não tem lote fechado.` };
  return { ok: true, plantaNome: s.name, medidas: medidasDaPlantaParaFicha(terreno, limites) };
}
