/**
 * Carteira do Credit Room (rent roll + vendas) — montagem pura.
 *
 * O que estes testes protegem: que o nome do cliente nunca saia (só o rótulo
 * mascarado, numerado pela ordem de valor dentro de cada natureza), que a
 * locação vigente sem título ainda apareça, que saldo e vencido sejam medidos
 * contra a data-base e que o valor da VENDA seja o do contrato, não a soma do
 * que já foi faturado.
 */

import { describe, expect, it } from 'vitest';
import { montarCarteira } from '../utils/creditRoomCarteira';
import type { LocacaoVigente, TituloCarteira } from '../utils/creditCapacity';

const DATA_BASE = '2026-11-21';

const titulo = (p: Partial<TituloCarteira> = {}): TituloCarteira => ({
    id: 't', organizationId: 'org', contractId: 'c', natureza: 'VENDA',
    empreendimentoId: 'emp', partyKey: 'Fulano de Tal', dueDate: '2026-12-10', paymentDate: null,
    amount: 1000, recebido: false, ...p,
});

const locacao = (p: Partial<LocacaoVigente> = {}): LocacaoVigente => ({
    contractId: 'l1', organizationId: 'org', empreendimentoId: 'emp', partyKey: 'Beltrano Locatário',
    aluguelMensal: 1500, inicio: '2025-01-01', fim: '2029-01-10', ...p,
});

describe('montarCarteira', () => {
    it('vendas antes de locações, cada natureza numerada por valor decrescente', () => {
        const out = montarCarteira([
            titulo({ id: 'a1', contractId: 'vA', amount: 300 }),
            titulo({ id: 'b1', contractId: 'vB', amount: 500 }),
            titulo({ id: 'b2', contractId: 'vB', amount: 400 }),
            titulo({ id: 'l1', contractId: 'L1', natureza: 'LOCACAO', amount: 200 }),
            titulo({ id: 'l2', contractId: 'L2', natureza: 'LOCACAO', amount: 900 }),
        ], [], DATA_BASE);
        expect(out.map(x => [x.rotulo, x.contract_id, x.valor_contrato])).toEqual([
            ['Comprador 01', 'vB', 900],
            ['Comprador 02', 'vA', 300],
            ['Locatário 01', 'L2', 900],
            ['Locatário 02', 'L1', 200],
        ]);
    });

    it('nenhum partyKey nem nome de cliente sai na carteira', () => {
        const out = montarCarteira(
            [titulo({ partyKey: 'Fulano de Tal' })],
            [locacao({ contractId: 'L9', partyKey: 'Beltrano Locatário' })],
            DATA_BASE,
        );
        const json = JSON.stringify(out);
        expect(json).not.toContain('Fulano');
        expect(json).not.toContain('Beltrano');
        for (const linha of out) expect(Object.keys(linha)).not.toContain('partyKey');
    });

    it('locação vigente sem título vira linha SEM_PARCELAS com o aluguel mensal', () => {
        const out = montarCarteira([], [locacao({ contractId: 'L9', aluguelMensal: 2_300 })], DATA_BASE);
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({
            rotulo: 'Locatário 01', tipo: 'LOCACAO', contract_id: 'L9', parcela_mensal: 2_300,
            valor_contrato: 0, saldo_a_receber: 0, vencido: 0, status: 'SEM_PARCELAS', tem_parcelas: false,
        });
    });

    it('saldo e vencido separados na data-base: vencer NO dia é vencido; depois, só saldo', () => {
        const out = montarCarteira([
            titulo({ id: '1', dueDate: '2026-10-10', amount: 100 }),
            titulo({ id: '2', dueDate: DATA_BASE, amount: 200 }),
            titulo({ id: '3', dueDate: '2026-11-22', amount: 400 }),
            titulo({ id: '4', dueDate: '2026-09-10', amount: 800, recebido: true, paymentDate: '2026-09-10' }),
        ], [], DATA_BASE);
        expect(out[0]).toMatchObject({
            saldo_a_receber: 700,       // 100 + 200 + 400 (o recebido não)
            vencido: 300,               // 100 + 200
            parcela_mensal: 400,        // o próximo a vencer depois da data-base
            primeiro_vencimento: '2026-09-10',
            ultimo_vencimento: '2026-11-22',
            status: 'EM_ATRASO',
        });
    });

    it('VENDA usa o valor do contrato; LOCACAO segue a soma dos títulos', () => {
        const out = montarCarteira([
            titulo({ id: 'v1', contractId: 'V', amount: 1_000 }),
            titulo({ id: 'l1', contractId: 'L', natureza: 'LOCACAO', amount: 1_500 }),
        ], [locacao({ contractId: 'L', aluguelMensal: 1_500 })], DATA_BASE,
        new Map(), new Map([['V', 250_000], ['L', 1_500]]));
        const v = out.find(x => x.contract_id === 'V')!;
        const l = out.find(x => x.contract_id === 'L')!;
        expect(v.valor_contrato).toBe(250_000);
        expect(l.valor_contrato).toBe(1_500);
        expect(l.parcela_mensal).toBe(1_500);
    });

    it('etapa da negociação vai na linha (com título e locação sem título); sem negociação = null', () => {
        const out = montarCarteira([
            titulo({ id: 'v1', contractId: 'V', amount: 1_000 }),
            titulo({ id: 'x1', contractId: 'X', amount: 500 }),
        ], [locacao({ contractId: 'L', aluguelMensal: 3_500 })], DATA_BASE,
        new Map(), new Map(), new Map([['V', 'COMPLETED'], ['L', 'ASSINATURA']]));
        expect(out.find(x => x.contract_id === 'V')!.etapa_negociacao).toBe('COMPLETED');
        expect(out.find(x => x.contract_id === 'L')!.etapa_negociacao).toBe('ASSINATURA');
        expect(out.find(x => x.contract_id === 'X')!.etapa_negociacao).toBeNull();
    });

    it('VENDA sem valor de contrato cai na soma dos títulos', () => {
        const out = montarCarteira([
            titulo({ id: 'v1', contractId: 'V', amount: 1_000 }),
            titulo({ id: 'v2', contractId: 'V', amount: 2_000 }),
        ], [], DATA_BASE);
        expect(out[0].valor_contrato).toBe(3_000);
    });

    it('título sem contrato ou sem natureza não vira linha', () => {
        const out = montarCarteira([
            titulo({ id: 'x', contractId: null }),
            titulo({ id: 'y', contractId: 'Z', natureza: null }),
        ], [], DATA_BASE);
        expect(out).toEqual([]);
    });

    it('unidade vem do mapa (rótulo do imóvel); sem ela, null', () => {
        const out = montarCarteira([titulo({ contractId: 'V' })], [], DATA_BASE, new Map([['V', 'Apto 101']]));
        expect(out[0].unidade).toBe('Apto 101');
        expect(montarCarteira([titulo({ contractId: 'V' })], [], DATA_BASE)[0].unidade).toBeNull();
    });
});
