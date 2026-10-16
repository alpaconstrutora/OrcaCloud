// @vitest-environment jsdom
/**
 * Torre de Controle — criar e editar gatilhos (modelos de processo por
 * evento) a partir do canvas (D.4 de
 * docs/planos/2026-10-16-torre-p2p-processo-visual.md).
 *
 * O editor é o MESMO `TemplateEditorModal` do módulo Processos (extraído para
 * `components/processos/`), aberto pré-preenchido com o evento da transição
 * escolhida. O service de processos é simulado; `problemaDoModelo` é o real.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';

const real = await vi.importActual<typeof import('../../services/p2pFlowService')>('../../services/p2pFlowService');

const TEMPLATE = {
  id: 'tpl', organization_id: 'org', name: 'Aprovação de pagamento de fornecedor', category: 'Financeiro',
  status: 'ATIVO', version: 1, criticality: 'MEDIA', trigger_type: 'EVENTO', trigger_event_key: 'purchase_order.received',
  owner_user_id: 'u-ana', created_at: '', updated_at: '',
};
const ETAPAS = [
  { id: 's1', process_template_id: 'tpl', name: 'Conferência Fiscal', step_type: 'document', order_index: 0, is_required: true,
    requires_document: true, can_skip: false, sla_hours: 24, condition: { field: 'amount', op: 'gt', value: 30000 }, created_at: '', updated_at: '' },
];
const MEMBROS = [{ userId: 'u-ana', name: 'Ana', email: 'ana@x' }];

const STAGES = ['solicitacao', 'cotacao', 'pedido', 'recebimento', 'estoque', 'fiscal', 'financeiro', 'pagamento'].map((id, i) => ({
  id, label: id, owner: 'x', count: i, inboundSeam: 'auto', eventKeys: real.STAGE_EVENT_KEYS[id],
}));
const edges = (comModelo: boolean) => real.DEFINICAO_DAS_ARESTAS.map(d => {
  const id = `${d.from}->${d.to}`;
  const eventKeys = real.EDGE_EVENT_KEYS[id];
  const templates = comModelo && id === 'recebimento->fiscal'
    ? [{ id: 'tpl', name: TEMPLATE.name, organizationId: 'org', eventKey: 'purchase_order.received' }]
    : (eventKeys ? [] : undefined);
  return { id, ...d, eventKeys, templates, seam: templates?.length ? 'orquestrada' : d.seam };
});

const p2p = vi.hoisted(() => ({
  listProjects: vi.fn(async () => []),
  getSnapshot: vi.fn(),
  getStageRecords: vi.fn(async () => []),
  getStageProcesses: vi.fn(async () => []),
}));
const proc = vi.hoisted(() => ({
  listTemplates: vi.fn(), getTemplateSteps: vi.fn(), createTemplate: vi.fn(), updateTemplate: vi.fn(),
  listAssignableMembers: vi.fn(), listGroups: vi.fn(),
}));
const resolveWriteOrg = vi.hoisted(() => vi.fn(async () => ({ kind: 'org', orgId: 'org' })));

vi.mock('../../services/p2pFlowService', async () => {
  const atual = await vi.importActual<typeof import('../../services/p2pFlowService')>('../../services/p2pFlowService');
  return { ...atual, p2pFlowService: p2p };
});
vi.mock('../../services/processService', async () => {
  const atual = await vi.importActual<typeof import('../../services/processService')>('../../services/processService');
  return { processService: proc, problemaDoModelo: atual.problemaDoModelo };
});
vi.mock('../../hooks/useOrgContext', () => ({
  useOrgWriteTarget: () => ({ resolveWriteOrg, orgTargetModal: null }),
}));
vi.mock('../../store/useStore', () => ({ useStore: (sel: (s: { projects: unknown[] }) => unknown) => sel({ projects: [] }) }));
vi.mock('../../services/supplierService', () => ({ supplierService: { listSuppliers: vi.fn(async () => []) } }));

import { P2PFlowBoard } from '../../components/P2PFlowBoard';
import { ConfirmProvider } from '../../components/ui/confirm';

const montar = () => render(
  <ConfirmProvider><P2PFlowBoard activeOrganizationId={null} onChangeView={() => {}} /></ConfirmProvider>,
);
const canvas = () => waitFor(() => {
  const el = document.querySelector('[data-canvas]') as HTMLElement | null;
  if (!el || el.querySelectorAll('[data-edge-label]').length === 0) throw new Error('canvas ainda não desenhou');
  return el;
});
const selectComOpcao = (texto: string) =>
  Array.from(document.querySelectorAll('select')).find(s => Array.from(s.options).some(o => o.textContent === texto)) as HTMLSelectElement;

beforeEach(() => {
  for (const f of Object.values(proc)) f.mockReset();
  resolveWriteOrg.mockClear();
  p2p.getSnapshot.mockReset();
  p2p.getSnapshot.mockResolvedValue({ generatedAt: '2026-10-16T12:00:00Z', stages: STAGES, edges: edges(false), groups: [...real.P2P_GROUPS] });
  proc.listTemplates.mockResolvedValue([TEMPLATE]);
  proc.getTemplateSteps.mockResolvedValue(ETAPAS);
  proc.listAssignableMembers.mockResolvedValue(MEMBROS);
  proc.listGroups.mockResolvedValue([]);
  proc.createTemplate.mockResolvedValue({ ...TEMPLATE, id: 'novo' });
  try { window.localStorage.clear(); } catch { /* jsdom sem storage */ }
});
afterEach(cleanup);

describe('P2PFlowBoard — editor de gatilhos', () => {
  it('"Novo gatilho" → escolher a transição Pedido → Recebimento abre o editor com o evento certo; salvar cria o modelo e recarrega o quadro', async () => {
    montar();
    const c = await canvas();
    // há dois "Novo gatilho" (cabeçalho e biblioteca) — os dois entram no mesmo modo; aqui o do cabeçalho
    fireEvent.click(screen.getAllByRole('button', { name: /Novo gatilho/ })[0]);
    expect(screen.getByText(/Clique na transição que o novo gatilho vai conduzir/)).toBeTruthy();
    // no modo de escolha, a transição sem evento (cotação → pedido) não oferece escolha
    expect(within(c.querySelector('[data-edge-label="cotacao->pedido"]') as HTMLElement).queryByRole('button', { name: 'Escolher esta transição' })).toBeNull();
    fireEvent.click(within(c.querySelector('[data-edge-label="pedido->recebimento"]') as HTMLElement).getByRole('button', { name: 'Escolher esta transição' }));

    await waitFor(() => expect(screen.getByText('Novo template de processo')).toBeTruthy());
    expect(resolveWriteOrg).toHaveBeenCalledWith('single');
    // o formulário é preenchido num efeito ao abrir — espera o efeito, não só o título
    await waitFor(() => expect(selectComOpcao('Automático: nasce de um evento').value).toBe('EVENTO'));
    expect(selectComOpcao('Pedido de compra aprovado').value).toBe('purchase_order.approved');
    expect((screen.getByPlaceholderText('Ex.: Admissão de funcionário') as HTMLInputElement).value).toBe('Processo: Pedido de compra aprovado');

    await waitFor(() => expect(selectComOpcao('Escolha o dono…').options.length).toBeGreaterThan(1));
    fireEvent.change(selectComOpcao('Escolha o dono…'), { target: { value: 'u-ana' } });
    fireEvent.change(screen.getByPlaceholderText('Nome da etapa'), { target: { value: 'Conferir pedido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar template' }));

    await waitFor(() => expect(proc.createTemplate).toHaveBeenCalledTimes(1));
    const [orgId, header, etapas] = proc.createTemplate.mock.calls[0];
    expect(orgId).toBe('org');
    expect(header).toMatchObject({ trigger_type: 'EVENTO', trigger_event_key: 'purchase_order.approved', owner_user_id: 'u-ana', name: 'Processo: Pedido de compra aprovado' });
    expect(etapas).toHaveLength(1);
    expect(etapas[0].name).toBe('Conferir pedido');
    await waitFor(() => expect(p2p.getSnapshot).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Novo template de processo')).toBeNull());
  });

  it('"Editar" na biblioteca abre o modelo gravado (etapas carregadas) na organização DELE, sem perguntar', async () => {
    p2p.getSnapshot.mockResolvedValue({ generatedAt: '2026-10-16T12:00:00Z', stages: STAGES, edges: edges(true), groups: [...real.P2P_GROUPS] });
    montar();
    const c = await canvas();
    // o chip da transição orquestrada mostra a situação + contagem (cabe no vão); o nome do modelo vai no title
    const chip = within(c.querySelector('[data-edge-label="recebimento->fiscal"]') as HTMLElement).getByRole('button', { name: 'Orquestrada · 1' });
    expect(chip.getAttribute('title')).toBe(TEMPLATE.name);

    // selecionar o gatilho na biblioteca mostra a transição no painel, com o modelo e o seu "Editar"
    fireEvent.click(screen.getByRole('button', { name: /Pedido de compra recebido/ }));
    const detalhe = await waitFor(() => document.querySelector('[data-detalhe="aresta"]') as HTMLElement);
    expect(within(detalhe).getByText(TEMPLATE.name)).toBeTruthy();
    expect(within(detalhe).getByTitle(`Editar "${TEMPLATE.name}"`)).toBeTruthy();

    fireEvent.click(screen.getAllByTitle(`Editar "${TEMPLATE.name}"`)[0]);
    await waitFor(() => expect(screen.getByText(/Editar modelo · v1/)).toBeTruthy());
    expect(resolveWriteOrg).not.toHaveBeenCalled();
    expect(proc.getTemplateSteps).toHaveBeenCalledWith('tpl');
    expect(proc.listTemplates).toHaveBeenCalledWith('org');
    // o formulário é preenchido num efeito ao abrir — espera o efeito, não só o título (que vem da prop)
    await waitFor(() => expect((screen.getByPlaceholderText('Nome da etapa') as HTMLInputElement).value).toBe('Conferência Fiscal'));
  });

  it('a seção Condições lista as etapas condicionadas dos modelos ativos ao abrir', async () => {
    p2p.getSnapshot.mockResolvedValue({ generatedAt: '2026-10-16T12:00:00Z', stages: STAGES, edges: edges(true), groups: [...real.P2P_GROUPS] });
    montar();
    await canvas();
    fireEvent.click(screen.getByRole('button', { name: /Condições/ }));
    await waitFor(() => expect(screen.getByText('Conferência Fiscal')).toBeTruthy());
    expect(screen.getByText(/Valor .* 30/)).toBeTruthy();
  });
});
