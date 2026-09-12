// services/pricingRuleApplicationService.ts
// Registro do que a Inteligência aplicou, por unidade — tabela
// `pricing_rule_applications` (migration aplicar_20270921000012).
//
// Por que existe: sem ele, a coluna "Regras da Inteligência" (Tabela de
// aluguéis / de preços) só sabia reavaliar as regras ATIVAS HOJE contra os
// atributos ATUAIS da unidade. Editar a regra depois do Aplicar fazia a coluna
// explicar o preço por uma regra que nunca o produziu, calada. Aqui o que valeu
// no momento do Aplicar fica congelado: nome da regra, percentual, R$, o preço
// que a unidade teria sem regra nenhuma e a estratégia usada.
//
// Uma linha por (property_id, purpose) — a ÚLTIMA aplicação. Não é histórico: a
// pergunta é "o preço que está aí veio de quê?", e ela só tem uma resposta.
import { supabase } from '../lib/supabase';
import {
    AppliedRuleSnapshot,
    PricingPurpose,
    PricingRuleApplication,
    PricingRuleApplicationInsert,
    PricingSplit,
} from '../types';
import { AdjustmentBreakdown, allocateAmountByRules } from './rentalPricingRuleService';

// NOTA: string LITERAL única (sem concatenação com +) — senão o supabase-js infere
// GenericStringError em vez do tipo da linha (mesma nota de rentalPricingRuleService.ts).
const APPLICATION_COLS = 'id, organization_id, building_property_id, property_id, purpose, mode, price, base_price, total_amount, total_pct, rules, applied_at, applied_by, created_at, updated_at';

/** Normaliza o `rules` vindo do banco (jsonb) para o tipo do app. */
function parseRules(raw: unknown): AppliedRuleSnapshot[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
        .map(r => ({
            rule_id: String(r.rule_id ?? ''),
            name: String(r.name ?? ''),
            attribute_label: String(r.attribute_label ?? ''),
            pct: Number(r.pct) || 0,
            amount: Number(r.amount) || 0,
        }));
}

function parseRow(row: any): PricingRuleApplication {
    return {
        ...row,
        price: Number(row.price) || 0,
        base_price: Number(row.base_price) || 0,
        total_amount: Number(row.total_amount) || 0,
        total_pct: Number(row.total_pct) || 0,
        rules: parseRules(row.rules),
    };
}

/**
 * Monta as linhas a gravar depois de um Aplicar — função PURA (sem banco), para
 * a conta ficar testável fora do clique.
 *
 * Percorre o que o MOTOR precificou (`splitByPropertyId`), não as regras: unidade
 * sem regra nenhuma também ganha registro, porque no modo de alvo total ela pode
 * ter mudado de preço por causa de regra em outra unidade — e "por que este
 * preço mudou sem regra minha?" é justamente a pergunta que o registro responde.
 */
export function buildApplicationRows(params: {
    organizationId: string;
    buildingPropertyId: string;
    purpose: PricingPurpose;
    /** property_id → regras que casaram (rentalPricingRuleService.computeAdjustmentBreakdown). */
    breakdownByProperty: Record<string, AdjustmentBreakdown>;
    /** property_id → decomposição exata do motor. */
    splitByPropertyId: Record<string, PricingSplit>;
    appliedBy?: string | null;
}): PricingRuleApplicationInsert[] {
    const { organizationId, buildingPropertyId, purpose, breakdownByProperty, splitByPropertyId, appliedBy } = params;
    return Object.entries(splitByPropertyId).map(([propertyId, split]) => {
        const applied = breakdownByProperty[propertyId]?.applied ?? [];
        const amounts = allocateAmountByRules(split.total, applied);
        const rules: AppliedRuleSnapshot[] = applied.map((a, i) => ({
            rule_id: a.rule.id,
            // Nome congelado: mesma convenção da aba Inteligência — regra antiga
            // (anterior à coluna `name`) cai no rótulo da característica.
            name: (a.rule.name ?? '').trim() || a.rule.attribute_label,
            attribute_label: a.rule.attribute_label,
            pct: a.pct,
            amount: amounts[i] ?? 0,
        }));
        return {
            organization_id: organizationId,
            building_property_id: buildingPropertyId,
            property_id: propertyId,
            purpose,
            mode: split.mode,
            price: split.price,
            base_price: split.base,
            total_amount: split.total,
            total_pct: split.totalPct,
            rules,
            applied_by: appliedBy ?? null,
        };
    });
}

export const pricingRuleApplicationService = {
    /** Última aplicação de cada unidade do edifício, indexada por `property_id`. */
    async listByBuilding(
        buildingPropertyId: string,
        purpose: PricingPurpose,
    ): Promise<Record<string, PricingRuleApplication>> {
        const { data, error } = await supabase
            .from('pricing_rule_applications')
            .select(APPLICATION_COLS)
            .eq('building_property_id', buildingPropertyId)
            .eq('purpose', purpose);
        if (error) throw new Error(`Failed to list pricing rule applications: ${error.message}`);
        const out: Record<string, PricingRuleApplication> = {};
        for (const row of data ?? []) out[(row as any).property_id] = parseRow(row);
        return out;
    },

    /**
     * Grava (substituindo) o registro de cada unidade desta aplicação.
     *
     * `onConflict: 'property_id,purpose'` casa com o UNIQUE da migration — é
     * índice total, sem `WHERE`, então o upsert não cai no 42P10 de índice
     * parcial. Em lote único: são dezenas de unidades por Aplicar, e um roundtrip
     * por unidade transformaria um clique em dezenas de requisições.
     */
    async saveBatch(rows: PricingRuleApplicationInsert[]): Promise<number> {
        if (rows.length === 0) return 0;
        // Quem aplicou, quando a chamada não informou: lido da sessão em memória
        // (`getSession`, local) e não de `getUser`, que é ida à rede a cada Aplicar.
        let comAutor = rows;
        if (rows.some(r => !r.applied_by)) {
            const { data } = await supabase.auth.getSession();
            const uid = data.session?.user?.id ?? null;
            comAutor = rows.map(r => (r.applied_by ? r : { ...r, applied_by: uid }));
        }
        const { error } = await supabase
            .from('pricing_rule_applications')
            .upsert(comAutor as any, { onConflict: 'property_id,purpose' });
        if (error) throw new Error(`Failed to save pricing rule applications: ${error.message}`);
        return rows.length;
    },
};
