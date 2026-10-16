// @vitest-environment jsdom
/**
 * Torre de Controle — Fluxo P2P: clicar num KPI ou num nó do fluxo abre o
 * drawer padrão (`Sheet`), no lugar da antiga expansão inline do nó.
 *
 * 16/10/2026 — a Torre virou canvas (docs/planos/2026-10-16-torre-p2p-processo-visual.md).
 * O board passou a usar `useOrgWriteTarget` (lê o zustand real) e o nome da
 * etapa aparece também na biblioteca e no painel de métricas, então o clique
 * no nó é feito DENTRO do canvas (`[data-canvas]`). O mock do snapshot segue
 * sem `edges`/`groups` de propósito: o board tolera (`?? []`).
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';

vi.mock('../../services/p2pFlowService', () => ({
  p2pFlowService: {
    listProjects: vi.fn(async () => []),
    getSnapshot: vi.fn(async () => ({
      generatedAt: '2026-09-26T12:00:00Z',
      stages: [
        { id: 'pedido', label: 'Pedido de Compra', owner: 'Suprimentos', view: 'pedidos', count: 2, inboundSeam: 'auto', inboundNote: 'Gerado da cotação' },
        { id: 'fiscal', label: 'Nota Fiscal', owner: 'Fiscal', count: 1, inboundSeam: 'gap', inboundNote: 'NF-e sem vínculo com o pedido' },
      ],
    })),
    getStageRecords: vi.fn(async (stageId: string) => stageId === 'pedido'
      ? [{ id: 'r1', label: 'PC-0042 — Cimento', sublabel: 'Obra Alfa', status: 'Aprovado', date: '20/09/2026' }]
      : []),
  },
}));

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

const montar = (onChangeView: (v: string) => void = () => {}) => render(
  <ConfirmProvider><P2PFlowBoard activeOrganizationId={null} onChangeView={onChangeView} /></ConfirmProvider>,
);

afterEach(cleanup);

const dialogo = () => screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);

describe('P2PFlowBoard — drawers', () => {
  it('KPIs usam o KpiCard e clicar em "Lacunas" lista as etapas com lacuna', async () => {
    montar();
    const kpi = await screen.findByTitle('Ver etapas: lacunas');
    expect(kpi.className).toContain('rounded-xl');
    fireEvent.click(kpi);
    await waitFor(() => expect(dialogo()).toContain('Integrações lacunas'));
    expect(screen.getByText('NF-e sem vínculo com o pedido', { selector: 'button p' })).toBeTruthy();
  });

  it('clicar num nó abre o drawer da etapa com os registros e o botão do módulo', async () => {
    const onChangeView = vi.fn();
    montar(onChangeView);
    const canvas = await waitFor(() => document.querySelector('[data-canvas]') as HTMLElement);
    fireEvent.click(await within(canvas).findByRole('button', { name: /Pedido de Compra/ }));
    await waitFor(() => expect(dialogo()).toContain('Pedido de Compra'));
    expect(await screen.findByText('PC-0042 — Cimento')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Abrir módulo/ }));
    expect(onChangeView).toHaveBeenCalledWith('pedidos');
  });

  it('do drawer do KPI dá para descer para o drawer da etapa', async () => {
    montar();
    fireEvent.click(await screen.findByTitle('Ver etapas: lacunas'));
    const titulo = await screen.findByRole('heading', { name: 'Integrações lacunas' });
    const painel = titulo.closest('div.flex.flex-col') ?? document.body;
    fireEvent.click(within(painel as HTMLElement).getByRole('button', { name: /Nota Fiscal/ }));
    await waitFor(() => expect(dialogo()).toContain('Nota Fiscal'));
    expect(await screen.findByText('Nenhum registro nesta etapa')).toBeTruthy();
  });
});
