import { supabase } from '../lib/supabase';

// CNPJ/CPF deve ser único por pessoa/empresa — mesmo entre organizações
// diferentes. Usado por supplierService/clientService/investorService antes
// de criar ou editar um cadastro. As funções find_*_by_document (RPC) comparam
// ignorando pontuação, direto no banco (migration 20270716000002).

export type DuplicateDocumentEntityKind = 'supplier' | 'client' | 'investor';

const RPC_BY_KIND: Record<DuplicateDocumentEntityKind, string> = {
    supplier: 'find_supplier_by_document',
    client: 'find_client_by_document',
    investor: 'find_investor_by_document',
};

const LABEL_BY_KIND: Record<DuplicateDocumentEntityKind, string> = {
    supplier: 'fornecedor',
    client: 'cliente',
    investor: 'investidor',
};

interface DuplicateDocumentMatch {
    id: string;
    name: string;
    code: string | null;
    organization_id: string | null;
    organization_name: string | null;
}

export async function assertDocumentNotDuplicated(
    kind: DuplicateDocumentEntityKind,
    document: string | null | undefined,
    excludeId?: string | null,
): Promise<void> {
    const digits = (document || '').replace(/\D/g, '');
    if (!digits) return;

    const { data, error } = await supabase.rpc(RPC_BY_KIND[kind], {
        p_document: digits,
        p_exclude_id: excludeId || null,
    });

    if (error) {
        // Não bloqueia o cadastro se a checagem em si falhar (ex: função ainda
        // não aplicada no banco) — a validação é uma camada extra, não deve
        // impedir o uso do sistema caso fique indisponível.
        console.warn(`[DOCUMENT DUPLICATE CHECK] Falha ao checar duplicidade de ${kind}:`, error);
        return;
    }

    const match = (Array.isArray(data) ? data[0] : data) as DuplicateDocumentMatch | undefined;
    if (!match) return;

    const label = LABEL_BY_KIND[kind];
    const orgText = match.organization_name
        ? `na organização "${match.organization_name}"`
        : match.organization_id
            ? 'em outra organização'
            : 'em "Todas as Organizações"';

    throw new Error(
        `Este CNPJ/CPF já está cadastrado para o ${label} "${match.name}"` +
        `${match.code ? ` (código ${match.code})` : ''} ${orgText}. ` +
        `Não é permitido cadastrar o mesmo CNPJ/CPF duas vezes. Se este ${label} precisa existir em mais de uma organização, ` +
        `edite o cadastro existente em vez de criar um novo.`
    );
}
