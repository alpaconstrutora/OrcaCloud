// @vitest-environment jsdom
/**
 * Premissas › Mercado (Fase 7 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md):
 * comparáveis (7.1), estudo de mercado de origem (7.2), origem da VSO (7.3) e só leitura.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    updateStudy: vi.fn(),
    listarComparaveis: vi.fn(),
    salvarComparavel: vi.fn(),
    excluirComparavel: vi.fn(),
    listarEmpreendimentosParaVincular: vi.fn(),
    listarDueDiligence: vi.fn(),
}));
const market = vi.hoisted(() => ({ getTerrainStudy: vi.fn() }));
vi.mock('../../services/imovibService', () => ({ imovibService: svc }));
vi.mock('../../services/opuraMarketService', () => ({ opuraMarketService: market }));
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: { listRegulatoryZonesByImovibStudy: vi.fn().mockResolvedValue([]), getById: vi.fn().mockResolvedValue(null) } }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

import ImovibPremisesForm from '../../components/ImovibPremisesForm';
import { ConfirmProvider } from '../../components/ui/confirm';
import { ToastProvider } from '../../components/ui/toast';
import { ImovibEdicaoProvider } from '../../hooks/useImovibEdicao';
import { baseStudy } from '../fixtures/imovibEstudos';

const estudo = (over: Record<string, unknown> = {}) => ({ ...baseStudy(over), organization_id: 'org', version: '1.0', created_at: '', updated_at: '' });
const tela = async (over: Record<string, unknown> = {}, somenteLeitura = false) => {
    const user = userEvent.setup();
    render(
        <ToastProvider>
            <ConfirmProvider>
                <ImovibEdicaoProvider value={somenteLeitura ? { pode: false, motivo: 'Sem permissão' } : { pode: true, motivo: '' }}>
                    <ImovibPremisesForm study={estudo(over) as never} onDataChanged={vi.fn()} />
                </ImovibEdicaoProvider>
            </ConfirmProvider>
        </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: /1\. Mercado/ }));
    return user;
};
// 40 unidades de 70 m² a R$ 10.000/m²: o estudo vende a R$ 10.000/m².
const COMPARAVEIS = [
    { id: 'a', study_id: 'estudo-teste', name: 'Residencial A', total_units: 100, sold_units: 40, launch_date: '2026-03-15', price_sqm: 9_000 },
    { id: 'b', study_id: 'estudo-teste', name: 'Residencial B', total_units: 300, sold_units: 60, launch_date: '2026-03-15', price_sqm: 11_000 },
];

beforeEach(() => {
    for (const f of [...Object.values(svc), ...Object.values(market)]) f.mockReset();
    svc.updateStudy.mockResolvedValue({});
    svc.listarComparaveis.mockResolvedValue(COMPARAVEIS);
    svc.listarEmpreendimentosParaVincular.mockResolvedValue([]);
    svc.listarDueDiligence.mockResolvedValue([]);
});

describe('Premissas › Mercado', () => {
    it('7.1 — posição do preço e VSO média; "Usar na curva de vendas" preenche a VSO e grava com "Salvar Premissas"', async () => {
        const user = await tela();
        const secao = screen.getByRole('region', { name: 'Comparáveis' });
        expect(await within(secao).findByText('Residencial A')).toBeTruthy();
        // Média ponderada: (100 × 9.000 + 300 × 11.000) / 400 = 10.500; estudo a 10.000 → −4,8%.
        expect(within(secao).getByText('-4,8%')).toBeTruthy();
        await user.click(within(secao).getByRole('button', { name: 'Usar na curva de vendas' }));
        expect(screen.getByText(/Origem: média dos comparáveis/)).toBeTruthy();
        await user.click(screen.getByRole('button', { name: 'Salvar Premissas' }));
        const gravado = svc.updateStudy.mock.calls[0][1];
        expect(gravado.vso_regional_source).toBe('comparaveis');
        expect(gravado.vso_regional_percent).toBeGreaterThan(0);
        expect(gravado.sales_vso_percent).toBe(gravado.vso_regional_percent);
    });

    it('7.3 — digitar a VSO marca a origem como digitada', async () => {
        const user = await tela({ vso_regional_percent: 3, vso_regional_source: 'comparaveis' });
        expect(screen.getByText(/Origem: média dos comparáveis/)).toBeTruthy();
        await user.clear(screen.getByLabelText('VSO Histórica Região (%)'));
        await user.type(screen.getByLabelText('VSO Histórica Região (%)'), '4');
        expect(screen.getByText(/Origem: digitada/)).toBeTruthy();
    });

    it('7.1 — novo comparável pelo drawer: o botão diz o que falta; criar grava e entra na tabela', async () => {
        svc.salvarComparavel.mockImplementation(async (c: Record<string, unknown>) => ({ ...c, id: 'c' }));
        const user = await tela();
        await user.click(screen.getByRole('button', { name: 'Novo comparável' }));
        const criar = screen.getByRole('button', { name: 'Criar comparável' });
        expect(criar.getAttribute('title')).toBe('Dê o nome do empreendimento.');
        await user.type(screen.getByLabelText('Empreendimento'), 'Residencial C');
        await user.type(screen.getByLabelText('Unidades totais'), '50');
        await user.type(screen.getByLabelText('Unidades vendidas'), '60');
        expect(criar.getAttribute('title')).toBe('Vendidas não pode passar do total.');
        await user.clear(screen.getByLabelText('Unidades vendidas'));
        await user.type(screen.getByLabelText('Unidades vendidas'), '20');
        await user.click(criar);
        expect(svc.salvarComparavel).toHaveBeenCalledWith(expect.objectContaining({ name: 'Residencial C', total_units: 50, sold_units: 20, study_id: 'estudo-teste' }));
        expect(await screen.findByText('Residencial C')).toBeTruthy();
    });

    it('7.2 — sem vínculo, o estado vazio; com vínculo, o estudo de mercado e a absorção como hipótese', async () => {
        await tela();
        expect(screen.getByText(/não nasceu de um estudo de terreno salvo/)).toBeTruthy();
    });

    it('7.2 — com vínculo: nome, preço médio do raio e a absorção do Market', async () => {
        market.getTerrainStudy.mockResolvedValue({
            id: 't1', name: 'Terreno da Av. Brasil', createdAt: '2026-11-01T10:00:00Z', analysisRadiusMeters: 1000,
            estimatedAbsorptionVelocity: 6.5,
            radiusStats: { pricePerM2Avg: 9_800, totalListings: 42, ticketAvg: 650_000, areaAvg: 66.3 },
        });
        await tela({ opura_terrain_study_id: 't1' });
        expect(await screen.findByText('Terreno da Av. Brasil')).toBeTruthy();
        expect(screen.getByText('42')).toBeTruthy();
        expect(screen.getByText(/Absorção \(hipótese do Market\): 6,5% ao mês/)).toBeTruthy();
        expect(market.getTerrainStudy).toHaveBeenCalledWith('t1');
    });

    it('só leitura: "Novo comparável" e "Usar na curva de vendas" desligados com o motivo; nada grava', async () => {
        await tela({}, true);
        const novo = screen.getByRole('button', { name: 'Novo comparável' });
        expect(novo.hasAttribute('disabled')).toBe(true);
        expect(novo.getAttribute('title')).toBe('Sem permissão');
        expect(screen.getByRole('button', { name: 'Usar na curva de vendas' }).getAttribute('title')).toBe('Sem permissão');
        expect(svc.updateStudy).not.toHaveBeenCalled();
    });
});
