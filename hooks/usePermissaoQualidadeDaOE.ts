import { useEffect, useMemo, useState } from 'react';
import { qualidadeSiacService } from '../services/qualidadeSiacService';
import { useStore } from '../store/useStore';
import { temAcessoTotal } from '../lib/acessoTotal';
import { errorMessage } from './useOrgContext';
import { vinculosDoUsuario } from '../utils/modulosPermitidos';
import {
    MOTIVO_SEM_INSPECAO, MOTIVO_SEM_LIBERACAO, podeInspecionarQualidade, podeLiberarQualidade,
} from '../utils/permissaoQualidadeSiac';

/**
 * Nome de um usuário (auth.uid, ex.: `respondido_por`, `liberado_por`) entre os membros das organizações
 * que o usuário logado enxerga. Fora delas, um rótulo genérico — nunca o uid cru na tela.
 */
export function useNomeDoUsuario(): (uid: string | null | undefined) => string {
    const organizations = useStore(s => s.organizations);
    return useMemo(() => (uid: string | null | undefined) => {
        if (!uid) return '—';
        for (const org of organizations ?? []) {
            const m = org.members?.find(x => x.userId === uid);
            if (m?.name) return m.name;
        }
        return 'Usuário de outra organização';
    }, [organizations]);
}

/** Motivo do botão desligado enquanto a organização dona do SGQ ainda está sendo conferida. */
export const MOTIVO_CONFERINDO_PERMISSAO_QUALIDADE = 'Conferindo a permissão da qualidade…';

/** Motivo do botão desligado quando o banco não respondeu qual é o SGQ da OE (fecha, não abre). */
export const motivoErroPermissaoQualidade = (erro: string) =>
    `Não foi possível conferir a permissão da qualidade: ${erro}`;

export interface PermissaoQualidadeDaOE {
    /** Organização dona do SGQ da organização da OE (`null` = OE comum, conferindo, ou erro). */
    sgqOrgId: string | null;
    /** Nome do SGQ quando o usuário o enxerga na lista de organizações dele. */
    nomeSgq: string | null;
    /** OE controlada e o SGQ ainda não voltou do banco. */
    conferindo: boolean;
    /** Responder a ficha (`canInspectQualitySystem`). OE comum: sempre. */
    podeInspecionar: boolean;
    /** "Aprovar inspeção" (`canReleaseQualitySystem`). OE comum: sempre. */
    podeLiberar: boolean;
    /** Por que não pode responder a ficha (null = pode) — vai no `title` do invólucro do botão. */
    motivoSemInspecao: string | null;
    /** Por que não pode aprovar/reprovar a inspeção (null = pode). */
    motivoSemLiberacao: string | null;
}

type EstadoSgq = { org: string; sgq: string; erro: null } | { org: string; sgq: null; erro: string };

/**
 * Quem pode inspecionar / aprovar a inspeção de uma OE de serviço controlado — a mesma régua do banco
 * (`_qualidade_pode` na organização DONA DO SGQ da organização da OE, `_qualidade_sgq_da_org`).
 *
 * A organização é a da OE (`work_orders.org_id`), não a do topo: a permissão é conferida onde o
 * banco confere. O membro é o do usuário NA organização do SGQ (`vinculosDoUsuario`); sem vínculo
 * nela (membro só da SPE) não pode — o banco recusaria com 42501.
 *
 * O único atalho é o do banco: `is_superadmin()`, cujo espelho no app é o e-mail de acesso total
 * (`temAcessoTotal`). O grupo DESENVOLVEDOR NÃO liga — o banco não o conhece (é dado a quem entra pela
 * "Área do Desenvolvedor") e recusaria com 42501.
 *
 * Falha ao conferir o SGQ fecha: sem permissão, com a mensagem do erro como motivo (cair para a org da
 * OE ligaria os botões para o admin da SPE, que o banco recusa). OE comum: não há régua, tudo ligado.
 */
export function usePermissaoQualidadeDaOE(orgDaOE: string | null | undefined, controlada: boolean): PermissaoQualidadeDaOE {
    const organizations = useStore(s => s.organizations);
    const email = useStore(s => s.session?.user?.email ?? null);

    const [estado, setEstado] = useState<EstadoSgq | null>(null);

    useEffect(() => {
        if (!controlada || !orgDaOE) return;
        let vivo = true;
        qualidadeSiacService.sgqDaOrganizacao(orgDaOE)
            .then(id => { if (vivo) setEstado({ org: orgDaOE, sgq: id, erro: null }); })
            .catch((e: unknown) => {
                if (vivo) setEstado({ org: orgDaOE, sgq: null, erro: errorMessage(e, 'erro ao ler o sistema da qualidade da OE') });
            });
        return () => { vivo = false; };
    }, [orgDaOE, controlada]);

    return useMemo((): PermissaoQualidadeDaOE => {
        if (!controlada) {
            return {
                sgqOrgId: null, nomeSgq: null, conferindo: false, podeInspecionar: true, podeLiberar: true,
                motivoSemInspecao: null, motivoSemLiberacao: null,
            };
        }
        const atual = estado && estado.org === orgDaOE ? estado : null;
        if (!atual) {
            return {
                sgqOrgId: null, nomeSgq: null, conferindo: true, podeInspecionar: false, podeLiberar: false,
                motivoSemInspecao: MOTIVO_CONFERINDO_PERMISSAO_QUALIDADE, motivoSemLiberacao: MOTIVO_CONFERINDO_PERMISSAO_QUALIDADE,
            };
        }
        if (atual.erro !== null) {
            const motivo = motivoErroPermissaoQualidade(atual.erro);
            return {
                sgqOrgId: null, nomeSgq: null, conferindo: false, podeInspecionar: false, podeLiberar: false,
                motivoSemInspecao: motivo, motivoSemLiberacao: motivo,
            };
        }
        const sgqOrgId = atual.sgq;
        const acessoTotal = temAcessoTotal(email);
        const membro = vinculosDoUsuario(organizations ?? [], email).find(v => v.org.id === sgqOrgId)?.member;
        const args = {
            permissoes: membro?.permissions as unknown as Record<string, unknown> | undefined,
            papel: membro?.role ?? null,
            acessoTotal,
        };
        const semVinculo = !membro && !acessoTotal;
        const podeInspecionar = !semVinculo && podeInspecionarQualidade(args);
        const podeLiberar = !semVinculo && podeLiberarQualidade(args);
        return {
            sgqOrgId,
            nomeSgq: (organizations ?? []).find(o => o.id === sgqOrgId)?.name ?? null,
            conferindo: false,
            podeInspecionar,
            podeLiberar,
            motivoSemInspecao: podeInspecionar ? null : MOTIVO_SEM_INSPECAO,
            motivoSemLiberacao: podeLiberar ? null : MOTIVO_SEM_LIBERACAO,
        };
    }, [controlada, estado, orgDaOE, organizations, email]);
}
