// lib/convidarColaborador.ts — quem pode ser convidado como usuário a partir do RH.
//
// Usuários › Convidar membro (pedido de 16/11/2026): o convite escolhe um
// colaborador já cadastrado em vez de redigitar nome e e-mail. Esta função decide
// quem aparece na busca e quem aparece desligado.
// Plano: docs/planos/2026-11-16-usuarios-convidar-colaborador.md
import type { ColaboradorParaConvite } from '../services/laborService';
import type { OrganizationMember } from '../types/users';

export interface OpcaoColaborador {
    id: string;
    name: string;
    /** E-mail da ficha, normalizado (`trim().toLowerCase()`); `''` quando a ficha não tem. */
    email: string;
    /** Login já vinculado à ficha (`employees.user_id`). */
    userId: string | null;
    /** Cargo da ficha — distingue homônimos na lista. */
    cargo?: string;
    /** Nome da organização que disponibilizou o colaborador (só quando não é a que convida). */
    origem?: string;
    /** Preenchido = aparece desligado na busca, com este motivo. */
    motivoDesligado?: string;
}

/**
 * Contexto de quem convida. Vincular a ficha a um login exige owner/admin da organização
 * DO COLABORADOR — trava no banco (`trg_employees_vinculo_so_gestor`). Para colaborador
 * disponibilizado por outra organização, a tela diz isso antes, em vez de deixar o
 * convite esbarrar no 42501.
 */
export interface ContextoDoConvite {
    organizationId: string;
    nomeDaOrg: (orgId: string) => string | undefined;
    podeVincularNaOrg: (orgId: string) => boolean;
}

// Desligado/inativo não tem por que ganhar acesso; afastado continua vinculado à empresa.
const FORA_DA_LISTA = new Set(['DESLIGADO', 'INATIVO']);

const normalizarEmail = (email?: string | null) => (email ?? '').trim().toLowerCase();

export function opcoesDeColaborador(
    employees: ColaboradorParaConvite[],
    members: OrganizationMember[],
    contexto?: ContextoDoConvite,
): OpcaoColaborador[] {
    const emailsDaOrg = new Set(members.map(m => normalizarEmail(m.email)).filter(Boolean));
    const loginsDaOrg = new Set(members.map(m => m.userId).filter((id): id is string => !!id));

    return employees
        .filter(e => !FORA_DA_LISTA.has(e.status))
        .map(e => {
            const email = normalizarEmail(e.email);
            const userId = e.user_id ?? null;
            const opcao: OpcaoColaborador = { id: e.id, name: e.name, email, userId };
            const cargo = (e.role ?? '').trim();
            if (cargo) opcao.cargo = cargo;

            const deOutraOrg = !!contexto && !!e.org_id && e.org_id !== contexto.organizationId;
            if (deOutraOrg) opcao.origem = contexto!.nomeDaOrg(e.org_id) || 'outra organização';

            const jaUsuario = (!!userId && loginsDaOrg.has(userId)) || (!!email && emailsDaOrg.has(email));
            if (jaUsuario) {
                opcao.motivoDesligado = 'Já é usuário desta organização';
            } else if (deOutraOrg && !contexto!.podeVincularNaOrg(e.org_id)) {
                opcao.motivoDesligado = `Disponibilizado por ${opcao.origem} — só owner ou admin de lá vincula a um login`;
            }
            return opcao;
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
