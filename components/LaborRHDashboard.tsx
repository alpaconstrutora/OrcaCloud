import React, { useState } from 'react';
import {
    Users, DollarSign, AlertTriangle, HardHat, BookOpen, Umbrella, FileText,
    Activity, Calendar, Clock, RefreshCw, ChevronRight, ArrowRight, CheckCircle2,
} from 'lucide-react';
import { KpiCard, type KpiTom } from './ui/KpiCard';
import { useQuery } from '@tanstack/react-query';
import { laborService, RhKpis, RhVencido, Employee } from '../services/laborService';
import { payrollService } from '../services/payrollService';
import { hojeLocal } from '../utils/baixaRecebivel';
import { hrAnalyticsService } from '../services/hrAnalyticsService';
import { laborKeys } from '../lib/queryKeys';
import { STALE } from '../lib/queryClient';

/*
 * Dashboard RH — a ENTRADA do RH: "como está o mês e o que exige ação".
 * Painel analítico (guia §4.5 / §4.5.1), em três faixas, na ordem de leitura:
 *   1. Pendências — só as que existem; cada linha leva à tela onde se resolve.
 *   2. O mês — 4 indicadores `destaque` (cor só por meta) + faixa de apoio neutra.
 *   3. Distribuição — barras horizontais (§28): função e custo da folha por obra.
 * Plano: docs/planos/2026-10-28-dashboard-rh-numeros-e-paineis.md (passo 5).
 */

// ── Meta (limiar) ────────────────────────────────────────────────────────────

// O limite é a META da organização (hr_targets, editada em BI Analytics RH ›
// Metas), nunca um número fixo no código. Em "Todas" não há veredito — cada org
// tem a sua meta; sem meta cadastrada, a tela pede para definir em vez de julgar.
/** Acima da meta é ATENÇÃO, não alarme: a meta é hipótese de gestão (§4.5). */
const TOM_ACIMA_DA_META: KpiTom = 'atencao';

type Veredito = { texto?: string; tom: KpiTom; definirMeta: boolean };

const vereditoPelaMeta = (valor: number, meta: number | null | undefined, comOrg: boolean): Veredito => {
    if (!comOrg) return { tom: 'neutro', definirMeta: false };
    if (meta == null) return { texto: 'sem meta definida', tom: 'neutro', definirMeta: true };
    const metaTxt = `${meta.toLocaleString('pt-BR')}%`;
    return valor > meta
        ? { texto: `acima da meta (${metaTxt})`, tom: TOM_ACIMA_DA_META, definirMeta: false }
        : { texto: `dentro da meta (${metaTxt})`, tom: 'neutro', definirMeta: false };
};

// ── Formatação ───────────────────────────────────────────────────────────────

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** 'AAAA-MM' → 'set/26' */
const competenciaCurta = (c: string) => `${MESES[Number(c.slice(5, 7)) - 1]}/${c.slice(2, 4)}`;
const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
/** 'AAAA-MM-DD' → 'dd/mm/aaaa' por split (new Date(str) volta um dia em Brasília). */
const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

// ── Peças de faixa (mesmas do FinancialDashboard, §4.5.1) ─────────────────────

const FaixaTitulo: React.FC<{ id: string; titulo: string; resumo?: string; children?: React.ReactNode }> = ({ id, titulo, resumo, children }) => (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id={id} className="text-base font-semibold text-gray-900">
            {titulo}
            {resumo && <span className="font-normal text-gray-500"> · {resumo}</span>}
        </h2>
        {children}
    </div>
);

const LinkDeAcao: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
    <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800 rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
    >
        {children}
        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
    </button>
);

const CartoesCarregando: React.FC<{ quantos: number; grade: string; rotulo: string }> = ({ quantos, grade, rotulo }) => (
    <div className={`grid gap-3 ${grade}`} aria-busy="true" aria-label={rotulo}>
        {Array.from({ length: quantos }, (_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 px-4 py-3.5 h-[104px]">
                <div className="h-3 w-1/2 rounded bg-gray-100 animate-pulse" />
                <div className="h-6 w-2/3 rounded bg-gray-100 animate-pulse mt-3" />
                <div className="h-3 w-3/4 rounded bg-gray-100 animate-pulse mt-3" />
            </div>
        ))}
    </div>
);

const FalhaDaFaixa: React.FC<{ oQue: string; motivo?: string; onRetry: () => void }> = ({ oQue, motivo, onRetry }) => (
    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm px-4 py-6 text-sm text-gray-600 text-center">
        Não foi possível carregar {oQue}.{motivo ? ` ${motivo}` : ''}{' '}
        <button type="button" onClick={onRetry} className="text-blue-600 hover:text-blue-800 font-medium rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Tentar de novo</button>
    </div>
);

// ── Pendências ───────────────────────────────────────────────────────────────

interface Pendencia {
    chave: string;
    count: number;
    rotulo: string;
    icon: React.ElementType;
    /** `alerta` = já venceu / dinheiro ou obra em risco; `atencao` = prazo correndo. */
    tom: 'alerta' | 'atencao';
    acao: string;
    onClick: () => void;
    itens?: RhVencido[];
}

/** Uma linha por pendência que EXISTE (zerada não aparece — era 50% de opacidade no
 *  meio da tela). A linha inteira é o botão; o texto da ação diz para onde vai. */
const LinhaDePendencia: React.FC<{ p: Pendencia }> = ({ p }) => {
    const Icon = p.icon;
    const cor = p.tom === 'alerta'
        ? { icone: 'text-red-600', numero: 'text-red-700' }
        : { icone: 'text-amber-600', numero: 'text-amber-700' };
    return (
        <li>
            <button
                type="button"
                onClick={p.onClick}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
            >
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cor.icone}`} aria-hidden="true" />
                <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-900">{p.rotulo}</span>
                    {(p.itens ?? []).map((v, i) => (
                        <span key={i} className="block text-sm text-gray-600 mt-0.5 [text-wrap:pretty]">
                            {v.nome.replace(/\s+/g, ' ')} — venceu em {dataBr(v.data)}{v.detalhe ? ` · ${v.detalhe}` : ''}
                        </span>
                    ))}
                    {p.itens && p.count > p.itens.length && p.itens.length > 0 && (
                        <span className="block text-sm text-gray-600 mt-0.5">e mais {p.count - p.itens.length}</span>
                    )}
                    <span className="inline-flex items-center gap-1 mt-1 text-sm font-medium text-blue-600">
                        {p.acao}
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                </span>
                <span className={`text-lg font-semibold tabular-nums shrink-0 ${cor.numero}`}>{p.count}</span>
                <ChevronRight className="w-4 h-4 text-gray-300 mt-1 shrink-0" aria-hidden="true" />
            </button>
        </li>
    );
};

// ── Barras horizontais (§28.1: comparar itens nomeados) ──────────────────────

const MAX_BARRAS = 8;

/** Barras horizontais em HTML: o valor fica escrito na ponta de cada barra (nunca só
 *  no tooltip, §28.3) e a lista é lida como lista pelo leitor de tela. Acima de 8
 *  itens, o resto vira "Outros (N)" em vez de sumir calado. */
const BarrasHorizontais: React.FC<{
    titulo: string;
    base: string;
    dados: { label: string; value: number }[];
    formato: (v: number) => string;
    vazio: string;
}> = ({ titulo, base, dados, formato, vazio }) => {
    const linhas = dados.length > MAX_BARRAS
        ? [...dados.slice(0, MAX_BARRAS - 1), {
            label: `Outros (${dados.length - (MAX_BARRAS - 1)})`,
            value: dados.slice(MAX_BARRAS - 1).reduce((s, d) => s + d.value, 0),
        }]
        : dados;
    const max = Math.max(...linhas.map(d => d.value), 1);
    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-700">{titulo}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{base}</p>
            {linhas.length === 0 ? (
                <p className="text-sm text-gray-500 mt-3 py-6 text-center">{vazio}</p>
            ) : (
                <ul className="mt-3 space-y-2.5">
                    {linhas.map(d => (
                        <li key={d.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3">
                            <span className="text-sm text-gray-700 truncate" title={d.label}>{d.label}</span>
                            <span className="h-2 rounded-r-[4px] bg-gray-50" aria-hidden="true">
                                <span className="block h-full rounded-r-[4px] bg-blue-500" style={{ width: `${(d.value / max) * 100}%` }} />
                            </span>
                            <span className="text-xs text-gray-500 tabular-nums text-right">{formato(d.value)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

// ── Componente principal ─────────────────────────────────────────────────────

interface LaborRHDashboardProps {
    orgId: string | null;
    employees: Employee[];
    /** Pontos aguardando aprovação (veio do antigo "Dashboard" do RH). */
    pontosPendentes?: number;
    onNavigate?: (tab: string) => void;
    organizations: Array<{ id: string; name: string }>;
}

const LaborRHDashboard: React.FC<LaborRHDashboardProps> = ({ orgId, employees, pontosPendentes = 0, onNavigate }) => {
    // hojeLocal, não toISOString(): depois das 21h em Brasília o UTC já é amanhã — e no
    // último dia do mês o painel inteiro pulava para o mês seguinte.
    const today = hojeLocal();
    const [refDate] = useState(today);
    const anoRef = Number(refDate.slice(0, 4));
    const ir = (view: string) => () => onNavigate?.(view);
    // O alerta de férias abre direto em "Saldo de Férias" (LaborAbsences lê `?aba=saldos`).
    const irParaSaldoDeFerias = () => { window.location.hash = '#/labor-absences?aba=saldos'; };

    const { data: kpis, isLoading, error, refetch } = useQuery<RhKpis>({
        queryKey: laborKeys.rhKpis(orgId, refDate),
        queryFn: () => laborService.getRhKpis(orgId, refDate),
        staleTime: STALE.normal,
    });

    // Mesma chave do BI Analytics RH: salvar a meta lá atualiza aqui.
    const { data: meta } = useQuery({
        queryKey: ['hr-target', orgId, anoRef],
        queryFn: () => hrAnalyticsService.getTarget(orgId, anoRef),
        staleTime: STALE.slow,
    });

    // Custo de mão de obra = FOLHA da última competência (a de outubro só existe em
    // novembro), pela mesma conta do Custo por Obra. Antes vinha do apontamento
    // (time_entries), vazio em produção — a tela afirmava "R$ 0".
    const { data: folha, isLoading: carregandoFolha, refetch: refetchFolha } = useQuery({
        queryKey: ['rh-custo-folha', orgId, refDate],
        queryFn: () => payrollService.custoDaFolhaDaCompetencia(orgId, refDate),
        staleTime: STALE.normal,
    });

    // Distribuição por função (dos colaboradores ativos locais). Conta cada um uma
    // vez e na organização em que é REGISTRADO, como rh_kpis: a lista traz também
    // compartilhados de outra org (employee_org_shares), que somavam 12 × 10 ativos.
    const byRole = React.useMemo(() => {
        const unicos = new Map<string, Employee>();
        employees
            .filter(e => e.status === 'ATIVO' && (!orgId || e.org_id === orgId))
            .forEach(e => unicos.set(e.id, e));
        const map = new Map<string, number>();
        unicos.forEach(e => {
            map.set(e.role, (map.get(e.role) || 0) + 1);
        });
        return Array.from(map.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);
    }, [employees, orgId]);

    const byProject = React.useMemo(() => {
        if (!folha) return [];
        const linhas = folha.porObra.map(p => ({ label: p.name, value: p.cost }));
        if (folha.naoAlocado > 0) linhas.push({ label: 'Administrativo / sem obra', value: folha.naoAlocado });
        return linhas;
    }, [folha]);

    // Do refDate (local) e só a 1ª letra maiúscula: o `capitalize` do CSS fazia "Outubro De 2026".
    const mesRef = new Date(`${refDate}T12:00:00`).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    const mesAtual = mesRef.charAt(0).toUpperCase() + mesRef.slice(1);

    const motivoDoErro = /Acesso negado/i.test((error as Error | null)?.message ?? '')
        ? 'Você não é membro da organização selecionada no topo — escolha outra ou "Todas".'
        : 'Verifique a conexão.';

    // Pendências que EXISTEM, na ordem de urgência: o que já venceu primeiro.
    const pendencias: Pendencia[] = kpis ? ([
        { chave: 'ferias-vencidas', count: kpis.alertas.ferias_vencidas, rotulo: 'Férias vencidas — pagamento em dobro (CLT art. 137)',
          icon: Umbrella, tom: 'alerta', acao: 'Ver saldo de férias', onClick: irParaSaldoDeFerias, itens: kpis.vencidos?.ferias },
        { chave: 'docs-vencidos', count: kpis.alertas.docs_vencidos, rotulo: 'Documentos (ASO/NR) vencidos — o colaborador não pode subir na obra',
          icon: FileText, tom: 'alerta', acao: 'Ver documentos', onClick: ir('labor-documents'), itens: kpis.vencidos?.documentos },
        { chave: 'trein-vencidos', count: kpis.alertas.treinamentos_vencidos, rotulo: 'Treinamentos vencidos',
          icon: BookOpen, tom: 'alerta', acao: 'Ver treinamentos', onClick: ir('labor-trainings'), itens: kpis.vencidos?.treinamentos },
        { chave: 'pontos', count: pontosPendentes, rotulo: 'Pontos aguardando aprovação',
          icon: Clock, tom: 'atencao', acao: 'Aprovar pontos', onClick: ir('labor-timetracking') },
        { chave: 'epis', count: kpis.alertas.epis_estoque_baixo, rotulo: 'EPIs com estoque abaixo do mínimo',
          icon: HardHat, tom: 'atencao', acao: 'Ver estoque de EPIs', onClick: ir('labor-epis') },
        { chave: 'ferias-vencendo', count: kpis.alertas.ferias_vencendo, rotulo: 'Férias vencendo em 60 dias',
          icon: Umbrella, tom: 'atencao', acao: 'Ver saldo de férias', onClick: irParaSaldoDeFerias },
        { chave: 'docs-vencendo', count: kpis.alertas.docs_vencendo, rotulo: 'Documentos (ASO/NR) vencendo em 30 dias',
          icon: FileText, tom: 'atencao', acao: 'Ver documentos', onClick: ir('labor-documents') },
        { chave: 'trein-vencendo', count: kpis.alertas.treinamentos_vencendo, rotulo: 'Treinamentos vencendo em 30 dias',
          icon: BookOpen, tom: 'atencao', acao: 'Ver treinamentos', onClick: ir('labor-trainings') },
    ] as Pendencia[]).filter(p => p.count > 0) : [];

    const vTurnover = kpis ? vereditoPelaMeta(kpis.periodo.turnover_pct, meta?.turnover_max_pct, !!orgId) : null;
    const vAbsenteismo = kpis ? vereditoPelaMeta(kpis.qualidade.absenteismo_pct, meta?.absenteismo_max_pct, !!orgId) : null;
    // Meta de horas extras é % das horas trabalhadas (BI › Metas: "Ex: 10 das horas totais").
    const pctHorasExtras = kpis && kpis.custos.horas_trabalhadas > 0
        ? Math.round(kpis.custos.horas_extras / kpis.custos.horas_trabalhadas * 1000) / 10 : 0;
    const vHorasExtras = kpis ? vereditoPelaMeta(pctHorasExtras, meta?.horas_extras_max_pct, !!orgId) : null;
    const tentarDeNovo = () => { refetch(); refetchFolha(); };

    return (
        <div className="space-y-6 pb-20">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Dashboard RH</h1>
                    <p className="text-gray-500 text-sm mt-1.5 font-medium">O que precisa de ação e como está o mês — {mesAtual}.</p>
                </div>
                <button
                    type="button"
                    onClick={tentarDeNovo}
                    className="inline-flex items-center gap-2 h-9 px-3 rounded-[6px] border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Atualizar
                </button>
            </div>

            {/* 1. Pendências */}
            <section aria-labelledby="rh-pendencias" className="space-y-3">
                <FaixaTitulo id="rh-pendencias" titulo="Pendências"
                    resumo={kpis ? (pendencias.length === 0 ? 'nada pendente' : `${pendencias.length} tipo${pendencias.length > 1 ? 's' : ''}`) : undefined} />
                {isLoading ? (
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm h-24" aria-busy="true" aria-label="Carregando pendências">
                        <div className="h-3 w-1/3 rounded bg-gray-100 animate-pulse m-4" />
                        <div className="h-3 w-1/2 rounded bg-gray-100 animate-pulse mx-4" />
                    </div>
                ) : error || !kpis ? (
                    <FalhaDaFaixa oQue="as pendências" motivo={motivoDoErro} onRetry={tentarDeNovo} />
                ) : pendencias.length === 0 ? (
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm px-4 py-4 flex items-center gap-3 text-sm text-gray-700">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                        Nada vencido nem vencendo: férias, ASO/NR, treinamentos, EPIs e pontos em dia.
                    </div>
                ) : (
                    <ul className="bg-white rounded-[10px] border border-gray-100 shadow-sm divide-y divide-gray-100 overflow-hidden">
                        {pendencias.map(p => <LinhaDePendencia key={p.chave} p={p} />)}
                    </ul>
                )}
            </section>

            {/* 2. O mês */}
            <section aria-labelledby="rh-mes" className="space-y-3">
                <FaixaTitulo id="rh-mes" titulo={mesAtual}
                    resumo={orgId ? undefined : 'todas as organizações — sem meta, sem veredito'} />
                {isLoading ? (
                    <CartoesCarregando quantos={4} grade="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" rotulo="Carregando os números do mês" />
                ) : error || !kpis || !vTurnover || !vAbsenteismo || !vHorasExtras ? (
                    <FalhaDaFaixa oQue="os números do mês" motivo={motivoDoErro} onRetry={tentarDeNovo} />
                ) : (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                            <KpiCard destaque label="Colaboradores" icon={<Users />}
                                value={kpis.headcount.total}
                                sub={`${kpis.headcount.ativos} ativos · ${kpis.headcount.afastados} afastados`}
                                acao={kpis.headcount.afastados > 0 ? { label: 'Ver afastados', onClick: ir('labor-employees') } : undefined} />
                            <KpiCard destaque label="Turnover" icon={<Activity />}
                                value={pct(kpis.periodo.turnover_pct)}
                                tom={vTurnover.tom}
                                sub={[vTurnover.texto, '(admissões + desligamentos) ÷ 2 ÷ headcount médio'].filter(Boolean).join(' · ')}
                                acao={vTurnover.definirMeta ? { label: 'Definir meta', onClick: ir('labor-bi-analytics') }
                                    : kpis.periodo.desligados > 0 ? { label: 'Ver desligamentos', onClick: ir('labor-termination') } : undefined} />
                            <KpiCard destaque label="Absenteísmo" icon={<Calendar />}
                                value={pct(kpis.qualidade.absenteismo_pct)}
                                tom={vAbsenteismo.tom}
                                sub={[vAbsenteismo.texto, `faltas e atestados ÷ ${kpis.qualidade.dias_uteis} dias úteis`].filter(Boolean).join(' · ')}
                                acao={vAbsenteismo.definirMeta ? { label: 'Definir meta', onClick: ir('labor-bi-analytics') }
                                    : kpis.qualidade.absenteismo_pct > 0 ? { label: 'Ver faltas e atestados', onClick: ir('labor-absences') } : undefined} />
                            <KpiCard destaque label="Custo da folha" icon={<DollarSign />}
                                value={carregandoFolha ? '…' : folha ? brl(folha.total) : '—'}
                                sub={carregandoFolha ? 'carregando a folha' : folha
                                    ? [`folha de ${competenciaCurta(folha.competencia)}`,
                                       folha.fechadas < folha.folhas ? 'em processamento' : 'fechada',
                                       !orgId ? `${folha.folhas} organizaç${folha.folhas === 1 ? 'ão' : 'ões'}` : undefined,
                                      ].filter(Boolean).join(' · ')
                                    : 'nenhuma folha mensal calculada'}
                                acao={carregandoFolha ? undefined : folha
                                    ? { label: 'Ver custo por obra', onClick: ir('labor-cost-dashboard') }
                                    : { label: 'Abrir a folha', onClick: ir('labor-payroll') }} />
                        </div>
                        {/* Faixa de apoio (§4.5): neutra, sem cor por KPI. */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
                            <KpiCard size="sm" color="gray" label="Admissões" value={kpis.periodo.admitidos} />
                            <KpiCard size="sm" color="gray" label="Desligamentos" value={kpis.periodo.desligados} />
                            <KpiCard size="sm" color="gray" label="Férias no mês" value={kpis.headcount.em_ferias}
                                sub="com algum dia de férias" />
                            <KpiCard size="sm" color="gray" label="Afastados" value={kpis.headcount.afastados}
                                sub="INSS / licença" />
                            {/* Horas vêm do APONTAMENTO (Diário de Obra / ponto). Sem apontamento
                                aprovado no mês, "—" — não 0h, que afirmaria ninguém ter feito hora extra. */}
                            <KpiCard size="sm" color="gray" label="Horas extras"
                                value={kpis.custos.apontamentos > 0 ? `${kpis.custos.horas_extras.toFixed(0)}h` : '—'}
                                sub={kpis.custos.apontamentos > 0
                                    ? [`${pct(pctHorasExtras)} das horas`, vHorasExtras.texto].filter(Boolean).join(' · ')
                                    : 'sem apontamento no mês'} />
                        </div>
                    </>
                )}
            </section>

            {/* 3. Distribuição */}
            <section aria-labelledby="rh-distribuicao" className="space-y-3">
                <FaixaTitulo id="rh-distribuicao" titulo="Distribuição">
                    {folha && <LinkDeAcao onClick={ir('labor-cost-dashboard')}>Custo por obra completo</LinkDeAcao>}
                </FaixaTitulo>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <BarrasHorizontais
                        titulo="Colaboradores por função"
                        base="Ativos hoje, na organização em que são registrados."
                        dados={byRole}
                        formato={v => `${v} pessoa${v !== 1 ? 's' : ''}`}
                        vazio="Nenhum colaborador ativo."
                    />
                    <BarrasHorizontais
                        titulo={folha ? `Custo da folha por obra — ${competenciaCurta(folha.competencia)}` : 'Custo da folha por obra'}
                        base="Salário e encargos (FGTS, CPP, RAT, terceiros), rateados pelas alocações da folha."
                        dados={byProject}
                        formato={brl}
                        vazio={carregandoFolha ? 'Carregando a folha…' : 'Nenhuma folha mensal calculada.'}
                    />
                </div>
            </section>
        </div>
    );
};

export default LaborRHDashboard;
