// @vitest-environment jsdom
/**
 * Pedido de 16/11/2026 ("o primeiro painel Oportunidades ocupa quase 50% da tela jogando os
 * dashboard para 4 rolagem de tela para baixo" → "sim" às três partes):
 * 1. a oportunidade aberta é uma tela própria — a lista sai, "← Oportunidades" volta;
 * 2. um cabeçalho só: nome, versão e "Baixar relatório (PDF)" acima das abas, sem o título repetido;
 * 3. a linha expandida mostra só o que tem valor.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ versao: vi.fn(), docs: vi.fn() }));
vi.mock('../../services/investorPortalTokenService', () => ({
    investorPortalTokenService: { getVersaoPublicadaByToken: svc.versao, submitInterestByToken: vi.fn() },
}));
vi.mock('../../services/opportunityDocumentsService', async (orig) => ({
    ...(await orig<typeof import('../../services/opportunityDocumentsService')>()),
    opportunityDocumentsService: { listByToken: svc.docs, getSignedUrlByToken: vi.fn() },
}));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;

import PortalOpportunities from '../../components/investor/portal/PortalOpportunities';
import { baseStudy } from '../fixtures/imovibEstudos';

const garden = { id: 'op1', organization_id: 'spe', title: 'Garden Cambuhy', status: 'estudo', is_published: true, imovib_study_id: 'e1', imovib_version_id: 'v1', land_area_m2: 1200 } as never;
const vp = {
    study: baseStudy() as never, cenarios: [], relatorio: {}, calculo: null,
    versao: { id: 'v1', label: 'Versão de 16/11/2026', created_at: '2026-11-16T08:43:14Z' },
    organizacao: { name: 'SPE', logo_url: null },
};

beforeEach(() => {
    svc.versao.mockReset(); svc.docs.mockReset();
    svc.versao.mockResolvedValue(vp);
    svc.docs.mockResolvedValue([]);
});

const abrirViabilidade = async (user: ReturnType<typeof userEvent.setup>) => {
    render(<PortalOpportunities opportunities={[garden]} portalToken="tok" />);
    await user.click(screen.getByText('Garden Cambuhy'));
    await user.click(screen.getByRole('button', { name: 'Ver viabilidade' }));
    return screen.findByRole('region', { name: 'Garden Cambuhy' });
};

describe('oportunidade aberta: tela própria', () => {
    it('a lista sai; "← Oportunidades" volta com a linha ainda aberta', async () => {
        const user = userEvent.setup();
        await abrirViabilidade(user);
        expect(screen.queryByRole('table')).toBeNull();
        await user.click(screen.getByRole('button', { name: /Oportunidades/ }));
        expect(screen.getByRole('table')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Ver viabilidade' })).toBeTruthy(); // linha segue expandida
        expect(screen.queryByRole('region', { name: 'Garden Cambuhy' })).toBeNull();
    });

    it('um cabeçalho só: nome, versão (sem "Versão Versão") e o PDF acima das abas', async () => {
        const user = userEvent.setup();
        const detalhe = await abrirViabilidade(user);
        expect(within(detalhe).getByRole('heading', { name: 'Garden Cambuhy' })).toBeTruthy();
        expect(await within(detalhe).findByText('Versão de 16/11/2026 · congelada em 16/11/2026')).toBeTruthy();
        expect(within(detalhe).queryByText(/Versão Versão/)).toBeNull();
        expect(within(detalhe).queryByText('Viabilidade do empreendimento')).toBeNull();
        expect(within(detalhe).getAllByRole('button', { name: 'Baixar relatório (PDF)' })).toHaveLength(1);
        expect(await within(detalhe).findByRole('region', { name: 'Indicadores da versão' })).toBeTruthy();
    });

    it('na aba Documentos o cabeçalho continua com a versão e o PDF', async () => {
        const user = userEvent.setup();
        const detalhe = await abrirViabilidade(user);
        await within(detalhe).findByText('Versão de 16/11/2026 · congelada em 16/11/2026');
        await user.click(within(detalhe).getByRole('button', { name: 'Documentos' }));
        expect(within(detalhe).getByText('Versão de 16/11/2026 · congelada em 16/11/2026')).toBeTruthy();
        expect(within(detalhe).getByRole('button', { name: 'Baixar relatório (PDF)' })).toBeTruthy();
        expect(svc.versao).toHaveBeenCalledTimes(1); // trocar de aba não busca de novo
    });
});

describe('linha expandida: só o que tem valor, e só da versão (plano 2026-11-21, Fase 2)', () => {
    it('com resultados da versão: custo e prazo; campos digitados antigos (área etc.) nunca aparecem', async () => {
        const user = userEvent.setup();
        const comResultados = { ...(garden as object), indicadores_da_versao: { vgv: 1, lucroLiquido: 10, exposicaoMaxima: 100 }, resultados_da_versao: { duracao: 36, custoObra: 900, terreno: 100 } } as never;
        render(<PortalOpportunities opportunities={[comResultados]} portalToken="tok" />);
        await user.click(screen.getByText('Garden Cambuhy'));
        expect(screen.getByText('Custo (obra e terreno)')).toBeTruthy();
        expect(screen.getByText('36 meses')).toBeTruthy();
        for (const fora of ['Área do terreno', 'Área construída', 'Pavimentos', 'Início previsto', 'Rentabilidade projetada']) {
            expect(screen.queryByText(fora)).toBeNull();
        }
    });

    it('sem versão: nenhum campo na linha aberta', async () => {
        const user = userEvent.setup();
        render(<PortalOpportunities opportunities={[{ ...(garden as object), projected_yield: '1,8% a.m.' } as never]} portalToken="tok" />);
        await user.click(screen.getByText('Garden Cambuhy'));
        expect(screen.queryByText('1,8% a.m.')).toBeNull();
        expect(screen.queryByText('Prazo')).toBeNull();
    });
});

