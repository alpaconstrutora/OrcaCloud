// hooks/useImovibEdicao.tsx
//
// Quem pode EDITAR um estudo de viabilidade (permissão `canEditImovib`).
//
// Até 2026-10-12 a permissão era só declarada (Usuários › Permissões Detalhadas)
// e nenhuma tela a lia: qualquer membro editava e excluía. Decisão do usuário:
// "Aplicar canEditImovib" — sem ela, o estudo abre SÓ PARA LEITURA (campos que
// gravam desabilitados, com o motivo; navegação, exportação e simulações locais
// continuam livres). Plano docs/planos/2026-10-12-imovib-viabilidade-correcoes.md,
// item 4.6.
//
// A regra vale para a org DONA DO ESTUDO, não para o topo: com o topo em
// "Todas", o topo não tem org, mas o estudo tem.

import React, { createContext, useContext, useMemo } from 'react';
import { useStore } from '../store/useStore';

export interface ImovibEdicao {
    pode: boolean;
    /** Por que não pode — vai no `title` dos campos e no aviso da tela. */
    motivo?: string;
}

const MOTIVO_SEM_PERMISSAO =
    'Seu usuário não tem permissão para editar Estudos de Viabilidade nesta organização (Usuários › Permissões Detalhadas › Incorporação).';
const MOTIVO_NAO_MEMBRO =
    'Você não é membro da organização dona deste estudo — ele abre só para leitura.';

interface MembroLido {
    role?: string | null;
    permissions?: Record<string, unknown> | null;
}

/**
 * Regra pura (testada em __tests__/imovibEdicao.test.ts):
 * - desenvolvedor: pode (mesma exceção do guard de rota em AppRouter);
 * - org do estudo ainda não carregada: pode (a RLS segue valendo no banco);
 * - não é membro da org do estudo: não pode;
 * - admin/owner: pode;
 * - `canEditImovib` definido no membro: vale ele;
 * - sem definição: o padrão do papel (getDefaultPermissions) — viewer não, os demais sim.
 */
export function avaliarEdicaoImovib(args: {
    desenvolvedor: boolean;
    orgCarregada: boolean;
    membro: MembroLido | null;
}): ImovibEdicao {
    if (args.desenvolvedor || !args.orgCarregada) return { pode: true };
    const m = args.membro;
    if (!m) return { pode: false, motivo: MOTIVO_NAO_MEMBRO };
    if (m.role === 'admin' || m.role === 'owner') return { pode: true };
    const perm = m.permissions ? m.permissions['canEditImovib'] : undefined;
    const pode = perm !== undefined ? !!perm : m.role !== 'viewer';
    return pode ? { pode: true } : { pode: false, motivo: MOTIVO_SEM_PERMISSAO };
}

// Mesmo e-mail de desenvolvedor do guard de rota (AppRouter.tsx, isDevEmail).
const EMAIL_DESENVOLVEDOR = 'altair.rosa@alpaconstrutora.com.br';

/**
 * Devolve uma função org → permissão. Para listas (uma linha por estudo, cada
 * uma da sua org), onde chamar o hook por linha violaria as regras dos Hooks.
 */
export function useImovibPermissaoPorOrg(): (orgDoEstudo: string | null | undefined) => ImovibEdicao {
    const group = useStore(s => s.currentProfile.group);
    const email = useStore(s => s.session?.user?.email);
    const organizations = useStore(s => s.organizations);
    return useMemo(() => {
        const emailLower = (email || '').toLowerCase();
        // Pelo valor, como o guard de rota (AppRouter compara com 'DESENVOLVEDOR').
        const desenvolvedor = String(group) === 'DESENVOLVEDOR' || emailLower === EMAIL_DESENVOLVEDOR;
        return (orgDoEstudo) => {
            const org = orgDoEstudo ? organizations.find(o => o.id === orgDoEstudo) : undefined;
            const membro = org?.members?.find(m => (m.email || '').toLowerCase() === emailLower) || null;
            return avaliarEdicaoImovib({ desenvolvedor, orgCarregada: !!org?.members, membro: membro as MembroLido | null });
        };
    }, [group, email, organizations]);
}

/** Avalia a permissão de edição para o estudo da organização `orgDoEstudo`. */
export function useImovibPodeEditar(orgDoEstudo: string | null | undefined): ImovibEdicao {
    const avaliar = useImovibPermissaoPorOrg();
    return useMemo(() => avaliar(orgDoEstudo), [avaliar, orgDoEstudo]);
}

const ImovibEdicaoContext = createContext<ImovibEdicao>({ pode: true });

export const ImovibEdicaoProvider: React.FC<{ value: ImovibEdicao; children: React.ReactNode }> = ({ value, children }) => (
    <ImovibEdicaoContext.Provider value={value}>{children}</ImovibEdicaoContext.Provider>
);

/** Lido pelas abas do estudo. Fora do provider (ex.: teste isolado), libera. */
export const useImovibEdicao = (): ImovibEdicao => useContext(ImovibEdicaoContext);
