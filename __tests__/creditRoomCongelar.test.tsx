// @vitest-environment jsdom
/**
 * "Congelar versão" em dois passos (Conferir → Congelar) — CongelarSheet.
 *
 * O que estes testes protegem:
 *  - "Congelar" só liga depois que "Conferir" volta, e diz o motivo enquanto está desligado;
 *  - a conferência mostra os alertas da carteira (com o "como resolver") e os blocos sem dado;
 *  - mudar a data-base DEPOIS de conferir descarta a versão preparada: "Congelar" desliga de novo;
 *  - "Congelar" entrega ao serviço o MESMO objeto que o "Conferir" preparou;
 *  - erro do prepararVersao (ex.: não-membro do grupo) aparece no painel e não libera o "Congelar".
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prepararVersao, freezeVersion } = vi.hoisted(() => ({
    prepararVersao: vi.fn(),
    freezeVersion: vi.fn(),
}));

// O CreditRoomDetail importa o store inteiro; sem o cliente Supabase o módulo lança por falta de variáveis de ambiente.
vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../services/creditRoomService', () => ({
    creditRoomService: { prepararVersao, freezeVersion },
}));

import { ConfirmProvider } from '../components/ui/confirm';
import { CongelarSheet } from '../components/credit/CreditRoomDetail';
import type { CreditRoom, CreditRoomVersion } from '../types/creditRoom';
import { buildSnapshot, computeIndicators, type SnapshotCapacidade } from '../utils/creditRoomSnapshot';
import { PARAMETROS_CAPACIDADE_PADRAO, type SerieMes } from '../utils/creditCapacity';

const serie: SerieMes[] = Array.from({ length: 12 }, (_, k) => ({
    mes: `2026-${String(k + 1).padStart(2, '0')}`, vendas: 6000, alugueis: 4000, despesa_operacional: 500,
    renda_liquida: 9500, servico_atual: 5000, servico_novo: 1000, folga: 3500, dscr: 1.58,
}));

const capacidade: SnapshotCapacidade = {
    fonte: 'creditCapacity', data_base: '2026-09-07',
    parametros: PARAMETROS_CAPACIDADE_PADRAO, base: 'CONTRATADA', serie,
    recebido_12m: [], vencido_na_data_base: 0, a_vencer_mes_corrente: 0, estoque: null,
    capacidade_maxima: { parcela_maxima: 4_000, valor_maximo: 123_400 },
    alertas: [{ tipo: 'VENDA_SEM_PARCELAS', qtd: 3, valor: 90_000 }],
    por_organizacao: [],
};

const preparar = (cap: SnapshotCapacidade | null, dataBase = '2026-09-07') => {
    const snapshot = buildSnapshot({
        dataBase,
        operacao: {
            requestedAmount: 5_000_000, modality: 'Financiamento',
            eligibleFlows: { noi: true, receivables: true, operating_cash: false },
            guarantees: [], equityCommitted: 0, equityContributed: 0,
        },
        documentVersionIds: [],
        ...(cap ? { capacidade: cap } : {}),
    });
    return { roomId: 'r1', dataBase, snapshot, indicators: computeIndicators(snapshot) };
};

const room = { id: 'r1', code: 'CR-1', name: 'Operação teste' } as unknown as CreditRoom;

const abrir = (onFrozen = vi.fn(), onClose = vi.fn()) =>
    render(
        <ConfirmProvider>
            <CongelarSheet open onClose={onClose} room={room} proximo={2} onFrozen={onFrozen} />
        </ConfirmProvider>,
    );

const botaoCongelar = () => screen.getByRole('button', { name: /^Congelar$/ });
const botaoConferir = () => screen.getByRole('button', { name: /^Conferir$/ });
const campoDataBase = () => document.querySelector('input[type="date"]') as HTMLInputElement;

beforeEach(() => {
    prepararVersao.mockReset();
    freezeVersion.mockReset();
});

describe('CongelarSheet — Conferir → Congelar', () => {
    it('"Congelar" nasce desligado e diz o motivo; liga quando a conferência volta', async () => {
        let resolver: (p: ReturnType<typeof preparar>) => void = () => undefined;
        prepararVersao.mockReturnValue(new Promise(r => { resolver = r; }));
        abrir();

        expect(botaoCongelar()).toBeDisabled();
        expect(botaoCongelar()).toHaveAttribute('title', 'Confira a versão antes de congelar');

        fireEvent.click(botaoConferir());
        expect(await screen.findByRole('button', { name: /Conferindo/ })).toBeDisabled();
        expect(botaoCongelar()).toBeDisabled();
        resolver(preparar(capacidade));

        await waitFor(() => expect(botaoCongelar()).not.toBeDisabled());
        expect(prepararVersao).toHaveBeenCalledWith(room, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    });

    it('mostra valor máximo, DSCR, renda, os alertas com o "como resolver" e os blocos sem dado', async () => {
        prepararVersao.mockResolvedValue(preparar(capacidade));
        abrir();
        fireEvent.click(botaoConferir());

        await screen.findByText('Valor máximo (sobre a dívida atual)');
        expect(screen.getByText('DSCR mínimo 12m (pós-operação)')).toBeInTheDocument();
        expect(screen.getByText('Renda líquida média 12m')).toBeInTheDocument();
        expect(screen.getByText('1,58×')).toBeInTheDocument();
        expect(screen.getByText(/Vendas sem parcelas geradas/)).toBeInTheDocument();
        expect(screen.getByText(/Gerar parcelas/)).toBeInTheDocument();
        // `obra` não veio no snapshot do teste: entra na lista de blocos sem dado.
        expect(screen.getByText(/Sem dado nesta versão:.*Obra/)).toBeInTheDocument();
    });

    it('carteira sem alertas diz que não há pendências de cadastro', async () => {
        prepararVersao.mockResolvedValue(preparar({ ...capacidade, alertas: [] }));
        abrir();
        fireEvent.click(botaoConferir());
        expect(await screen.findByText('Carteira sem pendências de cadastro')).toBeInTheDocument();
    });

    it('capacidade ausente: avisa que a versão sai sem ela, e ainda deixa congelar', async () => {
        prepararVersao.mockResolvedValue(preparar(null));
        abrir();
        fireEvent.click(botaoConferir());
        expect(await screen.findByText(/capacidade de pagamento não pôde ser calculada/i)).toBeInTheDocument();
        expect(screen.getByText(/será congelada sem ela/i)).toBeInTheDocument();
        expect(botaoCongelar()).not.toBeDisabled();
    });

    it('mudar a data-base depois de conferir descarta a versão preparada', async () => {
        prepararVersao.mockResolvedValue(preparar(capacidade));
        abrir();
        fireEvent.click(botaoConferir());
        await waitFor(() => expect(botaoCongelar()).not.toBeDisabled());

        fireEvent.change(campoDataBase(), { target: { value: '2026-08-31' } });

        expect(botaoCongelar()).toBeDisabled();
        expect(botaoCongelar()).toHaveAttribute('title', 'Confira a versão antes de congelar');
        expect(screen.queryByText('Valor máximo')).toBeNull();
        expect(botaoConferir()).not.toBeDisabled();
    });

    it('conferência que volta DEPOIS de a data-base mudar é ignorada', async () => {
        let resolver: (p: ReturnType<typeof preparar>) => void = () => undefined;
        prepararVersao.mockReturnValue(new Promise(r => { resolver = r; }));
        abrir();
        fireEvent.click(botaoConferir());
        fireEvent.change(campoDataBase(), { target: { value: '2026-08-31' } });
        await act(async () => { resolver(preparar(capacidade, '2026-09-07')); });

        expect(prepararVersao).toHaveBeenCalledTimes(1);
        expect(botaoCongelar()).toBeDisabled();
        expect(screen.queryByText('Valor máximo')).toBeNull();
    });

    it('sala alterada com o painel aberto descarta a versão preparada', async () => {
        prepararVersao.mockResolvedValue(preparar(capacidade));
        const { rerender } = abrir();
        fireEvent.click(botaoConferir());
        await waitFor(() => expect(botaoCongelar()).not.toBeDisabled());

        const salaEditada = { ...room, name: 'Operação editada' } as unknown as CreditRoom;
        rerender(
            <ConfirmProvider>
                <CongelarSheet open onClose={vi.fn()} room={salaEditada} proximo={2} onFrozen={vi.fn()} />
            </ConfirmProvider>,
        );

        expect(botaoCongelar()).toBeDisabled();
        expect(screen.queryByText('Valor máximo')).toBeNull();
    });

    it('a data-base fica travada enquanto congela, com o motivo', async () => {
        prepararVersao.mockResolvedValue(preparar(capacidade));
        freezeVersion.mockReturnValue(new Promise(() => undefined));
        abrir();
        fireEvent.click(botaoConferir());
        await waitFor(() => expect(botaoCongelar()).not.toBeDisabled());
        fireEvent.click(botaoCongelar());
        await waitFor(() => expect(campoDataBase()).toBeDisabled());
        expect(campoDataBase()).toHaveAttribute('title', expect.stringMatching(/Congelando/));
    });

    it('"Congelar" entrega ao serviço o mesmo objeto preparado no "Conferir"', async () => {
        const preparada = preparar(capacidade);
        prepararVersao.mockResolvedValue(preparada);
        const congelada = { id: 'v2' } as unknown as CreditRoomVersion;
        freezeVersion.mockResolvedValue(congelada);
        const onFrozen = vi.fn();
        const onClose = vi.fn();
        abrir(onFrozen, onClose);

        fireEvent.change(screen.getByPlaceholderText(/Proposta inicial/), { target: { value: ' Comitê ' } });
        fireEvent.click(botaoConferir());
        await waitFor(() => expect(botaoCongelar()).not.toBeDisabled());
        fireEvent.click(botaoCongelar());

        await waitFor(() => expect(freezeVersion).toHaveBeenCalledTimes(1));
        const [salaArg, opts, preparadaArg] = freezeVersion.mock.calls[0];
        expect(salaArg).toBe(room);
        expect(opts).toMatchObject({ label: 'Comitê', dataBase: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
        expect(preparadaArg).toBe(preparada);
        await waitFor(() => expect(onFrozen).toHaveBeenCalledWith(congelada));
        expect(onClose).toHaveBeenCalled();
    });

    it('erro do prepararVersao (ex.: não é membro do grupo) aparece no painel e não libera o "Congelar"', async () => {
        prepararVersao.mockRejectedValue(new Error('Você não é membro de todas as empresas do grupo.'));
        abrir();
        fireEvent.click(botaoConferir());

        expect(await screen.findByText(/não é membro de todas as empresas do grupo/)).toBeInTheDocument();
        expect(botaoCongelar()).toBeDisabled();
        expect(botaoConferir()).not.toBeDisabled();
    });
});
