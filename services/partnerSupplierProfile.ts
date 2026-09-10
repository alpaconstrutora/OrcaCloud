import { Supplier } from '../types';
import { SupplierBankAccount } from '../types/supplierBankAccount';

/**
 * Payload de "Meus dados" do Portal do Parceiro — o cadastro que a construtora
 * tem do parceiro (mesma linha de Minha Organização › Meus Fornecedores) mais
 * as contas bancárias ativas.
 *
 * Vive aqui, e não dentro de um dos dois services, porque os DOIS modos do
 * portal leem o mesmo núcleo (`partner_ws_supplier_profile`) por cascas
 * diferentes: `partnerService` no app, `partnerPortalTokenService` no link.
 * Duas normalizações do mesmo payload divergem — é o que aconteceu com a
 * leitura de Documentos, e o conserto foi justamente fundir num corpo só.
 */
export interface PartnerSupplierProfile {
    supplier: Supplier | null;
    bankAccounts: SupplierBankAccount[];
}

export const EMPTY_SUPPLIER_PROFILE: PartnerSupplierProfile = {
    supplier: null,
    bankAccounts: [],
};

/**
 * `valid: false` (token expirado, workspace fora do alcance) vira perfil vazio,
 * não exceção: o painel já sabe desenhar "cadastro indisponível", e derrubar a
 * tela inteira por causa de um painel de conta seria pior.
 */
export function normalizeSupplierProfile(data: unknown): PartnerSupplierProfile {
    const payload = data as {
        valid?: boolean;
        supplier?: Supplier | null;
        bank_accounts?: SupplierBankAccount[] | null;
    } | null;

    if (!payload?.valid) return EMPTY_SUPPLIER_PROFILE;

    return {
        supplier: payload.supplier ?? null,
        bankAccounts: payload.bank_accounts ?? [],
    };
}
