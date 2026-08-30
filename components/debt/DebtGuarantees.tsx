import React from 'react';
import { AlertTriangle, Plus, Shield } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { formatMoney, formatDateBR } from '../ui/Format';
import { useConfirm } from '../ui/confirm';
import ActionIconButton from '../ui/ActionIconButton';
import { contractGuaranteeService } from '../../services/contractGuaranteeService';
import { assetService } from '../../services/assetService';
import {
    DEBT_GUARANTEE_KINDS,
    GUARANTEE_KIND_PT,
    type ContractGuarantee,
} from '../../types/contracts';
import type { DebtContract } from '../../types/debt';

interface Props {
    contract: DebtContract;
    /** Saldo devedor atual, para o LTV. Sem ele o LTV não é calculável. */
    saldoDevedor: number;
}

const STATUS_COR: Record<string, string> = {
    VIGENTE: 'text-green-700', LIBERADA: 'text-gray-500', VENCIDA: 'text-red-600',
    CANCELADA: 'text-gray-500', SUBSTITUIDA: 'text-gray-500',
    EM_ANALISE: 'text-blue-700', PENDENTE_DOCUMENTOS: 'text-amber-700',
    PENDENTE_REGISTRO: 'text-amber-700', INSUFICIENTE: 'text-red-600',
};

const Label = ({ children }: { children: React.ReactNode }) => (
    <label className="text-xs font-semibold text-slate-500">{children}</label>
);
const campo = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';
const th = 'px-6 py-2 border-r border-gray-100 text-table-header font-semibold text-gray-500';
const td = 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';

const hoje = () => new Date().toISOString().slice(0, 10);

export default function DebtGuarantees({ contract, saldoDevedor }: Props) {
    const confirm = useConfirm();
    const [garantias, setGarantias] = React.useState<ContractGuarantee[]>([]);
    const [bens, setBens] = React.useState<{ id: string; name: string; code: string }[]>([]);
    const [conflitos, setConflitos] = React.useState<{ assetId: string; assetName: string; nOperacoes: number }[]>([]);
    const [carregando, setCarregando] = React.useState(true);
    const [aberto, setAberto] = React.useState(false);
    const [edicao, setEdicao] = React.useState<Partial<ContractGuarantee>>({});
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    const carregar = React.useCallback(async () => {
        setCarregando(true);
        setErro(null);
        try {
            const [g, c] = await Promise.all([
                contractGuaranteeService.listByDebt(contract.id),
                contractGuaranteeService.listAssetConflicts(contract.organizationId),
            ]);
            setGarantias(g);
            setConflitos(c);
            try {
                const lista = await assetService.list(contract.organizationId);
                setBens((lista as unknown as { id: string; name: string; code: string }[]).map(
                    a => ({ id: a.id, name: a.name, code: a.code })));
            } catch {
                // Gestão de Bens é opcional para cadastrar garantia: sem a lista,
                // o campo de bem some, mas o resto do formulário funciona.
                setBens([]);
            }
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível carregar as garantias.');
        } finally {
            setCarregando(false);
        }
    }, [contract.id, contract.organizationId]);

    React.useEffect(() => { void carregar(); }, [carregar]);

    const abrirNova = () => {
        setEdicao({
            kind: 'IMOVEL', status: 'VIGENTE', scope: 'DIVIDA',
            valuation_date: hoje(),
        });
        setAberto(true);
    };

    const salvar = async () => {
        if (!edicao.kind) { setErro('Escolha a modalidade da garantia.'); return; }
        setSalvando(true);
        setErro(null);
        try {
            // LTV é gravado, não calculado na leitura: o saldo devedor muda a
            // cada parcela, e recalcular a garantia inteira por isso não paga.
            const aceito = Number(edicao.accepted_value ?? 0);
            const ltv = aceito > 0 ? Number(((saldoDevedor / aceito) * 100).toFixed(2)) : undefined;

            await contractGuaranteeService.saveForDebt({
                ...edicao,
                id: edicao.id,
                organization_id: contract.organizationId,
                debt_contract_id: contract.id,
                ltv,
            } as Parameters<typeof contractGuaranteeService.saveForDebt>[0]);
            setAberto(false);
            await carregar();
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível salvar a garantia.');
        } finally {
            setSalvando(false);
        }
    };

    const excluir = async (g: ContractGuarantee) => {
        const ok = await confirm({
            title: 'Excluir garantia?',
            message: 'Essa ação não pode ser desfeita.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        await contractGuaranteeService.remove(g.id);
        // §22 — atualiza o array local em vez de recarregar tudo.
        setGarantias(prev => prev.filter(x => x.id !== g.id));
    };

    const conflitoDoBem = (assetId?: string) =>
        assetId ? conflitos.find(c => c.assetId === assetId) : undefined;

    const totalAceito = garantias
        .filter(g => !g.released_at)
        .reduce((a, g) => a + Number(g.accepted_value ?? 0), 0);
    const ltvCarteira = totalAceito > 0 ? (saldoDevedor / totalAceito) * 100 : null;

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center gap-4 px-1 text-sm">
                    <span className="font-normal text-gray-500">
                        Saldo devedor <span className="font-medium text-gray-800">{formatMoney(saldoDevedor)}</span>
                    </span>
                    <span className="font-normal text-gray-500">
                        Garantia aceita <span className="font-medium text-gray-800">{formatMoney(totalAceito)}</span>
                    </span>
                    <span className="font-normal text-gray-500">
                        LTV da operação{' '}
                        <span className={`font-medium ${ltvCarteira !== null && ltvCarteira > 100 ? 'text-red-600' : 'text-gray-800'}`}>
                            {ltvCarteira === null
                                ? '—'
                                : `${ltvCarteira.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
                        </span>
                    </span>
                </div>
                <button
                    onClick={abrirNova}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                >
                    <Plus className="w-[15px] h-[15px]" />
                    Nova garantia
                </button>
            </div>

            {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[10px] px-4 py-3">{erro}</div>}

            {ltvCarteira !== null && ltvCarteira > 100 && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[10px] px-4 py-3">
                    <AlertTriangle className="w-4 h-4 inline mr-1.5" />
                    O saldo devedor supera o valor aceito em garantia (LTV acima de 100%). A operação está
                    descoberta.
                </div>
            )}

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                {carregando ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : garantias.length === 0 ? (
                    <div className="text-center py-12">
                        <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma garantia cadastrada</h3>
                        <p className="text-sm text-gray-500">
                            Sem garantia registrada não há LTV, nem alerta de bem comprometido em duas operações.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <th className={`${th} text-left`}>Modalidade</th>
                                    <th className={`${th} text-left`}>Bem / proprietário</th>
                                    <th className={`${th} text-right`}>Valor de mercado</th>
                                    <th className={`${th} text-right`}>Aceito pelo banco</th>
                                    <th className={`${th} text-right`}>LTV</th>
                                    <th className={`${th} text-center`}>Avaliação até</th>
                                    <th className={`${th} text-center`}>Situação</th>
                                    <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {garantias.map(g => {
                                    const conflito = conflitoDoBem(g.asset_id);
                                    const avaliacaoVencida = g.valuation_valid_until
                                        && g.valuation_valid_until < hoje() && !g.released_at;
                                    return (
                                        <tr key={g.id} className="hover:bg-blue-50/50 transition-colors">
                                            <td className={`${td} text-gray-700`}>
                                                <span className="block truncate" title={GUARANTEE_KIND_PT[g.kind] ?? g.kind}>
                                                    {GUARANTEE_KIND_PT[g.kind] ?? g.kind}
                                                </span>
                                            </td>
                                            <td className={`${td} text-gray-600`}>
                                                <span className="block truncate" title={g.owner_party ?? ''}>
                                                    {bens.find(b => b.id === g.asset_id)?.name ?? g.owner_party ?? '—'}
                                                </span>
                                                {conflito && (
                                                    <span className="block text-xs text-amber-700">
                                                        <AlertTriangle className="w-3 h-3 inline mr-1" />
                                                        também em {conflito.nOperacoes - 1} outra(s) operação(ões)
                                                    </span>
                                                )}
                                            </td>
                                            <td className={`${td} text-right text-gray-600`}>{formatMoney(Number(g.market_value ?? 0))}</td>
                                            <td className={`${td} text-right font-medium text-gray-800`}>{formatMoney(Number(g.accepted_value ?? 0))}</td>
                                            <td className={`${td} text-right ${Number(g.ltv ?? 0) > 100 ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                                                {g.ltv == null ? '—' : `${Number(g.ltv).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
                                            </td>
                                            <td className={`${td} text-center ${avaliacaoVencida ? 'text-red-600' : 'text-gray-600'}`}>
                                                {g.valuation_valid_until ? formatDateBR(g.valuation_valid_until) : '—'}
                                            </td>
                                            <td className={`${td} text-center`}>
                                                <span className={`text-sm font-normal ${STATUS_COR[g.status] ?? 'text-gray-600'}`}>
                                                    {g.released_at ? 'Liberada' : (g.status ?? '—')}
                                                </span>
                                            </td>
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <ActionIconButton kind="edit" onClick={() => { setEdicao(g); setAberto(true); }} />
                                                    <ActionIconButton kind="delete" onClick={() => void excluir(g)} />
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <Sheet open={aberto} onClose={() => setAberto(false)} size="xl">
                <SheetHeader onClose={() => setAberto(false)}>
                    <SheetTitle>{edicao.id ? 'Editar garantia' : 'Nova garantia'}</SheetTitle>
                    <SheetDescription>
                        O LTV é calculado sobre o valor aceito pelo banco, não sobre o de mercado.
                    </SheetDescription>
                </SheetHeader>

                <SheetPanel className="px-6 py-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label>Modalidade</Label>
                            <select className={campo} value={edicao.kind ?? 'IMOVEL'}
                                    onChange={e => setEdicao({ ...edicao, kind: e.target.value as ContractGuarantee['kind'] })}>
                                {DEBT_GUARANTEE_KINDS.map(k => (
                                    <option key={k} value={k}>{GUARANTEE_KIND_PT[k] ?? k}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label>Bem do patrimônio (opcional)</Label>
                            <select className={campo} value={edicao.asset_id ?? ''}
                                    onChange={e => setEdicao({ ...edicao, asset_id: e.target.value || undefined })}>
                                <option value="">Não vinculado</option>
                                {bens.map(b => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
                            </select>
                            <p className="text-xs text-gray-400">
                                Vincular é o que permite o alerta de bem dado em duas operações.
                            </p>
                        </div>
                        <div className="space-y-1">
                            <Label>Proprietário do bem</Label>
                            <input className={campo} value={edicao.owner_party ?? ''}
                                   onChange={e => setEdicao({ ...edicao, owner_party: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <Label>Instituição garantidora</Label>
                            <input className={campo} value={edicao.insurer ?? ''}
                                   onChange={e => setEdicao({ ...edicao, insurer: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <Label>Valor de mercado</Label>
                            <input type="number" step="0.01" className={campo} value={edicao.market_value ?? ''}
                                   onChange={e => setEdicao({ ...edicao, market_value: Number(e.target.value) || undefined })} />
                        </div>
                        <div className="space-y-1">
                            <Label>Valor aceito pelo banco</Label>
                            <input type="number" step="0.01" className={campo} value={edicao.accepted_value ?? ''}
                                   onChange={e => setEdicao({ ...edicao, accepted_value: Number(e.target.value) || undefined })} />
                        </div>
                        <div className="space-y-1">
                            <Label>Percentual comprometido (%)</Label>
                            <input type="number" step="0.01" className={campo} value={edicao.committed_pct ?? ''}
                                   onChange={e => setEdicao({ ...edicao, committed_pct: Number(e.target.value) || undefined })} />
                        </div>
                        <div className="space-y-1">
                            <Label>Situação</Label>
                            <select className={campo} value={edicao.status ?? 'VIGENTE'}
                                    onChange={e => setEdicao({ ...edicao, status: e.target.value as ContractGuarantee['status'] })}>
                                {['VIGENTE', 'EM_ANALISE', 'PENDENTE_DOCUMENTOS', 'PENDENTE_REGISTRO',
                                  'INSUFICIENTE', 'VENCIDA', 'LIBERADA', 'CANCELADA'].map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label>Data da avaliação</Label>
                            <input type="date" className={campo} value={edicao.valuation_date ?? ''}
                                   onChange={e => setEdicao({ ...edicao, valuation_date: e.target.value || undefined })} />
                        </div>
                        <div className="space-y-1">
                            <Label>Avaliação válida até</Label>
                            <input type="date" className={campo} value={edicao.valuation_valid_until ?? ''}
                                   onChange={e => setEdicao({ ...edicao, valuation_valid_until: e.target.value || undefined })} />
                            <p className="text-xs text-gray-400">
                                Alimenta o covenant “Garantias com avaliação vencida”.
                            </p>
                        </div>
                        <div className="space-y-1">
                            <Label>Cartório de registro</Label>
                            <input className={campo} value={edicao.registry_office ?? ''}
                                   onChange={e => setEdicao({ ...edicao, registry_office: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <Label>Liberada em</Label>
                            <input type="date" className={campo} value={edicao.released_at ?? ''}
                                   onChange={e => setEdicao({ ...edicao, released_at: e.target.value || undefined })} />
                            <p className="text-xs text-gray-400">
                                Preencher tira o bem dos alertas e o devolve para outra operação.
                            </p>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label>Observações</Label>
                        <textarea
                            className="w-full min-h-[70px] px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            value={edicao.notes ?? ''}
                            onChange={e => setEdicao({ ...edicao, notes: e.target.value })}
                        />
                    </div>
                </SheetPanel>

                <SheetFooter>
                    <button onClick={() => setAberto(false)} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] transition-all">
                        Cancelar
                    </button>
                    <button
                        onClick={salvar}
                        disabled={salvando}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40"
                    >
                        {salvando ? 'Salvando…' : edicao.id ? 'Salvar alterações' : 'Criar garantia'}
                    </button>
                </SheetFooter>
            </Sheet>
        </div>
    );
}
