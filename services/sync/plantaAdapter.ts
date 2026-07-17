// services/sync/plantaAdapter.ts
//
// Normaliza o estudo de Arquitetura (Planta IA) para o lado canônico.
//
// Cardinalidade: 1 plant_scenario = 1 torre, e SÓ o cenário escolhido é sincronizado — os
// demais são alternativas descartadas do estudo, e materializá-las criaria torres fantasma.
// Consequência conhecida: um estudo do Planta IA rende no máximo UMA torre (limitação
// registrada no MAPA_DADOS_EMP_PLANTA_VIABILIDADE.md, fora do escopo desta fase).

import { supabase } from '../../lib/supabase';
import { plantaAiMaterializeService } from '../plantaAiMaterializeService';
import { Empreendimento, EmpreendimentoUnitInsert, UnitStatus } from '../../types/empreendimento';
import { PlantScenario, PlantUnit } from '../../types/plantaAi';
import { CanonicalSide, CanonicalTower, CanonicalUnit } from './types';

/** Área em m² com 2 casas — mesma régua do plantaAiMaterializeService. */
const m2 = (v: number): number => Math.round(v * 100) / 100;

export async function loadPlantaSide(empreendimento: Empreendimento): Promise<CanonicalSide> {
    if (!empreendimento.planta_ai_study_id) {
        throw new Error('Este empreendimento não está vinculado a um estudo de arquitetura (Planta IA).');
    }

    const { data: study, error: studyErr } = await supabase
        .from('plant_studies')
        .select('id, organization_id, name, selected_scenario_id')
        .eq('id', empreendimento.planta_ai_study_id)
        .maybeSingle();
    if (studyErr) throw new Error(`Falha ao carregar o estudo do Planta IA: ${studyErr.message}`);
    if (!study) throw new Error('Estudo do Planta IA vinculado não foi encontrado.');
    if (study.organization_id !== empreendimento.organization_id) {
        throw new Error('O estudo vinculado pertence a outra organização. Sincronização bloqueada.');
    }

    // A escolha vem de plant_studies.selected_scenario_id, NÃO de plant_scenarios.selected:
    // esse booleano existe na tabela mas nada no app jamais o escreve (nasce false e fica
    // assim) — filtrar por ele nunca retornaria nada.
    if (!study.selected_scenario_id) {
        throw new Error('Nenhum cenário escolhido no estudo. Abra o Planta IA, na aba Cenários, e clique em "Escolher este cenário".');
    }

    const { data: scenarioRows, error: scErr } = await supabase
        .from('plant_scenarios')
        .select('id, study_id, name, scenario_type, status, generation_method, floors_count, units_per_floor, total_units, total_built_area, total_private_area, total_common_area, total_sellable_area, total_parking_spaces, estimated_vgv, estimated_cost, selected, materialized_at, created_at, updated_at')
        .eq('study_id', empreendimento.planta_ai_study_id)
        .eq('id', study.selected_scenario_id);
    if (scErr) throw new Error(`Falha ao carregar cenários: ${scErr.message}`);

    const scenarios = (scenarioRows || []) as PlantScenario[];
    const warnings: string[] = [];
    if (scenarios.length === 0) {
        warnings.push('O cenário escolhido no estudo não foi encontrado — pode ter sido excluído. Escolha outro no Planta IA.');
    }

    const towers: CanonicalTower[] = [];
    const liveUnitSourceIds = new Set<string>();

    for (const sc of scenarios) {
        const plantUnits: (PlantUnit & { _floor_number: number })[] =
            await plantaAiMaterializeService.listUnitsForScenario(sc.id);

        if (plantUnits.length === 0) {
            warnings.push(`Cenário "${sc.name}": ainda não materializado. Clique em "Materializar unidades" no Planta IA — sem isso não há unidades para espelhar.`);
            continue;
        }

        // Custo/preço por m² são derivados: o cenário guarda os totais, a torre guarda a razão.
        const salesPriceSqm = (sc.total_private_area || 0) > 0 ? (sc.estimated_vgv || 0) / (sc.total_private_area || 1) : undefined;
        const costSqm = (sc.total_built_area || 0) > 0 ? (sc.estimated_cost || 0) / (sc.total_built_area || 1) : undefined;

        const units: CanonicalUnit[] = plantUnits.map(pu => {
            liveUnitSourceIds.add(pu.id);
            const priv = pu.private_area ?? 0;
            // Subtração de dois arredondados reintroduz ruído de float (25.87000000000001) —
            // arredondar o resultado, não só as parcelas.
            const common = m2(Math.max(0, (pu.gross_area ?? priv) - priv));

            // Preço-semente só na criação: VGV do cenário ÷ unidades. Estimativa uniforme e
            // grosseira — a partir daí quem manda no preço é o Empreendimento.
            const totalUnits = sc.total_units || plantUnits.length;
            const seedPrice = (sc.estimated_vgv && totalUnits > 0)
                ? Math.round((sc.estimated_vgv / totalUnits) * 100) / 100
                : undefined;

            return {
                sourceId: pu.id,
                fields: {
                    name: `Apto ${pu.unit_code}`,
                    floor: pu._floor_number,
                    typology: pu.unit_type,
                    private_area: priv,
                    common_area: common,
                    total_area: priv + common,
                    bedrooms: pu.bedrooms,
                    bathrooms: pu.bathrooms,
                    parking_spaces: pu.parking_spaces,
                },
                createOnly: {
                    planta_ai_unit_id: pu.id,
                    is_vendavel: true,
                    // O Planta IA é estudo de ARQUITETURA: não tem preço por unidade nem
                    // status de venda. Não há nada do outro lado para sobrescrever — o
                    // comercial é sempre do Empreendimento.
                    ...(seedPrice != null ? { price: seedPrice } : {}),
                    status: 'DISPONIVEL' as UnitStatus,
                } satisfies Partial<EmpreendimentoUnitInsert> as Record<string, unknown>,
            };
        });

        towers.push({
            sourceId: sc.id,
            fields: {
                floors_count: sc.floors_count,
                units_per_floor: sc.units_per_floor,
                construction_cost_sqm: costSqm,
                sales_price_sqm: salesPriceSqm,
            },
            // Sem `name`: o nome do cenário é rótulo de análise. O planner gera "Torre X" na
            // criação e nunca mais toca — nome de torre é dado local.
            createOnly: { planta_ai_scenario_id: sc.id },
            units,
            sourceRaw: sc,
        });
    }

    return {
        origin: 'planta_ai',
        empreendimento,
        towers,
        commonAreaCandidates: [],
        liveTowerSourceIds: new Set(scenarios.map(s => s.id)),
        liveUnitSourceIds,
        warnings,
    };
}
