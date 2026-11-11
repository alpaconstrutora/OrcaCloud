/**
 * Cronograma de aportes e distribuições (item 4.3 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). Função pura sobre o
 * fluxo do acionista; o motor a chama e a tela lê `ImovibMathResult.aportes`.
 * Testes: __tests__/imovibAportes.test.ts.
 *
 * Regra: aporta quando o caixa ficaria abaixo do mínimo; distribui o que excede o
 * mínimo mais o que os meses seguintes ainda vão consumir. No último mês a SPE
 * devolve todo o caixa (o mínimo não precisa mais ficar).
 */

export interface LinhaDeAporte {
    /** Mês do estudo (1 = primeiro). */
    mes: number;
    aporte: number;
    distribuicao: number;
    /** Caixa no fim do mês, depois do aporte e da distribuição. */
    caixa: number;
}

export function aportesEDistribuicoes(fluxoDoAcionista: number[], caixaMinimo: number): LinhaDeAporte[] {
    const n = fluxoDoAcionista.length;
    const minimo = Math.max(0, caixaMinimo || 0);

    // Reserva depois do mês i: quanto os meses seguintes consomem antes de
    // voltarem a gerar caixa. Calculada de trás para frente.
    const reserva = new Array<number>(n).fill(0);
    for (let i = n - 2; i >= 0; i--) reserva[i] = Math.max(0, reserva[i + 1] - fluxoDoAcionista[i + 1]);

    const linhas: LinhaDeAporte[] = [];
    let caixa = 0;
    for (let i = 0; i < n; i++) {
        const ultimo = i === n - 1;
        const piso = ultimo ? 0 : minimo;
        caixa += fluxoDoAcionista[i];
        let aporte = 0;
        if (caixa < piso) {
            aporte = piso - caixa;
            caixa = piso;
        }
        const distribuicao = ultimo ? caixa : Math.max(0, caixa - minimo - reserva[i]);
        caixa -= distribuicao;
        linhas.push({ mes: i + 1, aporte, distribuicao, caixa });
    }
    return linhas;
}
