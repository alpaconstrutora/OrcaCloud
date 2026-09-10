import type {
    AcceptanceKind, DocumentRequirementPhase, PenaltyKind, PenaltyStatus, RetentionReleaseKind,
} from '../types/contracts';

/**
 * Rótulos do detalhe do contrato — UM lugar, usado pela tela interna
 * (`ContractDetailView`) e pelo Portal do Parceiro.
 *
 * Existe desde 10/09/2026, quando o portal ganhou as abas Execução & Entrega,
 * Retenção de Garantia e Penalidades. Até então estes mapas eram `const` locais
 * do `ContractDetailView`; copiá-los para o portal daria duas listas que
 * divergem na primeira edição — uma penalidade "Moratória" aqui não pode virar
 * outra palavra lá. Ver `project_portais_externos_vocabulario_unico`.
 */

export const PENALTY_KIND_LABELS: Record<PenaltyKind, string> = {
    MORATORIA: 'Moratória',
    COMPENSATORIA: 'Compensatória',
    SST: 'SST/Compliance',
    OUTRA: 'Outra',
};

export const PENALTY_STATUS_LABELS: Record<PenaltyStatus, string> = {
    NOTIFICADA: 'Notificada',
    EM_CURA: 'Em Cura',
    APLICADA: 'Aplicada',
    CANCELADA: 'Cancelada',
};

/** §8 do guia: status é texto colorido, sem pílula. */
export const PENALTY_STATUS_COLORS: Record<PenaltyStatus, string> = {
    NOTIFICADA: 'text-amber-700',
    EM_CURA: 'text-blue-700',
    APLICADA: 'text-red-600',
    CANCELADA: 'text-gray-500',
};

export const DOC_PHASE_LABELS: Record<DocumentRequirementPhase, string> = {
    ANTES_INICIO: 'Antes do Início',
    MENSAL: 'Mensal',
    ENCERRAMENTO: 'Encerramento',
};

export const ACCEPTANCE_KIND_LABELS: Record<AcceptanceKind, string> = {
    PROVISORIO: 'Recebimento Provisório',
    DEFINITIVO: 'Recebimento Definitivo',
};

export const RETENTION_RELEASE_KIND_LABELS: Record<RetentionReleaseKind, string> = {
    PROVISORIO: 'Provisório',
    DEFINITIVO: 'Definitivo',
    MANUAL: 'Manual',
};
