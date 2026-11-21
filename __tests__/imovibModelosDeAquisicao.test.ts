/**
 * Modelos de aquisição pelo motor (item 1.4 do plano
 * docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md).
 */
import { describe, it, expect } from 'vitest';
import { computeImovibMath } from '../utils/imovibMotor';
import { premissasDoModelo, resultadoDoModelo, resultadoDoEstudo, fluxoNaSociedade, type ModeloDeAquisicao } from '../utils/imovibModelosDeAquisicao';
import { baseStudy } from './fixtures/imovibEstudos';

const modelo = (deal_type: ModeloDeAquisicao['deal_type'], premises_json: ModeloDeAquisicao['premises_json']): ModeloDeAquisicao =>
    ({ id: 'm', name: 'Modelo', deal_type, premises_json });

describe('modelos de aquisição calculados pelo motor', () => {
    it('compra direta à vista igual ao estudo dá o MESMO VPL e TIR do motor', () => {
        const estudo = baseStudy({ land_cost: 2_000_000, land_payment_schedule: null, swap_physical_percent: 0, swap_financial_percent: 0 });
        const base = resultadoDoEstudo(estudo);
        const r = resultadoDoModelo(estudo, modelo('compra_direta', { valor_total: 2_000_000 }));
        expect(r.vpl).toBeCloseTo(base.vpl, 6);
        expect(r.tirAnual).toBeCloseTo(base.tirAnual!, 6);
        expect(r.caixaDoTerreno).toBeCloseTo(2_000_000, 6);
    });

    it('compra parcelada: entrada no mês da aquisição, saldo em parcelas corrigidas; pagar depois melhora o VPL', () => {
        const estudo = baseStudy({ land_cost: 2_000_000, acquisition_month: 2, swap_physical_percent: 0, swap_financial_percent: 0 });
        const p = premissasDoModelo(estudo, modelo('compra_direta', { valor_total: 2_000_000, entrada: 500_000, num_parcelas: 3, taxa_correcao_mensal_pct: 0 }));
        expect(p.land_payment_schedule).toEqual([{ month: 2, percent: 25 }, { month: 3, percent: 25 }, { month: 4, percent: 25 }, { month: 5, percent: 25 }]);
        const avista = resultadoDoModelo(estudo, modelo('compra_direta', { valor_total: 2_000_000 }));
        const parcelado = resultadoDoModelo(estudo, modelo('compra_direta', { valor_total: 2_000_000, entrada: 500_000, num_parcelas: 3 }));
        expect(parcelado.vpl).toBeGreaterThan(avista.vpl);
        const corrigido = premissasDoModelo(estudo, modelo('compra_direta', { valor_total: 2_000_000, entrada: 0, num_parcelas: 2, taxa_correcao_mensal_pct: 1 }));
        expect(corrigido.land_payment_schedule!.reduce((a, x) => a + x.percent, 0)).toBeGreaterThan(100);
    });

    it('permuta física e financeira não pagam terreno em caixa e diminuem o VGV vendável', () => {
        const estudo = baseStudy({ land_cost: 2_000_000, swap_physical_percent: 0, swap_financial_percent: 0 });
        const vgv = computeImovibMath(estudo).vgvTotal;
        const fis = premissasDoModelo(estudo, modelo('permuta_fisica', { valor_referencia_unidades: vgv * 0.1 }));
        expect(fis).toMatchObject({ land_cost: 0, swap_physical_percent: 10, swap_financial_percent: 0 });
        const fin = premissasDoModelo(estudo, modelo('permuta_financeira', { percentual_sobre_vgv: 8 }));
        expect(fin.swap_financial_percent).toBe(8);
        // Mínimo garantido acima do %: vale o mínimo.
        const minimo = premissasDoModelo(estudo, modelo('permuta_financeira', { percentual_sobre_vgv: 1, valor_minimo_garantido: vgv * 0.05 }));
        expect(minimo.swap_financial_percent).toBeCloseTo(5, 6);
        const r = resultadoDoModelo(estudo, modelo('permuta_financeira', { percentual_sobre_vgv: 8 }));
        expect(r.caixaDoTerreno).toBe(0);
        expect(computeImovibMath({ ...estudo, ...fin }).netVgvTotal).toBeLessThan(computeImovibMath(estudo).netVgvTotal);
    });

    it('opção de compra: prêmio na aquisição e exercício depois do prazo', () => {
        const estudo = baseStudy({ acquisition_month: 1 });
        const p = premissasDoModelo(estudo, modelo('opcao_compra', { premio_opcao: 100_000, valor_exercicio: 900_000, prazo_opcao_meses: 6 }));
        expect(p.land_cost).toBe(1_000_000);
        expect(p.land_payment_schedule).toEqual([{ month: 1, percent: 10 }, { month: 7, percent: 90 }]);
    });

    it('sociedade: o proprietário só leva a % do LUCRO, depois de o capital voltar', () => {
        const { fluxo, parteDoProprietario } = fluxoNaSociedade([-100, 50, 80, 20], 50);
        // acumulado: -100, -50, +30, +50 → lucro 30 no mês 2 e 20 no mês 3.
        expect(parteDoProprietario).toBe(25);
        expect(fluxo).toEqual([-100, 50, 65, 10]);
        const zero = fluxoNaSociedade([-100, 50, 80], 0);
        expect(zero.fluxo).toEqual([-100, 50, 80]);
    });
});
