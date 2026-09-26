/**
 * Baixa de Contas a Receber com recibo — regras puras do painel de baixa
 * (`components/financeiro/BaixaRecebivelSheet.tsx`). Plano:
 * docs/planos/2026-09-26-contas-receber-recibo-na-baixa.md
 */
import type { ReceivablePaymentType } from '../types/financial';

/** Vocabulário de `internal_transactions.payment_type` — o mesmo da parcela do
 *  plano de pagamento (DealModal). */
export const FORMAS_PAGAMENTO: { value: ReceivablePaymentType; label: string }[] = [
    { value: 'PIX', label: 'PIX' },
    { value: 'TED', label: 'TED' },
    { value: 'DOC', label: 'DOC' },
    { value: 'DINHEIRO', label: 'Dinheiro' },
    { value: 'CHEQUE', label: 'Cheque' },
    { value: 'PERMUTA', label: 'Permuta' },
];

/** Hoje em 'YYYY-MM-DD' no fuso do navegador. `toISOString()` é UTC: depois das
 *  21h em Brasília já devolve o dia seguinte. */
export function hojeLocal(agora: Date = new Date()): string {
    const y = agora.getFullYear();
    const m = String(agora.getMonth() + 1).padStart(2, '0');
    const d = String(agora.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Por que o botão "Confirmar recebimento" está desligado — `null` quando pode
 * confirmar. Botão desligado sem motivo é lido como defeito.
 */
export function motivoBaixaBloqueada(dataPagamento: string, hoje: string): string | null {
    if (!dataPagamento) return 'Informe a data do pagamento.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) return 'Data do pagamento inválida.';
    if (dataPagamento > hoje) return 'A data do pagamento não pode ser futura.';
    return null;
}

export interface ResultadoBaixa {
    baixados: number;
    /** Nomes dos títulos cuja baixa falhou. */
    falhasBaixa: string[];
    emitirRecibo: boolean;
    recibos: number;
    /** Nomes dos títulos baixados cujo recibo não saiu. */
    falhasRecibo: string[];
    /** Recibos entregues ao navegador mas não guardados no Storage. */
    naoGuardados: number;
}

/** Texto do toast depois da baixa (1 título ou lote), e se é erro. */
export function mensagemResultadoBaixa(r: ResultadoBaixa): { texto: string; erro: boolean } {
    const partes: string[] = [];
    if (r.baixados > 0) {
        partes.push(r.baixados === 1 ? '1 título baixado' : `${r.baixados} títulos baixados`);
    }
    if (r.emitirRecibo && r.recibos > 0) {
        partes.push(r.recibos === 1 ? '1 recibo emitido' : `${r.recibos} recibos emitidos`);
    }
    if (r.falhasBaixa.length) {
        partes.push(`baixa falhou em ${r.falhasBaixa.length}: ${r.falhasBaixa.join(', ')}`);
    }
    if (r.falhasRecibo.length) {
        partes.push(`recibo não gerado para ${r.falhasRecibo.join(', ')} — use o botão Recibo na linha`);
    }
    if (r.naoGuardados > 0) {
        partes.push(r.naoGuardados === 1
            ? 'o PDF foi baixado mas não ficou guardado; reimprima para guardar'
            : `${r.naoGuardados} PDFs baixados mas não guardados; reimprima para guardar`);
    }
    const texto = partes.length ? partes.join(' · ') : 'Nada foi baixado.';
    return {
        texto: texto.charAt(0).toUpperCase() + texto.slice(1) + (texto.endsWith('.') ? '' : '.'),
        erro: r.falhasBaixa.length > 0 || r.falhasRecibo.length > 0 || r.baixados === 0,
    };
}
