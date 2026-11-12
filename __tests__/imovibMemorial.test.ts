import { describe, it, expect } from 'vitest';
import { memorialDePremissas } from '../utils/imovibMemorial';
import { CAMPOS_DO_MOTOR } from '../utils/imovibMotor';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { baseStudy } from './fixtures/imovibEstudos';

/**
 * Memorial de premissas (item 10.1 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): toda premissa que o
 * motor lê, com valor, unidade, se é o padrão do sistema, e a fonte e a data gravadas.
 */
const vazio = () => {
    const s = baseStudy();
    for (const k of CAMPOS_DO_MOTOR) (s as Record<string, unknown>)[k] = null;
    return s;
};

describe('10.1 — memorial de premissas', () => {
    it('toda premissa que o motor lê aparece no memorial (premissa nova sem descrição derruba este teste)', () => {
        const campos = new Set(memorialDePremissas(baseStudy()).map(l => l.campo));
        const faltando = CAMPOS_DO_MOTOR.filter(k => !campos.has(k));
        expect(faltando).toEqual([]);
    });

    it('cada premissa aparece uma vez e com grupo, rótulo e unidade (ou texto)', () => {
        const linhas = memorialDePremissas(baseStudy());
        expect(new Set(linhas.map(l => l.campo)).size).toBe(linhas.length);
        for (const l of linhas) {
            expect(l.grupo).toBeTruthy();
            expect(l.premissa).toBeTruthy();
        }
    });

    it('campo vazio sai como padrão do sistema, com o valor do padrão', () => {
        const linhas = memorialDePremissas(vazio());
        const de = (c: string) => linhas.find(l => l.campo === c)!;
        expect(de('construction_duration_months')).toMatchObject({ ehPadrao: true, valor: IMOVIB_DEFAULTS.construction_duration_months, unidade: 'meses' });
        expect(de('discount_rate')).toMatchObject({ ehPadrao: true, valor: IMOVIB_DEFAULTS.discount_rate });
        expect(de('cancellation_refund_percent')).toMatchObject({ ehPadrao: true, valor: 75 });
    });

    it('campo digitado não é padrão, mesmo quando é 0', () => {
        const linhas = memorialDePremissas(baseStudy({ brokerage_fee: 0, construction_duration_months: 30 }));
        expect(linhas.find(l => l.campo === 'brokerage_fee')).toMatchObject({ ehPadrao: false, valor: 0 });
        expect(linhas.find(l => l.campo === 'construction_duration_months')).toMatchObject({ ehPadrao: false, valor: 30 });
    });

    it('o padrão segue a regra do motor: com patrimônio de afetação a devolução padrão é 50%', () => {
        const l = memorialDePremissas({ ...vazio(), patrimonio_afetacao: true }).find(x => x.campo === 'cancellation_refund_percent')!;
        expect(l).toMatchObject({ ehPadrao: true, valor: 50 });
    });

    it('a fonte e a data gravadas em premise_notes voltam na linha', () => {
        const linhas = memorialDePremissas(baseStudy({ premise_notes: { discount_rate: { fonte: 'CDI + 4 p.p.', data: '2026-11-01' } } }));
        expect(linhas.find(l => l.campo === 'discount_rate')).toMatchObject({ fonte: 'CDI + 4 p.p.', data: '2026-11-01' });
        expect(linhas.find(l => l.campo === 'inflation_rate')).toMatchObject({ fonte: null, data: null });
    });
});

describe('10.1 (revisão) — o memorial mostra o valor que o motor usa, mesmo com entrada incomum', () => {
    const de = (over: Record<string, unknown>, campo: string) => memorialDePremissas(baseStudy(over)).find(l => l.campo === campo)!;

    it('duração 0 vale o padrão (o motor recusa e avisa); fração é arredondada', () => {
        expect(de({ construction_duration_months: 0 }, 'construction_duration_months')).toMatchObject({ valor: IMOVIB_DEFAULTS.construction_duration_months });
        expect(de({ construction_duration_months: 0 }, 'construction_duration_months').observacao).toMatch(/inválid/i);
        expect(de({ sales_duration_months: 24.6 }, 'sales_duration_months').valor).toBe(25);
    });

    it('aquisição antes do mês 1 vale o mês 1', () => {
        expect(de({ acquisition_month: 0 }, 'acquisition_month').valor).toBe(1);
    });

    it('CAPEX simplificado sem custo/m² é calculado pelo Completo, e o memorial diz isso', () => {
        const l = de({ capex_mode: 'simplified', capex_simplified_cost_sqm: null }, 'capex_mode');
        expect(l.valor).toMatch(/^Completo/);
        expect(l.observacao).toMatch(/sem custo\/m²/i);
    });

    it('área do simplificado 0 usa a área das torres, e o memorial diz isso', () => {
        const l = de({ capex_mode: 'simplified', capex_simplified_cost_sqm: 4_000, capex_simplified_area_sqm: 0 }, 'capex_simplified_area_sqm');
        expect(l.observacao).toMatch(/área construída das torres/);
    });

    it('com as rubricas no cálculo, imposto e corretagem dizem que não entram', () => {
        const l = memorialDePremissas(baseStudy(), { rubricasAtivas: true }).find(x => x.campo === 'brokerage_fee')!;
        expect(l.observacao).toMatch(/Não entra/);
    });
});
