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
    onLoadProject: nada,
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

  it('título §20: h1 2xl solto (sem card) + subtítulo; "Voltar" no vestuário de tela-detalhe', () => {
    const onBack = vi.fn();
    render(<ScheduleHeader {...props({ onBack })} />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Planejamento Físico-Financeiro' });
    expect(h1.className).toMatch(/text-2xl/);
    expect(h1.closest('[class*="shadow-sm"]')).toBeNull(); // não está dentro de card
    expect(screen.getByText(/Orçamento X/).className).toMatch(/mt-1\.5/); // subtítulo §20
    const voltar = screen.getByTitle('Voltar para Gestão de Planejamento');
    expect(voltar.className).toMatch(/rounded-\[6px\]/);
  });

  it('subtítulo diz qual planejamento é e de qual orçamento ele lê (sem seletor que sai da tela)', () => {
    const projects = [
      { id: 'orc1', name: 'Orçamento X', settings: { classification: 'ORCAMENTO' } },
      { id: 'o1', name: 'Obra Z', settings: { classification: 'OBRA' } },
    ];
    const settings = { id: 'plan1', name: 'Plano 2026', linkedProjectId: 'orc1' } as unknown as ProjectSettings;
    render(<ScheduleHeader {...props({ projects, settings })} />);
    expect(screen.getByText(/Plano 2026/)).toHaveTextContent('Orçamento vinculado: Orçamento X');
    expect(screen.queryByRole('button', { name: /^Orçamento/ })).toBeNull();
  });

  it('sem vínculo, o subtítulo diz "Sem orçamento vinculado"', () => {
    render(<ScheduleHeader {...props({ settings: { id: 'plan1', name: 'Plano' } as unknown as ProjectSettings })} />);
    expect(screen.getByText(/Plano/)).toHaveTextContent('Sem orçamento vinculado');
  });

  it('o botão está à vista em toda aba — inclusive nas que escondem a escala de tempo', () => {
    for (const viewMode of ['table', 'network', 's-curve', 'resources', 'eap'] as const) {
      const { unmount } = render(<ScheduleHeader {...props({ viewMode })} />);
      expect(screen.getByRole('button', { name: /^tela cheia$/i })).toBeInTheDocument();
      unmount();
    }
  });
});
