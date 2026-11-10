// utils/jurosParcelamento.ts
//
// Parcelamento COM JUROS de uma negociação (Tabela Price e SAC) — a parte pura,
// sem React nem Supabase. Quem não cobra juros continua em `montarPlanoRapido`
// (utils/paymentPlan.ts); este módulo só entra quando há taxa.
//
// Regras do cálculo:
// - A taxa é AO MÊS (`1` = 1% a.m.). Periodicidade de k meses usa a taxa
//   equivalente `r = (1 + i)^k − 1`, não `i × k`.
// - A ENTRADA não paga juros: a base financiada é `precoSemJuros − entrada`.
// - Carência: o saldo cresce à taxa mensal entre a Data Efetiva (`dataBase`) e a
//   data em que a PRIMEIRA parcela deixa de ser "o primeiro período", ou seja,
//   `base × (1 + i)^(meses − intervalo)`. O juro dessa carência
//   (`baseAjustada − base`) é tirado do principal das primeiras linhas e somado
//   ao juros delas até esgotar — assim Σ principal = base EXATAMENTE.
// - Tudo em centavos inteiros (a parcela é arredondada UMA vez); a ÚLTIMA linha
//   absorve o resíduo: `saldo + juros`. Σ juros = Σ parcelas − base.
import { BlocoPagamento, somarMeses, mesesEntre } from './paymentPlan';

export type SistemaAmortizacao = 'PRICE' | 'SAC';

export interface PlanoComJuros {
    /** Preço de tabela, sem juros — entrada + principal financiado. */
    precoSemJuros: number;
    /** Entrada/sinal; não paga juros. */
    entrada: number;
    parcelas: number;
    /** Código do tipo da série (`MENSAL`, `TRIMESTRAL`, `CUSTOM_*`…). */
    tipo: string;
    intervaloMeses: number;
    /** Vencimento da primeira parcela, `YYYY-MM-DD`. */
    primeiroVencimento: string;
    /** Data Efetiva da negociação, `YYYY-MM-DD` — de onde os juros começam a correr. */
    dataBase: string;
    /** Taxa ao mês em %, `1` = 1% a.m. */
    taxaMensal: number;
    sistema: SistemaAmortizacao;
}

export interface LinhaComJuros {
    vencimento: string;
    valor: number;
    juros: number;
    principal: number;
}

const dois = (n: number) => Number(n.toFixed(2));
/** Reais → centavos inteiros. */
const emCentavos = (n: number) => Math.round(n * 100);
const deCentavos = (c: number) => c / 100;

/**
 * Gera as linhas (vencimento, valor, juros, principal) do parcelamento.
 * Taxa 0 não quebra: devolve parcelas iguais (a última absorve o resíduo) e
 * juros 0 — mas quem não tem juros deve seguir usando `montarPlanoRapido`.
 */
export function calcularParcelasComJuros(p: PlanoComJuros): LinhaComJuros[] {
    const n = Math.max(1, Math.floor(Number(p.parcelas) || 1));
    const k = Math.max(1, Math.floor(Number(p.intervaloMeses) || 1));
    const i = Math.max(0, Number(p.taxaMensal) || 0) / 100;
    const preco = Math.max(0, Number(p.precoSemJuros) || 0);
    const entrada = Math.min(preco, Math.max(0, Number(p.entrada) || 0));
    const baseC = emCentavos(preco - entrada);

    const r = Math.pow(1 + i, k) - 1;
    // Meses de carência além do primeiro período; nunca negativo (não desconta).
    const mesesCarencia = Math.max(0, mesesEntre(p.dataBase, p.primeiroVencimento) - k);
    const baseAjustadaC = Math.round(baseC * Math.pow(1 + i, mesesCarencia));

    // Juros da carência ainda a tirar do principal das primeiras linhas.
    let carenciaRestante = baseAjustadaC - baseC;

    // Parcela fixa (Price) / amortização fixa (SAC), em centavos.
    const pmtC = r === 0
        ? Math.round(baseAjustadaC / n)
        : Math.round((baseAjustadaC * r) / (1 - Math.pow(1 + r, -n)));
    const amortSacC = Math.floor(baseAjustadaC / n);

    const linhas: LinhaComJuros[] = [];
    let saldoC = baseAjustadaC;
    for (let j = 0; j < n; j++) {
        const jurosC = Math.round(saldoC * r);
        const ultima = j === n - 1;
        const amortC = ultima
            ? saldoC
            : p.sistema === 'SAC' ? amortSacC : pmtC - jurosC;
        const valorC = amortC + jurosC;
        saldoC -= amortC;

        // Move o juros da carência do principal para o juros da linha.
        const mover = Math.min(carenciaRestante, Math.max(0, amortC));
        carenciaRestante -= mover;

        linhas.push({
            vencimento: somarMeses(p.primeiroVencimento, k * j),
            valor: deCentavos(valorC),
            juros: deCentavos(jurosC + mover),
            principal: deCentavos(amortC - mover),
        });
    }
    return linhas;
}

/**
 * Agrupa as linhas em blocos de valor igual consecutivo (Price: N−1 iguais + a
 * última; SAC: normalmente 1× por parcela), no formato que a tela já usa. Cada
 * bloco leva `juros[]`/`principal[]` por parcela, na ordem das linhas.
 */
export function montarPlanoComJuros(p: PlanoComJuros): {
    entrada: number;
    blocos: (BlocoPagamento & { juros?: number[]; principal?: number[] })[];
    totalComJuros: number;
    totalJuros: number;
} {
    const preco = Math.max(0, Number(p.precoSemJuros) || 0);
    const entrada = dois(Math.min(preco, Math.max(0, Number(p.entrada) || 0)));
    const intervalo = Math.max(1, Math.floor(Number(p.intervaloMeses) || 1));
    const linhas = calcularParcelasComJuros(p);

    const blocos: (BlocoPagamento & { juros?: number[]; principal?: number[] })[] = [];
    for (const l of linhas) {
        const atual = blocos[blocos.length - 1];
        if (atual && atual.valorParcela === l.valor) {
            atual.quantidade += 1;
            atual.juros!.push(l.juros);
            atual.principal!.push(l.principal);
        } else {
            blocos.push({
                tipo: p.tipo,
                quantidade: 1,
                valorParcela: l.valor,
                primeiroVencimento: l.vencimento,
                intervaloMeses: intervalo,
                juros: [l.juros],
                principal: [l.principal],
            });
        }
    }

    const somaParcelas = dois(linhas.reduce((s, l) => s + l.valor, 0));
    const somaJuros = dois(linhas.reduce((s, l) => s + l.juros, 0));
    return { entrada, blocos, totalComJuros: dois(entrada + somaParcelas), totalJuros: somaJuros };
}
