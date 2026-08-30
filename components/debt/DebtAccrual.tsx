import React from 'react';
import { CalendarClock, Download, Loader2 } from 'lucide-react';
import { formatMoney, formatDateBR } from '../ui/Format';
import { usePersistedState } from '../ui/TableUtils';
import { toCsv, baixarCsv } from '../../services/debtAnalyticsService';
import { debtService } from '../../services/debtService';
import {
    DAY_COUNT_PT,
    accrualByCompetence,
    accrueAt,
    type DayCountConvention,
} from '../../utils/debtAccrual';
import { addMonthsISO, type DebtInstallmentRow } from '../../utils/debtAmortization';
import type { DebtContract, DebtContractInput, DebtInstallment } from '../../types/debt';

interface Props {
    contract: DebtContract;
    parcelas: DebtInstallment[];
    onContratoAlterado: (c: DebtContract) => void;
}

const th = 'px-6 py-2 border-r border-gray-100 text-table-header font-semibold text-gray-500';
const td = 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';
const hoje = () => new Date().toISOString().slice(0, 10);

/** `DebtInstallment` (persistido) → `DebtInstallmentRow` (o que o motor lê). */
const paraLinhas = (ps: DebtInstallment[]): DebtInstallmentRow[] =>
    ps.map(p => ({
        seq: p.seq,
        dueDate: p.dueDate,
        competenciaDate: p.competenciaDate ?? p.dueDate,
        openingBalance: p.openingBalance,
        amortization: p.amortization,
        interest: p.interest,
        monetaryCorrection: p.monetaryCorrection,
        iof: p.iof,
        insurance: p.insurance,
        fees: p.fees,
        lateFine: p.lateFine,
        lateInterest: p.lateInterest,
        total: p.total,
        closingBalance: p.closingBalance,
    }));

export default function DebtAccrual({ contract, parcelas, onContratoAlterado }: Props) {
    const [fechamento, setFechamento] = usePersistedState<string>('dividasAccrual:fechamento', hoje());
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    const convencao = contract.dayCountConvention;

    const linhas = React.useMemo(() => paraLinhas(parcelas), [parcelas]);

    /**
     * Data em que o dinheiro entrou — âncora do primeiro período. Sem ela, os
     * juros da 1ª parcela apareceriam inteiros no dia do vencimento em vez de
     * correrem ao longo do período.
     */
    const ancora = React.useMemo(() => {
        if (contract.releasedAt) return contract.releasedAt;
        if (contract.signedAt) return contract.signedAt;
        return linhas[0] ? addMonthsISO(linhas[0].dueDate, -1) : hoje();
    }, [contract.releasedAt, contract.signedAt, linhas]);

    const naData = React.useMemo(
        () => (convencao && linhas.length ? accrueAt(linhas, fechamento, convencao, ancora) : null),
        [linhas, fechamento, convencao, ancora],
    );

    const meses = React.useMemo(
        () => (convencao && linhas.length ? accrualByCompetence(linhas, convencao, ancora) : []),
        [linhas, convencao, ancora],
    );

    const escolher = async (c: DayCountConvention) => {
        setSalvando(true);
        setErro(null);
        try {
            // O update manda o contrato inteiro; `contractToRow` ignora os
            // campos derivados (companyName, institutionName) e o `id`.
            const atualizado = await debtService.updateContract(contract.id, {
                ...(contract as unknown as DebtContractInput),
                dayCountConvention: c,
            });
            onContratoAlterado(atualizado);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível salvar a convenção.');
        } finally {
            setSalvando(false);
        }
    };

    const exportar = () => {
        baixarCsv(
            `divida-competencia-${(contract.contractNumber ?? 'contrato').replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}`,
            toCsv(
                ['Competência', 'Juros apropriados', 'Correção', 'Amortização', 'Encargos'],
                meses.map(m => [m.mes, m.juros, m.correcao, m.amortizacao, m.encargos]),
            ),
        );
    };

    const totais = meses.reduce(
        (a, m) => ({
            juros: a.juros + m.juros, correcao: a.correcao + m.correcao,
            amortizacao: a.amortizacao + m.amortizacao, encargos: a.encargos + m.encargos,
        }),
        { juros: 0, correcao: 0, amortizacao: 0, encargos: 0 },
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={convencao ?? ''}
                        disabled={salvando}
                        onChange={e => e.target.value && void escolher(e.target.value as DayCountConvention)}
                        className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer min-w-[300px]"
                    >
                        <option value="">Escolha a convenção de contagem…</option>
                        {(Object.entries(DAY_COUNT_PT) as [DayCountConvention, string][]).map(([k, v]) => (
                            <option key={k} value={k}>{k} — {v}</option>
                        ))}
                    </select>
                    {salvando && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
                    <input
                        type="date" value={fechamento} onChange={e => setFechamento(e.target.value)}
                        className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium"
                    />
                </div>
                {meses.length > 0 && (
                    <button
                        onClick={exportar}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                    >
                        <Download className="w-[15px] h-[15px]" />
                        Exportar competência
                    </button>
                )}
            </div>

            {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[10px] px-4 py-3">{erro}</div>}

            {!convencao ? (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm text-center py-12 px-6">
                    <CalendarClock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Escolha a convenção de contagem</h3>
                    <p className="text-sm text-gray-500 max-w-xl mx-auto">
                        A apropriação por competência depende de <strong>como se contam os dias</strong>, e a
                        escolha muda o número que vai para a contabilidade. Não assumimos uma por você:
                        contrato indexado a CDI apurado em ACT/365 dá resultado diferente do que o banco calcula
                        — para esses, a convenção é <strong>DU/252</strong>.
                    </p>
                </div>
            ) : linhas.length === 0 ? (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm text-center py-12">
                    <CalendarClock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Sem cronograma</h3>
                    <p className="text-sm text-gray-500">Gere o cronograma para apropriar os juros.</p>
                </div>
            ) : (
                <>
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-5">
                        <h3 className="text-sm font-bold text-gray-800 mb-4">
                            Juros incorridos em {formatDateBR(fechamento)}
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                            {([
                                ['Parcela em curso', naData?.parcelaEmCurso ? `nº ${naData.parcelaEmCurso}` : '—'],
                                ['Período', naData?.inicioDoPeriodo
                                    ? `${formatDateBR(naData.inicioDoPeriodo)} → ${formatDateBR(naData.fimDoPeriodo!)}`
                                    : '—'],
                                ['Dias decorridos', naData
                                    ? `${naData.diasDecorridos} de ${naData.diasDoPeriodo}`
                                    : '—'],
                                ['Fração do período', naData
                                    ? `${(naData.fracaoDecorrida * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
                                    : '—'],
                            ] as [string, string][]).map(([k, v]) => (
                                <div key={k} className="space-y-0.5">
                                    <p className="text-xs font-semibold text-slate-500">{k}</p>
                                    <p className="text-sm font-normal text-gray-800">{v}</p>
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-5 pt-5 border-t border-gray-100">
                            <div className="space-y-0.5">
                                <p className="text-xs font-semibold text-slate-500">Juros já vencidos</p>
                                <p className="text-sm font-medium text-gray-800">{formatMoney(naData?.jurosVencidos ?? 0)}</p>
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-xs font-semibold text-slate-500">Juros incorridos a vencer</p>
                                <p className="text-sm font-medium text-gray-800">{formatMoney(naData?.jurosIncorridos ?? 0)}</p>
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-xs font-semibold text-slate-500">Juros da parcela em curso</p>
                                <p className="text-sm font-normal text-gray-600">{formatMoney(naData?.jurosDaParcela ?? 0)}</p>
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-4">
                            Contado em <strong>{convencao}</strong> — {DAY_COUNT_PT[convencao]}.
                        </p>
                        {/* Sem esta nota o seletor parece quebrado: dentro de UM
                            período o rateio é dias decorridos ÷ dias do período,
                            e a base anual cancela. ACT/365 e ACT/360 só divergem
                            ao anualizar; 30/360 diverge em mês irregular. */}
                        <p className="text-xs text-gray-400 mt-1">
                            Num mesmo período, <strong>ACT/365, ACT/360 e ACT/ACT dão o mesmo rateio</strong> — a
                            base anual cancela na divisão, e elas só divergem ao converter para taxa ao ano.
                            <strong> 30/360</strong> muda o número em mês irregular (fevereiro, meses de 31 dias)
                            e <strong>DU/252</strong> muda sempre, porque conta outro conjunto de dias.
                        </p>
                    </div>

                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                        <div className="p-5 pb-0">
                            <h3 className="text-sm font-bold text-gray-800">Apropriação mês a mês</h3>
                        </div>
                        <div className="overflow-auto max-h-[60vh]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        <th className={`${th} text-left`}>Competência</th>
                                        <th className={`${th} text-right`}>Juros apropriados</th>
                                        <th className={`${th} text-right`}>Correção</th>
                                        <th className={`${th} text-right`}>Amortização</th>
                                        <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Encargos</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {meses.map(m => (
                                        <tr key={m.mes} className="hover:bg-blue-50/50 transition-colors">
                                            <td className={`${td} text-gray-700`}>{m.mes}</td>
                                            <td className={`${td} text-right font-medium text-gray-800`}>{formatMoney(m.juros)}</td>
                                            <td className={`${td} text-right text-gray-600`}>{formatMoney(m.correcao)}</td>
                                            <td className={`${td} text-right text-gray-600`}>{formatMoney(m.amortizacao)}</td>
                                            <td className="px-6 py-2.5 text-right text-sm font-normal text-gray-600">{formatMoney(m.encargos)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-gray-50 border-t border-gray-200">
                                        <td className={`${td} text-right text-gray-500`}>Totais</td>
                                        <td className={`${td} text-right font-medium text-gray-800`}>{formatMoney(totais.juros)}</td>
                                        <td className={`${td} text-right text-gray-600`}>{formatMoney(totais.correcao)}</td>
                                        <td className={`${td} text-right text-gray-600`}>{formatMoney(totais.amortizacao)}</td>
                                        <td className="px-6 py-2.5 text-right text-sm font-normal text-gray-600">{formatMoney(totais.encargos)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        <div className="px-5 py-3 border-t border-gray-100 bg-amber-50/60">
                            <p className="text-xs text-amber-800">
                                Os juros são <strong>rateados entre os meses que o período atravessa</strong> — uma
                                parcela que vence dia 10 tem a maior parte dos juros pertencendo ao mês anterior.
                                Amortização e encargos não são rateados: acontecem no vencimento. É por isso que
                                esta tabela difere do cronograma por data de vencimento.
                            </p>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
