import React from 'react';
import { Plus, LayoutGrid, List, Search, Eye, EyeOff, MapPin, Building2, TrendingUp, BarChart3 } from 'lucide-react';
import {
    InvestorOpportunity, OpportunityStatus,
    OPPORTUNITY_STATUS_LABELS, OPPORTUNITY_STATUS_TEXT,
    OPPORTUNITY_TYPE_LABELS,
    investorPortalService,
} from '../../services/investorPortalService';
import OpportunityForm from './OpportunityForm';
import PortalOportunidadeDetalhe, { type AbaDoDetalhe } from './portal/PortalOportunidadeDetalhe';
import { naVitrine, type OportunidadeNaVitrine } from '../../utils/oportunidadeNumerosDaVersao';
import { fmtPct } from '../../utils/format';
import InterestsPanel from './InterestsPanel';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { KpiCard } from '../ui/KpiCard';
import { TabsBar } from '../ui/TabsBar';
import { FilterPopover } from '../ui/FilterPopover';
import { normalizarTexto } from '../ui/FilterUtils';
import ActionIconButton from '../ui/ActionIconButton';
import Button from '../ui/Button';
import { usePersistedState } from '../ui/TableUtils';
import { useOrgWriteTarget } from '../../hooks/useOrgContext';
import { useToast } from '../../hooks/useToast';

/**
 * Lista de oportunidades — Incorporação › Oportunidades (gestor, com `titulo`) e, só leitura, a aba Oportunidades
 * do painel do investidor. No padrão do app (docs/ui_ux_guia_unificado.md; 25/11/2026, pedido do usuário: "os
 * dashcards, titulo, fonts alias tudo na tela não esta no padrao do app"): título §20, abas §19.1, KpiCard §4,
 * StandardTable §6.10 com busca e filtro de status §5.4, grade/lista §5.1.
 */
interface Props {
    opportunities: InvestorOpportunity[];
    isAdmin: boolean;
    /** A org do topo; `null` = "Todas" (REGRA #5). Só filtra leitura: criar e editar usam a org resolvida. */
    organizationId?: string | null;
    /** Título da tela (§20). Só quando a lista É a tela (Incorporação › Oportunidades); dentro do painel do
     *  investidor o título é o do painel. */
    titulo?: string;
    loading?: boolean;
    onDelete: (id: string) => void;
    onUpdate: (updated: InvestorOpportunity) => void;
    openConfirm: (msg: string, onConfirm: () => void) => void;
}

const fmtBRL = (v: number | null | undefined) => {
    if (v == null) return null;
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
};

type AdminTab = 'opportunities' | 'interests';
type Modo = 'grid' | 'list';

const ORDEM_DO_STATUS = Object.keys(OPPORTUNITY_STATUS_LABELS) as OpportunityStatus[];
// §5.5: as opções saem do mapa de rótulos (um status novo entra sozinho).
const OPCOES_DE_STATUS: { value: OpportunityStatus | ''; label: string }[] = [
    { value: '', label: 'Todos' },
    ...ORDEM_DO_STATUS.map(s => ({ value: s, label: OPPORTUNITY_STATUS_LABELS[s] })),
];

// §6.3: ROI e TIR eram uma célula só ("39,2% / 19,0%"), que não ordenava — agora uma coluna cada.
const COLUNAS: StandardTableColumn[] = [
    { key: 'oportunidade', label: 'Oportunidade', sortable: true, width: 300 },
    { key: 'status', label: 'Status', sortable: true, width: 170 },
    { key: 'vgv', label: 'VGV', sortable: true, width: 130, align: 'right' },
    { key: 'roi', label: 'ROI', sortable: true, width: 100, align: 'right' },
    { key: 'tir', label: 'TIR', sortable: true, width: 100, align: 'right' },
    { key: 'local', label: 'Local', sortable: true, width: 180 },
];

const localDe = (op: OportunidadeNaVitrine) => [op.cidade, op.uf].filter(Boolean).join(', ');
const textoDeBusca = (op: OportunidadeNaVitrine) => [
    op.title, op.subtitle, localDe(op),
    op.status ? OPPORTUNITY_STATUS_LABELS[op.status] : '',
    op.opportunity_type ? OPPORTUNITY_TYPE_LABELS[op.opportunity_type] : '',
].filter(Boolean).join(' ');
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const OpportunitiesTab: React.FC<Props> = ({
    opportunities, isAdmin, organizationId, titulo, loading = false,
    onDelete, onUpdate, openConfirm,
}) => {
    const [detail, setDetail] = React.useState<InvestorOpportunity | null>(null);
    const [abaDoDetalhe, setAbaDoDetalhe] = React.useState<AbaDoDetalhe>('apresentacao');
    const [editing, setEditing] = React.useState<InvestorOpportunity | null | 'new'>(null);
    const [saving, setSaving] = React.useState(false);
    const [adminTab, setAdminTab] = React.useState<AdminTab>('opportunities');
    // §3: busca, recorte e modo sobrevivem a navegação e recarga.
    const [busca, setBusca] = usePersistedState<string>('oportunidades:busca', '');
    const [filtroStatus, setFiltroStatus] = usePersistedState<OpportunityStatus | ''>('oportunidades:status', '');
    const [modo, setModo] = usePersistedState<Modo>('oportunidades:modo', 'list');
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const { showToast } = useToast();
    const [createOrgId, setCreateOrgId] = React.useState<string | undefined>(undefined);


    // Criar: a org resolvida em handleNew (o topo, ou a escolhida no modal com o topo em "Todas").
    // Editar: a org da PRÓPRIA oportunidade. Nunca a prop: em 22/11/2026 ela vinha com a org da obra
    // carregada e passava por cima da escolhida no modal (plano 2026-11-22-investidor-org-do-topo).
    const editingOrganizationId =
        editing === 'new' ? createOrgId : editing?.organization_id;

    const handleNew = async () => {
        const target = await resolveWriteOrg('single');
        if (!target || target.kind !== 'org') return;
        const orgId = target.orgId;
        setCreateOrgId(orgId);
        setEditing('new');
    };

    const handleSave = async (data: Omit<InvestorOpportunity, 'id' | 'created_at'>) => {
        if (!editingOrganizationId) return;
        setSaving(true);
        try {
            if (editing === 'new') {
                onUpdate(await investorPortalService.addOpportunity(data));
            } else if (editing && editing.id) {
                const saved = await investorPortalService.updateOpportunity(editing.id, data);
                onUpdate(saved);
                if (detail && detail.id === editing.id) setDetail(saved);
            }

            setEditing(null);
            setCreateOrgId(undefined);
        } catch (err) {
            console.error('Erro ao salvar oportunidade', err);
            // O banco explica por que recusou (publicar sem estudo/versão, parecer "Reprovar"...).
            showToast(`Não foi possível salvar: ${(err as { message?: string })?.message ?? 'tente novamente'}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    // Plano 2026-11-15, Fase 2: com estudo do Imovib, publicar exige a versão que o investidor vê.
    // Fase 2 do plano 2026-11-21: publicar exige estudo + versão (o banco confere o mesmo e também o parecer).
    const motivoParaNaoPublicar = (op: InvestorOpportunity) =>
        op.is_published ? null
            : !op.imovib_study_id ? 'Vincule antes, em Editar, o estudo do Imovib: o investidor só vê números da versão congelada.'
                : !op.imovib_version_id ? 'Escolha antes, em Editar, a versão do estudo que o investidor vai ver.'
                    : null;
    const tituloDoPublicar = (op: InvestorOpportunity) =>
        motivoParaNaoPublicar(op) ?? (op.is_published ? 'Despublicar' : 'Publicar');

    const handleTogglePublish = async (op: InvestorOpportunity) => {
        if (!op.id) return;
        const motivo = motivoParaNaoPublicar(op);
        if (motivo) {
            showToast(motivo, 'error');
            editar(op);
            return;
        }
        try {
            const saved = await investorPortalService.updateOpportunity(op.id, { is_published: !op.is_published });
            onUpdate(saved);
            if (detail && detail.id === op.id) {
                setDetail(saved);
            }
        } catch (err) {
            console.error('Erro ao publicar', err);
            showToast(`Não foi possível ${op.is_published ? 'despublicar' : 'publicar'}: ${(err as Error).message}`, 'error');
        }
    };

    const visibleOpportunities = React.useMemo(
        () => (isAdmin ? opportunities : opportunities.filter(o => o.is_published)),
        [isAdmin, opportunities],
    );
    // Números exibidos: só os da versão do Imovib (utils/oportunidadeNumerosDaVersao.ts, naVitrine).
    // Editar abre a ORIGINAL: o formulário mostra e grava só os campos digitados à mão.
    const exibidas = React.useMemo(() => visibleOpportunities.map(naVitrine), [visibleOpportunities]);
    // Recorte de status antes da tabela (a busca o StandardTable faz; a grade repete a mesma função).
    const recortadas = React.useMemo(
        () => (filtroStatus ? exibidas.filter(o => o.status === filtroStatus) : exibidas),
        [exibidas, filtroStatus],
    );
    const naGrade = React.useMemo(() => {
        const termo = normalizarTexto(busca.trim());
        return termo ? recortadas.filter(o => normalizarTexto(textoDeBusca(o)).includes(termo)) : recortadas;
    }, [recortadas, busca]);
    const abrir = (op: InvestorOpportunity) => { setAbaDoDetalhe('apresentacao'); setDetail(op); };
    const editar = (op: InvestorOpportunity) => setEditing(opportunities.find(o => o.id === op.id) ?? op);

    // ── Indicadores (§4) ──────────────────────────────────────────────────────
    const ativas = exibidas.filter(o => o.status !== 'encerrada' && o.is_published);
    const vgvDasAtivas = ativas.reduce((soma, o) => soma + (o.vgv ?? 0), 0);
    const publicadas = exibidas.filter(o => o.is_published).length;
    const emCaptacao = exibidas.filter(o => o.status === 'captacao').length;
    const rascunhos = exibidas.filter(o => !o.is_published).length;

    const formulario = editing !== null && editingOrganizationId && (
        <OpportunityForm
            initial={editing === 'new' ? undefined : editing}
            organizationId={editingOrganizationId}
            onSave={handleSave}
            onClose={() => { if (!saving) { setEditing(null); setCreateOrgId(undefined); } }}
        />
    );

    // F4 do plano 2026-11-25-oportunidades-e-portal-do-investidor-sem-marketplace: "Ver" abre a MESMA tela do
    // investidor (PortalOportunidadeDetalhe), no lugar da lista; o gestor ganha a faixa dele em cima.
    if (detail) {
        return (
            <div className="space-y-4">
                <PortalOportunidadeDetalhe
                    opportunity={detail}
                    aba={abaDoDetalhe}
                    onAba={setAbaDoDetalhe}
                    onVoltar={() => setDetail(null)}
                    gestor={isAdmin ? {
                        onEditar: () => editar(detail),
                        onVerInteresses: () => { setDetail(null); setAdminTab('interests'); },
                    } : undefined}
                />
                {formulario}
            </div>
        );
    }

    // ── Peças da régua (§5.1/§5.4) — as mesmas na grade e na tabela ─────────────
    const filtroDeStatus = (
        <FilterPopover<OpportunityStatus | ''> label="Status" value={filtroStatus} onChange={setFiltroStatus} options={OPCOES_DE_STATUS} />
    );
    const alternador = (
        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
            <button type="button" onClick={() => setModo('grid')} title="Visualização em grade" aria-pressed={modo === 'grid'}
                className={`p-1.5 rounded-[6px] transition-all ${modo === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                <LayoutGrid className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => setModo('list')} title="Visualização em lista" aria-pressed={modo === 'list'}
                className={`p-1.5 rounded-[6px] transition-all ${modo === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                <List className="w-4 h-4" />
            </button>
        </div>
    );

    // §9/§9.2: "Ver" em texto azul + ícones secundários sempre visíveis.
    const acoes = (op: OportunidadeNaVitrine) => (
        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => abrir(op)}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all">
                Ver
            </button>
            {isAdmin && (
                <>
                    <ActionIconButton kind="view" title={tituloDoPublicar(op)} aria-label={op.is_published ? 'Despublicar' : 'Publicar'}
                        icon={op.is_published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        onClick={() => void handleTogglePublish(op)} />
                    <ActionIconButton kind="edit" onClick={() => editar(op)} />
                    <ActionIconButton kind="delete" title="Excluir oportunidade"
                        onClick={() => openConfirm('Remover esta oportunidade?', () => onDelete(op.id!))} />
                </>
            )}
        </div>
    );

    // §8: texto colorido, sem pílula.
    const status = (op: OportunidadeNaVitrine) => (
        <span className="text-sm font-normal">
            {op.status && <span className={OPPORTUNITY_STATUS_TEXT[op.status]}>{OPPORTUNITY_STATUS_LABELS[op.status]}</span>}
            {isAdmin && !op.is_published && (
                <span className="text-amber-700" title="Rascunho: o investidor ainda não vê">{op.status ? ' · ' : ''}Rascunho</span>
            )}
        </span>
    );

    const vazio: { title: string; subtitle?: string; acao?: { rotulo: string; onClick: () => void } } =
        visibleOpportunities.length > 0
            ? { title: 'Nenhuma oportunidade encontrada', subtitle: 'Tente ajustar a busca ou o filtro de status.' }
            : {
                title: isAdmin ? 'Nenhuma oportunidade cadastrada' : 'Nenhuma oportunidade disponível no momento',
                subtitle: isAdmin ? 'Crie uma oportunidade a partir de um estudo de viabilidade e publique para os investidores.' : undefined,
                acao: isAdmin ? { rotulo: 'Criar primeira oportunidade', onClick: () => void handleNew() } : undefined,
            };
    const iconeDoVazio = <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />;

    return (
        <div className="space-y-6">
            {titulo && (
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">{titulo}</h1>
                    <p className="text-gray-500 text-sm mt-1.5 font-medium">
                        Vitrine e captação: o que se publica no Portal do Investidor e os interesses recebidos.
                    </p>
                </div>
            )}

            {isAdmin && (
                <TabsBar<AdminTab>
                    tabs={[
                        { id: 'opportunities', label: 'Oportunidades', badge: visibleOpportunities.length },
                        { id: 'interests', label: 'Interesses' },
                    ]}
                    value={adminTab}
                    onChange={setAdminTab}
                >
                    {adminTab === 'opportunities' && (
                        <Button variant="primary" onClick={() => void handleNew()}>
                            <Plus className="w-[15px] h-[15px]" />
                            Nova oportunidade
                        </Button>
                    )}
                </TabsBar>
            )}

            {isAdmin && adminTab === 'interests' && (
                <InterestsPanel organizationId={organizationId} opportunities={opportunities} />
            )}

            {adminTab === 'opportunities' && (
                <>
                    <div className={`grid grid-cols-1 md:grid-cols-2 ${isAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3 mb-3`}>
                        <KpiCard label="VGV das ativas" value={ativas.length ? (fmtBRL(vgvDasAtivas) ?? '—') : '—'}
                            sub={plural(ativas.length, 'publicada e não encerrada', 'publicadas e não encerradas')}
                            icon={<BarChart3 className="w-4 h-4" />} color="blue" />
                        <KpiCard label="Oportunidades" value={visibleOpportunities.length}
                            sub={plural(publicadas, 'publicada', 'publicadas')}
                            icon={<Building2 className="w-4 h-4" />} color="indigo" />
                        <KpiCard label="Em captação" value={emCaptacao}
                            icon={<TrendingUp className="w-4 h-4" />} color="emerald" />
                        {isAdmin && (
                            <KpiCard label="Rascunhos" value={rascunhos} sub="O investidor ainda não vê"
                                icon={<EyeOff className="w-4 h-4" />} color="amber" />
                        )}
                    </div>

                    {modo === 'grid' ? (
                        /* §5.2 — régua e grade no mesmo card; a busca é a mesma da tabela. */
                        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                            <div className="p-2 border-b border-gray-100 bg-white">
                                <div className="flex flex-col md:flex-row gap-2.5 items-center">
                                    <div className="flex-1 relative w-full">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input type="text" placeholder="Buscar oportunidade, local ou status..." value={busca}
                                            onChange={e => setBusca(e.target.value)} aria-label="Buscar oportunidade"
                                            className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
                                    </div>
                                    {filtroDeStatus}
                                    {alternador}
                                </div>
                            </div>
                            {loading ? (
                                <div className="text-center py-12">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
                                    <p className="mt-2 text-gray-500">Carregando...</p>
                                </div>
                            ) : naGrade.length === 0 ? (
                                <div className="text-center py-12">
                                    {iconeDoVazio}
                                    <h3 className="text-lg font-bold text-gray-900 mb-2">{vazio.title}</h3>
                                    {vazio.subtitle && <p className="text-sm text-gray-500">{vazio.subtitle}</p>}
                                    {vazio.acao && (
                                        <button type="button" onClick={vazio.acao.onClick} className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-800">
                                            {vazio.acao.rotulo}
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4 bg-gray-50">
                                    {naGrade.map(op => (
                                        <article key={op.id} aria-label={op.title} className="bg-white rounded-[10px] border border-gray-200 overflow-hidden flex flex-col">
                                            {op.capa ? (
                                                <img src={op.capa} alt="" className="h-36 w-full object-cover" />
                                            ) : (
                                                <div className="h-36 bg-gray-100 flex items-center justify-center" aria-hidden>
                                                    <Building2 className="w-8 h-8 text-gray-300" />
                                                </div>
                                            )}
                                            <div className="p-4 space-y-3 flex-1">
                                                <div>
                                                    <h3 className="text-base font-semibold text-gray-900 leading-snug">{op.title}</h3>
                                                    {op.subtitle && <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">{op.subtitle}</p>}
                                                </div>
                                                <p className="text-sm font-normal">
                                                    {status(op)}
                                                    {op.opportunity_type && <span className="text-gray-600"> · {OPPORTUNITY_TYPE_LABELS[op.opportunity_type]}</span>}
                                                </p>
                                                <dl className="grid grid-cols-3 gap-3">
                                                    {([['VGV', fmtBRL(op.vgv)], ['ROI', op.roi_pct != null ? fmtPct(op.roi_pct) : null], ['TIR', op.tir_pct != null ? fmtPct(op.tir_pct) : null]] as const).map(([rotulo, valor]) => (
                                                        <div key={rotulo}>
                                                            <dt className="text-xs text-gray-500">{rotulo}</dt>
                                                            <dd className="text-sm font-medium text-gray-800 tabular-nums">{valor ?? '—'}</dd>
                                                        </div>
                                                    ))}
                                                </dl>
                                                {localDe(op) && (
                                                    <p className="flex items-center gap-1.5 text-sm text-gray-600">
                                                        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />{localDe(op)}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="px-4 py-3 border-t border-gray-100">{acoes(op)}</div>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <StandardTable<OportunidadeNaVitrine>
                            storageKey="oportunidades:tabela"
                            columns={COLUNAS}
                            rows={recortadas}
                            rowKey={op => op.id!}
                            rowLabel={op => op.title}
                            search={busca}
                            onSearchChange={setBusca}
                            searchText={textoDeBusca}
                            searchPlaceholder="Buscar oportunidade, local ou status..."
                            filters={<>{filtroDeStatus}{alternador}</>}
                            loading={loading}
                            onRowClick={abrir}
                            sortValue={(key, op) => {
                                switch (key) {
                                    case 'oportunidade': return op.title;
                                    case 'status': return op.status ? ORDEM_DO_STATUS.indexOf(op.status) : null;
                                    case 'vgv': return op.vgv;
                                    case 'roi': return op.roi_pct;
                                    case 'tir': return op.tir_pct;
                                    case 'local': return localDe(op);
                                    default: return null;
                                }
                            }}
                            renderCell={(key, op) => {
                                switch (key) {
                                    case 'oportunidade': return (
                                        <div className="min-w-0">
                                            <span className="block truncate text-sm font-normal text-gray-700" title={op.title}>{op.title}</span>
                                            {op.subtitle && <span className="block truncate text-sm font-normal text-gray-600" title={op.subtitle}>{op.subtitle}</span>}
                                        </div>
                                    );
                                    case 'status': return status(op);
                                    case 'vgv': return <span className="text-sm font-medium text-gray-800">{fmtBRL(op.vgv) ?? '—'}</span>;
                                    case 'roi': return <span className="text-sm font-normal text-gray-700">{op.roi_pct != null ? fmtPct(op.roi_pct) : '—'}</span>;
                                    case 'tir': return <span className="text-sm font-normal text-gray-700">{op.tir_pct != null ? fmtPct(op.tir_pct) : '—'}</span>;
                                    case 'local': return <span className="block truncate text-sm font-normal text-gray-700" title={localDe(op) || undefined}>{localDe(op) || '—'}</span>;
                                    default: return null;
                                }
                            }}
                            actions={{ width: isAdmin ? 190 : 90, render: acoes }}
                            empty={{ icon: iconeDoVazio, ...vazio }}
                        />
                    )}
                </>
            )}

            {/* Modais */}
            {formulario}

            {orgTargetModal}
        </div>
    );
};

export default OpportunitiesTab;
