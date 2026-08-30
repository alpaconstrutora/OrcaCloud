import React from 'react';
import { AlertTriangle, CheckCircle2, Gauge, Loader2, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { KpiCard } from '../ui/KpiCard';
import { formatMoney, formatDateBR } from '../ui/Format';
import { useConfirm } from '../ui/confirm';
import { usePersistedState } from '../ui/TableUtils';
import ActionIconButton from '../ui/ActionIconButton';
import { useOrgContext, useOrgWriteTarget, errorMessage } from '../../hooks/useOrgContext';
import {
    COVENANT_APURACAO_PADRAO,
    COVENANT_KIND_PT,
    COVENANT_SITUACAO_PT,
    debtCovenantService,
    type CovenantEvaluation,
    type CovenantKind,
    type CovenantSituacao,
    type DebtCovenant,
    type DebtCovenantInput,
    type DebtCovenantMeasurement,
} from '../../services/debtCovenantService';
import { debtService } from '../../services/debtService';
import type { DebtContract } from '../../types/debt';

const SITUACAO_COR: Record<CovenantSituacao, string> = {
    REGULAR: 'text-green-700',
    ATENCAO: 'text-amber-700',
    VIOLADO: 'text-red-600',
    NAO_APURADO: 'text-gray-500',
};

const Label = ({ children }: { children: React.ReactNode }) => (
    <label className="text-xs font-semibold text-slate-500">{children}</label>
);
const campo = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';
const th = 'px-6 py-2 border-r border-gray-100 text-table-header font-semibold text-gray-500';
const td = 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';

const hoje = () => new Date().toISOString().slice(0, 10);

const VAZIO: DebtCovenantInput = {
    name: '',
    kind: 'DIVIDA_BRUTA_EBITDA',
    apuracao: 'AUTOMATICA',
    periodicity: 'TRIMESTRAL',
    comparator: 'MAX',
    threshold: 3,
    warningMarginPct: 10,
    isActive: true,
};

export default function DebtCovenants() {
    const { orgId } = useOrgContext();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const confirm = useConfirm();

    const [covenants, setCovenants] = React.useState<DebtCovenant[]>([]);
    const [ultimas, setUltimas] = React.useState<Map<string, DebtCovenantMeasurement>>(new Map());
    const [contratos, setContratos] = React.useState<DebtContract[]>([]);
    const [carregando, setCarregando] = React.useState(true);
    const [apurando, setApurando] = React.useState<string | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);
    const [aviso, setAviso] = React.useState<string | null>(null);

    const [aberto, setAberto] = React.useState(false);
    const [edicao, setEdicao] = React.useState<DebtCovenantInput>(VAZIO);
    const [salvando, setSalvando] = React.useState(false);

    // O caixa não é derivável do razão (medido em 30/08: 1 de 2.300 lançamentos
    // tem conta). Fica como entrada do usuário, persistida entre sessões.
    const [caixa, setCaixa] = usePersistedState<number>('dividasCovenants:caixa', 0);
    const [refDate, setRefDate] = usePersistedState<string>('dividasCovenants:refDate', hoje());

    const carregar = React.useCallback(async () => {
        setCarregando(true);
        setErro(null);
        try {
            const [c, m, ct] = await Promise.all([
                debtCovenantService.list(orgId),
                debtCovenantService.latestByOrg(orgId),
                debtService.listContracts(orgId),
            ]);
            setCovenants(c);
            setUltimas(m);
            setContratos(ct);
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível carregar os covenants.'));
        } finally {
            setCarregando(false);
        }
    }, [orgId]);

    React.useEffect(() => { void carregar(); }, [carregar]);

    const kpis = React.useMemo(() => {
        const ativos = covenants.filter(c => c.isActive);
        const sit = (c: DebtCovenant) => ultimas.get(c.id)?.situacao ?? 'NAO_APURADO';
        return {
            total: ativos.length,
            violados: ativos.filter(c => sit(c) === 'VIOLADO').length,
            atencao: ativos.filter(c => sit(c) === 'ATENCAO').length,
            naoApurados: ativos.filter(c => sit(c) === 'NAO_APURADO').length,
        };
    }, [covenants, ultimas]);

    /**
     * Apura e GRAVA. A RPC apura sem gravar; a gravação é este clique — o
     * número passa pelos olhos de alguém antes de virar histórico.
     */
    const apurar = async (c: DebtCovenant) => {
        setApurando(c.id);
        setErro(null);
        setAviso(null);
        try {
            const r: CovenantEvaluation = await debtCovenantService.evaluate(
                c.id, refDate, c.apuracao === 'SEMIAUTOMATICA' ? caixa : null,
            );
            if (r.situacao === 'NAO_APURADO') {
                setAviso(
                    c.apuracao === 'SEMIAUTOMATICA' && !caixa
                        ? `“${c.name}” precisa do caixa do período para ser apurado — informe acima.`
                        : `“${c.name}” não pôde ser apurado: faltam insumos no período (EBITDA ou serviço da dívida em zero).`,
                );
            }
            const salvo = await debtCovenantService.saveMeasurement(c.organizationId, {
                covenantId: c.id,
                referenceDate: refDate,
                apurado: r.apurado,
                situacao: r.situacao,
                margemPct: r.margemPct,
                inputs: r.inputs,
            });
            // §22 — atualiza o mapa local, sem recarregar a tela inteira.
            setUltimas(prev => new Map(prev).set(c.id, salvo));
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível apurar o covenant.'));
        } finally {
            setApurando(null);
        }
    };

    const apurarTodos = async () => {
        const automaticos = covenants.filter(c => c.isActive && c.apuracao !== 'MANUAL');
        for (const c of automaticos) await apurar(c);
        setAviso(`${automaticos.length} covenant(s) apurado(s) em ${formatDateBR(refDate)}.`);
    };

    const salvar = async () => {
        if (!edicao.name.trim()) { setErro('Dê um nome ao covenant.'); return; }
        setSalvando(true);
        setErro(null);
        try {
            if (edicao.id) {
                const atualizado = await debtCovenantService.save(
                    covenants.find(c => c.id === edicao.id)!.organizationId, edicao);
                setCovenants(prev => prev.map(c => (c.id === atualizado.id ? atualizado : c)));
            } else {
                // Covenant pertence a UMA organização por natureza (é cláusula de
                // contrato) — 'single', sem a opção "Todas" (REGRA #5, item 4).
                const alvo = await resolveWriteOrg('single');
                if (!alvo || alvo.kind !== 'org') return;
                const criado = await debtCovenantService.save(alvo.orgId, edicao);
                setCovenants(prev => [criado, ...prev]);
            }
            setAberto(false);
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível salvar o covenant.'));
        } finally {
            setSalvando(false);
        }
    };

    const excluir = async (c: DebtCovenant) => {
        const ok = await confirm({
            title: `Excluir “${c.name}”?`,
            message: 'O histórico de apurações também será apagado. Essa ação não pode ser desfeita.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await debtCovenantService.remove(c.id);
            setCovenants(prev => prev.filter(x => x.id !== c.id));
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível excluir o covenant.'));
        }
    };

    const precisaCaixa = covenants.some(c => c.isActive && c.apuracao === 'SEMIAUTOMATICA');

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                <KpiCard label="Covenants ativos" value={kpis.total} icon={<Gauge className="w-5 h-5" />} color="blue" />
                <KpiCard label="Violados" value={kpis.violados} icon={<ShieldAlert className="w-5 h-5" />}
                         color={kpis.violados > 0 ? 'red' : 'gray'} pulse={kpis.violados > 0} />
                <KpiCard label="Em atenção" value={kpis.atencao} icon={<AlertTriangle className="w-5 h-5" />}
                         color={kpis.atencao > 0 ? 'amber' : 'gray'} />
                <KpiCard label="Não apurados" value={kpis.naoApurados} sub="Sem medição no período"
                         icon={<CheckCircle2 className="w-5 h-5" />} color="violet" />
            </div>

            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center gap-2">
                    <input type="date" value={refDate} onChange={e => setRefDate(e.target.value)}
                           className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium" />
                    {precisaCaixa && (
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-slate-500">Caixa e equivalentes</span>
                            <input type="number" step="0.01" value={caixa}
                                   onChange={e => setCaixa(Number(e.target.value) || 0)}
                                   className="h-9 w-40 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium" />
                        </div>
                    )}
                    <button onClick={() => void apurarTodos()}
                            className="h-9 px-3.5 text-slate-600 border border-gray-200 bg-white rounded-[6px] hover:bg-slate-50 font-medium text-[13px] transition-all active:scale-95">
                        Apurar automáticos
                    </button>
                    <button onClick={() => void carregar()}
                            className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
                <button onClick={() => { setEdicao(VAZIO); setAberto(true); }}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0">
                    <Plus className="w-[15px] h-[15px]" />
                    Novo covenant
                </button>
            </div>

            {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[10px] px-4 py-3">{erro}</div>}
            {aviso && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-[10px] px-4 py-3">{aviso}</div>}

            {precisaCaixa && !caixa && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-[10px] px-4 py-3">
                    <strong>Dívida líquida precisa do caixa, e o sistema não tem de onde tirar.</strong> O razão
                    tem 1 lançamento com conta de pagamento em 2.300, e nenhuma conta tem saldo de abertura —
                    então o caixa do período é informado aqui, não calculado. Sem ele, esses covenants ficam
                    “não apurado” em vez de receber um número inventado.
                </div>
            )}

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                {carregando ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : covenants.length === 0 ? (
                    <div className="text-center py-12">
                        <Gauge className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum covenant cadastrado</h3>
                        <p className="text-sm text-gray-500">
                            Cadastre as cláusulas dos contratos para acompanhar margem de segurança e violação.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <th className={`${th} text-left`}>Covenant</th>
                                    <th className={`${th} text-left`}>Contrato</th>
                                    <th className={`${th} text-left`}>Apuração</th>
                                    <th className={`${th} text-right`}>Meta</th>
                                    <th className={`${th} text-right`}>Apurado</th>
                                    <th className={`${th} text-right`}>Margem</th>
                                    <th className={`${th} text-center`}>Situação</th>
                                    <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {covenants.map(c => {
                                    const m = ultimas.get(c.id);
                                    const sit = m?.situacao ?? 'NAO_APURADO';
                                    const contrato = contratos.find(x => x.id === c.debtContractId);
                                    return (
                                        <tr key={c.id} className="hover:bg-blue-50/50 transition-colors">
                                            <td className={`${td} text-gray-700`}>
                                                <span className="block truncate" title={c.name}>{c.name}</span>
                                                <span className="block truncate text-xs text-gray-400" title={COVENANT_KIND_PT[c.kind]}>
                                                    {COVENANT_KIND_PT[c.kind]}
                                                </span>
                                            </td>
                                            <td className={`${td} text-gray-600`}>
                                                <span className="block truncate">
                                                    {contrato ? (contrato.contractNumber ?? contrato.institutionName ?? '—') : 'Grupo'}
                                                </span>
                                            </td>
                                            <td className={`${td} text-gray-600`}>
                                                {c.apuracao === 'AUTOMATICA' ? 'Automática'
                                                 : c.apuracao === 'SEMIAUTOMATICA' ? 'Precisa do caixa'
                                                 : 'Manual'}
                                            </td>
                                            <td className={`${td} text-right text-gray-600`}>
                                                {c.comparator === 'MAX' ? '≤ ' : '≥ '}
                                                {c.threshold.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
                                                {c.unit ? ` ${c.unit}` : ''}
                                            </td>
                                            <td className={`${td} text-right font-medium text-gray-800`}>
                                                {m?.apurado == null ? '—' : m.apurado.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
                                            </td>
                                            <td className={`${td} text-right ${sit === 'VIOLADO' ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                                                {m?.margemPct == null ? '—' : `${m.margemPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
                                            </td>
                                            <td className={`${td} text-center`}>
                                                <span className={`text-sm font-normal ${SITUACAO_COR[sit]}`}>
                                                    {COVENANT_SITUACAO_PT[sit]}
                                                </span>
                                                {m && (
                                                    <span className="block text-xs text-gray-400">{formatDateBR(m.referenceDate)}</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {c.apuracao !== 'MANUAL' && (
                                                        <button
                                                            onClick={() => void apurar(c)}
                                                            disabled={apurando === c.id}
                                                            className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-40"
                                                        >
                                                            {apurando === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apurar'}
                                                        </button>
                                                    )}
                                                    <ActionIconButton kind="edit" onClick={() => { setEdicao({ ...c }); setAberto(true); }} />
                                                    <ActionIconButton kind="delete" onClick={() => void excluir(c)} />
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {covenants.length > 0 && (
                    <div className="px-5 py-3 border-t border-gray-100 bg-amber-50/60">
                        <p className="text-xs text-amber-800">
                            O sistema calcula pelo tipo do covenant; o campo <strong>Fórmula</strong> guarda a
                            cláusula como o contrato a escreve. Confira os dois: qual EBITDA, 12 meses móveis ou
                            do exercício — bancos divergem, e é aí que a apuração automática erra.
                        </p>
                    </div>
                )}
            </div>

            <Sheet open={aberto} onClose={() => setAberto(false)} size="xl">
                <SheetHeader onClose={() => setAberto(false)}>
                    <SheetTitle>{edicao.id ? 'Editar covenant' : 'Novo covenant'}</SheetTitle>
                    <SheetDescription>
                        O comparador define o que é violação: teto (≤) ou piso (≥).
                    </SheetDescription>
                </SheetHeader>

                <SheetPanel className="px-6 py-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1 md:col-span-2">
                            <Label>Nome</Label>
                            <input className={campo} value={edicao.name}
                                   onChange={e => setEdicao({ ...edicao, name: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <Label>Tipo</Label>
                            <select className={campo} value={edicao.kind}
                                    onChange={e => {
                                        const kind = e.target.value as CovenantKind;
                                        // A apuração acompanha o tipo: só o que o
                                        // sistema sabe calcular nasce automático.
                                        setEdicao({ ...edicao, kind, apuracao: COVENANT_APURACAO_PADRAO[kind] });
                                    }}>
                                {Object.entries(COVENANT_KIND_PT).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label>Contrato (vazio = covenant do grupo)</Label>
                            <select className={campo} value={edicao.debtContractId ?? ''}
                                    onChange={e => setEdicao({ ...edicao, debtContractId: e.target.value || undefined })}>
                                <option value="">Todo o grupo</option>
                                {contratos.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.contractNumber ?? c.institutionName ?? c.id.slice(0, 8)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label>Comparador</Label>
                            <select className={campo} value={edicao.comparator}
                                    onChange={e => setEdicao({ ...edicao, comparator: e.target.value as 'MAX' | 'MIN' })}>
                                <option value="MAX">Teto — não pode passar de (≤)</option>
                                <option value="MIN">Piso — não pode ficar abaixo de (≥)</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label>Meta</Label>
                            <input type="number" step="0.0001" className={campo} value={edicao.threshold}
                                   onChange={e => setEdicao({ ...edicao, threshold: Number(e.target.value) || 0 })} />
                        </div>
                        <div className="space-y-1">
                            <Label>Faixa de atenção (%)</Label>
                            <input type="number" step="0.01" className={campo} value={edicao.warningMarginPct}
                                   onChange={e => setEdicao({ ...edicao, warningMarginPct: Number(e.target.value) || 0 })} />
                            <p className="text-xs text-gray-400">Acende amarelo a esta distância da meta.</p>
                        </div>
                        <div className="space-y-1">
                            <Label>Periodicidade</Label>
                            <select className={campo} value={edicao.periodicity}
                                    onChange={e => setEdicao({ ...edicao, periodicity: e.target.value as DebtCovenantInput['periodicity'] })}>
                                <option value="MENSAL">Mensal</option>
                                <option value="TRIMESTRAL">Trimestral</option>
                                <option value="SEMESTRAL">Semestral</option>
                                <option value="ANUAL">Anual</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label>Responsável</Label>
                            <input className={campo} value={edicao.responsible ?? ''}
                                   onChange={e => setEdicao({ ...edicao, responsible: e.target.value })} />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                            <Label>Fórmula, como o contrato escreve</Label>
                            <input className={campo} value={edicao.formula ?? ''}
                                   onChange={e => setEdicao({ ...edicao, formula: e.target.value })}
                                   placeholder="Ex.: Dívida Líquida / EBITDA dos últimos 12 meses ≤ 3,0x" />
                        </div>
                    </div>
                </SheetPanel>

                <SheetFooter>
                    <button onClick={() => setAberto(false)} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] transition-all">
                        Cancelar
                    </button>
                    <button onClick={salvar} disabled={salvando}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40">
                        {salvando ? 'Salvando…' : edicao.id ? 'Salvar alterações' : 'Criar covenant'}
                    </button>
                </SheetFooter>
            </Sheet>

            {orgTargetModal}
        </div>
    );
}
