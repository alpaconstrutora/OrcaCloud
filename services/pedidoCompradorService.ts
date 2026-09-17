import { supabase } from '../lib/supabase';
import type { PurchaseOrderComprador } from '../types';
import { enderecoDaEmpresaParaNota } from '../utils/enderecoEmpresa';

/**
 * A empresa compradora de um pedido, como o FORNECEDOR precisa vê-la (razão
 * social, CNPJ, inscrições, endereço) — o que vai na nota fiscal.
 *
 * A RLS de `companies` é "membro da organização", e o fornecedor não é, por
 * nenhuma das duas portas (link público ou sessão logada). Correto: a linha
 * carrega governança e limites de alçada. Então o recorte vem por função
 * (`purchase_order_comprador_json`), embutido no detalhe do portal para o
 * token e chamado direto pela RPC `purchase_order_comprador` para o logado.
 * Migration: aplicar_20270921000024_portal_fornecedor_dados_do_comprador.
 */

/** Uma linha crua de `purchase_order_comprador_json` → camelCase, endereço em linha. */
export const mapCompradorRow = (c: unknown): PurchaseOrderComprador | undefined => {
    const row = c as {
        razao_social?: string; nome_fantasia?: string; cnpj?: string;
        inscricao_estadual?: string; inscricao_municipal?: string;
        endereco_fiscal?: Parameters<typeof enderecoDaEmpresaParaNota>[0];
        endereco_operacional?: Parameters<typeof enderecoDaEmpresaParaNota>[1];
    } | null | undefined;
    if (!row || !row.razao_social) return undefined;
    return {
        razaoSocial: row.razao_social,
        nomeFantasia: row.nome_fantasia || undefined,
        cnpj: row.cnpj || undefined,
        inscricaoEstadual: row.inscricao_estadual || undefined,
        inscricaoMunicipal: row.inscricao_municipal || undefined,
        endereco: enderecoDaEmpresaParaNota(row.endereco_fiscal, row.endereco_operacional),
    };
};

export const pedidoCompradorService = {
    /**
     * Sessão logada (comprador ou fornecedor). `undefined` tanto para "sem
     * permissão" quanto para "pedido sem empresa" — nos dois casos a tela
     * mostra "—", e não há o que o fornecedor possa fazer a respeito.
     */
    async get(orderId: string): Promise<PurchaseOrderComprador | undefined> {
        const { data, error } = await supabase.rpc('purchase_order_comprador', { p_order_id: orderId });
        if (error) throw error;
        return mapCompradorRow(data);
    },
};
