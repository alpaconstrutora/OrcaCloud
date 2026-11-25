import React from 'react';
import { Users, Mail, Phone, LayoutGrid, List, Search, Handshake, CheckCircle2, Banknote, AlertCircle } from 'lucide-react';
import {
    OpportunityInterest, InterestStage, InvestorOpportunity,
    INTEREST_STAGE_LABELS, INTEREST_STAGE_COLORS, INTEREST_ROLE_LABELS,
    investorPortalService,
} from '../../services/investorPortalService';
import TornarSocioSheet, { motivoParaNaoTornarSocio } from './TornarSocioSheet';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { KpiCard } from '../ui/KpiCard';
import { FilterPopover } from '../ui/FilterPopover';
import { normalizarTexto } from '../ui/FilterUtils';
import { usePersistedState } from '../ui/TableUtils';
import { useToast } from '../../hooks/useToast';

/**
 * Aba Interesses de Incorporação › Oportunidades — no padrão do app (docs/ui_ux_guia_unificado.md; 25/11/2026,
 * pedido do usuário: "aba interesse também"). Interesse é registro homogêneo (contato, oportunidade, estágio,
 * valor, data): a visão padrão é a TABELA (§6.10); o quadro por estágio (kanban) fica como alternativa, no
 * desenho do §36 (coluna cinza com bolinha + contagem, cartão branco).
 */
interface Props {
    /** Ausente quando o usuário está em "Todas as organizações" — lista os interesses de todas. */
    organizationId?: string | null;
    opportunities: InvestorOpportunity[];
}

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const fmtData = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

const STAGES: InterestStage[] = ['lead', 'interesse', 'reuniao', 'proposta', 'negociacao', 'fechado'];
// A bolinha do estágio (§36) — a mesma família de cor do texto do estágio.
const BOLINHA: Record<InterestStage, string> = {
    lead: 'bg-gray-400', interesse: 'bg-blue-500', reuniao: 'bg-indigo-500',
    proposta: 'bg-amber-500', negociacao: 'bg-purple-500', fechado: 'bg-emerald-500',
};
const OPCOES_DE_ESTAGIO: { value: InterestStage | ''; label: string }[] = [
    { value: '', label: 'Todos' },
    ...STAGES.map(s => ({ value: s, label: INTEREST_STAGE_LABELS[s] })),
];

// §6.3: "E-mail e telefone" junta dois valores na mesma célula — sem valor único para ordenar.
const COLUNAS: StandardTableColumn[] = [
    { key: 'contato', label: 'Contato', sortable: true, width: 220 },
    { key: 'oportunidade', label: 'Oportunidade', sortable: true, width: 200 },
    { key: 'estagio', label: 'Estágio', sortable: true, width: 160 },
    { key: 'valor', label: 'Valor pretendido', sortable: true, width: 150, align: 'right' },
    { key: 'meios', label: 'E-mail e telefone', sortable: false, width: 230 },
    { key: 'mensagem', label: 'Mensagem', sortable: true, width: 220 },
    { key: 'recebido', label: 'Recebido em', sortable: true, width: 120 },
];

type Modo = 'quadro' | 'list';
const estagioDe = (i: OpportunityInterest): InterestStage => i.stage ?? 'lead';

const InterestsPanel: React.FC<Props> = ({ organizationId, opportunities }) => {
    const [interests, setInterests] = React.useState<OpportunityInterest[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    // §3: recortes, busca e modo sobrevivem a navegação e recarga.
    const [filtroOportunidade, setFiltroOportunidade] = usePersistedState<string>('interesses:oportunidade', '');
    const [filtroEstagio, setFiltroEstagio] = usePersistedState<InterestStage | ''>('interesses:estagio', '');
    const [busca, setBusca] = usePersistedState<string>('interesses:busca', '');
    const [modo, setModo] = usePersistedState<Modo>('interesses:modo', 'list');
    const [updating, setUpdating] = React.useState<string | null>(null);
    // Fase 4 do plano 2026-11-21: interesse "Fechado" vira sócio da SPE da oportunidade.
    const [tornandoSocio, setTornandoSocio] = React.useState<OpportunityInterest | null>(null);
    const { showToast } = useToast();

    const carregar = React.useCallback(() => {
        let vivo = true;
        setLoading(true);
        setErro(null);
        investorPortalService.listInterests(organizationId)
            .then(l => { if (vivo) setInterests(l); })
            .catch(err => { if (vivo) setErro(`Não foi possível carregar os interesses: ${(err as Error).message}`); })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [organizationId]);
    React.useEffect(() => carregar(), [carregar]);

    const handleStageChange = async (id: string, stage: InterestStage) => {
        setUpdating(id);
        try {
            await investorPortalService.updateInterestStage(id, stage);
            setInterests(prev => prev.map(i => (i.id === id ? { ...i, stage } : i)));
        } catch (err) {
            showToast(`Não foi possível mudar o estágio: ${(err as Error).message}`, 'error');
        } finally {
            setUpdating(null);
        }
    };

    const oportunidadeDe = (i: OpportunityInterest) => opportunities.find(o => o.id === i.opportunity_id);
    const oppTitle = (i: OpportunityInterest) => oportunidadeDe(i)?.title ?? '—';
    const textoDeBusca = (i: OpportunityInterest) => [
        i.contact_name, i.contact_email, i.contact_phone, i.message, oppTitle(i),
        INTEREST_ROLE_LABELS[i.role], INTEREST_STAGE_LABELS[estagioDe(i)],
    ].filter(Boolean).join(' ');

    // Recortes de escopo (oportunidade, estágio) antes da tabela; a busca o StandardTable faz e o quadro repete.
    const recortados = React.useMemo(() => interests.filter(i =>
        (!filtroOportunidade || i.opportunity_id === filtroOportunidade)
        && (!filtroEstagio || estagioDe(i) === filtroEstagio)), [interests, filtroOportunidade, filtroEstagio]);
    const noQuadro = React.useMemo(() => {
        const termo = normalizarTexto(busca.trim());
        return termo ? recortados.filter(i => normalizarTexto(textoDeBusca(i)).includes(termo)) : recortados;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recortados, busca, opportunities]);

    // ── Indicadores (§4) — do recorte de oportunidade, como a tabela ─────────────
    const doRecorte = filtroOportunidade ? interests.filter(i => i.opportunity_id === filtroOportunidade) : interests;
    const emNegociacao = doRecorte.filter(i => ['proposta', 'negociacao'].includes(estagioDe(i))).length;
    const fechados = doRecorte.filter(i => estagioDe(i) === 'fechado').length;
    const comValor = doRecorte.filter(i => i.valor_pretendido != null);
    const valorPretendido = comValor.reduce((s, i) => s + (i.valor_pretendido ?? 0), 0);
    const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

    const opcoesDeOportunidade = React.useMemo(() => [
        { value: '', label: 'Todas' },
        ...opportunities.filter(o => o.id).map(o => ({ value: o.id!, label: o.title })),
    ], [opportunities]);

    // ── Peças (§5.1/§5.4/§7.1/§9) ─────────────────────────────────────────────
    const filtros = (
        <>
            <FilterPopover<string> label="Oportunidade" value={filtroOportunidade} onChange={setFiltroOportunidade} options={opcoesDeOportunidade} />
            <FilterPopover<InterestStage | ''> label="Estágio" value={filtroEstagio} onChange={setFiltroEstagio} options={OPCOES_DE_ESTAGIO} />
            <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                <button type="button" onClick={() => setModo('quadro')} title="Quadro por estágio" aria-pressed={modo === 'quadro'}
                    className={`p-1.5 rounded-[6px] transition-all ${modo === 'quadro' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                    <LayoutGrid className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => setModo('list')} title="Visualização em lista" aria-pressed={modo === 'list'}
                    className={`p-1.5 rounded-[6px] transition-all ${modo === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                    <List className="w-4 h-4" />
                </button>
            </div>
        </>
    );

    const seletorDeEstagio = (i: OpportunityInterest, classe = '') => (
        <select
            aria-label={`Estágio de ${i.contact_name}`}
            value={estagioDe(i)}
            disabled={updating === i.id}
            onClick={e => e.stopPropagation()}
            onChange={e => void handleStageChange(i.id!, e.target.value as InterestStage)}
            className={`h-8 pl-2 pr-7 bg-gray-50 border border-gray-100 rounded-[6px] text-sm font-normal cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50 ${INTEREST_STAGE_COLORS[estagioDe(i)].text} ${classe}`}
        >
            {STAGES.map(s => <option key={s} value={s}>{INTEREST_STAGE_LABELS[s]}</option>)}
        </select>
    );

    // §9.2 + "botão desligado sempre diz o motivo": o motivo vai no invólucro.
    const tornarSocio = (i: OpportunityInterest, classe = '') => {
        const motivo = motivoParaNaoTornarSocio(i, oportunidadeDe(i));
        return (
            <span className="inline-flex" title={motivo}>
                <button type="button" onClick={() => setTornandoSocio(i)} disabled={!!motivo}
                    className={`text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all disabled:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed ${classe}`}>
                    {i.investor_id ? 'Tornar sócio (investidor do link)' : 'Tornar sócio'}
                </button>
            </span>
        );
    };

    const meios = (i: OpportunityInterest) => (
        <div className="min-w-0 space-y-0.5">
            {i.contact_email && (
                <a href={`mailto:${i.contact_email}`} onClick={e => e.stopPropagation()} title={i.contact_email}
                    className="flex items-center gap-1.5 text-sm font-normal text-blue-600 hover:text-blue-800">
                    <Mail className="w-3.5 h-3.5 shrink-0" /><span className="block truncate">{i.contact_email}</span>
                </a>
            )}
            {i.contact_phone && (
                <a href={`tel:${i.contact_phone}`} onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1.5 text-sm font-normal text-blue-600 hover:text-blue-800">
                    <Phone className="w-3.5 h-3.5 shrink-0" />{i.contact_phone}
                </a>
            )}
            {!i.contact_email && !i.contact_phone && <span className="text-sm font-normal text-gray-600">—</span>}
        </div>
    );

    const vazio = interests.length > 0
        ? { title: 'Nenhum interesse encontrado', subtitle: 'Tente ajustar a busca ou os filtros.' }
        : { title: 'Nenhuma manifestação recebida ainda', subtitle: 'Os interesses aparecem aqui quando um investidor manifesta interesse pelo Portal do Investidor.' };
    const iconeDoVazio = <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />;

    return (
        <>
            <TornarSocioSheet
                interesse={tornandoSocio}
                oportunidade={tornandoSocio ? oportunidadeDe(tornandoSocio) : undefined}
                onClose={() => setTornandoSocio(null)}
                onFeito={(i, investorId) => {
                    setInterests(prev => prev.map(x => (x.id === i.id ? { ...x, investor_id: investorId } : x)));
                    setTornandoSocio(null);
                }}
            />

            {erro && (
                <div role="alert" className="flex items-center gap-3 p-4 mb-3 bg-red-50 border border-red-200 rounded-[10px] text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{erro} <button type="button" onClick={carregar} className="underline font-medium">Tentar novamente</button></span>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <KpiCard label="Interesses" value={doRecorte.length} icon={<Users className="w-4 h-4" />} color="blue" />
                <KpiCard label="Em negociação" value={emNegociacao} sub="Proposta ou negociação" icon={<Handshake className="w-4 h-4" />} color="amber" />
                <KpiCard label="Fechados" value={fechados} sub="Prontos para virar sócio" icon={<CheckCircle2 className="w-4 h-4" />} color="emerald" />
                <KpiCard label="Valor pretendido" value={comValor.length ? fmtBRL(valorPretendido) : '—'}
                    sub={plural(comValor.length, 'interesse com valor', 'interesses com valor')}
                    icon={<Banknote className="w-4 h-4" />} color="indigo" />
            </div>

            {modo === 'quadro' ? (
                /* §5.2 — régua e quadro no mesmo card; a busca é a mesma da tabela. */
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-2 border-b border-gray-100 bg-white">
                        <div className="flex flex-col md:flex-row gap-2.5 items-center">
                            <div className="flex-1 relative w-full">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input type="text" placeholder="Buscar contato, oportunidade ou mensagem..." value={busca}
                                    onChange={e => setBusca(e.target.value)} aria-label="Buscar interesse"
                                    className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
                            </div>
                            {filtros}
                        </div>
                    </div>
                    {loading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
                            <p className="mt-2 text-gray-500">Carregando...</p>
                        </div>
                    ) : noQuadro.length === 0 ? (
                        <div className="text-center py-12">
                            {iconeDoVazio}
                            <h3 className="text-lg font-bold text-gray-900 mb-2">{vazio.title}</h3>
                            <p className="text-sm text-gray-500">{vazio.subtitle}</p>
                        </div>
                    ) : (
                        /* §36 — quadro de cartões: coluna cinza com bolinha + nome + contagem, cartão branco. */
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
                            {STAGES.filter(s => !filtroEstagio || s === filtroEstagio).map(stage => {
                                const itens = noQuadro.filter(i => estagioDe(i) === stage);
                                return (
                                    <section key={stage} aria-labelledby={`estagio-${stage}`} className="bg-gray-50 rounded-[10px] border border-gray-100 p-2 space-y-2">
                                        <h3 id={`estagio-${stage}`} className="flex items-center gap-2 px-1 py-1 text-sm font-semibold text-gray-900">
                                            <span className={`w-2 h-2 rounded-full ${BOLINHA[stage]}`} aria-hidden />
                                            {INTEREST_STAGE_LABELS[stage]}
                                            <span className="text-xs font-medium text-slate-600 bg-slate-200 rounded-[6px] px-1.5">{itens.length}</span>
                                        </h3>
                                        {itens.length === 0 && <p className="px-1 pb-1 text-sm text-gray-500">Nenhum interesse neste estágio.</p>}
                                        {itens.map(i => (
                                            <article key={i.id} aria-label={i.contact_name} className="bg-white rounded-[10px] border border-gray-200 p-3 space-y-2">
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900">{i.contact_name}</p>
                                                    <p className="text-sm text-gray-600">
                                                        {INTEREST_ROLE_LABELS[i.role]}{!filtroOportunidade && <> · <span title={oppTitle(i)}>{oppTitle(i)}</span></>}
                                                    </p>
                                                </div>
                                                {meios(i)}
                                                {i.valor_pretendido != null && (
                                                    <p className="text-sm text-gray-700">Pretende aportar <span className="font-medium text-gray-800">{fmtBRL(i.valor_pretendido)}</span></p>
                                                )}
                                                {i.message && (
                                                    <p className="text-sm text-gray-700 italic border-l-2 border-gray-200 pl-2">"{i.message}"</p>
                                                )}
                                                <p className="text-xs text-gray-500">Recebido em {fmtData(i.created_at)}</p>
                                                {seletorDeEstagio(i, 'w-full')}
                                                {estagioDe(i) === 'fechado' && tornarSocio(i)}
                                            </article>
                                        ))}
                                    </section>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : (
                <StandardTable<OpportunityInterest>
                    storageKey="interesses:tabela"
                    columns={COLUNAS}
                    rows={recortados}
                    rowKey={i => i.id!}
                    rowLabel={i => i.contact_name}
                    search={busca}
                    onSearchChange={setBusca}
                    searchText={textoDeBusca}
                    searchPlaceholder="Buscar contato, oportunidade ou mensagem..."
                    filters={filtros}
                    loading={loading}
                    defaultSort={{ column: 'recebido', direction: 'desc' }}
                    sortValue={(key, i) => {
                        switch (key) {
                            case 'contato': return i.contact_name;
                            case 'oportunidade': return oppTitle(i);
                            case 'estagio': return STAGES.indexOf(estagioDe(i));
                            case 'valor': return i.valor_pretendido ?? null;
                            case 'mensagem': return i.message ?? '';
                            case 'recebido': return i.created_at ?? '';
                            default: return null;
                        }
                    }}
                    renderCell={(key, i) => {
                        switch (key) {
                            case 'contato': return (
                                <div className="min-w-0">
                                    <span className="block truncate text-sm font-normal text-gray-700" title={i.contact_name}>{i.contact_name}</span>
                                    <span className="block text-sm font-normal text-gray-600">{INTEREST_ROLE_LABELS[i.role]}</span>
                                </div>
                            );
                            case 'oportunidade': return <span className="block truncate text-sm font-normal text-gray-700" title={oppTitle(i)}>{oppTitle(i)}</span>;
                            case 'estagio': return seletorDeEstagio(i);
                            case 'valor': return <span className="text-sm font-medium text-gray-800">{i.valor_pretendido != null ? fmtBRL(i.valor_pretendido) : '—'}</span>;
                            case 'meios': return meios(i);
                            case 'mensagem': return <span className="block truncate text-sm font-normal text-gray-700" title={i.message ?? undefined}>{i.message || '—'}</span>;
                            case 'recebido': return <span className="text-sm font-normal text-gray-600">{fmtData(i.created_at)}</span>;
                            default: return null;
                        }
                    }}
                    actions={{ width: 230, render: i => <div className="flex items-center justify-end">{tornarSocio(i)}</div> }}
                    empty={{ icon: iconeDoVazio, ...vazio }}
                />
            )}
        </>
    );
};

export default InterestsPanel;
