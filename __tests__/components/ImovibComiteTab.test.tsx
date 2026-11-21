// @vitest-environment jsdom
/**
 * Aba Comitê do estudo (item 1.5 do plano docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md):
 * gates em ordem, decisão com a versão avaliada, pendência que trava só passa com condicionantes.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    listarDecisoesDoComite: vi.fn(), listarVersoes: vi.fn(), listarDueDiligence: vi.fn(), listarRiscos: vi.fn(),
    listarModelosDeAquisicao: vi.fn(), salvarDecisaoDoComite: vi.fn(),
}));
const admin = vi.hoisted(() => ({ eh: true }));
vi.mock('../../services/imovibService', () => ({ imovibService: svc }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../../hooks/useImovibEdicao', async (original) => ({
    ...(await original<typeof import('../../hooks/useImovibEdicao')>()),
    useImovibEhAdminDaOrg: () => admin.eh,
}));

import ImovibComiteTab from '../../components/ImovibComiteTab';
import { ToastProvider } from '../../components/ui/toast';
import { ConfirmProvider } from '../../components/ui/confirm';
import { ImovibEdicaoProvider } from '../../hooks/useImovibEdicao';
import { baseStudy } from '../fixtures/imovibEstudos';

const estudo = { ...baseStudy(), organization_id: 'org', version: '1.0', created_at: '', updated_at: '' } as never;
const tela = () => render(
    <ToastProvider><ConfirmProvider>
        <ImovibEdicaoProvider value={{ pode: true, motivo: '' }}><ImovibComiteTab study={estudo} /></ImovibEdicaoProvider>
    </ConfirmProvider></ToastProvider>,
);
const versao = { id: 'v1', study_id: 'estudo-teste', label: 'Comitê de novembro', created_at: '2026-11-20T12:00:00Z', results: {} };

beforeEach(() => {
    for (const f of Object.values(svc)) f.mockReset();
    admin.eh = true;
    svc.listarDecisoesDoComite.mockResolvedValue([]);
    svc.listarVersoes.mockResolvedValue([versao]);
    svc.listarDueDiligence.mockResolvedValue([]);
    svc.listarRiscos.mockResolvedValue([]);
    svc.listarModelosDeAquisicao.mockResolvedValue([]);
});

describe('aba Comitê', () => {
    it('gate adiante do próximo não abre, e diz por quê', async () => {
        tela();
        const botoes = await screen.findAllByRole('button', { name: /Decidir/ });
        expect((botoes[0] as HTMLButtonElement).disabled).toBe(false);
        expect((botoes[1] as HTMLButtonElement).disabled).toBe(true);
        expect(botoes[1].title).toMatch(/Gate 1 — Triagem/);
    });

    it('registra a decisão com a versão mais recente já escolhida', async () => {
        const user = userEvent.setup();
        svc.salvarDecisaoDoComite.mockImplementation(async d => ({ id: 'd1', ...d }));
        tela();
        await user.click((await screen.findAllByRole('button', { name: /Decidir/ }))[0]);
        await user.selectOptions(screen.getByLabelText('Decisão'), 'aprovado');
        expect((screen.getByLabelText('Versão avaliada') as HTMLSelectElement).value).toBe('v1');
        await user.click(screen.getByRole('button', { name: 'Registrar decisão' }));
        await waitFor(() => expect(svc.salvarDecisaoDoComite).toHaveBeenCalledWith(expect.objectContaining({ gate: 1, decision: 'aprovado', version_id: 'v1' })));
    });

    it('com risco que trava, "Aprovado" fica desligado com o motivo; com condicionantes passa', async () => {
        const user = userEvent.setup();
        svc.listarRiscos.mockResolvedValue([{ id: 'r', study_id: 'e', category: 'juridico', description: 'Ação', probability: 4, impact: 5, status: 'aberto', sort_order: 0 }]);
        tela();
        expect(await screen.findByText(/1 pendência\(s\) travam a aprovação/)).toBeTruthy();
        await user.click(screen.getAllByRole('button', { name: /Decidir/ })[0]);
        await user.selectOptions(screen.getByLabelText('Decisão'), 'aprovado');
        const registrar = screen.getByRole('button', { name: 'Registrar decisão' }) as HTMLButtonElement;
        expect(registrar.disabled).toBe(true);
        expect(registrar.title).toMatch(/aprove com condicionantes/);
        await user.selectOptions(screen.getByLabelText('Decisão'), 'aprovado_condicionantes');
        await user.type(screen.getByLabelText('Condicionantes'), 'Baixar a ação');
        expect(registrar.disabled).toBe(false);
    });

    it('quem não é owner/admin vê, mas não decide', async () => {
        admin.eh = false;
        const user = userEvent.setup();
        tela();
        await user.click((await screen.findAllByRole('button', { name: /Ver/ }))[0]);
        const registrar = screen.getByRole('button', { name: 'Registrar decisão' }) as HTMLButtonElement;
        expect(registrar.disabled).toBe(true);
        expect(registrar.title).toMatch(/owner ou admin/);
    });
});
