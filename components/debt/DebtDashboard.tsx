import React from 'react';
import {
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
    AlertTriangle, CalendarClock, Download, Landmark, Percent, RefreshCw, TrendingDown, Wallet,
} from 'lucide-react';
import { KpiCard } from '../ui/KpiCard';
import { formatMoney, formatDateBR } from '../ui/Format';
import { usePersistedState } from '../ui/TableUtils';
import { useOrgContext, errorMessage } from '../../hooks/useOrgContext';
import { debtAnalyticsService, POSICAO_VAZIA, toCsv, baixarCsv } from '../../services/debtAnalyticsService';
import {
    DEBT_ALLOCATION_TARGET_PT,
    DEBT_CONCENTRATION_PT,
    DEBT_MODALITY_PT,
    type DebtByTargetRow,
    type DebtConcentrationDimension,
    type DebtConcentrationRow,
    type DebtCurvePoint,
    type DebtPosition,
} from '../../types/debt';

const fBRL = (v: number) => formatMoney(v);

/** Tooltip próprio: o `formatter` do recharts não tipa bem em TS estrito. */
const ChartTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: { name: string; value: number; color: string }[];
    label?: string;
}) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-xs space-y-1 min-w-[170px]">
            <p className="font-black text-gray-700 mb-2">{label}</p>
            {payload.map(p => (
                <div key={p.name} className="flex justify-between gap-3">
                    <span style={{ color: p.color }} className="font-semibold">{p.name}</span>
                    <span className="font-bold text-gray-900 tabular-nums">{fBRL(p.value)}</span>
                </div>
            ))}
        </div>
    );
};

const mesLabel = (iso: string) => {
    const [y, m] = iso.split('-');
    return `${m}/${y.slice(2)}`;
};

const Secao = ({ titulo, children, acao }: { titulo: string; children: React.ReactNode; acao?: React.ReactNode }) => (
    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-800">{titulo}</h3>
            {acao}
        </div>
        {children}
    </div>
);

const th = 'px-6 py-2 border-r border-gray-100 text-table-header font-semibold text-gray-500';
const td = 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';

export default function DebtDashboard() {
    // REGRA #5 — null é "Todas"; a RPC trata NULL e a RLS recorta.
    const { orgId } = useOrgContext();

    const [posicao, setPosicao] = React.useState<DebtPosition>(POSICAO_VAZIA);
    const [curva, setCurva] = React.useState<DebtCurvePoint[]>([]);
    const [concentracao, setConcentracao] = React.useState<DebtConcentrationRow[]>([]);
    const [porDestino, setPorDestino] = React.useState<DebtByTargetRow[]>([]);
    const [dimensao, setDimensao] = usePersistedState<DebtConcentrationDimension>(
        'dividasDashboard:dimensao', 'INSTITUICAO',
    );
    const [meses, setMeses] = usePersistedState<number>('dividasDashboard:meses', 24);
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    /**
     * A POSIÇÃO especificamente falhou. Sem isto, uma consulta que estoura
     * deixa `posicao` no default zerado e a tela mostra "Dívida total R$ 0,00"
     * tendo dívida real — zero que parece dado é pior que erro.
     * Aconteceu em 30/08: `fn_debt_concentration` quebrava num mútuo, o
     * `Promise.all` rejeitava e os KPIs zeravam junto.
     */
    const [posicaoFalhou, setPosicaoFalhou] = React.useState(false);

    const carregar = React.useCallback(async () => {
        setCarregando(true);
        setErro(null);
        // `allSettled`, não `all`: um painel que falha não pode derrubar os
        // outros três nem zerar os KPIs.
        const [p, c, k, d] = await Promise.allSettled([
            debtAnalyticsService.position(orgId),
            debtAnalyticsService.curve(orgId, { months: meses }),
            debtAnalyticsService.concentration(orgId, dimensao),
            debtAnalyticsService.byTarget(orgId),
        ]);

        setPosicaoFalhou(p.status === 'rejected');
        if (p.status === 'fulfilled') setPosicao(p.value); else setPosicao(POSICAO_VAZIA);
        setCurva(c.status === 'fulfilled' ? c.value : []);
        setConcentracao(k.status === 'fulfilled' ? k.value : []);
        setPorDestino(d.status === 'fulfilled' ? d.value : []);

        const falhas = [
            p.status === 'rejected' ? 'posição' : null,
            c.status === 'rejected' ? 'curva' : null,
            k.status === 'rejected' ? 'concentração' : null,
            d.status === 'rejected' ? 'dívida por destino' : null,
        ].filter(Boolean);
        if (falhas.length) {
            const primeira = [p, c, k, d].find(r => r.status === 'rejected') as PromiseRejectedResult;
            setErro(
                `Não foi possível carregar: ${falhas.join(', ')}. ` +
                errorMessage(primeira.reason, 'Erro desconhecido.'),
            );
        }
        setCarregando(false);
    }, [orgId, dimensao, meses]);

    React.useEffect(() => { void carregar(); }, [carregar]);

    /** Agrupa o rateio por destino: a view devolve uma linha por contrato. */
    const destinos = React.useMemo(() => {
        const mapa = new Map<string, { kind: string; id: string; saldo: number; encargos: number; contratos: number }>();
        for (const r of porDestino) {
            const chave = `${r.targetKind}:${r.targetId}`;
            const atual = mapa.get(chave) ?? { kind: r.targetKind, id: r.targetId, saldo: 0, encargos: 0, contratos: 0 };
            atual.saldo += r.saldoRateado;
            atual.encargos += r.encargosRateados;
            atual.contratos += 1;
            mapa.set(chave, atual);
        }
        return [...mapa.values()].sort((a, b) => b.saldo - a.saldo);
    }, [porDestino]);

    const proximos = React.useMemo(
        () => curva.filter(p => p.parcela > 0).slice(0, 12),
        [curva],
    );

    const exportarCurva = () => {
        baixarCsv(
            `divida-cronograma-${new Date().toISOString().slice(0, 10)}`,
            toCsv(
                ['Mês', 'Amortização', 'Juros', 'Encargos', 'Parcela', 'Saldo remanescente'],
                curva.map(p => [p.mes, p.amortizacao, p.juros, p.encargos, p.parcela, p.saldoRemanescente]),
            ),
        );
    };

    const exportarConcentracao = () => {
        baixarCsv(
            `divida-concentracao-${dimensao.toLowerCase()}-${new Date().toISOString().slice(0, 10)}`,
            toCsv(
                [DEBT_CONCENTRATION_PT[dimensao], 'Saldo', 'Encargos', '% do total', 'Contratos'],
                concentracao.map(r => [r.rotulo, r.saldo, r.encargos, r.pct, r.nContratos]),
            ),
        );
    };

    const exportarPosicao = () => {
        baixarCsv(
            `divida-posicao-${new Date().toISOString().slice(0, 10)}`,
            toCsv(
                ['Indicador', 'Valor'],
                [
                    ['Operações ativas', posicao.nContratos],
                    ['Instituições', posicao.nInstituicoes],
                    ['Dívida total', posicao.dividaTotal],
                    ['Curto prazo (até 12 meses)', posicao.curtoPrazo],
                    ['Longo prazo', posicao.longoPrazo],
                    ['Encargos a pagar', posicao.encargosAPagar],
                    ['Serviço da dívida — 30 dias', posicao.servico30],
                    ['Serviço da dívida — 90 dias', posicao.servico90],
                    ['Serviço da dívida — 365 dias', posicao.servico365],
                    ['Vencido', posicao.vencido],
                    ['Parcelas vencidas', posicao.nParcelasVencidas],
                    ['Custo médio (% a.m.)', posicao.custoMedioMensal],
                    ['Prazo médio (meses)', posicao.prazoMedioMeses],
                    ['% taxa variável', posicao.pctTaxaVariavel],
                    ['% indexada', posicao.pctIndexada],
                ],
            ),
        );
    };

    const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

    return (
        // Sem <h1> próprio: este componente é a aba "Posição consolidada" de
        // DebtModule, que já é dono do título e o troca junto com a aba (§19.1).
        // Um segundo título aqui duplicaria o cabeçalho da tela (§18/§20).
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-3">
                {/* `—` e não R$ 0,00 quando a apuração falhou: zero é uma
                    afirmação sobre o dinheiro, e afirmar sem saber é pior que
                    admitir que não sabe. */}
                <KpiCard label="Dívida total" value={posicaoFalhou ? '—' : formatMoney(posicao.dividaTotal)} sub={posicaoFalhou ? 'não apurado' : `${posicao.nContratos} operação(ões)`} icon={<Landmark className="w-5 h-5" />} color="blue" />
                <KpiCard label="Curto prazo" value={posicaoFalhou ? '—' : formatMoney(posicao.curtoPrazo)} sub="Amortiza em até 12 meses" icon={<CalendarClock className="w-5 h-5" />} color="indigo" />
                <KpiCard label="Serviço 12 meses" value={posicaoFalhou ? '—' : formatMoney(posicao.servico365)} sub="Principal + encargos" icon={<Wallet className="w-5 h-5" />} color="violet" />
                <KpiCard label="Custo médio" value={posicaoFalhou ? '—' : pct(posicao.custoMedioMensal)} sub="Ao mês, ponderado pelo saldo" icon={<Percent className="w-5 h-5" />} color="amber" />
                <KpiCard
                    label="Vencido"
                    value={posicaoFalhou ? '—' : formatMoney(posicao.vencido)}
                    sub={`${posicao.nParcelasVencidas} parcela(s)`}
                    icon={<AlertTriangle className="w-5 h-5" />}
                    color={posicao.vencido > 0 ? 'red' : 'gray'}
                    pulse={posicao.vencido > 0}
                />
            </div>

            {/* §5.3 — barra de escopo, com a ação primária à direita. */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={meses}
                        onChange={e => setMeses(Number(e.target.value))}
                        className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                    >
                        <option value={12}>Próximos 12 meses</option>
                        <option value={24}>Próximos 24 meses</option>
                        <option value={60}>Próximos 5 anos</option>
                        <option value={120}>Próximos 10 anos</option>
                    </select>
                    <select
                        value={dimensao}
                        onChange={e => setDimensao(e.target.value as DebtConcentrationDimension)}
                        className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                    >
                        {Object.entries(DEBT_CONCENTRATION_PT).map(([k, v]) => (
                            <option key={k} value={k}>Concentração por {v.toLowerCase()}</option>
                        ))}
                    </select>
                    <button
                        onClick={() => void carregar()}
                        className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                        title="Atualizar"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
                <button
                    onClick={exportarPosicao}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                >
                    <Download className="w-[15px] h-[15px]" />
                    Exportar posição
                </button>
            </div>

            {erro && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[10px] px-4 py-3">{erro}</div>
            )}

            {carregando ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando...</p>
                </div>
            ) : posicaoFalhou ? (
                <div className="text-center py-12 bg-white rounded-[10px] shadow-sm border border-gray-100">
                    <AlertTriangle className="w-12 h-12 text-red-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Não foi possível apurar a posição</h3>
                    <p className="text-sm text-gray-500">
                        Os números acima <strong>não são zero, são desconhecidos</strong> — a consulta falhou.
                        Tente atualizar; se persistir, o detalhe do erro está no aviso acima.
                    </p>
                </div>
            ) : posicao.nContratos === 0 ? (
                <div className="text-center py-12 bg-white rounded-[10px] shadow-sm border border-gray-100">
                    <Landmark className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma dívida em aberto</h3>
                    <p className="text-sm text-gray-500">
                        Cadastre um financiamento e gere o cronograma para ver saldo, serviço e exposição aqui.
                    </p>
                </div>
            ) : (
                <>
                    <Secao
                        titulo="Curva de amortização e saldo devedor"
                        acao={
                            <button onClick={exportarCurva} className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all">
                                Exportar CSV
                            </button>
                        }
                    >
                        <ResponsiveContainer width="100%" height={300}>
                            <ComposedChart data={curva.map(p => ({ ...p, label: mesLabel(p.mes) }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                                <Tooltip content={<ChartTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                <Bar dataKey="amortizacao" name="Amortização" stackId="p" fill="#6366f1" />
                                <Bar dataKey="juros" name="Juros" stackId="p" fill="#f59e0b" />
                                <Bar dataKey="encargos" name="Encargos" stackId="p" fill="#94a3b8" />
                                <Line type="monotone" dataKey="saldoRemanescente" name="Saldo devedor" stroke="#2563eb" strokeWidth={2} dot={false} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </Secao>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <Secao
                            titulo={`Concentração por ${DEBT_CONCENTRATION_PT[dimensao].toLowerCase()}`}
                            acao={
                                <button onClick={exportarConcentracao} className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all">
                                    Exportar CSV
                                </button>
                            }
                        >
                            {concentracao.length === 0 ? (
                                <p className="text-sm text-gray-500 py-6 text-center">Sem dados nesta dimensão.</p>
                            ) : (
                                <ul className="space-y-2.5">
                                    {concentracao.map(r => (
                                        <li key={r.chave} className="space-y-1">
                                            <div className="flex items-center justify-between gap-3 text-sm">
                                                <span className="font-normal text-gray-700 truncate" title={r.rotulo}>
                                                    {dimensao === 'MODALIDADE'
                                                        ? (DEBT_MODALITY_PT[r.rotulo as keyof typeof DEBT_MODALITY_PT] ?? r.rotulo)
                                                        : r.rotulo}
                                                </span>
                                                <span className="font-medium text-gray-800 shrink-0 tabular-nums">
                                                    {formatMoney(r.saldo)} · {r.pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                                                </span>
                                            </div>
                                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, r.pct)}%` }} />
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Secao>

                        <Secao titulo="Perfil da dívida">
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                                {([
                                    ['Longo prazo', formatMoney(posicao.longoPrazo)],
                                    ['Encargos a pagar', formatMoney(posicao.encargosAPagar)],
                                    ['Serviço — 30 dias', formatMoney(posicao.servico30)],
                                    ['Serviço — 90 dias', formatMoney(posicao.servico90)],
                                    ['Prazo médio', `${posicao.prazoMedioMeses.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} meses`],
                                    ['Instituições', String(posicao.nInstituicoes)],
                                    ['Taxa variável', pct(posicao.pctTaxaVariavel)],
                                    ['Indexada', pct(posicao.pctIndexada)],
                                ] as [string, string][]).map(([k, v]) => (
                                    <div key={k} className="space-y-0.5">
                                        <dt className="text-xs font-semibold text-slate-500">{k}</dt>
                                        <dd className="text-sm font-medium text-gray-800">{v}</dd>
                                    </div>
                                ))}
                            </dl>
                            <p className="text-xs text-gray-400 mt-4">
                                Taxa variável e indexada se sobrepõem: um CDI + spread conta nas duas.
                            </p>
                        </Secao>
                    </div>

                    <Secao titulo="Calendário de vencimentos">
                        {proximos.length === 0 ? (
                            <p className="text-sm text-gray-500 py-6 text-center">Nenhuma parcela no horizonte escolhido.</p>
                        ) : (
                            <div className="overflow-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                            <th className={`${th} text-left`}>Mês</th>
                                            <th className={`${th} text-right`}>Amortização</th>
                                            <th className={`${th} text-right`}>Juros</th>
                                            <th className={`${th} text-right`}>Encargos</th>
                                            <th className={`${th} text-right`}>A pagar</th>
                                            <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Saldo depois</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {proximos.map(p => (
                                            <tr key={p.mes} className="hover:bg-blue-50/50 transition-colors">
                                                <td className={`${td} text-gray-700`}>{formatDateBR(p.mes)}</td>
                                                <td className={`${td} text-right text-gray-600`}>{formatMoney(p.amortizacao)}</td>
                                                <td className={`${td} text-right text-gray-600`}>{formatMoney(p.juros)}</td>
                                                <td className={`${td} text-right text-gray-600`}>{formatMoney(p.encargos)}</td>
                                                <td className={`${td} text-right font-medium text-gray-800`}>{formatMoney(p.parcela)}</td>
                                                <td className="px-6 py-2.5 text-right text-sm font-medium text-gray-800">{formatMoney(p.saldoRemanescente)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Secao>

                    <Secao
                        titulo="Dívida por destino"
                        acao={
                            destinos.length > 0 ? (
                                <button
                                    onClick={() => baixarCsv(
                                        `divida-por-destino-${new Date().toISOString().slice(0, 10)}`,
                                        toCsv(
                                            ['Tipo', 'Destino', 'Saldo', 'Encargos', 'Contratos'],
                                            destinos.map(d => [
                                                DEBT_ALLOCATION_TARGET_PT[d.kind as keyof typeof DEBT_ALLOCATION_TARGET_PT] ?? d.kind,
                                                d.id, d.saldo, d.encargos, d.contratos,
                                            ]),
                                        ),
                                    )}
                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                                >
                                    Exportar CSV
                                </button>
                            ) : undefined
                        }
                    >
                        {destinos.length === 0 ? (
                            <div className="text-center py-8">
                                <TrendingDown className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                <p className="text-sm text-gray-500">
                                    Nenhum contrato tem rateio cadastrado. Sem rateio, a dívida não aparece no custo
                                    financeiro por obra nem por empreendimento.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                            <th className={`${th} text-left`}>Tipo</th>
                                            <th className={`${th} text-left`}>Destino</th>
                                            <th className={`${th} text-right`}>Saldo</th>
                                            <th className={`${th} text-right`}>Encargos</th>
                                            <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Contratos</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {destinos.map(d => (
                                            <tr key={`${d.kind}:${d.id}`} className="hover:bg-blue-50/50 transition-colors">
                                                <td className={`${td} text-gray-700`}>
                                                    {DEBT_ALLOCATION_TARGET_PT[d.kind as keyof typeof DEBT_ALLOCATION_TARGET_PT] ?? d.kind}
                                                </td>
                                                <td className={`${td} text-gray-600`}>
                                                    <span className="block truncate" title={d.id}>{d.id}</span>
                                                </td>
                                                <td className={`${td} text-right font-medium text-gray-800`}>{formatMoney(d.saldo)}</td>
                                                <td className={`${td} text-right text-gray-600`}>{formatMoney(d.encargos)}</td>
                                                <td className="px-6 py-2.5 text-right text-sm font-normal text-gray-600">{d.contratos}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Secao>
                </>
            )}
        </div>
    );
}
