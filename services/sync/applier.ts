// services/sync/applier.ts
//
// Escrita do plano. Recebe o SyncPlan — nunca um empreendimentoId — porque o que foi
// revisado tem que ser exatamente o que é escrito. Antes, `syncFromStudy(id)` recarregava o
// contexto e recalculava o plano, então o número que o usuário confirmava no preview não era
// necessariamente o que ia para o banco.
//
// Escopo desta fase: `fills` e `conflicts` são ambos aplicados — é o comportamento atual,
// preservado de propósito. Quando a inbox de curadoria existir, `conflicts` deixa de ser
// escrito aqui e passa a virar proposta pendente; `fills` continua direto.

import { supabase } from '../../lib/supabase';
import { EmpreendimentoUnitInsert } from '../../types/empreendimento';
import { changesToUpdates } from './planner';
import { PROVENANCE, SyncApplyResult, SyncPlan } from './types';

export async function applyPlan(plan: SyncPlan): Promise<SyncApplyResult> {
    const result: SyncApplyResult = { towersCreated: 0, unitsCreated: 0, fieldsApplied: 0, commonAreasCreated: 0 };

    // 0. Adoções: gravar a proveniência nas entidades casadas por nome, ANTES dos diffs — daí
    //    em diante elas são reconhecidas e nunca mais duplicam. É o remédio do bug da
    //    torre-fantasma (torre à mão sem vínculo).
    const { towerKey, unitKey } = PROVENANCE[plan.origin];
    for (const a of plan.adoptions) {
        const table = a.entity === 'tower' ? 'empreendimento_towers' : 'empreendimento_units';
        const key = a.entity === 'tower' ? towerKey : unitKey;
        const { error } = await supabase.from(table).update({ [key]: a.sourceId }).eq('id', a.existingId);
        if (error) throw new Error(`Falha ao vincular ${a.entity === 'tower' ? 'a torre' : 'a unidade'} ao estudo: ${error.message}`);
    }

    // 1. Torres novas + as unidades que nascem com elas.
    for (const tc of plan.towerCreates) {
        const { data: tower, error } = await supabase
            .from('empreendimento_towers')
            .insert(tc.insert)
            .select('id')
            .single();
        if (error) throw new Error(`Falha ao criar a torre: ${error.message}`);
        result.towersCreated++;

        if (tc.units.length > 0) {
            const rows = tc.units.map(u => ({ ...u, tower_id: tower.id })) as EmpreendimentoUnitInsert[];
            const { error: uErr } = await supabase.from('empreendimento_units').insert(rows);
            if (uErr) throw new Error(`Falha ao criar unidades da torre: ${uErr.message}`);
            result.unitsCreated += rows.length;
        }
    }

    // 2. Unidades novas em torres que já existem — um insert só, não N round-trips.
    if (plan.unitCreates.length > 0) {
        const rows = plan.unitCreates.map(uc => ({ ...uc.insert, tower_id: uc.towerId })) as EmpreendimentoUnitInsert[];
        const { error } = await supabase.from('empreendimento_units').insert(rows);
        if (error) throw new Error(`Falha ao criar unidades: ${error.message}`);
        result.unitsCreated += rows.length;
    }

    // 3. Campos: um update por entidade, não um por campo.
    const updates = changesToUpdates([...plan.fills, ...plan.conflicts]);
    for (const [entityId, { entity, fields }] of updates) {
        const table = entity === 'tower' ? 'empreendimento_towers' : 'empreendimento_units';
        const { error } = await supabase.from(table).update(fields).eq('id', entityId);
        if (error) throw new Error(`Falha ao atualizar ${entity === 'tower' ? 'a torre' : 'a unidade'}: ${error.message}`);
        result.fieldsApplied += Object.keys(fields).length;
    }

    // 4. Áreas comuns novas.
    if (plan.commonAreaCreates.length > 0) {
        const { error } = await supabase.from('empreendimento_common_areas').insert(plan.commonAreaCreates);
        if (error) throw new Error(`Falha ao criar áreas comuns: ${error.message}`);
        result.commonAreasCreated = plan.commonAreaCreates.length;
    }

    // 5. Carimbo da última sincronização.
    const { error: stampErr } = await supabase
        .from('empreendimentos')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', plan.empreendimentoId);
    if (stampErr) throw new Error(`Falha ao carimbar a sincronização: ${stampErr.message}`);

    return result;
}
