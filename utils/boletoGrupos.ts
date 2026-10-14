import type { Boleto, BoletoStatus } from '../types';
import { STATUS_LABELS } from './boletoStatus';

/**
 * "Agrupar" de Boletos a Pagar — o mesmo recurso de Minhas Tarefas
 * (components/TasksList.tsx), com total por grupo. Função pura: a tela passa os
 * resolvedores de nome (os MESMOS que as colunas usam) e recebe os grupos prontos.
 */
export type CampoAgrupar = 'none' | 'status' | 'fornecedor' | 'obra' | 'centro_custo' | 'vencimento' | 'capturado_por';

export const OPCOES_AGRUPAR: { value: Exclude<CampoAgrupar, 'none'>; label: string }[] = [
    { value: 'status', label: 'Status' },
    { value: 'fornecedor', label: 'Fornecedor' },
    { value: 'obra', label: 'Obra' },
    { value: 'centro_custo', label: 'Centro de Custo' },
    { value: 'vencimento', label: 'Vencimento (mês)' },
    { value: 'capturado_por', label: 'Capturado por' },
];

export interface ResolvedoresGrupo {
    fornecedor: (b: Boleto) => string | null | undefined;
    obra: (b: Boleto) => string | null | undefined;
    centroCusto: (b: Boleto) => string | null | undefined;
    capturadoPor: (b: Boleto) => string | null | undefined;
}

export interface GrupoBoletos {
    key: string;
    label: string;
    itens: Boleto[];
    /** Soma de `valor` dos boletos do grupo. */
    total: number;
}

const SEM: Record<Exclude<CampoAgrupar, 'none'>, string> = {
    status: 'Sem status',
    fornecedor: 'Sem fornecedor',
    obra: 'Sem obra',
    centro_custo: 'Sem centro de custo',
    vencimento: 'Sem vencimento',
    capturado_por: 'Sem responsável pela captura',
};

const VAZIO = '__vazio__';
const ORDEM_STATUS = Object.keys(STATUS_LABELS) as BoletoStatus[];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** "2026-07" → "Julho/2026". */
export function rotuloMes(anoMes: string): string {
    const [a, m] = anoMes.split('-');
    const i = Number(m) - 1;
    return MESES[i] ? `${MESES[i]}/${a}` : anoMes;
}

function chaveERotulo(b: Boleto, campo: Exclude<CampoAgrupar, 'none'>, r: ResolvedoresGrupo): [string, string] {
    const nome = (v: string | null | undefined): [string, string] => {
        const t = (v ?? '').trim();
        return t ? [t.toLowerCase(), t] : [VAZIO, SEM[campo]];
    };
    switch (campo) {
        case 'status': return b.status ? [b.status, STATUS_LABELS[b.status] ?? b.status] : [VAZIO, SEM.status];
        case 'fornecedor': return nome(r.fornecedor(b));
        case 'obra': return nome(r.obra(b));
        case 'centro_custo': return nome(r.centroCusto(b));
        case 'capturado_por': return nome(r.capturadoPor(b));
        case 'vencimento': {
            const am = (b.vencimento ?? '').slice(0, 7);
            return /^\d{4}-\d{2}$/.test(am) ? [am, rotuloMes(am)] : [VAZIO, SEM.vencimento];
        }
    }
}

/**
 * Agrupa mantendo a ordem da lista recebida (que já vem ordenada pela coluna escolhida):
 * grupos na ordem da 1ª aparição; status na ordem do fluxo; vencimento cronológico.
 * O grupo "Sem …" vai sempre por último.
 */
export function agruparBoletos(boletos: Boleto[], campo: CampoAgrupar, r: ResolvedoresGrupo): GrupoBoletos[] {
    if (campo === 'none') return [{ key: 'todos', label: '', itens: boletos, total: soma(boletos) }];

    const mapa = new Map<string, GrupoBoletos>();
    for (const b of boletos) {
        const [key, label] = chaveERotulo(b, campo, r);
        let g = mapa.get(key);
        if (!g) { g = { key, label, itens: [], total: 0 }; mapa.set(key, g); }
        g.itens.push(b);
        g.total += Number(b.valor) || 0;
    }

    const grupos = [...mapa.values()];
    if (campo === 'status') {
        grupos.sort((a, b) => ordemStatus(a.key) - ordemStatus(b.key));
    } else if (campo === 'vencimento') {
        grupos.sort((a, b) => a.key.localeCompare(b.key));
    }
    const semValor = grupos.filter(g => g.key === VAZIO);
    return [...grupos.filter(g => g.key !== VAZIO), ...semValor];
}

function ordemStatus(key: string): number {
    const i = ORDEM_STATUS.indexOf(key as BoletoStatus);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

function soma(bs: Boleto[]): number {
    return bs.reduce((s, b) => s + (Number(b.valor) || 0), 0);
}
