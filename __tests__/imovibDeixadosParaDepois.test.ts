/**
 * Minors deixados para depois nas revisões das pendências do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md ("Deixados para depois").
 */
import { describe, it, expect } from 'vitest';
import { computeImovibMath } from '../utils/imovibMotor';
import { baseStudy } from './fixtures/imovibEstudos';

describe('receita_liquida_negativa diz a causa e o valor certo', () => {
    it('inadimplência acima de 100%: o valor citado é o das parcelas pagas direto (negativo), não a receita total', () => {
        const r = computeImovibMath(baseStudy({ default_rate_percent: 150 }));
        const aviso = r.avisos.find(a => a.codigo === 'receita_liquida_negativa')!;
        expect(aviso).toBeTruthy();
        expect(r.netVgvTotal).toBeGreaterThan(0); // sinal e chaves seguem positivos
        expect(aviso.mensagem).toMatch(/Inadimplência de 150%/);
        expect(aviso.mensagem).toMatch(/-R\$/);
        expect(aviso.mensagem).not.toMatch(/a receita líquida fica negativa/);
    });

    it('permutas acima de 100%: a receita líquida fica negativa, com o valor negativo', () => {
        const r = computeImovibMath(baseStudy({ swap_physical_percent: 60, swap_financial_percent: 300 }));
        const aviso = r.avisos.find(a => a.codigo === 'receita_liquida_negativa')!;
        expect(r.netVgvTotal).toBeLessThan(0);
        expect(aviso.mensagem).toMatch(/Permutas passam de 100%/);
        expect(aviso.mensagem).toMatch(/-R\$/);
    });
});
