import { agruparLinhas, chavePorNome, type ChaveDeGrupo, type DirecaoGrupos, type Grupo } from './agruparLinhas';
import { OBRA_STATUSES } from '../types/project';

/**
 * "Agrupar" de Engenharia › Orçamentos (lista de orçamentos, `ProjectList.tsx`). Mesmo
 * recurso das demais telas (guia de UI §6.12, `agruparLinhas`), com as colunas desta
 * tabela. Função pura: recebe os orçamentos já filtrados e ordenados e devolve os grupos.
 *
 * Só entram colunas que a tabela MOSTRA e que têm UM valor por linha. O rótulo do grupo
 * é o mesmo texto da célula — por isso a tela passa o `leitor` (a célula capitaliza o
 * status, traduz o tipo de obra e calcula o bloqueio em cascata com a obra mestre).
 */

export type CampoAgruparOrcamento = 'status' | 'status-obra' | 'bloqueio' | 'tipo-obra';

export const OPCOES_AGRUPAR_ORCAMENTO: { value: CampoAgruparOrcamento; label: string }[] = [
    { value: 'status', label: 'Status' },
    { value: 'status-obra', label: 'Status Obra' },
    { value: 'bloqueio', label: 'Pedidos' },
    { value: 'tipo-obra', label: 'Tipo de Obra' },
];

/** O que a célula de cada coluna mostra — a tela resolve, o agrupamento só lê. */
export interface LeitorDoOrcamento<T> {
    /** Texto da coluna Status ("Em andamento", "Fechado"). Vazio = sem status. */
    status: (p: T) => string | null | undefined;
    /** Texto da coluna Status Obra (um de OBRA_STATUSES). */
    statusObra: (p: T) => string | null | undefined;
    /** Coluna Pedidos: tem pedido vinculado (por isso não pode ser excluído). */
    bloqueado: (p: T) => boolean;
    /** Rótulo da coluna Tipo de Obra ("Residencial"…). */
    tipoObra: (p: T) => string | null | undefined;
}

const SEM: Record<CampoAgruparOrcamento, string> = {
    status: 'Sem status',
    'status-obra': 'Sem status da obra',
    bloqueio: 'Sem pedidos',
    'tipo-obra': 'Sem tipo de obra',
};

/** Status da obra na ordem do fluxo (Não Iniciado → … → Concluída), não alfabética. */
const ORDEM_STATUS_OBRA = OBRA_STATUSES.map(s => s.toLowerCase());
/** "Com pedidos" primeiro (é o que pede atenção); Decrescente inverte. A chave segue 'bloqueado'/'livre'
 *  (é o que fica gravado no navegador); só o rótulo mudou, para o texto da célula (14/11/2026). */
const ORDEM_BLOQUEIO = ['bloqueado', 'livre'];

export function chaveDoGrupoOrcamento<T>(campo: CampoAgruparOrcamento, p: T, leitor: LeitorDoOrcamento<T>): ChaveDeGrupo {
    switch (campo) {
        case 'status': return chavePorNome(leitor.status(p));
        case 'status-obra': return chavePorNome(leitor.statusObra(p));
        case 'bloqueio': return leitor.bloqueado(p) ? { key: 'bloqueado', label: 'Com pedidos' } : { key: 'livre', label: 'Sem pedidos' };
        case 'tipo-obra': return chavePorNome(leitor.tipoObra(p));
    }
}

export function agruparOrcamentos<T>(
    orcamentos: T[],
    campo: CampoAgruparOrcamento,
    direcao: DirecaoGrupos,
    leitor: LeitorDoOrcamento<T>,
): Grupo<T>[] {
    return agruparLinhas(orcamentos, {
        chave: p => chaveDoGrupoOrcamento(campo, p, leitor),
        semRotulo: SEM[campo],
        ordem: campo === 'status-obra' ? ORDEM_STATUS_OBRA : campo === 'bloqueio' ? ORDEM_BLOQUEIO : 'rotulo',
        direcao,
    });
}
