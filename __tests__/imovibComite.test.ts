/** Comitê & Gates no estudo (item 1.5 do plano docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md). */
import { describe, it, expect } from 'vitest';
import { proximoGate, motivoParaNaoAbrir, motivoParaNaoDecidir } from '../utils/imovibComite';

describe('comitê do estudo', () => {
    it('próximo gate = primeiro sem aprovação', () => {
        expect(proximoGate([])).toBe(1);
        expect(proximoGate([{ gate: 1, decision: 'aprovado' }, { gate: 2, decision: 'reprovado' }])).toBe(2);
        expect(proximoGate([1, 2, 3, 4, 5, 6].map(g => ({ gate: g as 1, decision: 'aprovado_condicionantes' as const })))).toBe(7);
    });

    it('não abre gate adiante do próximo; rever um já decidido pode', () => {
        expect(motivoParaNaoAbrir(1, [])).toBeUndefined();
        expect(motivoParaNaoAbrir(3, [{ gate: 1, decision: 'aprovado' }])).toMatch(/Gate 2/);
        expect(motivoParaNaoAbrir(1, [{ gate: 1, decision: 'aprovado' }, { gate: 2, decision: 'aprovado' }])).toBeUndefined();
    });

    it('decidir exige a versão; aprovar com pendência que trava só com condicionantes', () => {
        expect(motivoParaNaoDecidir({ decision: 'aprovado', version_id: null, condicionantes: '', bloqueios: 0 })).toMatch(/versão/);
        expect(motivoParaNaoDecidir({ decision: 'pendente', version_id: null, condicionantes: '', bloqueios: 3 })).toBeUndefined();
        expect(motivoParaNaoDecidir({ decision: 'aprovado', version_id: 'v', condicionantes: '', bloqueios: 2 })).toMatch(/2 pendência/);
        expect(motivoParaNaoDecidir({ decision: 'aprovado_condicionantes', version_id: 'v', condicionantes: ' ', bloqueios: 2 })).toMatch(/condicionantes/);
        expect(motivoParaNaoDecidir({ decision: 'aprovado_condicionantes', version_id: 'v', condicionantes: 'Baixar a hipoteca', bloqueios: 2 })).toBeUndefined();
        expect(motivoParaNaoDecidir({ decision: 'reprovado', version_id: 'v', condicionantes: '', bloqueios: 5 })).toBeUndefined();
    });
});
