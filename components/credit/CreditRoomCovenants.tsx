import React from 'react';
import { AlertTriangle, Plus, ShieldCheck } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import ActionIconButton from '../ui/ActionIconButton';
import { errorMessage } from '../../hooks/useOrgContext';
import { creditRoomService } from '../../services/creditRoomService';
import {
    COVENANT_KIND_PT,
    COVENANT_APURACAO_PADRAO,
    type CovenantComparator,
    type CovenantKind,
    type CovenantPeriodicity,
    type DebtCovenant,
    type DebtCovenantInput,
} from '../../services/debtCovenantService';
import type { CreditRoom, CreditRoomVersion } from '../../types/creditRoom';
import type { CovenantSituacaoCalc } from '../../utils/covenantAvaliacao';

/**
 * Monitor de covenants da operação (PRD §75) com o alerta preventivo do §76.
 *
 * O que separa esta tela do monitor do módulo Dívida: aqui o DSCR é apurado
 * sobre o fluxo ELEGÍVEL da operação (R8), lendo o mesmo `indicators` que o
 * credor vê na aba Visão. Ver `creditRoomService.evaluateCovenant`.
 *
 * Compartilhada entre o lado interno e o portal (§24: prop `accent`).
 */

type Accent = 'indigo' | 'portal';

const ACCENTS: Record<Accent, { btn: string; ring: string }> = {
    indigo: { btn: 'bg-blue-600 text-white hover:bg-blue-700', ring: 'focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500' },
    portal: { btn: 'bg-[#E1553C] text-white hover:bg-[#C8452E]', ring: 'focus:ring-2 focus:ring-[#E1553C]/25 focus:border-[#E1553C]' },
};

// §8 — texto colorido, sem pílula. O amarelo do ATENÇÃO é o ponto do §76:
// existe para acender ANTES da quebra, não junto com ela.
const SITUACAO_COR: Record<CovenantSituacaoCalc, string> = {
    REGULAR: 'text-green-700',
    ATENCAO: 'text-amber-700',
    VIOLADO: 'text-red-600',
    NAO_APURADO: 'text-gray-500',
};
const SITUACAO_PT: Record<CovenantSituacaoCalc, string> = {
    REGULAR: 'Atendido', ATENCAO: 'Atenção', VIOLADO: 'Violado', NAO_APURADO: 'Não apurado',
};

type Avaliacao = { apurado: number | null; margemPct: number | null; situacao: CovenantSituacaoCalc; origem: 'SNAPSHOT' | 'RAZAO' };

const th = 'px-6 py-2 border-r border-gray-100 text-table-header font-semibold text-gray-500';
const td = 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';
const campo = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none transition-all';
const rotulo = 'text-xs font-semibold text-slate-500';

const numeroPt = (v: number | null | undefined, casas = 2) =>
    v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

interface Props {
    room: CreditRoom;
    versaoAtiva: CreditRoomVersion | null;
    /** Somente leitura para o credor: ele acompanha, não define a cláusula. */
    somenteLeitura?: boolean;
    accent?: Accent;
}

const CreditRoomCovenants: React.FC<Props> = ({ room, versaoAtiva, somenteLeitura = false, accent = 'indigo' }) => {
    const a = ACCENTS[accent];
    const confirm = useConfirm();

    const [itens, setItens] = React.useState<DebtCovenant[]>([]);
    const [avaliacoes, setAvaliacoes] = React.useState<Record<string, Avaliacao>>({});
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [formAberto, setFormAberto] = React.useState(false);
    const [editando, setEditando] = React.useState<DebtCovenant | undefined>();

    const refDate = versaoAtiva?.dataBase ?? new Date().toISOString().slice(0, 10);

    const carregar = React.useCallback(async () => {
        setCarregando(true);
        setErro(null);
        try {
            const lista = await creditRoomService.listCovenants(room);
            setItens(lista);
            // Apura tudo de uma vez. O DSCR sai do snapshot (sem ida ao
            // servidor); os demais vão à RPC, um por um — são poucos por
            // operação, e o `allSettled` impede que um erro derrube a tela.
            const rs = await Promise.allSettled(
                lista.map(c => creditRoomService.evaluateCovenant(c, versaoAtiva, refDate)),
            );
            const mapa: Record<string, Avaliacao> = {};
            rs.forEach((r, i) => {
                mapa[lista[i].id] = r.status === 'fulfilled'
                    ? r.value
                    : { apurado: null, margemPct: null, situacao: 'NAO_APURADO', origem: 'RAZAO' };
            });
            setAvaliacoes(mapa);
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível carregar os covenants.'));
        } finally {
            setCarregando(false);
        }
    }, [room, versaoAtiva, refDate]);

    React.useEffect(() => { void carregar(); }, [carregar]);

    const excluir = async (c: DebtCovenant) => {
        const ok = await confirm({
            title: 'Excluir covenant?',
            message: `"${c.name}" deixa de ser monitorado nesta operação. O histórico de apurações vai junto.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await creditRoomService.removeCovenant(c.id);
            setItens(prev => prev.filter(x => x.id !== c.id));
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível excluir.'));
        }
    };

    const emAlerta = itens.filter(c => {
        const s = avaliacoes[c.id]?.situacao;
        return s === 'ATENCAO' || s === 'VIOLADO';
    });

    return (
        <div className="space-y-3">
            {/* §76 — o aviso vem ANTES da tabela, porque é o que muda a decisão. */}
            {emAlerta.length > 0 && (
                <div className="flex items-start gap-2 text-sm rounded-[10px] px-4 py-3 border bg-amber-50 border-amber-200 text-amber-800">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                        {emAlerta.length === 1 ? '1 covenant' : `${emAlerta.length} covenants`} fora do conforto:{' '}
                        {emAlerta.map(c => c.name).join(', ')}. O alerta acende antes da quebra — a folga já está dentro
                        da margem de atenção.
                    </span>
                </div>
            )}

            {!somenteLeitura && (
                <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm">
                    <p className="text-sm font-normal text-gray-500 px-1">
                        {itens.length} covenant{itens.length === 1 ? '' : 's'}
                        {versaoAtiva && <span className="text-gray-400"> · apurado na posição de {versaoAtiva.dataBase.split('-').reverse().join('/')}</span>}
                    </p>
                    <button
                        onClick={() => { setEditando(undefined); setFormAberto(true); }}
                        className={`flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 shrink-0 ${a.btn}`}
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Novo covenant
                    </button>
                </div>
            )}

            {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[10px] px-4 py-3">{erro}</div>}

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                {carregando ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : itens.length === 0 ? (
                    <div className="text-center py-12">
                        <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum covenant nesta operação</h3>
                        <p className="text-sm text-gray-500">
                            {somenteLeitura
                                ? 'A empresa ainda não cadastrou cláusulas de acompanhamento.'
                                : 'Cadastre as cláusulas do contrato (DSCR mínimo, LTV máximo, vendas mínimas) para acompanhar a folga.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <th className={th}>Covenant</th>
                                    <th className={th}>Tipo</th>
                                    <th className={`${th} text-right`}>Limite</th>
                                    <th className={`${th} text-right`}>Atual</th>
                                    <th className={`${th} text-right`}>Folga</th>
                                    <th className={`${th} text-center`}>Situação</th>
                                    <th className={`${th} text-center`}>Apuração</th>
                                    {!somenteLeitura && <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {itens.map(c => {
                                    const av = avaliacoes[c.id];
                                    const sit = av?.situacao ?? 'NAO_APURADO';
                                    return (
                                        <tr key={c.id} className="hover:bg-blue-50/50 transition-colors">
                                            <td className={`${td} text-gray-700`}>
                                                <span className="block truncate" title={c.name}>{c.name}</span>
                                                {c.formula && <span className="block truncate text-xs text-gray-400" title={c.formula}>{c.formula}</span>}
                                            </td>
                                            <td className={`${td} text-gray-600`}>
                                                <span className="block truncate">{COVENANT_KIND_PT[c.kind]}</span>
                                            </td>
                                            <td className={`${td} text-gray-800 text-right`}>
                                                {c.comparator === 'MAX' ? '≤ ' : '≥ '}{numeroPt(c.threshold)}{c.unit ? ` ${c.unit}` : ''}
                                            </td>
                                            <td className={`${td} text-right font-medium text-gray-800`}>{numeroPt(av?.apurado)}</td>
                                            <td className={`${td} text-right ${(av?.margemPct ?? 0) < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                                {av?.margemPct == null ? '—' : `${numeroPt(av.margemPct, 1)}%`}
                                            </td>
                                            <td className={`${td} text-center`}>
                                                <span className={`text-sm font-normal ${SITUACAO_COR[sit]}`}>{SITUACAO_PT[sit]}</span>
                                            </td>
                                            <td className={`${td} text-center text-gray-500`}>
                                                {/* De onde saiu o número — a diferença entre a operação e a
                                                    empresa é justamente o que o §96 quer explicável. */}
                                                <span className="text-xs">{av?.origem === 'SNAPSHOT' ? 'fluxo elegível da operação' : 'razão da empresa'}</span>
                                            </td>
                                            {!somenteLeitura && (
                                                <td className="px-6 py-2.5 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <ActionIconButton kind="edit" onClick={() => { setEditando(c); setFormAberto(true); }} />
                                                        <ActionIconButton kind="delete" onClick={() => void excluir(c)} />
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <CovenantSheet
                open={formAberto}
                onClose={() => setFormAberto(false)}
                room={room}
                covenant={editando}
                accent={accent}
                onSaved={c => {
                    setItens(prev => prev.some(x => x.id === c.id) ? prev.map(x => (x.id === c.id ? c : x)) : [...prev, c]);
                    void carregar();
                }}
            />
        </div>
    );
};

// ── Cadastro ─────────────────────────────────────────────────────────────────

const KINDS_UTEIS: CovenantKind[] = [
    'DSCR', 'LIMITE_ENDIVIDAMENTO', 'DIVIDA_BRUTA_EBITDA', 'DIVIDA_LIQUIDA_EBITDA',
    'PL_MINIMO', 'SALDO_BANCARIO_MINIMO', 'INDICE_LIQUIDEZ', 'VALIDADE_GARANTIAS', 'OUTRO',
];

const CovenantSheet: React.FC<{
    open: boolean;
    onClose: () => void;
    room: CreditRoom;
    covenant?: DebtCovenant;
    accent: Accent;
    onSaved: (c: DebtCovenant) => void;
}> = ({ open, onClose, room, covenant, accent, onSaved }) => {
    const a = ACCENTS[accent];
    const [form, setForm] = React.useState<DebtCovenantInput>({
        name: '', kind: 'DSCR', apuracao: 'AUTOMATICA', periodicity: 'TRIMESTRAL',
        comparator: 'MIN', threshold: 1.3, warningMarginPct: 10, isActive: true,
    });
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!open) return;
        setErro(null);
        setForm(covenant ? { ...covenant } : {
            name: 'DSCR mínimo', kind: 'DSCR', apuracao: 'AUTOMATICA', periodicity: 'TRIMESTRAL',
            comparator: 'MIN', threshold: 1.3, warningMarginPct: 10, isActive: true,
        });
    }, [open, covenant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const set = <K extends keyof DebtCovenantInput>(k: K, v: DebtCovenantInput[K]) => setForm(p => ({ ...p, [k]: v }));

    const salvar = async () => {
        if (!form.name.trim()) { setErro('Dê um nome à cláusula.'); return; }
        setSalvando(true);
        setErro(null);
        try {
            onSaved(await creditRoomService.saveCovenant(room, {
                ...form,
                name: form.name.trim(),
                // O tipo decide como se apura; o padrão do módulo Dívida vale
                // aqui também, exceto o DSCR, que na operação sai do snapshot.
                apuracao: COVENANT_APURACAO_PADRAO[form.kind],
            }));
            onClose();
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível salvar o covenant.'));
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="md" dirty={!!form.name && !covenant}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{covenant ? 'Editar covenant' : 'Novo covenant'}</SheetTitle>
                <SheetDescription>
                    A cláusula como o contrato a escreve. O DSCR desta operação é apurado sobre o fluxo elegível que você marcou no cadastro dela — não sobre o EBITDA da empresa.
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                    <label className={rotulo}>Nome</label>
                    <input autoFocus value={form.name} onChange={e => set('name', e.target.value)} className={`${campo} ${a.ring}`} placeholder="DSCR mínimo" />
                </div>
                <div className="space-y-1.5">
                    <label className={rotulo}>Tipo</label>
                    <select value={form.kind} onChange={e => set('kind', e.target.value as CovenantKind)} className={`${campo} ${a.ring}`}>
                        {KINDS_UTEIS.map(k => <option key={k} value={k}>{COVENANT_KIND_PT[k]}</option>)}
                    </select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                        <label className={rotulo}>Sentido</label>
                        <select value={form.comparator} onChange={e => set('comparator', e.target.value as CovenantComparator)} className={`${campo} ${a.ring}`}>
                            <option value="MIN">Piso (≥)</option>
                            <option value="MAX">Teto (≤)</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className={rotulo}>Limite</label>
                        <input type="number" step="0.0001" value={form.threshold} onChange={e => set('threshold', Number(e.target.value))} className={`${campo} ${a.ring}`} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={rotulo}>Atenção a (%)</label>
                        <input type="number" min={0} value={form.warningMarginPct} onChange={e => set('warningMarginPct', Number(e.target.value))} className={`${campo} ${a.ring}`} />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <label className={rotulo}>Periodicidade</label>
                        <select value={form.periodicity} onChange={e => set('periodicity', e.target.value as CovenantPeriodicity)} className={`${campo} ${a.ring}`}>
                            {(['MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'] as CovenantPeriodicity[]).map(p => (
                                <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className={rotulo}>Unidade</label>
                        <input value={form.unit ?? ''} onChange={e => set('unit', e.target.value)} className={`${campo} ${a.ring}`} placeholder="×, %, R$" />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className={rotulo}>Fórmula do contrato (como está escrita)</label>
                    <input value={form.formula ?? ''} onChange={e => set('formula', e.target.value)} className={`${campo} ${a.ring}`} placeholder="EBITDA / Serviço da dívida ≥ 1,30" />
                    <p className="text-xs text-slate-400">
                        Guardar o texto original ajuda a perceber quando a definição do banco diverge da que o sistema calcula — e elas divergem com frequência.
                    </p>
                </div>
                {erro && <p className="text-sm text-red-600">{erro}</p>}
            </SheetPanel>
            <SheetFooter>
                <button onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Cancelar</button>
                <button onClick={() => void salvar()} disabled={salvando} className={`h-9 px-3.5 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 ${a.btn}`}>
                    {salvando ? 'Salvando...' : covenant ? 'Salvar alterações' : 'Criar covenant'}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default CreditRoomCovenants;
