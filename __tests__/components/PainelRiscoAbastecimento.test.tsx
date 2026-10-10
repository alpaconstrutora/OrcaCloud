// @vitest-environment jsdom
/**
 * Engenharia › Planejamento — "etapas em risco de abastecimento" (10/10/2026):
 * *"o banner de alerta nao deve ficar ocupando espaco vertical. e o pior e que nao
 * é possivel ocultar"*.
 *
 * O que interessa provar: o aviso virou um ícone com contador DENTRO do ribbon
 * (§5.3 do guia), com o resumo no `title`, e o clique abre o painel lateral com a
 * lista que o banner expandia. Sem risco, nada aparece. Fechado, o painel não fica
 * no DOM.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ScheduleHeader from '../../components/schedule/ScheduleHeader';
import PainelRiscoAbastecimento from '../../components/schedule/PainelRiscoAbastecimento';
import { ConfirmProvider } from '../../components/ui/confirm';
import type { HierarchyNode, ProjectSchedule, ProjectSettings } from '../../types';

type Props = React.ComponentProps<typeof ScheduleHeader>;

function props(extra: Partial<Props> = {}): Props {
  const nada = () => undefined;
  return {
    settings: { id: 'p1', name: 'Plano' } as unknown as ProjectSettings,
    projects: [],
    viewMode: 'gantt',
    setViewMode: nada,
    timeScale: 'week',
    setTimeScale: nada,
    schedule: { startDate: '', endDate: '', distributions: [] } as unknown as ProjectSchedule,
    setIsBaselineModalOpen: nada,
    isSimulationMode: false,
    handleToggleSimulation: nada,
    handleExportPDF: nada,
    isExportingPDF: false,
    handleExportExcel: nada,
    handleExportCSV: nada,
    setIsConfigModalOpen: nada,
    handleLevelResources: nada,
    handleRecalculate: nada,
    onUpdateSettings: nada,
    handleExpandAll: nada,
    handleCollapseAll: nada,
    allExpanded: false,
    handleApplyAutoAllItems: nada,
    handleDisableAutoAllItems: nada,
    onOpenCrewClassification: nada,
    budgetLength: 0,
    autoCount: 0,
    allAuto: false,
    onClearAll: nada,
    syncDiffCount: 0,
    onSyncBudget: nada,
    onOpenVersions: nada,
    planningVersionsCount: 0,
    hasNewerBudgetVersion: false,
    onAutoSchedule: nada,
    telaCheia: false,
    onAlternarTelaCheia: nada,
    onAddRootGroup: nada,
    collapsedCols: new Set<string>(),
    ganttCollapsedCols: new Set<string>(),
    onToggleColumn: nada,
    onToggleGanttColumn: nada,
    onShowAllColumns: nada,
    onShowAllGanttColumns: nada,
    onCollapseAllGanttCols: nada,
    visibleTableLevels: new Set(['group', 'phase', 'subphase', 'item']),
    visibleGanttLevels: new Set(['group', 'phase', 'subphase', 'item']),
    onToggleTableLevel: nada,
    onToggleGanttLevel: nada,
    visibleNatures: new Set<string>(),
    onToggleNature: nada,
    ...extra,
  };
}

const risco = { etapas: 133, insumos: 126, custo: 254752.28 };

describe('Planejamento — aviso de abastecimento no ribbon', () => {
  it('com risco: ícone com contador dentro do ribbon, resumo no title, e o clique abre o painel', async () => {
    const onAbrir = vi.fn();
    render(<ScheduleHeader {...props({ riscoDeAbastecimento: risco, onAbrirRiscoDeAbastecimento: onAbrir })} />);

    const botao = screen.getByRole('button', { name: 'Ver 133 etapas em risco de abastecimento' });
    expect(screen.getByRole('toolbar', { name: 'Ferramentas do planejamento' })).toContainElement(botao);
    expect(botao).toHaveAttribute('title', expect.stringContaining('126 insumos sem pedido de compra'));
    expect(botao.getAttribute('title')).toMatch(/R\$\s?254\.752,28/);
    expect(botao.parentElement).toHaveTextContent('133');

    await userEvent.setup().click(botao);
    expect(onAbrir).toHaveBeenCalledTimes(1);
  });

  it('singular quando é uma etapa só', () => {
    render(<ScheduleHeader {...props({ riscoDeAbastecimento: { etapas: 1, insumos: 1, custo: 900 }, onAbrirRiscoDeAbastecimento: () => undefined })} />);
    expect(screen.getByRole('button', { name: 'Ver 1 etapa em risco de abastecimento' })).toHaveAttribute('title', expect.stringContaining('1 insumo sem pedido'));
  });

  it('sem risco, não há ícone nenhum', () => {
    render(<ScheduleHeader {...props({ riscoDeAbastecimento: null, onAbrirRiscoDeAbastecimento: () => undefined })} />);
    expect(screen.queryByRole('button', { name: /em risco de abastecimento/ })).toBeNull();
  });
});

describe('PainelRiscoAbastecimento', () => {
  const no = (id: string, name: string, wbsCode: string, children: HierarchyNode[] = []) =>
    ({ id, uid: id, type: children.length ? 'phase' : 'item', name, wbsCode, children, total: 0, realizedTotal: 0, realizedPhysicalTotal: 0, realizedFinancialTotal: 0, budgetedTotal: 0, budgetedWithBdiTotal: 0, plannedTotal: 0, level: 0 }) as HierarchyNode;
  const hierarchy = [no('g1', 'Fundação', '01', [no('i1', 'Escavação manual de vala com profundidade até 1,5 m', '01.01')])];
  const taskInsights = { g1: { missingItems: 3, missingCost: 9000 }, i1: { missingItems: 1, missingCost: 1200 } };

  it('fechado, não fica no DOM', () => {
    render(<PainelRiscoAbastecimento open={false} onClose={() => undefined} resumo={risco} taskInsights={taskInsights} hierarchy={hierarchy} />);
    expect(screen.queryByText('Etapas em risco de abastecimento')).toBeNull();
  });

  it('aberto: lista cada etapa com item, nome inteiro, insumos e custo', () => {
    // O Sheet usa useConfirm (guarda de saída); no app o provider está na raiz.
    render(<ConfirmProvider><PainelRiscoAbastecimento open onClose={() => undefined} resumo={risco} taskInsights={taskInsights} hierarchy={hierarchy} /></ConfirmProvider>);
    expect(screen.getByRole('heading', { name: 'Etapas em risco de abastecimento' })).toBeInTheDocument();
    const linha = screen.getByText('Escavação manual de vala com profundidade até 1,5 m').closest('tr')!;
    expect(within(linha).getByText('01.01')).toBeInTheDocument();
    expect(within(linha).getByText(/R\$\s?1\.200,00/)).toBeInTheDocument();
    expect(screen.getByText('Fundação').closest('tr')).toHaveTextContent('3');
  });
});
