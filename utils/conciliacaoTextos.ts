/**
 * Conciliação › Dashboard — textos que dependem do número (passo 4 do plano
 * docs/planos/2026-10-28-conciliacao-dashboard-confianca.md). Puros para poderem ser testados:
 * "lançamento(s)" e um alerta vermelho que se desmentia na frase seguinte eram o que a
 * crítica de 28/10/2026 apontou.
 */

const numero = (n: number) => n.toLocaleString('pt-BR');

/** "1 lançamento" / "2 lançamentos" — com o número no formato pt-BR. */
export function plural(n: number, um: string, varios: string): string {
    return `${numero(n)} ${n === 1 ? um : varios}`;
}

export interface TextoDaDivergencia {
    /** `esperada`: há baixados sem conferir, que explicam a diferença (âmbar).
     *  `divergencia`: tudo conferido e ainda assim diferente — vínculo faltando ou duplicado (vermelho). */
    tom: 'esperada' | 'divergencia';
    titulo: string;
    /** Para que lado está a diferença. */
    lado: string;
    explicacao: string;
}

/**
 * `diferenca` = saldo conciliado do extrato − saldo baixado no sistema.
 * `soBaixado` = lançamentos baixados no sistema que nunca passaram pelo extrato.
 */
export function textoDaDivergencia(
    diferenca: number,
    ledger: { baixado_count: number; so_baixado_count: number } | null | undefined,
    formatar: (v: number) => string,
): TextoDaDivergencia {
    const valor = formatar(Math.abs(diferenca));
    const lado = diferenca > 0
        ? `O extrato conciliado tem ${valor} a mais que o sistema.`
        : `O sistema tem ${valor} a mais que o extrato conciliado.`;
    const soBaixado = ledger?.so_baixado_count ?? 0;
    if (soBaixado > 0) {
        return {
            tom: 'esperada',
            titulo: `Diferença de ${valor} entre o extrato conciliado e o sistema — esperada por enquanto`,
            lado,
            explicacao:
                `${plural(soBaixado, 'lançamento baixado', 'lançamentos baixados')} no sistema por outra via ` +
                `(cobrança online, boleto ou sync comercial) ${soBaixado === 1 ? 'ainda não foi conferido' : 'ainda não foram conferidos'} ` +
                `no extrato, de ${plural(ledger?.baixado_count ?? 0, 'baixado', 'baixados')}. Conferir esses lançamentos é o que fecha a diferença.`,
        };
    }
    return {
        tom: 'divergencia',
        titulo: `Divergência de ${valor} entre o extrato conciliado e o sistema`,
        lado,
        explicacao: 'Todos os lançamentos baixados já foram conferidos no extrato, então a diferença indica vínculo faltando ou duplicado.',
    };
}
