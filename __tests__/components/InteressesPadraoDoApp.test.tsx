// @vitest-environment jsdom
/**
 * Aba Interesses (Incorporação › Oportunidades) no padrão do app (docs/ui_ux_guia_unificado.md). Pedido do usuário
 * (25/11/2026): "aba interesse também". Antes: só um quadro de cartões com caixa alta, pílulas `rounded-full`,
 * seletor de estágio em `text-xs font-bold`, sem busca, sem indicadores, erros só no console.
 */
import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ listInterests: vi.fn(), updateInterestStage: vi.fn(), toast: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../../services/investorPortalService', async (orig) => ({
    ...(await orig<typeof import('../../services/investorPortalService')>()),
    investorPortalService: { listInterests: svc.listInterests, updateInterestStage: svc.updateInterestStage },
}));
vi.mock('../../services/investorService', () => ({ investorService: {} }));
vi.mock('../../services/speService', () => ({ speService: {} }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: svc.toast }) }));
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;

import InterestsPanel from '../../components/investor/InterestsPanel';

const garden = { id: 'op1', organization_id: 'org', title: 'Garden 01', spe_entity_id: 'spe1' } as never;
const tiago = { id: 'i1', organization_id: 'org', opportunity_id: 'op1', contact_name: 'Tiago', contact_email: 'tiago@x.com', role: 'investidor', stage: 'fechado', valor_pretendido: 200000, created_at: '2026-11-20T12:00:00Z' };
const ana = { id: 'i2', organization_id: 'org', opportunity_id: 'op1', contact_name: 'Ana', contact_phone: '11 99999-0000', role: 'arquiteto', stage: 'proposta', message: 'Quero entender o fluxo', created_at: '2026-11-22T12:00:00Z' };

beforeEach(() => {
    localStorage.clear();
    Object.values(svc).forEach(f => f.mockReset());
    svc.listInterests.mockResolvedValue([tiago, ana]);
});

describe('Interesses no padrão do app', () => {
    it('4 indicadores e a tabela: estágio editável em text-sm (sem negrito/caixa alta), nada em caixa alta', async () => {
        render(<InterestsPanel organizationId="org" opportunities={[garden]} />);
        const tabela = await screen.findByRole('table');
        for (const rotulo of ['Interesses', 'Em negociação', 'Fechados', 'Valor pretendido']) {
            expect(screen.getAllByText(rotulo).length).toBeGreaterThan(0);
        }
        expect(within(tabela).getByText('Tiago')).toBeTruthy();
        const estagio = within(tabela).getByLabelText('Estágio de Ana') as HTMLSelectElement;
        expect(estagio.value).toBe('proposta');
        expect(estagio.className).toMatch(/text-sm font-normal/);
        expect(estagio.className).not.toMatch(/font-bold|text-xs|uppercase/);
        expect(document.querySelector('.uppercase')).toBeNull();
        // "Tornar sócio" sempre visível; desligado para quem não está em Fechado, com o motivo no invólucro.
        const linhaDaAna = within(tabela).getByText('Ana').closest('tr')!;
        const botao = within(linhaDaAna).getByRole('button', { name: /Tornar sócio/ }) as HTMLButtonElement;
        expect(botao.disabled).toBe(true);
        expect(botao.closest('[title]')!.getAttribute('title')).toMatch(/Fechado/);
    });

    it('filtro de estágio recorta; o quadro (§36) agrupa por estágio com contagem', async () => {
        const user = userEvent.setup();
        render(<InterestsPanel organizationId="org" opportunities={[garden]} />);
        await screen.findByRole('table');
        await user.click(screen.getByRole('button', { name: /^Estágio/ }));
        await user.click(screen.getByRole('menuitemradio', { name: /Proposta/ }));
        expect(screen.queryByText('Tiago')).toBeNull();
        await user.click(screen.getByRole('button', { name: /^Estágio/ }));
        await user.click(screen.getByRole('menuitemradio', { name: /Todos/ }));
        await user.click(screen.getByTitle('Quadro por estágio'));
        const fechado = screen.getByRole('region', { name: /Fechado/ });
        expect(within(fechado).getByRole('article', { name: 'Tiago' })).toBeTruthy();
        expect(within(fechado).getByText('1')).toBeTruthy();
    });

    it('trocar o estágio que falha avisa na tela (antes ficava só no console)', async () => {
        const user = userEvent.setup();
        svc.updateInterestStage.mockRejectedValue(new Error('sem permissão'));
        render(<InterestsPanel organizationId="org" opportunities={[garden]} />);
        await user.selectOptions(await screen.findByLabelText('Estágio de Ana'), 'negociacao');
        await waitFor(() => expect(svc.toast).toHaveBeenCalledWith(expect.stringMatching(/sem permissão/), 'error'));
    });

    it('carregar que falha mostra o erro com "Tentar novamente"', async () => {
        svc.listInterests.mockRejectedValue(new Error('timeout'));
        render(<InterestsPanel organizationId="org" opportunities={[garden]} />);
        expect((await screen.findByRole('alert')).textContent).toMatch(/timeout/);
        expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeTruthy();
    });
});
