// @vitest-environment jsdom
/**
 * "Espelho de Vendas" do Portal do Investidor (Espelho de Vendas 3D, F4 — 10/11/2026): a faixa de VGV, o seletor de
 * obra, a ficha com o preço de tabela — e nenhuma ação, porque é leitura. O desenho (three) fica de fora.
 * Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ObraDoEspelho, UnidadeDoInvestidor } from '../../utils/espelhoDoInvestidor';

const getEspelho = vi.hoisted(() => vi.fn());
vi.mock('../../services/investorPortalTokenService', () => ({ investorPortalTokenService: { getEspelho } }));
vi.mock('../../components/espelho3d/webglDisponivel', () => ({ webglDisponivel: () => true, reduzMovimento: () => true }));
vi.mock('../../components/espelho3d/Espelho3DCena', () => ({
    default: (p: { onSelecionar: (id: string | null) => void }) => <button type="button" onClick={() => p.onSelecionar('202')}>tocar 202</button>,
}));

import PortalEspelho from '../../components/investor/portal/PortalEspelho';

const unidade = (id: string, floor: number | null, extra: Partial<UnidadeDoInvestidor> = {}): UnidadeDoInvestidor => ({
    id, name: id, floor, floor_tipo: null, typology: '2 quartos', private_area: 80, bedrooms: 2, bathrooms: 2, parking_spaces: 1,
    position_type: null, sun_orientation: null, sort_order: 0, vaga_na_planta: null, is_vendavel: true, price: 500_000, status: 'available', ...extra,
});
const obra = (id: string, nome: string, units: UnidadeDoInvestidor[], vgv = 930_000): ObraDoEspelho => ({
    project_id: id, project_name: nome, vgv_vendido: vgv,
    torres: [{ id: `t-${id}`, name: 'Torre Única', sort_order: 0, floors_count: 2, units_per_floor: 2, pe_direito_padrao_m: 3, elevacao_terreo_m: null, ordem_das_unidades_na_planta: 'POSICAO', blueprint_quadra_uid: null, distancias_entre_torres: null, floors: [], units }],
});
const BELLA = obra('p1', 'Bella Vista', [unidade('101', 1, { status: 'sold' }), unidade('102', 1, { status: 'sold' }), unidade('201', 2, { status: 'reserved', price: 510_000 }), unidade('202', 2, { price: 520_000 })]);
const GALERIA = obra('p2', 'Galeria', [unidade('1', 1), unidade('2', 1)], 0);

beforeEach(() => getEspelho.mockReset());

describe('PortalEspelho', () => {
    it('pelo link, lê pela função do token; mostra as vendidas, o VGV vendido e o VGV em estoque', async () => {
        getEspelho.mockResolvedValue([BELLA]);
        render(<PortalEspelho portalToken="tok" investorId="inv" />);
        expect(await screen.findByText('2 de 4')).toBeTruthy();
        expect(getEspelho).toHaveBeenCalledWith({ token: 'tok' });
        expect(screen.getByText('50% das unidades')).toBeTruthy();
        expect(screen.getByText(/R\$\s?930\.000/)).toBeTruthy();
        expect(screen.getByText(/R\$\s?1\.030\.000/)).toBeTruthy();
        expect(screen.getByRole('radio', { name: /Vendidas 2/ })).toBeTruthy();
    });

    it('no app logado, lê pela função do investidor', async () => {
        getEspelho.mockResolvedValue([BELLA]);
        render(<PortalEspelho investorId="inv" />);
        await screen.findByText('2 de 4');
        expect(getEspelho).toHaveBeenCalledWith({ investorId: 'inv' });
    });

    it('a ficha mostra o preço de tabela e NENHUMA ação — o investidor só lê', async () => {
        getEspelho.mockResolvedValue([BELLA]);
        render(<PortalEspelho portalToken="tok" />);
        fireEvent.click(await screen.findByRole('button', { name: 'tocar 202' }));
        const ficha = screen.getByRole('region', { name: 'Ficha da unidade 202' });
        expect(ficha.textContent).toMatch(/Preço de tabela\s*R\$\s?520\.000/);
        expect(ficha.querySelectorAll('button')).toHaveLength(1); // só o de fechar
    });

    it('com mais de uma obra, as abas trocam a obra e os números', async () => {
        getEspelho.mockResolvedValue([BELLA, GALERIA]);
        render(<PortalEspelho portalToken="tok" />);
        await screen.findByText('2 de 4');
        fireEvent.click(screen.getByRole('button', { name: 'Galeria' }));
        expect(screen.getByText('0 de 2')).toBeTruthy();
        expect(screen.getByRole('radio', { name: /Disponíveis 2/ })).toBeTruthy();
    });

    it('investidor sem obra com torres: o vazio diz o que falta', async () => {
        getEspelho.mockResolvedValue([]);
        render(<PortalEspelho portalToken="tok" />);
        expect(await screen.findByText('Nenhuma obra com torres e unidades')).toBeTruthy();
    });

    it('sem link nem investidor (gestor sem investidor escolhido): não consulta e pede para escolher', async () => {
        render(<PortalEspelho />);
        expect(await screen.findByText('Escolha um investidor')).toBeTruthy();
        expect(getEspelho).not.toHaveBeenCalled();
    });

    it('falhou: diz, e "Tentar de novo" consulta outra vez', async () => {
        const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
        getEspelho.mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce([BELLA]);
        render(<PortalEspelho portalToken="tok" />);
        expect((await screen.findByRole('alert')).textContent).toMatch(/Não foi possível carregar o espelho de vendas/);
        fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
        await waitFor(() => expect(screen.getByText('2 de 4')).toBeTruthy());
        erro.mockRestore();
    });

    it('obra só com unidades sem andar: os números valem, e a tela diz por que não há desenho', async () => {
        getEspelho.mockResolvedValue([obra('p3', 'Lotes', [unidade('L1', null), unidade('L2', null, { status: 'sold' })])]);
        render(<PortalEspelho portalToken="tok" />);
        expect(await screen.findByText('1 de 2')).toBeTruthy();
        expect(screen.getByText(/não têm andar cadastrado, então não há como desenhar a torre/)).toBeTruthy();
        expect(screen.queryByRole('radiogroup')).toBeNull();
    });
});
