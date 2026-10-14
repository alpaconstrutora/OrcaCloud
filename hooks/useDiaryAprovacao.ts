import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { avaliarAprovacaoDiario, AprovacaoDiario } from '../utils/diaryAprovacao';

/**
 * Pode aprovar/recusar registros do diário da organização `orgDoDiario`? Vale a
 * organização DONA DO DIÁRIO, não o topo (REGRA #5: com o topo em "Todas", o
 * diário tem org). Molde: hooks/useAreasNbr12721Edicao.ts. Quem decide é o banco
 * (`fn_pode_aprovar_diario`); aqui o botão só diz por quê.
 */
export function useDiaryAprovacao(orgDoDiario: string | null | undefined): AprovacaoDiario {
    const email = useStore(s => s.session?.user?.email);
    const organizations = useStore(s => s.organizations);
    return useMemo(() => {
        const emailLower = (email || '').toLowerCase();
        const org = orgDoDiario ? organizations.find(o => o.id === orgDoDiario) : undefined;
        const membro = org?.members?.find(m => (m.email || '').toLowerCase() === emailLower) || null;
        return avaliarAprovacaoDiario({
            orgCarregada: !!org?.members,
            membro: membro as { role?: string | null; permissions?: Record<string, unknown> | null } | null,
        });
    }, [email, organizations, orgDoDiario]);
}
