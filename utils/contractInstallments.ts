// utils/contractInstallments.ts
//
// Cronograma de um contrato PARCELADO (não recorrente) — a parte pura, sem React.
//
// O contrato guarda o cronograma expandido em `contracts.payment_schedule`
// (`ContractInstallment[]`, uma linha por cobrança), que
// `contractService.syncParceladoScheduleToFinance` materializa em Contas a
// Receber/Pagar. A tela (`ContractModal`, seção Condições de Pagamento) pergunta
// ao usuário o que ele pensa — entrada, quantas parcelas, de quanto em quanto
// tempo, a partir de quando — e este módulo transforma isso nas linhas.
//
// Até 2026-09-21 o `ContractModal` só sabia "N parcelas iguais, uma por mês, a
// partir da data de início": sem entrada e sem periodicidade. E somava meses
// com `Date.setMonth`, que transborda (31/jan + 1 = 03/mar). A aritmética de
// datas aqui é a de `utils/paymentPlan.ts` (`somarMeses`), já usada pelo Plano
// de Pagamento da negociação.
import type { ContractInstallment } from '../types/contracts';
import { mesesEntre, somarMeses } from './paymentPlan';

/** Periodicidades oferecidas na tela, com o intervalo em meses e o código do
 *  Tipo de Pagamento (`constants/paymentTypes.ts`) gravado em cada parcela —
 *  é o que a coluna "Tipo" de Contas a Receber mostra. */
export const PERIODICIDADES_CONTRATO = [
    { value: 'Mensal',     meses: 1,  tipo: 'MENSAL' },
    { value: 'Bimestral',  meses: 2,  tipo: 'BIMESTRAL' },
    { value: 'Trimestral', meses: 3,  tipo: 'TRIMESTRAL' },
    { value: 'Semestral',  meses: 6,  tipo: 'SEMESTRAL' },
    { value: 'Anual',      meses: 12, tipo: 'ANUAL' },
] as const;

export type PeriodicidadeContrato = (typeof PERIODICIDADES_CONTRATO)[number]['value'];

/** Código do tipo da linha de entrada — o mesmo que a negociação usa para o sinal. */
export const TIPO_ENTRADA = 'SINAL';

export interface ParametrosCronograma {
    /** Valor total do contrato (entrada + parcelas). */
    total: number;
    /** Entrada/sinal; 0 = sem entrada. */
    entrada: number;
    /** `YYYY-MM-DD` da entrada (ignorado quando `entrada` é 0). */
    vencimentoEntrada: string;
    /** Quantas parcelas iguais depois da entrada (≥ 1). */
    parcelas: number;
    periodicidade: PeriodicidadeContrato;
    /** `YYYY-MM-DD` da 1ª parcela. */
    primeiroVencimento: string;
}

const dois = (n: number) => Number(n.toFixed(2));

export const periodicidadePorMeses = (meses: number): PeriodicidadeContrato | null =>
    PERIODICIDADES_CONTRATO.find(p => p.meses === meses)?.value ?? null;

const infoDaPeriodicidade = (p: PeriodicidadeContrato) =>
    PERIODICIDADES_CONTRATO.find(x => x.value === p) ?? PERIODICIDADES_CONTRATO[0];

/**
 * Gera o cronograma: [entrada?] + N parcelas iguais espaçadas pela periodicidade.
 *
 * As parcelas dividem `total − entrada`; a divisão é truncada em centavos e a
 * sobra vai para a ÚLTIMA parcela, para a soma fechar exatamente no total (mesma
 * regra do gerador antigo). Entrada maior ou igual ao total dá parcelas de zero —
 * a tela avisa; aqui não se inventa valor.
 */
export function gerarCronogramaContrato(p: ParametrosCronograma): ContractInstallment[] {
    const total = Math.max(0, Number(p.total) || 0);
    const entrada = Math.min(total, Math.max(0, Number(p.entrada) || 0));
    const n = Math.max(1, Math.floor(Number(p.parcelas) || 1));
    const { meses, tipo } = infoDaPeriodicidade(p.periodicidade);

    const linhas: ContractInstallment[] = [];
    if (entrada > 0) {
        linhas.push({ date: p.vencimentoEntrada, value: dois(entrada), installment_type: TIPO_ENTRADA });
    }

    const restante = dois(total - entrada);
    const base = Math.floor((restante / n) * 100) / 100;
    const sobra = dois(restante - base * n);
    for (let i = 0; i < n; i++) {
        linhas.push({
            date: somarMeses(p.primeiroVencimento, meses * i),
            value: i === n - 1 ? dois(base + sobra) : base,
            installment_type: tipo,
        });
    }
    return linhas;
}

/**
 * Caminho inverso: lê os parâmetros a partir de um cronograma salvo, para a
 * tela reabrir o contrato com os campos preenchidos.
 *
 * A entrada é a linha de tipo `SINAL` (ou, num cronograma antigo sem tipo,
 * nenhuma). A periodicidade vem da distância entre as duas primeiras parcelas;
 * se não bater com nenhuma das oferecidas (cronograma editado à mão), cai em
 * Mensal — os campos são só o ponto de partida; a lista continua sendo a verdade.
 * `null` quando não há cronograma.
 */
export function lerParametrosDoCronograma(
    schedule: ContractInstallment[] | undefined | null,
): Omit<ParametrosCronograma, 'total'> | null {
    const linhas = (schedule || []).filter(l => l && l.date);
    if (linhas.length === 0) return null;

    const entradaLinha = linhas.find(l => l.installment_type === TIPO_ENTRADA);
    const parcelas = linhas.filter(l => l !== entradaLinha);
    const primeira = parcelas[0] ?? entradaLinha!;

    let periodicidade: PeriodicidadeContrato = 'Mensal';
    if (parcelas.length >= 2) {
        periodicidade = periodicidadePorMeses(mesesEntre(parcelas[0].date, parcelas[1].date)) ?? 'Mensal';
    }

    return {
        entrada: entradaLinha ? dois(Number(entradaLinha.value) || 0) : 0,
        vencimentoEntrada: entradaLinha?.date ?? primeira.date,
        parcelas: Math.max(1, parcelas.length),
        periodicidade,
        primeiroVencimento: primeira.date,
    };
}

/** Soma das linhas, em centavos exatos. */
export const somaDoCronograma = (schedule: ContractInstallment[]): number =>
    dois(schedule.reduce((s, l) => s + (Number(l.value) || 0), 0));
