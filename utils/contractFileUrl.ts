import type { Contract } from '../types/contracts';

/**
 * Qual arquivo o botão "Ver PDF" de um contrato abre — nos portais (Parceiro:
 * visão do parceiro e visão do gestor).
 *
 * Ordem:
 *  1. assinatura CONCLUÍDA → o PDF assinado que o webhook do `sign-contract`
 *     grava em `signed_contract_url`;
 *  2. senão, a versão EMITIDA mais recente (aba Emissão) — o espelho
 *     `contracts.minuta_versions` só carrega emitidas, em ordem de criação;
 *  3. senão, `signed_contract_url` sozinho: legado do upload "Contrato Assinado
 *     (GED)" que saiu da tela em 03/10/2026 (ex.: contrato 007).
 *
 * Até 04/10/2026 eram duas cópias (PartnerPortal e PartnerWorkspaceManager) com
 * `signed_contract_url` na frente de tudo — o PDF do GED antigo vencia a versão
 * emitida na Emissão. Plano: docs/planos/2026-10-04-portal-parceiro-documentos-do-contrato.md
 */
export function urlDoPdfDoContrato(
    contract: Pick<Contract, 'signed_contract_url' | 'signature_status' | 'minuta_versions'>,
): string | null {
    if (contract.signature_status === 'SIGNED' && contract.signed_contract_url) return contract.signed_contract_url;
    const emitidas = (contract.minuta_versions || []).filter(m => m.emitted !== false && m.url);
    if (emitidas.length > 0) return emitidas[emitidas.length - 1].url;
    return contract.signed_contract_url || null;
}
