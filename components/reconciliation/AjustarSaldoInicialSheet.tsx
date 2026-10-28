import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, Loader2, RotateCcw } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { formatMoney, formatDateBR } from '../ui/Format';
import { ROTULO_ORIGEM, type EstadoSaldoBanco, type SugestoesDeAjuste } from '../../utils/conciliacaoSaldoBanco';

/**
 * "Ajustar saldo inicial" — quando o saldo que o banco informa não bate com o calculado.
 * Duas saídas, cada uma com o que muda (decisão do usuário, 28/10/2026): no Itaú, manter a
 * data dava −R$ 10,9 mi de saldo inicial em 2014; recomeçar tira 7.516 pendentes do painel.
 * A gaveta é a confirmação: os números de antes e depois estão nela.
 * Plano: docs/planos/2026-10-28-conciliacao-dashboard-confianca.md (passo 2, item 2.4).
 */

type Opcao = 'manter' | 'recomecar';

interface Props {
    open: boolean;
    conta: { id: string; nome: string; saldoInicial: number; dataInicial: string | null } | null;
    estado: Extract<EstadoSaldoBanco, { tipo: 'fora' }> | null;
    sugestoes: SugestoesDeAjuste | null;
    onClose: () => void;
    /** `data` null = todo o extrato. */
    onAplicar: (saldo: number, data: string | null) => Promise<void>;
    /** Sem ele (dashboard fora da Conciliação), o aviso fica sem link. */
    onVerAnomalias?: () => void;
}

const label = 'text-xs font-semibold text-slate-500';

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

const AjustarSaldoInicialSheet: React.FC<Props> = ({ open, conta, estado, sugestoes, onClose, onAplicar, onVerAnomalias }) => {
    const [opcao, setOpcao] = useState<Opcao>('recomecar');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => { if (open) { setOpcao('recomecar'); setErro(null); } }, [open, conta?.id]);

    if (!conta || !estado || !sugestoes) return null;

    const desde = (d: string | null) => (d ? `a partir de ${formatDateBR(d)}` : 'com todo o extrato');
    const escolhida = opcao === 'manter'
        ? { saldo: sugestoes.manterData.saldo, data: sugestoes.manterData.data }
        : { saldo: sugestoes.recomecar.saldo, data: sugestoes.recomecar.data };

    async function aplicar() {
        setSalvando(true);
        setErro(null);
        try {
            await onAplicar(escolhida.saldo, escolhida.data);
            onClose();
        } catch (e: unknown) {
            setErro((e as { message?: string })?.message ?? String(e));
        } finally {
            setSalvando(false);
        }
    }

    const opcoes: Array<{ id: Opcao; titulo: string; icon: React.ElementType; linhas: React.ReactNode[] }> = [
        {
            id: 'recomecar',
            titulo: 'Recomeçar no saldo do banco',
            icon: RotateCcw,
            linhas: [
                <>Saldo inicial {formatMoney(conta.saldoInicial)} <ArrowRight className="inline w-3 h-3" /> <strong className="text-gray-900">{formatMoney(sugestoes.recomecar.saldo)}</strong>, {desde(sugestoes.recomecar.data)}.</>,
                <>O extrato até {formatDateBR(estado.data)} sai deste painel: {plural(sugestoes.recomecar.pendentesQueSaem, 'pendente deixa', 'pendentes deixam')} de contar
                    {sugestoes.recomecar.pendentesQueFicam > 0 ? <> e {plural(sugestoes.recomecar.pendentesQueFicam, 'continua', 'continuam')}</> : null}.</>,
            ],
        },
        {
            id: 'manter',
            titulo: 'Manter a data de início e ajustar o valor',
            icon: CalendarClock,
            linhas: [
                <>Saldo inicial {formatMoney(conta.saldoInicial)} <ArrowRight className="inline w-3 h-3" /> <strong className="text-gray-900">{formatMoney(sugestoes.manterData.saldo)}</strong>, {desde(sugestoes.manterData.data)}.</>,
                <>Bate em {formatDateBR(estado.data)}; antes dessa data o saldo fica deslocado em {formatMoney(Math.abs(estado.diferenca))}.</>,
            ],
        },
    ];

    return (
        <Sheet open={open} onClose={onClose} size="md">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Ajustar saldo inicial</SheetTitle>
                <SheetDescription>{conta.nome}</SheetDescription>
            </SheetHeader>

            <SheetPanel className="p-6 space-y-8">
                {/* O número que a escolha abaixo precisa zerar */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-[10px] border border-gray-100 bg-gray-50 px-3 py-2">
                        <p className={label}>Banco em {formatDateBR(estado.data)}</p>
                        <p className="text-sm font-semibold text-gray-900 tabular-nums">{formatMoney(estado.saldo)}</p>
                        <p className="text-xs text-gray-500">{ROTULO_ORIGEM[estado.origem]}</p>
                    </div>
                    <div className="rounded-[10px] border border-gray-100 bg-gray-50 px-3 py-2">
                        <p className={label}>App calcula</p>
                        <p className="text-sm font-semibold text-gray-900 tabular-nums">{formatMoney(estado.calculado)}</p>
                    </div>
                    <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2">
                        <p className={label}>Diferença</p>
                        <p className="text-sm font-semibold text-amber-800 tabular-nums">{formatMoney(estado.diferenca)}</p>
                    </div>
                </div>

                <div className="flex items-start gap-2 p-3 rounded-[10px] bg-amber-50 border border-amber-200 text-sm text-amber-900">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                        <p>Extrato importado em dobro ou período faltando também abrem diferença — e ajustar o saldo inicial esconde isso.</p>
                        {onVerAnomalias && (
                            <button type="button" onClick={onVerAnomalias} className="mt-1 inline-flex items-center gap-1 font-medium text-blue-700 hover:text-blue-900 hover:underline">
                                Procurar duplicidades em Anomalias <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                {erro && (
                    <div role="alert" className="flex items-start gap-2 p-3 rounded-[10px] bg-red-50 border border-red-200 text-red-700 text-sm">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>Não foi possível ajustar: {erro}</span>
                    </div>
                )}

                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <h3 className="text-sm font-semibold text-gray-900">Como fazer bater</h3>
                    </div>
                    <div className="space-y-2" role="radiogroup" aria-label="Como fazer bater">
                        {opcoes.map(o => {
                            const ativo = opcao === o.id;
                            const Icon = o.icon;
                            return (
                                <button
                                    key={o.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={ativo}
                                    disabled={salvando}
                                    onClick={() => setOpcao(o.id)}
                                    className={`w-full text-left flex items-start gap-3 p-3 rounded-[10px] border transition-all ${
                                        ativo ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                                    }`}
                                >
                                    <Icon className="w-4 h-4 mt-0.5 shrink-0 text-blue-600" />
                                    <span className="min-w-0 space-y-1">
                                        <span className="block text-sm font-medium text-gray-900">{o.titulo}</span>
                                        {o.linhas.map((l, i) => <span key={i} className="block text-sm text-gray-700">{l}</span>)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </SheetPanel>

            <SheetFooter>
                <button onClick={onClose} disabled={salvando} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] transition-all disabled:opacity-50">
                    Cancelar
                </button>
                <button
                    onClick={aplicar}
                    disabled={salvando}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {salvando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                    Ajustar saldo inicial
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default AjustarSaldoInicialSheet;
