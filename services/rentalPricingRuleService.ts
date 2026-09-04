// services/rentalPricingRuleService.ts
// Regras de ajuste percentual por edifício — aba "Inteligência" em
// Comercial › Gestão de Locações › Gestão de Unidades e em
// Comercial › Venda de Ativos (mesma tabela; as linhas são separadas por
// `building_property_id`, e edifício de locação nunca é o mesmo de venda).
//
// O percentual NÃO sobrescreve o preço por fora: `computeAdjustmentPct`
// devolve, por unidade, a SOMA dos percentuais das regras que casaram, e esse
// número entra como 6º fator multiplicativo no score de `rentalPricingService`
// (aluguel) ou de `pricingService` (venda), como `1 + pct/100`. É isso que
// preserva a soma exata nos modos de alvo total ("aluguel-alvo total"/VGV).
//
// Migration: supabase/migrations/aplicar_20270905000030_rental_pricing_rules.sql
import { supabase } from '../lib/supabase';
import {
    Property,
    RentalPricingRule,
    RentalPricingRuleInsert,
    RentalPricingRuleOperator,
    RentalPricingRuleUpdate,
} from '../types';

// NOTA: string LITERAL única (sem concatenação com +) — senão o supabase-js infere
// GenericStringError em vez do tipo da linha (mesma nota de empreendimentoService.ts:113).
const RULE_COLS = 'id, organization_id, building_property_id, name, attribute_key, attribute_label, operator, value_num, value_num2, value_text, adjust_pct, active, sort_order, created_at, updated_at';

/** Prefixo das chaves que apontam para o catálogo de características (migration ...029). */
export const CHARACTERISTIC_KEY_PREFIX = 'carac:';
export const isCharacteristicKey = (key: string) => key.startsWith(CHARACTERISTIC_KEY_PREFIX);
export const characteristicIdFromKey = (key: string) => key.slice(CHARACTERISTIC_KEY_PREFIX.length);

/** Como o valor do atributo se comporta — decide quais operadores a UI oferece. */
export type RuleAttributeType = 'number' | 'text' | 'select' | 'multi_select';

export interface RuleAttributeOption {
    key: string;
    label: string;
    type: RuleAttributeType;
    /** Só para select/multi_select. */
    options?: { value: string; label: string }[];
    /** Sufixo exibido na descrição da regra (ex: 'm²'). */
    unit?: string;
}

// Rótulos PT dos operadores — mesmo vocabulário de OPERATORS_BY_TYPE em
// components/ui/FilterUtils.tsx, para a tela não inventar um segundo dicionário.
export const OPERATOR_LABEL: Record<RentalPricingRuleOperator, string> = {
    gt: 'Maior que',
    gte: 'Maior ou igual a',
    lt: 'Menor que',
    lte: 'Menor ou igual a',
    eq: 'É',
    neq: 'Não é',
    between: 'Entre',
    contains: 'Contém',
    not_contains: 'Não contém',
    is_set: 'Está preenchido',
    is_not_set: 'Não está preenchido',
};

export const OPERATORS_BY_ATTRIBUTE_TYPE: Record<RuleAttributeType, RentalPricingRuleOperator[]> = {
    number: ['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between', 'is_set', 'is_not_set'],
    text: ['contains', 'not_contains', 'eq', 'neq', 'is_set', 'is_not_set'],
    select: ['eq', 'neq', 'is_set', 'is_not_set'],
    multi_select: ['contains', 'not_contains', 'is_set', 'is_not_set'],
};

/** Operadores que dispensam campo de valor. */
export const VALUELESS_OPERATORS: RentalPricingRuleOperator[] = ['is_set', 'is_not_set'];

// ── Atributos físicos, lidos direto do Property (já em memória no RentalsModule) ──
// São as MESMAS colunas da tabela da aba "Características Adicionais" do
// Empreendimento, para o vocabulário das duas telas bater.
export const PHYSICAL_ATTRIBUTES: RuleAttributeOption[] = [
    { key: 'private_area', label: 'Área privativa', type: 'number', unit: 'm²' },
    { key: 'common_area', label: 'Área comum', type: 'number', unit: 'm²' },
    { key: 'total_area', label: 'Área total', type: 'number', unit: 'm²' },
    { key: 'floor', label: 'Pavimento', type: 'number' },
    { key: 'bedrooms', label: 'Dormitórios', type: 'number' },
    { key: 'bathrooms', label: 'Banheiros', type: 'number' },
    { key: 'suites', label: 'Suítes', type: 'number' },
    { key: 'parking_spaces', label: 'Vagas', type: 'number' },
    { key: 'typology', label: 'Tipologia', type: 'text' },
    { key: 'tower_name', label: 'Torre', type: 'text' },
    {
        key: 'position_type', label: 'Posição', type: 'select',
        options: [
            { value: 'FRONT', label: 'Frente' },
            { value: 'LATERAL', label: 'Lateral' },
            { value: 'BACK', label: 'Fundos' },
        ],
    },
    {
        key: 'view_type', label: 'Vista', type: 'select',
        options: [
            { value: 'NONE', label: 'Sem vista' },
            { value: 'PARTIAL', label: 'Parcial' },
            { value: 'FULL', label: 'Plena' },
        ],
    },
    {
        key: 'sun_orientation', label: 'Orientação solar', type: 'select',
        options: [
            { value: 'NORTH', label: 'Norte' },
            { value: 'SOUTH', label: 'Sul' },
            { value: 'EAST', label: 'Leste' },
            { value: 'WEST', label: 'Oeste' },
        ],
    },
];

/** Valores resolvidos de UMA unidade: attribute_key → valor. */
export type UnitAttributes = Record<string, unknown>;

// ── Avaliador (PURO — sem banco, testável isoladamente) ─────────────────────

const toNumber = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
};

/** Um valor "preenchido" — array vazio e string vazia contam como ausente. */
const isSet = (v: unknown): boolean => {
    if (v === null || v === undefined) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'string') return v.trim() !== '';
    return true;
};

/**
 * A regra casa com esta unidade?
 *
 * Atributo ausente NUNCA casa (exceto `is_not_set`, que é justamente sobre a
 * ausência) — e uma regra que não casa não derruba as outras, mesma defesa de
 * `applyFilterRules` em components/ui/FilterUtils.tsx.
 */
export function ruleMatches(attrs: UnitAttributes, rule: RentalPricingRule): boolean {
    const raw = attrs[rule.attribute_key];

    if (rule.operator === 'is_set') return isSet(raw);
    if (rule.operator === 'is_not_set') return !isSet(raw);

    if (!isSet(raw)) return false;

    switch (rule.operator) {
        case 'gt': case 'gte': case 'lt': case 'lte': {
            const a = toNumber(raw);
            const b = toNumber(rule.value_num);
            if (a === null || b === null) return false;
            if (rule.operator === 'gt') return a > b;
            if (rule.operator === 'gte') return a >= b;
            if (rule.operator === 'lt') return a < b;
            return a <= b;
        }
        case 'between': {
            const a = toNumber(raw);
            const lo = toNumber(rule.value_num);
            const hi = toNumber(rule.value_num2);
            if (a === null || lo === null || hi === null) return false;
            // Tolera limites invertidos: "entre 20 e 10" é o mesmo intervalo.
            const [min, max] = lo <= hi ? [lo, hi] : [hi, lo];
            return a >= min && a <= max;
        }
        case 'eq': case 'neq': {
            // Numérico compara como número (evita '10' ≠ 10); o resto, como texto.
            const a = toNumber(raw);
            const b = toNumber(rule.value_num ?? rule.value_text);
            let equal: boolean;
            if (a !== null && b !== null) {
                equal = a === b;
            } else {
                const at = Array.isArray(raw) ? raw.map(String) : [String(raw)];
                const bt = String(rule.value_text ?? '');
                equal = at.length === 1 ? at[0] === bt : at.includes(bt);
            }
            return rule.operator === 'eq' ? equal : !equal;
        }
        case 'contains': case 'not_contains': {
            const needle = String(rule.value_text ?? '');
            let has: boolean;
            if (Array.isArray(raw)) {
                // Multi-select: pertinência exata ao conjunto, não substring.
                has = raw.map(String).includes(needle);
            } else {
                has = String(raw).toLowerCase().includes(needle.toLowerCase());
            }
            return rule.operator === 'contains' ? has : !has;
        }
        default:
            return false;
    }
}

/**
 * Percentual total por unidade — SOMA (não composição) dos `adjust_pct` das
 * regras ativas que casaram. 5% + 3% => 8 (o motor vira isso em fator 1,08).
 */
export function computeAdjustmentPct(
    attrsByProperty: Record<string, UnitAttributes>,
    rules: RentalPricingRule[],
): Record<string, number> {
    const activeRules = rules.filter(r => r.active);
    const out: Record<string, number> = {};
    for (const [propertyId, attrs] of Object.entries(attrsByProperty)) {
        let sum = 0;
        for (const rule of activeRules) {
            if (ruleMatches(attrs, rule)) sum += Number(rule.adjust_pct) || 0;
        }
        if (sum !== 0) out[propertyId] = sum;
    }
    return out;
}

/** Quantas unidades cada regra pega — alimenta o contador da tela. */
export function countMatchesByRule(
    attrsByProperty: Record<string, UnitAttributes>,
    rules: RentalPricingRule[],
): Record<string, number> {
    const out: Record<string, number> = {};
    for (const rule of rules) {
        let n = 0;
        for (const attrs of Object.values(attrsByProperty)) {
            if (ruleMatches(attrs, rule)) n++;
        }
        out[rule.id] = n;
    }
    return out;
}

// ── Service ─────────────────────────────────────────────────────────────────

export const rentalPricingRuleService = {
    async list(buildingPropertyId: string): Promise<RentalPricingRule[]> {
        const { data, error } = await supabase
            .from('rental_pricing_rules')
            .select(RULE_COLS)
            .eq('building_property_id', buildingPropertyId)
            .order('sort_order')
            .order('created_at');
        if (error) throw new Error(`Failed to list rental pricing rules: ${error.message}`);
        return (data || []) as RentalPricingRule[];
    },

    async create(payload: RentalPricingRuleInsert): Promise<RentalPricingRule> {
        if (!payload.organization_id) throw new Error('Organização não resolvida para a regra de ajuste.');
        const { data, error } = await supabase
            .from('rental_pricing_rules')
            .insert(payload)
            .select(RULE_COLS)
            .single();
        if (error) throw new Error(`Failed to create rental pricing rule: ${error.message}`);
        return data as RentalPricingRule;
    },

    async update(id: string, updates: RentalPricingRuleUpdate): Promise<RentalPricingRule> {
        const { data, error } = await supabase
            .from('rental_pricing_rules')
            .update(updates)
            .eq('id', id)
            .select(RULE_COLS)
            .single();
        if (error) throw new Error(`Failed to update rental pricing rule: ${error.message}`);
        return data as RentalPricingRule;
    },

    async duplicate(rule: RentalPricingRule): Promise<RentalPricingRule> {
        const { id, created_at, updated_at, ...rest } = rule;
        // Sufixo no nome: sem ele a cópia fica indistinguível da original na
        // tabela (mesma característica, mesma validação, mesmo percentual).
        const base = (rule.name ?? '').trim() || rule.attribute_label;
        return this.create({ ...rest, name: `${base} (cópia)`, sort_order: (rule.sort_order ?? 0) + 1 });
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('rental_pricing_rules').delete().eq('id', id);
        if (error) throw new Error(`Failed to delete rental pricing rule: ${error.message}`);
    },

    /**
     * Resolve os atributos de cada unidade, mesclando três fontes:
     *  1. o próprio Property (já em memória na tela);
     *  2. a unidade de empreendimento vinculada, via `vw_unit_property_map` — é
     *     ela que traz torre e o `unit_id`;
     *  3. os valores das características do catálogo, por `unit_id`, com chave
     *     `carac:<characteristic_id>`.
     *
     * Passos 2 e 3 são best-effort: unidade sem vínculo com empreendimento ainda
     * tem seus atributos físicos e continua elegível às regras que só usam eles.
     *
     * `purpose` diz de qual espelho vem a ponte: 'RENTAL' (Gestão de Locações) ou
     * 'SALE' (Venda de Ativos). É filtro obrigatório — a mesma unidade de
     * empreendimento pode ter espelho nos dois, e cruzar os dois traria o
     * property_id do outro módulo.
     */
    async resolveUnitAttributes(
        properties: Property[],
        organizationId?: string | null,
        purpose: 'RENTAL' | 'SALE' = 'RENTAL',
    ): Promise<Record<string, UnitAttributes>> {
        const byProperty: Record<string, UnitAttributes> = {};
        const propertyIds = properties.filter(p => p.id).map(p => p.id as string);

        // 1. Atributos físicos do Property.
        for (const p of properties) {
            if (!p.id) continue;
            byProperty[p.id] = {
                private_area: p.private_area ?? p.area ?? null,
                common_area: p.common_area ?? null,
                total_area: p.total_area ?? null,
                floor: p.floor ?? p.specs?.floor ?? null,
                bedrooms: p.bedrooms ?? p.specs?.bedrooms ?? null,
                bathrooms: p.bathrooms ?? p.specs?.bathrooms ?? null,
                suites: p.specs?.suites ?? null,
                parking_spaces: p.parking_spaces ?? p.specs?.parkingSpaces ?? null,
                typology: p.typology ?? p.specs?.typology ?? null,
                position_type: p.position_type ?? null,
                view_type: p.view_type ?? null,
                sun_orientation: p.sun_orientation ?? null,
                tower_name: null,
            };
        }

        if (propertyIds.length === 0) return byProperty;

        // 2. Ponte com a unidade do Empreendimento.
        const unitIdByProperty: Record<string, string> = {};
        try {
            let q = supabase
                .from('vw_unit_property_map')
                .select('property_id, unit_id, unit_floor, unit_typology, tower_name')
                .eq('purpose', purpose)
                .in('property_id', propertyIds);
            if (organizationId) q = q.eq('organization_id', organizationId);
            const { data, error } = await q;
            if (error) throw error;
            for (const r of (data || []) as {
                property_id: string; unit_id: string;
                unit_floor: number | null; unit_typology: string | null; tower_name: string | null;
            }[]) {
                const attrs = byProperty[r.property_id];
                if (!attrs) continue;
                unitIdByProperty[r.property_id] = r.unit_id;
                attrs.tower_name = r.tower_name ?? null;
                // A unidade do empreendimento só preenche o que o Property não tinha.
                if (attrs.floor === null) attrs.floor = r.unit_floor ?? null;
                if (attrs.typology === null) attrs.typology = r.unit_typology ?? null;
            }
        } catch (err) {
            console.warn('[rentalPricingRuleService] ponte com empreendimento indisponível:', err);
            return byProperty;
        }

        // 3. Valores das características do catálogo.
        const unitIds = Object.values(unitIdByProperty);
        if (unitIds.length === 0) return byProperty;
        try {
            const { data, error } = await supabase
                .from('empreendimento_unit_characteristic_values')
                .select('unit_id, characteristic_id, values')
                .in('unit_id', unitIds);
            if (error) throw error;
            const valuesByUnit: Record<string, Record<string, string[]>> = {};
            for (const r of (data || []) as { unit_id: string; characteristic_id: string; values: string[] }[]) {
                if (!valuesByUnit[r.unit_id]) valuesByUnit[r.unit_id] = {};
                valuesByUnit[r.unit_id][r.characteristic_id] = r.values;
            }
            for (const [propertyId, unitId] of Object.entries(unitIdByProperty)) {
                const vals = valuesByUnit[unitId];
                if (!vals) continue;
                for (const [characteristicId, values] of Object.entries(vals)) {
                    byProperty[propertyId][`${CHARACTERISTIC_KEY_PREFIX}${characteristicId}`] = values;
                }
            }
        } catch (err) {
            console.warn('[rentalPricingRuleService] características indisponíveis:', err);
        }

        return byProperty;
    },
};
