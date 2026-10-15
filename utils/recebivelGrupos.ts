import type { Receivable } from '../types/financial';
import { agruparLinhas, chavePorMes, chavePorNome, chavePorRotulo, type ChaveDeGrupo, type Grupo } from './agruparLinhas';

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

export type GrupoRecebiveis<T> = Grupo<T>;

const SEM: Record<Exclude<CampoAgruparRecebivel, 'none'>, string> = {
    status: 'Sem status',
    cliente: 'Sem cliente',
    empreendimento: 'Sem empreendimento',
    obra: 'Sem obra',
    centro_custo: 'Sem centro de custo',
    plano_contas: 'Sem plano de contas',
    vencimento: 'Sem vencimento',
};

/**
 * Agrupa mantendo a ordem da lista recebida (que já vem ordenada pela coluna escolhida):
 * grupos na ordem da 1ª aparição; status na ordem do mapa de rótulos da tela;
 * vencimento cronológico. O grupo "Sem …" vai sempre por último.
 * Casca de `agruparLinhas` (utils/agruparLinhas.ts) com as chaves desta tela.
 */
export function agruparRecebiveis<T extends LinhaAgrupavel>(
    linhas: T[],
    campo: CampoAgruparRecebivel,
    rotulosStatus: Record<string, string>,
): GrupoRecebiveis<T>[] {
    if (campo === 'none') return [{ key: 'todos', label: '', itens: linhas, total: linhas.reduce((s, r) => s + (Number(r.amount) || 0), 0) }];
    const chave = (r: T): ChaveDeGrupo => {
        switch (campo) {
            case 'status': return chavePorRotulo(r.effective_status, rotulosStatus);
            case 'cliente': return chavePorNome(r.party_name);
            case 'empreendimento': return chavePorNome(r.empreendimento_name);
            case 'obra': return chavePorNome(r.project_name);
            case 'centro_custo': return chavePorNome(r.cost_center_name);
            case 'plano_contas': return chavePorNome(r.plano_de_contas_name);
            case 'vencimento': return chavePorMes(r.due_date);
        }
    };
    return agruparLinhas(linhas, {
        chave,
        semRotulo: SEM[campo],
        valor: r => r.amount,
        ordem: campo === 'status' ? Object.keys(rotulosStatus) : campo === 'vencimento' ? 'chave' : 'aparicao',
    });
}
