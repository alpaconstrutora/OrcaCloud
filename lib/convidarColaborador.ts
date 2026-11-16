// lib/convidarColaborador.ts — quem pode ser convidado como usuário a partir do RH.
//
// Usuários › Convidar membro (pedido de 16/11/2026): o convite escolhe um
// colaborador já cadastrado em vez de redigitar nome e e-mail. Esta função decide
// quem aparece na busca e quem aparece desligado.
// Plano: docs/planos/2026-11-16-usuarios-convidar-colaborador.md
import type { Employee } from '../services/laborService';
import type { OrganizationMember } from '../types/users';

export interface OpcaoColaborador {
    id: string;
    name: string;
    /** E-mail da ficha, normalizado (`trim().toLowerCase()`); `''` quando a ficha não tem. */
    email: string;
    /** Login já vinculado à ficha (`employees.user_id`). */
    userId: string | null;
    /** Preenchido = aparece desligado na busca, com este motivo. */
    motivoDesligado?: string;
}

// Desligado/inativo não tem por que ganhar acesso; afastado continua vinculado à empresa.
const FORA_DA_LISTA = new Set(['DESLIGADO', 'INATIVO']);

const normalizarEmail = (email?: string | null) => (email ?? '').trim().toLowerCase();

export function opcoesDeColaborador(employees: Employee[], members: OrganizationMember[]): OpcaoColaborador[] {
    const emailsDaOrg = new Set(members.map(m => normalizarEmail(m.email)).filter(Boolean));
    const loginsDaOrg = new Set(members.map(m => m.userId).filter((id): id is string => !!id));

    return employees
        .filter(e => !FORA_DA_LISTA.has(e.status))
        .map(e => {
            const email = normalizarEmail(e.email);
            const userId = e.user_id ?? null;
            const jaUsuario = (!!userId && loginsDaOrg.has(userId)) || (!!email && emailsDaOrg.has(email));
            const opcao: OpcaoColaborador = { id: e.id, name: e.name, email, userId };
            if (jaUsuario) opcao.motivoDesligado = 'Já é usuário desta organização';
            return opcao;
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
