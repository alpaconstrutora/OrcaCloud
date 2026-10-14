import { describe, it, expect } from 'vitest';
import {
    chaveRascunho, salvarRascunho, lerRascunho, apagarRascunho, listarRascunhos,
    rascunhoDifere, quandoFoiGuardado, PREFIXO_RASCUNHO, ArmazenamentoRascunho,
} from '../utils/diaryDraft';
import type { DiaryEntry } from '../types/diary';

function memoria(): ArmazenamentoRascunho & { dados: Map<string, string> } {
    const dados = new Map<string, string>();
    return {
        dados,
        getItem: k => (dados.has(k) ? dados.get(k)! : null),
        setItem: (k, v) => { dados.set(k, v); },
        removeItem: k => { dados.delete(k); },
        key: i => [...dados.keys()][i] ?? null,
        get length() { return dados.size; },
    };
}

const reg = (id: string, description = ''): DiaryEntry => ({ id, date: '2026-10-14', weather: '', description, images: [] });

describe('rascunho do diário no aparelho', () => {
    it('prefixo orca_ — o logout apaga (tablet compartilhado)', () => {
        expect(PREFIXO_RASCUNHO.startsWith('orca_')).toBe(true);
        expect(chaveRascunho('d1', null)).toBe('orca_diario_rascunho:d1:novo');
        expect(chaveRascunho('d1', 'e1')).toBe('orca_diario_rascunho:d1:e1');
    });

    it('guarda, lê e apaga — registro novo e registro existente em chaves separadas', () => {
        const st = memoria();
        salvarRascunho('d1', null, reg('n', 'novo'), new Date('2026-10-14T22:31:00'), st);
        salvarRascunho('d1', 'e1', reg('e1', 'editado'), new Date('2026-10-14T22:32:00'), st);
        expect(lerRascunho('d1', null, st)?.entry.description).toBe('novo');
        expect(lerRascunho('d1', 'e1', st)?.entry.description).toBe('editado');
        apagarRascunho('d1', null, st);
        expect(lerRascunho('d1', null, st)).toBeNull();
        expect(lerRascunho('d1', 'e1', st)).not.toBeNull();
    });

    it('lista só os deste diário; id "novo" volta como null', () => {
        const st = memoria();
        salvarRascunho('d1', null, reg('n'), new Date(), st);
        salvarRascunho('d1', 'e1', reg('e1'), new Date(), st);
        salvarRascunho('d2', 'x', reg('x'), new Date(), st);
        st.setItem('orca_outra_coisa', '1');
        const l = listarRascunhos('d1', st).map(r => r.entryId).sort();
        expect(l).toEqual(['e1', null].sort());
    });

    it('JSON corrompido ou sem forma de registro → ignorado, sem quebrar', () => {
        const st = memoria();
        st.setItem(chaveRascunho('d1', 'e1'), '{quebrado');
        st.setItem(chaveRascunho('d1', 'e2'), JSON.stringify({ salvoEm: 'x' }));
        expect(lerRascunho('d1', 'e1', st)).toBeNull();
        expect(lerRascunho('d1', 'e2', st)).toBeNull();
        expect(listarRascunhos('d1', st)).toEqual([]);
    });

    it('storage que lança (cota cheia, bloqueado) nunca derruba a tela', () => {
        const ruim: ArmazenamentoRascunho = {
            getItem: () => { throw new Error('bloqueado'); },
            setItem: () => { throw new Error('cota'); },
            removeItem: () => { throw new Error('bloqueado'); },
            key: () => { throw new Error('bloqueado'); },
            get length() { return 1; },
        };
        expect(() => salvarRascunho('d1', null, reg('n'), new Date(), ruim)).not.toThrow();
        expect(lerRascunho('d1', null, ruim)).toBeNull();
        expect(() => apagarRascunho('d1', null, ruim)).not.toThrow();
        expect(listarRascunhos('d1', ruim)).toEqual([]);
    });

    it('sem storage (null) → no-op', () => {
        expect(() => salvarRascunho('d1', null, reg('n'), new Date(), null)).not.toThrow();
        expect(lerRascunho('d1', null, null)).toBeNull();
        expect(listarRascunhos('d1', null)).toEqual([]);
    });

    it('difere / quando foi guardado', () => {
        expect(rascunhoDifere(reg('a', 'x'), reg('a', 'x'))).toBe(false);
        expect(rascunhoDifere(reg('a', 'x'), reg('a', 'y'))).toBe(true);
        expect(quandoFoiGuardado(new Date(2026, 9, 14, 22, 31).toISOString())).toBe('14/10 às 22:31');
        expect(quandoFoiGuardado('lixo')).toBe('');
    });
});
