import type { BankTransaction } from '../types';

/**
 * Mudar a ORGANIZAÇÃO de um lançamento do extrato (célula e Edição em Lote da aba Extrato).
 * Pedido de 24/10/2026 — docs/planos/2026-10-24-extrato-mudar-organizacao.md.
 *
 * Mesmas três decisões do "mover boleto de organização" (boletoService.moverParaOrganizacao):
 *  1. Destino = organizações que a CONTA atende (dona + "Atende também") e em que o usuário
 *     grava. É o mesmo conjunto de onde a tela tira Obra/CC/Plano e com que o motor e
 *     `fn_reconcile_match` aceitam título — mover para fora dele deixaria o lançamento
 *     numa org que a própria conta não reconhece.
 *  2. Lançamento conciliado não muda: o vínculo (e o título do outro lado) foi feito com a
 *     org de hoje. Desfaz a conciliação antes.
 *  3. Mover limpa Obra, Centro de Custo e Plano de Contas de OUTRA organização — levar
 *     junto é gravar FK entre organizações. Os da org de destino ficam; categoria e
 *     contraparte são texto e ficam.
 */

/** Status em que a organização fica travada (há vínculo/fechamento feito com a org atual). */
export const STATUS_QUE_TRAVAM_ORGANIZACAO: ReadonlySet<string> = new Set(['MATCHED', 'CONFIRMED', 'TRANSFER', 'LOCKED']);

/** Por que a organização deste lançamento não pode mudar; `null` = pode. */
export function motivoParaNaoMudarOrganizacao(
    tx: Pick<BankTransaction, 'status' | 'organization_id'>,
    destinos: string[],
): string | null {
    if (STATUS_QUE_TRAVAM_ORGANIZACAO.has(tx.status)) {
        return 'Lançamento conciliado: desfaça a conciliação antes de mudar a organização.';
    }
    if (!destinos.some(o => o !== tx.organization_id)) {
        return 'A conta só atende a organização dona. Para lançar em outra, marque "Atende também" na conta (Minha Organização › Contas).';
    }
    return null;
}

/** De que organização é cada dimensão do lançamento (`null`/`undefined` = não se sabe). */
export interface OrgDasDimensoes {
    obra: (id: string) => string | null | undefined;
    centroCusto: (id: string) => string | null | undefined;
    planoContas: (id: string) => string | null | undefined;
}

export type CamposDaMudanca = Pick<BankTransaction, 'organization_id'> & {
    project_id?: null;
    cost_center_id?: null;
    plano_de_contas_id?: null;
};

/**
 * O que gravar para levar `tx` a `destino`, e o nome das dimensões que serão limpas.
 * Dimensão de org DESCONHECIDA (não está nos cadastros carregados) também é limpa:
 * não dá para afirmar que é do destino.
 */
export function planoDaMudanca(
    tx: Pick<BankTransaction, 'project_id' | 'cost_center_id' | 'plano_de_contas_id'>,
    destino: string,
    orgDe: OrgDasDimensoes,
): { campos: CamposDaMudanca; limpos: string[] } {
    const campos: CamposDaMudanca = { organization_id: destino };
    const limpos: string[] = [];
    if (tx.project_id && orgDe.obra(tx.project_id) !== destino) { campos.project_id = null; limpos.push('Obra'); }
    if (tx.cost_center_id && orgDe.centroCusto(tx.cost_center_id) !== destino) { campos.cost_center_id = null; limpos.push('Centro de Custo'); }
    if (tx.plano_de_contas_id && orgDe.planoContas(tx.plano_de_contas_id) !== destino) { campos.plano_de_contas_id = null; limpos.push('Plano de Contas'); }
    return { campos, limpos };
}
