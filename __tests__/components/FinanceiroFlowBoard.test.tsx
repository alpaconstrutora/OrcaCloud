// @vitest-environment jsdom
/**
 * Torre de Controle — Fluxo Financeiro na tela (D.3/D.5 de
 * docs/planos/2026-10-16-torre-fluxo-financeiro.md). A página é a mesma da
 * Torre P2P (`ProcessFlowBoard`); este arquivo trava o que muda por fluxo:
 *   1. 11 cartões, 10 linhas, 4 grupos e o título do Financeiro;
 *   2. a biblioteca lista só os eventos do Financeiro — nenhum do P2P;
 *   3. "Novo gatilho" → escolher Alçada → Pagamento abre o editor com
 *      `payable.approved`, perguntando a organização em modo 'single' (REGRA #5);
 *   4. a transição da baixa mostra no painel a lacuna conhecida (não confere a alçada);
 *   5. o painel de métricas carrega os processos pelo serviço DO FLUXO.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';

const real = await vi.importActual<typeof import('../../services/financeiroFlowService')>('../../services/financeiroFlowService');

const STAGES = ['boletos', 'origens_pagar', 'a_pagar', 'aprovacao', 'pagamento', 'origens_receber', 'a_receber', 'cobranca', 'extrato', 'baixado', 'fechamento']
  .map((id, i) => ({ id, label: `Etapa ${id}`, owner: 'x', count: i, inboundSeam: 'auto', eventKeys: real.STAGE_EVENT_KEYS_FIN[id] }));
const EDGES = real.DEFINICAO_DAS_ARESTAS_FIN.map(d => {
  const id = `${d.from}->${d.to}`;
  const eventKeys = real.EDGE_EVENT_KEYS_FIN[id];
  return { id, ...d, eventKeys, templates: eventKeys ? [] : undefined };
});

const fin = vi.hoisted(() => ({
  listProjects: vi.fn(async () => []),
  getSnapshot: vi.fn(),
  getStageRecords: vi.fn(async () => []),
  getStageProcesses: vi.fn(async () => []),
}));
const proc = vi.hoisted(() => ({
  listTemplates: vi.fn(async () => []), getTemplateSteps: vi.fn(async () => []), createTemplate: vi.fn(), updateTemplate: vi.fn(),
  listAssignableMembers: vi.fn(async () => []), listGroups: vi.fn(async () => []),
}));
const resolveWriteOrg = vi.hoisted(() => vi.fn(async () => ({ kind: 'org', orgId: 'org' })));

vi.mock('../../services/financeiroFlowService', async () => {
  const atual = await vi.importActual<typeof import('../../services/financeiroFlowService')>('../../services/financeiroFlowService');
  return { ...atual, financeiroFlowService: fin };
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

import { FinanceiroFlowBoard } from '../../components/FinanceiroFlowBoard';
import { ConfirmProvider } from '../../components/ui/confirm';
import { PROCESS_EVENT_LABEL } from '../../types/process';

const montar = () => render(
  <ConfirmProvider><FinanceiroFlowBoard activeOrganizationId={null} onChangeView={() => {}} /></ConfirmProvider>,
);
const canvas = () => waitFor(() => {
  const el = document.querySelector('[data-canvas]') as HTMLElement | null;
  if (!el || el.querySelectorAll('[data-node]').length === 0) throw new Error('canvas ainda não desenhou');
  return el;
});
const selectComOpcao = (texto: string) =>
  Array.from(document.querySelectorAll('select')).find(s => Array.from(s.options).some(o => o.textContent === texto)) as HTMLSelectElement;

beforeEach(() => {
  fin.getSnapshot.mockReset();
  fin.getSnapshot.mockResolvedValue({ generatedAt: '2026-10-16T12:00:00Z', stages: STAGES, edges: EDGES, groups: [...real.FIN_GROUPS] });
  fin.getStageProcesses.mockClear();
  resolveWriteOrg.mockClear();
  try { window.localStorage.clear(); } catch { /* jsdom sem storage */ }
});
afterEach(cleanup);

describe('FinanceiroFlowBoard', () => {
  it('desenha 11 cartões, 10 linhas e 4 grupos com o título do Financeiro', async () => {
    montar();
    const c = await canvas();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Torre de Controle — Fluxo Financeiro');
    expect(c.querySelectorAll('[data-node]')).toHaveLength(11);
    expect(c.querySelectorAll('path[data-edge]')).toHaveLength(10);
    expect(Array.from(c.querySelectorAll('[data-group]')).map(g => g.getAttribute('data-group'))).toEqual(['pagar', 'receber', 'tesouraria', 'controladoria']);
  });

  it('a biblioteca lista os quatro eventos do Financeiro e nenhum do P2P', async () => {
    montar();
    await canvas();
    const biblioteca = screen.getByText('Gatilhos').closest('section') as HTMLElement;
    for (const k of ['boleto.approved', 'payable.approved', 'payable.settled', 'receivable.settled'] as const) {
      expect(within(biblioteca).getByText(PROCESS_EVENT_LABEL[k])).toBeTruthy();
    }
    for (const k of ['purchase_order.approved', 'purchase_order.received', 'nfe.linked', 'internal_transaction.paid'] as const) {
      expect(within(biblioteca).queryByText(PROCESS_EVENT_LABEL[k])).toBeNull();
    }
  });

  it('"Novo gatilho" → Alçada → Pagamento abre o editor com payable.approved, perguntando a org em modo single', async () => {
    montar();
    const c = await canvas();
    fireEvent.click(screen.getAllByRole('button', { name: /Novo gatilho/ })[0]);
    fireEvent.click(within(c.querySelector('[data-edge-label="aprovacao->pagamento"]') as HTMLElement).getByRole('button', { name: 'Escolher esta transição' }));
    await waitFor(() => expect(screen.getByText('Novo template de processo')).toBeTruthy());
    expect(resolveWriteOrg).toHaveBeenCalledWith('single');
    await waitFor(() => expect(selectComOpcao('Automático: nasce de um evento').value).toBe('EVENTO'));
    expect(selectComOpcao(PROCESS_EVENT_LABEL['payable.approved']).value).toBe('payable.approved');
    expect((screen.getByPlaceholderText('Ex.: Admissão de funcionário') as HTMLInputElement).value)
      .toBe(`Processo: ${PROCESS_EVENT_LABEL['payable.approved']}`);
  });

  it('a transição da baixa mostra a lacuna no painel e os processos vêm do serviço do Financeiro', async () => {
    montar();
    const c = await canvas();
    fireEvent.click(within(c.querySelector('[data-edge-label="pagamento->baixado"]') as HTMLElement).getByRole('button', { name: 'Semi-manual' }));
    const detalhe = await waitFor(() => document.querySelector('[data-detalhe="aresta"]') as HTMLElement);
    expect(within(detalhe).getByText(/não confere a alçada/)).toBeTruthy();
    await waitFor(() => expect(fin.getStageProcesses).toHaveBeenCalledWith('pagamento', null, undefined));
  });
});
