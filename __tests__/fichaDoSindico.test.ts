import { describe, it, expect } from 'vitest';
import { camposDaFicha, formDaFicha, motivoDaFicha, type FormFicha } from '../utils/fichaDoSindico';

const f = (p: Partial<FormFicha> = {}): FormFicha => ({ razaoSocial: 'Cond. X', cnpj: '', instaladoEm: '', multa: '2', juros: '1', ...p });

describe('ficha do condomínio pelo síndico', () => {
    it('limites e frases do banco: multa até 2% (CC 1.336 §1º), juros até 10% a.m., CNPJ 14 dígitos, instalação não futura', () => {
        expect(motivoDaFicha(f(), '2026-11-26')).toBeNull();
        expect(motivoDaFicha(f({ multa: '3' }), '2026-11-26')).toBe('A multa por atraso vai de 0 a 2% (Código Civil, art. 1.336, § 1º).');
        expect(motivoDaFicha(f({ multa: '' }), '2026-11-26')).toMatch(/multa/);
        expect(motivoDaFicha(f({ juros: '12' }), '2026-11-26')).toBe('Os juros vão de 0 a 10% ao mês.');
        expect(motivoDaFicha(f({ cnpj: '123' }), '2026-11-26')).toBe('O CNPJ tem 14 dígitos.');
        expect(motivoDaFicha(f({ instaladoEm: '2027-01-01' }), '2026-11-26')).toBe('A data de instalação não pode ser futura.');
    });

    it('percentual com vírgula vai como número; o formulário mostra com vírgula', () => {
        expect(camposDaFicha(f({ multa: '1,5', juros: '0,8' }))).toMatchObject({ cobranca_multa_percent: 1.5, cobranca_juros_mes_percent: 0.8 });
        expect(formDaFicha({ razaoSocial: null, cnpj: null, instaladoEm: null, multaPercent: 2, jurosMesPercent: 0.8,
            mandatoInicio: null, mandatoFim: null, exigeAprovacao: false })).toMatchObject({ multa: '2', juros: '0,8' });
    });
});
