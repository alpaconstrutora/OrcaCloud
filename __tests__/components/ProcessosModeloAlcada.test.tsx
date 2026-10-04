// @vitest-environment jsdom
/**
 * Processos — a tela de editar modelo e o botão de aprovação por nível.
 * docs/planos/2026-10-04-processos-modelo-dono-alcada.md
 *
 * O service é simulado (o motor tem o próprio teste em
 * __tests__/processServiceModeloAlcada.test.ts); aqui se prova o que só a tela
 * faz: mostrar "Sem dono", abrir o modelo gravado no formulário, recusar
 * salvar modelo automático sem dono COM o motivo, mandar as etapas com id, e
 * mostrar o nível 2 desabilitado — com o motivo — para quem aprovou o nível 1.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';

const TEMPLATE = {
    id: 'tpl', organization_id: 'org', name: 'Aprovação de pagamento de fornecedor', category: 'Financeiro',
    status: 'ATIVO', version: 1, criticality: 'MEDIA', trigger_type: 'EVENTO', trigger_event_key: 'purchase_order.received',
    owner_user_id: null, created_at: '', updated_at: '',
};
const ETAPAS = [
    { id: 's1', process_template_id: 'tpl', name: 'Conferência Fiscal', step_type: 'document', order_index: 0, is_required: true,
      requires_document: true, can_skip: false, sla_hours: 24, condition: null, created_at: '', updated_at: '' },
    { id: 's2', process_template_id: 'tpl', name: 'Aprovação Financeira', step_type: 'approval', order_index: 1, is_required: true,
      requires_document: false, can_skip: false, sla_hours: 48, condition: null, created_at: '', updated_at: '' },
];
const MEMBROS = [{ userId: 'u-ana', name: 'Ana', email: 'ana@x' }, { userId: 'u-eu', name: 'Eu', email: 'eu@x' }];

const svc = vi.hoisted(() => ({
    listTemplates: vi.fn(), getTemplateSteps: vi.fn(), updateTemplate: vi.fn(), createTemplate: vi.fn(),
    listAssignableMembers: vi.fn(), listGroups: vi.fn(), listMyPendingSteps: vi.fn(), listMyPendingApprovals: vi.fn(),
    getInstance: vi.fn(), listComments: vi.fn(), approveStep: vi.fn(), submitStepApproval: vi.fn(),
}));

vi.mock('../../services/processService', async () => {
    const real = await vi.importActual<typeof import('../../services/processService')>('../../services/processService');
    return { processService: svc, problemaDoModelo: real.problemaDoModelo };
});
vi.mock('../../services/taskService', () => ({ taskService: {} }));
vi.mock('../../services/supplierService', () => ({ supplierService: { listSuppliers: vi.fn(async () => []) } }));
vi.mock('../../hooks/useOrgContext', () => ({
    useOrgWriteTarget: () => ({ resolveWriteOrg: vi.fn(async () => ({ kind: 'org', orgId: 'org' })), orgTargetModal: null }),
}));
vi.mock('../../store/useStore', () => ({ useStore: (sel: (s: { projects: unknown[] }) => unknown) => sel({ projects: [] }) }));

import ProcessosModule from '../../components/ProcessosModule';
import { ConfirmProvider } from '../../components/ui/confirm';

const montar = () => render(
    <ConfirmProvider><ProcessosModule organizationId="org" userId="u-eu" userEmail="eu@x" /></ConfirmProvider>,
);

beforeEach(() => {
    for (const f of Object.values(svc)) f.mockReset();
    svc.listTemplates.mockResolvedValue([TEMPLATE]);
    svc.getTemplateSteps.mockResolvedValue(ETAPAS);
    svc.updateTemplate.mockResolvedValue(undefined);
    svc.listAssignableMembers.mockResolvedValue(MEMBROS);
    svc.listGroups.mockResolvedValue([]);
    svc.listMyPendingSteps.mockResolvedValue([]);
    svc.listMyPendingApprovals.mockResolvedValue([]);
    svc.listComments.mockResolvedValue([]);
});
afterEach(cleanup);

describe('Processos — editar modelo', () => {
    it('modelo automático sem dono aparece com o aviso; editar abre o modelo gravado', async () => {
        montar();
        fireEvent.click(screen.getByRole('button', { name: /Templates/ }));
        expect(await screen.findByText(/Sem dono: atrasos vão para os administradores/)).toBeTruthy();
        expect(screen.getByText(/Automático: Pedido de compra recebido/)).toBeTruthy();

        fireEvent.click(screen.getByTitle('Editar modelo'));
        expect(await screen.findByText('Editar modelo · v1')).toBeTruthy();
        // O formulário é preenchido no efeito de abertura — um tique depois do título.
        expect(await screen.findByDisplayValue('Conferência Fiscal')).toBeTruthy();
        expect((screen.getByDisplayValue('48') as HTMLInputElement)).toBeTruthy();
        expect(screen.getByText(/Salvar cria a versão 2/)).toBeTruthy();
    });

    it('salvar automático sem dono mostra o motivo e não grava; com dono grava as etapas com id', async () => {
        montar();
        fireEvent.click(screen.getByRole('button', { name: /Templates/ }));
        fireEvent.click(await screen.findByTitle('Editar modelo'));
        await screen.findByDisplayValue('Conferência Fiscal');

        fireEvent.click(screen.getByRole('button', { name: 'Salvar nova versão' }));
        expect(await screen.findByText(/escolha o dono/)).toBeTruthy();
        expect(svc.updateTemplate).not.toHaveBeenCalled();

        // O seletor de dono é o que tem o placeholder "Escolha o dono…".
        const dono = screen.getAllByRole('combobox').find(s => (s as HTMLSelectElement).options[0]?.text === 'Escolha o dono…') as HTMLSelectElement;
        await waitFor(() => expect(dono.options.length).toBeGreaterThan(1));
        fireEvent.change(dono, { target: { value: 'u-ana' } });
        fireEvent.click(screen.getByRole('button', { name: 'Salvar nova versão' }));

        await waitFor(() => expect(svc.updateTemplate).toHaveBeenCalledTimes(1));
        const [id, header, etapas] = svc.updateTemplate.mock.calls[0];
        expect(id).toBe('tpl');
        expect(header).toMatchObject({ owner_user_id: 'u-ana', trigger_type: 'EVENTO', trigger_event_key: 'purchase_order.received' });
        expect(etapas.map((e: { id?: string; sla_hours?: number }) => [e.id, e.sla_hours])).toEqual([['s1', 24], ['s2', 48]]);
    });
});

describe('Processos — aprovação por nível', () => {
    const instancia = (chain: unknown[]) => ({
        id: 'i1', organization_id: 'org', title: 'Pedido PC-1', template_name: 'Pagamento', status: 'AGUARDANDO_APROVACAO',
        current_step_id: 'st', steps: [{
            id: 'st', process_instance_id: 'i1', template_step_id: 's2', name: 'Aprovação Financeira', step_type: 'approval',
            order_index: 0, status: 'EM_ANDAMENTO', approval_status: 'PENDENTE', approval_required_levels: 2,
            approval_chain: chain, amount: 10000, responsible_user_id: 'u-eu',
        }],
    });
    const abrir = async () => {
        svc.listMyPendingSteps.mockResolvedValue([{ id: 'st', process_instance_id: 'i1', name: 'Aprovação Financeira',
            instance_title: 'Pedido PC-1', instance_status: 'AGUARDANDO_APROVACAO', instance_priority: 'MEDIA', step_type: 'approval', status: 'EM_ANDAMENTO' }]);
        montar();
        fireEvent.click(await screen.findByText('Pedido PC-1'));
    };

    it('quem aprovou o nível 1 vê o nível 2 desabilitado, com o motivo', async () => {
        svc.getInstance.mockResolvedValue(instancia([{ level: 1, role: 'Gestor', action: 'APROVADO', approved_by: 'eu@x', approved_at: '' }]));
        await abrir();
        const botao = await screen.findByRole('button', { name: 'Aprovar nível 2 de 2' });
        expect((botao as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText('Você aprovou o nível 1. O nível 2 precisa de outra pessoa.')).toBeTruthy();
        expect(screen.getByText(/Valor R\$\s*10\.000,00 · alçada de 2 níveis/)).toBeTruthy();
    });

    it('outra pessoa aprova o nível 2: o botão chama approveStep sem nível fixo', async () => {
        svc.getInstance.mockResolvedValue(instancia([{ level: 1, role: 'Gestor', action: 'APROVADO', approved_by: 'ana@x', approved_at: '' }]));
        svc.approveStep.mockResolvedValue(undefined);
        await abrir();
        const botao = await screen.findByRole('button', { name: 'Aprovar nível 2 de 2' });
        expect((botao as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(botao);
        await waitFor(() => expect(svc.approveStep).toHaveBeenCalledWith('st', 'i1', 'eu@x'));
    });
});
