import { useEffect, useMemo, useState } from 'react';
import { qualidadeSiacService } from '../services/qualidadeSiacService';
import { useStore } from '../store/useStore';
import { temAcessoTotal } from '../lib/acessoTotal';
import { vinculosDoUsuario } from '../utils/modulosPermitidos';
import { podeInspecionarQualidade, podeLiberarQualidade } from '../utils/permissaoQualidadeSiac';

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

export interface PermissaoQualidadeDaOE {
    /** Organização dona do SGQ da organização da OE (`null` = OE comum, ou ainda conferindo). */
    sgqOrgId: string | null;
    /** Nome do SGQ quando o usuário o enxerga na lista de organizações dele. */
    nomeSgq: string | null;
    /** OE controlada e o SGQ ainda não voltou do banco. */
    conferindo: boolean;
    /** Responder a ficha (`canInspectQualitySystem`). OE comum: sempre. */
    podeInspecionar: boolean;
    /** "Aprovar inspeção" (`canReleaseQualitySystem`). OE comum: sempre. */
    podeLiberar: boolean;
}

/**
 * Quem pode inspecionar / aprovar a inspeção de uma OE de serviço controlado — a mesma régua do banco
 * (`_qualidade_pode` na organização DONA DO SGQ da organização da OE, `_qualidade_sgq_da_org`).
 *
 * A organização é a da OE (`work_orders.org_id`), não a do topo: a permissão é conferida onde o
 * banco confere. O membro é o do usuário NA organização do SGQ (`vinculosDoUsuario`); sem vínculo
 * nela (membro só da SPE) não pode — o banco recusaria com 42501. Acesso total (grupo DESENVOLVEDOR
 * ou e-mail de acesso total, o superadmin do banco) pode sempre. OE comum (sem serviço controlado):
 * não há régua, tudo ligado.
 */
export function usePermissaoQualidadeDaOE(orgDaOE: string | null | undefined, controlada: boolean): PermissaoQualidadeDaOE {
    const organizations = useStore(s => s.organizations);
    const email = useStore(s => s.session?.user?.email ?? null);
    const grupo = useStore(s => s.currentProfile?.group);

    const [sgq, setSgq] = useState<{ org: string; sgq: string } | null>(null);

    useEffect(() => {
        if (!controlada || !orgDaOE) return;
        let vivo = true;
        qualidadeSiacService.sgqDaOrganizacao(orgDaOE)
            .then(id => { if (vivo) setSgq({ org: orgDaOE, sgq: id }); })
            // Sem resposta do banco: fica a própria organização (o banco decide no fim).
            .catch(() => { if (vivo) setSgq({ org: orgDaOE, sgq: orgDaOE }); });
        return () => { vivo = false; };
    }, [orgDaOE, controlada]);

    return useMemo(() => {
        if (!controlada) {
            return { sgqOrgId: null, nomeSgq: null, conferindo: false, podeInspecionar: true, podeLiberar: true };
        }
        const sgqOrgId = sgq && sgq.org === orgDaOE ? sgq.sgq : null;
        if (!sgqOrgId) {
            return { sgqOrgId: null, nomeSgq: null, conferindo: true, podeInspecionar: false, podeLiberar: false };
        }
        const acessoTotal = grupo === 'DESENVOLVEDOR' || temAcessoTotal(email);
        const membro = vinculosDoUsuario(organizations ?? [], email).find(v => v.org.id === sgqOrgId)?.member;
        const args = {
            permissoes: membro?.permissions as unknown as Record<string, unknown> | undefined,
            papel: membro?.role ?? null,
            acessoTotal,
        };
        const semVinculo = !membro && !acessoTotal;
        return {
            sgqOrgId,
            nomeSgq: (organizations ?? []).find(o => o.id === sgqOrgId)?.name ?? null,
            conferindo: false,
            podeInspecionar: !semVinculo && podeInspecionarQualidade(args),
            podeLiberar: !semVinculo && podeLiberarQualidade(args),
        };
    }, [controlada, sgq, orgDaOE, organizations, email, grupo]);
}
