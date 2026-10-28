import { describe, it, expect } from 'vitest';
import {
    limitesDoPeriodo, resumoDosBancos, tomDoSaldo, legendaDoSaldo, tomPorLimiar,
    dataBR, mesCurto, mesAno, diasEntre, isoLocal,
} from '../lib/dashboardFinanceiro';
import type { DashboardConta } from '../services/financialOverviewService';

const conta = (nome: string, saldo: number | null, data: string | null): DashboardConta => ({
    conta_id: nome, conta: nome, banco: null,
    saldo_banco: saldo, saldo_banco_data: data,
    saldo_banco_origem: saldo == null ? null : 'MANUAL',
    saldo_calculado: 0,
});

describe('limitesDoPeriodo', () => {
    const agora = new Date(2026, 9, 28); // 28/10/2026

    it('mês atual: do dia 1 ao último dia; gráfico com 6 meses terminando nele', () => {
        const p = limitesDoPeriodo('month', 0, agora);
        expect(p).toMatchObject({ from: '2026-10-01', to: '2026-10-31', mesesDesde: '2026-05-01', meses: 6 });
    });

    it('mês anterior atravessa fevereiro sem errar o último dia', () => {
        const p = limitesDoPeriodo('month', -8, agora);
        expect(p.from).toBe('2026-02-01');
        expect(p.to).toBe('2026-02-28');
    });

    it('trimestre: o 4º de 2026; voltar um ano inteiro de trimestres', () => {
        // nov e dez ainda não chegaram: o gráfico para em outubro (não mostra "zero realizado")
        expect(limitesDoPeriodo('quarter', 0, agora)).toMatchObject({
            from: '2026-10-01', to: '2026-12-31', rotulo: '4º trimestre de 2026', mesesDesde: '2026-05-01', mesesAte: '2026-10-01',
        });
        expect(limitesDoPeriodo('quarter', -4, agora)).toMatchObject({ from: '2025-10-01', to: '2025-12-31', rotulo: '4º trimestre de 2025' });
    });

    it('trimestre que vira o ano para trás', () => {
        const jan = new Date(2027, 0, 10);
        expect(limitesDoPeriodo('quarter', -1, jan)).toMatchObject({ from: '2026-10-01', to: '2026-12-31' });
    });

    it('ano: 12 meses no gráfico, de janeiro a dezembro', () => {
        expect(limitesDoPeriodo('year', -1, agora)).toMatchObject({
            from: '2025-01-01', to: '2025-12-31', rotulo: '2025', mesesDesde: '2025-01-01', mesesAte: '2025-12-01', meses: 12,
        });
    });

    it('ano corrente: de janeiro até o mês de hoje', () => {
        expect(limitesDoPeriodo('year', 0, agora)).toMatchObject({ mesesDesde: '2026-01-01', mesesAte: '2026-10-01', meses: 10 });
    });
});

describe('datas sem fuso', () => {
    it('formata sem passar por Date', () => {
        expect(dataBR('2015-06-29')).toBe('29/06/2015');
        expect(mesCurto('2026-05-01')).toBe('mai/26');
        expect(mesAno('2015-06-29')).toBe('jun/2015');
        expect(isoLocal(new Date(2026, 0, 1))).toBe('2026-01-01');
    });

    it('conta dias no calendário', () => {
        expect(diasEntre('2026-10-20', '2026-10-28')).toBe(8);
        expect(diasEntre('2026-12-31', '2027-01-01')).toBe(1);
    });
});

describe('saldo dos bancos', () => {
    const hoje = '2026-10-28';

    it('soma só o saldo que o banco informou e nomeia quem falta', () => {
        const r = resumoDosBancos([conta('Asaas', 138.35, '2026-10-28'), conta('Sicredi', null, null)], hoje);
        expect(r.saldo).toBeCloseTo(138.35);
        expect(r.semSaldo).toEqual(['Sicredi']);
        expect(tomDoSaldo(r)).toBe('atencao');
        expect(legendaDoSaldo(r)).toBe('1 de 2 contas · falta Sicredi');
    });

    it('nenhuma conta com saldo do banco = não medido, nunca zero', () => {
        const r = resumoDosBancos([conta('Sicredi', null, null), conta('Itaú', null, null)], hoje);
        expect(r.saldo).toBeNull();
        expect(tomDoSaldo(r)).toBe('atencao');
        expect(legendaDoSaldo(r)).toBe('Nenhuma das 2 contas tem saldo do banco');
    });

    it('saldo com mais de 7 dias deixa o número em atenção e a legenda diz a data', () => {
        const r = resumoDosBancos([conta('Itaú', 5000, '2026-10-01'), conta('Asaas', 100, '2026-10-28')], hoje);
        expect(r.defasadas).toEqual(['Itaú']);
        expect(tomDoSaldo(r)).toBe('atencao');
        expect(legendaDoSaldo(r)).toBe('2 contas · saldo de 01/10/2026');
    });

    it('saldo em dia e positivo é neutro; negativo é alerta', () => {
        expect(tomDoSaldo(resumoDosBancos([conta('Asaas', 100, '2026-10-27')], hoje))).toBe('neutro');
        expect(tomDoSaldo(resumoDosBancos([conta('Sicredi', -41_000, '2026-10-27')], hoje))).toBe('alerta');
    });

    it('sem conta ativa', () => {
        const r = resumoDosBancos([], hoje);
        expect(r.saldo).toBeNull();
        expect(tomDoSaldo(r)).toBe('neutro');
        expect(legendaDoSaldo(r)).toBe('Nenhuma conta bancária ativa');
    });
});

describe('tomPorLimiar', () => {
    it('zero é neutro; acima do limiar pinta', () => {
        expect(tomPorLimiar(0, 0, 'alerta')).toBe('neutro');
        expect(tomPorLimiar(0.01, 0, 'alerta')).toBe('alerta');
        expect(tomPorLimiar(3, 0, 'atencao')).toBe('atencao');
    });
});
