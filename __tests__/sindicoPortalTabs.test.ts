import { describe, it, expect } from 'vitest';
import {
    SINDICO_FINANCEIRO_SUBABA_IDS, SINDICO_FINANCEIRO_SUBABA_LABELS, SINDICO_PORTAL_TAB_IDS, SINDICO_PORTAL_TAB_LABELS,
    resolverAbaDoSindico, resolverSubAbaDoFinanceiro,
} from '../utils/sindicoPortalTabs';

describe('sindicoPortalTabs', () => {
    it('toda aba tem rótulo', () => {
        expect(Object.keys(SINDICO_PORTAL_TAB_LABELS).sort()).toEqual([...SINDICO_PORTAL_TAB_IDS].sort());
    });
    it('aba salva inexistente cai na primeira', () => {
        expect(resolverAbaDoSindico('financeiro')).toBe('financeiro');
        expect(resolverAbaDoSindico('nao-existe')).toBe('visao');
        expect(resolverAbaDoSindico(null)).toBe('visao');
    });
    it('a aba do caixa se chama Financeiro (24/10/2026), não mais Prestação de contas', () => {
        expect(SINDICO_PORTAL_TAB_LABELS.financeiro).toBe('Financeiro');
    });
    it('sub-abas do Financeiro: toda uma tem rótulo; salva inexistente cai no resumo', () => {
        expect(Object.keys(SINDICO_FINANCEIRO_SUBABA_LABELS).sort()).toEqual([...SINDICO_FINANCEIRO_SUBABA_IDS].sort());
        expect(SINDICO_FINANCEIRO_SUBABA_LABELS.prestacao).toBe('Prestação de contas');
        expect(resolverSubAbaDoFinanceiro('pagar')).toBe('pagar');
        expect(resolverSubAbaDoFinanceiro('x')).toBe('resumo');
        expect(resolverSubAbaDoFinanceiro(undefined)).toBe('resumo');
    });
});
