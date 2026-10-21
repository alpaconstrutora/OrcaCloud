/**
 * Quem a Edição em Lote pode aprovar e lançar em Contas a Pagar, e com qual
 * fornecedor (21/10/2026 — docs/planos/2026-10-21-boleto-lote-aprovar-sem-alterar.md).
 *
 * Por que existe: o "Aprovar e Lançar" do lote passou a funcionar SEM alteração
 * de campo. Duas coisas que antes ficavam escondidas atrás da edição viraram
 * um clique:
 * - `aprovarECriarInvoice` não confere status — um boleto pago ou cancelado
 *   selecionado junto voltaria a "aprovado";
 * - o lote não usava o fornecedor SUGERIDO, que a página do boleto já usa
 *   (`BoletoFormModal`) — os 14 boletos Energisa capturados por e-mail têm só
 *   a sugestão e cairiam todos em "Selecione um fornecedor".
 *
 * A MESMA função decide a janela (contagem, motivo por boleto, botão) e o
 * serviço (o que de fato é gravado) — para a tela não prometer o que o lote
 * recusa.
 */
import type { BoletoStatus } from '../types';
import { STATUS_LABELS } from './boletoStatus';

export const MOTIVO_SEM_VENCIMENTO = 'Informe o vencimento antes de aprovar — é ele que define a competência do título.';
export const MOTIVO_SEM_FORNECEDOR = 'Selecione um fornecedor antes de aprovar.';
export const MOTIVO_SEM_VALOR = 'Informe o valor antes de aprovar — o título nasceria sem valor.';

const APROVAVEIS: readonly BoletoStatus[] = ['rascunho', 'revisao'];

export function motivoDoStatus(status: BoletoStatus): string {
    return `Só boleto em rascunho ou em revisão é aprovado — este está "${STATUS_LABELS[status] ?? status}".`;
}

export interface BoletoParaAprovar {
    status: BoletoStatus;
    supplier_id?: string | null;
    sugestao_supplier_id?: string | null;
    vencimento?: string | null;
    valor?: number | null;
}

/** Só o que importa aqui dos campos do lote: `supplier_id` presente = escolhido (null = "Sem vínculo"). */
export interface CamposDoLote {
    supplier_id?: string | null;
}

export type AvaliacaoDeAprovacao =
    | { pronto: true; fornecedor: string; usaSugestao: boolean }
    | { pronto: false; motivo: string };

/** Fornecedor com que o boleto seria lançado: o do lote, senão o do boleto, senão o sugerido. */
function fornecedorEfetivo(b: BoletoParaAprovar, campos: CamposDoLote): { id: string | null; sugestao: boolean } {
    if ('supplier_id' in campos) return { id: campos.supplier_id ?? null, sugestao: false };
    if (b.supplier_id) return { id: b.supplier_id, sugestao: false };
    if (b.sugestao_supplier_id) return { id: b.sugestao_supplier_id, sugestao: true };
    return { id: null, sugestao: false };
}

export function avaliarAprovacaoEmLote(b: BoletoParaAprovar, campos: CamposDoLote): AvaliacaoDeAprovacao {
    if (!APROVAVEIS.includes(b.status)) return { pronto: false, motivo: motivoDoStatus(b.status) };
    const fornecedor = fornecedorEfetivo(b, campos);
    if (!fornecedor.id) return { pronto: false, motivo: MOTIVO_SEM_FORNECEDOR };
    if (!b.vencimento) return { pronto: false, motivo: MOTIVO_SEM_VENCIMENTO };
    if (!(Number(b.valor) > 0)) return { pronto: false, motivo: MOTIVO_SEM_VALOR };
    return { pronto: true, fornecedor: fornecedor.id, usaSugestao: fornecedor.sugestao };
}

export interface ResumoDaAprovacao {
    prontos: number;
    comSugestao: number;
    pendencias: Array<{ id: string; motivo: string }>;
    porId: Map<string, AvaliacaoDeAprovacao>;
}

export function resumoDaAprovacaoEmLote(
    boletos: Array<BoletoParaAprovar & { id: string }>,
    campos: CamposDoLote,
): ResumoDaAprovacao {
    const porId = new Map<string, AvaliacaoDeAprovacao>();
    const pendencias: Array<{ id: string; motivo: string }> = [];
    let prontos = 0;
    let comSugestao = 0;
    for (const b of boletos) {
        const a = avaliarAprovacaoEmLote(b, campos);
        porId.set(b.id, a);
        if (a.pronto) {
            prontos++;
            if (a.usaSugestao) comSugestao++;
        } else {
            pendencias.push({ id: b.id, motivo: a.motivo });
        }
    }
    return { prontos, comSugestao, pendencias, porId };
}
