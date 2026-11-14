import { agruparLinhas, chavePorNome, type ChaveDeGrupo, type DirecaoGrupos, type Grupo } from './agruparLinhas';

/**
 * "Agrupar" de Minha Organização › Contas de Pagamento. Mesmo recurso das demais telas
 * (guia de UI §6.12, `agruparLinhas`), com as chaves desta tabela. Função pura: recebe as
 * contas já filtradas e ordenadas e devolve os grupos prontos.
 *
 * Só entram campos que a tabela MOSTRA e que têm UM valor por linha — a chave é o mesmo
 * texto da célula. Nome e código ficam de fora (um grupo por conta não agrupa nada).
 */

export type CampoAgruparConta = 'organizacao' | 'banco' | 'situacao';

export const OPCOES_AGRUPAR_CONTA: { value: CampoAgruparConta; label: string }[] = [
    { value: 'organizacao', label: 'Organização' },
    { value: 'banco', label: 'Banco' },
    { value: 'situacao', label: 'Situação' },
];

/** Só o que o agrupamento lê de uma conta. */
export interface ContaAgrupavel {
    organization_id?: string;
    bank?: string;
    /** Ausente = ativa (mesma leitura do interruptor Ativa/Inativa da coluna Ações). */
    is_active?: boolean;
}

const SEM: Record<CampoAgruparConta, string> = {
    organizacao: 'Sem organização',
    banco: 'Sem banco',
    situacao: 'Sem situação',
};

/** Rótulos do interruptor da coluna Ações — o grupo diz o mesmo que a tela. */
const ROTULO_SITUACAO: Record<'ativa' | 'inativa', string> = { ativa: 'Ativa', inativa: 'Inativa' };
/** Ativas primeiro; Decrescente inverte. */
const ORDEM_SITUACAO = ['ativa', 'inativa'];

export function chaveDoGrupoConta(
    campo: CampoAgruparConta,
    conta: ContaAgrupavel,
    nomeDaOrganizacao: (organizationId: string | undefined) => string | undefined,
): ChaveDeGrupo {
    switch (campo) {
        case 'organizacao': {
            // A chave é o id (duas organizações podem ter o mesmo nome); o rótulo é o que a célula mostra.
            const nome = nomeDaOrganizacao(conta.organization_id);
            return conta.organization_id && nome ? { key: conta.organization_id, label: nome } : null;
        }
        case 'banco': return chavePorNome(conta.bank);
        case 'situacao': {
            const s = conta.is_active === false ? 'inativa' : 'ativa';
            return { key: s, label: ROTULO_SITUACAO[s] };
        }
    }
}

export function agruparContasPagamento<T extends ContaAgrupavel>(
    contas: T[],
    campo: CampoAgruparConta,
    direcao: DirecaoGrupos,
    nomeDaOrganizacao: (organizationId: string | undefined) => string | undefined,
): Grupo<T>[] {
    return agruparLinhas(contas, {
        chave: c => chaveDoGrupoConta(campo, c, nomeDaOrganizacao),
        semRotulo: SEM[campo],
        ordem: campo === 'situacao' ? ORDEM_SITUACAO : 'rotulo',
        direcao,
    });
}
