// @vitest-environment jsdom
/**
 * Plano docs/planos/2026-11-25-oportunidades-e-portal-do-investidor-sem-marketplace.md, F4. Pedido: '"Ver" do
 * gestor = a mesma tela do portal, mais uma faixa só do gestor (interesses e aviso de versão desatualizada). Um
 * detalhe só para app e portal.'
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    versaoToken: vi.fn(), obraToken: vi.fn(), acompToken: vi.fn(),
    versaoSessao: vi.fn(), vista: vi.fn(), interesses: vi.fn(), estudo: vi.fn(),
}));
vi.mock('../../services/investorPortalTokenService', () => ({
    investorPortalTokenService: {
        getVersaoPublicadaByToken: svc.versaoToken, getObraDaOportunidadeByToken: svc.obraToken,
        getAcompanhamentoByToken: svc.acompToken, submitInterestByToken: vi.fn(),
    },
}));
vi.mock('../../services/imovibService', () => ({ imovibService: { versaoPublicada: svc.versaoSessao, getStudyById: svc.estudo } }));
vi.mock('../../services/investorPortalService', async (orig) => ({
    ...(await orig<typeof import('../../services/investorPortalService')>()),
    investorPortalService: { vistaDoGestor: svc.vista, listInterests: svc.interesses },
}));
vi.mock('../../services/opportunityDocumentsService', async (orig) => ({
    ...(await orig<typeof import('../../services/opportunityDocumentsService')>()),
    opportunityDocumentsService: { listar: () => Promise.resolve([]), listByToken: () => Promise.resolve([]) },
}));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;

import PortalOportunidadeDetalhe, { type AbaDoDetalhe } from '../../components/investor/portal/PortalOportunidadeDetalhe';
import { baseStudy } from '../fixtures/imovibEstudos';

const op = { id: 'op1', organization_id: 'spe', title: 'Garden 01', status: 'captacao', is_published: true, imovib_study_id: 'e1', imovib_version_id: 'v1' } as never;
const vp = {
    study: baseStudy() as never, cenarios: [], relatorio: {}, calculo: null,
    versao: { id: 'v1', label: 'Conferência', created_at: '2026-11-16T03:00:00Z' },
    organizacao: { name: 'SPE', logo_url: null },
};
const acomp = { obra_nome: 'Garden Cambuhy', avanco: 10, custo_realizado: 0, entradas: 0, vendido: 0, unidades: 38, unidades_vendidas: 0 };

beforeEach(() => {
    Object.values(svc).forEach(f => f.mockReset());
    svc.versaoToken.mockResolvedValue(vp);
    svc.versaoSessao.mockResolvedValue(vp);
    svc.obraToken.mockResolvedValue(null);
    svc.acompToken.mockResolvedValue(acomp);
    svc.vista.mockResolvedValue({ obra: null, acompanhamento: acomp });
    svc.interesses.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]);
    svc.estudo.mockResolvedValue(null);
});

type PropsDoDetalhe = React.ComponentProps<typeof PortalOportunidadeDetalhe>;
const Detalhe: React.FC<Partial<PropsDoDetalhe>> = (p) => {
    const [aba, setAba] = React.useState<AbaDoDetalhe>('apresentacao');
    return <PortalOportunidadeDetalhe opportunity={op} aba={aba} onAba={setAba} onVoltar={() => {}} {...p} />;
};

describe('um detalhe só: investidor pelo link e gestor no app', () => {
    it('investidor (token): lê pelas RPCs do link e não vê a faixa do gestor', async () => {
        const user = userEvent.setup();
        render(<Detalhe portalToken="tok" />);
        expect(await screen.findByText(/Versão Conferência/)).toBeTruthy();
        await user.click(screen.getByRole('button', { name: 'Acompanhamento' }));
        expect(await screen.findByText('Garden Cambuhy')).toBeTruthy();
        expect(svc.versaoToken).toHaveBeenCalledWith('tok', 'op1');
        expect(svc.acompToken).toHaveBeenCalledWith('tok', 'op1');
        expect(svc.vista).not.toHaveBeenCalled();
        expect(screen.queryByRole('region', { name: 'Só para o gestor' })).toBeNull();
    });

    it('gestor (sem token): as MESMAS abas, lidas pela sessão, com a faixa (Interesses e Editar)', async () => {
        const user = userEvent.setup();
        const onEditar = vi.fn();
        render(<Detalhe gestor={{ onEditar, onVerInteresses: vi.fn() }} />);
        expect(await screen.findByText(/Versão Conferência/)).toBeTruthy();
        for (const aba of ['Apresentação', 'Acompanhamento', 'Viabilidade', 'Documentos']) expect(screen.getByRole('button', { name: aba })).toBeTruthy();
        const faixa = screen.getByRole('region', { name: 'Só para o gestor' });
        expect(await within(faixa).findByRole('button', { name: /Interesses \(2\)/ })).toBeTruthy();
        await user.click(within(faixa).getByRole('button', { name: /Editar/ }));
        expect(onEditar).toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Acompanhamento' }));
        expect(await screen.findByText('Garden Cambuhy')).toBeTruthy();
        expect(svc.versaoSessao).toHaveBeenCalledWith('v1');
        expect(svc.vista).toHaveBeenCalledTimes(1); // obra e acompanhamento numa leitura só
        expect(svc.versaoToken).not.toHaveBeenCalled();
        expect(screen.queryByText(/Manifestar interesse/i)).toBeNull();
    });

    it('gestor com rascunho sem versão: a Viabilidade diz o que falta', async () => {
        render(
            <PortalOportunidadeDetalhe
                opportunity={{ ...(op as object), imovib_version_id: null, is_published: false } as never}
                aba="viabilidade" onAba={() => {}} onVoltar={() => {}}
                gestor={{ onEditar: vi.fn(), onVerInteresses: vi.fn() }}
            />,
        );
        const alerta = await screen.findByRole('alert');
        expect(alerta.textContent).toMatch(/escolha-a em Editar/);
        expect(screen.getByText(/Rascunho \(o investidor ainda não vê\)/)).toBeTruthy();
    });
});
