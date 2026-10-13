import { describe, it, expect } from 'vitest';
import {
    aplicarPadroesDoModelo, camposAutomaticos, origemInicial, type CamposAutopreenchiveis,
} from '../utils/catalogoAutopreencher';

const campos = (cat: [string, CamposAutopreenchiveis['category']['origem']], vida: [number | null, CamposAutopreenchiveis['useful_life_months']['origem']]): CamposAutopreenchiveis => ({
    category: { valor: cat[0], origem: cat[1] },
    useful_life_months: { valor: vida[0], origem: vida[1] },
});

const modelo = { default_asset_category: 'ferramenta', default_useful_life_months: 36 };

describe('autopreencher pelo modelo — "preenche sozinho, sem sobrescrever o manual"', () => {
    it('ativo novo: substitui os valores de fábrica do formulário (padrao)', () => {
        const r = aplicarPadroesDoModelo(campos(['equipamento', 'padrao'], [60, 'padrao']), modelo);
        expect(r.category).toEqual({ valor: 'ferramenta', origem: 'auto' });
        expect(r.useful_life_months).toEqual({ valor: 36, origem: 'auto' });
    });

    it('preenche campo vazio', () => {
        const r = aplicarPadroesDoModelo(campos(['', 'vazio'], [null, 'vazio']), modelo);
        expect(r.useful_life_months.valor).toBe(36);
    });

    it('NUNCA sobrescreve o que a pessoa digitou (manual)', () => {
        const r = aplicarPadroesDoModelo(campos(['veiculo', 'manual'], [60, 'manual']), modelo);
        expect(r.category).toEqual({ valor: 'veiculo', origem: 'manual' });
        expect(r.useful_life_months).toEqual({ valor: 60, origem: 'manual' });
    });

    it('60 digitado à mão é diferente de 60 de fábrica — a origem decide, não o valor', () => {
        const fabrica = aplicarPadroesDoModelo(campos(['equipamento', 'padrao'], [60, 'padrao']), modelo);
        const digitado = aplicarPadroesDoModelo(campos(['equipamento', 'padrao'], [60, 'manual']), modelo);
        expect(fabrica.useful_life_months.valor).toBe(36);
        expect(digitado.useful_life_months.valor).toBe(60);
    });

    it('trocar de modelo atualiza o que veio do modelo anterior (auto)', () => {
        const primeiro = aplicarPadroesDoModelo(campos(['equipamento', 'padrao'], [60, 'padrao']), modelo);
        const segundo = aplicarPadroesDoModelo(primeiro, { default_asset_category: 'tecnologia', default_useful_life_months: 24 });
        expect(segundo.category.valor).toBe('tecnologia');
        expect(segundo.useful_life_months.valor).toBe(24);
    });

    it('modelo sem padrões não mexe em nada', () => {
        const antes = campos(['equipamento', 'padrao'], [60, 'padrao']);
        const r = aplicarPadroesDoModelo(antes, { default_asset_category: null, default_useful_life_months: null });
        expect(r).toEqual(antes);
        expect(aplicarPadroesDoModelo(antes, null)).toBe(antes);
    });

    it('edição de ativo existente: valor do banco conta como manual; null conta como vazio', () => {
        expect(origemInicial(60, false)).toBe('manual');
        expect(origemInicial(null, false)).toBe('vazio');
        expect(origemInicial('', false)).toBe('vazio');
        expect(origemInicial(60, true)).toBe('padrao');
    });

    it('camposAutomaticos lista o que veio do modelo (para o aviso na tela)', () => {
        const r = aplicarPadroesDoModelo(campos(['equipamento', 'manual'], [60, 'padrao']), modelo);
        expect(camposAutomaticos(r)).toEqual(['useful_life_months']);
    });
});
