// fmtPct (utils/format.ts) — percentual no padrão brasileiro, nas listas e no detalhe da oportunidade.
// Caso real (23/11/2026): a vitrine pública (removida em 25/11) mostrava "TIR estimada 19.0%".
import { describe, it, expect } from 'vitest';
import { fmtPct } from '../utils/format';

describe('fmtPct', () => {
    it('usa vírgula decimal e 1 casa (TIR do Garden 01)', () => {
        expect(fmtPct(19.000997240878604)).toBe('19,0%');
        expect(fmtPct(7.25)).toMatch(/^7,[23]%$/);
    });

    it('milhar com ponto', () => {
        expect(fmtPct(1234.5)).toBe('1.234,5%');
    });

    it('sem valor = travessão', () => {
        expect(fmtPct(null)).toBe('—');
        expect(fmtPct(undefined)).toBe('—');
    });
});
