import { supabase } from '../lib/supabase';
import { generateDocumentNumber, DocType, NumberingContext } from './documentNumbering';

/**
 * "Regerar número" de um contrato existente — Configurações do Sistema ›
 * Nomenclatura aplicada a um documento que já existe.
 *
 * Por que é um botão explícito e não automático ao salvar: o número é a
 * identidade do documento (está no papel assinado, no e-mail ao fornecedor, nas
 * referências do financeiro). Renumerar sozinho a cada edição queimaria
 * sequencial e quebraria o rastro. Trocar o centro de custo de um contrato,
 * porém, faz o número deixar de refletir a máscara — daí a ação manual.
 *
 * A trava ("qualquer saída para fora": documento emitido no Portal, enviado
 * para assinatura, ou contrato assinado) mora no BANCO
 * (`fn_contract_number_lock_reason` / `fn_regenerate_contract_number`,
 * migration 20270913000000). Aqui só consultamos o motivo para desabilitar o
 * botão e explicar antes do clique — a garantia é do servidor.
 */

/** `null` = pode regerar. String = motivo do bloqueio, pronto para a tela. */
export async function getNumberLockReason(contractId: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('fn_contract_number_lock_reason', {
        p_contract_id: contractId,
    });
    if (error) throw new Error(`Falha ao verificar se o número pode ser alterado: ${error.message}`);
    return (data as string | null) ?? null;
}

/**
 * Gera um número novo pela máscara vigente e o grava, registrando o anterior em
 * `contract_number_history`. Devolve o número novo.
 *
 * O número é calculado no cliente pelo MESMO motor da criação
 * (`generateDocumentNumber`) — assim a máscara, o escopo do sequencial e a
 * omissão de variável sem valor se comportam de forma idêntica nos dois
 * caminhos. O servidor revalida a trava antes de gravar.
 */
export async function regenerateContractNumber(
    contractId: string,
    docType: DocType,
    organizationId: string,
    ctx: Omit<NumberingContext, 'organizationId'>,
): Promise<string> {
    const bloqueio = await getNumberLockReason(contractId);
    if (bloqueio) throw new Error(bloqueio);

    const novo = await generateDocumentNumber(docType, organizationId, ctx);

    const { data, error } = await supabase.rpc('fn_regenerate_contract_number', {
        p_contract_id: contractId,
        p_new_number: novo,
    });
    if (error) throw new Error(error.message);

    return (data as string) ?? novo;
}

export interface ContractNumberHistoryEntry {
    id: string;
    old_number: string | null;
    new_number: string;
    changed_by: string | null;
    changed_at: string;
}

export async function listNumberHistory(contractId: string): Promise<ContractNumberHistoryEntry[]> {
    const { data, error } = await supabase
        .from('contract_number_history')
        .select('id, old_number, new_number, changed_by, changed_at')
        .eq('contract_id', contractId)
        .order('changed_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ContractNumberHistoryEntry[];
}
