import React from 'react';
import { Shield, Plus, AlertTriangle, CheckCircle, Clock, XCircle, Wrench, Star, Search, MoveHorizontal, ChevronRight, Upload, X } from 'lucide-react';
import { warrantyService } from '../services/warrantyService';
import { useToast } from '../hooks/useToast';
import { useOrgWriteTarget } from '../hooks/useOrgContext';
import { useConfirm } from './ui/confirm';
import { ColumnConfig, useTableColumns, useResizableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import type { WarrantyClaim, ClaimState, ClaimOrigin, WarrantyKPIs, ClaimFilters } from '../types/warranty';
import type { TaxonomySystem, TaxonomyPathology } from '../types/quality';
import Button from './ui/Button';
import ActionIconButton from './ui/ActionIconButton';

// ── Sub-componentes inline ────────────────────────────────────────────────────

const STATE_LABELS: Record<ClaimState, string> = {
    ABERTO:          'Aberto',
    TRIAGEM:         'Em Triagem',
    EM_GARANTIA:     'Em Garantia',
    FORA_GARANTIA:   'Fora de Garantia',
    VISITA_AGENDADA: 'Visita Agendada',
    EM_REPARO:       'Em Reparo',
    CONCLUIDO:       'Concluído',
    CONTESTADO:      'Contestado',
    REABERTO:        'Reaberto',
    ENCERRADO:       'Encerrado',
};

// §8 — StatusBadge: texto colorido simples, sem pílula/fundo/uppercase.
const STATE_COLORS: Record<ClaimState, string> = {
    ABERTO:          'text-blue-700',
    TRIAGEM:         'text-yellow-700',
    EM_GARANTIA:     'text-green-700',
    FORA_GARANTIA:   'text-red-700',
    VISITA_AGENDADA: 'text-purple-700',
    EM_REPARO:       'text-orange-700',
    CONCLUIDO:       'text-teal-700',
    CONTESTADO:      'text-pink-700',
    REABERTO:        'text-amber-700',
    ENCERRADO:       'text-gray-500',
};

const SEVERITY_COLORS: Record<string, string> = {
    baixa:   'text-green-600',
    media:   'text-yellow-700',
    alta:    'text-orange-600',
    critica: 'text-red-700',
};

// Origem provável do defeito — absorvida de "Qualidade & Entrega" (2026-08-26).
// É o campo que separa "a construtora executou errado" de "o morador usou mal",
// e por isso alimenta a decisão de responsabilidade na triagem.
const ORIGIN_LABELS: Record<ClaimOrigin, string> = {
    execucao:      'Execução',
    material:      'Material',
    projeto:       'Projeto',
    uso:           'Uso',
    manutencao:    'Manutenção',
    indeterminada: 'Indeterminada',
};

/**
 * Qualidade do REGISTRO (0–100) — não do serviço prestado.
 * Mede se o chamado foi aberto com descrição, local, unidade, prazo, foto e
 * patologia classificada. Cálculo no banco (`fn_warranty_claim_quality_score`).
 */
function QualityScoreBar({ score }: { score?: number }) {
    if (score === undefined || score === null) return <span className="text-gray-300">—</span>;
    const color = score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500';
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[40px]">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
            </div>
            <span className="text-gray-500 w-6 text-right">{score}</span>
        </div>
    );
}

/**
 * Selects encadeados Sistema → Patologia sobre a taxonomia controlada.
 *
 * Texto livre em "sistema afetado" é o que impede qualquer estatística de
 * recorrência ("quantas infiltrações por impermeabilização neste
 * empreendimento?"). A taxonomia é opcional — um chamado por telefone entra sem
 * ela e é classificado depois — mas quando preenchida é validada no banco.
 */
function TaxonomyPicker({
    systems, systemCode, pathologyCode, onChange, disabled,
}: {
    systems: TaxonomySystem[];
    systemCode: string;
    pathologyCode: string;
    onChange: (next: { systemCode: string; pathologyCode: string; system?: TaxonomySystem }) => void;
    disabled?: boolean;
}) {
    const [pathologies, setPathologies] = React.useState<TaxonomyPathology[]>([]);
    const [loading, setLoading] = React.useState(false);

    React.useEffect(() => {
        if (!systemCode) { setPathologies([]); return; }
        let cancelled = false;
        setLoading(true);
        warrantyService.getTaxonomyPathologies(systemCode)
            .then(rows => { if (!cancelled) setPathologies(rows); })
            .catch(console.error)
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [systemCode]);

    const selectClass = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-400';

    return (
        <>
            <div>
                <label className="block text-form-label font-bold text-gray-600 mb-1">Sistema construtivo</label>
                <select
                    value={systemCode}
                    disabled={disabled}
                    onChange={e => {
                        const code = e.target.value;
                        onChange({
                            systemCode: code,
                            pathologyCode: '',   // patologia do sistema antigo não vale no novo
                            system: systems.find(s => s.code === code),
                        });
                    }}
                    className={selectClass}
                >
                    <option value="">Não classificado</option>
                    {systems.map(s => (
                        <option key={s.code} value={s.code}>{s.name}</option>
                    ))}
                </select>
            </div>
            <div>
                <label className="block text-form-label font-bold text-gray-600 mb-1">Patologia</label>
                <select
                    value={pathologyCode}
                    disabled={disabled || !systemCode || loading}
                    onChange={e => onChange({ systemCode, pathologyCode: e.target.value })}
                    className={selectClass}
                >
                    <option value="">
                        {!systemCode ? 'Escolha o sistema primeiro' : loading ? 'Carregando...' : 'Não especificada'}
                    </option>
                    {pathologies.map(p => (
                        <option key={p.code} value={p.code}>{p.name}</option>
                    ))}
                </select>
            </div>
        </>
    );
}

function KPICard({ label, value, sub, icon: Icon, color }: {
    label: string; value: string | number; sub?: string;
    icon: React.ElementType; color: string;
}) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-start gap-4 shadow-sm">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
                <p className="text-2xl font-black text-gray-900 mt-0.5">{value}</p>
                {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}

const CLAIM_COLUMNS: ColumnConfig[] = [
    { key: 'chamado', label: 'Chamado', sortable: true },
    { key: 'patologia', label: 'Patologia', sortable: true },
    { key: 'state', label: 'Estado', sortable: true },
    { key: 'severity', label: 'Severidade', sortable: true },
    { key: 'sla_deadline', label: 'SLA', sortable: true },
    { key: 'quality_score', label: 'Registro', sortable: true },
    { key: 'created_at', label: 'Abertura', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];
const CLAIM_COL_WIDTHS: Record<string, number> = { chamado: 300, patologia: 190, state: 140, severity: 120, sla_deadline: 140, quality_score: 120, created_at: 130, actions: 60 };

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX. 'actions' fica fora (estrutural, fixa à direita).
const CLAIM_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    chamado: { label: 'Chamado', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    patologia: { label: 'Patologia', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    state: { label: 'Estado', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    severity: { label: 'Severidade', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    sla_deadline: { label: 'SLA', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    quality_score: { label: 'Registro', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    created_at: { label: 'Abertura', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
};

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `tableColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna.
function renderClaimCell(key: string, claim: WarrantyClaim, ctx: { obraName?: string | null; slaVencido?: boolean; pathologyName?: string; systemName?: string }): React.ReactNode {
    switch (key) {
        case 'patologia':
            if (!claim.taxonomy?.systemCode) {
                return <span className="text-sm font-normal text-gray-300">Não classificado</span>;
            }
            return (
                <div className="text-sm font-normal text-gray-700">
                    <p className="truncate">{ctx.pathologyName ?? claim.taxonomy.pathologyCode ?? 'Sem patologia'}</p>
                    <p className="text-xs text-gray-400 truncate">{ctx.systemName ?? claim.taxonomy.systemCode}</p>
                </div>
            );
        case 'quality_score':
            return (
                <div className="text-sm font-normal text-gray-600">
                    <QualityScoreBar score={claim.quality_score?.value} />
                </div>
            );
        case 'chamado':
            return (
                <div className="text-sm font-normal text-gray-700">
                    <p className="truncate max-w-[260px]">{claim.sistema_descricao}</p>
                    <p className="text-xs text-gray-400 truncate max-w-[260px]">
                        {ctx.obraName && <span className="text-blue-500 font-medium">{ctx.obraName} · </span>}
                        {claim.client_name || '—'} · {claim.unidade_ref || '—'}
                    </p>
                </div>
            );
        case 'state':
            return <span className={`text-sm font-normal ${STATE_COLORS[claim.state]}`}>{STATE_LABELS[claim.state]}</span>;
        case 'severity':
            return <span className={`text-sm font-normal capitalize ${SEVERITY_COLORS[claim.severity]}`}>{claim.severity}</span>;
        case 'sla_deadline':
            return (
                <span className="text-sm font-normal text-gray-600">
                    {claim.sla_deadline ? (
                        <span className={ctx.slaVencido ? 'text-red-600 font-medium' : ''}>
                            {new Date(claim.sla_deadline + 'T00:00:00').toLocaleDateString('pt-BR')}
                            {ctx.slaVencido && ' ⚠'}
                        </span>
                    ) : '—'}
                </span>
            );
        case 'created_at':
            return <span className="text-sm font-normal text-gray-600">{new Date(claim.created_at).toLocaleDateString('pt-BR')}</span>;
        default:
            return null;
    }
}

function ClaimRow({ claim, onSelect, projects, orderedVisibleColumns, showActions, taxonomyLabels }: { claim: WarrantyClaim; onSelect: (c: WarrantyClaim) => void; projects: ProjectOption[]; orderedVisibleColumns: string[]; showActions: boolean; taxonomyLabels: TaxonomyLabels }) {
    const obraName = claim.project_id ? projects.find(p => p.id === claim.project_id)?.name : null;
    const today = new Date().toISOString().slice(0, 10);
    const slaVencido = !!(claim.sla_deadline && claim.sla_deadline < today && !['ENCERRADO', 'FORA_GARANTIA'].includes(claim.state));
    const systemName    = claim.taxonomy?.systemCode    ? taxonomyLabels.systems[claim.taxonomy.systemCode] : undefined;
    const pathologyName = claim.taxonomy?.pathologyCode ? taxonomyLabels.pathologies[claim.taxonomy.pathologyCode] : undefined;

    return (
        <tr
            className="hover:bg-blue-50/50 cursor-pointer transition-colors"
            onClick={() => onSelect(claim)}
        >
            {orderedVisibleColumns.map(key => (
                <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                    {renderClaimCell(key, claim, { obraName, slaVencido, systemName, pathologyName })}
                </td>
            ))}
            <td aria-hidden="true"></td>
            {showActions && (
                // §9.1 — a linha já abre o detalhe (ação dominante); sem duplicar como botão.
                <td className="px-6 py-2.5 text-right">
                    <ChevronRight className="w-4 h-4 text-blue-400 ml-auto" />
                </td>
            )}
        </tr>
    );
}

// ── Componente principal ──────────────────────────────────────────────────────

interface ProjectOption { id: string; name: string; }

/** code → nome legível. O chamado guarda o código; a tabela mostra o nome. */
interface TaxonomyLabels {
    systems: Record<string, string>;
    pathologies: Record<string, string>;
}
const EMPTY_TAXONOMY_LABELS: TaxonomyLabels = { systems: {}, pathologies: {} };

interface WarrantyModuleProps {
    activeOrganizationId?: string | null;
    projects?: ProjectOption[];
    onOpenClaim?: () => void;
}

const WarrantyModule: React.FC<WarrantyModuleProps> = ({ activeOrganizationId, projects = [], onOpenClaim }) => {
    const { showToast } = useToast();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();

    const [claims, setClaims]     = React.useState<WarrantyClaim[]>([]);
    const [kpis, setKpis]         = React.useState<WarrantyKPIs | null>(null);
    const [loading, setLoading]   = React.useState(true);
    const [selected, setSelected] = React.useState<WarrantyClaim | null>(null);
    const [showModal, setShowModal] = React.useState(false);
    const [createOrgId, setCreateOrgId] = React.useState<string | undefined>(undefined);
    const [filterState, setFilterState] = React.useState<ClaimState | ''>('');
    const [search, setSearch] = usePersistedState<string>('warranty:search', '');
    const [systems, setSystems] = React.useState<TaxonomySystem[]>([]);
    const [taxonomyLabels, setTaxonomyLabels] = React.useState<TaxonomyLabels>(EMPTY_TAXONOMY_LABELS);
    const tableColumns = useTableColumns(CLAIM_COLUMNS, 'warrantyClaimsColumns');
    const cols = useResizableColumns(CLAIM_COL_WIDTHS, 'warrantyClaimsColWidths');

    const handleOpenClaim = async () => {
        const target = await resolveWriteOrg('single');
        if (!target || target.kind !== 'org') return;
        const orgId = target.orgId;
        setCreateOrgId(orgId);
        setShowModal(true);
        onOpenClaim?.();
    };

    const load = React.useCallback(async () => {
        setLoading(true);
        try {
            const filters: ClaimFilters = { organization_id: activeOrganizationId ?? null };
            if (filterState) filters.state = [filterState as ClaimState];
            const [cls, kpiData] = await Promise.all([
                warrantyService.list(filters),
                warrantyService.getKPIs(activeOrganizationId ?? null),
            ]);
            setClaims(cls);
            setKpis(kpiData);
        } catch (e: unknown) {
            showToast('Erro ao carregar chamados de garantia', 'error');
            console.error('[WarrantyModule]', e);
        } finally {
            setLoading(false);
        }
    }, [activeOrganizationId, filterState, showToast]);

    React.useEffect(() => { load(); }, [load]);

    // A taxonomia é catálogo global (não tem organization_id), então carrega uma
    // vez só e não recarrega ao trocar de organização no seletor do topo.
    React.useEffect(() => {
        let cancelled = false;
        Promise.all([
            warrantyService.getTaxonomySystems(),
            warrantyService.getTaxonomyPathologies(),
        ]).then(([sys, paths]) => {
            if (cancelled) return;
            setSystems(sys);
            setTaxonomyLabels({
                systems:     Object.fromEntries(sys.map(s => [s.code, s.name])),
                pathologies: Object.fromEntries(paths.map(p => [p.code, p.name])),
            });
        }).catch(e => console.error('[WarrantyModule] taxonomia', e));
        return () => { cancelled = true; };
    }, []);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Pós-Obra & Garantia</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">
                        Gestão de chamados de assistência técnica e controle de prazos NBR 17170.
                    </p>
                </div>
                <button
                    onClick={handleOpenClaim}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                >
                    <Plus className="w-[15px] h-[15px]" />
                    Abrir Chamado
                </button>
            </div>

            {/* KPIs */}
            {kpis && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                    <KPICard label="Em Aberto"      value={kpis.total_abertos}   icon={AlertTriangle} color="bg-blue-50 text-blue-600" />
                    <KPICard label="Em Garantia"    value={kpis.em_garantia}     icon={CheckCircle}   color="bg-green-50 text-green-600" />
                    <KPICard label="Fora Garantia"  value={kpis.fora_garantia}   icon={XCircle}       color="bg-red-50 text-red-600" />
                    <KPICard label="Enc. no Mês"    value={kpis.encerrados_mes}  icon={Wrench}        color="bg-teal-50 text-teal-600" />
                    <KPICard label="NPS Médio"      value={kpis.nps_medio !== null ? kpis.nps_medio.toFixed(1) : '—'} icon={Star} color="bg-yellow-50 text-yellow-600" />
                    <KPICard label="SLA Vencidos"   value={kpis.sla_vencidos}    icon={Clock}         color={kpis.sla_vencidos > 0 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-400'} />
                    <KPICard label="Custo/Mês"      value={`R$ ${kpis.custo_total_mes.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} icon={Shield} color="bg-orange-50 text-orange-600" />
                </div>
            )}

            {/* Filtros rápidos por estado — §5 */}
            <div className="flex gap-1.5 flex-wrap">
                {(['', 'ABERTO', 'TRIAGEM', 'EM_GARANTIA', 'VISITA_AGENDADA', 'EM_REPARO', 'ENCERRADO'] as const).map(s => (
                    <button
                        key={s}
                        onClick={() => setFilterState(s)}
                        className={`h-8 px-3 rounded-[6px] text-sm font-medium transition-all ${
                            filterState === s
                                ? 'bg-blue-600 text-white'
                                : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'
                        }`}
                    >
                        {s === '' ? 'Todos' : STATE_LABELS[s as ClaimState]}
                    </button>
                ))}
            </div>

            {/* Toolbar acoplada + tabela — §5.2 */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-3 border-b border-gray-100 flex flex-col md:flex-row gap-2.5 items-center">
                    <div className="flex-1 relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar por sistema, cliente ou unidade..."
                            className="w-full h-9 pl-9 pr-4 bg-gray-50 border border-transparent rounded-[6px] text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                    </div>
                    <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                        <ColumnConfigButton
                            columns={CLAIM_COLUMNS.filter(c => c.key !== 'actions')}
                            visibleColumns={tableColumns.visibleColumns}
                            showColumnConfig={tableColumns.showColumnConfig}
                            onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                            onToggleColumn={tableColumns.toggleColumn}
                            onReset={tableColumns.resetColumns}
                        />
                        <button
                            onClick={() => cols.autoFit()}
                            className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                            title="Ajustar largura das colunas ao conteúdo"
                        >
                            <MoveHorizontal className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {(() => {
                    const term = search.trim().toLowerCase();
                    // A busca alcança a patologia pelo NOME que aparece na tela
                    // (e também pelo código, para quem já decorou "HID.VAZ").
                    const pathologyLabelOf = (c: WarrantyClaim) =>
                        (c.taxonomy?.pathologyCode ? taxonomyLabels.pathologies[c.taxonomy.pathologyCode] ?? c.taxonomy.pathologyCode : '');
                    const systemLabelOf = (c: WarrantyClaim) =>
                        (c.taxonomy?.systemCode ? taxonomyLabels.systems[c.taxonomy.systemCode] ?? c.taxonomy.systemCode : '');

                    const filteredClaims = !term ? claims : claims.filter(c =>
                        c.sistema_descricao.toLowerCase().includes(term) ||
                        (c.client_name || '').toLowerCase().includes(term) ||
                        (c.unidade_ref || '').toLowerCase().includes(term) ||
                        pathologyLabelOf(c).toLowerCase().includes(term) ||
                        systemLabelOf(c).toLowerCase().includes(term) ||
                        (c.taxonomy?.pathologyCode || '').toLowerCase().includes(term));
                    const sortKey = tableColumns.sortColumn;
                    const sortedClaims = !sortKey ? filteredClaims : [...filteredClaims].sort((a, b) => {
                        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
                        if (sortKey === 'chamado') return a.sistema_descricao.localeCompare(b.sistema_descricao) * dir;
                        if (sortKey === 'patologia') return pathologyLabelOf(a).localeCompare(pathologyLabelOf(b)) * dir;
                        if (sortKey === 'state') return a.state.localeCompare(b.state) * dir;
                        if (sortKey === 'severity') return a.severity.localeCompare(b.severity) * dir;
                        if (sortKey === 'sla_deadline') return (a.sla_deadline || '').localeCompare(b.sla_deadline || '') * dir;
                        if (sortKey === 'quality_score') return ((a.quality_score?.value ?? -1) - (b.quality_score?.value ?? -1)) * dir;
                        if (sortKey === 'created_at') return a.created_at.localeCompare(b.created_at) * dir;
                        return 0;
                    });
                    const orderedVisible = tableColumns.orderedVisibleColumns.filter(k => k !== 'actions');
                    const tableWidth = orderedVisible.reduce((s, k) => s + cols.getWidth(k), 0) + cols.getWidth('actions');

                    if (loading) {
                        return <div className="flex items-center justify-center h-32 text-sm text-gray-400">Carregando...</div>;
                    }
                    if (claims.length === 0) {
                        return (
                            <div className="flex flex-col items-center justify-center h-40 gap-2">
                                <Shield className="w-10 h-10 text-gray-200" />
                                <p className="text-sm text-gray-400 font-medium">Nenhum chamado de garantia encontrado.</p>
                                {activeOrganizationId && (
                                    <button onClick={() => setShowModal(true)} className="text-sm text-blue-600 font-medium hover:underline">
                                        Abrir primeiro chamado
                                    </button>
                                )}
                            </div>
                        );
                    }
                    if (sortedClaims.length === 0) {
                        return (
                            <div className="text-center py-12">
                                <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum chamado encontrado</h3>
                                <p className="text-sm text-gray-500">Tente ajustar sua busca ou filtro.</p>
                            </div>
                        );
                    }
                    return (
                        <div className="overflow-x-auto">
                            <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableWidth }}>
                                <colgroup>
                                    {orderedVisible.map(key => <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />)}
                                    <col />
                                    <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                                </colgroup>
                                <thead>
                                    <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        {orderedVisible.map(key => {
                                            const def = CLAIM_COLUMN_HEADERS[key];
                                            if (!def) return null;
                                            return (
                                                <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                    onSort={tableColumns.handleColumnSort}
                                                    onMoveColumn={tableColumns.moveColumn}
                                                    className={def.className}>
                                                    <cols.ResizeHandle colKey={key} />
                                                </SortableHeader>
                                            );
                                        })}
                                        <th aria-hidden="true" className="border-r border-gray-100" />
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {sortedClaims.map(c => (
                                        <ClaimRow key={c.id} claim={c} onSelect={setSelected} projects={projects} orderedVisibleColumns={orderedVisible} showActions={tableColumns.visibleColumns.includes('actions')} taxonomyLabels={taxonomyLabels} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                })()}
            </div>

            {/* Modal novo chamado */}
            {showModal && createOrgId && (
                <WarrantyClaimModal
                    organizationId={createOrgId}
                    projects={projects}
                    systems={systems}
                    onClose={() => setShowModal(false)}
                    onSaved={() => { setShowModal(false); load(); }}
                />
            )}

            {orgTargetModal}

            {/* Detalhe do chamado — nunca bloquear a leitura por causa de "Todas as organizações";
                a organização do próprio chamado já resolve o escopo. */}
            {selected && (
                <WarrantyClaimDetail
                    claim={selected}
                    organizationId={activeOrganizationId || selected.organization_id}
                    projects={projects}
                    systems={systems}
                    taxonomyLabels={taxonomyLabels}
                    onClose={() => setSelected(null)}
                    onRefresh={() => { load(); setSelected(null); }}
                />
            )}
        </div>
    );
};

// ── Modal: Abrir Chamado ──────────────────────────────────────────────────────

interface WarrantyClaimModalProps {
    organizationId: string;
    projects?: ProjectOption[];
    systems?: TaxonomySystem[];
    initialClaimId?: string;
    onClose: () => void;
    onSaved: () => void;
}

const MAX_EVIDENCE_FILES = 5;

export function WarrantyClaimModal({
    organizationId, projects = [], systems: systemsProp, onClose, onSaved,
}: WarrantyClaimModalProps) {
    const { showToast } = useToast();
    const [terms, setTerms] = React.useState<import('../types/warranty').WarrantyTerm[]>([]);
    const [systems, setSystems] = React.useState<TaxonomySystem[]>(systemsProp ?? []);
    const [submitting, setSubmitting] = React.useState(false);
    const [files, setFiles] = React.useState<File[]>([]);
    const [form, setForm] = React.useState({
        project_id: '',
        sistema_descricao: '',
        local_afetado: '',
        descricao: '',
        severity: 'media' as const,
        warranty_term_code: '',
        client_name: '',
        unidade_ref: '',
        system_code: '',
        pathology_code: '',
        origin: 'indeterminada' as ClaimOrigin,
    });

    React.useEffect(() => {
        warrantyService.getTerms().then(setTerms).catch(console.error);
        // Só busca se o pai não mandou — o modal também é aberto de fora do módulo.
        if (!systemsProp || systemsProp.length === 0) {
            warrantyService.getTaxonomySystems().then(setSystems).catch(console.error);
        }
    }, [systemsProp]);

    const addFiles = (selected: File[]) => {
        setFiles(prev => {
            const room = MAX_EVIDENCE_FILES - prev.length;
            if (room <= 0) {
                showToast(`Máximo de ${MAX_EVIDENCE_FILES} arquivos por chamado`, 'error');
                return prev;
            }
            return [...prev, ...selected.slice(0, room)];
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        if (!form.sistema_descricao || !form.descricao) {
            showToast('Preencha o sistema afetado e a descrição', 'error');
            return;
        }
        setSubmitting(true);
        try {
            const { id: claimId } = await warrantyService.open({
                organization_id:    organizationId,
                project_id:         form.project_id || undefined,
                sistema_descricao:  form.sistema_descricao,
                local_afetado:      form.local_afetado || undefined,
                descricao:          form.descricao,
                severity:           form.severity,
                warranty_term_code: form.warranty_term_code || undefined,
                client_name:        form.client_name || undefined,
                unidade_ref:        form.unidade_ref || undefined,
                opened_by:          { actorId: 'system', actorType: 'user', name: 'Usuário' },
                taxonomy:           form.system_code
                    ? {
                        systemCode:    form.system_code,
                        pathologyCode: form.pathology_code || undefined,
                        normRef:       systems.find(s => s.code === form.system_code)?.normRef,
                      }
                    : undefined,
                origin:             form.origin,
            });

            // As fotos vão DEPOIS do chamado existir (a evidência referencia o
            // claim_id). O chamado já está aberto: uma falha de upload não pode
            // apagá-lo — avisa e segue, o anexo pode ser refeito no detalhe.
            if (files.length > 0) {
                const results = await Promise.allSettled(files.map(f =>
                    warrantyService.uploadEvidence(
                        organizationId, claimId, f,
                        { actorId: 'system', actorType: 'user', name: 'Usuário' },
                    )));
                const falhas = results.filter(r => r.status === 'rejected').length;
                if (falhas > 0) {
                    showToast(`Chamado aberto, mas ${falhas} de ${files.length} arquivo(s) não subiram`, 'error');
                    onSaved();
                    return;
                }
            }

            showToast('Chamado aberto com sucesso', 'success');
            onSaved();
        } catch (e: unknown) {
            showToast('Erro ao abrir chamado', 'error');
            console.error('[WarrantyModal]', e);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-lg font-black text-gray-900">Abrir Chamado de Garantia</h2>
                    <Button onClick={onClose} variant="ghost" size="icon">✕</Button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-form-label font-bold text-gray-600 mb-1">Obra</label>
                            <select
                                value={form.project_id}
                                onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                            >
                                <option value="">Selecionar obra...</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="block text-form-label font-bold text-gray-600 mb-1">Sistema afetado *</label>
                            <input
                                value={form.sistema_descricao}
                                onChange={e => setForm(f => ({ ...f, sistema_descricao: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                                placeholder="Ex: Impermeabilização da laje de cobertura"
                                required
                            />
                        </div>
                        <TaxonomyPicker
                            systems={systems}
                            systemCode={form.system_code}
                            pathologyCode={form.pathology_code}
                            onChange={({ systemCode, pathologyCode, system }) => setForm(f => ({
                                ...f,
                                system_code: systemCode,
                                pathology_code: pathologyCode,
                                // O sistema construtivo sugere o prazo NBR 17170 —
                                // mas nunca sobrescreve uma escolha já feita à mão.
                                warranty_term_code: f.warranty_term_code || system?.warrantyTermCode || '',
                            }))}
                        />
                        <div>
                            <label className="block text-form-label font-bold text-gray-600 mb-1">Prazo de garantia</label>
                            <select
                                value={form.warranty_term_code}
                                onChange={e => setForm(f => ({ ...f, warranty_term_code: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                            >
                                <option value="">Selecionar...</option>
                                {terms.map(t => (
                                    <option key={t.code} value={t.code}>{t.descricao} ({t.prazo_meses} m)</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-form-label font-bold text-gray-600 mb-1">Origem provável</label>
                            <select
                                value={form.origin}
                                onChange={e => setForm(f => ({ ...f, origin: e.target.value as ClaimOrigin }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                            >
                                {(Object.keys(ORIGIN_LABELS) as ClaimOrigin[]).map(o => (
                                    <option key={o} value={o}>{ORIGIN_LABELS[o]}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-form-label font-bold text-gray-600 mb-1">Severidade</label>
                            <select
                                value={form.severity}
                                onChange={e => setForm(f => ({ ...f, severity: e.target.value as typeof f.severity }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                            >
                                <option value="baixa">Baixa</option>
                                <option value="media">Média</option>
                                <option value="alta">Alta</option>
                                <option value="critica">Crítica</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-form-label font-bold text-gray-600 mb-1">Local / Cômodo</label>
                            <input
                                value={form.local_afetado}
                                onChange={e => setForm(f => ({ ...f, local_afetado: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                                placeholder="Ex: Banheiro suíte"
                            />
                        </div>
                        <div>
                            <label className="block text-form-label font-bold text-gray-600 mb-1">Unidade / Apt</label>
                            <input
                                value={form.unidade_ref}
                                onChange={e => setForm(f => ({ ...f, unidade_ref: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                                placeholder="Ex: Apt 302 Torre A"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-form-label font-bold text-gray-600 mb-1">Nome do cliente</label>
                            <input
                                value={form.client_name}
                                onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                                placeholder="Nome do proprietário/cliente"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-form-label font-bold text-gray-600 mb-1">Descrição do problema *</label>
                            <textarea
                                value={form.descricao}
                                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                                rows={4}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
                                placeholder="Descreva detalhadamente o problema relatado..."
                                required
                            />
                        </div>

                        {/* Evidência fotográfica — o módulo de Garantia não tinha
                            anexo na abertura; veio da consolidação de 2026-08-26.
                            Sem foto, a perícia de responsabilidade meses depois
                            não tem em que se apoiar. */}
                        <div className="col-span-2">
                            <label className="block text-form-label font-bold text-gray-600 mb-1">
                                Fotos e documentos
                                <span className="font-normal text-gray-400"> · até {MAX_EVIDENCE_FILES}</span>
                            </label>
                            <label className="flex items-center justify-center gap-2 h-20 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition-colors">
                                <Upload className="w-4 h-4 text-gray-400" />
                                <span className="text-sm text-gray-500">
                                    {files.length >= MAX_EVIDENCE_FILES ? 'Limite atingido' : 'Clique para anexar'}
                                </span>
                                <input
                                    type="file"
                                    multiple
                                    accept="image/*,video/*,application/pdf"
                                    disabled={files.length >= MAX_EVIDENCE_FILES}
                                    onChange={e => {
                                        addFiles(Array.from(e.target.files ?? []));
                                        e.target.value = '';   // permite reescolher o mesmo arquivo
                                    }}
                                    className="hidden"
                                />
                            </label>
                            {files.length > 0 && (
                                <ul className="mt-2 space-y-1">
                                    {files.map((f, i) => (
                                        <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
                                            <span className="text-xs text-gray-600 truncate">{f.name}</span>
                                            <button
                                                type="button"
                                                onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                                                className="p-1 text-gray-400 hover:text-red-600 transition-colors flex-shrink-0"
                                                title="Remover arquivo"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" onClick={onClose} variant="ghost">
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={submitting}
                            variant="primary"
                        >
                            {submitting ? 'Abrindo...' : 'Abrir Chamado'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ── Detalhe do Chamado ────────────────────────────────────────────────────────

interface WarrantyClaimDetailProps {
    claim: WarrantyClaim;
    organizationId: string;
    projects?: ProjectOption[];
    systems?: TaxonomySystem[];
    taxonomyLabels?: TaxonomyLabels;
    onClose: () => void;
    onRefresh: () => void;
}

export const WarrantyClaimDetail: React.FC<WarrantyClaimDetailProps> = ({
    claim, organizationId, projects = [], systems = [], taxonomyLabels = EMPTY_TAXONOMY_LABELS,
    onClose, onRefresh,
}) => {
    const obraName = claim.project_id ? projects.find(p => p.id === claim.project_id)?.name : null;
    const { showToast } = useToast();
    const confirm = useConfirm();
    const [events, setEvents] = React.useState<import('../types/warranty').WarrantyClaimEvent[]>([]);
    const [visits, setVisits] = React.useState<import('../types/warranty').WarrantyClaimVisit[]>([]);
    const [tab, setTab] = React.useState<'info' | 'visitas' | 'historico'>('info');
    const [triaging, setTriaging] = React.useState(false);
    const [closing, setClosing] = React.useState(false);
    const [npsNota, setNpsNota] = React.useState<number | ''>('');
    const [editMode, setEditMode] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);
    const [classifying, setClassifying] = React.useState(false);
    const [savingClass, setSavingClass] = React.useState(false);
    const [classForm, setClassForm] = React.useState({
        system_code:    claim.taxonomy?.systemCode ?? '',
        pathology_code: claim.taxonomy?.pathologyCode ?? '',
        origin:         (claim.origin ?? 'indeterminada') as ClaimOrigin,
    });
    const [legacyEvidence, setLegacyEvidence] = React.useState<
        { id: string; type: string; url: string; capturedAt: string }[]
    >([]);
    const [editForm, setEditForm] = React.useState({
        sistema_descricao: claim.sistema_descricao,
        local_afetado:     claim.local_afetado || '',
        descricao:         claim.descricao,
        severity:          claim.severity as string,
        client_name:       claim.client_name || '',
        unidade_ref:       claim.unidade_ref || '',
        project_id:        claim.project_id || '',
    });

    React.useEffect(() => {
        warrantyService.getEvents(claim.id).then(setEvents).catch(console.error);
        if (claim.visits) setVisits(claim.visits);

        // Chamado nascido da consolidação de 2026-08-26: as fotos ficaram no
        // bucket `condition-evidence`, lidas de lá em vez de copiadas.
        if (claim.source_condition_id) {
            warrantyService.getLegacyConditionEvidence(claim.source_condition_id)
                .then(setLegacyEvidence)
                .catch(e => console.error('[LegacyEvidence]', e));
        } else {
            setLegacyEvidence([]);
        }
    }, [claim]);

    const handleClassify = async () => {
        if (savingClass || !classForm.system_code) return;
        setSavingClass(true);
        try {
            await warrantyService.classify({
                claim_id:         claim.id,
                organization_id:  organizationId,
                expected_version: claim.version,
                taxonomy: {
                    systemCode:    classForm.system_code,
                    pathologyCode: classForm.pathology_code || undefined,
                    normRef:       systems.find(s => s.code === classForm.system_code)?.normRef,
                },
                origin: classForm.origin,
                actor:  { actorId: 'system', actorType: 'user', name: 'Usuário' },
            });
            showToast('Chamado classificado', 'success');
            setClassifying(false);
            onRefresh();
        } catch (e: unknown) {
            showToast('Erro ao classificar chamado', 'error');
            console.error('[ClassifyClaim]', e);
        } finally {
            setSavingClass(false);
        }
    };

    const handleSave = async () => {
        if (saving) return;
        setSaving(true);
        try {
            await warrantyService.update(claim.id, organizationId, {
                sistema_descricao: editForm.sistema_descricao,
                local_afetado:     editForm.local_afetado || undefined,
                descricao:         editForm.descricao,
                severity:          editForm.severity as WarrantyClaim['severity'],
                client_name:       editForm.client_name || undefined,
                unidade_ref:       editForm.unidade_ref || undefined,
                project_id:        editForm.project_id || undefined,
            });
            showToast('Chamado atualizado', 'success');
            setEditMode(false);
            onRefresh();
        } catch (e: unknown) {
            showToast('Erro ao salvar chamado', 'error');
            console.error('[EditClaim]', e);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (deleting) return;
        if (!await confirm({
            title: 'Excluir chamado?',
            message: 'Esta ação não pode ser desfeita. Todo o histórico e evidências serão removidos.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        })) return;
        setDeleting(true);
        try {
            await warrantyService.delete(claim.id, organizationId);
            showToast('Chamado excluído', 'success');
            onRefresh();
        } catch (e: unknown) {
            showToast('Erro ao excluir chamado', 'error');
            console.error('[DeleteClaim]', e);
        } finally {
            setDeleting(false);
        }
    };

    const handleTriage = async (inWarranty: boolean) => {
        if (triaging) return;
        setTriaging(true);
        try {
            const today = new Date();
            const term = claim.warranty_term;
            let expires: string | undefined;
            if (inWarranty && term) {
                const exp = new Date(today);
                exp.setMonth(exp.getMonth() + term.prazo_meses);
                expires = exp.toISOString().slice(0, 10);
            }
            const sla = new Date(today);
            sla.setDate(sla.getDate() + (claim.severity === 'critica' ? 2 : claim.severity === 'alta' ? 5 : 15));

            await warrantyService.triage({
                claim_id: claim.id,
                organization_id: organizationId,
                expected_version: claim.version,
                in_warranty: inWarranty,
                warranty_expires_at: expires,
                sla_deadline: sla.toISOString().slice(0, 10),
                fora_garantia_motivo: inWarranty ? undefined : 'Prazo de garantia expirado',
                triaged_by: { actorId: 'system', actorType: 'user', name: 'Usuário' },
            });
            showToast(inWarranty ? 'Chamado em garantia' : 'Chamado fora de garantia', 'success');
            onRefresh();
        } catch (e: unknown) {
            showToast('Erro na triagem', 'error');
            console.error('[Triage]', e);
        } finally {
            setTriaging(false);
        }
    };

    const handleClose = async () => {
        if (closing || npsNota === '') return;
        setClosing(true);
        try {
            await warrantyService.close({
                claim_id: claim.id,
                organization_id: organizationId,
                expected_version: claim.version,
                nps_nota: Number(npsNota),
                closed_by: { actorId: 'system', actorType: 'user', name: 'Usuário' },
            });
            showToast('Chamado encerrado', 'success');
            onRefresh();
        } catch (e: unknown) {
            showToast('Erro ao encerrar chamado', 'error');
            console.error('[CloseWarranty]', e);
        } finally {
            setClosing(false);
        }
    };

    const EVENT_LABELS: Record<string, string> = {
        ClaimOpened:   'Chamado aberto',
        ClaimClassified: 'Classificação atualizada',
        ClaimTriaged:  'Triagem realizada',
        VisitScheduled:'Visita agendada',
        ClaimClosed:   'Chamado encerrado',
        ClaimMigratedFromCondition: 'Migrado de Qualidade & Entrega',
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white w-full md:max-w-2xl md:rounded-2xl shadow-2xl max-h-[95vh] flex flex-col">
                {/* Header */}
                <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-normal ${STATE_COLORS[claim.state]}`}>
                                {STATE_LABELS[claim.state]}
                            </span>
                            <span className="text-gray-300">·</span>
                            <span className={`text-sm font-normal capitalize ${SEVERITY_COLORS[claim.severity]}`}>
                                {claim.severity}
                            </span>
                        </div>
                        <h2 className="text-base font-black text-gray-900 mt-1 truncate">{claim.sistema_descricao}</h2>
                        <p className="text-xs text-gray-400">{claim.client_name || 'Cliente não informado'} · {claim.unidade_ref || '—'}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <ActionIconButton
                            kind="edit"
                            onClick={() => { setEditMode(e => !e); setTab('info'); }}
                            title="Editar chamado"
                            aria-pressed={editMode}
                        />
                        <ActionIconButton
                            kind="delete"
                            disabled={deleting}
                            onClick={() => { setEditMode(false); void handleDelete(); }}
                            title="Excluir chamado"
                        />
                        <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors ml-1">✕</button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 px-6 pt-3 border-b border-gray-100">
                    {(['info', 'visitas', 'historico'] as const).map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`px-3 py-1.5 text-button font-bold rounded-t-lg transition-colors capitalize ${
                                tab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-700'
                            }`}
                        >
                            {t === 'historico' ? 'Histórico' : t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {tab === 'info' && editMode && (
                        <div className="space-y-3">
                            <p className="text-xs font-black text-blue-700 uppercase tracking-wider">Editando chamado</p>
                            {projects.length > 0 && (
                                <div>
                                    <label className="block text-form-label font-bold text-gray-600 mb-1">Obra</label>
                                    <select
                                        value={editForm.project_id}
                                        onChange={e => setEditForm(f => ({ ...f, project_id: e.target.value }))}
                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                                    >
                                        <option value="">Sem obra vinculada</option>
                                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1">Sistema afetado *</label>
                                <input
                                    value={editForm.sistema_descricao}
                                    onChange={e => setEditForm(f => ({ ...f, sistema_descricao: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-form-label font-bold text-gray-600 mb-1">Severidade</label>
                                    <select
                                        value={editForm.severity}
                                        onChange={e => setEditForm(f => ({ ...f, severity: e.target.value }))}
                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                                    >
                                        <option value="baixa">Baixa</option>
                                        <option value="media">Média</option>
                                        <option value="alta">Alta</option>
                                        <option value="critica">Crítica</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-form-label font-bold text-gray-600 mb-1">Local / Cômodo</label>
                                    <input
                                        value={editForm.local_afetado}
                                        onChange={e => setEditForm(f => ({ ...f, local_afetado: e.target.value }))}
                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-form-label font-bold text-gray-600 mb-1">Nome do cliente</label>
                                    <input
                                        value={editForm.client_name}
                                        onChange={e => setEditForm(f => ({ ...f, client_name: e.target.value }))}
                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-form-label font-bold text-gray-600 mb-1">Unidade / Apt</label>
                                    <input
                                        value={editForm.unidade_ref}
                                        onChange={e => setEditForm(f => ({ ...f, unidade_ref: e.target.value }))}
                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1">Descrição do problema *</label>
                                <textarea
                                    value={editForm.descricao}
                                    onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))}
                                    rows={4}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
                                    required
                                />
                            </div>
                            <div className="flex gap-2 pt-1">
                                <Button
                                    onClick={handleSave}
                                    disabled={saving || !editForm.sistema_descricao || !editForm.descricao}
                                    variant="primary"
                                    className="flex-1"
                                >
                                    {saving ? 'Salvando...' : 'Salvar alterações'}
                                </Button>
                                <Button
                                    onClick={() => setEditMode(false)}
                                    variant="secondary"
                                >
                                    Cancelar
                                </Button>
                            </div>
                        </div>
                    )}

                    {tab === 'info' && !editMode && (
                        <>
                            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                                {obraName && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500 font-medium">Obra</span>
                                        <span className="text-blue-600 font-semibold">{obraName}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-gray-500 font-medium">Local afetado</span>
                                    <span className="text-gray-900 font-semibold">{claim.local_afetado || '—'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500 font-medium">Garantia expira</span>
                                    <span className="text-gray-900 font-semibold">
                                        {claim.warranty_expires_at
                                            ? new Date(claim.warranty_expires_at + 'T00:00:00').toLocaleDateString('pt-BR')
                                            : '—'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500 font-medium">SLA</span>
                                    <span className="text-gray-900 font-semibold">
                                        {claim.sla_deadline
                                            ? new Date(claim.sla_deadline + 'T00:00:00').toLocaleDateString('pt-BR')
                                            : '—'}
                                    </span>
                                </div>
                                {claim.responsible_party && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500 font-medium">Responsabilidade</span>
                                        <span className="text-gray-900 font-semibold capitalize">{claim.responsible_party.replace('_', ' ')}</span>
                                    </div>
                                )}
                            </div>
                            <div>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Descrição do problema</p>
                                <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-4 whitespace-pre-wrap">{claim.descricao}</p>
                            </div>

                            {/* Classificação — taxonomia controlada + origem + nota do registro */}
                            <div className="border border-gray-100 rounded-xl p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Classificação</p>
                                    {!classifying && (
                                        <button
                                            onClick={() => setClassifying(true)}
                                            className="text-button text-blue-600 font-medium hover:underline"
                                        >
                                            {claim.taxonomy?.systemCode ? 'Alterar' : 'Classificar'}
                                        </button>
                                    )}
                                </div>

                                {classifying ? (
                                    <div className="space-y-3">
                                        <TaxonomyPicker
                                            systems={systems}
                                            systemCode={classForm.system_code}
                                            pathologyCode={classForm.pathology_code}
                                            onChange={({ systemCode, pathologyCode }) => setClassForm(f => ({
                                                ...f, system_code: systemCode, pathology_code: pathologyCode,
                                            }))}
                                        />
                                        <div>
                                            <label className="block text-form-label font-bold text-gray-600 mb-1">Origem provável</label>
                                            <select
                                                value={classForm.origin}
                                                onChange={e => setClassForm(f => ({ ...f, origin: e.target.value as ClaimOrigin }))}
                                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                                            >
                                                {(Object.keys(ORIGIN_LABELS) as ClaimOrigin[]).map(o => (
                                                    <option key={o} value={o}>{ORIGIN_LABELS[o]}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                onClick={handleClassify}
                                                disabled={savingClass || !classForm.system_code}
                                                variant="primary"
                                                className="flex-1"
                                            >
                                                {savingClass ? 'Salvando...' : 'Salvar classificação'}
                                            </Button>
                                            <Button onClick={() => setClassifying(false)} variant="secondary">Cancelar</Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-gray-500 font-medium">Sistema</span>
                                            <span className="text-gray-900 font-semibold">
                                                {claim.taxonomy?.systemCode
                                                    ? (taxonomyLabels.systems[claim.taxonomy.systemCode] ?? claim.taxonomy.systemCode)
                                                    : 'Não classificado'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500 font-medium">Patologia</span>
                                            <span className="text-gray-900 font-semibold">
                                                {claim.taxonomy?.pathologyCode
                                                    ? (taxonomyLabels.pathologies[claim.taxonomy.pathologyCode] ?? claim.taxonomy.pathologyCode)
                                                    : '—'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500 font-medium">Origem provável</span>
                                            <span className="text-gray-900 font-semibold">
                                                {claim.origin ? ORIGIN_LABELS[claim.origin] : '—'}
                                            </span>
                                        </div>
                                        {claim.taxonomy?.normRef && (
                                            <div className="flex justify-between">
                                                <span className="text-gray-500 font-medium">Norma</span>
                                                <span className="text-gray-900 font-semibold">{claim.taxonomy.normRef}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center gap-4 pt-1 border-t border-gray-100">
                                            <span className="text-gray-500 font-medium" title="Mede a qualidade do REGISTRO (descrição, local, unidade, prazo, foto, patologia) — não a do serviço prestado.">
                                                Qualidade do registro
                                            </span>
                                            <div className="w-32">
                                                <QualityScoreBar score={claim.quality_score?.value} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Evidências herdadas da condição de origem (chamados migrados) */}
                            {claim.source_condition_id && legacyEvidence.length > 0 && (
                                <div className="border border-amber-100 bg-amber-50/40 rounded-xl p-4 space-y-3">
                                    <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                                        Evidências do registro de origem
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        Este chamado veio do módulo Qualidade &amp; Entrega. As evidências
                                        continuam no acervo original.
                                    </p>
                                    <div className="grid grid-cols-3 gap-2">
                                        {legacyEvidence.map(ev => (
                                            <a
                                                key={ev.id}
                                                href={ev.url || undefined}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block rounded-lg overflow-hidden border border-amber-200 bg-white aspect-square"
                                                title={new Date(ev.capturedAt).toLocaleString('pt-BR')}
                                            >
                                                {ev.type === 'photo' && ev.url ? (
                                                    <img src={ev.url} alt="Evidência" className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="flex items-center justify-center h-full text-xs text-gray-400">
                                                        {ev.type}
                                                    </span>
                                                )}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Ações contextuais */}
                            {claim.state === 'ABERTO' && (
                                <div className="border border-blue-100 rounded-xl p-4 space-y-3">
                                    <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">Triagem</p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleTriage(true)}
                                            disabled={triaging}
                                            className="flex-1 py-2 bg-green-600 text-white rounded-xl text-button font-black hover:bg-green-700 transition-all disabled:opacity-60"
                                        >
                                            ✓ Em Garantia
                                        </button>
                                        <Button
                                            onClick={() => handleTriage(false)}
                                            disabled={triaging}
                                            variant="danger"
                                            className="flex-1"
                                        >
                                            ✗ Fora de Garantia
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {['EM_REPARO', 'CONCLUIDO'].includes(claim.state) && (
                                <div className="border border-teal-100 rounded-xl p-4 space-y-3">
                                    <p className="text-xs font-bold text-teal-700 uppercase tracking-wider">Encerrar Chamado</p>
                                    <div>
                                        <label className="text-form-label font-semibold text-gray-600 block mb-1">Nota NPS do cliente (0-10)</label>
                                        <input
                                            type="number" min={0} max={10}
                                            value={npsNota}
                                            onChange={e => setNpsNota(e.target.value === '' ? '' : Number(e.target.value))}
                                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
                                        />
                                    </div>
                                    <button
                                        onClick={handleClose}
                                        disabled={closing || npsNota === ''}
                                        className="w-full py-2 bg-teal-600 text-white rounded-xl text-button font-black hover:bg-teal-700 transition-all disabled:opacity-60"
                                    >
                                        {closing ? 'Encerrando...' : 'Encerrar Chamado'}
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {tab === 'visitas' && (
                        <div className="space-y-3">
                            {visits.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-8">Nenhuma visita registrada.</p>
                            ) : visits.map(v => (
                                <div key={v.id} className="bg-gray-50 rounded-xl p-4 text-sm">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-bold text-gray-900">{v.technician_name}</span>
                                        <span className={`text-xs font-normal ${
                                            v.status === 'REALIZADA' ? 'text-green-700' :
                                            v.status === 'CANCELADA' ? 'text-red-700' :
                                            'text-blue-700'
                                        }`}>{v.status}</span>
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        {new Date(v.scheduled_at).toLocaleString('pt-BR')}
                                    </p>
                                    {v.diagnostico && (
                                        <p className="text-xs text-gray-700 mt-2 bg-white rounded-lg p-2">{v.diagnostico}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {tab === 'historico' && (
                        <div className="space-y-2">
                            {events.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-8">Sem eventos.</p>
                            ) : events.map(ev => (
                                <div key={ev.event_id} className="flex items-start gap-3 text-sm">
                                    <div className="w-2 h-2 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                                    <div>
                                        <span className="font-semibold text-gray-900">
                                            {EVENT_LABELS[ev.event_type] || ev.event_type}
                                        </span>
                                        <span className="text-gray-400 text-xs ml-2">
                                            {new Date(ev.occurred_at).toLocaleString('pt-BR')}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WarrantyModule;
