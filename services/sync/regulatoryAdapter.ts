// services/sync/regulatoryAdapter.ts
//
// Converte a zona do Mapa Regulatório compartilhado (EmpreendimentoRegulatoryZone, texto em
// formato BR — "0,8", "N.A.") para o formato numérico que o motor de geração da Planta espera
// (PlantUrbanRuleset). Existe porque a aba "Regras" da Planta era um formulário PRÓPRIO sobre
// plant_urban_rulesets com os MESMOS 11 campos que já existem no Mapa Regulatório — dado
// duplicado, editável em dois lugares sem nunca sincronizar (achado do usuário, 2026-07-17).
//
// A aba "Regras" foi removida; o motor passa a consumir o Mapa Regulatório direto. Esta função
// só converte o formato — study_id/id do resultado são sintéticos (nunca lidos pelo motor).

import { EmpreendimentoRegulatoryZone } from '../../types/empreendimento';
import { PlantUrbanRuleset } from '../../types/plantaAi';
import { lerValorRegulatorio } from '../../utils/regulatoryValue';

/**
 * Número em formato BR ("0,8" → 0.8), no formato que o motor espera (`undefined`
 * quando não há valor, não `null`).
 *
 * A regra em si vive em `utils/regulatoryValue.ts` — era daqui que ela vinha, e
 * saiu para parar de existir em cinco cópias divergentes (ver o cabeçalho de
 * lá). Duas diferenças herdadas da mudança, as duas para melhor: "N.A." agora é
 * reconhecido em qualquer caixa, e string que só COMEÇA com número ("5 a 7")
 * deixa de virar `5` calado e passa a ser "sem valor".
 *
 * ⚠️ Deliberadamente NÃO usa `lerPorcentagem` aqui. `plantaAiEngine` divide
 * `occupancy_rate` por 100, então uma zona gravada como fração ('0,8') já entra
 * errada no motor hoje — bug real e anterior a este arquivo. Corrigi-lo é mexer
 * no comportamento do Planta AI v1, que não está sob teste nesta frente;
 * trocar a semântica de passagem aqui seria fazer isso de lado, sem medir.
 */
function regNum(v?: string): number | undefined {
    return lerValorRegulatorio(v) ?? undefined;
}

const CONFIDENCE_LEVELS = ['Baixo', 'Médio', 'Alto', 'Validado por profissional', 'Validado na prefeitura'] as const;
function regConfidence(v?: string): PlantUrbanRuleset['confidence_level'] {
    return (CONFIDENCE_LEVELS as readonly string[]).includes(v ?? '')
        ? (v as PlantUrbanRuleset['confidence_level'])
        : 'Baixo';
}

/** null se não houver zona (empreendimento sem regulatório) — o motor trata como "sem regras". */
export function zoneToUrbanRuleset(zone: EmpreendimentoRegulatoryZone | undefined, studyId: string): PlantUrbanRuleset | null {
    if (!zone) return null;
    return {
        id: zone.id,
        study_id: studyId,
        zone_name: zone.zona || undefined,
        allowed_use: zone.uso_permitido || 'Residencial Multifamiliar',
        occupancy_rate: regNum(zone.taxa_ocupacao_maxima),
        floor_area_ratio_basic: regNum(zone.ca_basico),
        floor_area_ratio_max: regNum(zone.ca_maximo),
        permeability_rate: regNum(zone.taxa_permeabilidade_minima),
        front_setback: regNum(zone.recuo_frente),
        left_setback: regNum(zone.recuo_lateral_esquerda),
        right_setback: regNum(zone.recuo_lateral_direita),
        rear_setback: regNum(zone.recuo_fundos),
        max_floors: regNum(zone.gabarito_pavimentos),
        max_height: regNum(zone.gabarito_altura_maxima),
        parking_rule_type: zone.regra_vagas || undefined,
        parking_spaces_per_unit: regNum(zone.vagas_por_unidade),
        min_unit_area: regNum(zone.area_minima_unidade),
        law_reference: zone.lei_referencia || undefined,
        source_document: zone.documento_fonte || undefined,
        confidence_level: regConfidence(zone.nivel_confianca),
        notes: zone.observacoes || undefined,
        created_at: zone.created_at,
        updated_at: zone.updated_at,
    };
}
