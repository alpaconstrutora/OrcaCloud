/**
 * Portal de Crédito · Credit Room.
 * Plano: docs/planos/2026-09-07-portal-credito-credit-room.md
 *
 * O snapshot e os indicadores são calculados em `utils/creditRoomSnapshot.ts`
 * (puro); estes tipos são a forma persistida e a forma que as telas leem.
 */

import type {
    CreditRoomEligibleFlows,
    CreditRoomGuarantee,
    CreditRoomIndicators,
    CreditRoomSnapshot,
} from '../utils/creditRoomSnapshot';

export type { CreditRoomEligibleFlows, CreditRoomGuarantee, CreditRoomIndicators, CreditRoomSnapshot };

/** PRD §63. */
export type CreditRoomStatus =
    | 'PREPARACAO' | 'ENVIADA' | 'EM_ANALISE' | 'PENDENCIAS' | 'COMITE'
    | 'APROVADA' | 'RECUSADA' | 'CONTRATACAO' | 'ATIVA' | 'QUITADA' | 'CANCELADA';

export const CREDIT_ROOM_STATUS_PT: Record<CreditRoomStatus, string> = {
    PREPARACAO: 'Preparação',
    ENVIADA: 'Enviada',
    EM_ANALISE: 'Em análise',
    PENDENCIAS: 'Pendências',
    COMITE: 'Comitê',
    APROVADA: 'Aprovada',
    RECUSADA: 'Recusada',
    CONTRATACAO: 'Contratação',
    ATIVA: 'Ativa',
    QUITADA: 'Quitada',
    CANCELADA: 'Cancelada',
};

/**
 * Uma linha do Quadro de Fontes e Usos (PRD §47). Mesma forma dos dois lados
 * de propósito: o que o banco checa é se as duas somas fecham, e comparar duas
 * listas com formatos diferentes convida a erro de leitura.
 */
export interface CreditRoomFundingEntry {
    id: string;
    label: string;
    kind: string;
    amount: number;
}

export const FUNDING_SOURCE_KINDS = ['EQUITY', 'FINANCIAMENTO', 'RECEBIVEIS', 'PERMUTA', 'OUTRA'] as const;
export const FUNDING_USE_KINDS = ['TERRENO', 'OBRA', 'PROJETOS', 'MARKETING', 'TRIBUTOS', 'JUROS', 'OUTRO'] as const;

export const FUNDING_KIND_PT: Record<string, string> = {
    EQUITY: 'Equity (sócios)', FINANCIAMENTO: 'Financiamento', RECEBIVEIS: 'Recebíveis de venda',
    PERMUTA: 'Permuta', OUTRA: 'Outra fonte',
    TERRENO: 'Terreno', OBRA: 'Obra', PROJETOS: 'Projetos e aprovações',
    MARKETING: 'Marketing e vendas', TRIBUTOS: 'Tributos', JUROS: 'Juros e encargos', OUTRO: 'Outro uso',
};

/** Quem está de que lado da mesa. */
export type CreditRoomSide = 'TOMADOR' | 'CREDOR';

export interface CreditRoom {
    id: string;
    organizationId: string;
    seq: number;
    code: string;
    name: string;

    companyId?: string;
    empreendimentoId?: string;
    projectId?: string;
    debtContractId?: string;
    institutionSupplierId?: string;
    institutionName?: string;

    requestedAmount: number;
    purpose?: string;
    modality?: string;
    termMonths?: number;
    graceMonths?: number;

    eligibleFlows: CreditRoomEligibleFlows;
    guarantees: CreditRoomGuarantee[];
    equityCommitted: number;
    equityContributed: number;
    fundingSources: CreditRoomFundingEntry[];
    fundingUses: CreditRoomFundingEntry[];

    status: CreditRoomStatus;
    activeVersionId?: string;
    notes?: string;
    createdBy?: string;
    createdAt: string;
    updatedAt: string;
}

export type CreditRoomInput = Omit<
    CreditRoom,
    'id' | 'organizationId' | 'seq' | 'code' | 'activeVersionId' | 'createdBy' | 'createdAt' | 'updatedAt'
>;

export interface CreditRoomVersion {
    id: string;
    organizationId: string;
    creditRoomId: string;
    versionNo: number;
    label?: string;
    dataBase: string;
    snapshot: CreditRoomSnapshot;
    indicators: CreditRoomIndicators;
    documentVersionIds: string[];
    notes?: string;
    frozenBy?: string;
    frozenAt: string;
}

export interface CreditRoomPermissions {
    view: boolean;
    download: boolean;
    comment: boolean;
    request: boolean;
}

export const PERMISSOES_PADRAO: CreditRoomPermissions = { view: true, download: true, comment: true, request: true };

export interface CreditRoomMember {
    id: string;
    organizationId: string;
    creditRoomId: string;
    email: string;
    userId?: string;
    name?: string;
    institution?: string;
    side: CreditRoomSide;
    permissions: CreditRoomPermissions;
    invitedBy?: string;
    invitedAt: string;
    expiresAt?: string;
    revokedAt?: string;
    revokedBy?: string;
    lastAccessAt?: string;
}

export interface CreditRoomMemberInput {
    email: string;
    name?: string;
    institution?: string;
    side: CreditRoomSide;
    permissions?: Partial<CreditRoomPermissions>;
    expiresAt?: string;
}

/** O que `fn_my_credit_rooms` devolve para o credor logado. */
export interface MyCreditRoomMembership {
    creditRoomId: string;
    side: CreditRoomSide;
    permissions: CreditRoomPermissions;
    expiresAt?: string;
}

/** PRD §59. */
export type CreditRoomRequestStatus =
    | 'ABERTA' | 'EM_PREPARACAO' | 'RESPONDIDA' | 'EM_ANALISE' | 'ACEITA' | 'REJEITADA';

export const CREDIT_ROOM_REQUEST_STATUS_PT: Record<CreditRoomRequestStatus, string> = {
    ABERTA: 'Aberta',
    EM_PREPARACAO: 'Em preparação',
    RESPONDIDA: 'Respondida',
    EM_ANALISE: 'Em análise',
    ACEITA: 'Aceita',
    REJEITADA: 'Rejeitada',
};

export type CreditRoomPriority = 'BAIXA' | 'MEDIA' | 'ALTA';

export const CREDIT_ROOM_PRIORITY_PT: Record<CreditRoomPriority, string> = {
    BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta',
};

export interface CreditRoomRequest {
    id: string;
    organizationId: string;
    creditRoomId: string;
    title: string;
    description?: string;
    fromSide: CreditRoomSide;
    assigneeEmail?: string;
    dueAt?: string;
    priority: CreditRoomPriority;
    status: CreditRoomRequestStatus;
    answerDocumentId?: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}

export interface CreditRoomRequestInput {
    title: string;
    description?: string;
    fromSide: CreditRoomSide;
    assigneeEmail?: string;
    dueAt?: string;
    priority?: CreditRoomPriority;
    answerDocumentId?: string;
}

export type CreditRoomCommentVisibility = 'INTERNO' | 'COMPARTILHADO';

export interface CreditRoomComment {
    id: string;
    organizationId: string;
    creditRoomId: string;
    requestId?: string;
    visibility: CreditRoomCommentVisibility;
    authorEmail: string;
    authorSide: CreditRoomSide;
    body: string;
    createdAt: string;
}

export type CreditRoomAccessAction =
    | 'LOGIN' | 'VIEW' | 'DOWNLOAD' | 'COMMENT' | 'REQUEST' | 'SHARE' | 'UNSHARE'
    | 'FREEZE' | 'INVITE' | 'REVOKE' | 'EXPORT' | 'STATUS' | 'UPDATE';

export const CREDIT_ROOM_ACTION_PT: Record<CreditRoomAccessAction, string> = {
    LOGIN: 'Acesso',
    VIEW: 'Visualização',
    DOWNLOAD: 'Download',
    COMMENT: 'Comentário',
    REQUEST: 'Solicitação',
    SHARE: 'Compartilhamento',
    UNSHARE: 'Remoção de compartilhamento',
    FREEZE: 'Versão congelada',
    INVITE: 'Convite',
    REVOKE: 'Revogação',
    EXPORT: 'Exportação',
    STATUS: 'Mudança de status',
    UPDATE: 'Edição da operação',
};

export interface CreditRoomAccessLog {
    id: string;
    creditRoomId: string;
    actorUserId?: string;
    actorEmail: string;
    actorSide?: CreditRoomSide;
    action: CreditRoomAccessAction;
    resourceType?: string;
    resourceId?: string;
    metadata: Record<string, unknown>;
    ip?: string;
    userAgent?: string;
    createdAt: string;
}

/**
 * Fluxo de desembolso do PRD §69. A ordem aqui é a do fluxo — a tela usa o
 * índice para saber qual é o próximo passo.
 */
export type CreditRoomDisbursementStatus =
    | 'SOLICITADO' | 'DOCUMENTOS' | 'EM_ANALISE' | 'MEDICAO'
    | 'PENDENCIAS' | 'APROVADO' | 'LIBERADO' | 'CONCILIADO' | 'RECUSADO';

export const DISBURSEMENT_STATUS_PT: Record<CreditRoomDisbursementStatus, string> = {
    SOLICITADO: 'Solicitado',
    DOCUMENTOS: 'Documentos',
    EM_ANALISE: 'Em análise',
    MEDICAO: 'Medição',
    PENDENCIAS: 'Pendências',
    APROVADO: 'Aprovado',
    LIBERADO: 'Liberado',
    CONCILIADO: 'Conciliado',
    RECUSADO: 'Recusado',
};

/** A ordem do §69, sem RECUSADO — que é saída, não etapa. */
export const DISBURSEMENT_FLUXO: CreditRoomDisbursementStatus[] = [
    'SOLICITADO', 'DOCUMENTOS', 'EM_ANALISE', 'MEDICAO',
    'PENDENCIAS', 'APROVADO', 'LIBERADO', 'CONCILIADO',
];

export interface CreditRoomDisbursement {
    id: string;
    organizationId: string;
    debtContractId: string;
    creditRoomId?: string;
    /** Número da liberação dentro do contrato (§68). */
    seq: number;
    status: CreditRoomDisbursementStatus;
    requestedAmount: number;
    approvedAmount?: number;
    /** O que de fato saiu. Só faz sentido a partir de LIBERADO. */
    grossAmount: number;
    netAmount: number;
    disbursedAt?: string;
    purpose?: string;
    /** §70 — a medição que justifica a liberação. */
    measurementRef?: string;
    /** §71 — o percentual que a engenharia do BANCO aferiu. */
    physicalPct?: number;
    analysisNotes?: string;
    decidedAt?: string;
    decidedBy?: string;
    documentUrl?: string;
    notes?: string;
    createdAt: string;
    updatedAt: string;
}

/** Linha de `fn_credit_room_documents` — o Data Room como o credor o vê. */
export interface CreditRoomDocument {
    shareId: string;
    documentId: string;
    nome: string;
    descricao?: string;
    categoria: string;
    tipoDocumento: string;
    status: string;
    dataEmissao?: string;
    dataValidade?: string;
    versionId?: string;
    versionNumber?: number;
    storagePath?: string;
    mimeType?: string;
    tamanho?: number;
    sharedAt: string;
}
