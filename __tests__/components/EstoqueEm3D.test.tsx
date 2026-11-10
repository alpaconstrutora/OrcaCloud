// @vitest-environment jsdom
/**
 * O ESTOQUE EM 3D do Portal do Corretor (Espelho de Vendas 3D, F3 — 09/11/2026): o seletor "2D | 3D" e a ficha
 * com as ações do corretor — as mesmas do espelho 2D. O desenho (three) fica de fora, como no teste do `Espelho3D`.
 * Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { montarEspelhoDoEstoque, type ImovelDoEstoque } from '../../utils/espelhoDoEstoque';
import type { BrokerUnit } from '../../types';

vi.mock('../../components/espelho3d/webglDisponivel', () => ({ webglDisponivel: () => true, reduzMovimento: () => true }));
vi.mock('../../components/espelho3d/Espelho3DCena', () => ({
    default: (p: { onSelecionar: (id: string | null) => void }) => (
        <>
            <button type="button" onClick={() => p.onSelecionar('102')}>tocar 102</button>
            <button type="button" onClick={() => p.onSelecionar('101')}>tocar 101</button>
        </>
    ),
}));

import { EstoqueEm3D, SeletorDaVisaoDoEstoque, type EstoqueEm3DState } from '../../components/broker/EstoqueEm3D';

const imovel = (id: string, floor: number | undefined, extra: Partial<ImovelDoEstoque> = {}): ImovelDoEstoque => ({
    id, name: `Apto ${id}`, number: id, type: 'APARTMENT', parent_id: 'predio', status: 'AVAILABLE' as never, block: 'A', floor, private_area: 80, price: 400_000, ...extra,
});
const IMOVEIS = [imovel('101', 1, { status: 'SOLD' as never }), imovel('102', 1), imovel('201', 2)];

const estado = (over: Partial<EstoqueEm3DState> = {}): EstoqueEm3DState => ({
    visaoDoEstoque: '3D',
    setVisaoDoEstoque: vi.fn(),
    motivoSem3d: null,
    estoqueEm3d: true,
    espelhoDoEstoque: montarEspelhoDoEstoque({ imoveis: IMOVEIS, negocios: [] }),
    visibleUnits: IMOVEIS as unknown as BrokerUnit[],
    cart: [],
    handleMakeProposal: vi.fn(),
    handleReserve: vi.fn(),
    handleToggleCart: vi.fn(),
    ...over,
});

describe('SeletorDaVisaoDoEstoque', () => {
    it('mostra qual visão está ativa e troca ao clicar', () => {
        const h = estado({ estoqueEm3d: false, visaoDoEstoque: '2D' });
        render(<SeletorDaVisaoDoEstoque h={h} />);
        expect(screen.getByRole('button', { name: '2D' }).getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(screen.getByRole('button', { name: '3D' }));
        expect(h.setVisaoDoEstoque).toHaveBeenCalledWith('3D');
    });

    it('sem um prédio para desenhar, o 3D fica desligado e diz o motivo', () => {
        render(<SeletorDaVisaoDoEstoque h={estado({ estoqueEm3d: false, motivoSem3d: 'Escolha um empreendimento para ver em 3D.' })} />);
        const b = screen.getByRole('button', { name: '3D' }) as HTMLButtonElement;
        expect(b.disabled).toBe(true);
        expect(b.title).toBe('Escolha um empreendimento para ver em 3D.');
        // A preferência gravada pode ser 3D; o que vale é o que está na tela: 2D.
        expect(screen.getByRole('button', { name: '2D' }).getAttribute('aria-pressed')).toBe('true');
    });
});

describe('EstoqueEm3D', () => {
    it('enquanto a estrutura não chega, diz que está montando — não uma área em branco', () => {
        render(<EstoqueEm3D h={estado({ espelhoDoEstoque: null })} />);
        expect(screen.getByRole('status').textContent).toMatch(/Montando o desenho das torres/);
    });

    it('usa as cores e os nomes do corretor: Vendidas, Reservadas, Indisponíveis', () => {
        render(<EstoqueEm3D h={estado()} />);
        expect(screen.getByRole('radio', { name: /Disponíveis 2/ })).toBeTruthy();
        expect(screen.getByRole('radio', { name: /Vendidas 1/ })).toBeTruthy();
        expect(screen.getByRole('radio', { name: /Reservadas 0/ })).toBeTruthy();
    });

    it('unidade disponível: proposta, reserva e cesta chamam as ações do portal com o IMÓVEL', async () => {
        const h = estado();
        render(<EstoqueEm3D h={h} />);
        fireEvent.click(await screen.findByRole('button', { name: 'tocar 102' }));
        expect(screen.getByText(/R\$\s?400\.000/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Fazer proposta' }));
        fireEvent.click(screen.getByRole('button', { name: 'Reservar (48h)' }));
        fireEvent.click(screen.getByRole('button', { name: 'Somar à proposta' }));
        const alvo = expect.objectContaining({ id: '102' });
        expect(h.handleMakeProposal).toHaveBeenCalledWith(alvo);
        expect(h.handleReserve).toHaveBeenCalledWith(alvo);
        expect(h.handleToggleCart).toHaveBeenCalledWith(alvo);
    });

    it('unidade já na cesta oferece tirar', async () => {
        render(<EstoqueEm3D h={estado({ cart: [IMOVEIS[1] as unknown as BrokerUnit] })} />);
        fireEvent.click(await screen.findByRole('button', { name: 'tocar 102' }));
        expect(screen.getByRole('button', { name: 'Tirar da proposta' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('unidade vendida: sem botões, com a frase que diz por quê', async () => {
        render(<EstoqueEm3D h={estado()} />);
        fireEvent.click(await screen.findByRole('button', { name: 'tocar 101' }));
        expect(screen.queryByRole('button', { name: 'Fazer proposta' })).toBeNull();
        expect(screen.getByText('Esta unidade não está disponível para reserva nem proposta.')).toBeTruthy();
    });

    it('imóvel sem andar fica fora do desenho, e a tela conta quantos', () => {
        const espelho = montarEspelhoDoEstoque({ imoveis: [...IMOVEIS, imovel('S1', undefined), imovel('S2', undefined)], negocios: [] });
        render(<EstoqueEm3D h={estado({ espelhoDoEstoque: espelho })} />);
        expect(screen.getByText(/2 unidades do estoque não têm andar ou lugar na torre e aparecem só no espelho 2D\./)).toBeTruthy();
    });

    it('prédio sem nenhum andar cadastrado (lotes, casas): a frase, e nada de desenho vazio', () => {
        const espelho = montarEspelhoDoEstoque({ imoveis: [imovel('L1', undefined), imovel('L2', undefined)], negocios: [] });
        render(<EstoqueEm3D h={estado({ espelhoDoEstoque: espelho })} />);
        expect(screen.getByText(/não têm andar cadastrado/)).toBeTruthy();
        expect(screen.queryByRole('radiogroup')).toBeNull();
    });
});
