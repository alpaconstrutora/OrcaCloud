import { describe, it, expect } from 'vitest';
import { textoDaRegra } from '../utils/politicaDeVendasTexto';

// A política vem de fn_sales_simulation_checks com texto sem acento e número
// cru ("Parcela abaixo do minimo de R$ 1000.00."). A tela monta a frase pela
// regra + limite + valor, no formato brasileiro e dizendo o que fazer.
const nb = (s: string) => s.replace(/ /g, ' ');

describe('textoDaRegra', () => {
    it('parcela mínima: valores em R$ e o que fazer', () => {
        expect(nb(textoDaRegra({ rule: 'min_installment_value', verdict: 'WARN', message: 'x', limit: 1000, value: 833.33 })))
            .toBe('Parcela de R$ 833,33 abaixo do mínimo de R$ 1.000,00 — reduza o nº de parcelas.');
    });

    it('entrada mínima e prazo máximo', () => {
        expect(textoDaRegra({ rule: 'min_down_payment', verdict: 'NEEDS_APPROVAL', message: 'x', limit: 20, value: 12.5 }))
            .toBe('Entrada de 12,5% abaixo do mínimo de 20% — aumente o sinal.');
        expect(textoDaRegra({ rule: 'max_installments', verdict: 'NEEDS_APPROVAL', message: 'x', limit: 48, value: 60 }))
            .toBe('Prazo de 60× acima do máximo de 48× — reduza o nº de parcelas.');
    });

    it('desconto: "muito acima" quando o servidor bloqueia', () => {
        expect(textoDaRegra({ rule: 'max_discount', verdict: 'NEEDS_APPROVAL', message: 'x', limit: 5, value: 7 }))
            .toBe('Desconto de 7% acima do máximo de 5% — reveja o valor negociado das unidades.');
        expect(textoDaRegra({ rule: 'max_discount', verdict: 'BLOCKED', message: 'x', limit: 5, value: 12 }))
            .toBe('Desconto de 12% muito acima do máximo de 5% — reveja o valor negociado das unidades.');
    });

    it('intermediárias, status e vigência do plano', () => {
        expect(textoDaRegra({ rule: 'max_intermediary', verdict: 'WARN', message: 'x', limit: 2, value: 4 }))
            .toBe('4 intermediárias acima do máximo de 2 — reduza os reforços.');
        expect(textoDaRegra({ rule: 'plan_status', verdict: 'BLOCKED', message: 'Plano draft (nao ativo).', limit: null, value: null }))
            .toBe('O plano de vendas não está ativo — ative-o em Venda de Ativos › Planos de vendas.');
        expect(textoDaRegra({ rule: 'plan_validity', verdict: 'BLOCKED', message: 'x', limit: null, value: null }))
            .toBe('O plano de vendas está fora do período de vigência — ajuste-a em Venda de Ativos › Planos de vendas.');
    });

    it('regra desconhecida ou sem números: a mensagem do servidor', () => {
        expect(textoDaRegra({ rule: 'nova_regra', verdict: 'WARN', message: 'Mensagem do servidor.', limit: 1, value: 2 }))
            .toBe('Mensagem do servidor.');
        expect(textoDaRegra({ rule: 'max_installments', verdict: 'WARN', message: 'Prazo 60x acima do maximo 48x.', limit: null, value: null }))
            .toBe('Prazo 60x acima do maximo 48x.');
    });
});

describe('textoDaRegra › Simulação do corretor (Portal do Corretor)', () => {
    // Mesmos números; a AÇÃO muda: o corretor não abre Venda de Ativos e fala
    // com o vocabulário da Simulação (Entrada, Parcelas mensais, Desconto).
    it('o que fazer na linguagem da Simulação', () => {
        expect(textoDaRegra({ rule: 'plan_status', verdict: 'BLOCKED', message: 'x', limit: null, value: null }, 'corretor'))
            .toBe('Este plano de vendas não está ativo — escolha outro plano.');
        expect(textoDaRegra({ rule: 'plan_validity', verdict: 'BLOCKED', message: 'x', limit: null, value: null }, 'corretor'))
            .toBe('Este plano de vendas está fora do período de vigência — escolha outro plano.');
        expect(textoDaRegra({ rule: 'min_down_payment', verdict: 'NEEDS_APPROVAL', message: 'x', limit: 20, value: 10 }, 'corretor'))
            .toBe('Entrada de 10% abaixo do mínimo de 20% — aumente a entrada.');
        expect(textoDaRegra({ rule: 'max_installments', verdict: 'NEEDS_APPROVAL', message: 'x', limit: 48, value: 60 }, 'corretor'))
            .toBe('Prazo de 60× acima do máximo de 48× — reduza as parcelas mensais.');
        expect(textoDaRegra({ rule: 'max_discount', verdict: 'NEEDS_APPROVAL', message: 'x', limit: 5, value: 7 }, 'corretor'))
            .toBe('Desconto de 7% acima do máximo de 5% — reduza o desconto.');
        expect(nb(textoDaRegra({ rule: 'min_installment_value', verdict: 'WARN', message: 'x', limit: 1000, value: 833.33 }, 'corretor')))
            .toBe('Parcela de R$ 833,33 abaixo do mínimo de R$ 1.000,00 — reduza as parcelas mensais.');
        expect(textoDaRegra({ rule: 'max_intermediary', verdict: 'WARN', message: 'x', limit: 2, value: 4 }, 'corretor'))
            .toBe('4 intermediárias acima do máximo de 2 — reduza as intermediárias.');
    });
});
