import type { BankTransaction, InternalTransaction } from '../types';
import { agruparLinhas, chavePorMes, chavePorNome, type ChaveDeGrupo, type DirecaoGrupos, type Grupo } from './agruparLinhas';

/**
 * "Agrupar" da aba Pendentes da Conciliação Bancária — as duas tabelas (Extrato e
 * Lançamentos). Mesmo recurso das demais telas (guia de UI §6.12, `agruparLinhas`),
 * com as chaves destas tabelas. Função pura: a tela passa os nomes que as células
 * mostram (obra, centro de custo, parte) e recebe os grupos prontos, sobre a lista
 * já filtrada e ordenada.
 *
 * Total do grupo = SALDO (entradas − saídas): o extrato e os lançamentos misturam
 * créditos e débitos, e somar tudo em módulo daria um número sem sentido.
 */

export type CampoAgruparExtrato = 'contraparte' | 'categoria' | 'obra' | 'centro_custo' | 'data';
export type CampoAgruparLancamento = 'parte' | 'categoria' | 'obra' | 'centro_custo' | 'data';

export const OPCOES_AGRUPAR_EXTRATO: { value: CampoAgruparExtrato; label: string }[] = [
    { value: 'contraparte', label: 'Contraparte' },
    { value: 'categoria', label: 'Categoria' },
    { value: 'obra', label: 'Obra' },
    { value: 'centro_custo', label: 'Centro de Custo' },
    { value: 'data', label: 'Data (mês)' },
];

export const OPCOES_AGRUPAR_LANCAMENTO: { value: CampoAgruparLancamento; label: string }[] = [
    { value: 'parte', label: 'Cliente / Credor' },
    { value: 'categoria', label: 'Categoria' },
    { value: 'obra', label: 'Obra' },
    { value: 'centro_custo', label: 'Centro de Custo' },
    { value: 'data', label: 'Data (mês)' },
];

const SEM = {
    contraparte: 'Sem cliente/credor',
    parte: 'Sem cliente/credor',
    categoria: 'Sem categoria',
    obra: 'Sem obra',
    centro_custo: 'Sem centro de custo',
    data: 'Sem data',
} as const;

/** Texto que as células mostram — a tela resolve (o id vira nome; obra de outra org vira o rótulo dela). */
export interface NomesDoExtrato {
    obra: (tx: BankTransaction) => string | null;
    centroCusto: (tx: BankTransaction) => string | null;
}

export interface NomesDoLancamento {
    parte: (tx: InternalTransaction) => string | null;
    obra: (tx: InternalTransaction) => string | null;
    centroCusto: (tx: InternalTransaction) => string | null;
    /** Data que a coluna Data mostra (pode ser o vencimento, não `transaction_date`). */
    data: (tx: InternalTransaction) => string | null;
}

/** Crédito soma, débito subtrai. */
const saldo = (direction: 'CREDIT' | 'DEBIT', valor: number) => (direction === 'DEBIT' ? -1 : 1) * (Number(valor) || 0);

export function agruparExtrato(
    linhas: BankTransaction[],
    campo: CampoAgruparExtrato,
    nomes: NomesDoExtrato,
    direcao: DirecaoGrupos = 'asc',
): Grupo<BankTransaction>[] {
    const chave = (tx: BankTransaction): ChaveDeGrupo => {
        switch (campo) {
            case 'contraparte': return chavePorNome(tx.counterparty_name);
            case 'categoria': return chavePorNome(tx.category);
            case 'obra': return chavePorNome(nomes.obra(tx));
            case 'centro_custo': return chavePorNome(nomes.centroCusto(tx));
            case 'data': return chavePorMes(tx.transaction_date);
        }
    };
    return agruparLinhas(linhas, {
        chave,
        semRotulo: SEM[campo],
        valor: tx => saldo(tx.direction, tx.amount),
        ordem: campo === 'data' ? 'chave' : 'rotulo',
        direcao,
    });
}

export function agruparLancamentos(
    linhas: InternalTransaction[],
    campo: CampoAgruparLancamento,
    nomes: NomesDoLancamento,
    /** Valor que a coluna Valor mostra (o líquido, quando o cliente retém tributo). */
    valorDe: (tx: InternalTransaction) => number,
    direcao: DirecaoGrupos = 'asc',
): Grupo<InternalTransaction>[] {
    const chave = (tx: InternalTransaction): ChaveDeGrupo => {
        switch (campo) {
            case 'parte': return chavePorNome(nomes.parte(tx));
            case 'categoria': return chavePorNome(tx.category);
            case 'obra': return chavePorNome(nomes.obra(tx));
            case 'centro_custo': return chavePorNome(nomes.centroCusto(tx));
            case 'data': return chavePorMes(nomes.data(tx));
        }
    };
    return agruparLinhas(linhas, {
        chave,
        semRotulo: SEM[campo],
        valor: tx => saldo(tx.direction, valorDe(tx)),
        ordem: campo === 'data' ? 'chave' : 'rotulo',
        direcao,
    });
}

/** Explica o total do grupo no `title` — o usuário vê um número com sinal e precisa saber o que é. */
export const TITULO_SALDO_DO_GRUPO = 'Saldo do grupo: entradas menos saídas';
