import type { HoldingItem } from '../components/investor/types';

/**
 * Item da carteira do investidor — o que o Resumo e a Carteira (portal e gestor) mostram.
 *
 * Patrimônio = valor do empreendimento × participação do investidor, e só existe com as duas
 * coisas registradas. Até 18/11/2026 a falta de participação valia "100%" ("1x") e a falta de valor
 * caía para área × CUB: o Tiago via R$ 230.000 no Garden Cambuhy = 100 m² (padrão do formulário de
 * projeto) × R$ 2.300 (CUB fixo de MG), sem ter participação nenhuma. Agora é `null` + o motivo.
 */
export const SEM_PARTICIPACAO = 'Participação não registrada';
export const SEM_VALOR_DO_EMPREENDIMENTO = 'Valor do empreendimento não informado';

export interface EmpreendimentoDaCarteira {
    id?: string;
    name: string;
    settings?: {
        financialInfo?: { totalValue?: number | string | null } | null;
        location?: string;
        obraStatus?: string;
        obraProgress?: number;
    } | null;
}

/** O resumo financeiro do investidor naquele empreendimento (montado no InvestorDashboard). */
export interface ParticipacaoDaCarteira {
    ownershipPct: number;
    totalContributed: number;
    roiRealized: (currentValue: number) => number;
}

const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

export function itemDaCarteira(p: EmpreendimentoDaCarteira, participacao?: ParticipacaoDaCarteira): HoldingItem {
    const percentual = participacao?.ownershipPct ?? 0;
    const valorDoEmpreendimento = Number(p.settings?.financialInfo?.totalValue) || 0;
    const semPatrimonio = percentual <= 0 ? SEM_PARTICIPACAO
        : valorDoEmpreendimento <= 0 ? SEM_VALOR_DO_EMPREENDIMENTO
            : undefined;
    const equity = semPatrimonio ? null : valorDoEmpreendimento * (percentual / 100);
    const roi = participacao && equity != null ? participacao.roiRealized(equity) : undefined;
    return {
        id: p.id,
        name: p.name,
        location: p.settings?.location || 'Localização não informada',
        cota: percentual > 0 ? pct(percentual) : '—',
        equity,
        semPatrimonio,
        currentValue: equity ?? undefined,
        invested: participacao?.totalContributed || undefined,
        yoc: roi !== undefined ? roi / 100 : undefined,
        yield: roi !== undefined ? `${roi.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : undefined,
        status: p.settings?.obraStatus || 'Em Andamento',
        progress: p.settings?.obraProgress || 0,
    };
}

/**
 * Soma só o patrimônio conhecido. `total` nulo = nenhum item tem patrimônio (mostrar "—", nunca
 * "R$ 0"); `motivo` = o de todos os itens sem patrimônio, ou um genérico se forem diferentes.
 */
export function totalDaCarteira(itens: Pick<HoldingItem, 'equity' | 'semPatrimonio'>[]): {
    total: number | null; semPatrimonio: number; motivo?: string;
} {
    const conhecidos = itens.filter(h => h.equity != null);
    const sem = itens.filter(h => h.equity == null);
    const motivos = new Set(sem.map(h => h.semPatrimonio ?? SEM_PARTICIPACAO));
    return {
        total: itens.length > 0 && conhecidos.length === 0 ? null : conhecidos.reduce((s, h) => s + (h.equity ?? 0), 0),
        semPatrimonio: sem.length,
        motivo: motivos.size === 0 ? undefined : motivos.size === 1 ? [...motivos][0] : 'Patrimônio não calculado',
    };
}
