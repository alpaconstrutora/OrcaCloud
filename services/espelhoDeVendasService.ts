import { supabase } from '../lib/supabase';
import type { EmpreendimentoFloor } from '../types/empreendimento';
import type { TorreDaEstrutura, UnidadeDaEstrutura } from '../utils/espelhoDoEstoque';

/**
 * ESPELHO DE VENDAS 3D (F3, 09/11/2026) — a estrutura das torres do Empreendimento
 * para o desenho. Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 *
 * Dois caminhos para o mesmo formato (`TorreDaEstrutura[]`):
 * - PELO LINK do portal: a RPC `fn_broker_portal_get_espelho` (portal nunca lê
 *   tabela direto — pelo link a RLS devolve [] em silêncio);
 * - DENTRO DO APP (equipe abrindo o portal): as tabelas, pelo prédio do estoque.
 *
 * Só geometria. Preço e status vêm do estoque que a tela já tem.
 */

const TOWER_COLS = 'id, empreendimento_id, name, sort_order, floors_count, units_per_floor, pe_direito_padrao_m, elevacao_terreo_m, ordem_das_unidades_na_planta, blueprint_quadra_uid';
const FLOOR_COLS = 'id, tower_id, name, tipo, floor_number, repeat_count, units_per_floor, prefix, pe_direito_m, elevacao_m, sort_order, created_at, updated_at';
const UNIT_COLS = 'id, tower_id, name, floor, floor_tipo, private_area, position_type, sun_orientation, sort_order, vaga_na_planta, commercial_property_id';

type LinhaDaTorre = Omit<TorreDaEstrutura, 'commercial_building_id' | 'distancias_entre_torres' | 'floors' | 'units'> & { empreendimento_id: string };
type LinhaDaUnidade = Omit<UnidadeDaEstrutura, 'property_id'> & { tower_id: string; commercial_property_id: string | null };

export const espelhoDeVendasService = {
    /** Todas as torres dos prédios que o corretor do token vê. Token inválido ou função ausente = []. */
    async estruturaPorToken(token: string): Promise<TorreDaEstrutura[]> {
        const { data, error } = await supabase.rpc('fn_broker_portal_get_espelho', { p_token: token });
        if (error) throw error;
        const res = data as { valid?: boolean; torres?: TorreDaEstrutura[] } | null;
        return res?.valid ? (res.torres ?? []) : [];
    },

    /** As torres do empreendimento ligado a um prédio do estoque (`commercial_properties` BUILDING). */
    async estruturaDoPredio(buildingId: string): Promise<TorreDaEstrutura[]> {
        const { data: emps, error: e1 } = await supabase
            .from('empreendimentos')
            .select('id, commercial_building_id, distancias_entre_torres')
            .eq('commercial_building_id', buildingId);
        if (e1) throw e1;
        const empreendimentos = (emps ?? []) as { id: string; commercial_building_id: string | null; distancias_entre_torres: unknown }[];
        if (empreendimentos.length === 0) return [];

        const { data: tws, error: e2 } = await supabase
            .from('empreendimento_towers')
            .select(TOWER_COLS)
            .in('empreendimento_id', empreendimentos.map(e => e.id))
            .order('sort_order');
        if (e2) throw e2;
        const torres = (tws ?? []) as unknown as LinhaDaTorre[];
        if (torres.length === 0) return [];
        const ids = torres.map(t => t.id);

        const [floorsRes, unitsRes] = await Promise.all([
            supabase.from('empreendimento_floors').select(FLOOR_COLS).in('tower_id', ids).order('sort_order'),
            supabase.from('empreendimento_units').select(UNIT_COLS).in('tower_id', ids).order('sort_order'),
        ]);
        if (floorsRes.error) throw floorsRes.error;
        if (unitsRes.error) throw unitsRes.error;
        const floors = (floorsRes.data ?? []) as unknown as EmpreendimentoFloor[];
        const units = (unitsRes.data ?? []) as unknown as LinhaDaUnidade[];

        const doEmpreendimento = new Map(empreendimentos.map(e => [e.id, e]));
        return torres.map(({ empreendimento_id, ...t }) => ({
            ...t,
            commercial_building_id: doEmpreendimento.get(empreendimento_id)?.commercial_building_id ?? null,
            distancias_entre_torres: doEmpreendimento.get(empreendimento_id)?.distancias_entre_torres ?? null,
            floors: floors.filter(f => f.tower_id === t.id),
            units: units.filter(u => u.tower_id === t.id).map(({ tower_id: _torre, commercial_property_id, ...u }) => ({ ...u, property_id: commercial_property_id })),
        }));
    },
};
