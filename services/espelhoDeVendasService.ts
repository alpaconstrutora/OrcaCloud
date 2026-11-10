import { supabase } from '../lib/supabase';
import type { EmpreendimentoFloor } from '../types/empreendimento';
import type { TorreDaEstrutura, UnidadeDaEstrutura } from '../utils/espelhoDoEstoque';
import { contornoDaLinha, type ContornoParaATorre, type LinhaComContorno } from '../utils/espelhoContornoDaTorre';
import type { ContornoDaTorre } from '../utils/espelhoDeVendas3d';
import type { PlantaDaTipologia } from '../utils/espelhoPlantaDaTipologia';
import { empreendimentoTipologiaPlantasService } from './empreendimentoTipologiaPlantasService';

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
/** As colunas do contorno (F1b). Lidas à parte: antes da migration elas não existem, e o resto não pode cair junto. */
const CONTORNO_COLS = 'contorno_na_planta, contorno_frente, contorno_norte_deg, contorno_atualizado_em';
const FLOOR_COLS = 'id, tower_id, name, tipo, floor_number, repeat_count, units_per_floor, prefix, pe_direito_m, elevacao_m, sort_order, created_at, updated_at';
const UNIT_COLS = 'id, tower_id, name, floor, floor_tipo, private_area, position_type, sun_orientation, sort_order, vaga_na_planta, commercial_property_id';

type LinhaDaTorre = Omit<TorreDaEstrutura, 'commercial_building_id' | 'distancias_entre_torres' | 'floors' | 'units' | 'contorno_na_planta' | 'contorno_frente' | 'contorno_norte_deg'> & { empreendimento_id: string };

/** Coluna que ainda não existe no banco (a migration do contorno não foi aplicada). */
const colunaAusente = (e: { code?: string; message?: string } | null) =>
    !!e && (e.code === '42703' || e.code === 'PGRST204' || /contorno_/.test(e.message ?? ''));

export interface ContornoGravado {
    contorno: Required<ContornoDaTorre>;
    atualizadoEm: string | null;
}
/** O que o 3D do Estoque precisa além do próprio estoque: as torres e as plantas por tipologia (F5). */
export interface EstruturaDoEspelho {
    torres: TorreDaEstrutura[];
    plantas: PlantaDaTipologia[];
}
type LinhaDaUnidade = Omit<UnidadeDaEstrutura, 'property_id'> & { tower_id: string; commercial_property_id: string | null };

export const espelhoDeVendasService = {
    /**
     * Todas as torres dos prédios que o corretor do token vê, e as plantas por
     * tipologia deles. Token inválido = vazio. `plantas` ausente (função de antes
     * da F5) = sem planta.
     */
    async estruturaPorToken(token: string): Promise<EstruturaDoEspelho> {
        const { data, error } = await supabase.rpc('fn_broker_portal_get_espelho', { p_token: token });
        if (error) throw error;
        const res = data as { valid?: boolean; torres?: TorreDaEstrutura[]; plantas?: PlantaDaTipologia[] } | null;
        return res?.valid ? { torres: res.torres ?? [], plantas: res.plantas ?? [] } : { torres: [], plantas: [] };
    },

    /** O mesmo que `estruturaPorToken`, DENTRO do app: as torres e as plantas do prédio escolhido. */
    async estruturaDoApp(buildingId: string): Promise<EstruturaDoEspelho> {
        const [torres, plantas] = await Promise.all([
            this.estruturaDoPredio(buildingId),
            // Sem planta (ou sem a tabela) a ficha só não mostra o trecho — nunca derruba o desenho.
            empreendimentoTipologiaPlantasService.doPredio(buildingId).catch(() => [] as PlantaDaTipologia[]),
        ]);
        return { torres, plantas };
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

        const [floorsRes, unitsRes, contornos] = await Promise.all([
            supabase.from('empreendimento_floors').select(FLOOR_COLS).in('tower_id', ids).order('sort_order'),
            supabase.from('empreendimento_units').select(UNIT_COLS).in('tower_id', ids).order('sort_order'),
            // Sem contorno (ou sem a coluna) a torre sai esquemática — nunca derruba o desenho.
            this.contornosGravados(ids).catch(() => new Map<string, ContornoGravado>()),
        ]);
        if (floorsRes.error) throw floorsRes.error;
        if (unitsRes.error) throw unitsRes.error;
        const floors = (floorsRes.data ?? []) as unknown as EmpreendimentoFloor[];
        const units = (unitsRes.data ?? []) as unknown as LinhaDaUnidade[];

        const doEmpreendimento = new Map(empreendimentos.map(e => [e.id, e]));
        return torres.map(({ empreendimento_id, ...t }) => ({
            ...t,
            contorno_na_planta: contornos.get(t.id)?.contorno.anel ?? null,
            contorno_frente: contornos.get(t.id)?.contorno.frenteParaFora ?? null,
            contorno_norte_deg: contornos.get(t.id)?.contorno.rotacaoNorteDeg ?? null,
            commercial_building_id: doEmpreendimento.get(empreendimento_id)?.commercial_building_id ?? null,
            distancias_entre_torres: doEmpreendimento.get(empreendimento_id)?.distancias_entre_torres ?? null,
            floors: floors.filter(f => f.tower_id === t.id),
            units: units.filter(u => u.tower_id === t.id).map(({ tower_id: _torre, commercial_property_id, ...u }) => ({ ...u, property_id: commercial_property_id })),
        }));
    },

    /**
     * O contorno que cada torre tem gravado (F1b) e quando foi enviado. Torre sem
     * contorno não entra no mapa. Antes da migration (coluna ausente) = mapa vazio.
     */
    async contornosGravados(torreIds: readonly string[]): Promise<Map<string, ContornoGravado>> {
        const out = new Map<string, ContornoGravado>();
        if (torreIds.length === 0) return out;
        const { data, error } = await supabase.from('empreendimento_towers').select(`id, ${CONTORNO_COLS}`).in('id', [...torreIds]);
        if (error) {
            if (colunaAusente(error)) return out;
            throw error;
        }
        for (const linha of (data ?? []) as unknown as ({ id: string; contorno_atualizado_em: string | null } & LinhaComContorno)[]) {
            const contorno = contornoDaLinha(linha);
            if (contorno) out.set(linha.id, { contorno, atualizadoEm: linha.contorno_atualizado_em ?? null });
        }
        return out;
    },

    /**
     * Grava na torre o contorno que a Planta desenhou (F1b). ⚠️ Confere a linha que
     * voltou: UPDATE barrado pela RLS não dá erro, só não muda nada — e "enviado"
     * sem ter gravado é o pior resultado.
     */
    async gravarContornos(lista: readonly ContornoParaATorre[]): Promise<void> {
        const agora = new Date().toISOString();
        for (const c of lista) {
            const { data, error } = await supabase
                .from('empreendimento_towers')
                .update({
                    contorno_na_planta: c.contorno.anel,
                    contorno_frente: c.contorno.frenteParaFora,
                    contorno_norte_deg: c.contorno.rotacaoNorteDeg,
                    contorno_atualizado_em: agora,
                })
                .eq('id', c.torreId)
                .select('id');
            if (error) {
                if (colunaAusente(error)) throw new Error('O banco ainda não tem as colunas do contorno da torre — falta aplicar a migration do Espelho de Vendas 3D (aplicar_20271110200000).');
                throw new Error(`Não foi possível gravar o contorno da ${c.torre}: ${error.message}`);
            }
            if (!data || data.length === 0) throw new Error(`O contorno da ${c.torre} não foi gravado — você não tem permissão para alterar esta torre.`);
        }
    },
};
