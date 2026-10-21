/**
 * Aprovação do rateio pelo síndico — espelho TS do gatilho
 * `trg_rateio_exige_aprovacao` (supabase/migrations/aplicar_20271020400200_portal_sindico_aprovacao_rateio.sql).
 * O banco é quem trava; aqui o botão Fechar diz o motivo ANTES do clique
 * (regra do app: botão desligado sempre diz por quê). Mesmas mensagens, na
 * mesma ordem de verificação.
 * Plano: docs/planos/2026-10-20-portal-do-sindico.md (F3)
 */

export type StatusDaAprovacao = 'APROVADO' | 'DEVOLVIDO' | null;

export interface AprovacaoDoRateio {
    status: StatusDaAprovacao;
    porClientId: string | null;
    /** A assinatura gravada na decisão não bate mais com o rateio. */
    desatualizada: boolean;
}

export interface ContextoDoCondominio {
    /** `empreendimentos.rateio_exige_aprovacao_sindico` */
    exige: boolean;
    sindicoClientId: string | null;
    sindicoVigente: boolean;
}

export function podeFecharRateio(a: AprovacaoDoRateio, c: ContextoDoCondominio): { ok: boolean; motivo: string | null } {
    if (!c.exige) return { ok: true, motivo: null };
    if (!c.sindicoClientId || !c.sindicoVigente) {
        return { ok: false, motivo: 'Este condomínio exige a aprovação do síndico, mas não há síndico com mandato vigente. Defina o síndico na Ficha ou desligue a exigência.' };
    }
    if (a.status !== 'APROVADO') {
        return { ok: false, motivo: 'O síndico ainda não aprovou este rateio (Portal do Síndico › Prestação de contas).' };
    }
    if (a.porClientId !== c.sindicoClientId) {
        return { ok: false, motivo: 'A aprovação é do síndico anterior: peça a aprovação do síndico atual.' };
    }
    if (a.desatualizada) {
        return { ok: false, motivo: 'O rateio mudou depois da aprovação do síndico: peça uma nova aprovação.' };
    }
    return { ok: true, motivo: null };
}

export type SituacaoDaAprovacao = 'AGUARDANDO' | 'APROVADO' | 'DEVOLVIDO' | 'DESATUALIZADA';

/** O estado que a coluna "Síndico" e o portal mostram. */
export function situacaoDaAprovacao(a: Pick<AprovacaoDoRateio, 'status' | 'desatualizada'>): SituacaoDaAprovacao {
    if (a.status && a.desatualizada) return 'DESATUALIZADA';
    if (a.status === 'APROVADO') return 'APROVADO';
    if (a.status === 'DEVOLVIDO') return 'DEVOLVIDO';
    return 'AGUARDANDO';
}

export const ROTULO_DA_APROVACAO: Record<SituacaoDaAprovacao, string> = {
    AGUARDANDO: 'Aguardando o síndico',
    APROVADO: 'Aprovado pelo síndico',
    DEVOLVIDO: 'Devolvido pelo síndico',
    DESATUALIZADA: 'Aprovação desatualizada',
};
