import type { KpiTom } from '../ui/KpiCard';

// Indicadores das abas da Controladoria — painel ANALÍTICO, então `KpiCard destaque`
// (guia §4.5): valor neutro, e a cor só aparece por limiar escrito aqui, num lugar
// só. Antes eram quatro cards feitos à mão, um por aba, com rótulo em caixa alta e o
// valor vermelho por "está negativo" sem nome (plano
// docs/planos/2026-11-14-controladoria-critica.md, passo 4).

export const LIMIAR = {
    /** Resultado (lucro bruto, EBITDA, resultado líquido, recebido − pago) abaixo
     *  disto é alerta. Zero: prejuízo é o limiar natural de um resultado. */
    resultadoAlerta: 0,
    /** Saldo de caixa (realizado ou com o previsto) abaixo disto é alerta. */
    saldoAlerta: 0,
} as const;

export function tomDoResultado(valor: number): KpiTom {
    return valor < LIMIAR.resultadoAlerta ? 'alerta' : 'neutro';
}

export function tomDoSaldo(valor: number): KpiTom {
    return valor < LIMIAR.saldoAlerta ? 'alerta' : 'neutro';
}

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "-50,0%" em pt-BR; null → "—". */
export function pctBR(v: number | null): string {
    if (v === null) return '—';
    return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** Grade do §4.5: 1 coluna no celular (o valor não se espreme nem quebra), 2 a partir
 *  de sm, até 4 lado a lado em telas largas. */
export const GRADE_DE_INDICADORES = 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-3';
