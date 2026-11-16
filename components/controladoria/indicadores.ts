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

/** Eixo em unidade compacta (§28.2): "R$ 12 mil", "R$ 1,2 mi". O valor exato fica
 *  no tooltip e na tabela. */
export function formatBRLCompacto(v: number): string {
    const a = Math.abs(v);
    const sinal = v < 0 ? '-' : '';
    if (a >= 1_000_000) return `${sinal}R$ ${(a / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    // Uma casa abaixo de 10 mil: com zero casas, as marcas 2.500/3.750/5.000 viravam
    // "3 mil", "4 mil", "5 mil" — o eixo pulava de um jeito que o dado não pula.
    if (a >= 1_000)     return `${sinal}R$ ${(a / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: a < 10_000 ? 1 : 0 })} mil`;
    return brl(v);
}
