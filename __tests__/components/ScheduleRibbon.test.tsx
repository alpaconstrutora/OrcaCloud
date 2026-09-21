// @vitest-environment jsdom
/**
 * Engenharia › Planejamento › ribbon (`ScheduleHeader.tsx`, 21/09/2026 —
 * *"se inspire na implementacao de ícones e organizacao de menu bar utilizado
 * em incoporação < planta inteligente e aplique em Gestão de Planejamento"*).
 *
 * O que interessa provar: o cromo abaixo do título é o `Ribbon` da Planta
 * (seletor de vista à esquerda, abas de comandos, acesso rápido à direita,
 * barra de opções embaixo), as abas somem fora de Tabela/Gantt e a salva cai
 * em Cronograma, a aba persiste, e cada comando chama o handler certo da
 * vista ativa.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ScheduleHeader from '../../components/schedule/ScheduleHeader';
import type { ProjectSchedule, ProjectSettings } from '../../types';

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
    schedule: { startDate: '2026-01-05', endDate: '2026-06-30', distributions: [] } as unknown as ProjectSchedule,
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

const nomesDasAbas = () => screen.getAllByRole('tab').map((t) => t.textContent);

describe('ScheduleHeader — ribbon no estilo da Planta Inteligente', () => {
  beforeEach(() => localStorage.clear());

  it('linha 1: seletor de vista à esquerda e acesso rápido à direita, dentro do role=toolbar', () => {
    render(<ScheduleHeader {...props()} />);
    const toolbar = screen.getByRole('toolbar', { name: 'Ferramentas do planejamento' });
    // o seletor mostra a vista atual e abre em menu
    expect(within(toolbar).getByRole('button', { name: /Gantt/ })).toHaveAttribute('aria-haspopup', 'menu');
    // acesso rápido: Tela cheia + Auto Programar, sempre visíveis
    expect(within(toolbar).getByRole('button', { name: /^tela cheia$/i })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: /Auto Programar/ })).toBeInTheDocument();
  });

  it('em Tabela/Gantt existem as 5 abas e a barra de opções começa pelo nome da vista', () => {
    const { unmount } = render(<ScheduleHeader {...props({ viewMode: 'gantt' })} />);
    expect(nomesDasAbas()).toEqual(['Estrutura', 'Cronograma', 'Orçamento', 'Exportar', 'Vista']);
    const barra = screen.getByRole('region', { name: 'Opções da ferramenta' });
    expect(barra.textContent).toMatch(/^Gantt/);
    expect(within(barra).getByRole('group', { name: 'Escala de tempo' })).toBeInTheDocument();
    expect(within(barra).getByLabelText('Início')).toHaveValue('2026-01-05');
    unmount();

    render(<ScheduleHeader {...props({ viewMode: 'table' })} />);
    expect(screen.getByRole('region', { name: 'Opções da ferramenta' }).textContent).toMatch(/^Tabela/);
  });

  it('fora da grade (Curva S) somem Estrutura e Vista, não há barra de opções e a aba salva cai em Cronograma', () => {
    localStorage.setItem('schedule:abaDoRibbon', JSON.stringify('estrutura'));
    render(<ScheduleHeader {...props({ viewMode: 's-curve' })} />);
    expect(nomesDasAbas()).toEqual(['Cronograma', 'Orçamento', 'Exportar']);
    expect(screen.getByRole('tab', { name: 'Cronograma' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('region', { name: 'Opções da ferramenta' })).toBeNull();
    // e o acesso rápido continua lá
    expect(screen.getByRole('button', { name: /Auto Programar/ })).toBeInTheDocument();
  });

  it('a aba escolhida persiste em schedule:abaDoRibbon', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ScheduleHeader {...props()} />);
    await user.click(screen.getByRole('tab', { name: 'Exportar' }));
    expect(screen.getByRole('button', { name: 'Excel' })).toBeInTheDocument();
    unmount();

    render(<ScheduleHeader {...props()} />);
    expect(screen.getByRole('tab', { name: 'Exportar' })).toHaveAttribute('aria-selected', 'true');
  });

  it('trocar a vista pelo menu chama setViewMode; o menu é agrupado', async () => {
    const user = userEvent.setup();
    const setViewMode = vi.fn();
    render(<ScheduleHeader {...props({ setViewMode })} />);
    await user.click(screen.getByRole('button', { name: /Gantt/ }));
    const menu = screen.getByRole('menu', { name: 'Vista do planejamento' });
    expect(within(menu).getByRole('menuitemradio', { name: 'Gantt' })).toHaveAttribute('aria-checked', 'true');
    expect(menu.textContent).toMatch(/Cronograma.*Análise.*Execução/);
    await user.click(within(menu).getByRole('menuitemradio', { name: 'Curva S' }));
    expect(setViewMode).toHaveBeenCalledWith('s-curve');
    expect(screen.queryByRole('menu', { name: 'Vista do planejamento' })).toBeNull();
  });

  it('Vista › Colunas fala com a grade da vista ativa e mostra a contagem de ocultas', async () => {
    const user = userEvent.setup();
    const onToggleGanttColumn = vi.fn();
    const onToggleColumn = vi.fn();
    localStorage.setItem('schedule:abaDoRibbon', JSON.stringify('vista'));
    render(<ScheduleHeader {...props({ viewMode: 'gantt', ganttCollapsedCols: new Set(['gFloat', 'gLsLf']), onToggleGanttColumn, onToggleColumn })} />);
    const gatilho = screen.getByRole('button', { name: /Colunas/ });
    expect(gatilho.textContent).toContain('2');
    await user.click(gatilho);
    const menu = screen.getByRole('menu', { name: 'Colunas' });
    expect(within(menu).getByRole('menuitemcheckbox', { name: 'Folga' })).toHaveAttribute('aria-checked', 'false');
    await user.click(within(menu).getByRole('menuitemcheckbox', { name: 'Duração' }));
    expect(onToggleGanttColumn).toHaveBeenCalledWith('gDur');
    expect(onToggleColumn).not.toHaveBeenCalled();
    // o menu fica aberto para ligar mais de uma
    expect(screen.getByRole('menu', { name: 'Colunas' })).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: 'Focar Gantt' })).toBeInTheDocument();
  });

  it('Estrutura › Níveis e Natureza chamam o toggle da vista ativa', async () => {
    const user = userEvent.setup();
    const onToggleTableLevel = vi.fn();
    const onToggleGanttLevel = vi.fn();
    const onToggleNature = vi.fn();
    localStorage.setItem('schedule:abaDoRibbon', JSON.stringify('estrutura'));
    render(<ScheduleHeader {...props({ viewMode: 'table', onToggleTableLevel, onToggleGanttLevel, onToggleNature, visibleNatures: new Set(['PRODUCAO']) })} />);
    await user.click(screen.getByRole('button', { name: /Níveis/ }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Itens' }));
    expect(onToggleTableLevel).toHaveBeenCalledWith('item');
    expect(onToggleGanttLevel).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: /Natureza/ }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Produção' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Sem natureza' }));
    expect(onToggleNature).toHaveBeenCalledWith('__none__');
  });

  it('Estrutura: Novo grupo, Expandir/Recolher e Limpar tudo (perigo)', async () => {
    const user = userEvent.setup();
    const onAddRootGroup = vi.fn();
    const onClearAll = vi.fn();
    localStorage.setItem('schedule:abaDoRibbon', JSON.stringify('estrutura'));
    render(<ScheduleHeader {...props({ onAddRootGroup, onClearAll })} />);
    await user.click(screen.getByRole('button', { name: 'Novo grupo' }));
    expect(onAddRootGroup).toHaveBeenCalledTimes(1);
    const limpar = screen.getByRole('button', { name: 'Limpar tudo' });
    expect(limpar.className).toMatch(/text-red-600/);
    await user.click(limpar);
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('Cronograma: What-If acende com aria-pressed; Orçamento mostra as contagens', async () => {
    const user = userEvent.setup();
    localStorage.setItem('schedule:abaDoRibbon', JSON.stringify('cronograma'));
    render(<ScheduleHeader {...props({ isSimulationMode: true, syncDiffCount: 3, planningVersionsCount: 2 })} />);
    expect(screen.getByRole('button', { name: /What-If/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('tab', { name: 'Orçamento' }));
    expect(screen.getByRole('button', { name: /Sincronizar/ }).textContent).toContain('3');
    expect(screen.getByRole('button', { name: /Versões/ }).textContent).toContain('2');
  });

  it('barra de opções: escala e datas chamam os handlers', async () => {
    const user = userEvent.setup();
    const setTimeScale = vi.fn();
    const handleRecalculate = vi.fn();
    render(<ScheduleHeader {...props({ setTimeScale, handleRecalculate })} />);
    await user.click(screen.getByRole('button', { name: 'Mês' }));
    expect(setTimeScale).toHaveBeenCalledWith('month');
    expect(screen.getByRole('button', { name: 'Sem' })).toHaveAttribute('aria-pressed', 'true');
  });
});
