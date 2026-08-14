// services/maintenanceCatalog.ts
// Catálogo de itens padrão do plano de manutenção predial.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md (F2)
//
// POR QUE ISTO EXISTE: criar um plano entregava um plano VAZIO, e o usuário
// tinha de digitar item por item — na prática, inventar do zero o que a norma
// já diz. Um plano que nasce vazio é um plano que ninguém preenche.
//
// ⚠️ ISTO É PONTO DE PARTIDA, NÃO A NORMA. A NBR 5674 remete ao manual do
// proprietário (NBR 14037) e aos manuais dos fabricantes, e a periodicidade
// real muda por equipamento, idade do edifício e exigência local (o AVCB, por
// exemplo, tem validade diferente por estado). Por isso a tela mostra tudo
// numa prévia com caixas de seleção: o usuário confirma, ajusta e remove o que
// não se aplica — uma galeria sem elevador desmarca o bloco de elevadores.
//
// O catálogo vive em código, não no banco, de propósito: é conhecimento
// versionado junto com a aplicação. Torná-lo editável por organização é passo
// seguinte, quando houver demanda real de customização.

import type { MaintenanceResponsibleType, PeriodicityUnit } from '../types/condominio';

export interface ItemPadrao {
    description: string;
    periodicity_value: number;
    periodicity_unit: PeriodicityUnit;
    responsible_type: MaintenanceResponsibleType;
}

/** Indexado pelo `slug` de `building_systems` — ver o bloco 9 da migration 000018. */
export const CATALOGO_MANUTENCAO: Record<string, ItemPadrao[]> = {
    elevadores: [
        { description: 'Manutenção preventiva por empresa especializada', periodicity_value: 1, periodicity_unit: 'MES', responsible_type: 'EMPRESA_ESPECIALIZADA' },
        { description: 'Inspeção anual de segurança (relatório técnico)', periodicity_value: 1, periodicity_unit: 'ANO', responsible_type: 'EMPRESA_ESPECIALIZADA' },
    ],
    bombas: [
        { description: 'Verificar funcionamento e alternância das bombas', periodicity_value: 1, periodicity_unit: 'MES', responsible_type: 'EQUIPE_LOCAL' },
        { description: 'Manutenção preventiva do conjunto motor-bomba', periodicity_value: 6, periodicity_unit: 'MES', responsible_type: 'EMPRESA_ESPECIALIZADA' },
    ],
    reservatorios: [
        { description: 'Limpeza e desinfecção dos reservatórios', periodicity_value: 6, periodicity_unit: 'MES', responsible_type: 'EMPRESA_ESPECIALIZADA' },
        { description: 'Verificar estanqueidade, tampas e telas de proteção', periodicity_value: 3, periodicity_unit: 'MES', responsible_type: 'EQUIPE_LOCAL' },
    ],
    spda: [
        { description: 'Inspeção visual do SPDA (cabos, conexões, oxidação)', periodicity_value: 6, periodicity_unit: 'MES', responsible_type: 'EQUIPE_LOCAL' },
        { description: 'Medição de continuidade e resistência de aterramento', periodicity_value: 1, periodicity_unit: 'ANO', responsible_type: 'EMPRESA_ESPECIALIZADA' },
    ],
    eletrica: [
        { description: 'Teste dos dispositivos DR (botão de teste)', periodicity_value: 1, periodicity_unit: 'MES', responsible_type: 'EQUIPE_LOCAL' },
        { description: 'Reaperto de conexões e inspeção termográfica dos quadros', periodicity_value: 1, periodicity_unit: 'ANO', responsible_type: 'EMPRESA_ESPECIALIZADA' },
    ],
    hidraulica: [
        { description: 'Verificar vazamentos em prumadas, barriletes e registros', periodicity_value: 3, periodicity_unit: 'MES', responsible_type: 'EQUIPE_LOCAL' },
        { description: 'Limpeza de ralos, calhas e caixas de gordura', periodicity_value: 6, periodicity_unit: 'MES', responsible_type: 'EQUIPE_LOCAL' },
    ],
    incendio: [
        { description: 'Inspeção visual de extintores (lacre, carga, acesso)', periodicity_value: 1, periodicity_unit: 'MES', responsible_type: 'EQUIPE_LOCAL' },
        { description: 'Recarga e teste hidrostático de extintores', periodicity_value: 1, periodicity_unit: 'ANO', responsible_type: 'EMPRESA_ESPECIALIZADA' },
        { description: 'Teste de hidrantes, mangueiras e bomba de incêndio', periodicity_value: 1, periodicity_unit: 'ANO', responsible_type: 'EMPRESA_ESPECIALIZADA' },
        // Validade varia por estado — ajustar conforme a exigência local.
        { description: 'Renovar o AVCB junto ao Corpo de Bombeiros', periodicity_value: 1, periodicity_unit: 'ANO', responsible_type: 'ORGAO_PUBLICO' },
    ],
    gerador: [
        { description: 'Teste de funcionamento (partida e transferência)', periodicity_value: 1, periodicity_unit: 'MES', responsible_type: 'EQUIPE_LOCAL' },
        { description: 'Manutenção preventiva (óleo, filtros, bateria, arrefecimento)', periodicity_value: 6, periodicity_unit: 'MES', responsible_type: 'EMPRESA_ESPECIALIZADA' },
    ],
    portoes: [
        { description: 'Lubrificação, regulagem e teste dos sensores de segurança', periodicity_value: 3, periodicity_unit: 'MES', responsible_type: 'EMPRESA_ESPECIALIZADA' },
    ],
    fachada: [
        { description: 'Inspeção visual da fachada e dos revestimentos', periodicity_value: 1, periodicity_unit: 'ANO', responsible_type: 'EQUIPE_LOCAL' },
        { description: 'Inspeção técnica de fachada (aderência e destacamentos)', periodicity_value: 3, periodicity_unit: 'ANO', responsible_type: 'EMPRESA_ESPECIALIZADA' },
    ],
    impermeabilizacao: [
        { description: 'Inspeção de lajes, calhas, jardineiras e áreas molhadas', periodicity_value: 1, periodicity_unit: 'ANO', responsible_type: 'EQUIPE_LOCAL' },
    ],
    esquadrias: [
        { description: 'Verificar vedação, drenagem e fixação das esquadrias', periodicity_value: 6, periodicity_unit: 'MES', responsible_type: 'EQUIPE_LOCAL' },
        { description: 'Lubrificação de roldanas, dobradiças e fechos', periodicity_value: 1, periodicity_unit: 'ANO', responsible_type: 'EQUIPE_LOCAL' },
    ],
};

/**
 * Primeiro vencimento de um item novo: hoje + a própria periodicidade.
 *
 * Não é `hoje`: um plano recém-criado nasceria com 20 itens vencendo no mesmo
 * dia, o cron dispararia 20 alertas de uma vez e o usuário aprenderia a
 * ignorá-los na primeira semana. Quem sabe que um serviço está atrasado ajusta
 * a data no item — o contrário (descobrir que todos venceram hoje) não tem
 * conserta fácil.
 */
export function primeiroVencimento(item: ItemPadrao, hoje = new Date()): string {
    const d = new Date(hoje.getTime());
    switch (item.periodicity_unit) {
        case 'DIA': d.setDate(d.getDate() + item.periodicity_value); break;
        case 'SEMANA': d.setDate(d.getDate() + item.periodicity_value * 7); break;
        case 'MES': d.setMonth(d.getMonth() + item.periodicity_value); break;
        case 'ANO': d.setFullYear(d.getFullYear() + item.periodicity_value); break;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
