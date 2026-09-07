import React from 'react';
import { Banknote, ChevronRight, Plus } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { formatMoney, formatDateBR } from '../ui/Format';
import ActionIconButton from '../ui/ActionIconButton';
import { errorMessage } from '../../hooks/useOrgContext';
import { creditRoomService } from '../../services/creditRoomService';
import {
    DISBURSEMENT_FLUXO,
    DISBURSEMENT_STATUS_PT,
    type CreditRoom,
    type CreditRoomDisbursement,
    type CreditRoomDisbursementStatus,
    type CreditRoomSide,
} from '../../types/creditRoom';

/**
 * Desembolsos da operação — PRD §68 (cadastro), §69 (workflow), §70 (medição
 * financeira) e §71 (medição técnica do banco).
 *
 * Os dois lados usam esta tela, e o que cada um pode fazer é diferente:
 *
 *   TOMADOR  solicita, anexa referência de medição, e registra a liberação.
 *   CREDOR   analisa, informa o percentual físico que a engenharia DELE aferiu
 *            (§71) e aprova ou recusa. É a única escrita do credor aqui — e a
 *            policy da migration ...000005 é quem garante isso, não esta tela.
 */

type Accent = 'indigo' | 'portal';

const ACCENTS: Record<Accent, { btn: string; ring: string; link: string }> = {
    indigo: {
        btn: 'bg-blue-600 text-white hover:bg-blue-700',
        ring: 'focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500',
        link: 'text-blue-600 hover:text-blue-800',
    },
    portal: {
        btn: 'bg-[#E1553C] text-white hover:bg-[#C8452E]',
        ring: 'focus:ring-2 focus:ring-[#E1553C]/25 focus:border-[#E1553C]',
        link: 'text-[#C24428] hover:text-[#A63A22]',
    },
};

// §8 — texto colorido, sem pílula.
const STATUS_COR: Record<CreditRoomDisbursementStatus, string> = {
    SOLICITADO: 'text-blue-700',
    DOCUMENTOS: 'text-blue-700',
    EM_ANALISE: 'text-indigo-700',
    MEDICAO: 'text-violet-700',
    PENDENCIAS: 'text-amber-700',
    APROVADO: 'text-green-700',
    LIBERADO: 'text-green-700',
    CONCILIADO: 'text-gray-500',
    RECUSADO: 'text-red-600',
};

const th = 'px-6 py-2 border-r border-gray-100 text-table-header font-semibold text-gray-500';
const td = 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';
const campo = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none transition-all';
const rotulo = 'text-xs font-semibold text-slate-500';

const pct = (v?: number) => (v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

interface Props {
    room: CreditRoom;
    side: CreditRoomSide;
    accent?: Accent;
}

const CreditRoomDisbursements: React.FC<Props> = ({ room, side, accent = 'indigo' }) => {
    const a = ACCENTS[accent];
    const [itens, setItens] = React.useState<CreditRoomDisbursement[]>([]);
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [novoAberto, setNovoAberto] = React.useState(false);
    const [detalhe, setDetalhe] = React.useState<CreditRoomDisbursement | null>(null);

    const carregar = React.useCallback(async () => {
        setCarregando(true);
        setErro(null);
        try {
            setItens(await creditRoomService.listDisbursements(room));
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível carregar os desembolsos.'));
        } finally {
            setCarregando(false);
        }
    }, [room]);

    React.useEffect(() => { void carregar(); }, [carregar]);

    const totais = React.useMemo(() => {
        const vivos = itens.filter(d => d.status !== 'RECUSADO');
        return {
            solicitado: vivos.reduce((s, d) => s + d.requestedAmount, 0),
            aprovado: vivos.reduce((s, d) => s + (d.approvedAmount ?? 0), 0),
            liberado: vivos.filter(d => d.status === 'LIBERADO' || d.status === 'CONCILIADO')
                .reduce((s, d) => s + d.grossAmount, 0),
        };
    }, [itens]);

    const atualizar = (d: CreditRoomDisbursement) => {
        setItens(prev => prev.map(x => (x.id === d.id ? d : x)));   // §22
        setDetalhe(prev => (prev && prev.id === d.id ? d : prev));
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm">
                <p className="text-sm font-normal text-gray-500 px-1">
                    {itens.length} desembolso{itens.length === 1 ? '' : 's'}
                    {itens.length > 0 && (
                        <span className="text-gray-400">
                            {' '}· solicitado {formatMoney(totais.solicitado)} · aprovado {formatMoney(totais.aprovado)} · liberado {formatMoney(totais.liberado)}
                        </span>
                    )}
                </p>
                {side === 'TOMADOR' && (
                    <button
                        onClick={() => setNovoAberto(true)}
                        className={`flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 shrink-0 ${a.btn}`}
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Solicitar desembolso
                    </button>
                )}
            </div>

            {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[10px] px-4 py-3">{erro}</div>}

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                {carregando ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : itens.length === 0 ? (
                    <div className="text-center py-12">
                        <Banknote className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum desembolso</h3>
                        <p className="text-sm text-gray-500">
                            {side === 'TOMADOR'
                                ? 'Solicite a primeira liberação. Ela nasce como pedido — data e valor entram quando o dinheiro sair.'
                                : 'A empresa ainda não solicitou nenhuma liberação nesta operação.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <th className={`${th} text-center`}>Nº</th>
                                    <th className={th}>Finalidade</th>
                                    <th className={`${th} text-right`}>Solicitado</th>
                                    <th className={`${th} text-right`}>Aprovado</th>
                                    <th className={`${th} text-right`}>Liberado</th>
                                    <th className={`${th} text-center`}>Medição</th>
                                    <th className={`${th} text-center`}>Data</th>
                                    <th className={`${th} text-center`}>Status</th>
                                    <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {itens.map(d => (
                                    <tr key={d.id} className="hover:bg-blue-50/50 transition-colors cursor-pointer" onClick={() => setDetalhe(d)}>
                                        <td className={`${td} text-center text-gray-600`}>{d.seq}</td>
                                        <td className={`${td} text-gray-700`}>
                                            <span className="block truncate" title={d.purpose ?? ''}>{d.purpose || '—'}</span>
                                            {d.measurementRef && <span className="block truncate text-xs text-gray-400" title={d.measurementRef}>{d.measurementRef}</span>}
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-gray-800 text-right">{formatMoney(d.requestedAmount)}</td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-gray-800 text-right">{d.approvedAmount == null ? '—' : formatMoney(d.approvedAmount)}</td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-gray-800 text-right">{d.grossAmount > 0 ? formatMoney(d.grossAmount) : '—'}</td>
                                        <td className={`${td} text-center text-gray-600`}>{pct(d.physicalPct)}</td>
                                        <td className={`${td} text-center text-gray-600`}>{d.disbursedAt ? formatDateBR(d.disbursedAt) : '—'}</td>
                                        <td className={`${td} text-center`}>
                                            <span className={`text-sm font-normal ${STATUS_COR[d.status]}`}>{DISBURSEMENT_STATUS_PT[d.status]}</span>
                                        </td>
                                        <td className="px-6 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                                <button onClick={() => setDetalhe(d)} className={`text-sm font-medium p-1.5 rounded-lg transition-all ${a.link}`}>
                                                    {side === 'CREDOR' ? 'Analisar' : 'Abrir'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <NovoDesembolsoSheet
                open={novoAberto}
                onClose={() => setNovoAberto(false)}
                room={room}
                accent={accent}
                onCreated={d => setItens(prev => [d, ...prev])}
            />
            <DesembolsoSheet
                desembolso={detalhe}
                onClose={() => setDetalhe(null)}
                room={room}
                side={side}
                accent={accent}
                onSaved={atualizar}
            />
        </div>
    );
};

// ── Solicitar (§68) ──────────────────────────────────────────────────────────

const NovoDesembolsoSheet: React.FC<{
    open: boolean; onClose: () => void; room: CreditRoom; accent: Accent;
    onCreated: (d: CreditRoomDisbursement) => void;
}> = ({ open, onClose, room, accent, onCreated }) => {
    const a = ACCENTS[accent];
    const [valor, setValor] = React.useState('');
    const [purpose, setPurpose] = React.useState('');
    const [medicao, setMedicao] = React.useState('');
    const [notes, setNotes] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (open) { setValor(''); setPurpose(''); setMedicao(''); setNotes(''); setErro(null); }
    }, [open]);

    const salvar = async () => {
        const v = Number(valor);
        if (!(v > 0)) { setErro('Informe o valor solicitado.'); return; }
        setSalvando(true);
        setErro(null);
        try {
            onCreated(await creditRoomService.createDisbursement(room, {
                requestedAmount: v,
                purpose: purpose.trim() || undefined,
                measurementRef: medicao.trim() || undefined,
                notes: notes.trim() || undefined,
            }));
            onClose();
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível solicitar o desembolso.'));
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="md" dirty={!!valor || !!purpose}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Solicitar desembolso</SheetTitle>
                <SheetDescription>
                    O pedido nasce sem data e sem valor liberado — esses entram quando o dinheiro sair de fato.
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                    <label className={rotulo}>Valor solicitado (R$)</label>
                    <input autoFocus type="number" min={0} step="0.01" value={valor} onChange={e => setValor(e.target.value)} className={`${campo} ${a.ring}`} />
                </div>
                <div className="space-y-1.5">
                    <label className={rotulo}>Finalidade</label>
                    <input value={purpose} onChange={e => setPurpose(e.target.value)} className={`${campo} ${a.ring}`} placeholder="Etapa de fundação, 3ª medição..." />
                </div>
                <div className="space-y-1.5">
                    <label className={rotulo}>Medição que justifica (§70)</label>
                    <input value={medicao} onChange={e => setMedicao(e.target.value)} className={`${campo} ${a.ring}`} placeholder="Medição 03/2026 · contrato 118 · NF 4521" />
                    <p className="text-xs text-slate-400">
                        Texto livre por ora: medição vive em três lugares no sistema (cronograma, diário, planilha), e amarrar a um deles agora prenderia o desembolso ao que ainda vai mudar.
                    </p>
                </div>
                <div className="space-y-1.5">
                    <label className={rotulo}>Observações</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={`w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none transition-all ${a.ring}`} />
                </div>
                {erro && <p className="text-sm text-red-600">{erro}</p>}
            </SheetPanel>
            <SheetFooter>
                <button onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Cancelar</button>
                <button onClick={() => void salvar()} disabled={salvando} className={`h-9 px-3.5 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 ${a.btn}`}>
                    {salvando ? 'Enviando...' : 'Solicitar'}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

// ── Workflow (§69) + medição técnica (§71) ───────────────────────────────────

const DesembolsoSheet: React.FC<{
    desembolso: CreditRoomDisbursement | null; onClose: () => void;
    room: CreditRoom; side: CreditRoomSide; accent: Accent;
    onSaved: (d: CreditRoomDisbursement) => void;
}> = ({ desembolso, onClose, room, side, accent, onSaved }) => {
    const a = ACCENTS[accent];
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const [pctFisico, setPctFisico] = React.useState('');
    const [analise, setAnalise] = React.useState('');
    const [aprovado, setAprovado] = React.useState('');
    const [bruto, setBruto] = React.useState('');
    const [dataLib, setDataLib] = React.useState('');

    React.useEffect(() => {
        if (!desembolso) return;
        setErro(null);
        setPctFisico(desembolso.physicalPct?.toString() ?? '');
        setAnalise(desembolso.analysisNotes ?? '');
        setAprovado(desembolso.approvedAmount?.toString() ?? '');
        setBruto(desembolso.grossAmount ? desembolso.grossAmount.toString() : '');
        setDataLib(desembolso.disbursedAt ?? '');
    }, [desembolso?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!desembolso) return null;

    const idx = DISBURSEMENT_FLUXO.indexOf(desembolso.status);
    const proximo = idx >= 0 && idx < DISBURSEMENT_FLUXO.length - 1 ? DISBURSEMENT_FLUXO[idx + 1] : null;

    const aplicar = async (patch: Parameters<typeof creditRoomService.moveDisbursement>[2]) => {
        setSalvando(true);
        setErro(null);
        try {
            onSaved(await creditRoomService.moveDisbursement(room, desembolso.id, patch, side));
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível atualizar o desembolso.'));
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!desembolso} onClose={onClose} size="lg">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Desembolso nº {desembolso.seq}</SheetTitle>
                <SheetDescription>
                    {DISBURSEMENT_STATUS_PT[desembolso.status]}
                    {desembolso.purpose ? ` · ${desembolso.purpose}` : ''}
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-6">
                {/* Trilha do §69 — onde está e o que falta */}
                <div className="flex flex-wrap items-center gap-1.5">
                    {DISBURSEMENT_FLUXO.map((s, i) => (
                        <React.Fragment key={s}>
                            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-300" />}
                            <span className={`text-xs ${
                                desembolso.status === s ? 'font-semibold text-gray-900'
                                    : i < idx ? 'text-gray-400' : 'text-gray-300'
                            }`}>
                                {DISBURSEMENT_STATUS_PT[s]}
                            </span>
                        </React.Fragment>
                    ))}
                    {desembolso.status === 'RECUSADO' && (
                        <span className="text-xs font-semibold text-red-600 ml-2">· Recusado</span>
                    )}
                </div>

                <dl className="grid grid-cols-2 gap-3">
                    <div><dt className={rotulo}>Solicitado</dt><dd className="text-sm font-medium text-gray-800">{formatMoney(desembolso.requestedAmount)}</dd></div>
                    <div><dt className={rotulo}>Medição (§70)</dt><dd className="text-sm text-gray-700">{desembolso.measurementRef || '—'}</dd></div>
                </dl>

                {/* §71 — a medição TÉCNICA é do credor. A policy é quem garante. */}
                <section className="space-y-3 rounded-[10px] border border-gray-100 bg-gray-50/60 p-4">
                    <h3 className="text-sm font-semibold text-gray-800">Medição técnica da instituição (§71)</h3>
                    {side === 'CREDOR' ? (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className={rotulo}>Avanço físico aferido (%)</label>
                                    <input type="number" min={0} max={100} step="0.1" value={pctFisico} onChange={e => setPctFisico(e.target.value)} className={`${campo} ${a.ring}`} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className={rotulo}>Valor aprovado (R$)</label>
                                    <input type="number" min={0} step="0.01" value={aprovado} onChange={e => setAprovado(e.target.value)} className={`${campo} ${a.ring}`} />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className={rotulo}>Parecer</label>
                                <textarea value={analise} onChange={e => setAnalise(e.target.value)} rows={3} className={`w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none transition-all ${a.ring}`} />
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => void aplicar({ physicalPct: pctFisico === '' ? null : Number(pctFisico), analysisNotes: analise, approvedAmount: aprovado === '' ? null : Number(aprovado) })}
                                    disabled={salvando}
                                    className={`h-9 px-3.5 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 ${a.btn}`}
                                >
                                    Registrar medição
                                </button>
                                <button
                                    onClick={() => void aplicar({ status: 'APROVADO', approvedAmount: aprovado === '' ? null : Number(aprovado), physicalPct: pctFisico === '' ? null : Number(pctFisico), analysisNotes: analise })}
                                    disabled={salvando}
                                    className="h-9 px-3.5 rounded-[6px] font-medium text-[13px] border border-green-200 text-green-700 hover:bg-green-50 transition-all"
                                >
                                    Aprovar
                                </button>
                                <button
                                    onClick={() => void aplicar({ status: 'RECUSADO', analysisNotes: analise })}
                                    disabled={salvando}
                                    className="h-9 px-3.5 rounded-[6px] font-medium text-[13px] border border-red-200 text-red-600 hover:bg-red-50 transition-all"
                                >
                                    Recusar
                                </button>
                            </div>
                        </>
                    ) : (
                        <dl className="grid grid-cols-2 gap-3">
                            <div><dt className={rotulo}>Avanço aferido</dt><dd className="text-sm text-gray-700">{pct(desembolso.physicalPct)}</dd></div>
                            <div><dt className={rotulo}>Valor aprovado</dt><dd className="text-sm text-gray-700">{desembolso.approvedAmount == null ? '—' : formatMoney(desembolso.approvedAmount)}</dd></div>
                            <div className="col-span-2"><dt className={rotulo}>Parecer</dt><dd className="text-sm text-gray-700 whitespace-pre-wrap">{desembolso.analysisNotes || '—'}</dd></div>
                        </dl>
                    )}
                    {desembolso.physicalPct != null && (
                        <p className="text-xs text-slate-400">
                            Medido pela engenharia do banco. Divergir do avanço físico do ÒPURA é informação, não erro — são aferições de partes diferentes.
                        </p>
                    )}
                </section>

                {/* Liberação — do tomador */}
                {side === 'TOMADOR' && (
                    <section className="space-y-3">
                        <h3 className="text-sm font-semibold text-gray-800">Liberação</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className={rotulo}>Valor liberado (R$)</label>
                                <input type="number" min={0} step="0.01" value={bruto} onChange={e => setBruto(e.target.value)} className={`${campo} ${a.ring}`} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={rotulo}>Data da liberação</label>
                                <input type="date" value={dataLib} onChange={e => setDataLib(e.target.value)} className={`${campo} ${a.ring}`} />
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {proximo && (
                                <button
                                    onClick={() => void aplicar({ status: proximo, grossAmount: bruto === '' ? undefined : Number(bruto), disbursedAt: dataLib || null })}
                                    disabled={salvando}
                                    className={`h-9 px-3.5 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 ${a.btn}`}
                                >
                                    Avançar para {DISBURSEMENT_STATUS_PT[proximo]}
                                </button>
                            )}
                            <button
                                onClick={() => void aplicar({ grossAmount: bruto === '' ? undefined : Number(bruto), disbursedAt: dataLib || null })}
                                disabled={salvando}
                                className="h-9 px-3.5 rounded-[6px] font-medium text-[13px] text-slate-600 border border-gray-200 hover:bg-slate-50 transition-all"
                            >
                                Salvar sem avançar
                            </button>
                        </div>
                    </section>
                )}

                {erro && <p className="text-sm text-red-600">{erro}</p>}
            </SheetPanel>

            <SheetFooter>
                <button onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Fechar</button>
            </SheetFooter>
        </Sheet>
    );
};

export default CreditRoomDisbursements;
