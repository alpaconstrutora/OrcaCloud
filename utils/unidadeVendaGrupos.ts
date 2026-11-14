import { agruparLinhas, chavePorNome, type DirecaoGrupos, type Grupo } from './agruparLinhas';

/**
 * "Agrupar" de Venda de Ativos › Unidades do edifício (`SalesModule.tsx`, modo lista com
 * um edifício aberto). Mesmo recurso das demais telas (guia de UI §6.12, `agruparLinhas`).
 * Função pura: recebe as unidades já filtradas e ordenadas e devolve os grupos.
 *
 * Só entram colunas que a tabela MOSTRA e que têm UM valor por linha: Bloco, Andar e
 * Status. O rótulo é o mesmo texto da célula — a tela passa o `leitor` (o status da
 * unidade é a etapa da negociação que a ocupa, que só a tela conhece). Total do grupo =
 * soma do Preço (é a coluna de dinheiro da tabela).
 */

export type CampoAgruparUnidadeVenda = 'bloco' | 'andar' | 'status';

export const OPCOES_AGRUPAR_UNIDADE_VENDA: { value: CampoAgruparUnidadeVenda; label: string }[] = [
    { value: 'bloco', label: 'Bloco' },
    { value: 'andar', label: 'Andar' },
    { value: 'status', label: 'Status' },
];

export interface LeitorDaUnidadeVenda<T> {
    bloco: (u: T) => string | null | undefined;
    /** Número do andar como a célula lê: `null`/0 = térreo. */
    andar: (u: T) => number | null | undefined;
    /** Texto da coluna Status ("Disponível", "Contrato"…). */
    status: (u: T) => string | null | undefined;
    preco: (u: T) => number | null | undefined;
}

const SEM: Record<CampoAgruparUnidadeVenda, string> = {
    bloco: 'Sem bloco',
    andar: 'Sem andar',
    status: 'Sem status',
};

/**
 * Status na ordem do fluxo: livre → etapas da negociação (Proposta a Concluído) → os
 * rótulos do cadastro quando não há negociação ativa. Rótulo fora da lista vai ao fim.
 */
const ORDEM_STATUS = [
    'disponível', 'proposta', 'aprovação', 'reserva', 'contrato', 'assinatura', 'concluído',
    'reservado', 'vendido', 'permutado', 'alugado',
];

/** Mesmo texto da célula Andar: "Térreo" para 0/vazio, senão "3º". */
export const rotuloDoAndar = (andar: number | null | undefined): string =>
    andar ? `${andar}º` : 'Térreo';

export function agruparUnidadesVenda<T>(
    unidades: T[],
    campo: CampoAgruparUnidadeVenda,
    direcao: DirecaoGrupos,
    leitor: LeitorDaUnidadeVenda<T>,
): Grupo<T>[] {
    if (campo === 'andar') {
        // Ordem numérica (subsolo < térreo < 1º < 10º), não alfabética.
        const num = (u: T) => Number(leitor.andar(u)) || 0;
        const ordem = [...new Set(unidades.map(num))].sort((a, b) => a - b).map(String);
        return agruparLinhas(unidades, {
            chave: u => ({ key: String(num(u)), label: rotuloDoAndar(num(u)) }),
            semRotulo: SEM.andar,
            ordem,
            direcao,
            valor: leitor.preco,
        });
    }
    return agruparLinhas(unidades, {
        chave: u => chavePorNome(campo === 'bloco' ? leitor.bloco(u) : leitor.status(u)),
        semRotulo: SEM[campo],
        ordem: campo === 'status' ? ORDEM_STATUS : 'rotulo',
        direcao,
        valor: leitor.preco,
    });
}
