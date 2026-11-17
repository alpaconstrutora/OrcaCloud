/**
 * Plano B pegajoso da Central (docs/planos/2026-11-17-central-menores-plano-b.md, Tarefa 4):
 * depois que a chamada única cai, aquela organização vai direto aos blocos por 5 minutos.
 */
import { describe, it, expect } from 'vitest';
import { criarMemoriaDoPlanoB, PLANO_B_PEGAJOSO_MS } from '../utils/planoBPegajoso';

describe('memória do plano B', () => {
    it('sem queda, não pula', () => {
        const m = criarMemoriaDoPlanoB(() => 0);
        expect(m.pularChamadaUnica('o1')).toBe(false);
    });

    it('caiu: pula por 5 minutos, depois volta a tentar', () => {
        let t = 0;
        const m = criarMemoriaDoPlanoB(() => t);
        m.marcarQueCaiu('o1');
        t = PLANO_B_PEGAJOSO_MS - 1;
        expect(m.pularChamadaUnica('o1')).toBe(true);
        t = PLANO_B_PEGAJOSO_MS;
        expect(m.pularChamadaUnica('o1')).toBe(false);
    });

    it('é por organização: "Todas" e o1 não se misturam', () => {
        const m = criarMemoriaDoPlanoB(() => 0);
        m.marcarQueCaiu(null);
        expect(m.pularChamadaUnica('o1')).toBe(false);
        expect(m.pularChamadaUnica(null)).toBe(true);
    });

    // O AppRouter entrega "Todas" como '' (`activeOrganizationId || ''`), não null.
    it('"Todas" chega como texto vazio: é a mesma chave de null', () => {
        const m = criarMemoriaDoPlanoB(() => 0);
        m.marcarQueCaiu('');
        expect(m.pularChamadaUnica(null)).toBe(true);
        expect(m.pularChamadaUnica('')).toBe(true);
        expect(m.pularChamadaUnica('o1')).toBe(false);
    });

    it('esquecer zera', () => {
        const m = criarMemoriaDoPlanoB(() => 0);
        m.marcarQueCaiu('o1');
        m.esquecer();
        expect(m.pularChamadaUnica('o1')).toBe(false);
    });

    it('5 minutos', () => {
        expect(PLANO_B_PEGAJOSO_MS).toBe(5 * 60 * 1000);
    });
});
