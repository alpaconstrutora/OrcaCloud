// services/empreendimentoUnitCharacteristicService.ts
// Catálogo configurável de "Características Adicionais" de unidade (Acessibilidade,
// Comunicação Visual, ...) + valores por unidade. Mesmo par catálogo/valor de
// empreendimentoTypeService.ts, mas aqui o valor é uma tabela própria porque uma
// unidade pode ter VÁRIOS valores por característica (MULTI_SELECT).
// Migration: supabase/migrations/aplicar_20270905000029_empreendimento_unit_characteristics.sql
import { supabase } from '../lib/supabase';
import {
    EmpreendimentoUnitCharacteristic,
    EmpreendimentoUnitCharacteristicInsert,
    EmpreendimentoUnitCharacteristicUpdate,
    UnitCharacteristicInputType,
    UnitCharacteristicOption,
} from '../types/empreendimento';

export const INPUT_TYPE_OPTIONS: { value: UnitCharacteristicInputType; label: string }[] = [
    { value: 'SELECT', label: 'Seleção única' },
    { value: 'MULTI_SELECT', label: 'Múltipla escolha' },
    { value: 'TEXT', label: 'Texto' },
    { value: 'NUMBER', label: 'Número' },
    { value: 'BOOLEAN', label: 'Sim/Não' },
];

// NOTA: string LITERAL (sem concatenação com +) — senão o supabase-js infere
// GenericStringError em vez do tipo da linha (mesma nota de empreendimentoService.ts).
const CHARACTERISTIC_COLS = 'id, organization_id, name, slug, input_type, options, applies_to_tipos, active, sort_order, created_at, updated_at';
const VALUE_COLS = 'id, unit_id, characteristic_id, organization_id, values, created_at, updated_at';

function slugify(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 60);
}

export const empreendimentoUnitCharacteristicService = {
    /** Catálogo da organização. Com `tipo`, filtra no cliente por applies_to_tipos (vazio = todos). */
    async listCharacteristics(organizationId: string, opts?: { tipo?: string | null }): Promise<EmpreendimentoUnitCharacteristic[]> {
        const { data, error } = await supabase
            .from('empreendimento_unit_characteristics')
            .select(CHARACTERISTIC_COLS)
            .eq('organization_id', organizationId)
            .eq('active', true)
            .order('sort_order')
            .order('name');
        if (error) throw error;
        const all = (data || []) as EmpreendimentoUnitCharacteristic[];
        if (!opts || opts.tipo === undefined) return all;
        return all.filter(c => c.applies_to_tipos.length === 0 || (opts.tipo != null && c.applies_to_tipos.includes(opts.tipo)));
    },

    async createCharacteristic(payload: EmpreendimentoUnitCharacteristicInsert): Promise<EmpreendimentoUnitCharacteristic> {
        if (!payload.organization_id) throw new Error('Selecione uma organização ativa para gerenciar características de unidade.');
        const slug = payload.slug || slugify(payload.name);
        const { data, error } = await supabase
            .from('empreendimento_unit_characteristics')
            .insert({ ...payload, slug })
            .select(CHARACTERISTIC_COLS)
            .single();
        if (error) throw error;
        return data as EmpreendimentoUnitCharacteristic;
    },

    async updateCharacteristic(id: string, updates: EmpreendimentoUnitCharacteristicUpdate): Promise<EmpreendimentoUnitCharacteristic> {
        const { data, error } = await supabase
            .from('empreendimento_unit_characteristics')
            .update(updates)
            .eq('id', id)
            .select(CHARACTERISTIC_COLS)
            .single();
        if (error) throw error;
        return data as EmpreendimentoUnitCharacteristic;
    },

    async duplicateCharacteristic(characteristic: EmpreendimentoUnitCharacteristic, organizationId: string): Promise<EmpreendimentoUnitCharacteristic> {
        return this.createCharacteristic({
            name: `${characteristic.name} (Cópia)`,
            organization_id: organizationId,
            input_type: characteristic.input_type,
            options: characteristic.options,
            applies_to_tipos: characteristic.applies_to_tipos,
            active: true,
            sort_order: characteristic.sort_order,
        });
    },

    async removeCharacteristic(id: string): Promise<void> {
        const { error } = await supabase.from('empreendimento_unit_characteristics').delete().eq('id', id);
        if (error) throw error;
    },

    /** Valores de várias unidades de uma vez: unitId → characteristicId → values. */
    async listValuesForUnits(unitIds: string[]): Promise<Record<string, Record<string, string[]>>> {
        if (unitIds.length === 0) return {};
        const { data, error } = await supabase
            .from('empreendimento_unit_characteristic_values')
            .select(VALUE_COLS)
            .in('unit_id', unitIds);
        if (error) throw error;
        const byUnit: Record<string, Record<string, string[]>> = {};
        for (const row of (data || []) as { unit_id: string; characteristic_id: string; values: string[] }[]) {
            if (!byUnit[row.unit_id]) byUnit[row.unit_id] = {};
            byUnit[row.unit_id][row.characteristic_id] = row.values;
        }
        return byUnit;
    },

    /** `values` vazio remove o registro (nada a guardar); senão upsert por (unit_id, characteristic_id). */
    async setValues(unitId: string, characteristicId: string, organizationId: string, values: string[]): Promise<void> {
        if (values.length === 0) {
            const { error } = await supabase
                .from('empreendimento_unit_characteristic_values')
                .delete()
                .eq('unit_id', unitId)
                .eq('characteristic_id', characteristicId);
            if (error) throw error;
            return;
        }
        const { error } = await supabase
            .from('empreendimento_unit_characteristic_values')
            .upsert({ unit_id: unitId, characteristic_id: characteristicId, organization_id: organizationId, values }, { onConflict: 'unit_id,characteristic_id' });
        if (error) throw error;
    },

    /** Usado pelo "Duplicar unidade" — copia todos os valores de uma unidade para outra recém-criada. */
    async copyValues(fromUnitId: string, toUnitId: string, organizationId: string): Promise<void> {
        const { data, error } = await supabase
            .from('empreendimento_unit_characteristic_values')
            .select('characteristic_id, values')
            .eq('unit_id', fromUnitId);
        if (error) throw error;
        const rows = (data || []) as { characteristic_id: string; values: string[] }[];
        if (rows.length === 0) return;
        const { error: upsertError } = await supabase
            .from('empreendimento_unit_characteristic_values')
            .upsert(
                rows.map(r => ({ unit_id: toUnitId, characteristic_id: r.characteristic_id, organization_id: organizationId, values: r.values })),
                { onConflict: 'unit_id,characteristic_id' }
            );
        if (upsertError) throw upsertError;
    },
};

export type { UnitCharacteristicOption };
