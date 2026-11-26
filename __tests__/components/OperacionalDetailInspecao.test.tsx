// @vitest-environment jsdom
/**
 * Qualidade SiAC, fase 2 — Task 5: "Aprovar inspeção" na tela da OE (`OperacionalDetail`)
 * (docs/planos/2026-11-26-qualidade-siac-fase2-implementacao.md, Task 5).
 * Serviços simulados: aqui se prova o que a TELA chama e mostra.
 *
 *  (a) em `pending_inspection` os botões são "Aprovar inspeção"/"Reprovar inspeção" (nunca "Aprovar"/
 *      "Reprovar"), para toda OE; aprovar chama `aprovarInspecao(id, true, '')` — não `transition`;
 *  (b) reprovar pede o motivo: sem ele não chama; com ele chama `aprovarInspecao(id, false, motivo)`;
 *  (c) OE controlada sem `canReleaseQualitySystem` no SGQ → os dois desligados com o motivo;
 *      OE comum → ligados (a régua de permissão é só da controlada);
 *  (d) erro da RPC aparece com a mensagem dela (aviso, não `alert`);
 *  (e) aba "Inspeção": a última validação — quem, quando, revisão, executores treinado sim/não;
 *  (f) `abaInicial="inspecao"` abre direto nela (o Kanban usa).
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MOTIVO_SEM_LIBERACAO } from '../../utils/permissaoQualidadeSiac';

vi.mock('../../lib/supabase', () => {
    const q: Record<string, unknown> = {};
    Object.assign(q, {
        select: () => q, eq: () => q,
        then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok),
    });
    return { supabase: { from: () => q, rpc: vi.fn(async () => ({ data: null, error: null })) } };
});

const getById = vi.fn();
const validateTransition = vi.fn();
const transition = vi.fn();
const aprovarInspecao = vi.fn();
vi.mock('../../services/workOrderService', async () => {
    const tipos = await vi.importActual<typeof import('../../types/operational-control')>('../../types/operational-control');
    return {
        ALLOWED_TRANSITIONS: tipos.ALLOWED_TRANSITIONS,
        workOrderService: {
            getById: (...a: unknown[]) => getById(...a),
            validateTransition: (...a: unknown[]) => validateTransition(...a),
            transition: (...a: unknown[]) => transition(...a),
            aprovarInspecao: (...a: unknown[]) => aprovarInspecao(...a),
            unblock: vi.fn(),
        },
    };
});
const sgqDaOrganizacao = vi.fn();
vi.mock('../../services/qualidadeSiacService', () => ({
    qualidadeSiacService: { sgqDaOrganizacao: (...a: unknown[]) => sgqDaOrganizacao(...a) },
}));
// as abas filhas têm teste próprio
vi.mock('../../components/OperacionalWorkLog', () => ({ default: () => null }));
vi.mock('../../components/OperacionalChecklist', () => ({ default: () => <div>ficha</div> }));
vi.mock('../../components/OperacionalEvidence', () => ({ default: () => null }));
vi.mock('../../components/OperacionalNC', () => ({ default: () => null }));

import { useStore } from '../../store/useStore';
import { ConfirmProvider } from '../../components/ui/confirm';
import OperacionalDetail from '../../components/OperacionalDetail';

const oe = (p: Record<string, unknown> = {}) => ({
    id: 'wo-1', org_id: 'org-spe', code: 'OE-7', title: 'Alvenaria do 2º pavimento', description: null,
    status: 'pending_inspection', priority: 'normal', type: 'own', controlled_item_id: null,
    planned_cost: 1000, actual_total_cost: 500, completion_pct: 100, planned_end_date: null,
    non_conformances: [], work_logs: [], checklist_responses: [], evidence_files: [], validations: [], status_history: [],
    predecessor: null, ...p,
});

const membro = (orgId: string, nome: string, permissions: Record<string, unknown>, role = 'member') => ({
    id: orgId, name: nome, address: {},
    members: [{ id: `m-${orgId}`, email: 'ana@spe.com', role, userId: 'u-1', name: 'Ana Inspetora', permissions }],
});

const motivo = (el: HTMLElement) => el.closest('[title]')?.getAttribute('title') ?? '';
const montar = (props: Partial<React.ComponentProps<typeof OperacionalDetail>> = {}) =>
    render(
        <ConfirmProvider>
            <OperacionalDetail workOrderId="wo-1" orgId="org-spe" onBack={vi.fn()} onEdit={vi.fn()} {...props} />
        </ConfirmProvider>,
    );

beforeEach(() => {
    vi.clearAllMocks();
    getById.mockResolvedValue(oe());
    validateTransition.mockResolvedValue({ valid: true, errors: [] });
    aprovarInspecao.mockResolvedValue('val-1');
    sgqDaOrganizacao.mockResolvedValue('org-alpa');
    useStore.setState({
        session: { user: { id: 'u-1', email: 'ana@spe.com' } } as never,
        currentProfile: { ...useStore.getState().currentProfile, group: 'USUARIO' } as never,
        organizations: [membro('org-spe', 'SPE Garden', {})] as never,
    });
});

describe('OperacionalDetail — Aprovar inspeção (fase 2)', () => {
    it('(a) em inspeção os botões são "Aprovar inspeção"/"Reprovar inspeção"; aprovar chama a RPC', async () => {
        const user = userEvent.setup();
        montar();
        const aprovar = await screen.findByRole('button', { name: 'Aprovar inspeção' });
        expect(screen.getByRole('button', { name: 'Reprovar inspeção' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Reprovar' })).toBeNull();

        await user.click(aprovar);
        await user.click(await screen.findByRole('button', { name: 'Confirmar' }));
        await waitFor(() => expect(aprovarInspecao).toHaveBeenCalledWith('wo-1', true, ''));
        expect(transition).not.toHaveBeenCalled();
        expect(validateTransition).not.toHaveBeenCalled();
    });

    it('(b) reprovar sem motivo não chama; com motivo chama aprovarInspecao(id, false, motivo)', async () => {
        const user = userEvent.setup();
        montar();
        await user.click(await screen.findByRole('button', { name: 'Reprovar inspeção' }));
        const confirmar = await screen.findByRole('button', { name: 'Confirmar' });
        expect((confirmar as HTMLButtonElement).disabled).toBe(true);
        expect(motivo(confirmar)).toMatch(/motivo/i);
        await user.click(confirmar);
        expect(aprovarInspecao).not.toHaveBeenCalled();

        await user.type(screen.getByLabelText(/Motivo/), 'Prumo fora da tolerância');
        await user.click(screen.getByRole('button', { name: 'Confirmar' }));
        await waitFor(() => expect(aprovarInspecao).toHaveBeenCalledWith('wo-1', false, 'Prumo fora da tolerância'));
        expect(transition).not.toHaveBeenCalled();
    });

    it('(c) OE controlada sem canReleaseQualitySystem no SGQ → desligados com o motivo', async () => {
        getById.mockResolvedValue(oe({ controlled_item_id: 'srv-alv' }));
        useStore.setState({
            organizations: [membro('org-spe', 'SPE Garden', {}), membro('org-alpa', 'Alpa', { canReleaseQualitySystem: false })] as never,
        });
        montar();
        const aprovar = await screen.findByRole('button', { name: 'Aprovar inspeção' });
        await waitFor(() => expect(sgqDaOrganizacao).toHaveBeenCalledWith('org-spe'));
        await waitFor(() => expect((aprovar as HTMLButtonElement).disabled).toBe(true));
        expect(motivo(aprovar)).toBe(MOTIVO_SEM_LIBERACAO);
        const reprovar = screen.getByRole('button', { name: 'Reprovar inspeção' }) as HTMLButtonElement;
        expect(reprovar.disabled).toBe(true);
        expect(motivo(reprovar)).toBe(MOTIVO_SEM_LIBERACAO);
    });

    it('(c) OE controlada com canReleaseQualitySystem no SGQ → ligados', async () => {
        getById.mockResolvedValue(oe({ controlled_item_id: 'srv-alv' }));
        useStore.setState({
            organizations: [membro('org-spe', 'SPE Garden', {}), membro('org-alpa', 'Alpa', { canReleaseQualitySystem: true })] as never,
        });
        montar();
        const aprovar = await screen.findByRole('button', { name: 'Aprovar inspeção' });
        await waitFor(() => expect((aprovar as HTMLButtonElement).disabled).toBe(false));
    });

    it('(c) OE comum: ligados mesmo sem a permissão (a régua é só da controlada)', async () => {
        montar();
        const aprovar = await screen.findByRole('button', { name: 'Aprovar inspeção' });
        expect((aprovar as HTMLButtonElement).disabled).toBe(false);
        expect(sgqDaOrganizacao).not.toHaveBeenCalled();
    });

    it('(d) erro da RPC aparece com a mensagem dela', async () => {
        aprovarInspecao.mockRejectedValue(Object.assign(new Error('1 não conformidade(s) em aberto'), { code: 'P0001' }));
        const alerta = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
        const user = userEvent.setup();
        montar();
        await user.click(await screen.findByRole('button', { name: 'Aprovar inspeção' }));
        await user.click(await screen.findByRole('button', { name: 'Confirmar' }));
        expect(await screen.findByText(/1 não conformidade\(s\) em aberto/)).toBeTruthy();
        expect(alerta).not.toHaveBeenCalled();
        alerta.mockRestore();
    });

    it('(e) aba Inspeção: última validação com quem, quando, revisão e executores', async () => {
        getById.mockResolvedValue(oe({
            status: 'approved', controlled_item_id: 'srv-alv',
            validations: [
                { id: 'v0', type: 'inspection', status: 'rejected', notes: 'Prumo', created_at: '2026-11-20T10:00:00Z',
                    liberado_por: 'u-1', liberado_em: '2026-11-20T10:00:00Z', executores: [], procedimento_revisao: '2' },
                { id: 'v1', type: 'inspection', status: 'approved', notes: null, created_at: '2026-11-24T15:30:00Z',
                    liberado_por: 'u-1', liberado_em: '2026-11-24T15:30:00Z', procedimento_revisao: '3',
                    executores: [
                        { employee_id: 'e1', nome: 'João Pedreiro', treinado: true },
                        { employee_id: 'e2', nome: 'Carlos Servente', treinado: false },
                    ] },
            ],
        }));
        const user = userEvent.setup();
        montar();
        await user.click(await screen.findByRole('tab', { name: /Inspeção/ }));
        const bloco = await screen.findByRole('region', { name: 'Inspeção' });
        expect(within(bloco).getByText('Aprovada')).toBeTruthy();
        expect(within(bloco).getByText('Ana Inspetora')).toBeTruthy();
        expect(within(bloco).getByText(/24\/11\/26/)).toBeTruthy();
        expect(within(bloco).getByText('Revisão 3')).toBeTruthy();
        const joao = within(bloco).getByText('João Pedreiro').closest('li') as HTMLElement;
        expect(joao.textContent).toMatch(/Treinado na revisão: sim/);
        const carlos = within(bloco).getByText('Carlos Servente').closest('li') as HTMLElement;
        expect(carlos.textContent).toMatch(/Treinado na revisão: não/);
    });

    it('(f) abaInicial="inspecao" abre direto na aba Inspeção', async () => {
        montar({ abaInicial: 'inspecao' });
        expect(await screen.findByRole('region', { name: 'Inspeção' })).toBeTruthy();
        expect(within(screen.getByRole('region', { name: 'Inspeção' })).getByText(/Nenhuma inspeção registrada/)).toBeTruthy();
    });
});
