import React from 'react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { formatMoney, formatDateBR } from '../ui/Format';
import { debtService } from '../../services/debtService';
import { debtFinanceService } from '../../services/debtFinanceService';
import type { DebtAllocation, DebtContract, DebtInstallment } from '../../types/debt';
import { DEBT_AMORTIZATION_PT, type AmortizationEffect, type AmortizationSystem } from '../../types/debt';

type Modo = 'AMORTIZACAO' | 'RENEGOCIACAO';

interface Props {
    open: boolean;
    onClose: () => void;
    contract: DebtContract;
    /** Parcelas do cronograma vigente, para mostrar o saldo na data. */
    installments: DebtInstallment[];
    rateio: DebtAllocation[];
    onDone: () => void;
}

const Label = ({ children }: { children: React.ReactNode }) => (
    <label className="text-xs font-semibold text-slate-500">{children}</label>
);

const campo = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';

const hoje = () => new Date().toISOString().slice(0, 10);

export default function DebtRenegotiateSheet({ open, onClose, contract, installments, rateio, onDone }: Props) {
    const [modo, setModo] = React.useState<Modo>('AMORTIZACAO');
    const [data, setData] = React.useState(hoje());
    const [valor, setValor] = React.useState(0);
    const [efeito, setEfeito] = React.useState<AmortizationEffect>('REDUZIR_PRAZO');
    const [novaTaxa, setNovaTaxa] = React.useState<string>('');
    const [novoPrazo, setNovoPrazo] = React.useState<string>('');
    const [novoSistema, setNovoSistema] = React.useState<AmortizationSystem | ''>('');
    const [motivo, setMotivo] = React.useState('');
    const [processando, setProcessando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!open) return;
        setModo('AMORTIZACAO');
        setData(hoje());
        setValor(0);
        setEfeito('REDUZIR_PRAZO');
        setNovaTaxa('');
        setNovoPrazo('');
        setNovoSistema('');
        setMotivo('');
        setErro(null);
    }, [open]);

    const abertas = React.useMemo(
        () => installments.filter(p => p.dueDate >= data && p.status !== 'CANCELADA'),
        [installments, data],
    );

    /** Saldo devedor na data: fechamento da última parcela já vencida. */
    const saldo = React.useMemo(() => {
        const vencidas = installments.filter(p => p.dueDate < data);
        if (vencidas.length === 0) return contract.principalReleased;
        return vencidas[vencidas.length - 1].closingBalance;
    }, [installments, data, contract.principalReleased]);

    const executar = async () => {
        setProcessando(true);
        setErro(null);
        try {
            const overrides: Record<string, unknown> = {};
            if (modo === 'RENEGOCIACAO') {
                if (novaTaxa !== '') overrides.nominalRate = Number(novaTaxa);
                if (novoPrazo !== '') overrides.installmentCount = Number(novoPrazo);
                if (novoSistema !== '') overrides.system = novoSistema;
            }

            const razao = motivo.trim() || (modo === 'AMORTIZACAO'
                ? `Amortização extraordinária de ${formatMoney(valor)}`
                : 'Renegociação de condições');

            const { installments: novas } = await debtService.rebuildScheduleFrom(contract, {
                effectiveDate: data,
                reason: razao,
                extraAmortization: modo === 'AMORTIZACAO' ? valor : 0,
                effect: efeito,
                overrides,
            });

            await debtFinanceService.registerEvent(contract, {
                eventType: modo === 'AMORTIZACAO' ? 'AMORTIZACAO_EXTRAORDINARIA' : 'RENEGOCIACAO',
                eventDate: data,
                amount: modo === 'AMORTIZACAO' ? valor : 0,
                notes: razao,
                payload: { efeito, overrides, saldoAntes: saldo },
            });

            // Só o futuro é reemitido no Contas a Pagar: `fromDate` é a data de
            // efeito, então parcela de período fechado (que a trigger barraria)
            // e parcela já conciliada não são tocadas.
            await debtFinanceService.syncInstallmentsToPayables(contract, novas, {
                fromDate: data,
                rateio,
            });

            onDone();
            onClose();
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível concluir a operação.');
        } finally {
            setProcessando(false);
        }
    };

    const podeExecutar = modo === 'RENEGOCIACAO'
        ? (novaTaxa !== '' || novoPrazo !== '' || novoSistema !== '')
        : valor > 0 && valor <= saldo;

    return (
        <Sheet open={open} onClose={onClose} size="xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Renegociar ou amortizar</SheetTitle>
                <SheetDescription>
                    O cronograma contratual original nunca é sobrescrito — esta operação cria uma versão vigente nova.
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-5">
                {erro && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[10px] px-4 py-3">{erro}</div>
                )}

                <div className="flex items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 w-fit">
                    {([['AMORTIZACAO', 'Amortização extraordinária'], ['RENEGOCIACAO', 'Renegociação']] as [Modo, string][]).map(([id, label]) => (
                        <button
                            key={id}
                            onClick={() => setModo(id)}
                            className={`px-3 h-7 rounded-[6px] text-sm font-medium transition-all ${
                                modo === id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="bg-gray-50 border border-gray-100 rounded-[10px] p-4 grid grid-cols-3 gap-4">
                    <div>
                        <p className="text-xs font-semibold text-slate-500">Saldo devedor na data</p>
                        <p className="text-sm font-medium text-gray-800">{formatMoney(saldo)}</p>
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-slate-500">Parcelas em aberto</p>
                        <p className="text-sm font-medium text-gray-800">{abertas.length}</p>
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-slate-500">Próximo vencimento</p>
                        <p className="text-sm font-medium text-gray-800">
                            {abertas[0] ? formatDateBR(abertas[0].dueDate) : '—'}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <Label>Data de efeito</Label>
                        <input type="date" className={campo} value={data} onChange={e => setData(e.target.value)} />
                        <p className="text-xs text-gray-400">Parcelas anteriores a esta data são preservadas como estão.</p>
                    </div>

                    {modo === 'AMORTIZACAO' ? (
                        <>
                            <div className="space-y-1">
                                <Label>Valor amortizado</Label>
                                <input
                                    type="number" step="0.01" className={campo} value={valor}
                                    onChange={e => setValor(e.target.value === '' ? 0 : Number(e.target.value))}
                                />
                            </div>
                            <div className="space-y-1 md:col-span-2">
                                <Label>Efeito no cronograma</Label>
                                <select className={campo} value={efeito} onChange={e => setEfeito(e.target.value as AmortizationEffect)}>
                                    <option value="REDUZIR_PRAZO">Reduzir prazo (mantém o valor da parcela)</option>
                                    <option value="REDUZIR_PARCELA">Reduzir a parcela (mantém o prazo)</option>
                                </select>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="space-y-1">
                                <Label>Nova taxa nominal (%) — opcional</Label>
                                <input type="number" step="0.000001" className={campo} value={novaTaxa} onChange={e => setNovaTaxa(e.target.value)} placeholder={String(contract.nominalRate)} />
                            </div>
                            <div className="space-y-1">
                                <Label>Novo nº de parcelas — opcional</Label>
                                <input type="number" className={campo} value={novoPrazo} onChange={e => setNovoPrazo(e.target.value)} placeholder={String(abertas.length)} />
                            </div>
                            <div className="space-y-1">
                                <Label>Novo sistema — opcional</Label>
                                <select className={campo} value={novoSistema} onChange={e => setNovoSistema(e.target.value as AmortizationSystem | '')}>
                                    <option value="">Manter {DEBT_AMORTIZATION_PT[contract.amortizationSystem]}</option>
                                    {Object.entries(DEBT_AMORTIZATION_PT).map(([k, v]) => (
                                        <option key={k} value={k}>{v}</option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}

                    <div className="space-y-1 md:col-span-2">
                        <Label>Motivo</Label>
                        <input className={campo} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Fica registrado no histórico e na versão do cronograma" />
                    </div>
                </div>

                <p className="text-xs text-gray-400">
                    Os títulos já emitidos no Contas a Pagar para parcelas anteriores à data de efeito não são
                    alterados. Só o trecho futuro é recalculado e reemitido.
                </p>
            </SheetPanel>

            <SheetFooter>
                <button onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] transition-all">
                    Cancelar
                </button>
                <button
                    onClick={executar}
                    disabled={processando || !podeExecutar}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {processando ? 'Recalculando…' : modo === 'AMORTIZACAO' ? 'Amortizar' : 'Renegociar'}
                </button>
            </SheetFooter>
        </Sheet>
    );
}
