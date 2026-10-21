// Mandato do síndico: espelho TS de fn_sindico_predios (Portal do Síndico, 20/10/2026).
import { describe, it, expect } from 'vitest';
import { hojeEmBrasilia, mandatoVigente, mandatoVencido } from '../utils/mandatoSindico';

describe('mandatoSindico', () => {
    it('datas vazias = vigente (caso real do 010 em 20/10/2026)', () => {
        expect(mandatoVigente(null, null, '2026-10-20')).toBe(true);
        expect(mandatoVigente('', undefined, '2026-10-20')).toBe(true);
    });

    it('bordas: início e fim no próprio dia contam', () => {
        expect(mandatoVigente('2026-10-20', '2026-10-20', '2026-10-20')).toBe(true);
        expect(mandatoVigente('2026-10-21', null, '2026-10-20')).toBe(false);
        expect(mandatoVigente(null, '2026-10-19', '2026-10-20')).toBe(false);
    });

    it('aceita timestamp (só a data conta)', () => {
        expect(mandatoVigente('2026-01-01T00:00:00Z', '2026-10-20T23:59:00Z', '2026-10-20')).toBe(true);
    });

    it('vencido só quando o fim passou — início futuro não é "vencido"', () => {
        expect(mandatoVencido('2026-10-19', '2026-10-20')).toBe(true);
        expect(mandatoVencido('2026-10-20', '2026-10-20')).toBe(false);
        expect(mandatoVencido(null, '2026-10-20')).toBe(false);
    });

    it('hoje é a data de Brasília, não a UTC', () => {
        // 21/10 01:30 UTC = 20/10 22:30 em Brasília
        expect(hojeEmBrasilia(new Date('2026-10-21T01:30:00Z'))).toBe('2026-10-20');
        expect(hojeEmBrasilia(new Date('2026-10-21T03:30:00Z'))).toBe('2026-10-21');
    });
});
