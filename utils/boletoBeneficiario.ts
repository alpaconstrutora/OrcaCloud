/**
 * Quem recebe um boleto — o nome que as telas e as exportações mostram na coluna
 * "Beneficiário". Puro.
 *
 * 16/10/2026 (pedido do usuário, com print): boletos da captura por e-mail
 * apareciam com o NOME DO ARQUIVO no Beneficiário ("ALPA CONSTRUTORA - PARC.
 * FEDERAIS - 06-2026.pdf", "Receipt-….pdf"). Nada gravava o arquivo como
 * beneficiário: era a exibição que caía em `documento_nome` quando não havia
 * fornecedor nem nome lido do PDF. O arquivo já tem a coluna "Documento".
 * Decisão do usuário: sem fornecedor confirmado, mostrar o SUGERIDO em cinza.
 * Plano: docs/planos/2026-10-16-captura-padroes-do-remetente.md (passo H).
 */
import type { Boleto } from '../types';

export type OrigemBeneficiario = 'fornecedor' | 'boleto' | 'sugerido' | 'nenhum';

/** Tira o " - CNPJ: 00.000…" / número colado que o PDF às vezes junta ao nome. */
export function limparNomeDoBeneficiario(nome: string | null | undefined): string | null {
    if (!nome) return null;
    const limpo = nome
        .replace(/[\s\-–]+(?:CNPJ|CPF)[:\s]*[\d.\/\-]+.*/i, '')
        .replace(/\s+\d{11,14}\b.*/g, '')
        .trim();
    return limpo || nome.trim() || null;
}

/**
 * Ordem: fornecedor confirmado → nome lido do boleto → fornecedor sugerido.
 * NUNCA o nome do arquivo.
 */
export function beneficiarioDoBoleto(
    b: Pick<Boleto, 'supplier_id' | 'sugestao_supplier_id' | 'beneficiario_nome'>,
    nomesFornecedor: Record<string, string>,
): { nome: string | null; origem: OrigemBeneficiario } {
    if (b.supplier_id && nomesFornecedor[b.supplier_id]) return { nome: nomesFornecedor[b.supplier_id], origem: 'fornecedor' };
    const doBoleto = limparNomeDoBeneficiario(b.beneficiario_nome);
    if (doBoleto) return { nome: doBoleto, origem: 'boleto' };
    if (!b.supplier_id && b.sugestao_supplier_id && nomesFornecedor[b.sugestao_supplier_id]) {
        return { nome: nomesFornecedor[b.sugestao_supplier_id], origem: 'sugerido' };
    }
    return { nome: null, origem: 'nenhum' };
}

/** Para texto corrido (exportação, lista de lote): o nome, ou "—". */
export function nomeDoBeneficiario(
    b: Pick<Boleto, 'supplier_id' | 'sugestao_supplier_id' | 'beneficiario_nome'>,
    nomesFornecedor: Record<string, string>,
): string {
    return beneficiarioDoBoleto(b, nomesFornecedor).nome ?? '—';
}
