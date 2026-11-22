import { describe, expect, it } from 'vitest';
import { FINANCIAL_INSTITUTION_CATEGORY, isFinancialInstitutionCategory } from '../constants/supplierCategories';

describe('isFinancialInstitutionCategory — filtro do Credit Room (Instituição financeira)', () => {
    it('reconhece a categoria como cadastrada em Meus Fornecedores', () => {
        expect(isFinancialInstitutionCategory(FINANCIAL_INSTITUTION_CATEGORY)).toBe(true);
        expect(isFinancialInstitutionCategory('Instituição Financeira')).toBe(true);
    });

    it('ignora acento, caixa e espaço nas pontas', () => {
        expect(isFinancialInstitutionCategory('instituicao financeira')).toBe(true);
        expect(isFinancialInstitutionCategory('  INSTITUIÇÃO FINANCEIRA ')).toBe(true);
    });

    it('recusa outras categorias e categoria vazia', () => {
        expect(isFinancialInstitutionCategory('Materiais de Construção')).toBe(false);
        expect(isFinancialInstitutionCategory('Instituição')).toBe(false);
        expect(isFinancialInstitutionCategory(null)).toBe(false);
        expect(isFinancialInstitutionCategory(undefined)).toBe(false);
        expect(isFinancialInstitutionCategory('')).toBe(false);
    });
});
