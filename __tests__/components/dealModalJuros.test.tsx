// @vitest-environment jsdom
/**
 * Gerenciar Negociação › aba Financeiro › plano de pagamento com juros (09/11/2026).
 * Plano: docs/planos/2026-11-09-negociacao-parcelamento-com-juros.md (Task 3).
 * Desde 10/11/2026 (docs/planos/2026-11-10-negociacao-aba-financeiro.md, item 2) o
 * painel "Montar plano" só existe como linha de partida da venda SEM plano; com
 * plano montado, os juros ficam numa faixa acima da tabela e recalculam a série
 * na hora — as mesmas regras (sem juros sobre juros, taxa zero volta ao plano
 * simples, total digitado vira a base) agora valem para a faixa.
 *
 * O DealModal DE VERDADE, com a rede trocada por stubs: o que se confere aqui é
 * o que a tela mostra e o que o botão grava no Valor Total do Contrato. A
 * transição em si (linhas com interest/principal, juros zero, bloco editado à
 * mão) é pura e está em __tests__/jurosParcelamento.test.ts (Ruling 3).
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Qualquer cadeia do client (`from().select().eq()…`, `auth.getUser()`,
// `channel().on().subscribe()`) devolve ela mesma; `await` dá lista vazia.
vi.mock('../../lib/supabase', () => {
    const cadeia: unknown = new Proxy(function () { /* stub */ }, {
        get: (_alvo, prop) => (prop === 'then'
            ? (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
            : cadeia),
        apply: () => cadeia,
    });
    return { supabase: cadeia };
});
const listas = vi.hoisted(() => ({ planos: [] as { name: string; interest_rate_monthly: number }[] }));
vi.mock('../../services/salesPlanService', () => ({
    salesPlanService: {
        listActive: vi.fn(async () => listas.planos),
        validateSimulation: vi.fn(async () => ({ overall: 'ALLOWED', checks: [] })),
    },
}));
vi.mock('../../services/commercialService', async (original) => ({
    ...(await original<typeof import('../../services/commercialService')>()),
    commercialService: new Proxy({}, { get: () => vi.fn(async () => []) }),
}));
vi.mock('../../services/clientService', () => ({ clientService: new Proxy({}, { get: () => vi.fn(async () => []) }) }));
vi.mock('../../services/organizationService', () => ({ organizationService: new Proxy({}, { get: () => vi.fn(async () => []) }) }));
vi.mock('../../services/projectService', () => ({ projectService: new Proxy({}, { get: () => vi.fn(async () => []) }) }));
vi.mock('../../services/brokerService', () => ({ brokerService: new Proxy({}, { get: () => vi.fn(async () => []) }) }));
vi.mock('../../services/paymentTypeService', () => ({ paymentTypeService: new Proxy({}, { get: () => vi.fn(async () => []) }) }));
vi.mock('../../services/financialRegistryService', () => ({ financialRegistryService: new Proxy({}, { get: () => vi.fn(async () => []) }) }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import DealModal from '../../components/DealModal';
import { salesPlanService } from '../../services/salesPlanService';
import { montarPlanoNoNegocio } from '../../utils/jurosParcelamento';

const listActive = vi.mocked(salesPlanService.listActive);
/** Espera a leitura do plano de vendas acontecer e a resposta ser aplicada. */
const aguardarPlanoDeVendas = async () => {
    await waitFor(() => expect(listActive).toHaveBeenCalledWith('predio-1'));
    await act(async () => { await Promise.resolve(); });
};

const ORG = '00000000-0000-0000-0000-000000000000';

function abrir(tipo: 'SALE' | 'RENTAL' = 'SALE', extra: Record<string, unknown> = {}) {
    return render(
        <DealModal
            isOpen
            onClose={() => {}}
            defaultType={tipo}
            organizationId={ORG}
            initialTab="pagamento"
            buildingId="predio-1"
            initialData={{
                type: tipo,
                organization_id: ORG,
                date: '2026-11-10',
                payment_due_date: '2026-12-10',
                value: tipo === 'RENTAL' ? 2500 : 100000,
                contract_total_value: tipo === 'SALE' ? 100000 : undefined,
                payment_method: 'INSTALLMENTS',
                status: 'PROPOSTA',
                ...extra,
            } as never}
        />,
    );
}

const valorTotal = () =>
    screen.getByText('Valor Total do Contrato').parentElement!.querySelector('input') as HTMLInputElement;
const juros = () => screen.getByLabelText('Juros a.m. (%)') as HTMLInputElement;
const resumo = () => screen.getByText(/^Vai gerar:/).textContent!.replace(/ /g, ' ');
const botaoMontar = () => screen.getByRole('button', { name: /^Montar plano$/ });
/** Valor mostrado na linha da série principal (a única série nestes cenários). */
const valorDaSerie = (rotulo = 'Parcelas 1–12') =>
    screen.getByText(rotulo).closest('tr')!.querySelectorAll('td')[2].textContent!.replace(/\u00a0/g, ' ');

describe('DealModal › Montar plano com juros', () => {
    beforeEach(() => { listas.planos = []; listActive.mockClear(); });

    it('juros na faixa recalculam a série sem juros sobre juros', async () => {
        abrir();
        fireEvent.change(juros(), { target: { value: '1' } });
        expect(resumo()).toBe(
            'Vai gerar: 12× parcelas mensais de R$ 8.884,88 (Price, 1% a.m.) — juros R$ 6.618,53, total R$ 106.618,53.',
        );
        // Com juros, entram Sistema e Preço sem juros (pré-preenchido com o total).
        expect((screen.getByLabelText('Sistema') as HTMLSelectElement).value).toBe('PRICE');
        expect((screen.getByLabelText('Preço sem juros') as HTMLInputElement).value).toBe('100.000,00');

        fireEvent.click(botaoMontar());
        await waitFor(() => expect(valorTotal().value).toBe('106.618,53'));
        // Montado: a linha de partida sai; o plano se edita na tabela.
        expect(screen.queryByRole('button', { name: /^Montar plano$/ })).toBeNull();
        expect(screen.getByText('Parcelas 1–12')).toBeInTheDocument();

        // Mexer na faixa e voltar: a base é o preço sem juros gravado, não o total com juros.
        fireEvent.change(screen.getByLabelText('Sistema'), { target: { value: 'SAC' } });
        await waitFor(() => expect(valorTotal().value).toBe('106.500,00'));
        fireEvent.change(screen.getByLabelText('Sistema'), { target: { value: 'PRICE' } });
        await waitFor(() => expect(valorTotal().value).toBe('106.618,53'));
        expect((screen.getByLabelText('Preço sem juros') as HTMLInputElement).value).toBe('100.000,00');
    });

    it('juros zero na faixa volta ao plano simples', async () => {
        abrir();
        fireEvent.change(juros(), { target: { value: '1' } });
        fireEvent.click(botaoMontar());
        await waitFor(() => expect(valorTotal().value).toBe('106.618,53'));

        fireEvent.change(juros(), { target: { value: '0' } });
        // A base volta a ser o preço sem juros gravado (100.000) e as colunas de juros saem.
        await waitFor(() => expect(valorTotal().value).toBe('100.000,00'));
        expect(screen.queryByLabelText('Sistema')).toBeNull();
        expect(screen.queryByLabelText('Preço sem juros')).toBeNull();
        expect(valorDaSerie()).toBe('R$ 8.333,33 → R$ 8.333,37');
    });

    it('total editado depois dos juros → juros zero na faixa: o Valor Total digitado fica', async () => {
        abrir();
        fireEvent.change(juros(), { target: { value: '1' } });
        fireEvent.click(botaoMontar());
        await waitFor(() => expect(valorTotal().value).toBe('106.618,53'));

        fireEvent.change(valorTotal(), { target: { value: '13000000' } });
        expect(valorTotal().value).toBe('130.000,00');
        // O preço sem juros gravado (100.000) deixou de valer: a base é o digitado.
        expect((screen.getByLabelText('Preço sem juros') as HTMLInputElement).value).toBe('130.000,00');

        fireEvent.change(juros(), { target: { value: '0' } });
        await waitFor(() => expect(valorDaSerie()).toBe('R$ 10.833,33 → R$ 10.833,37'));
        expect(valorTotal().value).toBe('130.000,00');
        expect(screen.queryByLabelText('Preço sem juros')).toBeNull();
    });

    it('total editado depois dos juros → mexer na taxa: a base é o total digitado', async () => {
        abrir();
        fireEvent.change(juros(), { target: { value: '1' } });
        fireEvent.click(botaoMontar());
        await waitFor(() => expect(valorTotal().value).toBe('106.618,53'));

        fireEvent.change(valorTotal(), { target: { value: '13000000' } });
        fireEvent.change(juros(), { target: { value: '1.0' } });
        await waitFor(() => expect(valorTotal().value).not.toBe('130.000,00'));
        expect(valorDaSerie()).toMatch(/^R\$ 11\.550,34/);
        expect((screen.getByLabelText('Preço sem juros') as HTMLInputElement).value).toBe('130.000,00');
    });

    it('SAC: o resumo mostra da primeira à última parcela', () => {
        abrir();
        fireEvent.change(juros(), { target: { value: '1' } });
        fireEvent.change(screen.getByLabelText('Sistema'), { target: { value: 'SAC' } });
        expect(resumo()).toBe(
            'Vai gerar: 12× parcelas mensais de R$ 9.333,33 a R$ 8.416,70 (SAC, 1% a.m.) — juros R$ 6.500,00, total R$ 106.500,00.',
        );
    });

    it('juros pré-preenchido pelo único plano de vendas com juros do empreendimento', async () => {
        listas.planos = [{ name: 'Tabela 2026', interest_rate_monthly: 1.2 }, { name: 'À vista', interest_rate_monthly: 0 }];
        abrir();
        await waitFor(() => expect(juros().value).toBe('1.2'));
        expect(screen.getByText('Taxa do plano de vendas Tabela 2026.')).toBeInTheDocument();
        // Editável, e o que o usuário digita vence a sugestão.
        fireEvent.change(juros(), { target: { value: '0.9' } });
        expect(juros().value).toBe('0.9');
        expect(screen.queryByText(/Taxa do plano de vendas/)).toBeNull();
    });

    it('dois planos com juros: não sugere nada', async () => {
        listas.planos = [{ name: 'A', interest_rate_monthly: 1 }, { name: 'B', interest_rate_monthly: 1.5 }];
        abrir();
        await aguardarPlanoDeVendas();
        expect(juros().value).toBe('');
    });

    it('juros já gravado na negociação vence a sugestão do plano de vendas', async () => {
        listas.planos = [{ name: 'Tabela 2026', interest_rate_monthly: 1.2 }];
        abrir('SALE', { interest_rate_monthly: 0.8, amortization_system: 'SAC', price_before_interest: 100000, contract_total_value: 104000 });
        await aguardarPlanoDeVendas();
        expect(juros().value).toBe('0.8');
        expect((screen.getByLabelText('Sistema') as HTMLSelectElement).value).toBe('SAC');
        expect((screen.getByLabelText('Preço sem juros') as HTMLInputElement).value).toBe('100.000,00');
    });

    it('locação não mostra os campos de juros', async () => {
        listas.planos = [{ name: 'Tabela 2026', interest_rate_monthly: 1.2 }];
        abrir('RENTAL');
        expect(botaoMontar()).toBeInTheDocument();
        // Locação não pergunta pelo plano de vendas.
        await act(async () => { await Promise.resolve(); });
        expect(listActive).not.toHaveBeenCalled();
        expect(screen.queryByLabelText('Juros a.m. (%)')).toBeNull();
        expect(screen.queryByLabelText('Sistema')).toBeNull();
    });

    it('venda que JÁ tem plano sem juros não recebe a sugestão do plano de vendas', async () => {
        listas.planos = [{ name: 'Tabela 2026', interest_rate_monthly: 1.2 }];
        const plano = montarPlanoNoNegocio(
            { type: 'SALE', value: 100000, date: '2026-11-10', contract_total_value: 100000 },
            { entrada: 0, parcelas: 10, tipo: 'MENSAL', intervaloMeses: 1, primeiroVencimento: '2026-12-10', taxaMensal: 0, sistema: 'PRICE' },
            'antigo',
        );
        abrir('SALE', plano);
        await aguardarPlanoDeVendas();
        expect(juros().value).toBe('');
        expect(screen.queryByText(/Taxa do plano de vendas/)).toBeNull();
        // Com plano montado não há linha de partida: o plano se edita na tabela.
        expect(screen.queryByText(/^Vai gerar:/)).toBeNull();
        expect(screen.getByText('Parcelas 1–10')).toBeInTheDocument();
    });
});

describe('DealModal › Valor Total com juros × composição das unidades', () => {
    beforeEach(() => { listas.planos = []; listActive.mockClear(); });

    const comJuros = () => ({
        units: [{ property_id: 'u1', value: 100000, is_primary: true }],
        property_id: 'u1',
        ...montarPlanoNoNegocio(
            { type: 'SALE', value: 100000, date: '2026-11-10', contract_total_value: 100000 },
            { entrada: 0, parcelas: 12, tipo: 'MENSAL', intervaloMeses: 1, primeiroVencimento: '2026-12-10', taxaMensal: 1, sistema: 'PRICE' },
            'j',
        ),
    });

    it('diferença = juros do plano: linha neutra "Inclui juros", sem o aviso âmbar', () => {
        abrir('SALE', comJuros());
        const linha = screen.getByText(/^Inclui juros de/);
        expect(linha.textContent!.replace(/\u00a0/g, ' ')).toBe('Inclui juros de R$ 6.618,53 sobre a soma das unidades (R$ 100.000,00).');
        expect(linha.className).not.toMatch(/amber/);
        expect(screen.queryByText(/A composição das unidades soma/)).toBeNull();
    });

    it('qualquer outra diferença continua com o aviso âmbar', () => {
        abrir('SALE', { ...comJuros(), contract_total_value: 130000 });
        const aviso = screen.getByText(/A composição das unidades soma/);
        expect(aviso.textContent!.replace(/\u00a0/g, ' ')).toBe('A composição das unidades soma R$ 100.000,00 — diferença de R$ 30.000,00.');
        expect(aviso.className).toMatch(/amber/);
        expect(screen.queryByText(/^Inclui juros de/)).toBeNull();
    });
});
