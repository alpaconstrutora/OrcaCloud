// __tests__/proposalHash.test.ts
//
// O hash de identidade das propostas. Como ele é computado só no TS (nunca recalculado no
// SQL), o que importa é: determinístico para o mesmo valor, e distinto quando a identidade
// muda. É o que faz "rejeitado não reaparece, mas volta se a origem mudar" funcionar via o
// unique index.

import { describe, it, expect } from 'vitest';
import { proposalHash } from '../services/sync/hash';

const base = {
    empreendimentoId: 'emp-1', origin: 'imovib' as const, entity: 'unit' as const,
    entityId: 'unit-1', field: 'private_area', proposedValue: 64.1,
};

describe('proposalHash', () => {
    it('é determinístico para o mesmo valor', () => {
        expect(proposalHash(base)).toBe(proposalHash({ ...base }));
    });

    it('62.40 e 62.4 são a mesma identidade (String normaliza o trailing zero)', () => {
        expect(proposalHash({ ...base, proposedValue: 62.40 }))
            .toBe(proposalHash({ ...base, proposedValue: 62.4 }));
    });

    it('muda quando o valor proposto muda — origem mudou, proposta nova', () => {
        expect(proposalHash({ ...base, proposedValue: 64.1 }))
            .not.toBe(proposalHash({ ...base, proposedValue: 64.2 }));
    });

    it('muda por campo, entidade, origem e empreendimento', () => {
        const h = proposalHash(base);
        expect(proposalHash({ ...base, field: 'common_area' })).not.toBe(h);
        expect(proposalHash({ ...base, entityId: 'unit-2' })).not.toBe(h);
        expect(proposalHash({ ...base, origin: 'planta_ai' })).not.toBe(h);
        expect(proposalHash({ ...base, empreendimentoId: 'emp-2' })).not.toBe(h);
    });

    it('não colide por deslocamento de fronteira (a|bc vs ab|c)', () => {
        expect(proposalHash({ ...base, entityId: 'a', field: 'bc' }))
            .not.toBe(proposalHash({ ...base, entityId: 'ab', field: 'c' }));
    });

    it('null e string vazia são distintos de um valor real', () => {
        const hNull = proposalHash({ ...base, proposedValue: null });
        const hReal = proposalHash({ ...base, proposedValue: 0 });
        expect(hNull).not.toBe(hReal);
    });
});
