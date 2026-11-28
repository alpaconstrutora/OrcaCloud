// @vitest-environment jsdom
/**
 * Recebimento mobile — a tela (`RecebimentoFluxo`), a mesma do app logado e do link.
 * docs/planos/2026-11-27-recebimento-mobile.md, Fases 4 e 5.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import RecebimentoFluxo from '../../components/suprimentos/recebimento/RecebimentoFluxo';
import { ConfirmProvider } from '../../components/ui/confirm';
import type { FonteRecebimento, PedidoAberto, PedidoDaLista } from '../../services/recebimentoFonte';

const linha = (over: Partial<PedidoDaLista>): PedidoDaLista => ({
    id: 'po1', numero: 'PC-001', org_id: 'o1', org_nome: 'Alpa', obra: 'Garden', fornecedor: 'Casa do Cimento',
    status: 'Em Trânsito', fob: false, previsao: '2026-11-28', itens: 2, versao: 3, grupo: 'a_conferir',
    divergencias_pendentes: 0, atualizado: null, ...over,
});

const PEDIDO: PedidoAberto = {
    id: 'po1', numero: 'PC-001', org_id: 'o1', org_nome: 'Alpa', obra: 'Garden', fornecedor: 'Casa do Cimento',
    status: 'Em Trânsito', fob: false, previsao: '2026-11-28', versao: 3, notas_recebimento: null, data_retirada: null,
    retirado_por: null,
    itens: [
        { indice: 0, code: 'C1', description: 'Cimento', unit: 'sc', quantity: 10 },
        { indice: 1, code: 'A1', description: 'Areia', unit: 'm3', quantity: 4 },
    ],
    colaboradores: [], conferencias: [], divergencias: [], documentos: [],
};

function fonte(over: Partial<FonteRecebimento> = {}): FonteRecebimento & { receber: ReturnType<typeof vi.fn> } {
    return {
        modo: 'link',
        listar: vi.fn(async () => [linha({}), linha({ id: 'po2', numero: 'PC-002', org_id: 'o2', org_nome: 'Garden SPE', grupo: 'a_retirar', fob: true, status: 'Confirmado' })]),
        abrir: vi.fn(async () => PEDIDO),
        receber: vi.fn(async () => ({ receiptId: 'r1', status: 'Parcial' as const, statusPedido: 'Entregue', versao: 4, jaExistia: false, financeiro: { pulou: 'sem-nota' as const, motivo: '' } })),
        registrarRetirada: vi.fn(),
        enviarDocumento: vi.fn(),
        assinar: vi.fn(async () => ({})),
        ...over,
    } as FonteRecebimento & { receber: ReturnType<typeof vi.fn> };
}

const montar = (f: FonteRecebimento) => render(<ConfirmProvider><RecebimentoFluxo fonte={f} /></ConfirmProvider>);

describe('RecebimentoFluxo', () => {
    it('lista por grupo, com a organização quando há mais de uma, status do FOB como "Aguardando retirada"', async () => {
        montar(fonte());
        expect(await screen.findByRole('heading', { name: /A conferir/ })).toBeTruthy();
        expect(screen.getByRole('heading', { name: /A retirar/ })).toBeTruthy();
        expect(screen.getByText(/Garden · Alpa/)).toBeTruthy();
        expect(screen.getByText('Confirmado')).toBeTruthy();
    });

    it('conferência parcial: o resto vem depois → confirma → grava pela fonte com o saldo', async () => {
        const f = fonte();
        montar(f);
        fireEvent.click(await screen.findByText(/PC-001 · Casa do Cimento/));
        fireEvent.click(await screen.findByRole('button', { name: /Conferir e receber/ }));
        const qtd = screen.getByLabelText('Quantidade recebida', { selector: '#receber-qtd-0' });
        fireEvent.change(qtd, { target: { value: '6' } });
        fireEvent.click(screen.getByLabelText('O resto vem depois'));
        expect(screen.getByText(/Vai ficar como/)).toHaveTextContent('recebimento parcial');
        fireEvent.click(screen.getByRole('button', { name: 'Registrar recebimento parcial' }));
        const dialogo = await screen.findByRole('dialog');
        fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar parcial' }));
        await vi.waitFor(() => expect(f.receber).toHaveBeenCalledTimes(1));
        expect(f.receber.mock.calls[0][0]).toMatchObject({
            orderId: 'po1', versao: 3, notas: null, foto: null,
            itens: [
                { indice: 0, recebida: 6, problema: null, restoDepois: true, obs: null },
                { indice: 1, recebida: 4, problema: null, restoDepois: false, obs: null },
            ],
        });
        expect(await screen.findByText(/Recebimento parcial registrado.*aguardando a nota fiscal/)).toBeTruthy();
    });

    it('quantidade acima do saldo: botão desligado, com o motivo', async () => {
        montar(fonte());
        fireEvent.click(await screen.findByText(/PC-001 · Casa do Cimento/));
        fireEvent.click(await screen.findByRole('button', { name: /Conferir e receber/ }));
        fireEvent.change(screen.getByLabelText('Quantidade recebida', { selector: '#receber-qtd-0' }), { target: { value: '11' } });
        const botao = screen.getByRole('button', { name: 'Confirmar recebimento' });
        expect(botao).toBeDisabled();
        expect(screen.getByText(/recebeu mais do que o saldo/)).toBeTruthy();
        expect(botao.parentElement?.getAttribute('title')).toMatch(/recebeu mais do que o saldo/);
    });

    it('sem acesso a Compras: explica, sem "Tentar de novo"', async () => {
        montar(fonte({ listar: vi.fn(async () => { throw new Error('sem acesso a Pedidos de Compra'); }) }));
        expect(await screen.findByText('Você não tem acesso a Pedidos de Compra.')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Tentar de novo/ })).toBeNull();
    });

    it('lista vazia explica o que aparece ali', async () => {
        montar(fonte({ listar: vi.fn(async () => []) }));
        expect(await screen.findByText('Nada para receber')).toBeTruthy();
    });
});
