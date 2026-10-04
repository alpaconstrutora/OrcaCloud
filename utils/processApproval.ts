/**
 * Próximo nível de aprovação de uma etapa de Processos — regra pura, usada pelo
 * `processService.approveStep` (que grava) e pela tela (que mostra o botão e,
 * quando não pode, o motivo).
 *
 * Por que existe (04/10/2026, docs/planos/2026-10-04-processos-modelo-dono-alcada.md):
 * a tela mandava SEMPRE o nível 1. Numa alçada de 2 níveis (Gestor + Diretoria,
 * acima de R$ 5 mil na Alpa) a cadeia só juntava aprovações de nível 1 e a etapa
 * nunca concluía. E nada impedia a mesma pessoa de "aprovar" os dois níveis.
 */
import type { ApprovalStep } from '../types/financial';

export interface EtapaEmAprovacao {
    approval_status?: string | null;
    approval_required_levels?: number | null;
    approval_chain?: ApprovalStep[] | null;
}

export type ProximoNivel =
    | { pode: true; level: 1 | 2; exigidos: 1 | 2 }
    | { pode: false; level: 1 | 2; exigidos: 1 | 2; motivo: string };

/** `quem` é o identificador gravado em `approved_by` (o e-mail do usuário, como no resto do app). */
export function proximoNivelDeAprovacao(etapa: EtapaEmAprovacao, quem: string): ProximoNivel {
    const exigidos: 1 | 2 = etapa.approval_required_levels === 2 ? 2 : 1;
    const chain = etapa.approval_chain ?? [];
    const nivel1 = chain.find(c => c.action === 'APROVADO' && c.level === 1);
    const level: 1 | 2 = exigidos === 2 && nivel1 ? 2 : 1;

    if (etapa.approval_status !== 'PENDENTE') {
        return { pode: false, level, exigidos, motivo: 'A etapa não está aguardando aprovação.' };
    }
    if (level === 2 && nivel1 && quem && nivel1.approved_by === quem) {
        return { pode: false, level, exigidos, motivo: 'Você aprovou o nível 1. O nível 2 precisa de outra pessoa.' };
    }
    return { pode: true, level, exigidos };
}
