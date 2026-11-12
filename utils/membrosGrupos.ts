import type { OrganizationCustomRole, OrganizationMember, OrganizationRole } from '../types';
import { agruparLinhas, chavePorMes, chavePorNome, type ChaveDeGrupo, type DirecaoGrupos, type Grupo } from './agruparLinhas';

/**
 * "Agrupar" da aba Membros (Minha Organização › Usuários). Mesmo recurso das demais
 * telas (guia de UI §6.12, `agruparLinhas`), com as chaves desta tabela. Função pura:
 * recebe os membros já filtrados e ordenados e devolve os grupos prontos.
 *
 * Só entram campos que a tabela MOSTRA e que têm UM valor por linha — a chave é o
 * mesmo texto da célula. Nome e e-mail ficam de fora (um grupo por pessoa não agrupa nada).
 */

export type CampoAgruparMembro = 'funcao' | 'cargo' | 'entrada';

export const OPCOES_AGRUPAR_MEMBRO: { value: CampoAgruparMembro; label: string }[] = [
    { value: 'funcao', label: 'Função' },
    { value: 'cargo', label: 'Cargo' },
    { value: 'entrada', label: 'Entrou em (mês)' },
];

/** Rótulo da função — o mesmo das opções do select da coluna "Função / Cargo".
 *  `owner` não tem opção no select (a coluna não o edita); no grupo ele precisa de nome. */
export const ROTULO_FUNCAO: Record<OrganizationRole, string> = {
    owner: 'Proprietário',
    admin: 'Admin',
    member: 'Membro',
    viewer: 'Visitante',
};

/** Hierarquia, não alfabética: Proprietário → Admin → Membro → Visitante (Decrescente inverte). */
const ORDEM_FUNCAO: string[] = ['owner', 'admin', 'member', 'viewer'];

const SEM: Record<CampoAgruparMembro, string> = {
    funcao: 'Sem função',
    cargo: 'Sem cargo',
    entrada: 'Sem data de entrada',
};

/** Nome que a célula mostra: o cargo customizado, ou "Customizado" quando o id não está na lista. */
function nomeDoCargo(m: OrganizationMember, cargos: OrganizationCustomRole[]): string | null {
    if (!m.customRoleId) return null;
    return cargos.find(c => c.id === m.customRoleId)?.name || 'Customizado';
}

export function chaveDoGrupoMembro(campo: CampoAgruparMembro, m: OrganizationMember, cargos: OrganizationCustomRole[]): ChaveDeGrupo {
    switch (campo) {
        case 'funcao': return m.role ? { key: m.role, label: ROTULO_FUNCAO[m.role] ?? m.role } : null;
        case 'cargo': return chavePorNome(nomeDoCargo(m, cargos));
        case 'entrada': return chavePorMes(m.joinedAt);
    }
}

/**
 * Tabela consolidada "Todos os usuários" (topo em "Todas as organizações"): uma linha por
 * par organização × membro. Mesmos critérios — só colunas da tabela, um valor por linha.
 */
export type CampoAgruparUsuarioConsolidado = 'organizacao' | 'funcao';

export const OPCOES_AGRUPAR_USUARIO_CONSOLIDADO: { value: CampoAgruparUsuarioConsolidado; label: string }[] = [
    { value: 'organizacao', label: 'Organização' },
    { value: 'funcao', label: 'Função' },
];

export interface UsuarioConsolidado {
    org: { id: string; name: string };
    member: OrganizationMember;
}

export function agruparUsuariosConsolidados<T extends UsuarioConsolidado>(
    itens: T[],
    campo: CampoAgruparUsuarioConsolidado,
    direcao: DirecaoGrupos,
): Grupo<T>[] {
    return agruparLinhas(itens, {
        // A chave é o id (duas organizações podem ter o mesmo nome); o rótulo é o nome que a célula mostra.
        chave: ({ org, member }) => campo === 'organizacao'
            ? (org.name ? { key: org.id, label: org.name } : null)
            : chaveDoGrupoMembro('funcao', member, []),
        semRotulo: campo === 'organizacao' ? 'Sem organização' : SEM.funcao,
        ordem: campo === 'funcao' ? ORDEM_FUNCAO : 'rotulo',
        direcao,
    });
}

export function agruparMembros(
    membros: OrganizationMember[],
    campo: CampoAgruparMembro,
    cargos: OrganizationCustomRole[],
    direcao: DirecaoGrupos,
): Grupo<OrganizationMember>[] {
    return agruparLinhas(membros, {
        chave: m => chaveDoGrupoMembro(campo, m, cargos),
        semRotulo: SEM[campo],
        ordem: campo === 'funcao' ? ORDEM_FUNCAO : campo === 'entrada' ? 'chave' : 'rotulo',
        direcao,
    });
}
