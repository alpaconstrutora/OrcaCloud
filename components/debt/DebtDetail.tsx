import React from 'react';
import { ArrowLeft, Calculator, History, Landmark, Loader2, RefreshCw, Scissors, Upload } from 'lucide-react';
import { formatMoney, formatDateBR } from '../ui/Format';
import { useConfirm } from '../ui/confirm';
import ActionIconButton from '../ui/ActionIconButton';
import { debtService } from '../../services/debtService';
import { debtFinanceService } from '../../services/debtFinanceService';
import { toCsv, baixarCsv } from '../../services/debtAnalyticsService';
import DebtRenegotiateSheet from './DebtRenegotiateSheet';
import {
    DEBT_AMORTIZATION_PT,
    DEBT_INSTALLMENT_STATUS_PT,
    DEBT_MODALITY_PT,
    DEBT_STATUS_PT,
    type DebtAllocation,
    type DebtContract,
    type DebtDisbursement,
    type DebtInstallment,
    type DebtSchedule,
    type DebtScheduleKind,
} from '../../types/debt';

type Aba = 'visao' | 'cronograma' | 'realizado' | 'liberacoes' | 'rateio' | 'garantias';

const ABAS: { id: Aba; label: string }[] = [
    { id: 'visao', label: 'Visão geral' },
    { id: 'cronograma', label: 'Cronograma' },
    // A terceira camada do PRD: o que de fato aconteceu, ao lado do contratual
    // e do vigente.
    { id: 'realizado', label: 'Realizado' },
    { id: 'liberacoes', label: 'Liberações' },
    { id: 'rateio', label: 'Rateio' },
    { id: 'garantias', label: 'Garantias' },
];

const EVENTO_PT: Record<string, string> = {
    PAGAMENTO: 'Pagamento',
    PAGAMENTO_PARCIAL: 'Pagamento parcial',
    AMORTIZACAO_EXTRAORDINARIA: 'Amortização extraordinária',
    ANTECIPACAO: 'Antecipação',
    RENEGOCIACAO: 'Renegociação',
    RECLASSIFICACAO_ENCARGO: 'Reclassificação de encargo',
    DIVERGENCIA_BANCARIA: 'Divergência bancária',
    LIBERACAO: 'Liberação',
    LIQUIDACAO: 'Liquidação',
};

const STATUS_PARCELA_COR: Record<string, string> = {
    PAGA: 'text-green-700',
    PARCIALMENTE_PAGA: 'text-amber-700',
    VENCIDA: 'text-red-600',
    A_VENCER: 'text-blue-700',
    EM_APROVACAO: 'text-orange-700',
    PROVISIONADA: 'text-indigo-700',
    PREVISTA: 'text-yellow-700',
    RENEGOCIADA: 'text-indigo-700',
    ANTECIPADA: 'text-teal-700',
    CANCELADA: 'text-gray-500',
};

interface Props {
    contract: DebtContract;
    onBack: () => void;
    onEdit: () => void;
    onChanged: (contract: DebtContract) => void;
}

/** Par rótulo/valor da aba Visão. */
const Dado = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="space-y-0.5">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className="text-sm font-normal text-gray-800">{children ?? '—'}</p>
    </div>
);

export default function DebtDetail({ contract, onBack, onEdit, onChanged }: Props) {
    const confirm = useConfirm();
    const [aba, setAba] = React.useState<Aba>('visao');
    const [camada, setCamada] = React.useState<DebtScheduleKind>('VIGENTE');
    const [schedules, setSchedules] = React.useState<DebtSchedule[]>([]);
    const [parcelas, setParcelas] = React.useState<DebtInstallment[]>([]);
    const [liberacoes, setLiberacoes] = React.useState<DebtDisbursement[]>([]);
    const [rateio, setRateio] = React.useState<DebtAllocation[]>([]);
    const [eventos, setEventos] = React.useState<Record<string, unknown>[]>([]);
    const [carregando, setCarregando] = React.useState(false);
    const [gerando, setGerando] = React.useState(false);
    const [emitindo, setEmitindo] = React.useState(false);
    const [renegociando, setRenegociando] = React.useState(false);
    const [aviso, setAviso] = React.useState<string | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);

    const carregar = React.useCallback(async () => {
        setCarregando(true);
        setErro(null);
        try {
            const [todos, libs, alocs, evs] = await Promise.all([
                debtService.listSchedules(contract.id),
                debtService.listDisbursements(contract.id),
                debtService.listAllocations(contract.id),
                debtFinanceService.listEvents(contract.id),
            ]);
            setSchedules(todos);
            setLiberacoes(libs);
            setRateio(alocs);
            setEventos(evs);
            const ativo = todos.find(s => s.kind === camada && s.isActive);
            setParcelas(ativo ? await debtService.listInstallments(ativo.id) : []);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível carregar o contrato.');
        } finally {
            setCarregando(false);
        }
    }, [contract.id, camada]);

    React.useEffect(() => { void carregar(); }, [carregar]);

    const gerarCronograma = async () => {
        const jaTem = schedules.some(s => s.kind === 'VIGENTE' && s.isActive);
        if (jaTem) {
            const ok = await confirm({
                title: 'Regerar o cronograma?',
                message: 'A versão vigente atual será substituída por uma nova. O cronograma CONTRATUAL original permanece intacto.',
                variant: 'warning',
                confirmLabel: 'Regerar',
            });
            if (!ok) return;
        }
        setGerando(true);
        setErro(null);
        try {
            await debtService.generateSchedule(contract);
            setAba('cronograma');
            setCamada('VIGENTE');
            await carregar();
            onChanged(contract);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível gerar o cronograma.');
        } finally {
            setGerando(false);
        }
    };

    /**
     * Materializa as parcelas em aberto como títulos no Contas a Pagar.
     * `fromDate` fica no default (hoje): parcela vencida antes de hoje pode
     * estar em período fechado, e a trigger de bloqueio barraria a escrita.
     */
    const emitirTitulos = async () => {
        const vigente = schedules.find(sc => sc.kind === 'VIGENTE' && sc.isActive);
        if (!vigente) { setErro('Gere o cronograma antes de emitir os títulos.'); return; }
        setEmitindo(true);
        setErro(null);
        setAviso(null);
        try {
            const abertas = await debtService.listInstallments(vigente.id);
            const r = await debtFinanceService.syncInstallmentsToPayables(contract, abertas, { rateio });
            await debtFinanceService.registerEvent(contract, {
                eventType: 'LIBERACAO',
                eventDate: new Date().toISOString().slice(0, 10),
                notes: `${r.inseridas} título(s) emitido(s) no Contas a Pagar`,
                payload: { inseridas: r.inseridas, removidas: r.removidas },
            });
            setAviso(
                `${r.inseridas} título(s) no Contas a Pagar` +
                (r.removidas > 0 ? ` (${r.removidas} substituído(s))` : '') +
                '. Cada parcela vira uma linha por componente.',
            );
            await carregar();
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível emitir os títulos.');
        } finally {
            setEmitindo(false);
        }
    };

    /** Extrato por contrato (PRD item 12) — a memória de cálculo em CSV. */
    const exportarExtrato = () => {
        const nome = (contract.contractNumber || DEBT_MODALITY_PT[contract.modality])
            .replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase();
        baixarCsv(
            `divida-extrato-${nome}-${camada.toLowerCase()}`,
            toCsv(
                ['Parcela', 'Vencimento', 'Saldo inicial', 'Amortização', 'Juros', 'Correção',
                 'IOF', 'Seguro', 'Tarifas', 'Parcela total', 'Saldo final', 'Situação'],
                parcelas.map(p => [
                    p.seq, p.dueDate, p.openingBalance, p.amortization, p.interest,
                    p.monetaryCorrection, p.iof, p.insurance, p.fees, p.total, p.closingBalance,
                    DEBT_INSTALLMENT_STATUS_PT[p.status],
                ]),
            ),
        );
    };

    const totais = React.useMemo(() => ({
        amortizacao: parcelas.reduce((a, p) => a + p.amortization, 0),
        juros: parcelas.reduce((a, p) => a + p.interest, 0),
        correcao: parcelas.reduce((a, p) => a + p.monetaryCorrection, 0),
        encargos: parcelas.reduce((a, p) => a + p.iof + p.insurance + p.fees, 0),
        total: parcelas.reduce((a, p) => a + p.total, 0),
    }), [parcelas]);

    const th = 'px-6 py-2 border-r border-gray-100 text-table-header font-semibold text-gray-500';
    const td = 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';

    return (
        <div className="space-y-6 pb-20">
            <div>
                <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-blue-600 transition-all mb-2">
                    <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                    {contract.contractNumber || DEBT_MODALITY_PT[contract.modality]}
                </h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">
                    {contract.institutionName ?? 'Parte relacionada'} · {DEBT_MODALITY_PT[contract.modality]} · {DEBT_STATUS_PT[contract.status]}
                </p>
            </div>

            {/* Abas — §19.1 */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {ABAS.map(a => (
                        <button
                            key={a.id}
                            onClick={() => setAba(a.id)}
                            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                aba === a.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            {a.label}
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <ActionIconButton kind="edit" onClick={onEdit} />
                    <button
                        onClick={() => setRenegociando(true)}
                        disabled={!schedules.some(sc => sc.kind === 'VIGENTE' && sc.isActive)}
                        className="flex items-center gap-1.5 h-9 px-3.5 text-slate-600 border border-gray-200 bg-white rounded-[6px] hover:bg-slate-50 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40"
                    >
                        <Scissors className="w-[15px] h-[15px]" />
                        Amortizar / renegociar
                    </button>
                    <button
                        onClick={emitirTitulos}
                        disabled={emitindo}
                        className="flex items-center gap-1.5 h-9 px-3.5 text-slate-600 border border-gray-200 bg-white rounded-[6px] hover:bg-slate-50 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40"
                    >
                        {emitindo ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Upload className="w-[15px] h-[15px]" />}
                        Emitir no Contas a Pagar
                    </button>
                    <button
                        onClick={gerarCronograma}
                        disabled={gerando}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40"
                    >
                        {gerando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Calculator className="w-[15px] h-[15px]" />}
                        {schedules.some(sc => sc.kind === 'VIGENTE') ? 'Regerar cronograma' : 'Gerar cronograma'}
                    </button>
                </div>
            </div>

            {erro && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[10px] px-4 py-3">{erro}</div>
            )}
            {aviso && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-[10px] px-4 py-3">{aviso}</div>
            )}

            {aba === 'visao' && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-6 grid grid-cols-2 md:grid-cols-4 gap-5">
                    <Dado label="Empresa / SPE">{contract.companyName}</Dado>
                    <Dado label="Instituição">{contract.institutionName}</Dado>
                    <Dado label="Agência">{contract.institutionBranch}</Dado>
                    <Dado label="Finalidade">{contract.purpose}</Dado>
                    <Dado label="Valor contratado">{formatMoney(contract.principalContracted)}</Dado>
                    <Dado label="Valor liberado">{formatMoney(contract.principalReleased)}</Dado>
                    <Dado label="Líquido recebido">{formatMoney(contract.netReceived)}</Dado>
                    <Dado label="Sistema">{DEBT_AMORTIZATION_PT[contract.amortizationSystem]}</Dado>
                    <Dado label="Taxa nominal">
                        {contract.nominalRate}% {contract.ratePeriod === 'MENSAL' ? 'a.m.' : 'a.a.'}
                    </Dado>
                    <Dado label="Indexador">
                        {contract.indexName ? `${contract.indexName}${contract.indexPct ? ` (${contract.indexPct}%)` : ''}` : null}
                    </Dado>
                    <Dado label="Carência de principal">{contract.gracePrincipalMonths} meses</Dado>
                    <Dado label="Carência de juros">{contract.graceInterestMonths} meses</Dado>
                    <Dado label="Contratação">{contract.signedAt ? formatDateBR(contract.signedAt) : null}</Dado>
                    <Dado label="1º vencimento">{contract.firstDueDate ? formatDateBR(contract.firstDueDate) : null}</Dado>
                    <Dado label="Vencimento final">{contract.finalDueDate ? formatDateBR(contract.finalDueDate) : null}</Dado>
                    <Dado label="Nº de parcelas">{contract.installmentCount}</Dado>
                </div>
            )}

            {aba === 'cronograma' && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-2 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-2.5 items-center">
                        {/* As três camadas do PRD: contratual (imutável) × vigente (revisada).
                            A camada "realizado" chega na Fase 1b, com debt_events. */}
                        <div className="flex items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1">
                            {(['CONTRATUAL', 'VIGENTE'] as DebtScheduleKind[]).map(k => (
                                <button
                                    key={k}
                                    onClick={() => setCamada(k)}
                                    className={`px-3 h-7 rounded-[6px] text-sm font-medium transition-all ${
                                        camada === k ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                                    }`}
                                >
                                    {k === 'CONTRATUAL' ? 'Contratual (original)' : 'Vigente'}
                                </button>
                            ))}
                        </div>
                        <div className="flex-1" />
                        <button
                            onClick={exportarExtrato}
                            disabled={parcelas.length === 0}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-40"
                        >
                            Exportar extrato
                        </button>
                        <button onClick={() => void carregar()} className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95">
                            <RefreshCw className="w-4 h-4" />
                        </button>
                    </div>

                    {carregando ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500">Carregando...</p>
                        </div>
                    ) : parcelas.length === 0 ? (
                        <div className="text-center py-12">
                            <Calculator className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Sem cronograma nesta camada</h3>
                            <p className="text-sm text-gray-500">
                                Preencha valor liberado, 1º vencimento e nº de parcelas e clique em “Gerar cronograma”.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-auto max-h-[70vh]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        <th className={`${th} text-center`}>#</th>
                                        <th className={`${th} text-center`}>Vencimento</th>
                                        <th className={`${th} text-right`}>Saldo inicial</th>
                                        <th className={`${th} text-right`}>Amortização</th>
                                        <th className={`${th} text-right`}>Juros</th>
                                        <th className={`${th} text-right`}>Correção</th>
                                        <th className={`${th} text-right`}>IOF</th>
                                        <th className={`${th} text-right`}>Seguro</th>
                                        <th className={`${th} text-right`}>Tarifas</th>
                                        <th className={`${th} text-right`}>Parcela</th>
                                        <th className={`${th} text-right`}>Saldo final</th>
                                        <th className="px-6 py-2 text-center text-table-header font-semibold text-gray-500">Situação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {parcelas.map(p => (
                                        <tr key={p.id} className="hover:bg-blue-50/50 transition-colors">
                                            <td className={`${td} text-center text-gray-600`}>{p.seq}</td>
                                            <td className={`${td} text-center text-gray-600`}>{formatDateBR(p.dueDate)}</td>
                                            <td className={`${td} text-right text-gray-600`}>{formatMoney(p.openingBalance)}</td>
                                            <td className={`${td} text-right font-medium text-gray-800`}>{formatMoney(p.amortization)}</td>
                                            <td className={`${td} text-right font-medium text-gray-800`}>{formatMoney(p.interest)}</td>
                                            <td className={`${td} text-right text-gray-600`}>{formatMoney(p.monetaryCorrection)}</td>
                                            <td className={`${td} text-right text-gray-600`}>{formatMoney(p.iof)}</td>
                                            <td className={`${td} text-right text-gray-600`}>{formatMoney(p.insurance)}</td>
                                            <td className={`${td} text-right text-gray-600`}>{formatMoney(p.fees)}</td>
                                            <td className={`${td} text-right font-medium text-gray-800`}>{formatMoney(p.total)}</td>
                                            <td className={`${td} text-right text-gray-600`}>{formatMoney(p.closingBalance)}</td>
                                            <td className="px-6 py-2.5 text-center">
                                                <span className={`text-sm font-normal ${STATUS_PARCELA_COR[p.status] ?? 'text-gray-600'}`}>
                                                    {DEBT_INSTALLMENT_STATUS_PT[p.status]}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-gray-50 border-t border-gray-200">
                                        <td className={`${td} text-right text-gray-500`} colSpan={3}>Totais</td>
                                        <td className={`${td} text-right font-medium text-gray-800`}>{formatMoney(totais.amortizacao)}</td>
                                        <td className={`${td} text-right font-medium text-gray-800`}>{formatMoney(totais.juros)}</td>
                                        <td className={`${td} text-right text-gray-600`}>{formatMoney(totais.correcao)}</td>
                                        <td className={`${td} text-right text-gray-600`} colSpan={3}>{formatMoney(totais.encargos)}</td>
                                        <td className={`${td} text-right font-medium text-gray-800`}>{formatMoney(totais.total)}</td>
                                        <td className={`${td} text-right text-gray-600`} colSpan={2}></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {aba === 'realizado' && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    {eventos.length === 0 ? (
                        <div className="text-center py-12">
                            <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nada realizado ainda</h3>
                            <p className="text-sm text-gray-500">
                                Pagamentos, amortizações extraordinárias e renegociações aparecem aqui — é a
                                camada que permite comparar o contratado com o executado.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-auto max-h-[70vh]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        <th className={`${th} text-center`}>Data</th>
                                        <th className={`${th} text-left`}>Evento</th>
                                        <th className={`${th} text-right`}>Valor</th>
                                        <th className="px-6 py-2 text-left text-table-header font-semibold text-gray-500">Observação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {eventos.map(ev => (
                                        <tr key={String(ev.id)} className="hover:bg-blue-50/50 transition-colors">
                                            <td className={`${td} text-center text-gray-600`}>{formatDateBR(String(ev.event_date))}</td>
                                            <td className={`${td} text-left text-gray-700`}>
                                                {EVENTO_PT[String(ev.event_type)] ?? String(ev.event_type)}
                                            </td>
                                            <td className={`${td} text-right font-medium text-gray-800`}>
                                                {Number(ev.amount ?? 0) > 0 ? formatMoney(Number(ev.amount)) : '—'}
                                            </td>
                                            <td className="px-6 py-2.5 text-sm font-normal text-gray-600">
                                                <span className="block truncate" title={String(ev.notes ?? '')}>{String(ev.notes ?? '—')}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {aba === 'liberacoes' && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    {liberacoes.length === 0 ? (
                        <div className="text-center py-12">
                            <Landmark className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma liberação registrada</h3>
                            <p className="text-sm text-gray-500">
                                Enquanto não houver liberação, o cronograma usa o valor liberado do contrato.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        <th className={`${th} text-center`}>Data</th>
                                        <th className={`${th} text-right`}>Bruto</th>
                                        <th className={`${th} text-right`}>Retido</th>
                                        <th className={`${th} text-right`}>Tarifas</th>
                                        <th className={`${th} text-right`}>IOF</th>
                                        <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Líquido</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {liberacoes.map(l => (
                                        <tr key={l.id} className="hover:bg-blue-50/50 transition-colors">
                                            <td className={`${td} text-center text-gray-600`}>{formatDateBR(l.disbursedAt)}</td>
                                            <td className={`${td} text-right font-medium text-gray-800`}>{formatMoney(l.grossAmount)}</td>
                                            <td className={`${td} text-right text-gray-600`}>{formatMoney(l.retainedAmount)}</td>
                                            <td className={`${td} text-right text-gray-600`}>{formatMoney(l.fees)}</td>
                                            <td className={`${td} text-right text-gray-600`}>{formatMoney(l.iof)}</td>
                                            <td className="px-6 py-2.5 text-right text-sm font-medium text-gray-800">{formatMoney(l.netAmount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {aba === 'rateio' && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-6">
                    {rateio.length === 0 ? (
                        <div className="text-center py-12">
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Sem rateio cadastrado</h3>
                            <p className="text-sm text-gray-500">
                                Sem rateio, a dívida não aparece no custo financeiro por obra nem por empreendimento.
                            </p>
                        </div>
                    ) : (
                        <ul className="space-y-2">
                            {rateio.map(r => (
                                <li key={r.id} className="flex items-center justify-between text-sm font-normal text-gray-700 border-b border-gray-100 pb-2 last:border-b-0">
                                    <span>{r.targetKind}</span>
                                    <span className="font-medium text-gray-800">{r.percent}%</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {aba === 'garantias' && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-6 text-center py-12">
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Garantias</h3>
                    <p className="text-sm text-gray-500">
                        A estrutura de garantias (<code>contract_guarantees</code>) já aceita contratos de dívida.
                        A tela chega na Fase 1c, junto com o alerta de ativo oferecido em duas operações.
                    </p>
                </div>
            )}

            <DebtRenegotiateSheet
                open={renegociando}
                onClose={() => setRenegociando(false)}
                contract={contract}
                installments={parcelas}
                rateio={rateio}
                onDone={() => { setCamada('VIGENTE'); setAba('cronograma'); void carregar(); }}
            />
        </div>
    );
}
