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
    /** Custo financiável que o banco nunca liberou (exigência de vendas não cumprida a tempo, ou defasagem). */
    naoLiberado: number;
    /** A parte de `naoLiberado` cuja liberação cairia depois do fim do estudo, pela defasagem. */
    naoLiberadoPelaDefasagem: number;
}

export const ROTULO_DOS_JUROS_NA_OBRA: Record<PremissasDoFinanciamento['jurosNaObra'], string> = {
    capitaliza: 'Capitalizados no saldo',
    paga_mensal: 'Pagos todo mês',
};

export const ROTULO_DA_AMORTIZACAO: Record<PremissasDoFinanciamento['amortizaCom'], string> = {
    receitas: 'Toda a receita líquida',
    repasse: 'Só o repasse bancário',
};

export type ChaveDoCapital = 'proprio' | 'divida' | 'vendasNaObra' | 'permuta' | 'terceiros';

export const ROTULO_DO_CAPITAL: Record<ChaveDoCapital, string> = {
    proprio: 'Capital próprio necessário',
    divida: 'Financiamento à produção',
    vendasNaObra: 'Vendas durante a obra',
    permuta: 'Permuta',
    terceiros: 'Outras fontes',
};

/** Uma cor por fonte (aba Capital e Portal do Investidor; próprio e dívida eram as do portal). */
export const COR_DO_CAPITAL: Record<ChaveDoCapital, string> = {
    proprio: '#4f46e5', divida: '#06b6d4', vendasNaObra: '#8b5cf6', permuta: '#f59e0b', terceiros: '#10b981',
};

/**
 * Fatias de cada fonte no dinheiro do empreendimento (item 4.2, decisão D2; as
 * vendas durante a obra desde o item 4B.1), na ordem fixa de ROTULO_DO_CAPITAL.
 * Somam 100%; sem dinheiro nenhum, todas 0.
 */
export function composicaoDoCapital(c: Record<ChaveDoCapital, number>): { chave: ChaveDoCapital; valor: number; pct: number }[] {
    const chaves = Object.keys(ROTULO_DO_CAPITAL) as ChaveDoCapital[];
    const total = chaves.reduce((a, k) => a + Math.max(0, c[k]), 0);
    return chaves.map(chave => ({ chave, valor: c[chave], pct: total > 0 ? (Math.max(0, c[chave]) / total) * 100 : 0 }));
}

export function fluxoDaDivida(
    custoDeObraPorMes: number[],
    receitaLiquidaPorMes: number[],
    repassePorMes: number[],
    vendasAcumuladasPct: number[],
    p: PremissasDoFinanciamento,
    /** Índice do mês em que o saldo que sobrou é quitado (padrão: o último). O pós-obra estende o fluxo além das receitas, mas a dívida acaba com elas. */
    mesDaQuitacao?: number,
): FluxoDaDivida {
    const n = custoDeObraPorMes.length;
    const quitacao = Math.min(n - 1, mesDaQuitacao ?? n - 1);
    const defasagem = Math.max(0, Math.round(p.defasagemDaLiberacao));

    // Quando cada custo poderia ser liberado, só pela defasagem. Custo cuja
    // liberação cairia depois do horizonte não é financiado.
    const agendado = new Array<number>(n).fill(0);
    let ultimoMesDeObra = -1;
    let naoLiberadoPelaDefasagem = 0;
    for (let i = 0; i < n; i++) {
        const financiado = custoDeObraPorMes[i] * p.fracaoDaObra;
        // Custo ou fração negativos (só com dado inválido) não viram liberação
        // negativa — o motor de antes lançava; nenhum estudo real tem esse caso.
        if (!(financiado > 0)) continue;
        ultimoMesDeObra = i;
        if (i + defasagem < n) agendado[i + defasagem] += financiado;
        else naoLiberadoPelaDefasagem += financiado;
    }
    let naoLiberado = naoLiberadoPelaDefasagem;

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
        if (i === quitacao && saldo > 0.005) {
            quitacaoNoFim = saldo;
            saldo = 0;
        }
        juros.push(j);
        pagamento.push(pago);
        saldoFim.push(saldo);
    }

    return { liberacao, pagamento, juros, saldo: saldoFim, quitacaoNoFim, naoLiberado, naoLiberadoPelaDefasagem };
}
