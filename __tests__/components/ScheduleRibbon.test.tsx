// @vitest-environment jsdom
/**
 * Engenharia › Planejamento › ribbon (`ScheduleHeader.tsx`, 21/09/2026 —
 * *"se inspire na implementacao de ícones e organizacao de menu bar utilizado
 * em incoporação < planta inteligente e aplique em Gestão de Planejamento"*).
 *
 * O que interessa provar: o cromo abaixo do título é o `Ribbon` da Planta
 * (seletor de vista à esquerda, abas de comandos, acesso rápido à direita,
 * — a barra de opções foi para o card da grade em 21/11/2026), as abas somem fora de Tabela/Gantt e a salva cai
 * em Cronograma, a aba persiste, e cada comando chama o handler certo da
 * vista ativa.
 *
 * 16/11/2026 — *"implemente menu e botões em engenharia > planejamento como foi
 * implementado em incorporação > planta inteligente"*: o ACESSO RÁPIDO da
 * Planta (linha de ícones em grupos que se arrastam) e a faixa que se
 * RECOLHE. A aba Exportar saiu — PDF/Excel/CSV moram no grupo Arquivo.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ScheduleHeader, { BarraDeOpcoesDaGrade } from '../../components/schedule/ScheduleHeader';
import type { ProjectSchedule, ProjectSettings } from '../../types';

type Props = React.ComponentProps<typeof ScheduleHeader>;

function props(extra: Partial<Props> = {}): Props {
  const nada = () => undefined;
  return {
    settings: { id: 'p1', name: 'Plano' } as unknown as ProjectSettings,
    projects: [],
    viewMode: 'gantt',
    setViewMode: nada,
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

  it('linha 1: seletor de vista à esquerda e Auto Programar à direita, dentro do role=toolbar', () => {
    render(<ScheduleHeader {...props()} />);
    const toolbar = screen.getByRole('toolbar', { name: 'Ferramentas do planejamento' });
    // o seletor mostra a vista atual e abre em menu
    expect(within(toolbar).getByRole('button', { name: 'Gantt' })).toHaveAttribute('aria-haspopup', 'menu');
    expect(within(toolbar).getByRole('button', { name: /Auto Programar/ })).toBeInTheDocument();
    // a tela cheia mora no acesso rápido (grupo Arquivo), também dentro da toolbar
    expect(within(toolbar).getByRole('button', { name: /^tela cheia$/i })).toBeInTheDocument();
  });

  it('em Tabela/Gantt existem as 4 abas, e a barra de opções NÃO fica no card do ribbon', () => {
    // 21/11/2026: a barra (Gantt; Dia; Sem; Mês; Ano; Início; Término) saiu do
    // menu e foi para o topo do card da Tabela/Gantt — `BarraDeOpcoesDaGrade`.
    render(<ScheduleHeader {...props({ viewMode: 'gantt' })} />);
    expect(nomesDasAbas()).toEqual(['Estrutura', 'Cronograma', 'Orçamento', 'Vista']);
    expect(screen.queryByRole('region', { name: 'Opções da ferramenta' })).toBeNull();
  });

  it('BarraDeOpcoesDaGrade começa pelo nome da vista e traz escala e período', () => {
    const base = {
      timeScale: 'week' as const,
      setTimeScale: () => undefined,
      schedule: props().schedule,
      settings: props().settings,
      handleRecalculate: () => undefined,
      onUpdateSettings: () => undefined,
    };
    const { unmount } = render(<BarraDeOpcoesDaGrade viewMode="gantt" {...base} />);
    const barra = screen.getByRole('region', { name: 'Opções da ferramenta' });
    expect(barra.textContent).toMatch(/^Gantt/);
    expect(within(barra).getByRole('group', { name: 'Escala de tempo' })).toBeInTheDocument();
    expect(within(barra).getByLabelText('Início')).toHaveValue('2026-01-05');
    expect(within(barra).getByLabelText('Término')).toHaveValue('2026-06-30');
    unmount();

    render(<BarraDeOpcoesDaGrade viewMode="table" {...base} />);
    expect(screen.getByRole('region', { name: 'Opções da ferramenta' }).textContent).toMatch(/^Tabela/);
  });

  it('fora da grade (Curva S) somem Estrutura e Vista, não há barra de opções e a aba salva cai em Cronograma', () => {
    localStorage.setItem('schedule:abaDoRibbon', JSON.stringify('estrutura'));
    render(<ScheduleHeader {...props({ viewMode: 's-curve' })} />);
    expect(nomesDasAbas()).toEqual(['Cronograma', 'Orçamento']);
    expect(screen.getByRole('tab', { name: 'Cronograma' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('region', { name: 'Opções da ferramenta' })).toBeNull();
    // e o acesso rápido continua lá
    expect(screen.getByRole('button', { name: /Auto Programar/ })).toBeInTheDocument();
  });

  it('a aba escolhida persiste em schedule:abaDoRibbon', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ScheduleHeader {...props()} />);
    await user.click(screen.getByRole('tab', { name: 'Orçamento' }));
    expect(screen.getByRole('button', { name: /Sincronizar/ })).toBeInTheDocument();
    unmount();

    render(<ScheduleHeader {...props()} />);
    expect(screen.getByRole('tab', { name: 'Orçamento' })).toHaveAttribute('aria-selected', 'true');
  });

  it('quem tinha a aba Exportar salva (antes de 16/11/2026) cai em Cronograma', () => {
    localStorage.setItem('schedule:abaDoRibbon', JSON.stringify('exportar'));
    render(<ScheduleHeader {...props()} />);
    expect(screen.getByRole('tab', { name: 'Cronograma' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Exportar' })).toBeNull();
  });

  it('trocar a vista pelo menu chama setViewMode; o menu é agrupado', async () => {
    const user = userEvent.setup();
    const setViewMode = vi.fn();
    render(<ScheduleHeader {...props({ setViewMode })} />);
    await user.click(screen.getByRole('button', { name: 'Gantt' }));
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
    const p = props();
    render(
      <BarraDeOpcoesDaGrade
        viewMode="gantt"
        timeScale="week"
        setTimeScale={setTimeScale}
        schedule={p.schedule}
        settings={p.settings}
        handleRecalculate={() => undefined}
        onUpdateSettings={() => undefined}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Mês' }));
    expect(setTimeScale).toHaveBeenCalledWith('month');
    expect(screen.getByRole('button', { name: 'Sem' })).toHaveAttribute('aria-pressed', 'true');
  });
  describe('acesso rápido (a linha de ícones da Planta)', () => {
    const acesso = () => screen.getByTestId('acesso-rapido');
    const grupos = () =>
      Array.from(acesso().querySelectorAll('[data-grupo-do-acesso-rapido]')).map((g) => g.getAttribute('data-grupo-do-acesso-rapido'));

    it('fica dentro da toolbar, com os grupos na ordem padrão', () => {
      render(<ScheduleHeader {...props({ viewMode: 'gantt' })} />);
      expect(screen.getByRole('toolbar', { name: 'Ferramentas do planejamento' })).toContainElement(acesso());
      expect(grupos()).toEqual(['vistas-cronograma', 'vistas-analise', 'vistas-execucao', 'estrutura', 'arquivo']);
      // cada grupo tem a alça de arrastar
      expect(within(acesso()).getByRole('button', { name: 'Arrastar o grupo Arquivo' })).toBeInTheDocument();
    });

    it('as doze vistas em ícone: a atual acesa, o clique troca a vista', async () => {
      const user = userEvent.setup();
      const setViewMode = vi.fn();
      render(<ScheduleHeader {...props({ viewMode: 'gantt', setViewMode })} />);
      const vistas = within(acesso()).getAllByRole('button', { name: /^Vista: / });
      expect(vistas).toHaveLength(12);
      expect(within(acesso()).getByRole('button', { name: 'Vista: Gantt' })).toHaveAttribute('aria-pressed', 'true');
      expect(within(acesso()).getByRole('button', { name: 'Vista: Tabela' })).toHaveAttribute('aria-pressed', 'false');
      await user.click(within(acesso()).getByRole('button', { name: 'Vista: Curva S' }));
      expect(setViewMode).toHaveBeenCalledWith('s-curve');
    });

    it('Expandir/Recolher só com a grade na tela; expandir desligado diz por quê', async () => {
      const user = userEvent.setup();
      const handleCollapseAll = vi.fn();
      const { unmount } = render(<ScheduleHeader {...props({ viewMode: 'table', allExpanded: true, handleCollapseAll })} />);
      const grupo = within(acesso()).getByRole('group', { name: 'Expandir e recolher' });
      const expandir = within(grupo).getByRole('button', { name: /^Expandir todos os níveis/ });
      expect(expandir).toBeDisabled();
      expect(expandir).toHaveAttribute('title', expect.stringContaining('já estão todos expandidos'));
      await user.click(within(grupo).getByRole('button', { name: 'Recolher todos os níveis' }));
      expect(handleCollapseAll).toHaveBeenCalledTimes(1);
      unmount();

      render(<ScheduleHeader {...props({ viewMode: 's-curve' })} />);
      expect(grupos()).not.toContain('estrutura');
    });

    it('Arquivo: importar, PDF, Excel e CSV chamam os handlers; PDF desligado enquanto gera', async () => {
      const user = userEvent.setup();
      const onImportarCronograma = vi.fn();
      const handleExportPDF = vi.fn();
      const handleExportExcel = vi.fn();
      const handleExportCSV = vi.fn();
      const { unmount } = render(
        <ScheduleHeader {...props({ viewMode: 's-curve', onImportarCronograma, handleExportPDF, handleExportExcel, handleExportCSV })} />,
      );
      const arquivo = within(acesso()).getByRole('group', { name: 'Arquivo' });
      await user.click(within(arquivo).getByRole('button', { name: /^Importar datas/ }));
      await user.click(within(arquivo).getByRole('button', { name: 'Exportar PDF' }));
      await user.click(within(arquivo).getByRole('button', { name: 'Exportar Excel' }));
      await user.click(within(arquivo).getByRole('button', { name: 'Exportar CSV' }));
      expect(onImportarCronograma).toHaveBeenCalledTimes(1);
      expect(handleExportPDF).toHaveBeenCalledTimes(1);
      expect(handleExportExcel).toHaveBeenCalledTimes(1);
      expect(handleExportCSV).toHaveBeenCalledTimes(1);
      // ação pontual não leva aria-pressed
      expect(within(arquivo).getByRole('button', { name: 'Exportar Excel' })).not.toHaveAttribute('aria-pressed');
      unmount();

      render(<ScheduleHeader {...props({ isExportingPDF: true })} />);
      expect(within(acesso()).getByRole('button', { name: /^Exportar PDF — gerando/ })).toBeDisabled();
    });

    it('a ordem arrastada vale ao reabrir (schedule:ordemDoAcessoRapido)', () => {
      localStorage.setItem('schedule:ordemDoAcessoRapido', JSON.stringify(['arquivo', 'vistas-execucao']));
      render(<ScheduleHeader {...props({ viewMode: 'gantt' })} />);
      expect(grupos()).toEqual(['arquivo', 'vistas-execucao', 'vistas-cronograma', 'vistas-analise', 'estrutura']);
    });
  });

  describe('recolher a faixa (como na Planta)', () => {
    it('recolhida: somem acesso rápido e painel; abas ficam; persiste', async () => {
      const user = userEvent.setup();
      localStorage.setItem('schedule:abaDoRibbon', JSON.stringify('estrutura'));
      const { unmount } = render(<ScheduleHeader {...props({ viewMode: 'gantt' })} />);
      expect(screen.getByRole('button', { name: 'Novo grupo' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Recolher a faixa de comandos' }));

      expect(screen.queryByTestId('acesso-rapido')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Novo grupo' })).toBeNull();
      expect(nomesDasAbas()).toEqual(['Estrutura', 'Cronograma', 'Orçamento', 'Vista']);
      expect(JSON.parse(localStorage.getItem('schedule:ribbonRecolhido') ?? 'null')).toBe(true);
      unmount();

      // reabre recolhida; clicar numa aba devolve tudo
      render(<ScheduleHeader {...props({ viewMode: 'gantt' })} />);
      expect(screen.queryByTestId('acesso-rapido')).toBeNull();
      await user.click(screen.getByRole('tab', { name: 'Cronograma' }));
      expect(screen.getByTestId('acesso-rapido')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Recalcular' })).toBeInTheDocument();
    });
  });
});
