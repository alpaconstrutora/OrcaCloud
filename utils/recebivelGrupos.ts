import type { Receivable } from '../types/financial';
import { rotuloMes } from './boletoGrupos';

/**
 * "Agrupar" de Contas a Receber — o mesmo recurso de Boletos a Pagar
 * (utils/boletoGrupos.ts) e de Minhas Tarefas (components/TasksList.tsx), com
 * total por grupo. Função pura: a tela passa as linhas já com os nomes de CC e
 * Plano de Contas resolvidos (os MESMOS que as colunas mostram) e o mapa de
 * rótulos de status da tela, e recebe os grupos prontos.
 */
export type CampoAgruparRecebivel =
    | 'none' | 'status' | 'cliente' | 'empreendimento' | 'obra' | 'centro_custo' | 'plano_contas' | 'vencimento';

export const OPCOES_AGRUPAR_RECEBIVEL: { value: Exclude<CampoAgruparRecebivel, 'none'>; label: string }[] = [
    { value: 'status', label: 'Status' },
    { value: 'cliente', label: 'Cliente / Parte' },
    { value: 'empreendimento', label: 'Empreendimento' },
    { value: 'obra', label: 'Obra' },
    { value: 'centro_custo', label: 'Centro de Custo' },
    { value: 'plano_contas', label: 'Plano de Contas' },
    { value: 'vencimento', label: 'Vencimento (mês)' },
];

/** O que a função lê de cada linha — `Receivable` com os nomes que a tela resolve. */
export type LinhaAgrupavel = Pick<Receivable,
    'effective_status' | 'party_name' | 'empreendimento_name' | 'project_name' | 'due_date' | 'amount'
> & { cost_center_name?: string; plano_de_contas_name?: string };

export interface GrupoRecebiveis<T> {
    key: string;
    label: string;
    itens: T[];
    /** Soma do valor bruto (`amount`) dos títulos do grupo. */
    total: number;
}

const SEM: Record<Exclude<CampoAgruparRecebivel, 'none'>, string> = {
    status: 'Sem status',
    cliente: 'Sem cliente',
    empreendimento: 'Sem empreendimento',
    obra: 'Sem obra',
    centro_custo: 'Sem centro de custo',
    plano_contas: 'Sem plano de contas',
    vencimento: 'Sem vencimento',
};

const VAZIO = '__vazio__';

function chaveERotulo(
    r: LinhaAgrupavel,
    campo: Exclude<CampoAgruparRecebivel, 'none'>,
    rotulosStatus: Record<string, string>,
): [string, string] {
    const nome = (v: string | null | undefined): [string, string] => {
        const t = (v ?? '').trim();
        return t ? [t.toLowerCase(), t] : [VAZIO, SEM[campo]];
    };
    switch (campo) {
        case 'status':
            return r.effective_status ? [r.effective_status, rotulosStatus[r.effective_status] ?? r.effective_status] : [VAZIO, SEM.status];
        case 'cliente': return nome(r.party_name);
        case 'empreendimento': return nome(r.empreendimento_name);
        case 'obra': return nome(r.project_name);
        case 'centro_custo': return nome(r.cost_center_name);
        case 'plano_contas': return nome(r.plano_de_contas_name);
        case 'vencimento': {
            const am = (r.due_date ?? '').slice(0, 7);
            return /^\d{4}-\d{2}$/.test(am) ? [am, rotuloMes(am)] : [VAZIO, SEM.vencimento];
        }
    }
}

/**
 * Agrupa mantendo a ordem da lista recebida (que já vem ordenada pela coluna escolhida):
 * grupos na ordem da 1ª aparição; status na ordem do mapa de rótulos da tela;
 * vencimento cronológico. O grupo "Sem …" vai sempre por último.
 */
export function agruparRecebiveis<T extends LinhaAgrupavel>(
    linhas: T[],
    campo: CampoAgruparRecebivel,
    rotulosStatus: Record<string, string>,
): GrupoRecebiveis<T>[] {
    if (campo === 'none') return [{ key: 'todos', label: '', itens: linhas, total: soma(linhas) }];

    const mapa = new Map<string, GrupoRecebiveis<T>>();
    for (const r of linhas) {
        const [key, label] = chaveERotulo(r, campo, rotulosStatus);
        let g = mapa.get(key);
        if (!g) { g = { key, label, itens: [], total: 0 }; mapa.set(key, g); }
        g.itens.push(r);
        g.total += Number(r.amount) || 0;
    }

    const grupos = [...mapa.values()];
    if (campo === 'status') {
        const ordem = Object.keys(rotulosStatus);
        const pos = (k: string) => { const i = ordem.indexOf(k); return i === -1 ? Number.MAX_SAFE_INTEGER : i; };
        grupos.sort((a, b) => pos(a.key) - pos(b.key));
    } else if (campo === 'vencimento') {
        grupos.sort((a, b) => a.key.localeCompare(b.key));
    }
    const semValor = grupos.filter(g => g.key === VAZIO);
    return [...grupos.filter(g => g.key !== VAZIO), ...semValor];
}

function soma(rs: LinhaAgrupavel[]): number {
    return rs.reduce((s, r) => s + (Number(r.amount) || 0), 0);
}
