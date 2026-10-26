import { describe, it, expect } from 'vitest';
import { itensDoLote } from '../utils/filaAprovacao';

const item = (id: string, approval_status = 'PENDENTE') => ({ id, approval_status });

describe('itensDoLote', () => {
    it('só aprova o que está selecionado, pendente E na tela (o filtro escondeu = fora do lote)', () => {
        const naTela = [item('a'), item('b'), item('c', 'RASCUNHO')];
        const selecionados = new Set(['a', 'c', 'escondido']);
        expect(itensDoLote(naTela, selecionados).map(i => i.id)).toEqual(['a']);
    });

    it('nada selecionado = lote vazio', () => {
        expect(itensDoLote([item('a')], new Set())).toEqual([]);
    });
});
