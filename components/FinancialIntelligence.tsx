import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle, BarChart2, Building2, Calendar, Inbox, Landmark, Pause, Play, Plus,
    RefreshCw, ShieldAlert, TrendingDown, TrendingUp, Wallet, X,
} from 'lucide-react';
import {
    Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer,
    Tooltip as RechartsTooltip, XAxis, YAxis,
} from 'recharts';
import { financialIntelligenceService } from '../services/financialIntelligenceService';
import type {
    CashflowPosition, CashflowProjectionPoint, EntryWithoutProject, FinancialAlert,
    ProjectScorecard, RentalIncome,
} from '../services/financialIntelligenceService';
import { reportScheduleService } from '../services/reportScheduleService';
import type { ReportFrequency, ReportSchedule, ReportType } from '../services/reportScheduleService';
import { KpiCard } from './ui/KpiCard';
import { TabsBar } from './ui/TabsBar';
import StandardTable, { StandardTableColumn } from './ui/StandardTable';
import ActionIconButton from './ui/ActionIconButton';
import { FilterPopover } from './ui/FilterPopover';
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetTitle } from './ui/sheet';
import { usePersistedState } from './ui/TableUtils';
import { useConfirm } from './ui/confirm';
import { useOrgContext, useOrgWriteTarget } from '../hooks/useOrgContext';

// Inteligência Financeira — plano docs/planos/2026-10-21-inteligencia-financeira-numeros-reais.md.
// Todos os números vêm do mesmo livro no banco (fn_fi_ledger): alerta, scorecard
// e projeção não podem divergir entre si. A tela só apresenta.

// ─── formatação ─────────────────────────────────────────────────────────────

const moneyBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Unidade compacta para eixo de gráfico (§28.2) — o valor exato fica no tooltip. */
function compactBRL(v: number) {
    const a = Math.abs(v);
    if (a >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (a >= 1_000) return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
    return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

/** 'YYYY-MM-DD' → 'dd/mm/aa', sem passar por `new Date()` (fuso). */
function fmtDate(iso: string) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y.slice(2)}`;
}

/** Dias entre uma data 'YYYY-MM-DD' e hoje — âncora ao meio-dia contra o fuso. */
function diasDesde(iso: string) {
    const [y, m, d] = iso.split('-').map(Number);
    const data = new Date(y, m - 1, d, 12);
    const hoje = new Date();
    hoje.setHours(12, 0, 0, 0);
    return Math.round((hoje.getTime() - data.getTime()) / 86_400_000);
}

const plural = (n: number, um: string, muitos: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : muitos}`;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// ─── vocabulário ────────────────────────────────────────────────────────────

const SEVERIDADE: Record<FinancialAlert['severity'], { label: string; cor: string; ordem: number }> = {
    HIGH:   { label: 'Alto',  cor: 'text-red-600',   ordem: 0 },
    MEDIUM: { label: 'Médio', cor: 'text-amber-700', ordem: 1 },
    LOW:    { label: 'Baixo', cor: 'text-blue-600',  ordem: 2 },
};

const TIPO_ALERTA: Record<string, string> = {
    OVERDUE_HIGH:    'Inadimplência',
    PAYABLE_OVERDUE: 'Contas a pagar vencidas',
    CASHFLOW_RISK:   'Risco de caixa',
    MARGIN_LOW:      'Margem baixa',
};

const RISCO: Record<ProjectScorecard['risco'], { label: string; cor: string }> = {
    HIGH:   { label: 'Alto',      cor: 'text-red-600' },
    MEDIUM: { label: 'Médio',     cor: 'text-amber-700' },
    OK:     { label: 'Sem risco', cor: 'text-green-700' },
};

type Tab = 'alertas' | 'obras' | 'projecao' | 'fora' | 'agendamento';

const VIEW_HEADERS: Record<Tab, { titulo: string; subtitulo: string }> = {
    alertas: {
        titulo: 'Alertas financeiros',
        subtitulo: 'Títulos vencidos, risco de caixa e margem das obras, calculados sobre os lançamentos do financeiro.',
    },
    obras: {
        titulo: 'Scorecard de obras',
        subtitulo: 'Receita e custo realizados por obra e o que vence nos próximos 90 dias. Venda de unidade conta na obra do empreendimento; aluguel fica fora.',
    },
    projecao: {
        titulo: 'Projeção de caixa',
        subtitulo: 'Saldo dos bancos somado ao que vence a partir de hoje. Títulos já vencidos não entram na conta e aparecem à parte.',
    },
    fora: {
        titulo: 'Locação e lançamentos sem obra',
        subtitulo: 'Renda de aluguel por empreendimento, vendas de empreendimentos sem obra e despesas da empresa — tudo fora da margem das obras.',
    },
    agendamento: {
        titulo: 'Relatórios por e-mail',
        subtitulo: 'Envio periódico dos alertas, do scorecard e da projeção.',
    },
};

const TABS_VALIDAS: Tab[] = ['alertas', 'obras', 'projecao', 'fora', 'agendamento'];

const HORIZONTES = [30, 60, 90, 180] as const;


// ─── cromo de gráfico (§28) ─────────────────────────────────────────────────

const GRID = '#f1f5f9';
const TICK = { fontSize: 11, fill: '#64748b' };
const TOOLTIP_STYLE = {
    backgroundColor: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0',
    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: 12,
};
const SERIE_PRINCIPAL = '#3b82f6';
const SERIE_CONTEXTO = '#94a3b8';
const INITIAL_DIMENSION = { width: 520, height: 200 };

const ChartCard: React.FC<{ title: string; subtitle?: React.ReactNode; children: React.ReactNode }> = ({ title, subtitle, children }) => (
    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        <div className="mt-3">{children}</div>
    </div>
);

const ChartLegend: React.FC<{ items: { label: string; color: string }[] }> = ({ items }) => (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
        {items.map(i => (
            <span key={i.label} className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: i.color }} />
                {i.label}
            </span>
        ))}
    </div>
);

const SaldoTooltip: React.FC<{ active?: boolean; payload?: { payload: CashflowProjectionPoint }[] }> = ({ active, payload }) => {
    const p = payload?.[0]?.payload;
    if (!active || !p) return null;
    return (
        <div style={TOOLTIP_STYLE} className="px-3 py-2">
            <p className="text-gray-500">{fmtDate(p.data_ref)}</p>
            <p className="font-medium text-gray-800">{moneyBRL(p.saldo_acum)}</p>
            {(p.cr_previsto > 0 || p.db_previsto > 0) && (
                <p className="text-gray-500">entra {moneyBRL(p.cr_previsto)} · sai {moneyBRL(p.db_previsto)}</p>
            )}
        </div>
    );
};

interface Periodo { label: string; entradas: number; saidas: number }

const PeriodoTooltip: React.FC<{ active?: boolean; payload?: { payload: Periodo }[] }> = ({ active, payload }) => {
    const p = payload?.[0]?.payload;
    if (!active || !p) return null;
    return (
        <div style={TOOLTIP_STYLE} className="px-3 py-2">
            <p className="text-gray-500">{p.label}</p>
            <p className="font-medium text-gray-800">Entradas {moneyBRL(p.entradas)}</p>
            <p className="font-medium text-gray-800">Saídas {moneyBRL(p.saidas)}</p>
        </div>
    );
};

/** Entradas × saídas por período — SOMA, nunca amostra (amostrar escondia dias
 *  inteiros de movimento). Até 90 dias agrupa por semana; acima, por mês. */
function agruparPorPeriodo(pontos: CashflowProjectionPoint[], horizonte: number): Periodo[] {
    const porMes = horizonte > 90;
    const grupos = new Map<string, Periodo>();
    pontos.forEach((p, i) => {
        const [y, m] = p.data_ref.split('-');
        const chave = porMes ? `${y}-${m}` : String(Math.floor(i / 7));
        const atual = grupos.get(chave) ?? {
            label: porMes ? `${MESES[Number(m) - 1]}/${y.slice(2)}` : `${fmtDate(p.data_ref).slice(0, 5)}`,
            entradas: 0,
            saidas: 0,
        };
        atual.entradas += p.cr_previsto;
        atual.saidas += p.db_previsto;
        grupos.set(chave, atual);
    });
    return [...grupos.values()];
}

/** Valor na ponta da barra (§28.3), em cor de texto. Desenhado à mão porque o
 *  rótulo do Recharts quebra o texto na largura da barra ("R$ / 9 / mil"). */
const RotuloNaPonta = (props: { x?: number | string; y?: number | string; width?: number | string; value?: unknown }) => {
    const v = Number(props.value);
    if (!v) return <g />;
    return (
        <text x={Number(props.x) + Number(props.width) / 2} y={Number(props.y) - 6} textAnchor="middle" fontSize={11} fill="#64748b">
            {compactBRL(v)}
        </text>
    );
};

/** §28 + memória do par de barras: série dupla usa barSize FIXO pela quantidade de pontos. */
const barSizePara = (n: number) => (n <= 12 ? 24 : n <= 24 ? 14 : 10);

// ─── colunas ────────────────────────────────────────────────────────────────

const ALERT_COLUMNS: StandardTableColumn[] = [
    { key: 'severidade', label: 'Severidade', sortable: true, width: 120 },
    { key: 'tipo',       label: 'Tipo',       sortable: true, width: 200 },
    { key: 'alerta',     label: 'Alerta',     sortable: true, width: 560 },
    { key: 'valor',      label: 'Valor',      sortable: true, width: 160, align: 'right' },
];

// Visíveis somam 1.210 px (o teto é ~1.270, ou a última coluna sai da tela). Valor
// em milhão precisa de ~150 px; por isso a decomposição do saldo de 90 dias
// (a receber / a pagar) nasce escondida — o Saldo 90d já a resume.
const OBRA_COLUMNS: StandardTableColumn[] = [
    { key: 'obra',     label: 'Obra',            sortable: true, width: 200 },
    { key: 'receita',  label: 'Receita',         sortable: true, width: 150, align: 'right' },
    { key: 'custo',    label: 'Custo',           sortable: true, width: 150, align: 'right' },
    { key: 'margem',   label: 'Margem',          sortable: true, width: 110, align: 'right' },
    { key: 'ar90',     label: 'A receber 90d',   sortable: true, width: 160, align: 'right', defaultHidden: true },
    { key: 'ap90',     label: 'A pagar 90d',     sortable: true, width: 160, align: 'right', defaultHidden: true },
    { key: 'saldo90',  label: 'Saldo 90d',       sortable: true, width: 150, align: 'right' },
    { key: 'risco',    label: 'Risco',           sortable: true, width: 130 },
    { key: 'arv',      label: 'Vencido receber', sortable: true, width: 160, align: 'right' },
    { key: 'apv',      label: 'Vencido pagar',   sortable: true, width: 160, align: 'right' },
];

const LOCACAO_COLUMNS: StandardTableColumn[] = [
    { key: 'empreendimento', label: 'Empreendimento', sortable: true, width: 280 },
    { key: 'recebido',       label: 'Recebido',       sortable: true, width: 150, align: 'right' },
    { key: 'custo',          label: 'Custo',          sortable: true, width: 140, align: 'right' },
    { key: 'liquido',        label: 'Líquido',        sortable: true, width: 150, align: 'right' },
    { key: 'ar90',           label: 'A receber 90d',  sortable: true, width: 170, align: 'right' },
    { key: 'vencido',        label: 'Vencido',        sortable: true, width: 150, align: 'right' },
];

const SEM_OBRA_COLUMNS: StandardTableColumn[] = [
    { key: 'tipo',           label: 'Tipo',            sortable: true, width: 180 },
    { key: 'empreendimento', label: 'Empreendimento',  sortable: true, width: 240 },
    { key: 'categoria',      label: 'Categoria',       sortable: true, width: 240 },
    { key: 'realizado',      label: 'Realizado',       sortable: true, width: 150, align: 'right' },
    { key: 'avencer',        label: 'A vencer 90d',    sortable: true, width: 165, align: 'right' },
    { key: 'vencido',        label: 'Vencido',         sortable: true, width: 150, align: 'right' },
    { key: 'qtd',            label: 'Títulos',         sortable: true, width: 100, align: 'right' },
];

const AGENDA_COLUMNS: StandardTableColumn[] = [
    { key: 'nome',          label: 'Nome',          sortable: true, width: 240 },
    { key: 'frequencia',    label: 'Frequência',    sortable: true, width: 190 },
    { key: 'conteudo',      label: 'Conteúdo',      sortable: true, width: 220 },
    // Destinatários = lista de e-mails — sem valor único para ordenar.
    { key: 'destinatarios', label: 'Destinatários', sortable: false, width: 260 },
    { key: 'ultimo',        label: 'Último envio',  sortable: true, width: 150 },
    { key: 'situacao',      label: 'Situação',      sortable: true, width: 110 },
];

type TipoSemObra = '' | 'DESPESA' | 'RECEITA' | 'VENDA';
const TIPO_SEM_OBRA_OPTIONS: { value: TipoSemObra; label: string }[] = [
    { value: '', label: 'Todos' },
    { value: 'DESPESA', label: 'Despesa da empresa' },
    { value: 'RECEITA', label: 'Receita da empresa' },
    { value: 'VENDA', label: 'Venda sem obra' },
];
const tipoSemObra = (e: EntryWithoutProject): Exclude<TipoSemObra, ''> =>
    e.natureza === 'VENDA' ? 'VENDA' : e.direction === 'DEBIT' ? 'DESPESA' : 'RECEITA';

const valorCls = 'block text-sm font-medium text-gray-800 tabular-nums';
const textoCls = 'block truncate text-sm font-normal text-gray-700';
const mutedCls = 'text-sm font-normal text-gray-600';

const Money: React.FC<{ v: number; negativoVermelho?: boolean }> = ({ v, negativoVermelho }) => (
    <span className={`${valorCls} ${negativoVermelho && v < 0 ? 'text-red-600' : ''}`}>{moneyBRL(v)}</span>
);

/** Linha de totais do StandardTable — UMA célula com os totais rotulados (mesmo
 *  desenho de TelaAreasNbr12721). Uma célula por coluna desalinharia assim que o
 *  usuário escondesse ou arrastasse uma coluna. */
const linhaDeTotais = (partes: [string, number][]) => (visiveis: number) => (
    <tr className="border-t border-gray-200 bg-white">
        <td colSpan={visiveis} className="px-6 py-2.5 text-sm font-medium text-gray-800">
            <span className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
                <span>Total</span>
                <span className="flex flex-wrap gap-x-6 tabular-nums">
                    {partes.map(([rotulo, valor]) => (
                        <span key={rotulo}>
                            <span className="font-normal text-gray-500">{rotulo}</span> {moneyBRL(valor)}
                        </span>
                    ))}
                </span>
            </span>
        </td>
    </tr>
);

// ─── agendamentos ───────────────────────────────────────────────────────────

const FREQ_LABEL: Record<ReportFrequency, string> = { DAILY: 'Diário', WEEKLY: 'Semanal', MONTHLY: 'Mensal' };
const DIA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const CONTEUDO_LABEL: Record<ReportType, string> = { ALERTS: 'Alertas', SCORECARD: 'Scorecard', CASHFLOW: 'Projeção' };

function frequenciaTexto(s: ReportSchedule) {
    const hora = `${String(s.hour).padStart(2, '0')}h`;
    if (s.frequency === 'WEEKLY' && s.day_of_week != null) return `Semanal · ${DIA_SEMANA[s.day_of_week]} · ${hora}`;
    if (s.frequency === 'MONTHLY' && s.day_of_month != null) return `Mensal · dia ${s.day_of_month} · ${hora}`;
    return `${FREQ_LABEL[s.frequency]} · ${hora}`;
}

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const ERRO = 'text-xs text-red-600';

type FormAgenda = Pick<ReportSchedule, 'name' | 'frequency' | 'hour' | 'recipients' | 'report_types'> & {
    day_of_week: number; day_of_month: number;
};

const FORM_VAZIO: FormAgenda = {
    name: '', frequency: 'WEEKLY', day_of_week: 1, day_of_month: 1, hour: 8,
    recipients: [], report_types: ['ALERTS', 'SCORECARD', 'CASHFLOW'],
};

const AgendamentoSheet: React.FC<{
    open: boolean;
    organizationId: string | null;
    inicial: ReportSchedule | null;
    onClose: () => void;
    onSaved: (s: ReportSchedule, criado: boolean) => void;
}> = ({ open, organizationId, inicial, onClose, onSaved }) => {
    const [form, setForm] = useState<FormAgenda>(FORM_VAZIO);
    const [email, setEmail] = useState('');
    const [erros, setErros] = useState<Partial<Record<'name' | 'recipients' | 'report_types' | 'email' | 'geral', string>>>({});
    const [dirty, setDirty] = useState(false);
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        if (!open) return;
        setForm(inicial ? {
            name: inicial.name, frequency: inicial.frequency, hour: inicial.hour,
            recipients: [...inicial.recipients], report_types: [...inicial.report_types],
            day_of_week: inicial.day_of_week ?? 1, day_of_month: inicial.day_of_month ?? 1,
        } : FORM_VAZIO);
        setEmail(''); setErros({}); setDirty(false);
    }, [open, inicial]);

    const set = <K extends keyof FormAgenda>(k: K, v: FormAgenda[K]) => {
        setForm(f => ({ ...f, [k]: v }));
        setDirty(true);
    };

    const adicionarEmail = () => {
        const e = email.trim().toLowerCase();
        if (!e) return;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setErros(x => ({ ...x, email: 'E-mail inválido.' })); return; }
        if (!form.recipients.includes(e)) set('recipients', [...form.recipients, e]);
        setEmail('');
        setErros(x => ({ ...x, email: undefined, recipients: undefined }));
    };

    const salvar = async () => {
        const novos: typeof erros = {};
        if (!form.name.trim()) novos.name = 'Dê um nome ao agendamento.';
        if (form.recipients.length === 0) novos.recipients = 'Adicione pelo menos um destinatário.';
        if (form.report_types.length === 0) novos.report_types = 'Escolha pelo menos um conteúdo.';
        setErros(novos);
        if (Object.keys(novos).length > 0) return;
        const orgDoRegistro = inicial?.organization_id ?? organizationId;
        if (!orgDoRegistro) { setErros({ geral: 'Escolha a organização do agendamento.' }); return; }
        setSalvando(true);
        try {
            const salvo = await reportScheduleService.save({
                ...(inicial ? { id: inicial.id, is_active: inicial.is_active } : { is_active: true }),
                organization_id: orgDoRegistro,
                name: form.name.trim(),
                frequency: form.frequency,
                hour: form.hour,
                day_of_week: form.frequency === 'WEEKLY' ? form.day_of_week : null,
                day_of_month: form.frequency === 'MONTHLY' ? form.day_of_month : null,
                recipients: form.recipients,
                report_types: form.report_types,
            });
            setDirty(false);
            onSaved(salvo, !inicial);
        } catch (e) {
            setErros({ geral: e instanceof Error ? e.message : 'Não foi possível salvar o agendamento.' });
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="md" dirty={dirty}>
            {open && (
                <>
                    <SheetHeader onClose={onClose}>
                        <SheetTitle>{inicial ? 'Editar agendamento' : 'Novo agendamento'}</SheetTitle>
                        <SheetDescription>Relatório da Inteligência Financeira enviado por e-mail.</SheetDescription>
                    </SheetHeader>
                    <SheetPanel className="p-6">
                        <div className="space-y-8">
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="fi-ag-nome">Nome</label>
                                    <input id="fi-ag-nome" className={CAMPO} value={form.name}
                                        onChange={e => set('name', e.target.value)} placeholder="Ex.: Relatório semanal da diretoria" />
                                    {erros.name && <p className={ERRO}>{erros.name}</p>}
                                </div>
                                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                    <div className="space-y-1.5">
                                        <label className={ROTULO} htmlFor="fi-ag-freq">Frequência</label>
                                        <select id="fi-ag-freq" className={CAMPO} value={form.frequency}
                                            onChange={e => set('frequency', e.target.value as ReportFrequency)}>
                                            <option value="DAILY">Diário</option>
                                            <option value="WEEKLY">Semanal</option>
                                            <option value="MONTHLY">Mensal</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className={ROTULO} htmlFor="fi-ag-hora">Horário (Brasília)</label>
                                        <select id="fi-ag-hora" className={CAMPO} value={form.hour}
                                            onChange={e => set('hour', Number(e.target.value))}>
                                            {Array.from({ length: 24 }, (_, h) => (
                                                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                                            ))}
                                        </select>
                                    </div>
                                    {form.frequency === 'WEEKLY' && (
                                        <div className="space-y-1.5">
                                            <label className={ROTULO} htmlFor="fi-ag-dow">Dia da semana</label>
                                            <select id="fi-ag-dow" className={CAMPO} value={form.day_of_week}
                                                onChange={e => set('day_of_week', Number(e.target.value))}>
                                                {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((d, i) => (
                                                    <option key={d} value={i}>{d}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                    {form.frequency === 'MONTHLY' && (
                                        <div className="space-y-1.5">
                                            <label className={ROTULO} htmlFor="fi-ag-dom">Dia do mês</label>
                                            <select id="fi-ag-dom" className={CAMPO} value={form.day_of_month}
                                                onChange={e => set('day_of_month', Number(e.target.value))}>
                                                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                                                    <option key={d} value={d}>{d}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-3">Conteúdo do e-mail</h3>
                                <div className="flex flex-wrap gap-x-6 gap-y-2">
                                    {(Object.keys(CONTEUDO_LABEL) as ReportType[]).map(t => (
                                        <label key={t} className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                            <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                checked={form.report_types.includes(t)}
                                                onChange={() => set('report_types', form.report_types.includes(t)
                                                    ? form.report_types.filter(x => x !== t)
                                                    : [...form.report_types, t])} />
                                            {CONTEUDO_LABEL[t]}
                                        </label>
                                    ))}
                                </div>
                                {erros.report_types && <p className={ERRO}>{erros.report_types}</p>}
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-3">Destinatários</h3>
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="fi-ag-email">E-mail</label>
                                    <div className="flex gap-2">
                                        <input id="fi-ag-email" className={CAMPO} value={email} placeholder="nome@empresa.com.br"
                                            onChange={e => setEmail(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarEmail(); } }} />
                                        <button type="button" onClick={adicionarEmail}
                                            className="h-9 px-3.5 shrink-0 bg-white border border-gray-200 rounded-[6px] text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-all active:scale-95">
                                            Adicionar
                                        </button>
                                    </div>
                                    {erros.email && <p className={ERRO}>{erros.email}</p>}
                                    {erros.recipients && <p className={ERRO}>{erros.recipients}</p>}
                                </div>
                                {form.recipients.length > 0 && (
                                    <ul className="flex flex-wrap gap-1.5">
                                        {form.recipients.map(r => (
                                            <li key={r} className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1 bg-gray-50 border border-gray-200 rounded-[6px] text-sm text-gray-700">
                                                {r}
                                                <button type="button" title={`Remover ${r}`}
                                                    onClick={() => set('recipients', form.recipients.filter(x => x !== r))}
                                                    className="p-0.5 rounded-[4px] text-gray-400 hover:text-red-600 hover:bg-red-50">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            {erros.geral && <p className={ERRO}>{erros.geral}</p>}
                        </div>
                    </SheetPanel>
                    <SheetFooter>
                        <button type="button" onClick={onClose}
                            className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">
                            Cancelar
                        </button>
                        <button type="button" onClick={salvar} disabled={salvando}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50">
                            {salvando ? 'Salvando…' : inicial ? 'Salvar agendamento' : 'Criar agendamento'}
                        </button>
                    </SheetFooter>
                </>
            )}
        </Sheet>
    );
};

// ─── tela ───────────────────────────────────────────────────────────────────

interface Props {
    /** Navegação do AppRouter — usada pelos alertas para abrir os títulos. */
    onNavigate?: (view: string) => void;
}

interface Dados {
    alerts: FinancialAlert[];
    scorecards: ProjectScorecard[];
    position: CashflowPosition | null;
    rental: RentalIncome[];
    entries: EntryWithoutProject[];
}

const DADOS_VAZIOS: Dados = { alerts: [], scorecards: [], position: null, rental: [], entries: [] };

const FONTE_LABEL: Record<keyof Dados, string> = {
    alerts: 'os alertas', scorecards: 'o scorecard de obras', position: 'o saldo dos bancos',
    rental: 'a renda de locação', entries: 'os lançamentos sem obra',
};

export default function FinancialIntelligence({ onNavigate }: Props) {
    const { orgId } = useOrgContext();
    const confirm = useConfirm();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();

    const [tabSalva, setTab] = usePersistedState<Tab>('financialIntelligence:tab', 'alertas');
    const tab: Tab = TABS_VALIDAS.includes(tabSalva) ? tabSalva : 'alertas';
    const [horizonte, setHorizonte] = usePersistedState<number>('financialIntelligence:horizon', 90);
    const [tipoSemObraFiltro, setTipoSemObraFiltro] = usePersistedState<TipoSemObra>('financialIntelligence:semObraTipo', '');

    const [dados, setDados] = useState<Dados>(DADOS_VAZIOS);
    const [loading, setLoading] = useState(true);
    const [erros, setErros] = useState<string[]>([]);
    const loadSeq = useRef(0);

    const [projecao, setProjecao] = useState<CashflowProjectionPoint[]>([]);
    const [projecaoLoading, setProjecaoLoading] = useState(true);
    const [projecaoErro, setProjecaoErro] = useState<string | null>(null);

    const [agendas, setAgendas] = useState<ReportSchedule[]>([]);
    const [agendasLoading, setAgendasLoading] = useState(false);
    const [agendasErro, setAgendasErro] = useState<string | null>(null);
    const [sheetAberto, setSheetAberto] = useState(false);
    const [editando, setEditando] = useState<ReportSchedule | null>(null);
    const [orgNovaAgenda, setOrgNovaAgenda] = useState<string | null>(null);
    const [enviandoId, setEnviandoId] = useState<string | null>(null);

    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4500);
    }, []);

    // Uma fonte que falha não derruba as outras: cada aba mostra o que carregou
    // e o aviso diz exatamente o que faltou.
    const carregar = useCallback(async () => {
        const seq = ++loadSeq.current;
        setLoading(true);
        const s = financialIntelligenceService;
        const [alerts, scorecards, position, rental, entries] = await Promise.allSettled([
            s.getAlerts(orgId), s.getProjectScorecards(orgId), s.getCashflowPosition(orgId),
            s.getRentalIncome(orgId), s.getEntriesWithoutProject(orgId),
        ]);
        if (seq !== loadSeq.current) return;
        const resultados = { alerts, scorecards, position, rental, entries };
        const novos: string[] = [];
        const proximo = { ...DADOS_VAZIOS } as Dados;
        (Object.keys(resultados) as (keyof Dados)[]).forEach(k => {
            const r = resultados[k];
            if (r.status === 'fulfilled') (proximo as unknown as Record<string, unknown>)[k] = r.value;
            else novos.push(`Não foi possível carregar ${FONTE_LABEL[k]}: ${r.reason instanceof Error ? r.reason.message : String(r.reason?.message ?? r.reason)}`);
        });
        setDados(proximo);
        setErros(novos);
        setLoading(false);
    }, [orgId]);

    useEffect(() => { carregar(); }, [carregar]);

    // Mesmo guarda de resposta fora de ordem: com EMPRESA no topo o contexto troca
    // de null para a org durante o boot, e a resposta de null pode chegar depois.
    const projecaoSeq = useRef(0);
    const carregarProjecao = useCallback(async () => {
        const seq = ++projecaoSeq.current;
        setProjecaoLoading(true);
        setProjecaoErro(null);
        try {
            const pontos = await financialIntelligenceService.getCashflowProjection(orgId, horizonte);
            if (seq === projecaoSeq.current) setProjecao(pontos);
        } catch (e) {
            if (seq !== projecaoSeq.current) return;
            setProjecao([]);
            setProjecaoErro(e instanceof Error ? e.message : 'Não foi possível carregar a projeção.');
        } finally {
            if (seq === projecaoSeq.current) setProjecaoLoading(false);
        }
    }, [orgId, horizonte]);

    useEffect(() => { carregarProjecao(); }, [carregarProjecao]);

    const carregarAgendas = useCallback(async () => {
        setAgendasLoading(true);
        setAgendasErro(null);
        try { setAgendas(await reportScheduleService.list(orgId ?? undefined)); }
        catch (e) { setAgendasErro(e instanceof Error ? e.message : 'Não foi possível carregar os agendamentos.'); }
        finally { setAgendasLoading(false); }
    }, [orgId]);

    useEffect(() => { if (tab === 'agendamento') carregarAgendas(); }, [tab, carregarAgendas]);

    const atualizar = () => { carregar(); carregarProjecao(); if (tab === 'agendamento') carregarAgendas(); };

    // ── derivados ────────────────────────────────────────────────────────────
    const { alerts, scorecards, position, rental, entries } = dados;

    const resumoAlertas = useMemo(() => ({
        alto: alerts.filter(a => a.severity === 'HIGH').length,
        medio: alerts.filter(a => a.severity === 'MEDIUM').length,
        baixo: alerts.filter(a => a.severity === 'LOW').length,
        obrasRisco: scorecards.filter(s => s.risco !== 'OK').length,
    }), [alerts, scorecards]);

    const resumoObras = useMemo(() => {
        const comReceita = scorecards.filter(s => s.tem_receita);
        const rec = comReceita.reduce((a, s) => a + s.receita_realizada, 0);
        const cus = comReceita.reduce((a, s) => a + s.custo_realizado, 0);
        return {
            receita: scorecards.reduce((a, s) => a + s.receita_realizada, 0),
            custo: scorecards.reduce((a, s) => a + s.custo_realizado, 0),
            comReceita: comReceita.length,
            // Ponderada pela receita, só obras com receita: a média simples
            // misturava 99,5% com oito zeros e dava ~11%.
            margem: rec > 0 ? (100 * (rec - cus)) / rec : null,
        };
    }, [scorecards]);

    const totaisObras = useMemo(() => ({
        receita: resumoObras.receita, custo: resumoObras.custo,
        saldo90: scorecards.reduce((a, s) => a + s.saldo_projetado, 0),
        arv: scorecards.reduce((a, s) => a + s.ar_vencido, 0),
        apv: scorecards.reduce((a, s) => a + s.ap_vencido, 0),
    }), [scorecards, resumoObras]);

    const margensObras = useMemo(
        () => scorecards.filter(s => s.tem_receita).sort((a, b) => b.margem_pct - a.margem_pct),
        [scorecards],
    );

    const resumoProjecao = useMemo(() => ({
        entradas: projecao.reduce((a, p) => a + p.cr_previsto, 0),
        saidas: projecao.reduce((a, p) => a + p.db_previsto, 0),
        final: projecao.length > 0 ? projecao[projecao.length - 1].saldo_acum : null,
    }), [projecao]);

    const periodos = useMemo(() => agruparPorPeriodo(projecao, horizonte), [projecao, horizonte]);

    /** O saldo de partida só é confiável com saldo inicial cadastrado e extrato recente. */
    const baseDoSaldo = useMemo(() => {
        if (!position) return null;
        const atraso = position.extrato_ate ? diasDesde(position.extrato_ate) : null;
        const avisos: string[] = [];
        if (position.contas === 0) avisos.push('nenhuma conta bancária cadastrada');
        if (position.contas_sem_saldo_inicial > 0) avisos.push(`${plural(position.contas_sem_saldo_inicial, 'conta', 'contas')} sem saldo inicial`);
        if (atraso != null && atraso > 7) avisos.push(`extrato só até ${fmtDate(position.extrato_ate!)}`);
        return {
            sub: position.extrato_ate ? `Extrato até ${fmtDate(position.extrato_ate)}` : 'Sem extrato importado',
            fraca: avisos.length > 0,
            motivo: avisos.length > 0
                ? `Saldo de partida pouco confiável: ${avisos.join('; ')}. Cadastre o saldo inicial e importe o extrato em Financeiro › Conciliação.`
                : 'Saldo de abertura das contas mais o extrato importado.',
        };
    }, [position]);

    const resumoFora = useMemo(() => ({
        aluguelRecebido: rental.reduce((a, r) => a + r.recebido, 0),
        aluguelVencido: rental.reduce((a, r) => a + r.vencido, 0),
        vendasSemObra: entries.filter(e => e.natureza === 'VENDA' && e.direction === 'CREDIT').reduce((a, e) => a + e.realizado, 0),
        empreendimentosSemObra: new Set(entries.filter(e => e.natureza === 'VENDA').map(e => e.empreendimento_id)).size,
        despesaEmpresa: entries.filter(e => tipoSemObra(e) === 'DESPESA').reduce((a, e) => a + e.realizado, 0),
    }), [rental, entries]);

    const entriesFiltradas = useMemo(
        () => (tipoSemObraFiltro ? entries.filter(e => tipoSemObra(e) === tipoSemObraFiltro) : entries),
        [entries, tipoSemObraFiltro],
    );

    // ── agendamentos ─────────────────────────────────────────────────────────
    const novaAgenda = async () => {
        const alvo = await resolveWriteOrg('single');
        if (!alvo || alvo.kind !== 'org') return;
        setOrgNovaAgenda(alvo.orgId);
        setEditando(null);
        setSheetAberto(true);
    };

    const agendaSalva = (s: ReportSchedule, criado: boolean) => {
        setAgendas(prev => (prev.some(x => x.id === s.id) ? prev.map(x => (x.id === s.id ? s : x)) : [...prev, s]));
        setSheetAberto(false);
        setEditando(null);
        notify(criado ? 'Agendamento criado.' : 'Agendamento salvo.');
    };

    const excluirAgenda = async (s: ReportSchedule) => {
        const ok = await confirm({
            title: 'Excluir agendamento?',
            message: `"${s.name}" deixa de ser enviado. Os e-mails já enviados não são afetados.`,
            variant: 'danger',
            confirmLabel: 'Excluir agendamento',
        });
        if (!ok) return;
        try {
            await reportScheduleService.remove(s.id);
            setAgendas(prev => prev.filter(x => x.id !== s.id));
            notify('Agendamento excluído.');
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Não foi possível excluir.', 'error');
        }
    };

    // "Enviar agora" manda o agendamento mesmo pausado — quem clica está pedindo.
    // A Edge confere que o usuário é membro da organização DO agendamento.
    const enviarAgora = async (s: ReportSchedule) => {
        setEnviandoId(s.id);
        try {
            const r = await reportScheduleService.sendNow(s.organization_id, s.id);
            setAgendas(prev => prev.map(x => (x.id === s.id ? { ...x, last_sent_at: new Date().toISOString() } : x)));
            notify(r.message);
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Não foi possível enviar.', 'error');
        } finally {
            setEnviandoId(null);
        }
    };

    const alternarAgenda = async (s: ReportSchedule) => {
        try {
            await reportScheduleService.toggleActive(s.id, !s.is_active);
            setAgendas(prev => prev.map(x => (x.id === s.id ? { ...x, is_active: !x.is_active } : x)));
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Não foi possível alterar a situação.', 'error');
        }
    };

    // ── KPIs da aba ──────────────────────────────────────────────────────────
    const carregando = (v: string) => (loading ? '…' : v);

    const kpis: React.ReactNode = (() => {
        switch (tab) {
            case 'alertas': return (
                <>
                    <KpiCard label="Alertas críticos" value={carregando(String(resumoAlertas.alto))}
                        sub={`${resumoAlertas.medio} médios · ${resumoAlertas.baixo} baixos`}
                        icon={<ShieldAlert className="w-4 h-4" />} color={resumoAlertas.alto > 0 ? 'red' : 'gray'} />
                    <KpiCard label="A receber vencido" value={carregando(position ? moneyBRL(position.vencido_receber) : '—')}
                        sub={position ? plural(position.vencido_receber_qtd, 'título', 'títulos') : undefined}
                        icon={<TrendingDown className="w-4 h-4" />} color="orange" />
                    <KpiCard label="A pagar vencido" value={carregando(position ? moneyBRL(position.vencido_pagar) : '—')}
                        sub={position ? plural(position.vencido_pagar_qtd, 'título', 'títulos') : undefined}
                        icon={<Wallet className="w-4 h-4" />} color="rose" />
                    <KpiCard label="Obras com risco de caixa" value={carregando(String(resumoAlertas.obrasRisco))}
                        sub="saldo negativo nos próximos 90 dias"
                        icon={<AlertTriangle className="w-4 h-4" />} color={resumoAlertas.obrasRisco > 0 ? 'amber' : 'gray'} />
                </>
            );
            case 'obras': return (
                <>
                    <KpiCard label="Obras com movimento" value={carregando(String(scorecards.length))}
                        icon={<Building2 className="w-4 h-4" />} color="blue" />
                    <KpiCard label="Receita realizada" value={carregando(moneyBRL(resumoObras.receita))}
                        sub="vendas e empreitadas conciliadas" icon={<TrendingUp className="w-4 h-4" />} color="emerald" />
                    <KpiCard label="Custo realizado" value={carregando(moneyBRL(resumoObras.custo))}
                        sub="pagamentos conciliados" icon={<TrendingDown className="w-4 h-4" />} color="orange" />
                    <KpiCard label="Margem das obras"
                        value={carregando(resumoObras.margem == null ? '—' : `${resumoObras.margem.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`)}
                        sub={resumoObras.comReceita === 0 ? 'nenhuma obra com receita' : `ponderada · ${plural(resumoObras.comReceita, 'obra', 'obras')} com receita`}
                        title="Soma de (receita − custo) ÷ soma da receita, só nas obras que já têm receita realizada."
                        icon={<BarChart2 className="w-4 h-4" />}
                        color={resumoObras.margem == null ? 'gray' : resumoObras.margem < 10 ? 'red' : resumoObras.margem < 20 ? 'amber' : 'emerald'} />
                </>
            );
            case 'projecao': return (
                <>
                    <KpiCard label="Saldo dos bancos" value={carregando(position ? moneyBRL(position.saldo_bancario) : '—')}
                        sub={baseDoSaldo?.fraca ? 'base pouco confiável — passe o mouse' : baseDoSaldo?.sub}
                        title={baseDoSaldo?.motivo}
                        icon={<Landmark className="w-4 h-4" />} color={baseDoSaldo?.fraca ? 'amber' : 'blue'} />
                    <KpiCard label={`Saldo em ${horizonte} dias`}
                        value={projecaoLoading ? '…' : resumoProjecao.final == null ? '—' : moneyBRL(resumoProjecao.final)}
                        sub="saldo dos bancos + entradas − saídas"
                        icon={(resumoProjecao.final ?? 0) < 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                        color={(resumoProjecao.final ?? 0) < 0 ? 'red' : 'emerald'} />
                    <KpiCard label="Vencido a receber" value={carregando(position ? moneyBRL(position.vencido_receber) : '—')}
                        sub="fora da projeção" icon={<TrendingDown className="w-4 h-4" />} color="orange" />
                    <KpiCard label="Vencido a pagar" value={carregando(position ? moneyBRL(position.vencido_pagar) : '—')}
                        sub="fora da projeção" icon={<Wallet className="w-4 h-4" />} color="rose" />
                </>
            );
            case 'fora': return (
                <>
                    <KpiCard label="Aluguel recebido" value={carregando(moneyBRL(resumoFora.aluguelRecebido))}
                        icon={<Building2 className="w-4 h-4" />} color="emerald" />
                    <KpiCard label="Aluguel vencido" value={carregando(moneyBRL(resumoFora.aluguelVencido))}
                        icon={<TrendingDown className="w-4 h-4" />} color="orange" />
                    <KpiCard label="Vendas sem obra" value={carregando(moneyBRL(resumoFora.vendasSemObra))}
                        sub={resumoFora.empreendimentosSemObra === 0 ? 'todas as vendas têm obra' : plural(resumoFora.empreendimentosSemObra, 'empreendimento', 'empreendimentos')}
                        icon={<Landmark className="w-4 h-4" />} color="blue" />
                    <KpiCard label="Despesa da empresa" value={carregando(moneyBRL(resumoFora.despesaEmpresa))}
                        sub="paga, sem obra" icon={<Wallet className="w-4 h-4" />} color="rose" />
                </>
            );
            default: return null;
        }
    })();

    const tabs = [
        { id: 'alertas' as const, label: 'Alertas', icon: <ShieldAlert className="w-3.5 h-3.5" />,
            badge: alerts.length || undefined, badgeTom: resumoAlertas.alto > 0 ? 'alerta' as const : undefined },
        { id: 'obras' as const, label: 'Scorecard de obras', icon: <BarChart2 className="w-3.5 h-3.5" /> },
        { id: 'projecao' as const, label: 'Projeção de caixa', icon: <TrendingUp className="w-3.5 h-3.5" /> },
        { id: 'fora' as const, label: 'Locação e sem obra', icon: <Building2 className="w-3.5 h-3.5" /> },
        { id: 'agendamento' as const, label: 'Agendamentos', icon: <Calendar className="w-3.5 h-3.5" /> },
    ];

    const header = VIEW_HEADERS[tab];

    return (
        <div className="space-y-6 pb-20">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">{header.titulo}</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">{header.subtitulo}</p>
                </div>
                <ActionIconButton kind="history" title="Atualizar" onClick={atualizar}
                    icon={<RefreshCw className={`w-4 h-4 ${loading || projecaoLoading ? 'animate-spin' : ''}`} />} />
            </div>

            <TabsBar tabs={tabs} value={tab} onChange={setTab} />

            {/* Projeção: o horizonte DEFINE os KPIs, então a barra de escopo vem antes deles (§5.3). */}
            {tab === 'projecao' && (
                <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                        Horizonte
                        <select value={horizonte} onChange={e => setHorizonte(Number(e.target.value))}
                            className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer">
                            {HORIZONTES.map(h => <option key={h} value={h}>{h} dias</option>)}
                        </select>
                    </label>
                </div>
            )}

            {kpis && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">{kpis}</div>}

            {erros.length > 0 && tab !== 'agendamento' && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-[10px] text-sm text-red-700 space-y-0.5">
                    {erros.map(e => <p key={e}>{e}</p>)}
                </div>
            )}

            {/* ── Alertas ─────────────────────────────────────────────────── */}
            {tab === 'alertas' && (
                <StandardTable<FinancialAlert>
                    storageKey="financialIntelligence:alertas"
                    columns={ALERT_COLUMNS}
                    rows={alerts}
                    rowKey={a => `${a.alert_type}-${a.project_id ?? ''}`}
                    loading={loading}
                    searchText={a => `${a.title} ${a.description} ${TIPO_ALERTA[a.alert_type] ?? a.alert_type}`}
                    searchPlaceholder="Buscar alerta ou obra..."
                    sortValue={(k, a) => k === 'severidade' ? SEVERIDADE[a.severity].ordem
                        : k === 'tipo' ? (TIPO_ALERTA[a.alert_type] ?? a.alert_type)
                        : k === 'valor' ? Math.abs(a.amount ?? 0) : a.title}
                    renderCell={(k, a) => {
                        switch (k) {
                            case 'severidade': return <span className={`text-sm font-normal ${SEVERIDADE[a.severity].cor}`}>{SEVERIDADE[a.severity].label}</span>;
                            case 'tipo': return <span className={textoCls}>{TIPO_ALERTA[a.alert_type] ?? a.alert_type}</span>;
                            case 'alerta': return (
                                <span className="block min-w-0">
                                    <span className={textoCls} title={a.title}>{a.title}</span>
                                    <span className="block text-xs text-gray-500 whitespace-normal">{a.description}</span>
                                </span>
                            );
                            case 'valor': return a.amount == null ? <span className={mutedCls}>—</span> : <Money v={a.amount} negativoVermelho />;
                            default: return null;
                        }
                    }}
                    actions={{
                        width: 170,
                        render: a => {
                            const destino = a.alert_type === 'OVERDUE_HIGH' ? 'contas-a-receber'
                                : a.alert_type === 'PAYABLE_OVERDUE' ? 'contas-a-pagar' : null;
                            if (destino) {
                                return onNavigate ? (
                                    <button onClick={() => onNavigate(destino)}
                                        className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all">
                                        Ver títulos
                                    </button>
                                ) : null;
                            }
                            return (
                                <button onClick={() => setTab('obras')}
                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all">
                                    Ver no scorecard
                                </button>
                            );
                        },
                    }}
                    empty={{
                        icon: <ShieldAlert className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                        title: 'Nenhum alerta',
                        subtitle: 'Todos os indicadores estão dentro dos limites.',
                    }}
                />
            )}

            {/* ── Scorecard de obras ──────────────────────────────────────── */}
            {tab === 'obras' && (
                <>
                    {/* Margem só faz sentido comparando: com menos de 2 obras com receita,
                        o número está no KPI e na tabela (§28.1). */}
                    {margensObras.length >= 2 && (
                        <ChartCard title="Margem por obra" subtitle="(Receita − custo) ÷ receita realizada, nas obras que já têm receita.">
                            <div style={{ height: margensObras.length * 44 + 16 }}>
                                <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                                    <BarChart data={margensObras} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
                                        <CartesianGrid horizontal={false} stroke={GRID} />
                                        <XAxis type="number" axisLine={false} tickLine={false} tick={TICK} tickFormatter={(v: number) => `${v}%`} />
                                        <YAxis type="category" dataKey="project_name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#475569' }} width={160} />
                                        <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={TOOLTIP_STYLE}
                                            formatter={(v: unknown) => [`${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`, 'Margem']} />
                                        <Bar dataKey="margem_pct" fill={SERIE_PRINCIPAL} radius={[0, 4, 4, 0]} maxBarSize={24}
                                            label={{ position: 'right', fontSize: 11, fill: '#64748b', formatter: (v: unknown) => `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` }} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </ChartCard>
                    )}
                    <StandardTable<ProjectScorecard>
                        storageKey="financialIntelligence:obras"
                        columns={OBRA_COLUMNS}
                        rows={scorecards}
                        rowKey={s => s.project_id}
                        loading={loading}
                        searchText={s => s.project_name}
                        searchPlaceholder="Buscar obra..."
                        sortValue={(k, s) => ({
                            obra: s.project_name, receita: s.receita_realizada, custo: s.custo_realizado,
                            margem: s.tem_receita ? s.margem_pct : null, ar90: s.ar_pendente, ap90: s.ap_pendente,
                            saldo90: s.saldo_projetado, risco: s.risco === 'HIGH' ? 0 : s.risco === 'MEDIUM' ? 1 : 2,
                            arv: s.ar_vencido, apv: s.ap_vencido,
                        } as Record<string, string | number | null>)[k]}
                        renderCell={(k, s) => {
                            switch (k) {
                                case 'obra': return <span className={textoCls} title={s.project_name}>{s.project_name}</span>;
                                case 'receita': return <Money v={s.receita_realizada} />;
                                case 'custo': return <Money v={s.custo_realizado} />;
                                case 'margem': return s.tem_receita
                                    ? <span className={`${valorCls} ${s.margem_pct < 0 ? 'text-red-600' : s.margem_pct < 10 ? 'text-amber-700' : ''}`}>
                                        {s.margem_pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                                      </span>
                                    : <span className={mutedCls} title="Sem receita realizada">—</span>;
                                case 'ar90': return <Money v={s.ar_pendente} />;
                                case 'ap90': return <Money v={s.ap_pendente} />;
                                case 'saldo90': return <Money v={s.saldo_projetado} negativoVermelho />;
                                case 'risco': return <span className={`text-sm font-normal ${RISCO[s.risco].cor}`}>{RISCO[s.risco].label}</span>;
                                case 'arv': return <Money v={s.ar_vencido} />;
                                case 'apv': return <Money v={s.ap_vencido} />;
                                default: return null;
                            }
                        }}
                        renderTotals={scorecards.length > 0 ? linhaDeTotais([
                            ['receita', totaisObras.receita], ['custo', totaisObras.custo],
                            ['saldo 90d', totaisObras.saldo90],
                            ['vencido a receber', totaisObras.arv], ['vencido a pagar', totaisObras.apv],
                        ]) : undefined}
                        empty={{
                            icon: <BarChart2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                            title: 'Nenhuma obra com movimento financeiro',
                            subtitle: 'O scorecard lista as obras que têm lançamentos em Contas a Pagar ou a Receber.',
                        }}
                    />
                </>
            )}

            {/* ── Projeção de caixa ───────────────────────────────────────── */}
            {tab === 'projecao' && (
                projecaoErro ? (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-[10px] text-sm text-red-700">
                        Não foi possível carregar a projeção: {projecaoErro}
                    </div>
                ) : projecaoLoading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <ChartCard
                            title={`Saldo projetado — próximos ${horizonte} dias`}
                            subtitle={position
                                ? `Parte de ${moneyBRL(position.saldo_bancario)} nos bancos. Não entram ${moneyBRL(position.vencido_receber)} a receber e ${moneyBRL(position.vencido_pagar)} a pagar já vencidos.`
                                : 'Parte do saldo dos bancos.'}
                        >
                            <div style={{ height: 240 }}>
                                <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                                    {/* Linha, não área: com saldo negativo a área preenchia até o zero,
                                        fora do gráfico, e lia como uma faixa sem sentido. */}
                                    <LineChart data={projecao} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                                        <CartesianGrid vertical={false} stroke={GRID} />
                                        <XAxis dataKey="data_ref" axisLine={false} tickLine={false} tick={TICK}
                                            tickFormatter={(v: string) => fmtDate(v).slice(0, 5)} interval="preserveStartEnd" minTickGap={24} />
                                        <YAxis axisLine={false} tickLine={false} tick={TICK} tickFormatter={compactBRL} width={88} />
                                        <ReferenceLine y={0} stroke="#cbd5e1" />
                                        <RechartsTooltip content={<SaldoTooltip />} cursor={{ stroke: '#cbd5e1' }} />
                                        <Line type="stepAfter" dataKey="saldo_acum" stroke={SERIE_PRINCIPAL} strokeWidth={2}
                                            dot={false} isAnimationActive={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </ChartCard>

                        <ChartCard
                            title={horizonte > 90 ? 'Entradas e saídas por mês' : 'Entradas e saídas por semana'}
                            subtitle={`Títulos em aberto com vencimento no período: entram ${moneyBRL(resumoProjecao.entradas)}, saem ${moneyBRL(resumoProjecao.saidas)}.`}
                        >
                            {resumoProjecao.entradas === 0 && resumoProjecao.saidas === 0 ? (
                                <div className="flex items-center justify-center min-h-[160px] text-sm text-gray-400 text-center px-4">
                                    Nenhum título em aberto vence nos próximos {horizonte} dias.
                                </div>
                            ) : (
                                <>
                                    <ChartLegend items={[{ label: 'Entradas', color: SERIE_PRINCIPAL }, { label: 'Saídas', color: SERIE_CONTEXTO }]} />
                                    <div style={{ height: 200 }}>
                                        <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                                            <BarChart data={periodos} margin={{ top: 20, right: 8, bottom: 0, left: 0 }} barGap={2}>
                                                <CartesianGrid vertical={false} stroke={GRID} />
                                                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={TICK} />
                                                <YAxis axisLine={false} tickLine={false} tick={TICK} tickFormatter={compactBRL} width={88} />
                                                <RechartsTooltip content={<PeriodoTooltip />} cursor={{ fill: '#f8fafc' }} />
                                                {/* §28.3: com 2 séries, só a principal leva o valor na ponta, em cor de texto. */}
                                                <Bar dataKey="entradas" fill={SERIE_PRINCIPAL} radius={[4, 4, 0, 0]} barSize={barSizePara(periodos.length)} isAnimationActive={false}
                                                    label={RotuloNaPonta} />
                                                <Bar dataKey="saidas" fill={SERIE_CONTEXTO} radius={[4, 4, 0, 0]} barSize={barSizePara(periodos.length)} isAnimationActive={false} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </>
                            )}
                        </ChartCard>
                    </div>
                )
            )}

            {/* ── Locação e lançamentos sem obra ──────────────────────────── */}
            {tab === 'fora' && (
                <div className="space-y-6">
                    <div className="space-y-3">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-700">Renda de locação por empreendimento</h3>
                            <p className="text-xs text-gray-400 mt-0.5">Aluguéis e comissões de locação. Ficam fora da margem das obras.</p>
                        </div>
                        <StandardTable<RentalIncome>
                            storageKey="financialIntelligence:locacao"
                            columns={LOCACAO_COLUMNS}
                            rows={rental}
                            rowKey={r => r.empreendimento_id ?? 'sem-empreendimento'}
                            loading={loading}
                            searchText={r => r.empreendimento_nome}
                            searchPlaceholder="Buscar empreendimento..."
                            sortValue={(k, r) => ({
                                empreendimento: r.empreendimento_nome, recebido: r.recebido, custo: r.custo,
                                liquido: r.recebido - r.custo, ar90: r.a_receber_90d, vencido: r.vencido,
                            } as Record<string, string | number>)[k]}
                            renderCell={(k, r) => {
                                switch (k) {
                                    case 'empreendimento': return <span className={textoCls} title={r.empreendimento_nome}>{r.empreendimento_nome}</span>;
                                    case 'recebido': return <Money v={r.recebido} />;
                                    case 'custo': return <Money v={r.custo} />;
                                    case 'liquido': return <Money v={r.recebido - r.custo} negativoVermelho />;
                                    case 'ar90': return <Money v={r.a_receber_90d} />;
                                    case 'vencido': return <Money v={r.vencido} />;
                                    default: return null;
                                }
                            }}
                            renderTotals={rental.length > 0 ? linhaDeTotais([
                                ['recebido', resumoFora.aluguelRecebido],
                                ['líquido', rental.reduce((a, r) => a + r.recebido - r.custo, 0)],
                                ['a receber 90d', rental.reduce((a, r) => a + r.a_receber_90d, 0)],
                                ['vencido', resumoFora.aluguelVencido],
                            ]) : undefined}
                            empty={{
                                icon: <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                                title: 'Nenhuma locação com lançamentos',
                                subtitle: 'Aparecem aqui os contratos de locação que já geraram parcelas no financeiro.',
                            }}
                        />
                    </div>

                    <div className="space-y-3">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-700">Lançamentos sem obra</h3>
                            <p className="text-xs text-gray-400 mt-0.5">
                                Despesas e receitas da empresa e vendas de empreendimentos sem obra. Nem todo empreendimento tem obra — isso não é pendência de cadastro.
                            </p>
                        </div>
                        <StandardTable<EntryWithoutProject>
                            storageKey="financialIntelligence:semObra"
                            columns={SEM_OBRA_COLUMNS}
                            rows={entriesFiltradas}
                            rowKey={e => `${e.direction}-${e.natureza ?? ''}-${e.empreendimento_id ?? ''}-${e.categoria}`}
                            loading={loading}
                            searchText={e => `${e.categoria} ${e.empreendimento_nome ?? ''}`}
                            searchPlaceholder="Buscar categoria ou empreendimento..."
                            filters={
                                <FilterPopover<TipoSemObra>
                                    label="Tipo"
                                    value={tipoSemObraFiltro}
                                    onChange={setTipoSemObraFiltro}
                                    options={TIPO_SEM_OBRA_OPTIONS}
                                />
                            }
                            sortValue={(k, e) => ({
                                tipo: TIPO_SEM_OBRA_OPTIONS.find(o => o.value === tipoSemObra(e))?.label ?? '',
                                empreendimento: e.empreendimento_nome ?? '', categoria: e.categoria,
                                realizado: e.realizado, avencer: e.a_vencer_90d, vencido: e.vencido, qtd: e.qtd,
                            } as Record<string, string | number>)[k]}
                            renderCell={(k, e) => {
                                switch (k) {
                                    case 'tipo': {
                                        const t = tipoSemObra(e);
                                        return <span className={`text-sm font-normal ${t === 'DESPESA' ? 'text-rose-700' : t === 'VENDA' ? 'text-blue-700' : 'text-green-700'}`}>
                                            {TIPO_SEM_OBRA_OPTIONS.find(o => o.value === t)?.label}
                                        </span>;
                                    }
                                    case 'empreendimento': return e.empreendimento_nome
                                        ? <span className={textoCls} title={e.empreendimento_nome}>{e.empreendimento_nome}</span>
                                        : <span className={mutedCls}>—</span>;
                                    case 'categoria': return <span className={textoCls} title={e.categoria}>{e.categoria}</span>;
                                    case 'realizado': return <Money v={e.realizado} />;
                                    case 'avencer': return <Money v={e.a_vencer_90d} />;
                                    case 'vencido': return <Money v={e.vencido} />;
                                    case 'qtd': return <span className={`${mutedCls} block tabular-nums`}>{e.qtd.toLocaleString('pt-BR')}</span>;
                                    default: return null;
                                }
                            }}
                            empty={{
                                icon: <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                                title: tipoSemObraFiltro ? 'Nada deste tipo' : 'Todos os lançamentos têm obra',
                                subtitle: tipoSemObraFiltro ? 'Troque o filtro "Tipo" para ver os demais.' : undefined,
                            }}
                        />
                    </div>
                </div>
            )}

            {/* ── Agendamentos ────────────────────────────────────────────── */}
            {tab === 'agendamento' && (
                <>
                    {agendasErro && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-[10px] text-sm text-red-700">{agendasErro}</div>
                    )}
                    <StandardTable<ReportSchedule>
                        storageKey="financialIntelligence:agendamentos"
                        columns={AGENDA_COLUMNS}
                        rows={agendas}
                        rowKey={s => s.id}
                        loading={agendasLoading}
                        searchText={s => `${s.name} ${s.recipients.join(' ')}`}
                        searchPlaceholder="Buscar agendamento ou destinatário..."
                        sortValue={(k, s) => ({
                            nome: s.name, frequencia: frequenciaTexto(s),
                            conteudo: s.report_types.map(t => CONTEUDO_LABEL[t]).join(', '),
                            ultimo: s.last_sent_at ?? '', situacao: s.is_active ? 0 : 1,
                        } as Record<string, string | number>)[k]}
                        onRowClick={s => { setEditando(s); setSheetAberto(true); }}
                        renderCell={(k, s) => {
                            switch (k) {
                                case 'nome': return <span className={textoCls} title={s.name}>{s.name}</span>;
                                case 'frequencia': return <span className={mutedCls}>{frequenciaTexto(s)}</span>;
                                case 'conteudo': return <span className={textoCls}>{s.report_types.map(t => CONTEUDO_LABEL[t]).join(', ')}</span>;
                                case 'destinatarios': {
                                    const lista = s.recipients.join(', ');
                                    return <span className={textoCls} title={lista}>{lista}</span>;
                                }
                                case 'ultimo': return <span className={mutedCls}>
                                    {s.last_sent_at ? new Date(s.last_sent_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                                </span>;
                                case 'situacao': return <span className={`text-sm font-normal ${s.is_active ? 'text-green-700' : 'text-gray-600'}`}>
                                    {s.is_active ? 'Ativo' : 'Pausado'}
                                </span>;
                                default: return null;
                            }
                        }}
                        actions={{
                            width: 150,
                            render: s => (
                                <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                    {/* desligado durante o envio: o title vai no span, porque o botão
                                        desligado não recebe hover */}
                                    <span className="inline-flex" title={enviandoId === s.id ? 'Enviando…' : 'Enviar agora'}>
                                        <ActionIconButton kind="mail" title={enviandoId === s.id ? 'Enviando…' : 'Enviar agora'}
                                            disabled={enviandoId !== null}
                                            icon={enviandoId === s.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : undefined}
                                            onClick={() => enviarAgora(s)} />
                                    </span>
                                    <ActionIconButton kind="settings" title={s.is_active ? 'Pausar' : 'Ativar'}
                                        icon={s.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                        onClick={() => alternarAgenda(s)} />
                                    {/* Sem botão Editar: o clique na linha já edita (§9.1). */}
                                    <ActionIconButton kind="delete" onClick={() => excluirAgenda(s)} />
                                </div>
                            ),
                        }}
                        toolbarRight={
                            <button onClick={novaAgenda}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0">
                                <Plus className="w-[15px] h-[15px]" />
                                Novo agendamento
                            </button>
                        }
                        empty={{
                            icon: <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                            title: 'Nenhum agendamento',
                            subtitle: 'Crie um para receber os alertas, o scorecard e a projeção por e-mail.',
                        }}
                    />
                </>
            )}

            <AgendamentoSheet
                open={sheetAberto}
                organizationId={editando?.organization_id ?? orgNovaAgenda}
                inicial={editando}
                onClose={() => { setSheetAberto(false); setEditando(null); }}
                onSaved={agendaSalva}
            />

            {toast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium ${
                    toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    {toast.message}
                </div>
            )}

            {orgTargetModal}
        </div>
    );
}
