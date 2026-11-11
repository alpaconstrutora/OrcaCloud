/**
 * Alçada de aprovação por usuário (10/11/2026) — a parte que a tela calcula.
 * A regra em si (quem pode, lista vazia = liberado, DARF pelo total) mora no
 * banco (`fn_alcada_pode_aprovar` + gatilho `trg_zz_alcada_trava_passo`) e é
 * conferida lá; aqui fica o que o usuário LÊ: o motivo do botão desligado, o
 * "Vez de" e a frase do erro do gatilho.
 *
 * Plano: docs/planos/2026-11-10-alcada-aprovacao-por-usuario.md
 */
import { describe, it, expect } from 'vitest';
import {
    mensagemDaAlcada,
    motivoSemAlcada,
    vezDeTexto,
    juntarNomes,
    ENTIDADES_POR_TIPO,
    alvoDaAlcada,
} from '../utils/alcada';
import { itensDoLote } from '../utils/filaAprovacao';

describe('juntarNomes', () => {
    it('junta em português', () => {
        expect(juntarNomes([])).toBe('');
        expect(juntarNomes(['Bruna'])).toBe('Bruna');
        expect(juntarNomes(['Bruna', 'Iago'])).toBe('Bruna e Iago');
        expect(juntarNomes(['Altair', 'Bruna', 'Iago'])).toBe('Altair, Bruna e Iago');
    });
});

describe('vezDeTexto', () => {
    it('lista vazia = qualquer pessoa (nível liberado)', () => {
        expect(vezDeTexto([])).toBeNull();
        expect(vezDeTexto(undefined)).toBeNull();
        expect(vezDeTexto(null)).toBeNull();
    });
    it('com nomes, diz de quem é a vez', () => {
        expect(vezDeTexto(['Bruna', 'Iago'])).toBe('Vez de Bruna e Iago');
    });
});

describe('motivoSemAlcada', () => {
    it('quem pode aprovar não recebe motivo', () => {
        expect(motivoSemAlcada({ pode_aprovar: true, vez_de: ['Bruna'] })).toBeNull();
    });
    it('fila antiga, sem a coluna, não desliga nada', () => {
        expect(motivoSemAlcada({})).toBeNull();
    });
    it('quem não pode recebe a frase com os nomes', () => {
        expect(motivoSemAlcada({ pode_aprovar: false, vez_de: ['Bruna'] }))
            .toBe('Este nível é aprovado por Bruna. Para aprovar, peça ao dono ou a um administrador da organização para incluir você em Aprovações › Faixas.');
    });
    it('sem nomes (não deveria acontecer), ainda explica', () => {
        expect(motivoSemAlcada({ pode_aprovar: false, vez_de: [] }))
            .toBe('Você não está na alçada deste nível. Peça ao dono ou a um administrador da organização para incluir você em Aprovações › Faixas.');
    });
});

describe('mensagemDaAlcada — erro do gatilho vira frase', () => {
    it('tira o código e o prefixo do PostgREST', () => {
        expect(mensagemDaAlcada('Erro ao aprovar: ALCADA_NAO_PERMITE: o nível 1 deste item é aprovado por Bruna.'))
            .toBe('O nível 1 deste item é aprovado por Bruna.');
    });
    it('passo em nome de outra pessoa', () => {
        expect(mensagemDaAlcada('ALCADA_NAO_PERMITE: a aprovação tem de ser registrada em nome de quem está logado.'))
            .toBe('A aprovação tem de ser registrada em nome de quem está logado.');
    });
    it('outro erro não é da alçada', () => {
        expect(mensagemDaAlcada('Item não está pendente de aprovação.')).toBeNull();
        expect(mensagemDaAlcada(undefined)).toBeNull();
    });
});

describe('alvoDaAlcada — faixa ou tipo', () => {
    it('itens sem valor vão por tipo', () => {
        for (const e of ['blueprint_snapshot', 'doc_gen_documento', 'purchase_request', 'process_step']) {
            expect(alvoDaAlcada(e)).toBe('tipo');
        }
    });
    it('itens com valor vão pela faixa (SC é sempre por tipo, mesmo com preço)', () => {
        for (const e of ['transaction', 'darf', 'contract', 'purchase_order']) {
            expect(alvoDaAlcada(e)).toBe('faixa');
        }
    });
    it('a lista de tipos tem rótulo para cada um e bate com o CHECK do banco', () => {
        expect(ENTIDADES_POR_TIPO.map(t => t.entity).sort())
            .toEqual(['blueprint_snapshot', 'doc_gen_documento', 'process_step', 'purchase_request']);
        expect(ENTIDADES_POR_TIPO.every(t => t.rotulo.length > 0)).toBe(true);
    });
});

describe('itensDoLote — "Aprovar selecionados" respeita a alçada', () => {
    it('não leva o que a pessoa não pode aprovar', () => {
        const naTela = [
            { id: 'a', approval_status: 'PENDENTE', pode_aprovar: true },
            { id: 'b', approval_status: 'PENDENTE', pode_aprovar: false },
            { id: 'c', approval_status: 'PENDENTE' },
        ];
        expect(itensDoLote(naTela, new Set(['a', 'b', 'c'])).map(i => i.id)).toEqual(['a', 'c']);
    });
});
