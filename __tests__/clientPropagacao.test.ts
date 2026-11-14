/**
 * Meus Clientes › propagar a edição pelo app (pedido de 13/11/2026: "ao alterar
 * algo e salvar, perguntar se deseja propagar pelo app (financeiro, suprimentos
 * etc). apenas como exemplo ao alterar o nome").
 *
 * Trava as decisões de `utils/clientPropagacao.ts`: o que conta como alteração,
 * o que muda em cada linha copiada e o que fica intacto.
 */
import { describe, it, expect } from 'vitest';
import { camposAlterados, patchDaLinha, linhasDoResumo, descreverCampos } from '../utils/clientPropagacao';
import { chavePorCombinacao } from '../utils/agruparLinhas';

describe('camposAlterados', () => {
    it('nome mudou → propaga o nome', () => {
        expect(camposAlterados({ name: 'Filtrelec', email: 'a@x.com' }, { name: 'Filtrelec Comercio e Importação', email: 'a@x.com' }))
            .toEqual({ name: 'Filtrelec Comercio e Importação' });
    });

    it('só espaço em volta não é alteração; e-mail compara sem caixa', () => {
        expect(camposAlterados({ name: 'Ana', email: 'Ana@X.com' }, { name: ' Ana ', email: 'ana@x.com' })).toBeNull();
    });

    it('salvar outro campo (telefone) não oferece propagar', () => {
        expect(camposAlterados({ name: 'Ana', email: '' }, { name: 'Ana', email: '' })).toBeNull();
    });

    it('nome apagado ou e-mail apagado nunca propagam (apagariam o rótulo dos títulos)', () => {
        expect(camposAlterados({ name: 'Ana', email: 'a@x.com' }, { name: '', email: '' })).toBeNull();
    });

    it('criação (sem "antes") não propaga', () => {
        expect(camposAlterados(undefined, { name: 'Ana' })).toBeNull();
    });
});

describe('patchDaLinha', () => {
    it('corrige o party_name e o entity_name que era espelho dele', () => {
        expect(patchDaLinha({ party_name: 'Filtrelec', entity_name: 'Filtrelec' }, { name: 'Filtrelec Ltda' }, true))
            .toEqual({ party_name: 'Filtrelec Ltda', entity_name: 'Filtrelec Ltda' });
    });

    it('cópia defasada de ANTES desta edição também é corrigida (o caso Filtrelec)', () => {
        expect(patchDaLinha({ party_name: 'FILTRELEC' }, { name: 'Filtrelec Ltda' }, false)).toEqual({ party_name: 'Filtrelec Ltda' });
    });

    it('entity_name diferente do party_name (beneficiário lido de boleto) fica intacto', () => {
        expect(patchDaLinha({ party_name: 'Filtrelec', entity_name: 'BANCO XYZ BENEFICIARIO' }, { name: 'Filtrelec Ltda' }, true))
            .toEqual({ party_name: 'Filtrelec Ltda' });
    });

    it('linha já em dia → null (não grava à toa)', () => {
        expect(patchDaLinha({ party_name: 'Filtrelec Ltda', entity_name: 'Filtrelec Ltda' }, { name: 'Filtrelec Ltda' }, true)).toBeNull();
    });

    it('e-mail só onde a linha já tinha e-mail', () => {
        expect(patchDaLinha({ party_name: 'Ana', party_email: 'velho@x.com' }, { email: 'novo@x.com' }, false)).toEqual({ party_email: 'novo@x.com' });
        expect(patchDaLinha({ party_name: 'Ana', party_email: null }, { email: 'novo@x.com' }, false)).toBeNull();
    });

    it('só o e-mail mudou → o nome da linha não é tocado', () => {
        expect(patchDaLinha({ party_name: 'NOME ANTIGO', party_email: 'velho@x.com' }, { email: 'novo@x.com' }, false)).toEqual({ party_email: 'novo@x.com' });
    });
});

describe('resumo da pergunta', () => {
    it('uma linha por destino com cópia, singular/plural, na ordem fixa', () => {
        expect(linhasDoResumo({ obras: 1, financeiro: 36, cobrancas: 0 })).toEqual([
            'Financeiro (contas a receber/pagar): 36 lançamentos',
            'Obras e planejamentos: 1 obra',
        ]);
    });

    it('descreve os campos', () => {
        expect(descreverCampos({ name: 'x' })).toBe('o nome');
        expect(descreverCampos({ email: 'x' })).toBe('o e-mail');
        expect(descreverCampos({ name: 'x', email: 'y' })).toBe('o nome e o e-mail');
    });
});

describe('chavePorCombinacao (Agrupar por empreendimento)', () => {
    it('vazio → sem valor', () => {
        expect(chavePorCombinacao([])).toBeNull();
    });

    it('a ordem dos vínculos não cria grupo novo', () => {
        const a = chavePorCombinacao([{ id: 'e2', name: 'Vila Sol' }, { id: 'e1', name: 'Residencial Aurora' }]);
        const b = chavePorCombinacao([{ id: 'e1', name: 'Residencial Aurora' }, { id: 'e2', name: 'Vila Sol' }]);
        expect(a).toEqual(b);
        expect(a).toEqual({ key: 'e1|e2', label: 'Residencial Aurora, Vila Sol' });
    });

    it('homônimos de organizações diferentes não se fundem; id repetido conta uma vez', () => {
        expect(chavePorCombinacao([{ id: 'e1', name: 'Aurora' }])!.key)
            .not.toBe(chavePorCombinacao([{ id: 'e9', name: 'Aurora' }])!.key);
        expect(chavePorCombinacao([{ id: 'e1', name: 'Aurora' }, { id: 'e1', name: 'Aurora' }])).toEqual({ key: 'e1', label: 'Aurora' });
    });
});
