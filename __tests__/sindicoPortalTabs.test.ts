import { describe, it, expect } from 'vitest';
import { SINDICO_PORTAL_TAB_IDS, SINDICO_PORTAL_TAB_LABELS, resolverAbaDoSindico } from '../utils/sindicoPortalTabs';

describe('sindicoPortalTabs', () => {
    it('toda aba tem rótulo', () => {
        expect(Object.keys(SINDICO_PORTAL_TAB_LABELS).sort()).toEqual([...SINDICO_PORTAL_TAB_IDS].sort());
    });
    it('aba salva inexistente cai na primeira', () => {
        expect(resolverAbaDoSindico('financeiro')).toBe('financeiro');
        expect(resolverAbaDoSindico('nao-existe')).toBe('visao');
        expect(resolverAbaDoSindico(null)).toBe('visao');
    });
});
