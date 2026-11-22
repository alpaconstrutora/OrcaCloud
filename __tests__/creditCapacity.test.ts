/**
 * Capacidade de pagamento do Credit Room — a conta pura.
 *
 * O que estes testes protegem: que a renda projetada nasça do mês seguinte à
 * data-base (vencido e "a vencer no mês" ficam FORA da série), que o aluguel
 * venha do contrato e nunca duas vezes (contrato + título), que dado ausente
 * seja `null` (DSCR sem dívida) e não Infinity, e que o valor máximo da
 * operação respeite a maior das 12 primeiras parcelas — a 1ª no SAC.
 */

import { describe, expect, it } from 'vitest';
import {
    CENARIOS_ESTRESSE,
    PARAMETROS_CAPACIDADE_PADRAO,
    alertasDaCarteira,
    aplicarEstresse,
    capacidadeMaxima,
    mesesDoHorizonte,
    qualidadeDaRenda,
    recebidoPorMes,
    rotuloMascarado,
    serieDeRenda,
    type CapacidadeEntrada,
    type LocacaoVigente,
    type SerieMes,
    type TituloCarteira,
} from '../utils/creditCapacity';
import { buildSchedule } from '../utils/debtAmortization';

const DATA_BASE = '2026-11-21';

const titulo = (p: Partial<TituloCarteira> = {}): TituloCarteira => ({
    id: 't', organizationId: 'org', contractId: 'c', natureza: 'VENDA',
    empreendimentoId: 'emp', partyKey: 'p1', dueDate: '2026-12-10', paymentDate: null,
    amount: 1000, recebido: false, ...p,
});

const locacao = (p: Partial<LocacaoVigente> = {}): LocacaoVigente => ({
    contractId: 'l1', organizationId: 'org', empreendimentoId: 'emp', partyKey: 'loc1',
    aluguelMensal: 1500, inicio: '2025-01-01', fim: '2029-01-10', ...p,
});

const entrada = (p: Partial<CapacidadeEntrada> = {}): CapacidadeEntrada => ({
    dataBase: DATA_BASE, horizonte: 3, titulos: [], locacoes: [], despesaMensal: 0,
    servicoAtualPorMes: {}, servicoNovoPorMes: {},
    fluxos: { vendas: true, alugueis: true }, ...p,
});

/** Série sintética: só o que a capacidade lê. */
const mesFixo = (mes: string, renda: number, servicoAtual = 0): SerieMes => ({
    mes, vendas: renda, alugueis: 0, despesa_operacional: 0, renda_liquida: renda,
    servico_atual: servicoAtual, servico_novo: 0, folga: renda - servicoAtual, dscr: null,
});
const serieFixa = (renda: number, n = 12, servicoAtual = 0) =>
    mesesDoHorizonte(DATA_BASE, n).map(m => mesFixo(m, renda, servicoAtual));

describe('creditCapacity', () => {
    it('mesesDoHorizonte começa no mês seguinte e vira o ano', () =>
        expect(mesesDoHorizonte('2026-11-21', 3)).toEqual(['2026-12', '2027-01', '2027-02']));

    it('PARAMETROS_CAPACIDADE_PADRAO traz os valores da spec', () =>
        expect(PARAMETROS_CAPACIDADE_PADRAO).toEqual({
            dscr_minimo: 1.3, taxa_mensal_pct: 1.2, prazo_meses: 60, carencia_meses: 0,
            sistema: 'PRICE', horizonte_meses: 36, haircut_estoque_pct: 30,
            despesa_operacional: true,
        }));

    it('venda aberta entra no mês do vencimento; vencida vai para vencido_na_data_base', () => {
        const r = serieDeRenda(entrada({
            titulos: [
                titulo({ id: 'a', amount: 1000, dueDate: '2026-12-10' }),
                titulo({ id: 'b', amount: 500, dueDate: '2026-11-01' }),
                titulo({ id: 'c', amount: 700, dueDate: '2026-11-28' }),
            ],
        }));
        expect(r.serie).toHaveLength(3);
        expect(r.serie[0].mes).toBe('2026-12');
        expect(r.serie[0].vendas).toBe(1000);
        expect(r.vencido_na_data_base).toBe(500);
        expect(r.a_vencer_mes_corrente).toBe(700);
        // nenhum dos dois entra na série
        expect(r.serie.reduce((a, m) => a + m.vendas, 0)).toBe(1000);
    });

    it('título vencido no próprio dia da data-base conta como vencido', () => {
        const r = serieDeRenda(entrada({ titulos: [titulo({ amount: 300, dueDate: DATA_BASE })] }));
        expect(r.vencido_na_data_base).toBe(300);
        expect(r.a_vencer_mes_corrente).toBe(0);
    });

    it('título recebido não entra na série nem no vencido', () => {
        const r = serieDeRenda(entrada({
            titulos: [titulo({ amount: 900, dueDate: '2026-12-10', recebido: true, paymentDate: '2026-12-09' })],
        }));
        expect(r.serie[0].vendas).toBe(0);
        expect(r.vencido_na_data_base).toBe(0);
    });

    it('aluguel vem do contrato e título futuro de aluguel não conta 2×', () => {
        const r = serieDeRenda(entrada({
            locacoes: [locacao({ aluguelMensal: 1500, fim: '2029-01-10' })],
            titulos: [titulo({ natureza: 'LOCACAO', amount: 1500, dueDate: '2026-12-10' })],
        }));
        expect(r.serie[0].alugueis).toBe(1500);
        expect(r.serie[0].vendas).toBe(0);
    });

    it('locação ativa com fim vencido projeta o horizonte inteiro', () => {
        const r = serieDeRenda(entrada({
            horizonte: 36,
            locacoes: [locacao({ aluguelMensal: 1000, fim: '2025-05-25' })],
        }));
        expect(r.serie).toHaveLength(36);
        expect(r.serie.every(m => m.alugueis === 1000)).toBe(true);
    });

    it('locação com fim no meio do horizonte some depois do fim', () => {
        const r = serieDeRenda(entrada({
            horizonte: 12,
            locacoes: [locacao({ aluguelMensal: 1000, fim: '2027-07-31' })],
        }));
        const porMes = Object.fromEntries(r.serie.map(m => [m.mes, m.alugueis]));
        expect(porMes['2027-07']).toBe(1000);
        expect(porMes['2027-08']).toBe(0);
    });

    it('locação que começa no meio do horizonte só entra a partir do início', () => {
        const r = serieDeRenda(entrada({
            locacoes: [locacao({ aluguelMensal: 800, inicio: '2027-01-15', fim: null })],
        }));
        expect(r.serie.map(m => m.alugueis)).toEqual([0, 800, 800]);
    });

    it('renda zero sem dívida dá dscr null, não Infinity', () => {
        const r = serieDeRenda(entrada());
        expect(r.serie.every(m => m.dscr === null)).toBe(true);
        expect(r.serie.every(m => m.folga === 0)).toBe(true);
    });

    it('dscr = renda líquida ÷ (serviço atual + novo) e folga = renda − serviços', () => {
        const r = serieDeRenda(entrada({
            titulos: [titulo({ amount: 3000, dueDate: '2026-12-10' })],
            servicoAtualPorMes: { '2026-12': 1000 },
            servicoNovoPorMes: { '2026-12': 500 },
        }));
        expect(r.serie[0].servico_atual).toBe(1000);
        expect(r.serie[0].servico_novo).toBe(500);
        expect(r.serie[0].folga).toBe(1500);
        expect(r.serie[0].dscr).toBe(2);
    });

    it('despesa só desconta aluguel e acompanha a queda da receita', () => {
        const r = serieDeRenda(entrada({
            horizonte: 3,
            despesaMensal: 200,
            titulos: [titulo({ amount: 5000, dueDate: '2026-12-10' })],
            locacoes: [
                locacao({ contractId: 'l1', aluguelMensal: 1000, fim: '2029-01-10' }),
                locacao({ contractId: 'l2', aluguelMensal: 1000, fim: '2027-01-31' }),
            ],
        }));
        // mês 1: aluguel 2000 → despesa cheia 200; vendas não são onerados
        expect(r.serie[0].despesa_operacional).toBe(200);
        expect(r.serie[0].renda_liquida).toBe(5000 + 2000 - 200);
        // mês 3 (2027-02): só l1 → aluguel cai à metade, despesa também
        expect(r.serie[2].alugueis).toBe(1000);
        expect(r.serie[2].despesa_operacional).toBe(100);
    });

    it('sem aluguel no 1º mês a despesa é zero, não NaN', () => {
        const r = serieDeRenda(entrada({ despesaMensal: 200 }));
        expect(r.serie.every(m => m.despesa_operacional === 0)).toBe(true);
    });

    it('fluxos desmarcados zeram a parcela correspondente da renda líquida', () => {
        const base = {
            titulos: [titulo({ amount: 1000, dueDate: '2026-12-10' })],
            locacoes: [locacao({ aluguelMensal: 2000 })],
            despesaMensal: 500,
        };
        const ambos = serieDeRenda(entrada(base)).serie[0];
        expect(ambos.renda_liquida).toBe(1000 + 2000 - 500);
        const soVendas = serieDeRenda(entrada({ ...base, fluxos: { vendas: true, alugueis: false } })).serie[0];
        expect(soVendas.renda_liquida).toBe(1000);
        const soAluguel = serieDeRenda(entrada({ ...base, fluxos: { vendas: false, alugueis: true } })).serie[0];
        expect(soAluguel.renda_liquida).toBe(1500);
        // a série continua mostrando o bruto
        expect(soAluguel.vendas).toBe(1000);
    });

    it('recebidoPorMes agrupa o recebido pelo mês do pagamento, por natureza, nos 12 meses até a data-base', () => {
        const r = recebidoPorMes([
            titulo({ id: '1', recebido: true, paymentDate: '2026-10-05', amount: 100, natureza: 'VENDA' }),
            titulo({ id: '2', recebido: true, paymentDate: '2026-10-20', amount: 50, natureza: 'LOCACAO' }),
            titulo({ id: '3', recebido: true, paymentDate: '2025-12-02', amount: 70, natureza: 'VENDA' }),
            titulo({ id: '4', recebido: true, paymentDate: '2024-01-02', amount: 999, natureza: 'VENDA' }),
            titulo({ id: '5', recebido: false, paymentDate: null, amount: 888 }),
        ], DATA_BASE);
        expect(r).toHaveLength(12);
        expect(r[0].mes).toBe('2025-12');
        expect(r[11].mes).toBe('2026-11');
        expect(r.find(m => m.mes === '2026-10')).toEqual({ mes: '2026-10', vendas: 100, alugueis: 50 });
        expect(r.find(m => m.mes === '2025-12')).toEqual({ mes: '2025-12', vendas: 70, alugueis: 0 });
        expect(r.reduce((a, m) => a + m.vendas + m.alugueis, 0)).toBe(220);
    });

    it('capacidadeMaxima: renda que não cobre o DSCR mínimo devolve 0/0', () => {
        // renda 1000 / 1.3 = 769 < serviço atual 900
        const r = capacidadeMaxima(serieFixa(1000, 12, 900), PARAMETROS_CAPACIDADE_PADRAO, '2026-12-10');
        expect(r).toEqual({ parcela_maxima: 0, valor_maximo: 0 });
    });

    it('capacidadeMaxima: série vazia devolve 0/0', () => {
        expect(capacidadeMaxima([], PARAMETROS_CAPACIDADE_PADRAO, '2026-12-10'))
            .toEqual({ parcela_maxima: 0, valor_maximo: 0 });
    });

    it('capacidadeMaxima: a parcela máxima é a do pior dos 12 primeiros meses', () => {
        const serie = serieFixa(13_000, 12, 0);
        serie[4] = mesFixo(serie[4].mes, 6_500, 0); // mês fraco
        const r = capacidadeMaxima(serie, PARAMETROS_CAPACIDADE_PADRAO, '2026-12-10');
        expect(r.parcela_maxima).toBe(5000); // 6500 / 1.3
    });

    const totalMax12 = (principal: number, sistema: 'PRICE' | 'SAC', carencia = 0) =>
        Math.max(...buildSchedule({
            principal, nominalRate: 1.2, ratePeriod: 'MENSAL', system: sistema,
            installmentCount: 60, installmentPeriod: 'MENSAL', firstDueDate: '2026-12-10',
            gracePrincipalPeriods: carencia,
        }).slice(0, 12).map(l => l.total));

    it('capacidadeMaxima PRICE: parcela de buildSchedule do valor_maximo ≤ parcela_maxima < a de valor_maximo + 100', () => {
        const r = capacidadeMaxima(serieFixa(26_000, 12, 6_000), PARAMETROS_CAPACIDADE_PADRAO, '2026-12-10');
        expect(r.parcela_maxima).toBe(14_000); // 26000/1.3 − 6000
        expect(r.valor_maximo).toBeGreaterThan(0);
        expect(r.valor_maximo % 100).toBe(0);
        expect(totalMax12(r.valor_maximo, 'PRICE')).toBeLessThanOrEqual(r.parcela_maxima);
        expect(totalMax12(r.valor_maximo + 100, 'PRICE')).toBeGreaterThan(r.parcela_maxima);
    });

    it('capacidadeMaxima SAC usa a 1ª parcela (a maior)', () => {
        const p = { ...PARAMETROS_CAPACIDADE_PADRAO, sistema: 'SAC' as const };
        const r = capacidadeMaxima(serieFixa(26_000, 12, 6_000), p, '2026-12-10');
        const linhas = buildSchedule({
            principal: r.valor_maximo, nominalRate: 1.2, ratePeriod: 'MENSAL', system: 'SAC',
            installmentCount: 60, installmentPeriod: 'MENSAL', firstDueDate: '2026-12-10',
            gracePrincipalPeriods: 0,
        });
        expect(linhas[0].total).toBe(Math.max(...linhas.slice(0, 12).map(l => l.total)));
        expect(totalMax12(r.valor_maximo, 'SAC')).toBeLessThanOrEqual(r.parcela_maxima);
        expect(totalMax12(r.valor_maximo + 100, 'SAC')).toBeGreaterThan(r.parcela_maxima);
        // SAC começa mais pesado que PRICE: financia menos para a mesma parcela
        const price = capacidadeMaxima(serieFixa(26_000, 12, 6_000), PARAMETROS_CAPACIDADE_PADRAO, '2026-12-10');
        expect(r.valor_maximo).toBeLessThan(price.valor_maximo);
    });

    it('capacidadeMaxima com carência financia mais que sem carência (só juros nos 12 primeiros)', () => {
        const sem = capacidadeMaxima(serieFixa(26_000, 12, 6_000), PARAMETROS_CAPACIDADE_PADRAO, '2026-12-10');
        const com = capacidadeMaxima(serieFixa(26_000, 12, 6_000),
            { ...PARAMETROS_CAPACIDADE_PADRAO, carencia_meses: 12 }, '2026-12-10');
        expect(com.valor_maximo).toBeGreaterThan(sem.valor_maximo);
    });

    it('CENARIOS_ESTRESSE: Base 0/0/0 · Moderado 10/10/5 · Severo 25/20/15', () =>
        expect(CENARIOS_ESTRESSE).toEqual([
            { nome: 'Base', inadimplencia_pct: 0, vacancia_pct: 0, distrato_pct: 0 },
            { nome: 'Moderado', inadimplencia_pct: 10, vacancia_pct: 10, distrato_pct: 5 },
            { nome: 'Severo', inadimplencia_pct: 25, vacancia_pct: 20, distrato_pct: 15 },
        ]));

    it('aplicarEstresse Severo reduz vendas por 0.85*0.75 e aluguéis por 0.8*0.75', () => {
        const { serie } = serieDeRenda(entrada({
            titulos: [titulo({ amount: 10_000, dueDate: '2026-12-10' })],
            locacoes: [locacao({ aluguelMensal: 10_000 })],
            despesaMensal: 1000,
            servicoAtualPorMes: { '2026-12': 5000 },
        }));
        const severo = CENARIOS_ESTRESSE.find(c => c.nome === 'Severo')!;
        const r = aplicarEstresse(serie, severo);
        const m = r.serie[0];
        expect(m.vendas).toBe(round(10_000 * 0.85 * 0.75));
        expect(m.alugueis).toBe(round(10_000 * 0.8 * 0.75));
        // despesa e serviço inalterados
        expect(m.despesa_operacional).toBe(1000);
        expect(m.servico_atual).toBe(5000);
        expect(m.renda_liquida).toBe(round(m.vendas + m.alugueis - 1000));
        expect(m.folga).toBe(round(m.renda_liquida - 5000));
        expect(m.dscr).toBe(round(m.renda_liquida / 5000));
        // não mutou a série de entrada
        expect(serie[0].vendas).toBe(10_000);
    });

    it('aplicarEstresse respeita fluxos desmarcados e resume DSCR mínimo e meses de folga negativa', () => {
        const serie = [
            mesFixo('2026-12', 2000, 1000),
            mesFixo('2027-01', 1000, 1000),
            mesFixo('2027-02', 600, 1000),
        ];
        const base = aplicarEstresse(serie, CENARIOS_ESTRESSE[0]);
        expect(base.dscr_minimo_12m).toBe(0.6);
        expect(base.meses_folga_negativa).toBe(1);
        // só aluguel ligado: as vendas (renda desses meses) não entram na renda
        const soAluguel = aplicarEstresse(serie, CENARIOS_ESTRESSE[0], { vendas: false, alugueis: true });
        expect(soAluguel.serie.every(m => m.renda_liquida === 0)).toBe(true);
        expect(soAluguel.meses_folga_negativa).toBe(3);
    });

    it('aplicarEstresse sem nenhum serviço devolve dscr_minimo_12m null', () => {
        const r = aplicarEstresse(serieFixa(1000, 3, 0), CENARIOS_ESTRESSE[1]);
        expect(r.dscr_minimo_12m).toBeNull();
        expect(r.meses_folga_negativa).toBe(0);
    });

    it('alertas: venda sem título, locação sem valor, prazo indeterminado, título sem empreendimento', () => {
        const alertas = alertasDaCarteira({
            dataBase: DATA_BASE,
            titulos: [
                titulo({ id: 'a', empreendimentoId: null, amount: 400 }),
                titulo({ id: 'b', empreendimentoId: null, amount: 100, recebido: true, paymentDate: '2026-10-01' }),
                titulo({ id: 'c', empreendimentoId: 'emp', amount: 999 }),
            ],
            locacoes: [
                locacao({ contractId: 'l1', aluguelMensal: 0 }),
                locacao({ contractId: 'l2', aluguelMensal: 700, fim: null }),
                locacao({ contractId: 'l3', aluguelMensal: 300, fim: '2025-05-25' }),
                locacao({ contractId: 'l4', aluguelMensal: 900, fim: '2029-01-10' }),
            ],
            vendasSemTitulo: [{ dealId: 'd1', valor: 50_000 }, { dealId: 'd2', valor: 25_000 }],
        });
        const por = Object.fromEntries(alertas.map(a => [a.tipo, a]));
        expect(por.VENDA_SEM_PARCELAS).toEqual({ tipo: 'VENDA_SEM_PARCELAS', qtd: 2, valor: 75_000 });
        expect(por.LOCACAO_SEM_VALOR).toEqual({ tipo: 'LOCACAO_SEM_VALOR', qtd: 1, valor: 0 });
        expect(por.LOCACAO_PRAZO_INDETERMINADO).toEqual({ tipo: 'LOCACAO_PRAZO_INDETERMINADO', qtd: 2, valor: 1000 });
        expect(por.TITULO_SEM_EMPREENDIMENTO).toEqual({ tipo: 'TITULO_SEM_EMPREENDIMENTO', qtd: 1, valor: 400 });
    });

    it('alertas: carteira limpa não gera alerta', () => {
        expect(alertasDaCarteira({
            dataBase: DATA_BASE, titulos: [titulo()], locacoes: [locacao()], vendasSemTitulo: [],
        })).toEqual([]);
    });

    it('qualidade: top5 com 6 pagadores, pontualidade com 1 de 2 pago em atraso = 50', () => {
        const valores = [600, 500, 400, 300, 200, 100];
        const titulos = valores.map((v, i) =>
            titulo({ id: `v${i}`, partyKey: `cli${i}`, amount: v, dueDate: '2026-12-10' }));
        titulos.push(
            titulo({ id: 'r1', recebido: true, dueDate: '2026-06-10', paymentDate: '2026-06-10', amount: 10 }),
            titulo({ id: 'r2', recebido: true, dueDate: '2026-07-10', paymentDate: '2026-07-20', amount: 10 }),
            // fora da janela de 12 meses: não entra na pontualidade
            titulo({ id: 'r3', recebido: true, dueDate: '2025-01-10', paymentDate: '2025-03-10', amount: 10 }),
        );
        const q = qualidadeDaRenda(entrada({ titulos }));
        // total futuro 2100; top5 = 2000
        expect(q.concentracao_top5_pct).toBe(round(2000 / 2100 * 100));
        expect(q.pontualidade_12m_pct).toBe(50);
        expect(q.wale_anos).toBeNull();
        expect(q.locacoes_prazo_indeterminado).toBe(0);
    });

    it('qualidade: aluguel entra na concentração × meses da série; WALE e prazo indeterminado', () => {
        const q = qualidadeDaRenda(entrada({
            horizonte: 10,
            locacoes: [
                locacao({ contractId: 'l1', partyKey: 'loc1', aluguelMensal: 1000, fim: '2028-11-21' }),
                locacao({ contractId: 'l2', partyKey: 'loc2', aluguelMensal: 1000, fim: null }),
                locacao({ contractId: 'l3', partyKey: 'loc3', aluguelMensal: 1000, fim: '2025-05-25' }),
            ],
        }));
        // 3 pagadores, cada um 10 meses × 1000 → top5 cobre 100%
        expect(q.concentracao_top5_pct).toBe(100);
        expect(q.locacoes_prazo_indeterminado).toBe(2);
        // só l1 tem fim futuro: ~2 anos
        expect(q.wale_anos).toBeGreaterThan(1.9);
        expect(q.wale_anos).toBeLessThan(2.1);
    });

    it('qualidade sem renda nem recebidos devolve tudo null (dado ausente ≠ zero)', () => {
        const q = qualidadeDaRenda(entrada());
        expect(q).toEqual({
            concentracao_top5_pct: null, wale_anos: null,
            locacoes_prazo_indeterminado: 0, pontualidade_12m_pct: null,
        });
    });

    it('rotuloMascarado', () => {
        expect(rotuloMascarado('LOCACAO', 3)).toBe('Locatário 03');
        expect(rotuloMascarado('VENDA', 12)).toBe('Comprador 12');
    });
});

function round(n: number): number {
    return parseFloat(n.toFixed(2));
}
