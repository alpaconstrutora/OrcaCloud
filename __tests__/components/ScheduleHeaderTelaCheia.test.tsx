// @vitest-environment jsdom
/**
 * Engenharia › Planejamento › botão "Tela cheia" da toolbar de botões
 * (`ScheduleHeader.tsx`, 19/09/2026 — *"implementar botão de tela cheia, da
 * mesma forma que implementado em incorporação < planta inteligente"*).
 *
 * O que interessa provar: o botão existe em qualquer aba (é o único caminho
 * para SAIR do modo), tem `aria-pressed` acompanhando o estado, troca de
 * rótulo/ícone quando o modo vale e dispara o alternar do pai.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ScheduleHeader from '../../components/schedule/ScheduleHeader';
import type { ProjectSchedule, ProjectSettings } from '../../types';

type Props = React.ComponentProps<typeof ScheduleHeader>;

function props(extra: Partial<Props> = {}): Props {
  const nada = () => undefined;
  return {
    settings: { id: 'p1', name: 'Orçamento X' } as unknown as ProjectSettings,
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

describe('ScheduleHeader — Tela cheia', () => {
  it('fora do modo: botão "Tela cheia", aria-pressed=false, e o clique alterna', async () => {
    const onAlternarTelaCheia = vi.fn();
    render(<ScheduleHeader {...props({ onAlternarTelaCheia })} />);

    const botao = screen.getByRole('button', { name: /^tela cheia$/i });
    expect(botao).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: /^sair da tela cheia$/i })).toBeNull();

    await userEvent.setup().click(botao);
    expect(onAlternarTelaCheia).toHaveBeenCalledTimes(1);
  });

  it('no modo: botão "Sair da tela cheia", aceso (aria-pressed=true)', () => {
    render(<ScheduleHeader {...props({ telaCheia: true })} />);

    const sair = screen.getByRole('button', { name: /^sair da tela cheia$/i });
    expect(sair).toHaveAttribute('aria-pressed', 'true');
    expect(sair.className).toMatch(/bg-blue-50/);
    expect(screen.queryByRole('button', { name: /^tela cheia$/i })).toBeNull();
  });

  // Sem faixa de título (10/10/2026) — o mesmo da Planta Inteligente: *"a fim de
  // ganhar mais espaço vertical, decidmos nao exibir o título e o botao voltar foi
  // para o menubar na planta inteligente. implemente o mesmo em engenharia >
  // planejamento"*. Substitui o teste do título §20 solto + subtítulo.
  it('sem título visível: h1 só para leitor de tela, com o nome do planejamento', () => {
    render(<ScheduleHeader {...props({ settings: { id: 'plan1', name: 'Plano 2026' } as unknown as ProjectSettings })} />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Planejamento Físico-Financeiro — Plano 2026');
    expect(h1.className).toMatch(/\bsr-only\b/);
  });

  it('o voltar mora no ribbon: só ícone, nome acessível com o planejamento, e chama onBack', async () => {
    const onBack = vi.fn();
    render(<ScheduleHeader {...props({ onBack, settings: { id: 'plan1', name: 'Plano 2026' } as unknown as ProjectSettings })} />);
    const voltar = screen.getByRole('button', { name: 'Voltar para Gestão de Planejamento — Plano 2026' });
    expect(screen.getByRole('toolbar', { name: 'Ferramentas do planejamento' })).toContainElement(voltar);
    expect(voltar).toHaveTextContent(/^$/);
    await userEvent.setup().click(voltar);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('sem onBack, não há botão de voltar', () => {
    render(<ScheduleHeader {...props()} />);
    expect(screen.queryByRole('button', { name: /^Voltar para Gestão de Planejamento/ })).toBeNull();
  });

  it('o orçamento vinculado aparece na dica de "Sincronizar" (aba Orçamento), sem seletor que sai da tela', async () => {
    const projects = [
      { id: 'orc1', name: 'Orçamento X', settings: { classification: 'ORCAMENTO' } },
      { id: 'o1', name: 'Obra Z', settings: { classification: 'OBRA' } },
    ];
    const settings = { id: 'plan1', name: 'Plano 2026', linkedProjectId: 'orc1' } as unknown as ProjectSettings;
    render(<ScheduleHeader {...props({ projects, settings })} />);
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Orçamento' }));
    expect(screen.getByRole('button', { name: /Sincronizar/ })).toHaveAttribute('title', expect.stringContaining('Orçamento vinculado: Orçamento X'));
    expect(screen.queryByRole('button', { name: /^Orçamento/ })).toBeNull();
  });

  it('sem vínculo, a dica de "Sincronizar" diz "Sem orçamento vinculado"', async () => {
    render(<ScheduleHeader {...props({ settings: { id: 'plan1', name: 'Plano' } as unknown as ProjectSettings })} />);
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Orçamento' }));
    expect(screen.getByRole('button', { name: /Sincronizar/ })).toHaveAttribute('title', expect.stringContaining('Sem orçamento vinculado'));
  });

  it('o botão está à vista em toda vista — inclusive nas que escondem a barra de opções', () => {
    for (const viewMode of ['table', 'network', 's-curve', 'resources', 'eap'] as const) {
      const { unmount } = render(<ScheduleHeader {...props({ viewMode })} />);
      expect(screen.getByRole('button', { name: /^tela cheia$/i })).toBeInTheDocument();
      unmount();
    }
  });
});
