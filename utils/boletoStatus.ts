import type { BoletoStatus } from '../types';

// Fonte única do vocabulário/cor de status de boleto — consumida por
// BoletoManager.tsx (tabela) e BoletoFormModal.tsx (cabeçalho do modal).
// Extraído de BoletoManager.tsx para não criar import circular entre os dois.
export const STATUS_LABELS: Record<BoletoStatus, string> = {
    rascunho: 'Rascunho',
    revisao: 'Em revisão',
    aprovado: 'Aprovado',
    programado: 'Programado',
    pago: 'Pago',
    cancelado: 'Cancelado',
};

/* ─── Campo Status da página do boleto (23/10/2026) ───────────────────────
   Decisão do usuário: trocar o status segue o FLUXO, não o rótulo. Cada
   mudança faz o mesmo que o botão correspondente — Aprovado lança o título,
   Pago dá baixa, voltar a Rascunho estorna (apaga título e nota), Cancelar
   cancela título e nota. Plano: docs/planos/2026-10-23-boleto-status-editavel.md */

/** O que a mudança faz: `rotulo` = nada no financeiro. */
export type EfeitoDaTransicao = 'rotulo' | 'aprovar' | 'pagar' | 'estornar' | 'cancelar';

export interface TransicaoDeStatus {
    para: BoletoStatus;
    efeito: EfeitoDaTransicao;
    /** Frase mostrada antes de confirmar: o que acontece no financeiro. */
    descricao: string;
    /** Mexe no financeiro → a tela pede confirmação antes. */
    confirmar: boolean;
}

export const MOTIVO_STATUS_PROGRAMADO =
    'Em pagamento pela Asaas — o status muda sozinho quando o banco confirmar. Para desistir, cancele o pagamento em Contas a Pagar › Parcelas (o boleto volta a Aprovado).';

const NADA_NO_FINANCEIRO = 'Nada muda no financeiro.';

/**
 * Mudanças válidas a partir do status atual. `temLancamento` = o boleto tem
 * título/nota (aprovado, pago, ou cancelado depois de aprovado).
 */
export function transicoesDoBoleto(status: BoletoStatus, temLancamento: boolean): TransicaoDeStatus[] {
    const aprovar: TransicaoDeStatus = {
        para: 'aprovado', efeito: 'aprovar', confirmar: true,
        descricao: 'Cria o título em Contas a Pagar e o envia para a alçada.',
    };
    const cancelar: TransicaoDeStatus = {
        para: 'cancelado', efeito: 'cancelar', confirmar: true,
        descricao: temLancamento
            ? 'O título em Contas a Pagar e a nota ficam cancelados (saem do que há a pagar) e o boleto fica no histórico.'
            : 'O boleto fica cancelado no histórico. ' + NADA_NO_FINANCEIRO,
    };
    const estornar = (extra = ''): TransicaoDeStatus => ({
        para: 'rascunho', efeito: 'estornar', confirmar: true,
        descricao: temLancamento
            ? `O título e a nota deste boleto são apagados de Contas a Pagar${extra}; o boleto volta a rascunho e pode ser editado e aprovado de novo.`
            : 'O boleto volta a rascunho e pode ser editado e aprovado de novo. ' + NADA_NO_FINANCEIRO,
    });
    switch (status) {
        case 'rascunho':
            return [{ para: 'revisao', efeito: 'rotulo', confirmar: false, descricao: 'Marca o boleto para revisão. ' + NADA_NO_FINANCEIRO }, aprovar, cancelar];
        case 'revisao':
            return [{ para: 'rascunho', efeito: 'rotulo', confirmar: false, descricao: 'Tira o boleto da revisão. ' + NADA_NO_FINANCEIRO }, aprovar, cancelar];
        case 'aprovado':
            return [
                { para: 'pago', efeito: 'pagar', confirmar: true, descricao: 'Dá baixa no título em Contas a Pagar com a data de hoje.' },
                estornar(),
                cancelar,
            ];
        case 'pago':
            return [estornar(' e o valor sai do realizado')];
        case 'cancelado':
            return [estornar()];
        case 'programado':
        default:
            return [];
    }
}

/** Por que o status não pode mudar pela tela (campo desligado), ou null. */
export function motivoSemTransicao(status: BoletoStatus): string | null {
    return status === 'programado' ? MOTIVO_STATUS_PROGRAMADO : null;
}

// Padrão guia seção 8 — texto simples, sem pílula
export const STATUS_TEXT_COLORS: Record<BoletoStatus, string> = {
    rascunho: 'text-gray-700',
    revisao: 'text-amber-700',
    aprovado: 'text-blue-700',
    programado: 'text-indigo-700',
    pago: 'text-emerald-700',
    cancelado: 'text-red-700',
};
