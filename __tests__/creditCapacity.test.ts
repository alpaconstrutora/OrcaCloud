/**
 * Capacidade de pagamento do Credit Room — a conta pura.
 *
 * O que estes testes protegem: que a renda projetada nasça do mês seguinte à
 * data-base (vencido e "a vencer no mês" ficam FORA da série), que o aluguel
 * venha do contrato e nunca duas vezes (contrato + título), que dado ausente
 * seja `null` (DSCR sem dívida) e não Infinity, e que o valor máximo da
 * operação caiba em CADA mês do horizonte (decisão do usuário, 21/11/2026) —
 * carência não pode esconder a parcela que amortiza.
 */

import { describe, expect, it } from 'vitest';
import {
    ALERTA_PT,
    CENARIOS_ESTRESSE,
    PARAMETROS_CAPACIDADE_PADRAO,
    alertasDaCarteira,
    aplicarEstresse,
    capacidadeMaxima,
    estresseDaVersao,
    fluxosDaOperacao,
    mensagemSemAcessoAoGrupo,
    mesesDoHorizonte,
    montarCapacidade,
    orgsForaDoAcesso,
    parametrosEfetivos,
    qualidadeDaRenda,
    recebidoPorMes,
    rendaMensalDoEmpreendimento,
    resumoDaCapacidade,
    rotuloDoMes,
    rotuloMascarado,
    serieDeRenda,
    type CapacidadeEntrada,
    type LocacaoVigente,
    type MontarCapacidadeEntrada,
    type SerieMes,
    type TipoAlerta,
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

    it('capacidadeMaxima: a parcela máxima é a do pior mês do horizonte', () => {
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

    // ── Janela = horizonte inteiro (C1). Valores ABSOLUTOS, da fórmula fechada:
    //    PRICE: P = parcela × (1 − 1,012^−n) ÷ 0,012, arredondado para baixo a R$ 100.
    //    1º vencimento = 1º mês da série (dia 1 do mês seguinte à data-base).
    const PV = '2026-12-01';
    const serie36 = (renda: (i: number) => number, servicoAtual = 0) =>
        mesesDoHorizonte(DATA_BASE, 36).map((m, i) => mesFixo(m, renda(i), servicoAtual));
    const cronograma = (principal: number, p: Partial<typeof PARAMETROS_CAPACIDADE_PADRAO> = {}) => {
        const q = { ...PARAMETROS_CAPACIDADE_PADRAO, ...p };
        return buildSchedule({
            principal, nominalRate: q.taxa_mensal_pct, ratePeriod: 'MENSAL', system: q.sistema,
            installmentCount: q.prazo_meses, installmentPeriod: 'MENSAL', firstDueDate: PV,
            gracePrincipalPeriods: q.carencia_meses,
        });
    };

    it('capacidadeMaxima âncora PRICE sem carência: 14.000 × a(60; 1,2%) = 596.350 → 596.300', () => {
        // limite = 26.000 ÷ 1,3 − 6.000 = 14.000 em todos os 36 meses
        const r = capacidadeMaxima(serie36(() => 26_000, 6_000), PARAMETROS_CAPACIDADE_PADRAO, PV);
        expect(r).toEqual({ parcela_maxima: 14_000, valor_maximo: 596_300 });
    });

    it('capacidadeMaxima com carência 12 NÃO passa da capacidade pós-carência (parcela do mês 13 ≤ limite)', () => {
        const p = { ...PARAMETROS_CAPACIDADE_PADRAO, carencia_meses: 12 };
        const r = capacidadeMaxima(serie36(() => 26_000, 6_000), p, PV);
        // Pós-carência: 48 parcelas PRICE de no máximo 14.000 → 14.000 × a(48; 1,2%) = 508.581 → 508.500.
        // (A regra antiga, que só olhava os 12 primeiros meses — só juros —, devolvia o teto 840.000.)
        expect(r).toEqual({ parcela_maxima: 14_000, valor_maximo: 508_500 });
        expect(cronograma(r.valor_maximo, { carencia_meses: 12 })[12].total).toBeLessThanOrEqual(14_000);
        expect(cronograma(r.valor_maximo + 100, { carencia_meses: 12 })[12].total).toBeGreaterThan(14_000);
        // e financia MENOS que sem carência (48 parcelas amortizam em vez de 60)
        expect(r.valor_maximo).toBeLessThan(596_300);
    });

    it('capacidadeMaxima taxa 0 + carência 12 não devolve o teto: 14.000 × 48 = 672.000', () => {
        const p = { ...PARAMETROS_CAPACIDADE_PADRAO, carencia_meses: 12, taxa_mensal_pct: 0 };
        const r = capacidadeMaxima(serie36(() => 26_000, 6_000), p, PV);
        expect(r.valor_maximo).toBe(672_000);
        expect(r.valor_maximo).not.toBe(14_000 * 60);   // o teto da busca
    });

    it('capacidadeMaxima: carência ≥ horizonte confere a 1ª parcela que amortiza contra o pior mês', () => {
        // Série de 12 meses, carência 12: nenhuma parcela que amortiza cai no horizonte.
        const p = { ...PARAMETROS_CAPACIDADE_PADRAO, carencia_meses: 12 };
        const r = capacidadeMaxima(serieFixa(26_000, 12, 6_000), p, PV);
        expect(r).toEqual({ parcela_maxima: 14_000, valor_maximo: 508_500 });
    });

    it('capacidadeMaxima: renda que cai depois (vendas acabam no mês 18) segura o valor máximo', () => {
        // Meses 1–18: renda 26.000 → limite 20.000; meses 19–36: 13.000 → limite 10.000.
        const queda = (i: number) => (i < 18 ? 26_000 : 13_000);
        const price = capacidadeMaxima(serie36(queda), PARAMETROS_CAPACIDADE_PADRAO, PV);
        // PRICE: parcela constante ≤ 10.000 → 10.000 × a(60; 1,2%) = 425.964 → 425.900
        // (os 12 primeiros meses sozinhos deixariam o dobro).
        expect(price).toEqual({ parcela_maxima: 10_000, valor_maximo: 425_900 });

        // SAC: parcela decrescente; quem segura é o mês 19, não o 1º.
        // parcela_19 = P/60 + P × (42/60) × 0,012 ≤ 10.000 → P = 398.936 → 398.900
        // (o 1º mês, P/60 + P × 0,012 ≤ 20.000, deixaria 697.674).
        const sac = capacidadeMaxima(serie36(queda), { ...PARAMETROS_CAPACIDADE_PADRAO, sistema: 'SAC' }, PV);
        expect(sac).toEqual({ parcela_maxima: 10_000, valor_maximo: 398_900 });
        const linhas = cronograma(sac.valor_maximo, { sistema: 'SAC' });
        expect(linhas[18].total).toBeLessThanOrEqual(10_000);
        expect(linhas[0].total).toBeLessThan(20_000);
        expect(cronograma(sac.valor_maximo + 100, { sistema: 'SAC' })[18].total).toBeGreaterThan(10_000);
    });

    it('capacidadeMaxima: um mês do horizonte com limite ≤ 0 zera tudo', () => {
        const r = capacidadeMaxima(serie36(i => (i === 30 ? 1_000 : 26_000), 6_000), PARAMETROS_CAPACIDADE_PADRAO, PV);
        expect(r).toEqual({ parcela_maxima: 0, valor_maximo: 0 });
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

    it('pontualidade divide por TODOS os títulos vencidos na janela: 1 em dia, 1 atrasado, 1 em aberto = 33,33', () => {
        const q = qualidadeDaRenda(entrada({
            titulos: [
                titulo({ id: 'p1', recebido: true, dueDate: '2026-05-10', paymentDate: '2026-05-09' }),
                titulo({ id: 'p2', recebido: true, dueDate: '2026-06-10', paymentDate: '2026-06-15' }),
                titulo({ id: 'p3', recebido: false, dueDate: '2026-07-10', paymentDate: null }),
                // a vencer depois da data-base: fora da janela
                titulo({ id: 'p4', recebido: false, dueDate: '2026-12-10', paymentDate: null }),
            ],
        }));
        expect(q.pontualidade_12m_pct).toBe(33.33);
    });

    it('pontualidade: pago sem data de pagamento entra no denominador, não no numerador', () => {
        const q = qualidadeDaRenda(entrada({
            titulos: [
                titulo({ id: 'a', recebido: true, dueDate: '2026-05-10', paymentDate: '2026-05-10' }),
                titulo({ id: 'b', recebido: true, dueDate: '2026-06-10', paymentDate: null }),
            ],
        }));
        expect(q.pontualidade_12m_pct).toBe(50);
    });

    it('qualidade sem renda nem recebidos devolve tudo null (dado ausente ≠ zero)', () => {
        const q = qualidadeDaRenda(entrada());
        expect(q).toEqual({
            concentracao_top5_pct: null, wale_anos: null,
            locacoes_prazo_indeterminado: 0, pontualidade_12m_pct: null,
        });
    });

    const capEntrada = (p: Partial<MontarCapacidadeEntrada> = {}): MontarCapacidadeEntrada => ({
        fonte: 'teste', dataBase: DATA_BASE, horizonte: 3,
        parametros: { ...PARAMETROS_CAPACIDADE_PADRAO, horizonte_meses: 3 },
        fluxos: { vendas: true, alugueis: true }, primeiroVencimento: '2026-12-01',
        orgs: ['o1', 'o2'], titulos: [], titulosDoEscopo: [], locacoesDoEscopo: [],
        despesaMensal: 0, despesaPorOrg: [0, 0], servicoAtualPorMes: {}, servicoAtualPorOrg: [{}, {}],
        servicoNovoPorMes: {}, vendasSemTitulo: [], empreendimentos: [], dividaTotalPorOrg: [0, 0], ...p,
    });

    it('montarCapacidade: estoque só de empreendimento a vender (objetivo LOCACAO fica fora) com haircut', () => {
        const c = montarCapacidade(capEntrada({
            empreendimentos: [
                { vgv_disponivel: 1_000_000, objetivo: 'VENDAS' },
                { vgv_disponivel: 500_000, objetivo: 'MISTO' },
                { vgv_disponivel: 9_000_000, objetivo: 'LOCACAO' },
                { vgv_disponivel: 200_000, objetivo: null },
            ],
        }));
        expect(c.estoque).toEqual({ vgv_disponivel: 1_700_000, haircut_pct: 30, valor_elegivel: 1_190_000 });
    });

    it('montarCapacidade: só empreendimento de locação (ou sem resposta) = estoque null', () => {
        expect(montarCapacidade(capEntrada({ empreendimentos: [{ vgv_disponivel: 9_000_000, objetivo: 'LOCACAO' }] })).estoque).toBeNull();
        expect(montarCapacidade(capEntrada({ empreendimentos: null })).estoque).toBeNull();
    });

    it('montarCapacidade: série, por organização e capacidade máxima saem do que foi coletado', () => {
        const c = montarCapacidade(capEntrada({
            titulosDoEscopo: [
                titulo({ id: 'a', organizationId: 'o1', amount: 26_000, dueDate: '2026-12-10' }),
                titulo({ id: 'b', organizationId: 'o2', amount: 13_000, dueDate: '2026-12-10' }),
            ],
            servicoAtualPorMes: { '2026-12': 3_000 },
            servicoAtualPorOrg: [{ '2026-12': 1_000 }, { '2026-12': 2_000 }],
            dividaTotalPorOrg: [100_000, 50_000],
        }));
        expect(c.parametros.horizonte_meses).toBe(3);
        expect(c.serie).toHaveLength(3);
        expect(c.serie[0]).toMatchObject({ mes: '2026-12', vendas: 39_000, servico_atual: 3_000 });
        expect(c.por_organizacao).toEqual([
            { organization_id: 'o1', renda_12m: 26_000, servico_12m: 1_000, divida_total: 100_000 },
            { organization_id: 'o2', renda_12m: 13_000, servico_12m: 2_000, divida_total: 50_000 },
        ]);
        // meses 2 e 3 sem renda: limite 0 → nada cabe
        expect(c.capacidade_maxima).toEqual({ parcela_maxima: 0, valor_maximo: 0 });
    });

    it('GRUPO: orgsForaDoAcesso aponta as orgs do escopo de que o usuário não é membro', () => {
        expect(orgsForaDoAcesso(['a', 'b', 'c'], ['a', 'c', 'z'])).toEqual(['b']);
        expect(orgsForaDoAcesso(['a'], ['a'])).toEqual([]);
        expect(orgsForaDoAcesso(['a', 'b'], [])).toEqual(['a', 'b']);
    });

    it('GRUPO: a recusa nomeia as empresas que faltam', () => {
        expect(mensagemSemAcessoAoGrupo(['SPE Alfa'])).toBe(
            'Você não é membro de SPE Alfa — só quem é membro de todas as empresas do grupo pode congelar esta versão.');
        expect(mensagemSemAcessoAoGrupo(['SPE Alfa', 'SPE Beta', 'SPE Gama'])).toMatch(/^Você não é membro de SPE Alfa, SPE Beta e SPE Gama — /);
    });

    it('renda mensal do empreendimento: só locação vigente no mês da data-base, e só fluxos elegíveis', () => {
        const titulos = [
            titulo({ id: 'v1', empreendimentoId: 'E', amount: 1_000, dueDate: '2026-11-30' }),    // no mês: entra
            titulo({ id: 'v2', empreendimentoId: 'E', amount: 9_000, dueDate: '2026-12-10' }),    // mês seguinte: não
            titulo({ id: 'v3', empreendimentoId: 'X', amount: 7_000, dueDate: '2026-11-30' }),    // outro emp.
        ];
        const locacoes = [
            locacao({ contractId: 'a', empreendimentoId: 'E', aluguelMensal: 2_000, inicio: '2025-01-01' }),
            locacao({ contractId: 'b', empreendimentoId: 'E', aluguelMensal: 5_000, inicio: '2027-03-01' }), // começa depois
            locacao({ contractId: 'c', empreendimentoId: 'E', aluguelMensal: 4_000, inicio: '2024-01-01', fim: '2026-10-31' }), // fim vencido com o contrato ativo = prazo indeterminado: segue projetada (alerta à parte)
        ];
        expect(rendaMensalDoEmpreendimento('E', titulos, locacoes, DATA_BASE, { vendas: true, alugueis: true })).toBe(1_000 + 2_000 + 4_000);
        expect(rendaMensalDoEmpreendimento('E', titulos, locacoes, DATA_BASE, { vendas: false, alugueis: true })).toBe(6_000);
        expect(rendaMensalDoEmpreendimento('E', titulos, locacoes, DATA_BASE, { vendas: true, alugueis: false })).toBe(1_000);
        expect(rendaMensalDoEmpreendimento('E', titulos, locacoes, DATA_BASE, { vendas: false, alugueis: false })).toBe(0);
    });

    it('parametrosEfetivos: prazo/carência da operação vencem os da capacidade; vazios não', () => {
        const p = { ...PARAMETROS_CAPACIDADE_PADRAO, prazo_meses: 60, carencia_meses: 6 };
        expect(parametrosEfetivos(p, 48, 12)).toMatchObject({ prazo_meses: 48, carencia_meses: 12 });
        expect(parametrosEfetivos(p, 48, 0)).toMatchObject({ prazo_meses: 48, carencia_meses: 0 });
        expect(parametrosEfetivos(p, undefined, undefined)).toMatchObject({ prazo_meses: 60, carencia_meses: 6 });
        expect(parametrosEfetivos(p, 0, null)).toMatchObject({ prazo_meses: 60, carencia_meses: 6 });
    });

    it('rotuloMascarado', () => {
        expect(rotuloMascarado('LOCACAO', 3)).toBe('Locatário 03');
        expect(rotuloMascarado('VENDA', 12)).toBe('Comprador 12');
    });

    describe('tela da capacidade', () => {
        const fluxosAmbos = { vendas: true, alugueis: true };
        // Renda positiva e serviço atual: a capacidade máxima sai > 0 e o estresse mexe de verdade.
        const capacidadeViva = (p: Partial<MontarCapacidadeEntrada> = {}) => montarCapacidade(capEntrada({
            horizonte: 12,
            parametros: { ...PARAMETROS_CAPACIDADE_PADRAO, horizonte_meses: 12 },
            titulosDoEscopo: mesesDoHorizonte(DATA_BASE, 12).map((mes, k) =>
                titulo({ id: `v${k}`, amount: 60_000, dueDate: `${mes}-10` })),
            locacoesDoEscopo: [locacao({ aluguelMensal: 20_000 })],
            servicoAtualPorMes: Object.fromEntries(mesesDoHorizonte(DATA_BASE, 12).map(m => [m, 20_000])),
            ...p,
        }));

        it('fluxosDaOperacao: vendas = receivables, aluguéis = noi', () => {
            const s = { operacao: { eligible_flows: { receivables: true, noi: false, operating_cash: false } } } as unknown as Parameters<typeof fluxosDaOperacao>[0];
            expect(fluxosDaOperacao(s)).toEqual({ vendas: true, alugueis: false });
        });

        it('estresse Base reproduz o que foi congelado (valor máximo e DSCR mínimo)', () => {
            const c = capacidadeViva();
            expect(c.capacidade_maxima.valor_maximo).toBeGreaterThan(0);
            const base = estresseDaVersao(c, CENARIOS_ESTRESSE[0], fluxosAmbos);
            expect(base.capacidade_maxima).toEqual(c.capacidade_maxima);
            expect(base.dscr_minimo_12m).toBe(resumoDaCapacidade(c)!.dscr_minimo_12m);
        });

        it('estresse Severo reduz o valor máximo e não mexe no serviço atual', () => {
            const c = capacidadeViva();
            const base = estresseDaVersao(c, CENARIOS_ESTRESSE[0], fluxosAmbos);
            const severo = estresseDaVersao(c, CENARIOS_ESTRESSE[2], fluxosAmbos);
            expect(severo.capacidade_maxima.valor_maximo).toBeLessThan(base.capacidade_maxima.valor_maximo);
            expect(severo.serie.map(m => m.servico_atual)).toEqual(c.serie.map(m => m.servico_atual));
        });

        it('com só aluguel elegível, o distrato não muda nada', () => {
            const c = capacidadeViva();
            const f = { vendas: false, alugueis: true };
            const sem = estresseDaVersao(c, { ...CENARIOS_ESTRESSE[0], distrato_pct: 0 }, f);
            const com = estresseDaVersao(c, { ...CENARIOS_ESTRESSE[0], distrato_pct: 50 }, f);
            expect(com.capacidade_maxima.valor_maximo).toBe(sem.capacidade_maxima.valor_maximo);
        });

        it('controle: com vendas elegíveis, o distrato reduz o valor máximo', () => {
            const c = capacidadeViva();
            const sem = estresseDaVersao(c, { ...CENARIOS_ESTRESSE[0], distrato_pct: 0 }, fluxosAmbos);
            const com = estresseDaVersao(c, { ...CENARIOS_ESTRESSE[0], distrato_pct: 50 }, fluxosAmbos);
            expect(sem.capacidade_maxima.valor_maximo).toBeGreaterThan(0);
            expect(com.capacidade_maxima.valor_maximo).toBeLessThan(sem.capacidade_maxima.valor_maximo);
        });

        it('inadimplência com só aluguel elegível: age pelos aluguéis e ignora a perna de vendas', () => {
            const zeroServico = Object.fromEntries(mesesDoHorizonte(DATA_BASE, 12).map(m => [m, 0]));
            const c = capacidadeViva({ servicoAtualPorMes: zeroServico });
            const f = { vendas: false, alugueis: true };
            const cenario = { ...CENARIOS_ESTRESSE[0], inadimplencia_pct: 25 };
            const base = estresseDaVersao(c, CENARIOS_ESTRESSE[0], f);
            const inad = estresseDaVersao(c, cenario, f);
            // controle: o estresse mexe de verdade (aluguéis caem 25%)
            expect(base.capacidade_maxima.valor_maximo).toBeGreaterThan(0);
            expect(inad.capacidade_maxima.valor_maximo).toBeLessThan(base.capacidade_maxima.valor_maximo);
            // a perna de vendas é ignorada: zerar as vendas da série dá o mesmo resultado
            const semVendas = estresseDaVersao({ ...c, serie: c.serie.map(m => ({ ...m, vendas: 0 })) }, cenario, f);
            expect(c.serie.some(m => m.vendas > 0)).toBe(true);
            expect(inad.capacidade_maxima).toEqual(semVendas.capacidade_maxima);
            expect(inad.serie.map(m => m.renda_liquida)).toEqual(semVendas.serie.map(m => m.renda_liquida));
        });

        it('percentuais do cenário ficam presos em 0–100', () => {
            const c = capacidadeViva();
            const total = estresseDaVersao(c, { nome: 'x', inadimplencia_pct: 250, vacancia_pct: 0, distrato_pct: 0 }, fluxosAmbos);
            expect(total.capacidade_maxima).toEqual({ parcela_maxima: 0, valor_maximo: 0 });
            const negativo = estresseDaVersao(c, { nome: 'y', inadimplencia_pct: -50, vacancia_pct: -50, distrato_pct: -50 }, fluxosAmbos);
            expect(negativo.capacidade_maxima).toEqual(c.capacidade_maxima);
        });

        it('série vazia: capacidade máxima zerada, sem estourar', () => {
            const c = { ...capacidadeViva(), serie: [] as SerieMes[] };
            const r = estresseDaVersao(c, CENARIOS_ESTRESSE[2], fluxosAmbos);
            expect(r.capacidade_maxima).toEqual({ parcela_maxima: 0, valor_maximo: 0 });
            expect(r.dscr_minimo_12m).toBeNull();
        });

        it('resumoDaCapacidade: null sem capacidade; sem serviço o DSCR é null e a renda é número', () => {
            expect(resumoDaCapacidade(null)).toBeNull();
            expect(resumoDaCapacidade(undefined)).toBeNull();
            const semServico = montarCapacidade(capEntrada({
                horizonte: 12, parametros: { ...PARAMETROS_CAPACIDADE_PADRAO, horizonte_meses: 12 },
                titulosDoEscopo: [titulo({ amount: 12_000, dueDate: '2026-12-10' })],
            }));
            const r = resumoDaCapacidade(semServico)!;
            expect(r.dscr_minimo_12m).toBeNull();
            expect(r.renda_liquida_media_12m).toBe(1_000);
        });

        it('resumoDaCapacidade: menor folga, mês dela e meses negativos no horizonte inteiro', () => {
            const c = capacidadeViva();
            const serie = c.serie.map((m, k) => ({ ...m, folga: k === 4 ? -500 : 1_000 }));
            const r = resumoDaCapacidade({ ...c, serie: [...serie, ...serie.slice(0, 4).map((m, k) => ({ ...m, mes: `2028-0${k + 1}`, folga: -1 }))] })!;
            expect(r.folga_minima_12m).toBe(-500);
            expect(r.mes_folga_minima).toBe(c.serie[4].mes);
            expect(r.meses_folga_negativa).toBe(1 + 4);
        });

        it('rotuloDoMes: abreviação em português + ano de 2 dígitos', () => {
            expect(rotuloDoMes('2026-12')).toBe('dez/26');
            expect(rotuloDoMes('2027-01')).toBe('jan/27');
            expect(rotuloDoMes('2027-05')).toBe('mai/27');
        });

        it('ALERTA_PT cobre os 4 tipos e diz como resolver', () => {
            const tipos: TipoAlerta[] = ['VENDA_SEM_PARCELAS', 'LOCACAO_SEM_VALOR', 'LOCACAO_PRAZO_INDETERMINADO', 'TITULO_SEM_EMPREENDIMENTO'];
            expect(Object.keys(ALERTA_PT).sort()).toEqual([...tipos].sort());
            for (const t of tipos) {
                expect(ALERTA_PT[t].titulo).toBeTruthy();
                expect(ALERTA_PT[t].comoResolver).toBeTruthy();
            }
            expect(ALERTA_PT.VENDA_SEM_PARCELAS.comoResolver).toContain('Gerar parcelas');
        });
    });
});

function round(n: number): number {
    return parseFloat(n.toFixed(2));
}
