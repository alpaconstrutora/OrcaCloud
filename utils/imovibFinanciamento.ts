/**
 * Financiamento à produção com regras de liberação e pagamento (item 4.1 do
 * plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). Função pura;
 * o motor (utils/imovibMotor.ts, aplicarFinanciamento) a chama com as séries do
 * estudo. Testes: __tests__/imovibFinanciamento.test.ts.
 *
 * Os padrões (defasagem 0, sem exigência de vendas, juros capitalizados,
 * amortização com toda a receita líquida) reproduzem o motor de antes da Fase 4,
 * operação por operação — o teste de regressão do motor fica verde sem edição.
 */

export interface PremissasDoFinanciamento {
    /** Fração do custo de obra financiada (0,6 = 60%). */
    fracaoDaObra: number;
    /** Juros do financiamento, fração ao mês. */
    jurosMensal: number;
    /** Meses entre o custo (a medição) e a liberação do banco. */
    defasagemDaLiberacao: number;
    /** % do VGV vendável já vendido antes da primeira liberação (0 = sem exigência). */
    vendasMinimasPct: number;
    jurosNaObra: 'capitaliza' | 'paga_mensal';
    /** Quem amortiza o saldo: toda a receita líquida do mês, ou só o repasse. */
    amortizaCom: 'receitas' | 'repasse';
}

/** Um valor por mês (índice 0 = mês 1), todos ≥ 0. */
export interface FluxoDaDivida {
    liberacao: number[];
    /** Principal amortizado + juros pagos no mês (sem a quitação do fim). */
    pagamento: number[];
    /** Juros que o saldo rendeu no mês (capitalizados ou pagos). */
    juros: number[];
    /** Saldo devedor no fim do mês. */
    saldo: number[];
    /** Saldo que a receita não amortizou, quitado no último mês. */
    quitacaoNoFim: number;
    /** Custo financiável que o banco nunca liberou (exigência de vendas não cumprida a tempo). */
    naoLiberado: number;
}

export function fluxoDaDivida(
    custoDeObraPorMes: number[],
    receitaLiquidaPorMes: number[],
    repassePorMes: number[],
    vendasAcumuladasPct: number[],
    p: PremissasDoFinanciamento,
): FluxoDaDivida {
    const n = custoDeObraPorMes.length;
    const defasagem = Math.max(0, Math.round(p.defasagemDaLiberacao));

    // Quando cada custo poderia ser liberado, só pela defasagem. Custo cuja
    // liberação cairia depois do horizonte não é financiado.
    const agendado = new Array<number>(n).fill(0);
    let ultimoMesDeObra = -1;
    let naoLiberado = 0;
    for (let i = 0; i < n; i++) {
        const financiado = custoDeObraPorMes[i] * p.fracaoDaObra;
        if (!(financiado > 0)) continue;
        ultimoMesDeObra = i;
        if (i + defasagem < n) agendado[i + defasagem] += financiado;
        else naoLiberado += financiado;
    }

    // Exigência de vendas: o banco só libera depois que a venda acumulada chega
    // ao mínimo, e então libera tudo o que estava retido. Depois do fim da obra
    // (mais a defasagem) não há mais medição a liberar.
    const limite = ultimoMesDeObra + defasagem;
    const liberacao = new Array<number>(n).fill(0);
    let retido = 0;
    for (let i = 0; i < n; i++) {
        retido += agendado[i];
        const cumpriu = p.vendasMinimasPct <= 0 || (vendasAcumuladasPct[i] ?? 0) >= p.vendasMinimasPct;
        if (retido > 0 && cumpriu && i <= limite) {
            liberacao[i] = retido;
            retido = 0;
        }
    }
    naoLiberado += retido;

    const pagamento: number[] = [];
    const juros: number[] = [];
    const saldoFim: number[] = [];
    let saldo = 0;
    let quitacaoNoFim = 0;
    for (let i = 0; i < n; i++) {
        const j = saldo * p.jurosMensal;
        let pago = 0;
        // Mesma operação do motor antigo (saldo × (1 + r)), para o padrão dar o mesmo centavo.
        if (p.jurosNaObra === 'capitaliza') saldo = saldo * (1 + p.jurosMensal);
        else pago += j;
        saldo += liberacao[i];

        const disponivel = p.amortizaCom === 'repasse' ? repassePorMes[i] ?? 0 : receitaLiquidaPorMes[i] ?? 0;
        if (disponivel > 0 && saldo > 0) {
            const amortizado = Math.min(saldo, disponivel);
            saldo -= amortizado;
            pago += amortizado;
        }
        if (i === n - 1 && saldo > 0.005) {
            quitacaoNoFim = saldo;
            saldo = 0;
        }
        juros.push(j);
        pagamento.push(pago);
        saldoFim.push(saldo);
    }

    return { liberacao, pagamento, juros, saldo: saldoFim, quitacaoNoFim, naoLiberado };
}
