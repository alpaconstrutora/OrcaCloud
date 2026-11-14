import { supabase } from '../lib/supabase';
import type { CamposPropagaveis } from '../utils/clientPropagacao';
import { alteracoesDoFinanceiro, COLUNAS_FINANCEIRO, type PlanoDePropagacao } from './clientPropagacaoService';

/**
 * Propaga a edição de um FORNECEDOR (Meus Fornecedores) para as cópias de texto
 * do cadastro. Pedido de 14/11/2026; plano em
 * docs/planos/2026-11-14-meus-fornecedores-propagar-edicao.md.
 *
 * Medido no banco em 14/11/2026: o único lugar que copia o nome do fornecedor
 * como texto e deve acompanhar o cadastro é o Financeiro (`internal_transactions`,
 * vínculo `supplier_id`; `party_id` entra por garantia, hoje sem linhas próprias).
 * O resto do app (Suprimentos, Contratos, Ativos, Documentos) guarda só o id.
 *
 * Ficam de fora de propósito:
 * - `boletos.beneficiario_nome`, `nfe_invoices.issuer_name` e
 *   `financial_receipts.issuer_name`, porque vêm do documento recebido ou emitido;
 * - `supplier_payments.beneficiary_name` e `supplier_bank_accounts.beneficiary_name`,
 *   porque são o TITULAR da conta bancária, que pode ser outra pessoa.
 *
 * Regras por linha (as mesmas dos clientes, em `alteracoesDoFinanceiro`):
 * - título de origem BOLETO: só o `party_name` muda. O `entity_name` guarda o
 *   beneficiário lido do código, e a conciliação o compara com o extrato
 *   (`utils/reconciliationRules.ts`);
 * - conta a pagar em RASCUNHO fica como está, porque o UPDATE a mandaria
 *   para a aprovação (`mandariaParaAlcada`).
 *
 * Gravar usa o mesmo `clientPropagacaoService.aplicar` (lote, depois linha a
 * linha na recusa; a RLS conta o que voltou).
 */
export const supplierPropagacaoService = {
    /** Lê as cópias e monta o que mudaria, sem gravar nada. */
    async planejar(supplierId: string, campos: CamposPropagaveis): Promise<PlanoDePropagacao> {
        const { data, error } = await supabase
            .from('internal_transactions')
            .select(COLUNAS_FINANCEIRO)
            .or(`supplier_id.eq.${supplierId},party_id.eq.${supplierId}`);
        if (error) throw error;
        const { alteracoes, rascunhosMantidos } = alteracoesDoFinanceiro(data ?? [], campos);
        return { campos, porDestino: alteracoes.length ? { financeiro: alteracoes } : {}, rascunhosMantidos };
    },
};
