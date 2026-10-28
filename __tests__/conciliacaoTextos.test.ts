import { describe, it, expect } from 'vitest';
import { plural, textoDaDivergencia } from '../utils/conciliacaoTextos';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

describe('conciliação · textos do Dashboard', () => {
    it('plural de verdade, com número em pt-BR', () => {
        expect(plural(1, 'lançamento', 'lançamentos')).toBe('1 lançamento');
        expect(plural(0, 'lançamento', 'lançamentos')).toBe('0 lançamentos');
        expect(plural(13229, 'lançamento', 'lançamentos')).toBe('13.229 lançamentos');
    });

    it('com baixados sem conferir, a diferença é esperada (âmbar) e diz o caminho', () => {
        // Produção, 28/10/2026: R$ 14.008,40; 893 de 1.026 baixados sem conferir.
        const t = textoDaDivergencia(76740.48 - 90748.88, { baixado_count: 1026, so_baixado_count: 893 }, brl);
        expect(t.tom).toBe('esperada');
        expect(t.titulo).toMatch(/14\.008,40.*esperada/);
        expect(t.lado).toMatch(/^O sistema tem R\$\s14\.008,40 a mais que o extrato conciliado\.$/);
        expect(t.explicacao).toMatch(/^893 lançamentos baixados no sistema .* ainda não foram conferidos no extrato, de 1\.026 baixados\./);
    });

    it('tudo conferido e ainda diferente: divergência (vermelho), vínculo faltando ou duplicado', () => {
        const t = textoDaDivergencia(250, { baixado_count: 10, so_baixado_count: 0 }, brl);
        expect(t.tom).toBe('divergencia');
        expect(t.lado).toMatch(/^O extrato conciliado tem R\$\s250,00 a mais que o sistema\.$/);
        expect(t.explicacao).toMatch(/vínculo faltando ou duplicado/);
    });

    it('um só baixado sem conferir fica no singular', () => {
        expect(textoDaDivergencia(-10, { baixado_count: 1, so_baixado_count: 1 }, brl).explicacao)
            .toMatch(/^1 lançamento baixado no sistema .* ainda não foi conferido no extrato, de 1 baixado\./);
    });
});
