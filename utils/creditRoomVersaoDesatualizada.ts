/**
 * O cadastro do Credit Room mudou depois da versão ativa?
 *
 * As abas Visão, Capacidade e Empreendimentos mostram a VERSÃO CONGELADA (é o
 * que a instituição vê), não o cadastro de hoje. Quem marca empreendimentos ou
 * troca parâmetros depois de congelar não vê efeito nenhum até congelar de
 * novo — e lia isso como "o filtro não funciona" (22/11/2026, CR-00002: V1
 * congelada às 19:27 com 11 empreendimentos, seleção de 4 salva às 19:29).
 *
 * Compara só o que o congelamento usa e a versão guarda. Versão schema 1 (sem
 * capacidade) fica de fora: as abas novas já pedem para congelar uma nova.
 * Limite conhecido: "todos marcados" (lista vazia) depois de uma versão com
 * filtro não é detectável — a versão não guarda a lista completa do escopo.
 */
import { round2 } from './financialMath';
import { PARAMETROS_CAPACIDADE_PADRAO, parametrosEfetivos, type ParametrosCapacidade } from './creditCapacity';
import type { CreditRoom, CreditRoomVersion } from '../types/creditRoom';

export type MudancaDesdeAVersao = 'empreendimentos' | 'escopo' | 'parametros' | 'valor' | 'fluxos';

export const MUDANCA_PT: Record<MudancaDesdeAVersao, string> = {
    empreendimentos: 'empreendimentos da capacidade',
    escopo: 'escopo da renda',
    parametros: 'parâmetros da capacidade',
    valor: 'valor solicitado',
    fluxos: 'fluxos que entram no DSCR',
};

const mesmoConjunto = (a: string[], b: string[]): boolean => {
    const sa = new Set(a);
    const sb = new Set(b);
    return sa.size === sb.size && [...sa].every(x => sb.has(x));
};

const CAMPOS_PARAMETROS: (keyof ParametrosCapacidade)[] = [
    'dscr_minimo', 'taxa_mensal_pct', 'prazo_meses', 'carencia_meses',
    'sistema', 'horizonte_meses', 'haircut_estoque_pct', 'despesa_operacional',
];

/** Os parâmetros que o congelamento usaria hoje (mesma conta do `freezeVersion`). */
function parametrosDeHoje(room: CreditRoom): ParametrosCapacidade {
    const p = parametrosEfetivos(room.parametrosCapacidade ?? PARAMETROS_CAPACIDADE_PADRAO, room.termMonths, room.graceMonths);
    return { ...p, horizonte_meses: p.horizonte_meses > 0 ? p.horizonte_meses : PARAMETROS_CAPACIDADE_PADRAO.horizonte_meses };
}

export function mudancasDesdeAVersao(room: CreditRoom, versao: CreditRoomVersion | null | undefined): MudancaDesdeAVersao[] {
    const s = versao?.snapshot;
    if (!s || !s.capacidade) return [];
    const out: MudancaDesdeAVersao[] = [];

    if (round2(room.requestedAmount ?? 0) !== round2(s.operacao.requested_amount ?? 0)) out.push('valor');

    const f = s.operacao.eligible_flows;
    if (!!room.eligibleFlows.noi !== !!f.noi || !!room.eligibleFlows.receivables !== !!f.receivables
        || !!room.eligibleFlows.operating_cash !== !!f.operating_cash) out.push('fluxos');

    if (s.escopo) {
        const orgsDaVersao = s.escopo.organizacoes.map(o => o.id);
        const orgsDeHoje = room.escopo === 'GRUPO'
            ? [...new Set([room.organizationId, ...room.grupoOrganizationIds])]
            : [room.organizationId];
        if (s.escopo.tipo !== room.escopo || !mesmoConjunto(orgsDaVersao, orgsDeHoje)) out.push('escopo');
    }

    if (room.empreendimentoIds.length > 0 && s.empreendimentos) {
        if (!mesmoConjunto(s.empreendimentos.map(e => e.id), room.empreendimentoIds)) out.push('empreendimentos');
    }

    const hoje = parametrosDeHoje(room);
    const congelado = s.capacidade.parametros;
    if (CAMPOS_PARAMETROS.some(k => hoje[k] !== congelado[k])) out.push('parametros');

    return out;
}
