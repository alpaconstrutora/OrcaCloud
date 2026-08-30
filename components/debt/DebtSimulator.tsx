import React from 'react';
import {
    ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Download, FlaskConical } from 'lucide-react';
import { formatMoney, formatDateBR } from '../ui/Format';
import { usePersistedState } from '../ui/TableUtils';
import { toCsv, baixarCsv } from '../../services/debtAnalyticsService';
import {
    simulateVariants,
    varCarencias,
    varCenariosIndexador,
    varEntradas,
    varPrazos,
    varSistemas,
    type SimulationResult,
    type Variante,
} from '../../utils/debtSimulator';
import { DEBT_AMORTIZATION_PT, type AmortizationSystem } from '../../types/debt';
import type { DebtScheduleParams } from '../../utils/debtAmortization';

type Eixo = 'SISTEMA' | 'PRAZO' | 'CARENCIA' | 'ENTRADA' | 'INDEXADOR';

const EIXO_PT: Record<Eixo, string> = {
    SISTEMA: 'SAC × Price',
    PRAZO: 'Prazos diferentes',
    CARENCIA: 'Carências alternativas',
    ENTRADA: 'Entrada / amortização inicial',
    INDEXADOR: 'Cenários de indexador',
};

const CORES = ['#2563eb', '#f59e0b', '#10b981', '#a855f7', '#ef4444'];

const Label = ({ children }: { children: React.ReactNode }) => (
    <label className="text-xs font-semibold text-slate-500">{children}</label>
);

const campo = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';

const ChartTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: { name: string; value: number; color: string }[];
    label?: string;
}) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-xs space-y-1 min-w-[170px]">
            <p className="font-black text-gray-700 mb-2">Parcela {label}</p>
            {payload.map(p => (
                <div key={p.name} className="flex justify-between gap-3">
                    <span style={{ color: p.color }} className="font-semibold">{p.name}</span>
                    <span className="font-bold text-gray-900 tabular-nums">{formatMoney(p.value)}</span>
                </div>
            ))}
        </div>
    );
};

const th = 'px-6 py-2 border-r border-gray-100 text-table-header font-semibold text-gray-500';
const td = 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';

export default function DebtSimulator() {
    // Os parâmetros ficam persistidos: o usuário volta à tela no meio de uma
    // cotação e não perde o que já tinha montado.
    const [principal, setPrincipal] = usePersistedState<number>('dividasSim:principal', 100000);
    const [taxa, setTaxa] = usePersistedState<number>('dividasSim:taxa', 1);
    const [prazo, setPrazo] = usePersistedState<number>('dividasSim:prazo', 60);
    const [sistema, setSistema] = usePersistedState<AmortizationSystem>('dividasSim:sistema', 'PRICE');
    const [carencia, setCarencia] = usePersistedState<number>('dividasSim:carencia', 0);
    const [primeiroVenc, setPrimeiroVenc] = usePersistedState<string>('dividasSim:venc', '2026-10-10');
    const [iof, setIof] = usePersistedState<number>('dividasSim:iof', 0);
    const [tarifas, setTarifas] = usePersistedState<number>('dividasSim:tarifas', 0);
    const [eixo, setEixo] = usePersistedState<Eixo>('dividasSim:eixo', 'SISTEMA');

    const base: DebtScheduleParams = React.useMemo(() => ({
        principal,
        nominalRate: taxa,
        ratePeriod: 'MENSAL',
        system: sistema,
        installmentCount: Math.max(1, prazo),
        installmentPeriod: 'MENSAL',
        firstDueDate: primeiroVenc || '2026-10-10',
        gracePrincipalPeriods: carencia,
    }), [principal, taxa, prazo, sistema, primeiroVenc, carencia]);

    const variantes: Variante[] = React.useMemo(() => {
        switch (eixo) {
            case 'SISTEMA': return varSistemas();
            case 'PRAZO': return varPrazos([Math.max(1, Math.round(prazo / 2)), prazo, prazo * 2]);
            case 'CARENCIA': return varCarencias([0, 6, 12]);
            case 'ENTRADA': return varEntradas(principal, [0, 20, 30]);
            case 'INDEXADOR': return varCenariosIndexador(base.firstDueDate, prazo, [0.5, 0.9, 1.2], 'CDI');
            default: return varSistemas();
        }
    }, [eixo, prazo, principal, base.firstDueDate]);

    const resultados: SimulationResult[] = React.useMemo(
        () => simulateVariants(base, variantes, { custos: { iof, tarifas } }),
        [base, variantes, iof, tarifas],
    );

    /** Série do gráfico: uma coluna por variante, indexada pelo nº da parcela. */
    const serie = React.useMemo(() => {
        const maxN = Math.max(0, ...resultados.map(r => r.rows.length));
        return Array.from({ length: maxN }, (_, i) => {
            const ponto: Record<string, number | string> = { seq: i + 1 };
            for (const r of resultados) if (r.rows[i]) ponto[r.label] = r.rows[i].total;
            return ponto;
        });
    }, [resultados]);

    /** O menor CET do conjunto — só para destacar, nunca para decidir sozinho. */
    const melhorCet = React.useMemo(() => {
        const validos = resultados.filter(r => r.cetAnual !== null);
        return validos.length ? Math.min(...validos.map(r => r.cetAnual!)) : null;
    }, [resultados]);

    const exportar = () => {
        baixarCsv(
            `simulacao-divida-${eixo.toLowerCase()}-${new Date().toISOString().slice(0, 10)}`,
            toCsv(
                ['Métrica', ...resultados.map(r => r.label)],
                [
                    ['Nº de parcelas', ...resultados.map(r => r.nParcelas)],
                    ['1ª parcela', ...resultados.map(r => r.primeiraParcela)],
                    ['Maior parcela', ...resultados.map(r => r.maiorParcela)],
                    ['Total de juros', ...resultados.map(r => r.totalJuros)],
                    ['Total de encargos', ...resultados.map(r => r.totalEncargos)],
                    ['Total pago', ...resultados.map(r => r.totalPago)],
                    ['Custo total', ...resultados.map(r => r.custoTotal)],
                    ['CET (% a.a.)', ...resultados.map(r => r.cetAnual ?? 0)],
                    ['Impacto mensal 12m', ...resultados.map(r => r.impactoMensal12m)],
                ],
            ),
        );
    };

    const linhas: { rotulo: string; valor: (r: SimulationResult) => string; destaque?: boolean }[] = [
        { rotulo: 'Sistema', valor: r => DEBT_AMORTIZATION_PT[r.params.system] },
        { rotulo: 'Nº de parcelas', valor: r => String(r.nParcelas) },
        { rotulo: 'Principal financiado', valor: r => formatMoney(r.params.principal) },
        { rotulo: '1ª parcela', valor: r => formatMoney(r.primeiraParcela) },
        { rotulo: 'Maior parcela', valor: r => formatMoney(r.maiorParcela) },
        { rotulo: 'Total de juros', valor: r => formatMoney(r.totalJuros) },
        { rotulo: 'Total de encargos', valor: r => formatMoney(r.totalEncargos) },
        { rotulo: 'Total pago', valor: r => formatMoney(r.totalPago) },
        { rotulo: 'Custo total da operação', valor: r => formatMoney(r.custoTotal), destaque: true },
        {
            rotulo: 'CET (% a.a.)',
            // `null` vira "não convergiu", nunca 0% — 0% seria uma afirmação
            // falsa sobre o custo.
            valor: r => r.cetAnual === null
                ? 'não convergiu'
                : `${r.cetAnual.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`,
            destaque: true,
        },
        { rotulo: 'Impacto mensal (1º ano)', valor: r => formatMoney(r.impactoMensal12m), destaque: true },
        { rotulo: 'Último vencimento', valor: r => r.ultimoVencimento ? formatDateBR(r.ultimoVencimento) : '—' },
    ];

    return (
        <div className="space-y-6">
            {/* §5.3 — controles de escopo à esquerda, ação primária à direita. */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={eixo}
                        onChange={e => setEixo(e.target.value as Eixo)}
                        className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                    >
                        {Object.entries(EIXO_PT).map(([k, v]) => (
                            <option key={k} value={k}>Comparar: {v}</option>
                        ))}
                    </select>
                </div>
                <button
                    onClick={exportar}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                >
                    <Download className="w-[15px] h-[15px]" />
                    Exportar comparação
                </button>
            </div>

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-5">
                <h3 className="text-sm font-bold text-gray-800 mb-4">Parâmetros da operação</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                        <Label>Valor financiado</Label>
                        <input type="number" step="0.01" className={campo} value={principal}
                               onChange={e => setPrincipal(Number(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-1">
                        <Label>Taxa (% a.m.)</Label>
                        <input type="number" step="0.0001" className={campo} value={taxa}
                               onChange={e => setTaxa(Number(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-1">
                        <Label>Nº de parcelas</Label>
                        <input type="number" className={campo} value={prazo}
                               onChange={e => setPrazo(Number(e.target.value) || 1)} />
                    </div>
                    <div className="space-y-1">
                        <Label>Sistema</Label>
                        <select className={campo} value={sistema}
                                onChange={e => setSistema(e.target.value as AmortizationSystem)}>
                            {(['SAC', 'PRICE', 'SACRE', 'AMERICANO', 'BULLET'] as AmortizationSystem[]).map(k => (
                                <option key={k} value={k}>{DEBT_AMORTIZATION_PT[k]}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <Label>Carência de principal (meses)</Label>
                        <input type="number" className={campo} value={carencia}
                               onChange={e => setCarencia(Number(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-1">
                        <Label>1º vencimento</Label>
                        <input type="date" className={campo} value={primeiroVenc}
                               onChange={e => setPrimeiroVenc(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <Label>IOF retido</Label>
                        <input type="number" step="0.01" className={campo} value={iof}
                               onChange={e => setIof(Number(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-1">
                        <Label>Tarifas retidas</Label>
                        <input type="number" step="0.01" className={campo} value={tarifas}
                               onChange={e => setTarifas(Number(e.target.value) || 0)} />
                    </div>
                </div>
                <p className="text-xs text-gray-400 mt-3">
                    IOF e tarifas não mudam o cronograma — mudam o que entrou na conta, e é por isso que
                    fazem o CET subir acima da taxa contratada.
                </p>
            </div>

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-5 pb-0">
                    <h3 className="text-sm font-bold text-gray-800">{EIXO_PT[eixo]}</h3>
                </div>
                <div className="overflow-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                <th className={`${th} text-left`}>Métrica</th>
                                {resultados.map((r, i) => (
                                    <th key={r.label} className={`${th} text-right last:border-r-0`}>
                                        <span style={{ color: CORES[i % CORES.length] }}>{r.label}</span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {linhas.map(l => (
                                <tr key={l.rotulo} className="hover:bg-blue-50/50 transition-colors">
                                    <td className={`${td} text-gray-700`}>{l.rotulo}</td>
                                    {resultados.map(r => (
                                        <td
                                            key={r.label}
                                            className={`${td} text-right ${l.destaque ? 'font-medium text-gray-800' : 'text-gray-600'} ${
                                                l.rotulo.startsWith('CET') && melhorCet !== null && r.cetAnual === melhorCet
                                                    ? 'text-green-700' : ''
                                            }`}
                                        >
                                            {l.valor(r)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="px-5 py-3 border-t border-gray-100 bg-amber-50/60">
                    <p className="text-xs text-amber-800">
                        <strong>O menor CET não decide sozinho.</strong> Garantias exigidas, covenants,
                        concentração no mesmo banco e pressão sobre o caixa do primeiro ano pesam junto —
                        compare a linha “Impacto mensal (1º ano)” antes de fechar pela taxa.
                        {eixo === 'INDEXADOR' && ' Cenário de indexador é hipótese, não previsão.'}
                    </p>
                </div>
            </div>

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-5">
                <h3 className="text-sm font-bold text-gray-800 mb-4">Evolução da parcela</h3>
                {serie.length === 0 ? (
                    <div className="text-center py-12">
                        <FlaskConical className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h4 className="text-lg font-bold text-gray-900 mb-2">Nada a simular</h4>
                        <p className="text-sm text-gray-500">Informe valor financiado e número de parcelas.</p>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={300}>
                        <ComposedChart data={serie}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="seq" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(1)}k`} />
                            <Tooltip content={<ChartTooltip />} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            {resultados.map((r, i) => (
                                <Line key={r.label} type="monotone" dataKey={r.label} name={r.label}
                                      stroke={CORES[i % CORES.length]} strokeWidth={2} dot={false} />
                            ))}
                        </ComposedChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}
