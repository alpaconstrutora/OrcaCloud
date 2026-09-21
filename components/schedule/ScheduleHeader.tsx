import React from 'react';
import {
    ArrowLeft,
    BadgeCheck,
    CalendarCheck,
    ChartGantt,
    ChartSpline,
    ChevronsDownUp,
    ChevronsUpDown,
    Columns3,
    FileDown,
    FileSpreadsheet,
    FileText,
    Filter,
    FlaskConical,
    FolderPlus,
    Gauge,
    GitBranch,
    History,
    ListTree,
    Loader2,
    Lock,
    Maximize2,
    Minimize2,
    RefreshCw,
    Settings,
    ShieldAlert,
    ShoppingCart,
    Table2,
    Tags,
    Trash2,
    TrendingUp,
    Users,
    UsersRound,
    Wand2,
    Workflow,
} from 'lucide-react';
import Ribbon, { BarraDeOpcoes, BotaoDoRibbon, GrupoDoRibbon, abaEfetiva } from '../blueprint/Ribbon';
import MenuDeVistas, { GrupoDeVistas } from '../ui/MenuDeVistas';
import MenuDoRibbon from '../ui/MenuDoRibbon';
import { usePersistedState } from '../ui/TableUtils';
import { isOrcamentoOuLegado } from '../../utils/projectClassification';
import { TASK_NATURE_META } from '../../utils/taskNature';
import { ProjectSchedule, ProjectSettings, ItemScheduleDetails } from '../../types';
import { COLUNAS_DA_TABELA, COLUNAS_DO_GANTT, NIVEIS_DO_RESUMO } from './scheduleColumns';

export type ScheduleViewMode =
    | 'table' | 'gantt' | 's-curve' | 'resources' | 'risks' | 'constraints'
    | 'weekly' | 'scenarios' | 'command' | 'supply' | 'eap' | 'network';
export type ScheduleTimeScale = 'day' | 'week' | 'month' | 'year';

interface ScheduleHeaderProps {
    onBack?: () => void;
    settings: ProjectSettings;
    projects: any[];
    viewMode: ScheduleViewMode;
    setViewMode: (mode: ScheduleViewMode) => void;
    timeScale: ScheduleTimeScale;
    setTimeScale: (scale: ScheduleTimeScale) => void;
    schedule: ProjectSchedule;
    setIsBaselineModalOpen: (open: boolean) => void;
    isSimulationMode: boolean;
    handleToggleSimulation: () => void;
    handleExportPDF: () => void;
    isExportingPDF: boolean;
    handleExportExcel: () => void;
    handleExportCSV: () => void;
    setIsConfigModalOpen: (open: boolean) => void;
    handleLevelResources: () => void;
    handleRecalculate: (currentSchedules?: ItemScheduleDetails[], newStartDate?: string) => void;
    onUpdateSettings: (settings: ProjectSettings) => void;
    handleExpandAll: () => void;
    handleCollapseAll: () => void;
    allExpanded: boolean;
    handleApplyAutoAllItems: () => void;
    handleDisableAutoAllItems: () => void;
    onOpenCrewClassification: () => void;
    budgetLength: number;
    autoCount: number;
    allAuto: boolean;
    onClearAll: () => void;
    syncDiffCount: number;
    onSyncBudget: () => void;
    onOpenVersions: () => void;
    planningVersionsCount: number;
    hasNewerBudgetVersion: boolean;
    onAutoSchedule: () => void;
    /** Modo tela cheia (`hooks/useTelaCheia.ts`) — aceso enquanto vale, com `aria-pressed`. */
    telaCheia: boolean;
    onAlternarTelaCheia: () => void;

    /* ─── O que veio do cabeçalho das grades para o ribbon (21/09/2026) ─── */
    /** Aba Estrutura › Novo grupo — a raiz da EAP. */
    onAddRootGroup: () => void;
    /** Colunas ocultas da TABELA (`schedule-collapsed-cols`) e do GANTT (`gantt-collapsed-cols`). */
    collapsedCols: Set<string>;
    ganttCollapsedCols: Set<string>;
    onToggleColumn: (key: string) => void;
    onToggleGanttColumn: (key: string) => void;
    onShowAllColumns: () => void;
    onShowAllGanttColumns: () => void;
    /** "Focar Gantt": oculta todas as colunas para sobrar só as barras. */
    onCollapseAllGanttCols: () => void;
    /** Níveis do resumo visíveis — a Tabela e o Gantt guardam o seu. */
    visibleTableLevels: Set<string>;
    visibleGanttLevels: Set<string>;
    onToggleTableLevel: (level: string) => void;
    onToggleGanttLevel: (level: string) => void;
    /** Naturezas de tarefa visíveis (compartilhado pelas duas vistas). */
    visibleNatures: Set<string>;
    onToggleNature: (nature: string) => void;
}

/**
 * As doze vistas, no seletor à esquerda do ribbon (§19.5). Agrupadas porque
 * doze itens corridos não se leem: "Cronograma" é o que se edita, "Análise" é
 * o que se lê, "Execução" é o que se acompanha em obra. Os ids são os mesmos
 * `viewMode` de sempre — `localStorage['schedule-view-mode']` continua valendo.
 */
export const VISTAS_DO_PLANEJAMENTO: readonly GrupoDeVistas<ScheduleViewMode>[] = [
    {
        rotulo: 'Cronograma',
        itens: [
            { id: 'table', rotulo: 'Tabela', icone: Table2 },
            { id: 'gantt', rotulo: 'Gantt', icone: ChartGantt },
            { id: 'network', rotulo: 'Rede', icone: Workflow },
            { id: 'eap', rotulo: 'EAP Física', icone: ListTree },
        ],
    },
    {
        rotulo: 'Análise',
        itens: [
            { id: 's-curve', rotulo: 'Curva S', icone: ChartSpline },
            { id: 'risks', rotulo: 'Riscos', icone: ShieldAlert },
            { id: 'scenarios', rotulo: 'Cenários', icone: GitBranch },
            { id: 'command', rotulo: 'Comando', icone: Gauge },
        ],
    },
    {
        rotulo: 'Execução',
        itens: [
            { id: 'resources', rotulo: 'Recursos', icone: Users },
            { id: 'constraints', rotulo: 'Restrições', icone: Lock },
            { id: 'weekly', rotulo: 'Last Planner', icone: CalendarCheck },
            { id: 'supply', rotulo: 'Suprimentos', icone: ShoppingCart },
        ],
    },
];

const ROTULO_DA_VISTA: Record<ScheduleViewMode, string> = Object.fromEntries(
    VISTAS_DO_PLANEJAMENTO.flatMap((g) => g.itens.map((i) => [i.id, i.rotulo])),
) as Record<ScheduleViewMode, string>;

/**
 * As abas de COMANDOS do ribbon. `naGrade` = a aba só faz sentido com a EAP
 * na tela (Tabela ou Gantt): Estrutura mexe nos nós e Vista nas colunas. Nas
 * outras vistas elas somem (aba vazia não aparece — §19.5) e a aba salva cai
 * em Cronograma, que é a que vale em qualquer vista.
 */
const ABAS_DO_PLANEJAMENTO = [
    { id: 'estrutura', rotulo: 'Estrutura', naGrade: true },
    { id: 'cronograma', rotulo: 'Cronograma', naGrade: false },
    { id: 'orcamento', rotulo: 'Orçamento', naGrade: false },
    { id: 'exportar', rotulo: 'Exportar', naGrade: false },
    { id: 'vista', rotulo: 'Vista', naGrade: true },
] as const;
type AbaDoPlanejamento = (typeof ABAS_DO_PLANEJAMENTO)[number]['id'];

const ESCALAS: readonly { id: ScheduleTimeScale; rotulo: string }[] = [
    { id: 'day', rotulo: 'Dia' },
    { id: 'week', rotulo: 'Sem' },
    { id: 'month', rotulo: 'Mês' },
    { id: 'year', rotulo: 'Ano' },
];

const ScheduleHeader: React.FC<ScheduleHeaderProps> = ({
    onBack,
    settings,
    projects,
    viewMode,
    setViewMode,
    timeScale,
    setTimeScale,
    schedule,
    setIsBaselineModalOpen,
    isSimulationMode,
    handleToggleSimulation,
    handleExportPDF,
    isExportingPDF,
    handleExportExcel,
    handleExportCSV,
    setIsConfigModalOpen,
    handleLevelResources,
    handleRecalculate,
    onUpdateSettings,
    handleExpandAll,
    handleCollapseAll,
    allExpanded,
    handleApplyAutoAllItems,
    handleDisableAutoAllItems,
    onOpenCrewClassification,
    budgetLength,
    autoCount,
    allAuto,
    onClearAll,
    syncDiffCount,
    onSyncBudget,
    onOpenVersions,
    planningVersionsCount,
    hasNewerBudgetVersion,
    onAutoSchedule,
    telaCheia,
    onAlternarTelaCheia,
    onAddRootGroup,
    collapsedCols,
    ganttCollapsedCols,
    onToggleColumn,
    onToggleGanttColumn,
    onShowAllColumns,
    onShowAllGanttColumns,
    onCollapseAllGanttCols,
    visibleTableLevels,
    visibleGanttLevels,
    onToggleTableLevel,
    onToggleGanttLevel,
    visibleNatures,
    onToggleNature,
}) => {
    const orcamentoVinculado = settings.linkedProjectId
        ? projects.find((p) => p.id === settings.linkedProjectId && isOrcamentoOuLegado(p))
        : undefined;

    const emGrade = viewMode === 'table' || viewMode === 'gantt';
    const noGantt = viewMode === 'gantt';

    const [abaSalva, setAbaSalva] = usePersistedState<AbaDoPlanejamento>('schedule:abaDoRibbon', 'estrutura');
    const abasDoRibbon = ABAS_DO_PLANEJAMENTO.filter((a) => emGrade || !a.naGrade);
    const aba = abaEfetiva(abasDoRibbon, abaSalva, 'cronograma');

    // Colunas, níveis: cada grade guarda o seu — o ribbon fala com a que está na tela.
    const colunas = noGantt ? COLUNAS_DO_GANTT : COLUNAS_DA_TABELA;
    const ocultas = noGantt ? ganttCollapsedCols : collapsedCols;
    const alternarColuna = noGantt ? onToggleGanttColumn : onToggleColumn;
    const mostrarTodas = noGantt ? onShowAllGanttColumns : onShowAllColumns;
    const niveis = noGantt ? visibleGanttLevels : visibleTableLevels;
    const alternarNivel = noGantt ? onToggleGanttLevel : onToggleTableLevel;

    const baselineAtiva = schedule.activeBaselineId
        ? schedule.baselines?.find((b) => b.id === schedule.activeBaselineId)?.name || 'Baseline'
        : 'Baseline';

    return (
        // §20 / §20.1: o título fica SOLTO (sem card) e o `space-y-6` da raiz dá os
        // 24px até o ribbon. Mesmo cabeçalho de tela-detalhe com "Voltar" de
        // `ContractDetailView.tsx` — h1 2xl, não 3xl (3xl é só lista-raiz).
        <>
        <div className="flex items-center gap-4">
            {onBack && (
                <button
                    type="button"
                    onClick={onBack}
                    title="Voltar para Gestão de Planejamento"
                    className="p-2.5 bg-white border border-gray-200 rounded-[6px] text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm active:scale-95 group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                </button>
            )}
            <div>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight">Planejamento Físico-Financeiro</h1>
                {/* Contexto só-leitura, no lugar do antigo seletor "Orçamento: ›" —
                    aquele NÃO era escopo: escolher outro orçamento saía desta tela e
                    abria o orçamento no editor (`handleLoadProject` → 'analytic').
                    O que o usuário precisa ler aqui é qual planejamento é este e
                    de qual orçamento ele lê (`settings.linkedProjectId`). */}
                <p className="text-gray-400 text-sm mt-1.5 font-medium">
                    {settings.name || 'Planejamento'}
                    <span className="mx-2 text-gray-300">·</span>
                    {orcamentoVinculado ? `Orçamento vinculado: ${orcamentoVinculado.name}` : 'Sem orçamento vinculado'}
                </p>
            </div>
        </div>

        {/* RIBBON (§19.5) — o mesmo da Planta Inteligente, aqui dentro do card
            de cromo da tela (§19.1): seletor de vista à esquerda, abas de
            comandos, acesso rápido à direita e, em Tabela/Gantt, a barra de
            opções da vista embaixo. Sem `overflow-hidden` no card: os menus
            (vista, colunas, níveis) são `absolute` e seriam cortados. O `border-b`
            do ribbon só fica quando há barra de opções abaixo dele. */}
        <div className={`rounded-[10px] border border-gray-100 bg-white shadow-sm ${emGrade ? '' : '[&>[role=toolbar]]:border-b-0'}`}>
            <Ribbon
                abas={abasDoRibbon}
                ativa={aba}
                onEscolher={setAbaSalva}
                ariaLabel="Ferramentas do planejamento"
                esquerda={
                    <MenuDeVistas
                        vista={viewMode}
                        onEscolher={setViewMode}
                        grupos={VISTAS_DO_PLANEJAMENTO}
                        ariaLabel="Vista do planejamento"
                    />
                }
                direita={
                    <>
                        {/* Tela cheia — o mesmo botão de MODO da Planta: ícone só,
                            `aria-pressed`, aceso enquanto vale. À vista em qualquer
                            aba porque é o único caminho para SAIR do modo. */}
                        <button
                            type="button"
                            onClick={onAlternarTelaCheia}
                            title={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
                            aria-label={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
                            aria-pressed={telaCheia}
                            className={`flex items-center justify-center h-9 w-9 rounded-[6px] border transition-all ${
                                telaCheia ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            {telaCheia ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                        {/* Ação primária (§17) — sempre visível, em qualquer vista. */}
                        <button
                            type="button"
                            onClick={onAutoSchedule}
                            title="Recalcula todas as datas com base em predecessores e duração"
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-emerald-600 text-white rounded-[6px] hover:bg-emerald-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                        >
                            <Wand2 className="w-[15px] h-[15px]" />
                            Auto Programar
                        </button>
                    </>
                }
            >
                {aba === 'estrutura' && emGrade && (
                    <>
                        <GrupoDoRibbon rotulo="Estrutura">
                            <BotaoDoRibbon icone={FolderPlus} rotulo="Novo grupo" onClick={onAddRootGroup} ajuda="Adiciona um grupo na raiz da EAP" />
                            <BotaoDoRibbon icone={ChevronsUpDown} rotulo="Expandir" onClick={handleExpandAll} disabled={allExpanded} ajuda="Expandir todos os níveis" />
                            <BotaoDoRibbon icone={ChevronsDownUp} rotulo="Recolher" onClick={handleCollapseAll} ajuda="Recolher todos os níveis" />
                        </GrupoDoRibbon>
                        <GrupoDoRibbon rotulo="Filtro">
                            <MenuDoRibbon
                                icone={Filter}
                                rotulo="Níveis"
                                ajuda="Quais níveis do resumo aparecem"
                                cabecalho={noGantt ? 'Resumo do Gantt' : 'Resumo da tabela'}
                                itens={NIVEIS_DO_RESUMO.map((n) => ({ id: n.id, rotulo: n.rotulo, marcado: niveis.has(n.id) }))}
                                onAlternar={alternarNivel}
                            />
                            <MenuDoRibbon
                                icone={Tags}
                                rotulo="Natureza"
                                ajuda="Quais naturezas de tarefa aparecem"
                                cabecalho="Natureza da tarefa"
                                itens={[
                                    ...Object.entries(TASK_NATURE_META).map(([id, meta]) => ({
                                        id, rotulo: meta.label, marcado: visibleNatures.has(id), cor: meta.color,
                                    })),
                                    { id: '__none__', rotulo: 'Sem natureza', marcado: visibleNatures.has('__none__') },
                                ]}
                                onAlternar={onToggleNature}
                            />
                        </GrupoDoRibbon>
                        <GrupoDoRibbon rotulo="Zerar">
                            <BotaoDoRibbon icone={Trash2} rotulo="Limpar tudo" perigo onClick={onClearAll} ajuda="Remove todas as distribuições do cronograma" />
                        </GrupoDoRibbon>
                    </>
                )}

                {aba === 'cronograma' && (
                    <>
                        <GrupoDoRibbon rotulo="Programar">
                            <BotaoDoRibbon icone={RefreshCw} rotulo="Recalcular" onClick={() => handleRecalculate()} ajuda="Recalcula as distribuições a partir das datas atuais" />
                        </GrupoDoRibbon>
                        <GrupoDoRibbon rotulo="Recursos">
                            <BotaoDoRibbon icone={Users} rotulo="Nivelar" onClick={handleLevelResources} ajuda="Nivelamento automático de recursos" />
                            <BotaoDoRibbon
                                icone={UsersRound}
                                rotulo="Auto Equipe"
                                ativo={allAuto}
                                contagem={budgetLength > 0 ? autoCount : undefined}
                                onClick={allAuto ? handleDisableAutoAllItems : handleApplyAutoAllItems}
                                ajuda={allAuto ? 'Desligar a duração automática pela equipe em todos os itens' : `Calcular a duração pela equipe em todos os itens (${autoCount}/${budgetLength} ligados)`}
                            />
                            <BotaoDoRibbon icone={BadgeCheck} rotulo="Cargos" onClick={onOpenCrewClassification} ajuda="Classificação de cargos" />
                        </GrupoDoRibbon>
                        <GrupoDoRibbon rotulo="Linha de base">
                            <BotaoDoRibbon icone={TrendingUp} rotulo={baselineAtiva} onClick={() => setIsBaselineModalOpen(true)} ajuda="Linhas de base do planejamento" />
                            <BotaoDoRibbon icone={FlaskConical} rotulo="What-If" ativo={isSimulationMode} onClick={handleToggleSimulation} ajuda="Modo de simulação: testar mudanças sem gravar" />
                        </GrupoDoRibbon>
                        <GrupoDoRibbon rotulo="Calendário">
                            <BotaoDoRibbon icone={Settings} rotulo="Configurações" onClick={() => setIsConfigModalOpen(true)} ajuda="Feriados, jornada e exibição do cronograma" />
                        </GrupoDoRibbon>
                    </>
                )}

                {aba === 'orcamento' && (
                    <GrupoDoRibbon rotulo="Integração">
                        <BotaoDoRibbon
                            icone={RefreshCw}
                            rotulo="Sincronizar"
                            contagem={syncDiffCount > 0 ? syncDiffCount : undefined}
                            onClick={onSyncBudget}
                            ajuda={syncDiffCount > 0 ? `${syncDiffCount} alteração(ões) no orçamento pendentes` : 'Planejamento sincronizado com o orçamento'}
                        />
                        <BotaoDoRibbon
                            icone={History}
                            rotulo="Versões"
                            contagem={planningVersionsCount > 0 ? planningVersionsCount : undefined}
                            onClick={onOpenVersions}
                            ajuda={hasNewerBudgetVersion ? 'Há uma versão mais nova do orçamento — versões do planejamento' : 'Versões do planejamento'}
                        />
                    </GrupoDoRibbon>
                )}

                {aba === 'exportar' && (
                    <GrupoDoRibbon rotulo="Exportar">
                        <BotaoDoRibbon icone={isExportingPDF ? Loader2 : FileDown} rotulo={isExportingPDF ? 'Gerando PDF…' : 'PDF'} onClick={handleExportPDF} disabled={isExportingPDF} />
                        <BotaoDoRibbon icone={FileSpreadsheet} rotulo="Excel" onClick={handleExportExcel} />
                        <BotaoDoRibbon icone={FileText} rotulo="CSV" onClick={handleExportCSV} />
                    </GrupoDoRibbon>
                )}

                {aba === 'vista' && emGrade && (
                    <GrupoDoRibbon rotulo="Colunas">
                        <MenuDoRibbon
                            icone={Columns3}
                            rotulo="Colunas"
                            ajuda="Quais colunas aparecem"
                            cabecalho="Colunas visíveis"
                            contagem={ocultas.size}
                            itens={Object.entries(colunas).map(([id, rotulo]) => ({ id, rotulo, marcado: !ocultas.has(id) }))}
                            onAlternar={alternarColuna}
                            rodape={
                                <>
                                    <BotaoDoRibbon icone={Columns3} rotulo="Ver todas" onClick={mostrarTodas} disabled={ocultas.size === 0} />
                                    {noGantt && (
                                        <BotaoDoRibbon icone={ChartGantt} rotulo="Focar Gantt" onClick={onCollapseAllGanttCols} ajuda="Oculta todas as colunas para sobrar só as barras" />
                                    )}
                                </>
                            }
                        />
                    </GrupoDoRibbon>
                )}
            </Ribbon>

            {/* Barra de opções (§19.5, linha 3): só o que a VISTA ativa pergunta —
                escala de tempo e período do planejamento. Só em Tabela/Gantt. */}
            {emGrade && (
                <div className="overflow-hidden rounded-b-[10px] [&>[role=region]]:border-b-0">
                    <BarraDeOpcoes rotulo={ROTULO_DA_VISTA[viewMode]}>
                        <div role="group" aria-label="Escala de tempo" className="flex items-center gap-0.5 rounded-[8px] border border-gray-200 bg-white p-0.5">
                            {ESCALAS.map((escala) => (
                                <button
                                    key={escala.id}
                                    type="button"
                                    aria-pressed={timeScale === escala.id}
                                    onClick={() => setTimeScale(escala.id)}
                                    className={`h-6 rounded-[6px] px-2 text-xs font-medium transition-all ${
                                        timeScale === escala.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                                    }`}
                                >
                                    {escala.rotulo}
                                </button>
                            ))}
                        </div>
                        <label className="flex items-center gap-1.5 text-xs text-slate-500">
                            Início
                            <input
                                type="date"
                                value={schedule.startDate ? schedule.startDate.split('T')[0] : ''}
                                onChange={(e) => handleRecalculate(undefined, e.target.value)}
                                className="h-7 rounded-[6px] border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-slate-500">
                            Término
                            <input
                                type="date"
                                value={schedule.endDate ? schedule.endDate.split('T')[0] : ''}
                                onChange={(e) => {
                                    const next = { ...schedule, endDate: e.target.value };
                                    onUpdateSettings({ ...settings, schedule: next, endDate: e.target.value });
                                }}
                                className="h-7 rounded-[6px] border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                        </label>
                    </BarraDeOpcoes>
                </div>
            )}
        </div>
        </>
    );
};

export default ScheduleHeader;
