// types/regulatoryMap.ts
//
// Cadastro de Mapas Regulatórios por cidade (Incorporação) — migration
// 20270819000005. Cada mapa pertence a uma cidade (master_cities) e tem N zonas
// (mesmo shape de EmpreendimentoRegulatoryZone). O empreendimento importa/copia
// zonas daqui em vez de digitar tudo manualmente.

export type RegulatoryMapStatus = 'ATIVO' | 'RASCUNHO' | 'ARQUIVADO';

export interface RegulatoryMap {
    id: string;
    organization_id: string;
    city_id: string;
    name: string;
    lei_referencia?: string;
    status: RegulatoryMapStatus;
    observacoes?: string;
    created_at: string;
    updated_at: string;
}

export type RegulatoryMapInsert = Omit<RegulatoryMap, 'id' | 'created_at' | 'updated_at'>;
export type RegulatoryMapUpdate = Partial<RegulatoryMapInsert>;

// Cidade resolvida junto (join com master_cities/master_states) — usada nas telas de lista.
export type RegulatoryMapWithCity = RegulatoryMap & {
    city_name?: string;
    state_code?: string;
};

// 21 parâmetros urbanísticos por zona — mesmo shape de EmpreendimentoRegulatoryZone
// (types/empreendimento.ts), só que preso ao mapa da cidade em vez do empreendimento.
export interface RegulatoryMapZone {
    id: string;
    regulatory_map_id: string;
    organization_id: string;
    macroarea?: string;
    zona?: string;
    ca_minimo?: string;
    ca_basico?: string;
    ca_maximo?: string;
    taxa_ocupacao_maxima?: string;
    taxa_permeabilidade_minima?: string;
    gabarito_altura_maxima?: string;
    uso_permitido?: string;
    recuo_frente?: string;
    recuo_fundos?: string;
    recuo_lateral_direita?: string;
    recuo_lateral_esquerda?: string;
    gabarito_pavimentos?: string;
    regra_vagas?: string;
    vagas_por_unidade?: string;
    area_minima_unidade?: string;
    lei_referencia?: string;
    documento_fonte?: string;
    nivel_confianca?: string;
    observacoes?: string;
    sort_order?: number;
    created_at: string;
    updated_at: string;
}

export type RegulatoryMapZoneInsert = Omit<RegulatoryMapZone, 'id' | 'created_at' | 'updated_at'>;
export type RegulatoryMapZoneUpdate = Partial<RegulatoryMapZoneInsert>;
