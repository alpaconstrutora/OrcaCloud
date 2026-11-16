import React from 'react';
import {
    AlertTriangle,
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
    FileUp,
} from 'lucide-react';
import Ribbon, { BarraDeOpcoes, BotaoDoAcessoRapido, BotaoDoRibbon, GrupoDoRibbon, abaEfetiva } from '../blueprint/Ribbon';
import AcessoRapido, { GrupoDoAcessoRapido } from '../blueprint/AcessoRapido';
import MenuDeVistas, { GrupoDeVistas } from '../ui/MenuDeVistas';
import MenuDoRibbon from '../ui/MenuDoRibbon';
import { usePersistedState } from '../ui/TableUtils';
import ActionIconButton from '../ui/ActionIconButton';
import { RiscoDeAbastecimento, rotuloDoRisco } from './PainelRiscoAbastecimento';
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
    /** Importar datas de um cronograma do MS Project (XML) ou do modelo Excel (fase 2d). */
    onImportarCronograma?: () => void;
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
    /** Etapas em risco de abastecimento — `null`/ausente quando não há nenhuma.
        Era um banner fixo entre o ribbon e a grade (10/10/2026); virou o ícone
        com contador do §5.3 do guia, e o clique abre `PainelRiscoAbastecimento`. */
    riscoDeAbastecimento?: RiscoDeAbastecimento | null;
    onAbrirRiscoDeAbastecimento?: () => void;

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
 *
 * ⚠️ A aba EXPORTAR saiu em 16/11/2026: PDF, Excel e CSV foram para o grupo
 * Arquivo do acesso rápido, sempre à vista (decisão do usuário). Quem tinha
 * "exportar" salvo em `schedule:abaDoRibbon` cai em Cronograma pelo
 * `abaEfetiva` — não precisa migrar a chave.
 */
const ABAS_DO_PLANEJAMENTO = [
    { id: 'estrutura', rotulo: 'Estrutura', naGrade: true },
    { id: 'cronograma', rotulo: 'Cronograma', naGrade: false },
    { id: 'orcamento', rotulo: 'Orçamento', naGrade: false },
    { id: 'vista', rotulo: 'Vista', naGrade: true },
] as const;
type AbaDoPlanejamento = (typeof ABAS_DO_PLANEJAMENTO)[number]['id'];

/**
 * A ordem padrão dos grupos do ACESSO RÁPIDO (16/11/2026). O usuário arrasta a
 * alça e a ordem dele fica em `schedule:ordemDoAcessoRapido`; grupo novo que
 * não esteja na ordem salva entra no fim (`ordenarGrupos`).
 */
const ORDEM_PADRAO_DO_ACESSO_RAPIDO = ['vistas-cronograma', 'vistas-analise', 'vistas-execucao', 'estrutura', 'arquivo'];

/** Id do grupo do acesso rápido para cada grupo de vistas — o rótulo do grupo sem acento. */
const ID_DO_GRUPO_DE_VISTAS: Record<string, string> = {
    Cronograma: 'vistas-cronograma',
    Análise: 'vistas-analise',
    Execução: 'vistas-execucao',
};

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
    onImportarCronograma,
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
    riscoDeAbastecimento,
    onAbrirRiscoDeAbastecimento,
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

    const nomeDoPlanejamento = settings.name || 'Planejamento';
    const rotuloDoOrcamentoVinculado = orcamentoVinculado ? `Orçamento vinculado: ${orcamentoVinculado.name}` : 'Sem orçamento vinculado';

    const emGrade = viewMode === 'table' || viewMode === 'gantt';
    const noGantt = viewMode === 'gantt';

    const [abaSalva, setAbaSalva] = usePersistedState<AbaDoPlanejamento>('schedule:abaDoRibbon', 'estrutura');
    const abasDoRibbon = ABAS_DO_PLANEJAMENTO.filter((a) => emGrade || !a.naGrade);
    const aba = abaEfetiva(abasDoRibbon, abaSalva, 'cronograma');

    /* A faixa RECOLHIDA (16/11/2026, a mesma da Planta): só a fileira das abas
       fica. Persistida — quem trabalha num notebook recolhe uma vez. A barra de
       opções (escala, período) fica fora do Ribbon e continua à vista. */
    const [ribbonRecolhido, setRibbonRecolhido] = usePersistedState<boolean>('schedule:ribbonRecolhido', false);
    const [ordemDoAcessoRapido, setOrdemDoAcessoRapido] = usePersistedState<string[]>(
        'schedule:ordemDoAcessoRapido',
        ORDEM_PADRAO_DO_ACESSO_RAPIDO,
    );

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

    /**
     * ─── OS GRUPOS DO ACESSO RÁPIDO (16/11/2026) ─────────────────────────────
     *
     * A linha de ícones da Planta Inteligente, trazida para cá a pedido do
     * usuário (*"implemente menu e botões em engenharia > planejamento como foi
     * implementado em incorporação > planta inteligente"*; escolha: "Vistas +
     * Estrutura + Arquivo"). Cada família é um grupo com alça que se arrasta.
     *
     * - VISTAS: as doze em ícone, nos três grupos do seletor. O seletor da
     *   esquerda continua — é ele que NOMEIA a vista atual (a Planta faz igual).
     * - ESTRUTURA: expandir/recolher a EAP inteira — o gesto mais repetido em
     *   Tabela e Gantt. Só existe com a grade na tela (grupo que a vista não
     *   admite não entra, como na Planta).
     * - ARQUIVO: importar, exportar e TELA CHEIA. A tela cheia mora aqui pelo
     *   mesmo motivo da Planta: à vista em qualquer aba, para sair do modo.
     */
    const gruposDoAcessoRapido: GrupoDoAcessoRapido[] = [
        ...VISTAS_DO_PLANEJAMENTO.map((grupo) => ({
            id: ID_DO_GRUPO_DE_VISTAS[grupo.rotulo] ?? `vistas-${grupo.rotulo}`,
            rotulo: `Vistas de ${grupo.rotulo.toLowerCase()}`,
            botoes: (
                <>
                    {grupo.itens.map((v) => (
                        <BotaoDoAcessoRapido
                            key={v.id}
                            icone={v.icone}
                            rotulo={`Vista: ${v.rotulo}`}
                            ativo={viewMode === v.id}
                            onClick={() => setViewMode(v.id)}
                        />
                    ))}
                </>
            ),
        })),
        ...(emGrade
            ? [
                  {
                      id: 'estrutura',
                      // Não "Estrutura": é o nome do grupo da aba Estrutura, e dois
                      // `role=group` com o mesmo nome confundem leitor de tela.
                      rotulo: 'Expandir e recolher',
                      botoes: (
                          <>
                              <BotaoDoAcessoRapido
                                  icone={ChevronsUpDown}
                                  rotulo={allExpanded ? 'Expandir todos os níveis — já estão todos expandidos' : 'Expandir todos os níveis'}
                                  onClick={handleExpandAll}
                                  disabled={allExpanded}
                              />
                              <BotaoDoAcessoRapido icone={ChevronsDownUp} rotulo="Recolher todos os níveis" onClick={handleCollapseAll} />
                          </>
                      ),
                  },
              ]
            : []),
        {
            id: 'arquivo',
            rotulo: 'Arquivo',
            botoes: (
                <>
                    {onImportarCronograma && (
                        <BotaoDoAcessoRapido
                            icone={FileUp}
                            rotulo="Importar datas de um cronograma do MS Project (XML) ou do modelo Excel"
                            onClick={onImportarCronograma}
                        />
                    )}
                    <BotaoDoAcessoRapido
                        icone={isExportingPDF ? Loader2 : FileDown}
                        girando={isExportingPDF}
                        rotulo={isExportingPDF ? 'Exportar PDF — gerando o arquivo…' : 'Exportar PDF'}
                        onClick={handleExportPDF}
                        disabled={isExportingPDF}
                    />
                    <BotaoDoAcessoRapido icone={FileSpreadsheet} rotulo="Exportar Excel" onClick={handleExportExcel} />
                    <BotaoDoAcessoRapido icone={FileText} rotulo="Exportar CSV" onClick={handleExportCSV} />
                    <BotaoDoAcessoRapido
                        icone={telaCheia ? Minimize2 : Maximize2}
                        rotulo={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
                        onClick={onAlternarTelaCheia}
                        ativo={telaCheia}
                    />
                </>
            ),
        },
    ];

    return (
        // Sem faixa de título (10/10/2026): o mesmo da Planta Inteligente (P2.62/P2.63) —
        // *"a fim de ganhar mais espaço vertical, decidmos nao exibir o título e o
        // botao voltar foi para o menubar na planta inteligente. implemente o mesmo em
        // engenharia > planejamento"*. O voltar entra no ribbon, só ícone; o nome
        // continua no `title` da seta e num `h1` para leitor de tela; o orçamento
        // vinculado foi para a dica de "Sincronizar" (aba Orçamento), onde se lê
        // de qual orçamento o planejamento puxa.
        <>
        {/* RIBBON (§19.5) — o mesmo da Planta Inteligente, aqui dentro do card
            de cromo da tela (§19.1): seletor de vista à esquerda, abas de
            comandos, o aviso e a ação primária à direita; embaixo das abas o
            ACESSO RÁPIDO (linha de ícones em grupos que se arrastam) e o painel
            da aba; em Tabela/Gantt, a barra de opções da vista. A faixa se
            recolhe (setinha ou duplo clique na aba), como na Planta. Sem
            `overflow-hidden` no card: os menus (vista, colunas, níveis) são
            `absolute` e seriam cortados. O `border-b` do ribbon só fica quando
            há barra de opções abaixo dele. */}
        <div className={`rounded-[10px] border border-gray-100 bg-white shadow-sm ${emGrade ? '' : '[&>[role=toolbar]]:border-b-0'}`}>
            <Ribbon
                abas={abasDoRibbon}
                ativa={aba}
                onEscolher={setAbaSalva}
                recolhido={ribbonRecolhido}
                onRecolher={setRibbonRecolhido}
                acessoRapido={
                    <AcessoRapido
                        ordem={Array.isArray(ordemDoAcessoRapido) ? ordemDoAcessoRapido : []}
                        onOrdem={setOrdemDoAcessoRapido}
                        grupos={gruposDoAcessoRapido}
                    />
                }
                ariaLabel="Ferramentas do planejamento"
                esquerda={
                    <>
                        {/* Mesmo controle do voltar da Planta (`BotaoBarra` em
                            BlueprintEditor.tsx): só ícone, `title` + `aria-label`. */}
                        {onBack && (
                            <button
                                type="button"
                                onClick={onBack}
                                title={`Voltar para Gestão de Planejamento — ${nomeDoPlanejamento}`}
                                aria-label={`Voltar para Gestão de Planejamento — ${nomeDoPlanejamento}`}
                                className="shrink-0 rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </button>
                        )}
                        {/* Some da tela, não do app: leitor de tela precisa de um
                            título de nível 1 para saber onde está. */}
                        <h1 className="sr-only">Planejamento Físico-Financeiro — {nomeDoPlanejamento}</h1>
                        <MenuDeVistas
                            vista={viewMode}
                            onEscolher={setViewMode}
                            grupos={VISTAS_DO_PLANEJAMENTO}
                            ariaLabel="Vista do planejamento"
                        />
                    </>
                }
                direita={
                    <>
                        {/* Aviso de abastecimento (§5.3 do guia): aviso que é estado
                            normal da tela não é banner — é ícone com contador, o
                            detalhe no `title`, o clique abre o painel. Mesmo desenho do
                            "Memória técnica pendente" de BudgetEditor.tsx; aqui em h-9
                            para alinhar com a tela cheia e a ação primária. */}
                        {riscoDeAbastecimento && riscoDeAbastecimento.etapas > 0 && onAbrirRiscoDeAbastecimento && (
                            <div className="relative shrink-0">
                                <ActionIconButton
                                    kind="view"
                                    tone="danger"
                                    icon={<AlertTriangle className="w-4 h-4" />}
                                    title={`${rotuloDoRisco(riscoDeAbastecimento)}. Clique para ver as etapas.`}
                                    aria-label={`Ver ${riscoDeAbastecimento.etapas} ${riscoDeAbastecimento.etapas === 1 ? 'etapa em risco' : 'etapas em risco'} de abastecimento`}
                                    onClick={onAbrirRiscoDeAbastecimento}
                                    className="flex h-9 w-9 items-center justify-center"
                                />
                                <span className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white tabular-nums">
                                    {riscoDeAbastecimento.etapas}
                                </span>
                            </div>
                        )}
                        {/* A TELA CHEIA saiu daqui em 16/11/2026: mora no grupo
                            Arquivo do acesso rápido, como na Planta. */}
                        {/* Ação primária (§17, `h-9` compacto) — sempre visível, em
                            qualquer vista. Não copia a medida do "Publicar versão"
                            da Planta (`py-1.5 text-sm`): o guia manda aqui. */}
                        <button
                            type="button"
                            onClick={onAutoSchedule}
                            title="Recalcula todas as datas com base em predecessores e duração"
                            // emerald-700: branco sobre emerald-600 dava 3,7:1 (detector, 2ª crítica); 700 passa de 4,5:1.
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-emerald-700 text-white rounded-[6px] hover:bg-emerald-800 font-medium text-[13px] transition-all active:scale-95 shrink-0"
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
                            {onImportarCronograma && (
                                <BotaoDoRibbon icone={FileUp} rotulo="Importar datas" onClick={onImportarCronograma} ajuda="Atualizar as datas a partir de um cronograma do MS Project (XML) ou do modelo Excel" />
                            )}
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
                            ajuda={`${syncDiffCount > 0 ? `${syncDiffCount} alteração(ões) no orçamento pendentes` : 'Planejamento sincronizado com o orçamento'} · ${rotuloDoOrcamentoVinculado}`}
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
