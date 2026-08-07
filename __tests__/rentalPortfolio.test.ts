import { describe, it, expect } from 'vitest';
import { sumPortfolioValue, leafNodes, getDealInstallmentValue } from '../lib/rentalPortfolio';

/**
 * Regressão dos dois defeitos encontrados na auditoria dos KPIs de
 * "Gestão de Locações" (2026-08-06):
 *   1. Valor patrimonial somava edifício + unidades → contava em dobro.
 *   2. Receita mensal somava `deal.value` (preço de tabela) em vez de
 *      `installment_value` (valor contratado).
 */

describe('sumPortfolioValue — valor patrimonial conta cada imóvel uma vez', () => {
    it('não soma o edifício quando as unidades estão cadastradas', () => {
        const properties = [
            { id: 'edificio-1', parent_id: null, price: 1_000_000 },
            { id: 'unid-101', parent_id: 'edificio-1', price: 400_000 },
            { id: 'unid-102', parent_id: 'edificio-1', price: 600_000 },
        ];

        // Antes: 1.000.000 + 400.000 + 600.000 = 2.000.000 (dobro).
        expect(sumPortfolioValue(properties, p => p.price)).toBe(1_000_000);
    });

    it('soma o edifício quando ele ainda não tem unidades cadastradas', () => {
        const properties = [
            { id: 'edificio-vazio', parent_id: null, price: 800_000 },
        ];

        expect(sumPortfolioValue(properties, p => p.price)).toBe(800_000);
    });

    it('soma imóvel avulso junto com carteira predial, sem duplicar', () => {
        const properties = [
            { id: 'edificio-1', parent_id: null, price: 999_999 },
            { id: 'unid-101', parent_id: 'edificio-1', price: 300_000 },
            { id: 'casa-avulsa', parent_id: null, price: 250_000 },
        ];

        expect(sumPortfolioValue(properties, p => p.price)).toBe(550_000);
    });

    it('casa o parent_id ignorando caixa, como o resto do módulo', () => {
        const properties = [
            { id: 'ABC-123', parent_id: null, price: 500_000 },
            { id: 'unid-1', parent_id: 'abc-123', price: 200_000 },
        ];

        // O edifício é pai mesmo com o id em caixa diferente: não pode somar.
        expect(sumPortfolioValue(properties, p => p.price)).toBe(200_000);
    });

    it('trata preço ausente como zero em vez de virar NaN', () => {
        const properties = [
            { id: 'a', parent_id: null, price: undefined as unknown as number },
            { id: 'b', parent_id: null, price: 100 },
        ];

        expect(sumPortfolioValue(properties, p => p.price)).toBe(100);
    });

    it('carteira vazia soma zero', () => {
        expect(sumPortfolioValue([] as { id: string; price: number }[], p => p.price)).toBe(0);
    });

    // Regressão do caso REAL que zerou o KPI em produção (print de 2026-08-06):
    // em locação, quem carrega valor patrimonial é o PRÉDIO — a unidade tem
    // `rental_price` (o aluguel) e deixa `price` vazio. A regra anterior somava
    // só as folhas e devolvia R$ 0 para a carteira inteira.
    it('usa o preço do edifício quando as unidades estão sem preço', () => {
        const properties = [
            { id: 'ed-1', parent_id: null, price: 2_000_000 },
            { id: 'u-101', parent_id: 'ed-1', price: 0 },
            { id: 'u-102', parent_id: 'ed-1', price: 0 },
        ];

        expect(sumPortfolioValue(properties, p => p.price)).toBe(2_000_000);
    });

    it('idem com price null/undefined nas unidades', () => {
        const properties = [
            { id: 'ed-1', parent_id: null, price: 500_000 },
            { id: 'u-1', parent_id: 'ed-1', price: null as unknown as number },
        ];

        expect(sumPortfolioValue(properties, p => p.price)).toBe(500_000);
    });

    it('unidade precificada continua vencendo o preço do edifício', () => {
        // Preenchida a unidade, ela passa a mandar — sem voltar a contar em dobro.
        const properties = [
            { id: 'ed-1', parent_id: null, price: 2_000_000 },
            { id: 'u-101', parent_id: 'ed-1', price: 700_000 },
            { id: 'u-102', parent_id: 'ed-1', price: 0 },
        ];

        expect(sumPortfolioValue(properties, p => p.price)).toBe(700_000);
    });

    it('conta a unidade quando a consulta traz só as filhas, sem o pai', () => {
        // É o caso do serviço com um edifício selecionado (.eq('parent_id', id)):
        // o pai não vem na lista, e as unidades não podem sumir da conta.
        const properties = [
            { id: 'u-101', parent_id: 'ed-fora-da-lista', price: 300_000 },
            { id: 'u-102', parent_id: 'ed-fora-da-lista', price: 200_000 },
        ];

        expect(sumPortfolioValue(properties, p => p.price)).toBe(500_000);
    });

    it('não trava com parent_id circular', () => {
        const properties = [
            { id: 'a', parent_id: 'b', price: 10 },
            { id: 'b', parent_id: 'a', price: 20 },
        ];

        expect(() => sumPortfolioValue(properties, p => p.price)).not.toThrow();
    });
});

describe('leafNodes — unidades locáveis para a taxa de ocupação', () => {
    // Decisão do usuário (2026-08-06): "um galpão locado inteiro conta como
    // unidade? sim". A base da ocupação é a folha, não `type !== 'BUILDING'`.
    it('conta o galpão locado inteiro, que não tem unidade filha', () => {
        const properties = [
            { id: 'galpao', parent_id: null, type: 'BUILDING', status: 'RENTED' },
        ];

        // Antes (`type !== 'BUILDING'`) o galpão sumia e a ocupação ficava 0/0.
        expect(leafNodes(properties).map(p => p.id)).toEqual(['galpao']);
    });

    it('não conta o edifício quando quem ocupa são as unidades', () => {
        const properties = [
            { id: 'ed-1', parent_id: null, type: 'BUILDING', status: 'AVAILABLE' },
            { id: 'u-101', parent_id: 'ed-1', type: 'APARTMENT', status: 'RENTED' },
            { id: 'u-102', parent_id: 'ed-1', type: 'APARTMENT', status: 'AVAILABLE' },
        ];

        const leaves = leafNodes(properties);
        expect(leaves.map(p => p.id)).toEqual(['u-101', 'u-102']);
        // Ocupação = 1/2 = 50%, e não 1/3 contando o edifício no denominador.
        expect(leaves.filter(p => p.status === 'RENTED').length / leaves.length).toBe(0.5);
    });

    it('mistura galpão inteiro com carteira predial sem contar duas vezes', () => {
        const properties = [
            { id: 'ed-1', parent_id: null, type: 'BUILDING', status: 'AVAILABLE' },
            { id: 'u-101', parent_id: 'ed-1', type: 'APARTMENT', status: 'RENTED' },
            { id: 'galpao', parent_id: null, type: 'BUILDING', status: 'RENTED' },
        ];

        expect(leafNodes(properties).map(p => p.id)).toEqual(['u-101', 'galpao']);
    });
});

describe('getDealInstallmentValue — receita é a parcela contratada', () => {
    it('usa installment_value, não o valor sugerido em value', () => {
        // value = soma das unidades (preço de tabela da Inteligência);
        // installment_value = o que foi de fato fechado com o locatário.
        expect(getDealInstallmentValue({ value: 5_000, installment_value: 4_200 })).toBe(4_200);
    });

    it('cai no value quando o contrato é legado, sem o campo', () => {
        expect(getDealInstallmentValue({ value: 3_000 })).toBe(3_000);
        expect(getDealInstallmentValue({ value: 3_000, installment_value: null })).toBe(3_000);
    });

    it('respeita desconto que zerou a parcela em vez de cair no fallback', () => {
        // 0 é valor legítimo (carência): `!= null` distingue de ausente, que
        // um `||` teria confundido com o value.
        expect(getDealInstallmentValue({ value: 3_000, installment_value: 0 })).toBe(0);
    });

    it('não vira NaN quando os dois campos faltam', () => {
        expect(getDealInstallmentValue({})).toBe(0);
    });
});
