import React from 'react';
import { Shield, Plus, AlertTriangle, CheckCircle, Clock, XCircle, Wrench, Star, Search, MoveHorizontal, Upload, X, Building2, Landmark, User, ArrowLeft } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { warrantyService } from '../services/warrantyService';
import { empreendimentoService } from '../services/empreendimentoService';
import { clientService } from '../services/clientService';
import { useToast } from '../hooks/useToast';
import { useOrgContext, useOrgWriteTarget } from '../hooks/useOrgContext';
import { useConfirm } from './ui/confirm';
import { ColumnConfig, useTableColumns, useResizableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import type { WarrantyClaim, ClaimState, ClaimOrigin, WarrantyKPIs, ClaimFilters } from '../types/warranty';
import type { TaxonomySystem, TaxonomyPathology } from '../types/quality';
import {
    breakdownPor, computeWarrantyKPIs, fluxoMensal, slaVencido,
    type BreakdownItem, type MonthlyFlowItem,
} from '../utils/warrantyAnalytics';
import { formatMonthLabel } from './ui/Format';
import ActionIconButton from './ui/ActionIconButton';
import KpiCard from './ui/KpiCard';

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

// §16 — escala compacta: 6px em input/select, altura h-9. Os campos deste
// arquivo estavam em `rounded-xl px-3 py-2`, da escala antiga.
const FIELD_CLASS = 'w-full h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:bg-gray-50 disabled:text-gray-400';
const SELECT_CLASS = `${FIELD_CLASS} appearance-none cursor-pointer`;
/** Select com ícone-âncora à esquerda (vínculos: empreendimento, obra, cliente). */
const SELECT_WITH_ICON_CLASS = `${SELECT_CLASS} pl-9`;
const TEXTAREA_CLASS = 'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none';
const LABEL_CLASS = 'block text-xs font-semibold text-gray-500 mb-1';

/**
 * Botões de rodapé de formulário — §17.
 *
 * `components/ui/Button.tsx:21` fixa `rounded-xl font-black uppercase
 * tracking-widest`, que é a variante DEPRECADA do §17 ("CANCELAR", "ABRIR
 * CHAMADO" em caixa alta e pílula — visto no navegador em 2026-08-31). O
 * componente está em 170 arquivos, então trocá-lo é decisão de app inteiro;
 * aqui a tela usa o estilo canônico direto.
 */
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
const BTN_SECONDARY = 'inline-flex items-center justify-center h-9 px-3.5 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-[6px] transition-all';

const SEVERITY_COLORS: Record<string, string> = {
    baixa:   'text-green-600',
    media:   'text-yellow-700',
    alta:    'text-orange-600',
    critica: 'text-red-700',
};

// O banco guarda o valor sem acento (`critica`, `media`) porque é um CHECK
// constraint. A tela mostrava esse valor cru com `capitalize`, então lia
// "Critica" e "Media" — visto no navegador em 2026-08-31.
const SEVERITY_LABELS: Record<string, string> = {
    baixa:   'Baixa',
    media:   'Média',
    alta:    'Alta',
    critica: 'Crítica',
};

// Ordenar a coluna por `localeCompare` do valor cru dava a ordem ALFABÉTICA
// (alta → baixa → critica → media), que não é a ordem que a palavra
// "severidade" promete.
const SEVERITY_RANK: Record<string, number> = { baixa: 0, media: 1, alta: 2, critica: 3 };

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

    const selectClass = SELECT_CLASS;

    return (
        <>
            <div>
                <label className={LABEL_CLASS}>Sistema construtivo</label>
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
                <label className={LABEL_CLASS}>Patologia</label>
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

const CLAIM_COLUMNS: ColumnConfig[] = [
    { key: 'chamado', label: 'Chamado', sortable: true },
    // Empreendimento › Obra › Unidade é a hierarquia física, e Cliente é o "quem"
    // logo depois — a ordem das colunas conta essa história.
    { key: 'development', label: 'Empreendimento', sortable: true },
    { key: 'obra', label: 'Obra', sortable: true },
    { key: 'unidade', label: 'Unidade', sortable: true },
    { key: 'cliente', label: 'Cliente', sortable: true },
    // Oculta por padrão junto com as duas de baixo: a coluna de Unidade não cabia
    // sem abrir espaço, e esta é a menos operacional das candidatas — em produção
    // os chamados existentes estão todos como "Não classificado", e a recorrência
    // de patologia é justamente o que a aba Análise mostra melhor.
    { key: 'patologia', label: 'Patologia', sortable: true, defaultHidden: true },
    { key: 'state', label: 'Status', sortable: true },
    { key: 'severity', label: 'Severidade', sortable: true },
    { key: 'sla_deadline', label: 'SLA', sortable: true },
    // Ocultas por padrão — a um clique na engrenagem, não removidas.
    //
    // Com as 3 colunas novas são 11 no total, e só os cabeçalhos mínimos somam
    // ~1363px contra os ~1290px que sobram ao lado da sidebar: NÃO cabe. Sem
    // esconder duas, a coluna de Ações nasce fora da área visível — o oposto do
    // §9 e do que o pedido de 2026-08-30 pediu ("editar sempre visível").
    // Medido no app real, logado, em 2026-08-31.
    //
    // Estas duas por serem as menos operacionais: "Registro" mede a qualidade do
    // CADASTRO (não do chamado), e a data de abertura raramente decide a triagem
    // — quem decide é o SLA, que fica visível.
    { key: 'quality_score', label: 'Registro', sortable: true, defaultHidden: true },
    { key: 'created_at', label: 'Abertura', sortable: true, defaultHidden: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

// ⚠️ As chaves são persistidas em localStorage (`warrantyClaimsColumns` /
// `warrantyClaimsColWidths`). `state` continua `state` mesmo depois de o rótulo
// virar "Status" em 2026-08-30 — renomear a chave descartaria a ordem, a
// visibilidade e as larguras que o usuário já configurou.
// ⚠️ A SOMA importa: com as 3 colunas novas as larguras antigas davam 1750px
// contra ~1550px de container em 1600px de viewport, e a coluna de Ações nascia
// fora da área visível — o oposto do §9 ("sempre visível"). Medido no navegador
// em 2026-08-31. Soma atual: 1495px. Ao acrescentar coluna, refazer a conta.
// A largura de cada coluna é ditada pelo CABEÇALHO mais o ícone de ordenação,
// não pelo dado: "Severidade" e "Empreendimento" são mais largos que qualquer
// valor que carregam, e o estado mais comprido ("Visita Agendada") define
// `state`.
//
// ⚠️ A SOMA das colunas VISÍVEIS por padrão tem de caber nos ~1290px que sobram
// ao lado da sidebar do Layout — não nos ~1550px de uma página sem sidebar.
// Medi contra a largura errada na primeira tentativa e a coluna de Ações nasceu
// fora da tela. Ao mostrar coluna nova por padrão, refazer a conta contra 1290,
// não contra a janela.
//
// Visíveis hoje: 225+165+120+120+145+160+125+110+90 = 1260px.
const CLAIM_COL_WIDTHS: Record<string, number> = {
    // `state` é a mais larga em relação ao cabeçalho porque quem manda é o VALOR:
    // "Fora de Garantia" e "Visita Agendada" quebravam em duas linhas abaixo de 160.
    chamado: 225, development: 165, obra: 120, unidade: 120, cliente: 145,
    patologia: 140, state: 160, severity: 125, sla_deadline: 110,
    quality_score: 100, created_at: 105, actions: 90,
};

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX. 'actions' fica fora (estrutural, fixa à direita).
const TH_CLASS = 'px-6 py-2 border-r border-gray-100 overflow-hidden';
const CLAIM_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    chamado: { label: 'Chamado', className: TH_CLASS },
    development: { label: 'Empreendimento', className: TH_CLASS },
    obra: { label: 'Obra', className: TH_CLASS },
    unidade: { label: 'Unidade', className: TH_CLASS },
    cliente: { label: 'Cliente', className: TH_CLASS },
    patologia: { label: 'Patologia', className: TH_CLASS },
    state: { label: 'Status', className: TH_CLASS },
    severity: { label: 'Severidade', className: TH_CLASS },
    sla_deadline: { label: 'SLA', className: TH_CLASS },
    quality_score: { label: 'Registro', className: TH_CLASS },
    created_at: { label: 'Abertura', className: TH_CLASS },
};

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `tableColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna.
interface ClaimCellContext {
    obraName?: string | null;
    developmentName?: string | null;
    /** true quando o empreendimento foi deduzido da obra (chamado anterior ao vínculo próprio). */
    developmentInferido?: boolean;
    slaVencido?: boolean;
    pathologyName?: string;
    systemName?: string;
}

/** Texto livre em coluna de largura fixa: `block` é o que faz o `truncate` recortar (§6.1.2). */
function CellText({ value, className = 'text-gray-700' }: { value?: string | null; className?: string }) {
    if (!value) return <span className="text-sm font-normal text-gray-300">—</span>;
    return (
        <span className={`block truncate text-sm font-normal ${className}`} title={value}>
            {value}
        </span>
    );
}

function renderClaimCell(key: string, claim: WarrantyClaim, ctx: ClaimCellContext): React.ReactNode {
    switch (key) {
        case 'development':
            if (!ctx.developmentName) return <CellText value={null} />;
            return (
                <span
                    className={`block truncate text-sm font-normal ${ctx.developmentInferido ? 'text-gray-400' : 'text-gray-700'}`}
                    title={ctx.developmentInferido
                        ? `${ctx.developmentName} — deduzido da obra; o chamado não tem empreendimento próprio`
                        : ctx.developmentName}
                >
                    {ctx.developmentName}
                </span>
            );
        case 'obra':
            return <CellText value={ctx.obraName} className="text-blue-600" />;
        case 'cliente':
            return <CellText value={claim.client_name} />;
        case 'patologia':
            if (!claim.taxonomy?.systemCode) {
                return <span className="block truncate text-sm font-normal text-gray-300">Não classificado</span>;
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
        case 'unidade':
            return <CellText value={claim.unidade_ref} />;
        case 'chamado':
            // Obra, cliente e unidade saíram daqui: cada um virou coluna própria,
            // ordenável e ocultável. Sobra o que identifica o chamado em si — numa
            // linha só, sem subtítulo empilhado.
            return <CellText value={claim.sistema_descricao} />;
        case 'state':
            return <span className={`text-sm font-normal ${STATE_COLORS[claim.state]}`}>{STATE_LABELS[claim.state]}</span>;
        case 'severity':
            return <span className={`text-sm font-normal ${SEVERITY_COLORS[claim.severity]}`}>{SEVERITY_LABELS[claim.severity] ?? claim.severity}</span>;
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

interface ClaimRowProps {
    claim: WarrantyClaim;
    onSelect: (c: WarrantyClaim) => void;
    onEdit: (c: WarrantyClaim) => void;
    onDelete: (c: WarrantyClaim) => void;
    deleting: boolean;
    projects: ProjectOption[];
    developmentNameOf: (c: WarrantyClaim) => { name: string | null; inferido: boolean };
    orderedVisibleColumns: string[];
    showActions: boolean;
    taxonomyLabels: TaxonomyLabels;
    hoje: string;
}

function ClaimRow({
    claim, onSelect, onEdit, onDelete, deleting, projects, developmentNameOf,
    orderedVisibleColumns, showActions, taxonomyLabels, hoje,
}: ClaimRowProps) {
    const obraName = claim.project_id ? projects.find(p => p.id === claim.project_id)?.name : null;
    const vencido = slaVencido(claim, hoje);
    const systemName    = claim.taxonomy?.systemCode    ? taxonomyLabels.systems[claim.taxonomy.systemCode] : undefined;
    const pathologyName = claim.taxonomy?.pathologyCode ? taxonomyLabels.pathologies[claim.taxonomy.pathologyCode] : undefined;
    const { name: developmentName, inferido: developmentInferido } = developmentNameOf(claim);

    return (
        <tr
            className="hover:bg-blue-50/50 cursor-pointer transition-colors"
            onClick={() => onSelect(claim)}
        >
            {orderedVisibleColumns.map(key => (
                <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                    {renderClaimCell(key, claim, {
                        obraName, developmentName, developmentInferido,
                        slaVencido: vencido, systemName, pathologyName,
                    })}
                </td>
            ))}
            <td aria-hidden="true"></td>
            {showActions && (
                // §9 — ações sempre visíveis. Clicar na linha abre o detalhe em
                // leitura; o botão de editar abre o mesmo detalhe já em edição.
                <td className="px-6 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                        <ActionIconButton kind="edit" title="Editar chamado" onClick={() => onEdit(claim)} />
                        <ActionIconButton kind="delete" title="Excluir chamado" disabled={deleting} onClick={() => onDelete(claim)} />
                    </div>
                </td>
            )}
        </tr>
    );
}

// ── Aba Análise ───────────────────────────────────────────────────────────────

/**
 * Paleta dos gráficos.
 *
 * `MAGNITUDE` é hue única: toda barra de "quantos chamados" mede a MESMA coisa,
 * então pintar cada barra de uma cor sugeriria uma identidade que não existe.
 * O par do gráfico de fluxo é categórico (duas séries distintas) e passou nos
 * seis checks de contraste/daltonismo (ΔE deutan 20,7 · normal 22,6).
 */
const CHART = {
    magnitude: '#3b82f6',
    abertos:   '#2563eb',
    encerrados:'#0d9488',
    grid:      '#f1f5f9',
    axis:      '#94a3b8',
} as const;

const TOOLTIP_STYLE = {
    borderRadius: 10,
    border: '1px solid #f1f5f9',
    boxShadow: '0 4px 16px rgba(15,23,42,0.08)',
    fontSize: 13,
} as const;

/**
 * Rótulo de eixo em coluna estreita: corta com reticências em vez de estourar.
 * 18 e não 22 porque acima disso o recharts quebra o rótulo em duas linhas —
 * e um texto em duas linhas COM reticências fica pior que só cortado.
 */
function encurtar(texto: string, max = 18): string {
    return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

/**
 * Barra horizontal de contagem — uma série só, hue única.
 *
 * Horizontal porque os rótulos são nomes (patologia, empreendimento, obra):
 * na vertical eles viram texto inclinado ou cortado.
 */
function BreakdownChart({ title, subtitle, data }: { title: string; subtitle: string; data: BreakdownItem[] }) {
    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4">
            <p className="text-sm font-semibold text-gray-700">{title}</p>
            <p className="text-xs text-gray-400 mt-0.5 mb-3">{subtitle}</p>
            {data.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-12">Sem dados no período.</p>
            ) : (
                <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34 + 24)}>
                    <BarChart data={data} layout="vertical" margin={{ top: 0, right: 28, bottom: 0, left: 0 }}>
                        <CartesianGrid horizontal={false} stroke={CHART.grid} />
                        {/* `dataMax` no lugar do domínio automático: com contagens
                            baixas o recharts folgava o eixo até 4 e as barras
                            ficavam num quarto da largura, sugerindo um teto que
                            não existe. */}
                        <XAxis type="number" allowDecimals={false} domain={[0, 'dataMax']}
                            tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} />
                        <YAxis
                            type="category" dataKey="label" width={180}
                            tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false}
                            tickFormatter={(v: string) => encurtar(v)}
                        />
                        <Tooltip
                            cursor={{ fill: 'rgba(59,130,246,0.06)' }}
                            contentStyle={TOOLTIP_STYLE}
                            formatter={(v) => [`${v} chamado${Number(v) === 1 ? '' : 's'}`, '']}
                        />
                        <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={16} label={{ position: 'right', fontSize: 11, fill: '#64748b' }}>
                            {data.map(d => <Cell key={d.key} fill={CHART.magnitude} />)}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}

function FlowChart({ data }: { data: MonthlyFlowItem[] }) {
    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4">
            <p className="text-sm font-semibold text-gray-700">Abertura × encerramento</p>
            <p className="text-xs text-gray-400 mt-0.5 mb-3">
                Últimos 12 meses. Encerramento aproximado pela última alteração do chamado — a tabela não guarda data de fechamento.
            </p>
            <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                    <CartesianGrid vertical={false} stroke={CHART.grid} />
                    <XAxis
                        dataKey="month" tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false}
                        tickFormatter={(v: string) => formatMonthLabel(`${v}-01`, { month: 'short' })}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} />
                    <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelFormatter={(v) => formatMonthLabel(`${String(v)}-01`, { month: 'long', year: 'numeric' })}
                    />
                    <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    {/* Marcadores diferentes por série: a identidade não fica só na cor. */}
                    <Line type="monotone" dataKey="abertos" name="Abertos" stroke={CHART.abertos} strokeWidth={2}
                        dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="encerrados" name="Encerrados" stroke={CHART.encerrados} strokeWidth={2}
                        strokeDasharray="5 3" dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

interface WarrantyAnalyticsData {
    porSistema: BreakdownItem[];
    porPatologia: BreakdownItem[];
    porOrigem: BreakdownItem[];
    porEmpreendimento: BreakdownItem[];
    porObra: BreakdownItem[];
    porCliente: BreakdownItem[];
    fluxo: MonthlyFlowItem[];
}

function WarrantyAnalytics({ kpis, analytics, loading, total }: {
    kpis: WarrantyKPIs;
    analytics: WarrantyAnalyticsData;
    loading: boolean;
    total: number;
}) {
    if (loading) {
        return (
            <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
                <p className="mt-2 text-gray-500">Carregando...</p>
            </div>
        );
    }
    if (total === 0) {
        return (
            <div className="text-center py-12">
                <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 mb-2">Nada para analisar ainda</h3>
                <p className="text-sm text-gray-500">Os indicadores aparecem assim que houver chamados registrados.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* §4 — KpiCard compartilhado, uma cor semântica por indicador.
                4 colunas, não 7: com 7 numa linha o card fica em ~200px e trunca
                tanto o rótulo ("FORA GARAN…") quanto o valor ("R$ 4.…") — visto
                no navegador em 2026-08-31. */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-3">
                <KpiCard label="Em aberto"     value={kpis.total_abertos}  icon={<AlertTriangle className="w-5 h-5" />} color="blue" />
                <KpiCard label="Em garantia"   value={kpis.em_garantia}    icon={<CheckCircle className="w-5 h-5" />}   color="emerald" />
                <KpiCard label="Fora garantia" value={kpis.fora_garantia}  icon={<XCircle className="w-5 h-5" />}       color="red" />
                <KpiCard label="Enc. no mês"   value={kpis.encerrados_mes} icon={<Wrench className="w-5 h-5" />}        color="teal" />
                <KpiCard label="NPS médio"     value={kpis.nps_medio !== null ? kpis.nps_medio.toFixed(1) : '—'} icon={<Star className="w-5 h-5" />} color="amber" />
                <KpiCard label="SLA vencidos"  value={kpis.sla_vencidos}   icon={<Clock className="w-5 h-5" />}         color={kpis.sla_vencidos > 0 ? 'red' : 'gray'} />
                <KpiCard label="Custo/mês"     value={`R$ ${kpis.custo_total_mes.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`} icon={<Shield className="w-5 h-5" />} color="orange" />
            </div>

            <FlowChart data={analytics.fluxo} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <BreakdownChart
                    title="Empreendimentos"
                    subtitle="Onde a assistência técnica está concentrada."
                    data={analytics.porEmpreendimento}
                />
                <BreakdownChart
                    title="Obras"
                    subtitle="Chamado sem obra vinculada aparece como não informado."
                    data={analytics.porObra}
                />
                <BreakdownChart
                    title="Sistemas construtivos"
                    subtitle="Pela taxonomia controlada — é o que permite comparar entre obras."
                    data={analytics.porSistema}
                />
                <BreakdownChart
                    title="Patologias recorrentes"
                    subtitle="As mais frequentes; classificar os chamados abertos por telefone melhora este recorte."
                    data={analytics.porPatologia}
                />
                <BreakdownChart
                    title="Origem provável"
                    subtitle="Separa execução da construtora do uso pelo morador."
                    data={analytics.porOrigem}
                />
                <BreakdownChart
                    title="Clientes"
                    subtitle="Quem mais abre chamado."
                    data={analytics.porCliente}
                />
            </div>
        </div>
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

/** Catálogo id → nome, usado pelos selects e pelas colunas de vínculo. */
export interface WarrantyCatalogOption { id: string; name: string; }

type WarrantyView = 'chamados' | 'analise';

// §20 — o <h1> muda junto com a aba; aba que troca o conteúdo inteiro sem
// trocar o título deixa o cabeçalho mentindo.
const VIEW_HEADERS: Record<WarrantyView, { title: string; subtitle: string }> = {
    chamados: {
        title: 'Pós-Obra & Garantia',
        subtitle: 'Gestão de chamados de assistência técnica e controle de prazos NBR 17170.',
    },
    analise: {
        title: 'Análise de Pós-Obra',
        subtitle: 'Indicadores, recorrência de patologias e distribuição por empreendimento, obra e cliente.',
    },
};

const VIEWS: { id: WarrantyView; label: string }[] = [
    { id: 'chamados', label: 'Chamados' },
    { id: 'analise', label: 'Análise' },
];

interface WarrantyModuleProps {
    projects?: ProjectOption[];
    onOpenClaim?: () => void;
}

const WarrantyModule: React.FC<WarrantyModuleProps> = ({ projects = [], onOpenClaim }) => {
    const { showToast } = useToast();
    // REGRA #5 — a organização vem do seletor do topo pelo hook, nunca de prop.
    // `null` significa "Todas as organizações" e NUNCA bloqueia o carregamento.
    const { orgId } = useOrgContext();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const confirm = useConfirm();

    const [claims, setClaims]     = React.useState<WarrantyClaim[]>([]);
    const [loading, setLoading]   = React.useState(true);
    const [selected, setSelected] = React.useState<WarrantyClaim | null>(null);
    const [selectedInEdit, setSelectedInEdit] = React.useState(false);
    const [deletingId, setDeletingId] = React.useState<string | null>(null);
    const [showModal, setShowModal] = React.useState(false);
    const [createOrgId, setCreateOrgId] = React.useState<string | undefined>(undefined);
    const [view, setView] = usePersistedState<WarrantyView>('warranty:view', 'chamados');
    const [filterState, setFilterState] = usePersistedState<ClaimState | ''>('warranty:filterState', '');
    const [search, setSearch] = usePersistedState<string>('warranty:search', '');
    const [systems, setSystems] = React.useState<TaxonomySystem[]>([]);
    const [taxonomyLabels, setTaxonomyLabels] = React.useState<TaxonomyLabels>(EMPTY_TAXONOMY_LABELS);
    const [developments, setDevelopments] = React.useState<WarrantyCatalogOption[]>([]);
    const [clients, setClients] = React.useState<WarrantyCatalogOption[]>([]);
    const [obraToDevelopment, setObraToDevelopment] = React.useState<Record<string, { id: string; name: string }>>({});
    const tableColumns = useTableColumns(CLAIM_COLUMNS, 'warrantyClaimsColumns');
    const cols = useResizableColumns(CLAIM_COL_WIDTHS, 'warrantyClaimsColWidths');

    const handleOpenClaim = async () => {
        const target = await resolveWriteOrg('single');
        if (!target || target.kind !== 'org') return;
        setCreateOrgId(target.orgId);
        setShowModal(true);
        onOpenClaim?.();
    };

    /**
     * Carrega o conjunto INTEIRO de chamados da organização — sem o filtro de
     * estado.
     *
     * O filtro por pílula virou client-side em 2026-08-30: mandá-lo ao servidor
     * fazia a aba Análise contar só o estado escolhido na aba Chamados. Busca e
     * ordenação já eram client-side de qualquer forma, e os KPIs agora saem do
     * mesmo array (uma consulta, não duas).
     */
    const load = React.useCallback(async () => {
        setLoading(true);
        try {
            const filters: ClaimFilters = { organization_id: orgId };
            setClaims(await warrantyService.list(filters));
        } catch (e: unknown) {
            showToast('Erro ao carregar chamados de garantia', 'error');
            console.error('[WarrantyModule]', e);
        } finally {
            setLoading(false);
        }
    }, [orgId, showToast]);

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

    // Catálogos dos três vínculos. Cada um com `.catch` próprio: um catálogo
    // indisponível vira select vazio, não tela quebrada.
    React.useEffect(() => {
        let cancelled = false;
        const orgArg = orgId ?? undefined;
        Promise.all([
            empreendimentoService.list(orgArg).catch(e => { console.error('[WarrantyModule] empreendimentos', e); return []; }),
            clientService.listClients(orgArg).catch(e => { console.error('[WarrantyModule] clientes', e); return []; }),
            empreendimentoService.mapObrasToEmpreendimentos(orgId).catch(e => { console.error('[WarrantyModule] mapa obra→empreendimento', e); return {}; }),
        ]).then(([emps, cls, mapa]) => {
            if (cancelled) return;
            setDevelopments(emps.map(e => ({ id: e.id, name: e.name })));
            setClients((cls as { id: string; name: string }[]).map(c => ({ id: c.id, name: c.name })));
            setObraToDevelopment(mapa);
        });
        return () => { cancelled = true; };
    }, [orgId]);

    /**
     * Nome do empreendimento de um chamado.
     *
     * Chamado aberto antes de `development_id` existir não tem o vínculo — aí
     * o nome é DEDUZIDO da obra pelo mapa (`empreendimentos.project_id` +
     * `empreendimento_towers.project_id`). O deduzido é marcado para a tela
     * poder atenuá-lo: é leitura, não dado gravado.
     */
    const developmentNameOf = React.useCallback((claim: WarrantyClaim): { name: string | null; inferido: boolean } => {
        if (claim.development_id) {
            const direto = developments.find(d => d.id === claim.development_id);
            if (direto) return { name: direto.name, inferido: false };
        }
        if (claim.project_id) {
            const viaObra = obraToDevelopment[claim.project_id];
            if (viaObra) return { name: viaObra.name, inferido: true };
        }
        return { name: null, inferido: false };
    }, [developments, obraToDevelopment]);

    /**
     * §22 — abrir o chamado troca a lista pela tela de detalhe no MESMO espaço,
     * então o container rolável é recriado ao voltar e o navegador zera o
     * `scrollTop`. Sem guardar a posição, voltar de um chamado no fim de uma
     * lista longa devolve o usuário à primeira linha.
     */
    const scrollSalvoRef = React.useRef(0);

    const openDetail = (claim: WarrantyClaim, emEdicao = false) => {
        scrollSalvoRef.current = document.querySelector('main')?.scrollTop ?? 0;
        setSelectedInEdit(emEdicao);
        setSelected(claim);
    };

    const closeDetail = () => {
        setSelected(null);
        setSelectedInEdit(false);
        // O container só existe de novo no próximo frame.
        requestAnimationFrame(() => {
            const main = document.querySelector('main');
            if (main) main.scrollTop = scrollSalvoRef.current;
        });
    };

    /**
     * Algo mudou no chamado aberto (edição, triagem, classificação, encerramento).
     *
     * §25 — salvar NÃO fecha: recarrega a lista e troca o chamado selecionado
     * pela versão fresca, permanecendo na tela. Atualizar o selecionado não é
     * cosmético: as RPCs usam `expected_version` para concorrência otimista, e
     * uma segunda ação sobre o objeto antigo mandaria a versão obsoleta e
     * falharia com `P0003`.
     */
    const handleClaimChanged = React.useCallback(async () => {
        try {
            const frescos = await warrantyService.list({ organization_id: orgId });
            setClaims(frescos);
            setSelected(prev => (prev ? frescos.find(c => c.id === prev.id) ?? prev : prev));
        } catch (e: unknown) {
            showToast('Erro ao recarregar o chamado', 'error');
            console.error('[WarrantyModule] refresh', e);
        }
    }, [orgId, showToast]);

    /** Excluído: aí sim volta para a lista — o registro não existe mais. */
    const handleClaimDeleted = (id: string) => {
        setClaims(prev => prev.filter(c => c.id !== id));   // §22
        closeDetail();
    };

    /**
     * Exclusão direto da linha (§9) — sem passar pelo detalhe.
     *
     * `warrantyService.delete` vai pela RPC `delete_warranty_claim`, que confere
     * quantas linhas apagou. O `.delete()` do PostgREST devolvia 200 com corpo
     * vazio tanto ao apagar quanto quando a RLS barrava, e era isso que fazia o
     * botão reportar sucesso sem apagar nada (bug de 2026-08-26).
     */
    const handleDeleteFromRow = async (claim: WarrantyClaim) => {
        if (deletingId) return;
        if (!await confirm({
            title: 'Excluir chamado?',
            message: 'Esta ação não pode ser desfeita. Todo o histórico e evidências serão removidos.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        })) return;
        setDeletingId(claim.id);
        try {
            await warrantyService.delete(claim.id, claim.organization_id);
            // §22 — tira do array local em vez de recarregar a tabela inteira.
            setClaims(prev => prev.filter(c => c.id !== claim.id));
            showToast('Chamado excluído', 'success');
        } catch (e: unknown) {
            showToast('Erro ao excluir chamado', 'error');
            console.error('[DeleteClaim]', e);
        } finally {
            setDeletingId(null);
        }
    };

    const hoje = React.useMemo(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }, []);

    // KPIs e gráficos saem SEMPRE do conjunto inteiro — a pílula de estado da
    // aba Chamados não pode mexer nos números da aba Análise.
    const kpis: WarrantyKPIs = React.useMemo(() => computeWarrantyKPIs(claims), [claims]);

    const analytics = React.useMemo(() => ({
        porSistema: breakdownPor(claims, c => c.taxonomy?.systemCode,
            code => taxonomyLabels.systems[code] ?? code),
        porPatologia: breakdownPor(claims, c => c.taxonomy?.pathologyCode,
            code => taxonomyLabels.pathologies[code] ?? code),
        porOrigem: breakdownPor(claims, c => c.origin,
            code => ORIGIN_LABELS[code as ClaimOrigin] ?? code, 6),
        // Agrupa pelo NOME, não pelo id: os chamados antigos chegam aqui pelo
        // empreendimento deduzido da obra, e misturar as duas origens de id
        // partiria o mesmo empreendimento em duas barras.
        porEmpreendimento: breakdownPor(claims, c => developmentNameOf(c).name, nome => nome),
        // "não acessível", não "removida": o id pode apontar para obra que existe
        // mas é de OUTRA organização — a RLS a esconde e o `find` falha igual.
        // Acontece de verdade em produção com os chamados que vieram do backfill
        // da consolidação de 2026-08-26, que não conferiu a organização.
        porObra: breakdownPor(claims, c => c.project_id,
            id => projects.find(p => p.id === id)?.name ?? 'Obra não acessível'),
        porCliente: breakdownPor(claims, c => c.client_name, nome => nome, 6),
        fluxo: fluxoMensal(claims),
    }), [claims, taxonomyLabels, developmentNameOf, projects]);

    const header = VIEW_HEADERS[view];

    /**
     * Chamado aberto = a tela do chamado SUBSTITUI a lista, no mesmo espaço.
     *
     * O `return` antecipado é o que faz disso uma TELA e não um overlay: o
     * shell (sidebar, topo) segue visível porque quem o desenha é o `AppRouter`
     * — aqui só se troca o conteúdo. O modal de ABRIR chamado continua modal:
     * criar registro é interrupção, não navegação.
     */
    if (selected) {
        return (
            <WarrantyClaimDetail
                claim={selected}
                organizationId={selected.organization_id}
                projects={projects}
                developments={developments}
                clients={clients}
                systems={systems}
                taxonomyLabels={taxonomyLabels}
                initialEditMode={selectedInEdit}
                developmentLabel={developmentNameOf(selected)}
                onClose={closeDetail}
                onRefresh={handleClaimChanged}
                onDeleted={handleClaimDeleted}
            />
        );
    }

    return (
        <div className="space-y-6">
            {/* Cabeçalho — §20. Título e subtítulo mudam com a aba ativa. */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">{header.title}</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">{header.subtitle}</p>
                </div>
                <button
                    onClick={handleOpenClaim}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                >
                    <Plus className="w-[15px] h-[15px]" />
                    Abrir Chamado
                </button>
            </div>

            {/* Toolbar de abas — §19.1. `mb-3` pelo ritmo do §20.1. */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {VIEWS.map(v => (
                        <button
                            key={v.id}
                            onClick={() => setView(v.id)}
                            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                view === v.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            {v.label}
                        </button>
                    ))}
                </div>
            </div>

            {view === 'analise' && (
                <WarrantyAnalytics kpis={kpis} analytics={analytics} loading={loading} total={claims.length} />
            )}

            {view === 'chamados' && (
            <>
            {/* Filtros rápidos por estado — §5.3 */}
            <div className="flex gap-1.5 flex-wrap mb-3">
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
                <div className="p-2 border-b border-gray-100 flex flex-col md:flex-row gap-2.5 items-center">
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

                    const obraLabelOf = (c: WarrantyClaim) =>
                        (c.project_id ? projects.find(p => p.id === c.project_id)?.name ?? '' : '');
                    const developmentLabelOf = (c: WarrantyClaim) => developmentNameOf(c).name ?? '';

                    // O filtro de estado é client-side desde 2026-08-30 (a lista
                    // completa já está em memória, e a aba Análise precisa dela inteira).
                    const byState = filterState ? claims.filter(c => c.state === filterState) : claims;

                    const filteredClaims = !term ? byState : byState.filter(c =>
                        c.sistema_descricao.toLowerCase().includes(term) ||
                        (c.client_name || '').toLowerCase().includes(term) ||
                        (c.unidade_ref || '').toLowerCase().includes(term) ||
                        obraLabelOf(c).toLowerCase().includes(term) ||
                        developmentLabelOf(c).toLowerCase().includes(term) ||
                        pathologyLabelOf(c).toLowerCase().includes(term) ||
                        systemLabelOf(c).toLowerCase().includes(term) ||
                        (c.taxonomy?.pathologyCode || '').toLowerCase().includes(term));
                    const sortKey = tableColumns.sortColumn;
                    const sortedClaims = !sortKey ? filteredClaims : [...filteredClaims].sort((a, b) => {
                        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
                        if (sortKey === 'chamado') return a.sistema_descricao.localeCompare(b.sistema_descricao) * dir;
                        if (sortKey === 'development') return developmentLabelOf(a).localeCompare(developmentLabelOf(b)) * dir;
                        if (sortKey === 'obra') return obraLabelOf(a).localeCompare(obraLabelOf(b)) * dir;
                        // `numeric` para "Apt 10" vir depois de "Apt 9", não antes.
                        if (sortKey === 'unidade') return (a.unidade_ref || '').localeCompare(b.unidade_ref || '', 'pt-BR', { numeric: true }) * dir;
                        if (sortKey === 'cliente') return (a.client_name || '').localeCompare(b.client_name || '') * dir;
                        if (sortKey === 'patologia') return pathologyLabelOf(a).localeCompare(pathologyLabelOf(b)) * dir;
                        if (sortKey === 'state') return a.state.localeCompare(b.state) * dir;
                        if (sortKey === 'severity') return ((SEVERITY_RANK[a.severity] ?? -1) - (SEVERITY_RANK[b.severity] ?? -1)) * dir;
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
                                <button onClick={handleOpenClaim} className="text-sm text-blue-600 font-medium hover:underline">
                                    Abrir primeiro chamado
                                </button>
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
                                        <ClaimRow
                                            key={c.id}
                                            claim={c}
                                            onSelect={claim => openDetail(claim)}
                                            onEdit={claim => openDetail(claim, true)}
                                            onDelete={handleDeleteFromRow}
                                            deleting={deletingId === c.id}
                                            projects={projects}
                                            developmentNameOf={developmentNameOf}
                                            orderedVisibleColumns={orderedVisible}
                                            showActions={tableColumns.visibleColumns.includes('actions')}
                                            taxonomyLabels={taxonomyLabels}
                                            hoje={hoje}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                })()}
            </div>
            </>
            )}

            {/* Modal novo chamado */}
            {showModal && createOrgId && (
                <WarrantyClaimModal
                    organizationId={createOrgId}
                    projects={projects}
                    developments={developments}
                    clients={clients}
                    systems={systems}
                    onClose={() => setShowModal(false)}
                    onSaved={() => { setShowModal(false); load(); }}
                />
            )}

            {orgTargetModal}
        </div>
    );
};

// ── Modal: Abrir Chamado ──────────────────────────────────────────────────────

interface WarrantyClaimModalProps {
    organizationId: string;
    projects?: ProjectOption[];
    developments?: WarrantyCatalogOption[];
    clients?: WarrantyCatalogOption[];
    systems?: TaxonomySystem[];
    initialClaimId?: string;
    onClose: () => void;
    onSaved: () => void;
}

const MAX_EVIDENCE_FILES = 5;

/**
 * Select de vínculo (empreendimento / obra / cliente), com ícone-âncora.
 *
 * Os três dividem o mesmo markup de propósito: são a mesma pergunta ("a que
 * este chamado pertence?") e ler diferente entre si só atrapalharia.
 */
function LinkSelect({ label, icon: Icon, value, onChange, options, placeholder, required, emptyHint }: {
    label: string;
    icon: React.ElementType;
    value: string;
    onChange: (value: string) => void;
    options: WarrantyCatalogOption[];
    placeholder: string;
    required?: boolean;
    /** Mostrado quando o catálogo veio vazio — sem isto o select some sem explicação. */
    emptyHint?: string;
}) {
    return (
        <div>
            <label className={LABEL_CLASS}>{label}{required && ' *'}</label>
            <div className="relative">
                <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <select
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className={SELECT_WITH_ICON_CLASS}
                    required={required}
                >
                    <option value="">{placeholder}</option>
                    {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
            </div>
            {options.length === 0 && emptyHint && (
                <p className="text-xs text-amber-600 mt-1">{emptyHint}</p>
            )}
        </div>
    );
}

export function WarrantyClaimModal({
    organizationId, projects = [], developments = [], clients = [], systems: systemsProp, onClose, onSaved,
}: WarrantyClaimModalProps) {
    const { showToast } = useToast();
    const [terms, setTerms] = React.useState<import('../types/warranty').WarrantyTerm[]>([]);
    const [systems, setSystems] = React.useState<TaxonomySystem[]>(systemsProp ?? []);
    const [submitting, setSubmitting] = React.useState(false);
    const [files, setFiles] = React.useState<File[]>([]);
    const [form, setForm] = React.useState({
        project_id: '',
        development_id: '',
        client_id: '',
        sistema_descricao: '',
        local_afetado: '',
        descricao: '',
        severity: 'media' as const,
        warranty_term_code: '',
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
        if (!form.client_id) {
            showToast('Escolha o cliente do chamado', 'error');
            return;
        }
        setSubmitting(true);
        try {
            // O NOME vai junto do id, como instantâneo: a lista, a busca e o
            // detalhe leem `client_name`, e ele é o que preserva a leitura de um
            // chamado cujo cliente foi renomeado ou removido depois.
            const clientName = clients.find(c => c.id === form.client_id)?.name;
            const { id: claimId } = await warrantyService.open({
                organization_id:    organizationId,
                project_id:         form.project_id || undefined,
                development_id:     form.development_id || undefined,
                client_id:          form.client_id,
                sistema_descricao:  form.sistema_descricao,
                local_afetado:      form.local_afetado || undefined,
                descricao:          form.descricao,
                severity:           form.severity,
                warranty_term_code: form.warranty_term_code || undefined,
                client_name:        clientName,
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
            <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    {/* §21 — título de modal em sentence case, sem uppercase. */}
                    <h2 className="text-lg font-black text-gray-900">Abrir chamado de garantia</h2>
                    <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors" aria-label="Fechar">✕</button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        {/* Os três vínculos, juntos: é a mesma pergunta ("a que
                            este chamado pertence?"). Empreendimento é campo
                            próprio, não derivado da obra — pós-obra acontece
                            depois de a obra encerrar. */}
                        <LinkSelect
                            label="Empreendimento"
                            icon={Landmark}
                            value={form.development_id}
                            onChange={v => setForm(f => ({ ...f, development_id: v }))}
                            options={developments}
                            placeholder="Sem empreendimento"
                            emptyHint="Nenhum empreendimento cadastrado nesta organização."
                        />
                        <LinkSelect
                            label="Obra"
                            icon={Building2}
                            value={form.project_id}
                            onChange={v => setForm(f => ({ ...f, project_id: v }))}
                            options={projects}
                            placeholder="Sem obra vinculada"
                        />
                        <div className="col-span-2">
                            <LinkSelect
                                label="Cliente"
                                icon={User}
                                required
                                value={form.client_id}
                                onChange={v => setForm(f => ({ ...f, client_id: v }))}
                                options={clients}
                                placeholder="Selecionar cliente..."
                                emptyHint="Nenhum cliente cadastrado — cadastre em Minha Organização › Meus Clientes."
                            />
                        </div>
                        <div className="col-span-2">
                            <label className={LABEL_CLASS}>Sistema afetado *</label>
                            <input
                                value={form.sistema_descricao}
                                onChange={e => setForm(f => ({ ...f, sistema_descricao: e.target.value }))}
                                className={FIELD_CLASS}
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
                            <label className={LABEL_CLASS}>Prazo de garantia</label>
                            <select
                                value={form.warranty_term_code}
                                onChange={e => setForm(f => ({ ...f, warranty_term_code: e.target.value }))}
                                className={SELECT_CLASS}
                            >
                                <option value="">Selecionar...</option>
                                {terms.map(t => (
                                    <option key={t.code} value={t.code}>{t.descricao} ({t.prazo_meses} m)</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={LABEL_CLASS}>Origem provável</label>
                            <select
                                value={form.origin}
                                onChange={e => setForm(f => ({ ...f, origin: e.target.value as ClaimOrigin }))}
                                className={SELECT_CLASS}
                            >
                                {(Object.keys(ORIGIN_LABELS) as ClaimOrigin[]).map(o => (
                                    <option key={o} value={o}>{ORIGIN_LABELS[o]}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={LABEL_CLASS}>Severidade</label>
                            <select
                                value={form.severity}
                                onChange={e => setForm(f => ({ ...f, severity: e.target.value as typeof f.severity }))}
                                className={SELECT_CLASS}
                            >
                                <option value="baixa">Baixa</option>
                                <option value="media">Média</option>
                                <option value="alta">Alta</option>
                                <option value="critica">Crítica</option>
                            </select>
                        </div>
                        <div>
                            <label className={LABEL_CLASS}>Local / Cômodo</label>
                            <input
                                value={form.local_afetado}
                                onChange={e => setForm(f => ({ ...f, local_afetado: e.target.value }))}
                                className={FIELD_CLASS}
                                placeholder="Ex: Banheiro suíte"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className={LABEL_CLASS}>Unidade / Apt</label>
                            <input
                                value={form.unidade_ref}
                                onChange={e => setForm(f => ({ ...f, unidade_ref: e.target.value }))}
                                className={FIELD_CLASS}
                                placeholder="Ex: Apt 302 Torre A"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className={LABEL_CLASS}>Descrição do problema *</label>
                            <textarea
                                value={form.descricao}
                                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                                rows={4}
                                className={TEXTAREA_CLASS}
                                placeholder="Descreva detalhadamente o problema relatado..."
                                required
                            />
                        </div>

                        {/* Evidência fotográfica — o módulo de Garantia não tinha
                            anexo na abertura; veio da consolidação de 2026-08-26.
                            Sem foto, a perícia de responsabilidade meses depois
                            não tem em que se apoiar. */}
                        <div className="col-span-2">
                            <label className={LABEL_CLASS}>
                                Fotos e documentos
                                <span className="font-normal text-gray-400"> · até {MAX_EVIDENCE_FILES}</span>
                            </label>
                            <label className="flex items-center justify-center gap-2 h-20 border-2 border-dashed border-gray-200 rounded-[6px] cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition-colors">
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
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className={BTN_SECONDARY}>
                            Cancelar
                        </button>
                        <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
                            {submitting ? 'Abrindo...' : 'Abrir chamado'}
                        </button>
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
    developments?: WarrantyCatalogOption[];
    clients?: WarrantyCatalogOption[];
    systems?: TaxonomySystem[];
    taxonomyLabels?: TaxonomyLabels;
    /** Abre já em edição — usado pelo botão editar da coluna de ações (§9). */
    initialEditMode?: boolean;
    /**
     * Empreendimento já resolvido pelo pai, inclusive o DEDUZIDO da obra.
     * Sem isto a tela mostraria menos que a lista de onde o usuário veio:
     * chamado antigo sem `development_id` aparece com empreendimento na
     * tabela e sem ele aqui.
     */
    developmentLabel?: { name: string | null; inferido: boolean };
    /** Voltar para a lista. */
    onClose: () => void;
    /** Algo mudou: recarregar SEM sair da tela (§25). */
    onRefresh: () => void;
    /** Excluído: o registro sumiu, então volta para a lista. */
    onDeleted?: (id: string) => void;
}

export const WarrantyClaimDetail: React.FC<WarrantyClaimDetailProps> = ({
    claim, organizationId, projects = [], developments = [], clients = [],
    systems = [], taxonomyLabels = EMPTY_TAXONOMY_LABELS, initialEditMode = false,
    developmentLabel, onClose, onRefresh, onDeleted,
}) => {
    const obraName = claim.project_id ? projects.find(p => p.id === claim.project_id)?.name : null;
    // O pai resolve (inclusive a dedução pela obra); o fallback local cobre quem
    // renderiza este detalhe de fora do módulo, sem o mapa.
    const developmentName = developmentLabel?.name
        ?? (claim.development_id ? developments.find(d => d.id === claim.development_id)?.name ?? null : null);
    const developmentInferido = developmentLabel?.inferido ?? false;
    const { showToast } = useToast();
    const confirm = useConfirm();
    const [events, setEvents] = React.useState<import('../types/warranty').WarrantyClaimEvent[]>([]);
    const [visits, setVisits] = React.useState<import('../types/warranty').WarrantyClaimVisit[]>([]);
    const [tab, setTab] = React.useState<'info' | 'visitas' | 'historico'>('info');
    const [triaging, setTriaging] = React.useState(false);
    const [closing, setClosing] = React.useState(false);
    const [npsNota, setNpsNota] = React.useState<number | ''>('');
    const [editMode, setEditMode] = React.useState(initialEditMode);
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
        client_id:         claim.client_id || '',
        unidade_ref:       claim.unidade_ref || '',
        project_id:        claim.project_id || '',
        development_id:    claim.development_id || '',
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
        if (!editForm.client_id) {
            showToast('Escolha o cliente do chamado', 'error');
            return;
        }
        setSaving(true);
        try {
            // `undefined` some do payload do supabase-js e a coluna fica como
            // está; para DESVINCULAR uma obra/empreendimento é preciso mandar
            // `null` explícito.
            await warrantyService.update(claim.id, organizationId, {
                sistema_descricao: editForm.sistema_descricao,
                local_afetado:     editForm.local_afetado || undefined,
                descricao:         editForm.descricao,
                severity:          editForm.severity as WarrantyClaim['severity'],
                client_id:         editForm.client_id,
                client_name:       clients.find(c => c.id === editForm.client_id)?.name,
                unidade_ref:       editForm.unidade_ref || undefined,
                project_id:        (editForm.project_id || null) as string | undefined,
                development_id:    (editForm.development_id || null) as string | undefined,
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
            // Volta para a lista: o registro que esta tela mostra não existe mais.
            if (onDeleted) onDeleted(claim.id); else onClose();
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
        /*
         * TELA, não overlay.
         *
         * "Tela" tem significado específico neste app: troca de conteúdo
         * IN-FLOW no mesmo espaço, com sidebar e shell visíveis e scroll de
         * página normal. NÃO é `fixed inset-0`, NÃO é Sheet, NÃO é modal — os
         * três já foram tentados e rejeitados numa tarefa anterior justamente
         * por não serem "tela". Padrão copiado de `ContractDetailView.tsx`.
         */
        <div className="space-y-6 animate-in fade-in duration-500 pb-4">
            {/* Cabeçalho — seta voltar + <h1> text-2xl (3xl é só topo de lista-raiz, §20) */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                    <button
                        onClick={onClose}
                        className="p-2.5 bg-white border border-gray-200 rounded-[6px] text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm active:scale-95 group shrink-0"
                        title="Voltar para a lista"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`text-xs font-medium ${STATE_COLORS[claim.state]}`}>
                                {STATE_LABELS[claim.state]}
                            </span>
                            <span className="w-1 h-1 bg-gray-300 rounded-full" />
                            <span className={`text-xs font-medium ${SEVERITY_COLORS[claim.severity]}`}>
                                {SEVERITY_LABELS[claim.severity] ?? claim.severity}
                            </span>
                        </div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-tight truncate">
                            {claim.sistema_descricao}
                        </h1>
                        <p className="text-xs font-medium text-gray-400 mt-0.5 truncate">
                            {[developmentName, obraName, claim.unidade_ref, claim.client_name]
                                .filter(Boolean).join(' · ') || 'Sem vínculos'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
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
                </div>
            </div>

            {/* Abas — §19.1: card branco com trilho cinza dentro, h-7, flex-wrap */}
            <div className="bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {([
                        { id: 'info', label: 'Informações' },
                        { id: 'visitas', label: 'Visitas' },
                        { id: 'historico', label: 'Histórico' },
                    ] as const).map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                tab === t.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-6 space-y-4">
                    {tab === 'info' && editMode && (
                        <div className="space-y-3">
                            <p className="text-xs font-black text-blue-700 uppercase tracking-wider">Editando chamado</p>
                            <div className="grid grid-cols-2 gap-3">
                                <LinkSelect
                                    label="Empreendimento"
                                    icon={Landmark}
                                    value={editForm.development_id}
                                    onChange={v => setEditForm(f => ({ ...f, development_id: v }))}
                                    options={developments}
                                    placeholder="Sem empreendimento"
                                />
                                <LinkSelect
                                    label="Obra"
                                    icon={Building2}
                                    value={editForm.project_id}
                                    onChange={v => setEditForm(f => ({ ...f, project_id: v }))}
                                    options={projects}
                                    placeholder="Sem obra vinculada"
                                />
                                <div className="col-span-2">
                                    <LinkSelect
                                        label="Cliente"
                                        icon={User}
                                        required
                                        value={editForm.client_id}
                                        onChange={v => setEditForm(f => ({ ...f, client_id: v }))}
                                        options={clients}
                                        placeholder="Selecionar cliente..."
                                        emptyHint="Nenhum cliente cadastrado — cadastre em Minha Organização › Meus Clientes."
                                    />
                                    {/* Chamado antigo com nome digitado à mão e sem
                                        vínculo: mostra de quem se trata, para quem
                                        edita não escolher o cliente errado. */}
                                    {!editForm.client_id && claim.client_name && (
                                        <p className="text-xs text-amber-600 mt-1">
                                            Registrado como “{claim.client_name}”, sem cliente cadastrado vinculado.
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className={LABEL_CLASS}>Sistema afetado *</label>
                                <input
                                    value={editForm.sistema_descricao}
                                    onChange={e => setEditForm(f => ({ ...f, sistema_descricao: e.target.value }))}
                                    className={FIELD_CLASS}
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={LABEL_CLASS}>Severidade</label>
                                    <select
                                        value={editForm.severity}
                                        onChange={e => setEditForm(f => ({ ...f, severity: e.target.value }))}
                                        className={SELECT_CLASS}
                                    >
                                        <option value="baixa">Baixa</option>
                                        <option value="media">Média</option>
                                        <option value="alta">Alta</option>
                                        <option value="critica">Crítica</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={LABEL_CLASS}>Local / Cômodo</label>
                                    <input
                                        value={editForm.local_afetado}
                                        onChange={e => setEditForm(f => ({ ...f, local_afetado: e.target.value }))}
                                        className={FIELD_CLASS}
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className={LABEL_CLASS}>Unidade / Apt</label>
                                    <input
                                        value={editForm.unidade_ref}
                                        onChange={e => setEditForm(f => ({ ...f, unidade_ref: e.target.value }))}
                                        className={FIELD_CLASS}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className={LABEL_CLASS}>Descrição do problema *</label>
                                <textarea
                                    value={editForm.descricao}
                                    onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))}
                                    rows={4}
                                    className={TEXTAREA_CLASS}
                                    required
                                />
                            </div>
                            <div className="flex gap-2 pt-1">
                                <button
                                    onClick={handleSave}
                                    disabled={saving || !editForm.sistema_descricao || !editForm.descricao || !editForm.client_id}
                                    className={`${BTN_PRIMARY} flex-1`}
                                >
                                    {saving ? 'Salvando...' : 'Salvar alterações'}
                                </button>
                                <button onClick={() => setEditMode(false)} className={BTN_SECONDARY}>
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}

                    {tab === 'info' && !editMode && (
                        <>
                            <div className="bg-gray-50 rounded-[10px] p-4 space-y-2 text-sm">
                                {developmentName && (
                                    <div className="flex justify-between gap-4">
                                        <span className="text-gray-500 font-medium shrink-0">Empreendimento</span>
                                        <span
                                            className={`text-right font-semibold ${developmentInferido ? 'text-gray-400' : 'text-gray-900'}`}
                                            title={developmentInferido ? 'Deduzido da obra; o chamado não tem empreendimento próprio' : undefined}
                                        >
                                            {developmentName}
                                        </span>
                                    </div>
                                )}
                                {obraName && (
                                    <div className="flex justify-between gap-4">
                                        <span className="text-gray-500 font-medium shrink-0">Obra</span>
                                        <span className="text-blue-600 font-semibold text-right">{obraName}</span>
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
                                <p className="text-sm text-gray-700 bg-gray-50 rounded-[10px] p-4 whitespace-pre-wrap">{claim.descricao}</p>
                            </div>

                            {/* Classificação — taxonomia controlada + origem + nota do registro */}
                            <div className="border border-gray-100 rounded-[10px] p-4 space-y-3">
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
                                            <label className={LABEL_CLASS}>Origem provável</label>
                                            <select
                                                value={classForm.origin}
                                                onChange={e => setClassForm(f => ({ ...f, origin: e.target.value as ClaimOrigin }))}
                                                className={SELECT_CLASS}
                                            >
                                                {(Object.keys(ORIGIN_LABELS) as ClaimOrigin[]).map(o => (
                                                    <option key={o} value={o}>{ORIGIN_LABELS[o]}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleClassify}
                                                disabled={savingClass || !classForm.system_code}
                                                className={`${BTN_PRIMARY} flex-1`}
                                            >
                                                {savingClass ? 'Salvando...' : 'Salvar classificação'}
                                            </button>
                                            <button onClick={() => setClassifying(false)} className={BTN_SECONDARY}>Cancelar</button>
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
                                <div className="border border-amber-100 bg-amber-50/40 rounded-[10px] p-4 space-y-3">
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
                                <div className="border border-blue-100 rounded-[10px] p-4 space-y-3">
                                    <p className="text-xs font-semibold text-blue-700">Triagem</p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleTriage(true)}
                                            disabled={triaging}
                                            className="flex-1 inline-flex items-center justify-center h-9 px-3.5 bg-green-600 text-white rounded-[6px] hover:bg-green-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                                        >
                                            Em garantia
                                        </button>
                                        <button
                                            onClick={() => handleTriage(false)}
                                            disabled={triaging}
                                            className="flex-1 inline-flex items-center justify-center h-9 px-3.5 bg-white border border-red-200 text-red-600 rounded-[6px] hover:bg-red-50 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                                        >
                                            Fora de garantia
                                        </button>
                                    </div>
                                </div>
                            )}

                            {['EM_REPARO', 'CONCLUIDO'].includes(claim.state) && (
                                <div className="border border-teal-100 rounded-[10px] p-4 space-y-3">
                                    <p className="text-xs font-bold text-teal-700 uppercase tracking-wider">Encerrar Chamado</p>
                                    <div>
                                        <label className={LABEL_CLASS}>Nota NPS do cliente (0-10)</label>
                                        <input
                                            type="number" min={0} max={10}
                                            value={npsNota}
                                            onChange={e => setNpsNota(e.target.value === '' ? '' : Number(e.target.value))}
                                            className={FIELD_CLASS}
                                        />
                                    </div>
                                    <button
                                        onClick={handleClose}
                                        disabled={closing || npsNota === ''}
                                        className="w-full inline-flex items-center justify-center h-9 px-3.5 bg-teal-600 text-white rounded-[6px] hover:bg-teal-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
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
                                <div key={v.id} className="bg-gray-50 rounded-[10px] p-4 text-sm">
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
    );
};

export default WarrantyModule;
