// @vitest-environment jsdom
/**
 * Torre de Controle — o fluxo P2P como canvas (C.5 de
 * docs/planos/2026-10-16-torre-p2p-processo-visual.md).
 *
 * O que este arquivo trava: os 8 cartões, as 7 linhas e os 3 grupos do
 * desenho; clicar numa transição mostra a costura no painel de métricas;
 * os botões de zoom mexem no `transform` da camada; a roda sobre o canvas
 * sai cancelada (não rola a página); abaixo de `lg` a lista vertical aparece
 * no lugar do canvas.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';

const real = await vi.importActual<typeof import('../../services/p2pFlowService')>('../../services/p2pFlowService');

const STAGES = [
  { id: 'solicitacao', label: 'Solicitação',     owner: 'Obras',       count: 3, inboundSeam: 'auto',   inboundNote: 'Obra pede' },
  { id: 'cotacao',     label: 'Cotação',         owner: 'Suprimentos', count: 2, inboundSeam: 'auto' },
  { id: 'pedido',      label: 'Pedido de Compra', owner: 'Suprimentos', count: 5, pending: 1, inboundSeam: 'auto', view: 'supplies-orders', eventKeys: real.STAGE_EVENT_KEYS.pedido, processes: { ativos: 0, atrasados: 0, templates: [] } },
  { id: 'recebimento', label: 'Recebimento',     owner: 'Estoque',     count: 1, inboundSeam: 'auto', eventKeys: real.STAGE_EVENT_KEYS.recebimento, processes: { ativos: 1, atrasados: 1, templates: ['Aprovação de pagamento de fornecedor'] } },
  { id: 'estoque',     label: 'Estoque',         owner: 'Almoxarifado', count: 9, inboundSeam: 'auto' },
  { id: 'fiscal',      label: 'Nota Fiscal',     owner: 'Fiscal',      count: 4, inboundSeam: 'manual', inboundNote: '3-way match na aba Recebimento do pedido' },
  { id: 'financeiro',  label: 'Contas a Pagar',  owner: 'Financeiro',  count: 7, pending: 7, inboundSeam: 'auto', eventKeys: real.STAGE_EVENT_KEYS.financeiro, processes: { ativos: 0, atrasados: 0, templates: [] } },
  { id: 'pagamento',   label: 'Pago / Baixado',  owner: 'Tesouraria',  count: 12, inboundSeam: 'manual' },
];
const EDGES = real.DEFINICAO_DAS_ARESTAS.map(d => ({ id: `${d.from}->${d.to}`, ...d, eventKeys: real.EDGE_EVENT_KEYS[`${d.from}->${d.to}`], templates: real.EDGE_EVENT_KEYS[`${d.from}->${d.to}`] ? [] : undefined }));

const svc = vi.hoisted(() => ({
  listProjects: vi.fn(async () => []),
  getSnapshot: vi.fn(),
  getStageRecords: vi.fn(async () => []),
  getStageProcesses: vi.fn(async () => []),
}));

vi.mock('../../services/p2pFlowService', async () => {
  const atual = await vi.importActual<typeof import('../../services/p2pFlowService')>('../../services/p2pFlowService');
  return { ...atual, p2pFlowService: svc };
});
vi.mock('../../hooks/useOrgContext', () => ({
  useOrgWriteTarget: () => ({ resolveWriteOrg: vi.fn(async () => ({ kind: 'org', orgId: 'org' })), orgTargetModal: null }),
}));
vi.mock('../../store/useStore', () => ({ useStore: (sel: (s: { projects: unknown[] }) => unknown) => sel({ projects: [] }) }));
vi.mock('../../services/processService', () => ({
  processService: { listTemplates: vi.fn(async () => []), getTemplateSteps: vi.fn(async () => []), listAssignableMembers: vi.fn(async () => []), listGroups: vi.fn(async () => []) },
  problemaDoModelo: () => null,
}));
vi.mock('../../services/supplierService', () => ({ supplierService: { listSuppliers: vi.fn(async () => []) } }));

import { P2PFlowBoard } from '../../components/P2PFlowBoard';
import { ConfirmProvider } from '../../components/ui/confirm';

const montar = () => render(
  <ConfirmProvider><P2PFlowBoard activeOrganizationId={null} onChangeView={() => {}} /></ConfirmProvider>,
);

const canvas = () => waitFor(() => {
  const el = document.querySelector('[data-canvas]') as HTMLElement | null;
  if (!el || el.querySelectorAll('[data-node]').length === 0) throw new Error('canvas ainda não desenhou');
  return el;
});

beforeEach(() => {
  svc.getSnapshot.mockResolvedValue({ generatedAt: '2026-10-16T12:00:00Z', stages: STAGES, edges: EDGES, groups: [...real.P2P_GROUPS] });
  try { window.localStorage.clear(); } catch { /* jsdom sem storage */ }
});
afterEach(cleanup);

describe('P2PFlowBoard — canvas', () => {
  it('desenha 8 cartões, 7 linhas e 3 grupos, cada cartão com registros, pendentes e a entrada em texto', async () => {
    montar();
    const c = await canvas();
    expect(c.querySelectorAll('[data-node]')).toHaveLength(8);
    expect(c.querySelectorAll('path[data-edge]')).toHaveLength(7);
    expect(c.querySelectorAll('[data-group]')).toHaveLength(3);
    const pedido = c.querySelector('[data-node="pedido"]') as HTMLElement;
    expect(within(pedido).getByText('Registros').nextSibling?.textContent).toBe('5');
    expect(within(pedido).getByText('Pendentes').nextSibling?.textContent).toBe('1');
    expect(within(pedido).getByText('Automática')).toBeTruthy();
    // a nota da transição NÃO vive no cartão (é da aresta e do painel)
    expect(within(c.querySelector('[data-node="fiscal"]') as HTMLElement).queryByText(/3-way match/)).toBeNull();
  });

  it('clicar numa transição mostra a costura e a nota no painel de métricas; transição sem evento diz que não emite', async () => {
    montar();
    const c = await canvas();
    const chip = within(c.querySelector('[data-edge-label="recebimento->fiscal"]') as HTMLElement).getByRole('button', { name: 'Semi-manual' });
    fireEvent.click(chip);
    const detalhe = await waitFor(() => document.querySelector('[data-detalhe="aresta"]') as HTMLElement);
    expect(within(detalhe).getByText(/Recebimento → Nota Fiscal/)).toBeTruthy();
    expect(within(detalhe).getByText(/3-way match/)).toBeTruthy();
    expect(within(detalhe).getByText('Nenhum modelo escuta esta transição.')).toBeTruthy();
    expect(within(detalhe).getByRole('button', { name: /Novo gatilho/ })).toBeTruthy();

    fireEvent.click(within(c.querySelector('[data-edge-label="cotacao->pedido"]') as HTMLElement).getByRole('button', { name: 'Automática' }));
    await waitFor(() => expect(screen.getByText(/não emite evento/)).toBeTruthy());
  });

  it('os botões de zoom mudam o transform da camada e a roda sobre o canvas não rola a página', async () => {
    montar();
    const c = await canvas();
    const camada = c.querySelector('[data-camada]') as HTMLElement;
    expect(camada.style.transform).toContain('scale(1)');
    fireEvent.click(screen.getByTitle('Aproximar'));
    expect(camada.style.transform).toContain('scale(1.2)');
    fireEvent.click(screen.getByTitle('Afastar'));
    expect(camada.style.transform).toContain('scale(1)');

    const roda = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    c.dispatchEvent(roda);
    expect(roda.defaultPrevented).toBe(true);
    await waitFor(() => expect(camada.style.transform).toContain('scale(1.2)'));
  });

  it('abaixo de lg a lista vertical aparece no lugar do canvas', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      montar();
      await waitFor(() => expect(document.querySelectorAll('[data-node]')).toHaveLength(8));
      expect(document.querySelector('[data-canvas]')).toBeNull();
      expect(screen.getByText(/3-way match/)).toBeTruthy(); // a transição de entrada vira linha de texto
    } finally {
      window.matchMedia = original;
    }
  });
});
