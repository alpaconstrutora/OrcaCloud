// @vitest-environment jsdom
/**
 * Fase C do plano docs/planos/2026-11-21-portal-do-investidor-consolidacao.md — telas do investidor.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ interesse: vi.fn(), obra: vi.fn() }));
vi.mock('../../services/investorPortalTokenService', () => ({
    investorPortalTokenService: {
        getVersaoPublicadaByToken: () => Promise.resolve(null),
        submitInterestByToken: svc.interesse,
        getObraDaOportunidadeByToken: svc.obra,
    },
}));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;

import PortalOpportunities from '../../components/investor/portal/PortalOpportunities';
import SimuladorDaOportunidade, { oportunidadesSimulaveis } from '../../components/investor/SimuladorDaOportunidade';

const comVersao = (over = {}) => ({
    id: 'op1', organization_id: 'org', title: 'Garden', status: 'captacao', is_published: true, ticket_min: 50_000,
    indicadores_da_versao: { vgv: 10_000_000, lucroLiquido: 2_000_000, exposicaoMaxima: 5_000_000, tirAnual: 20, tma: 12 },
    resultados_da_versao: { duracao: 36 }, distances_json: [{ place: 'Shopping', distance: '1 km' }],
    team_json: [{ name: 'Ana', role: 'RI' }], ...over,
}) as never;

beforeEach(() => {
    svc.interesse.mockReset().mockResolvedValue('id');
    svc.obra.mockReset().mockResolvedValue({ nome: 'Obra Garden', avanco: 42, fase: 'Estrutura', marcos: [{ nome: 'Fundação', previsto: '2026-01-10', concluido: '2026-02-01', status: 'completed' }] });
});

describe('C3 — interesse com valor pretendido', () => {
    it('sem valor o botão diz por quê; abaixo do ticket também; com valor envia', async () => {
        const user = userEvent.setup();
        render(<PortalOpportunities opportunities={[comVersao()]} portalToken="tok" />);
        await user.click(screen.getByText('Garden'));
        const botao = screen.getByRole('button', { name: 'Tenho interesse' }) as HTMLButtonElement;
        expect(botao.disabled).toBe(true);
        expect(botao.parentElement!.getAttribute('title')).toMatch(/Informe quanto/);
        await user.type(screen.getByLabelText('Valor pretendido'), '1000000');
        expect(botao.parentElement!.getAttribute('title')).toMatch(/ticket mínimo/);
        await user.clear(screen.getByLabelText('Valor pretendido'));
        await user.type(screen.getByLabelText('Valor pretendido'), '8000000');
        await user.click(botao);
        expect(svc.interesse).toHaveBeenCalledWith('tok', expect.objectContaining({ opportunityId: 'op1', valor: 80_000 }));
    });
});

describe('C8 — apresentação pelo link', () => {
    it('"Ver apresentação" mostra distâncias, equipe, simulador e a obra ao vivo', async () => {
        const user = userEvent.setup();
        render(<PortalOpportunities opportunities={[comVersao()]} portalToken="tok" />);
        await user.click(screen.getByText('Garden'));
        await user.click(screen.getByRole('button', { name: 'Ver apresentação' }));
        const detalhe = await screen.findByRole('region', { name: 'Garden' });
        expect(within(detalhe).getByText('Shopping')).toBeTruthy();
        expect(within(detalhe).getByText('Ana')).toBeTruthy();
        expect(within(detalhe).getByRole('region', { name: 'Simulador' })).toBeTruthy();
        const obra = await within(detalhe).findByRole('region', { name: 'Obra ao vivo' });
        expect(obra.textContent).toMatch(/Obra Garden/);
        expect(obra.textContent).toMatch(/Fundação/);
        expect(svc.obra).toHaveBeenCalledWith('tok', 'op1');
    });
});

describe('C7 — aba Simulador', () => {
    it('só oportunidade publicada com versão é simulável', () => {
        expect(oportunidadesSimulaveis([comVersao(), comVersao({ id: 'op2', indicadores_da_versao: null }), comVersao({ id: 'op3', is_published: false })]).map(o => o.id)).toEqual(['op1']);
    });
    it('sem oportunidade simulável, diz por quê', () => {
        render(<SimuladorDaOportunidade opportunities={[]} />);
        expect(screen.getByText(/Nenhuma oportunidade publicada com versão/)).toBeTruthy();
    });
    it('com duas, escolhe qual simular', async () => {
        const user = userEvent.setup();
        render(<SimuladorDaOportunidade opportunities={[comVersao(), comVersao({ id: 'op2', title: 'Torre' })]} />);
        await user.selectOptions(screen.getByLabelText('Oportunidade a simular'), 'op2');
        expect((screen.getByLabelText('Oportunidade a simular') as HTMLSelectElement).value).toBe('op2');
    });
});
