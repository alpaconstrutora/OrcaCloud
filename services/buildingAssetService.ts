// services/buildingAssetService.ts
// Ativos INSTALADOS do edifício — elevador, bomba, gerador, portão.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md (F2)
//
// SEM TABELA NOVA: é `opura_assets`, que já tem hierarquia (`parent_asset_id`),
// documentos, movimentações e histórico. O que a F1 acrescentou foi o vínculo
// com o edifício (`empreendimento_id`), com o sistema predial
// (`building_system_id`) e a garantia do FORNECEDOR.
//
// A garantia daqui NÃO é a de `warranty_terms`. Aquela é a garantia da
// CONSTRUTORA ao comprador, com prazo legal contado da entrega do imóvel. Esta
// é do FORNECEDOR do equipamento, corre da instalação e é contra quem vendeu a
// bomba. Confundi-las faz o condomínio cobrar da parte errada, e descobrir
// tarde que o prazo da certa já venceu.

import { supabase } from '../lib/supabase';

/** Categoria que separa o ativo do edifício da frota/ferramenta de obra. */
export const CATEGORIA_PREDIAL = 'sistema_predial';

const ASSET_COLS =
    'id, organization_id, parent_asset_id, code, name, category, subcategory, brand, model, '
    + 'serial_number, purchase_date, purchase_value, status, notes, empreendimento_id, '
    + 'building_system_id, supplier_id, supplier_warranty_until, created_at, updated_at';

export interface BuildingAsset {
    id: string;
    organization_id: string;
    code: string;
    name: string;
    category: string;
    subcategory?: string | null;
    brand?: string | null;
    model?: string | null;
    serial_number?: string | null;
    /** Data de instalação — é dela que corre a garantia do fornecedor. */
    purchase_date?: string | null;
    purchase_value?: number | null;
    status: string;
    notes?: string | null;
    empreendimento_id?: string | null;
    building_system_id?: string | null;
    supplier_id?: string | null;
    supplier_warranty_until?: string | null;
    created_at: string;
    updated_at: string;
}

export interface BuildingAssetRow extends BuildingAsset {
    _system_name: string;
    /** Dias até a garantia do fornecedor vencer. Negativo = vencida. Nulo = sem garantia. */
    _dias_garantia: number | null;
}

/** Dias até a data. Comparação em data pura — sem fuso (o bug clássico daqui). */
export function diasAte(iso?: string | null): number | null {
    if (!iso) return null;
    const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
    const alvo = Date.UTC(a, m - 1, d);
    const agora = new Date();
    const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
    return Math.round((alvo - hoje) / 86400000);
}

/**
 * Próximo código patrimonial predial, derivado do MAIOR sufixo existente.
 *
 * O módulo de Bens gera `OPR-PAT-{6 dígitos aleatórios}`. Com
 * `UNIQUE (organization_id, code)`, aleatório é colisão esperando acontecer — e
 * quando acontece, o cadastro falha sem o usuário entender por quê. Derivar do
 * máximo (e não de COUNT) é o mesmo raciocínio de `nextRentalNumber`: com
 * contagem, excluir um ativo faz o próximo número repetir um já usado.
 */
async function proximoCodigo(organizationId: string): Promise<string> {
    const { data } = await supabase
        .from('opura_assets')
        .select('code')
        .eq('organization_id', organizationId)
        .like('code', 'OPR-PRE-%')
        .order('code', { ascending: false })
        .limit(1)
        .maybeSingle();
    const ultimo = parseInt((data?.code || '').split('-').pop() || '0', 10) || 0;
    return `OPR-PRE-${String(ultimo + 1).padStart(4, '0')}`;
}

export const buildingAssetService = {
    async listByEmpreendimento(
        empreendimentoId: string,
        sistemas: { id: string; name: string }[],
    ): Promise<BuildingAssetRow[]> {
        const { data, error } = await supabase
            .from('opura_assets')
            .select(ASSET_COLS)
            .eq('empreendimento_id', empreendimentoId)
            // Garantia vencendo primeiro: a tela existe para mostrar o que exige
            // ação, não para listar cadastro em ordem alfabética.
            .order('supplier_warranty_until', { ascending: true, nullsFirst: false })
            .order('name', { ascending: true });
        if (error) throw new Error(`Falha ao carregar os ativos do edifício: ${error.message}`);

        const porSistema = new Map(sistemas.map(s => [s.id, s.name]));
        return (data || []).map((a: any) => ({
            ...a,
            _system_name: a.building_system_id ? (porSistema.get(a.building_system_id) || '—') : '—',
            _dias_garantia: diasAte(a.supplier_warranty_until),
        })) as BuildingAssetRow[];
    },

    async create(payload: {
        organization_id: string;
        empreendimento_id: string;
        name: string;
        building_system_id?: string | null;
        brand?: string | null;
        model?: string | null;
        serial_number?: string | null;
        purchase_date?: string | null;
        supplier_id?: string | null;
        supplier_warranty_until?: string | null;
        notes?: string | null;
    }): Promise<BuildingAsset> {
        const code = await proximoCodigo(payload.organization_id);
        const { data, error } = await supabase
            .from('opura_assets')
            .insert({ ...payload, code, category: CATEGORIA_PREDIAL, status: 'em_uso' })
            .select(ASSET_COLS)
            .single();
        if (error) throw new Error(`Falha ao cadastrar o ativo: ${error.message}`);
        // Os tipos gerados do Supabase ainda não conhecem as colunas que a
        // migration 000018 acrescentou (empreendimento_id, building_system_id,
        // supplier_id, supplier_warranty_until) — daí o cast.
        return data as unknown as BuildingAsset;
    },

    async update(id: string, patch: Partial<BuildingAsset>): Promise<BuildingAsset> {
        const { data, error } = await supabase
            .from('opura_assets')
            .update(patch)
            .eq('id', id)
            .select(ASSET_COLS)
            .single();
        if (error) throw new Error(`Falha ao atualizar o ativo: ${error.message}`);
        // Os tipos gerados do Supabase ainda não conhecem as colunas que a
        // migration 000018 acrescentou (empreendimento_id, building_system_id,
        // supplier_id, supplier_warranty_until) — daí o cast.
        return data as unknown as BuildingAsset;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('opura_assets').delete().eq('id', id);
        if (error) throw new Error(`Falha ao excluir o ativo: ${error.message}`);
    },
};
