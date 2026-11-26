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

/** Motivo do botão desligado enquanto a organização dona do serviço controlado ainda está sendo conferida. */
export const MOTIVO_CONFERINDO_PERMISSAO_QUALIDADE = 'Conferindo a permissão da qualidade…';

/** Motivo do botão desligado quando o banco não respondeu de quem é o serviço da OE (fecha, não abre). */
export const motivoErroPermissaoQualidade = (erro: string) =>
    `Não foi possível conferir a permissão da qualidade: ${erro}`;

export interface PermissaoQualidadeDaOE {
    /**
     * Organização DONA do serviço controlado da OE (`quality_controlled_items.organization_id`) — onde a
     * permissão é conferida. `null` = OE comum, conferindo, erro, ou serviço invisível (sem vínculo).
     */
    orgDoServicoId: string | null;
    /** Nome dessa organização quando o usuário a enxerga na lista de organizações dele. */
    nomeOrgDoServico: string | null;
    /** OE controlada e a organização do serviço ainda não voltou do banco. */
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

type EstadoOrg = { item: string; org: string | null; erro: null } | { item: string; org: null; erro: string };

/**
 * Quem pode inspecionar / aprovar a inspeção de uma OE de serviço controlado — a régua do banco
 * (`_qualidade_pode` na organização DONA DO SERVIÇO CONTROLADO, `quality_controlled_items.organization_id`).
 *
 * Por que a org do serviço e não o SGQ da org da OE: o admin da SPE desfaz o SGQ dela e, se a régua
 * fosse o SGQ atual, passava a responder/aprovar OEs que apontam para serviços da Alpa (e isso contava
 * no painel da Alpa). O serviço é da Alpa; a permissão também. Funciona igual com o banco antes e
 * depois da migration 130000: com o SGQ apontado, a org do serviço É o SGQ; desfeito, o app fica mais
 * fechado que o banco antigo (nunca mais aberto).
 *
 * O membro é o do usuário NA organização do serviço (`vinculosDoUsuario`); sem vínculo nela (membro só
 * da SPE — a RLS nem deixa ler o serviço) não pode — o banco recusaria com 42501.
 *
 * O único atalho é o do banco: `is_superadmin()`, cujo espelho no app é o e-mail de acesso total
 * (`temAcessoTotal`). O grupo DESENVOLVEDOR NÃO liga — o banco não o conhece (é dado a quem entra pela
 * "Área do Desenvolvedor") e recusaria com 42501.
 *
 * Falha ao ler a organização do serviço fecha: sem permissão, com a mensagem do erro como motivo (cair
 * para a org da OE ligaria os botões para o admin da SPE, que o banco recusa). OE comum: não há régua,
 * tudo ligado.
 */
export function usePermissaoQualidadeDaOE(controlledItemId: string | null | undefined): PermissaoQualidadeDaOE {
    const organizations = useStore(s => s.organizations);
    const email = useStore(s => s.session?.user?.email ?? null);

    const [estado, setEstado] = useState<EstadoOrg | null>(null);

    useEffect(() => {
        if (!controlledItemId) return;
        let vivo = true;
        qualidadeSiacService.orgDoServicoControlado(controlledItemId)
            .then(org => { if (vivo) setEstado({ item: controlledItemId, org, erro: null }); })
            .catch((e: unknown) => {
                if (vivo) setEstado({ item: controlledItemId, org: null, erro: errorMessage(e, 'erro ao ler o serviço controlado da OE') });
            });
        return () => { vivo = false; };
    }, [controlledItemId]);

    return useMemo((): PermissaoQualidadeDaOE => {
        if (!controlledItemId) {
            return {
                orgDoServicoId: null, nomeOrgDoServico: null, conferindo: false, podeInspecionar: true, podeLiberar: true,
                motivoSemInspecao: null, motivoSemLiberacao: null,
            };
        }
        const atual = estado && estado.item === controlledItemId ? estado : null;
        if (!atual) {
            return {
                orgDoServicoId: null, nomeOrgDoServico: null, conferindo: true, podeInspecionar: false, podeLiberar: false,
                motivoSemInspecao: MOTIVO_CONFERINDO_PERMISSAO_QUALIDADE, motivoSemLiberacao: MOTIVO_CONFERINDO_PERMISSAO_QUALIDADE,
            };
        }
        if (atual.erro !== null) {
            const motivo = motivoErroPermissaoQualidade(atual.erro);
            return {
                orgDoServicoId: null, nomeOrgDoServico: null, conferindo: false, podeInspecionar: false, podeLiberar: false,
                motivoSemInspecao: motivo, motivoSemLiberacao: motivo,
            };
        }
        const orgDoServicoId = atual.org;
        const acessoTotal = temAcessoTotal(email);
        const membro = orgDoServicoId
            ? vinculosDoUsuario(organizations ?? [], email).find(v => v.org.id === orgDoServicoId)?.member
            : undefined;
        const args = {
            permissoes: membro?.permissions as unknown as Record<string, unknown> | undefined,
            papel: membro?.role ?? null,
            acessoTotal,
        };
        const semVinculo = !membro && !acessoTotal;
        const podeInspecionar = !semVinculo && podeInspecionarQualidade(args);
        const podeLiberar = !semVinculo && podeLiberarQualidade(args);
        return {
            orgDoServicoId,
            nomeOrgDoServico: orgDoServicoId ? (organizations ?? []).find(o => o.id === orgDoServicoId)?.name ?? null : null,
            conferindo: false,
            podeInspecionar,
            podeLiberar,
            motivoSemInspecao: podeInspecionar ? null : MOTIVO_SEM_INSPECAO,
            motivoSemLiberacao: podeLiberar ? null : MOTIVO_SEM_LIBERACAO,
        };
    }, [controlledItemId, estado, organizations, email]);
}
