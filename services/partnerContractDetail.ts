import type {
    ContractItem, ContractAddendum, ContractMeasurement,
    ContractPrecedentCondition, ContractDocumentRequirement, ContractAcceptance,
    ContractRetentionRelease, ContractPenalty,
} from '../types/contracts';

/**
 * Detalhe de um contrato no Portal do Parceiro — o payload de
 * `partner_ws_contract_detail` (`aplicar_20270921000003`), lido pelas duas
 * cascas: `partnerService.getContractDetail` no app e
 * `partnerPortalTokenService.getContractDetail` no link.
 *
 * Uma normalização só, aqui, pelo mesmo motivo de `partnerSupplierProfile.ts`:
 * até 10/09/2026 o modo app lia `contractService` tabela a tabela e o modo link
 * lia uma RPC com corpo próprio — dois caminhos que já tinham começado a
 * divergir (o link trazia 3 coleções; o app, 3 outras chamadas).
 */
/** Versão EMITIDA da aba Emissão (contract_document_versions) — o núcleo nunca
 *  manda rascunho nem credencial de assinatura (aplicar_20271004000020). */
export interface PartnerContractDocument {
    id: string;
    owner_type: 'CONTRACT' | 'ADDENDUM';
    owner_id: string;
    /** Número do aditivo quando `owner_type = 'ADDENDUM'`. */
    addendum_number: string | null;
    v: number;
    kind: string;
    name: string | null;
    notes: string | null;
    url: string;
    mime_type: string | null;
    size_bytes: number | null;
    emitted_at: string | null;
    created_at: string;
    signature_status: string | null;
    signed_file_url: string | null;
}

export interface PartnerContractDetail {
    items: ContractItem[];
    addendums: ContractAddendum[];
    measurements: ContractMeasurement[];
    /** Execução & Entrega */
    precedentConditions: ContractPrecedentCondition[];
    documentRequirements: ContractDocumentRequirement[];
    acceptances: ContractAcceptance[];
    /** Retenção de Garantia — o ledger é `fn_contract_retention_ledger`, a
     *  mesma conta contra a qual a construtora libera. */
    retention: {
        totalRetained: number;
        totalReleased: number;
        balance: number;
        releases: ContractRetentionRelease[];
    };
    penalties: ContractPenalty[];
    /** Documentos do contrato — versões emitidas na aba Emissão. */
    documents: PartnerContractDocument[];
}

export const EMPTY_CONTRACT_DETAIL: PartnerContractDetail = {
    items: [], addendums: [], measurements: [],
    precedentConditions: [], documentRequirements: [], acceptances: [],
    retention: { totalRetained: 0, totalReleased: 0, balance: 0, releases: [] },
    penalties: [],
    documents: [],
};

/** `valid:false` (token expirado, contrato de outro fornecedor) vira vazio, não exceção. */
export function normalizeContractDetail(data: unknown): PartnerContractDetail {
    const p = data as {
        valid?: boolean;
        items?: ContractItem[]; addendums?: ContractAddendum[]; measurements?: ContractMeasurement[];
        precedent_conditions?: ContractPrecedentCondition[];
        document_requirements?: ContractDocumentRequirement[];
        acceptances?: ContractAcceptance[];
        retention?: {
            total_retained?: number | string; total_released?: number | string; balance?: number | string;
            releases?: ContractRetentionRelease[];
        } | null;
        penalties?: ContractPenalty[];
        documents?: PartnerContractDocument[];
    } | null;

    if (!p?.valid) return EMPTY_CONTRACT_DETAIL;

    return {
        items: p.items ?? [],
        addendums: p.addendums ?? [],
        measurements: p.measurements ?? [],
        precedentConditions: p.precedent_conditions ?? [],
        documentRequirements: p.document_requirements ?? [],
        acceptances: p.acceptances ?? [],
        retention: {
            // numeric do Postgres chega como string pelo JSON — Number() nos três.
            totalRetained: Number(p.retention?.total_retained ?? 0),
            totalReleased: Number(p.retention?.total_released ?? 0),
            balance: Number(p.retention?.balance ?? 0),
            releases: p.retention?.releases ?? [],
        },
        penalties: p.penalties ?? [],
        documents: p.documents ?? [],
    };
}
