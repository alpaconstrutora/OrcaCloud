import React from 'react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import SaveStatus from '../ui/SaveStatus';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { formatMoney } from '../ui/Format';
import {
    DEBT_AMORTIZATION_PT,
    DEBT_MODALITY_PT,
    DEBT_STATUS_PT,
    type DebtContract,
    type DebtContractInput,
} from '../../types/debt';
import type { Company } from '../../types/company';
import type { Supplier } from '../../types/users';
import { getSupplierDisplayName } from '../../services/supplierService';

interface Props {
    open: boolean;
    onClose: () => void;
    /** Ausente = criação. */
    contract?: DebtContract;
    /**
     * Valores iniciais para uma CRIAÇÃO pré-preenchida (ex.: proposta que já
     * nasce no grupo da cotação e em EM_NEGOCIACAO).
     *
     * ⚠️ Não confundir com `contract`: um rascunho não tem `id`, então passá-lo
     * como `contract` faria o formulário entrar em modo edição e chamar
     * `updateContract(undefined)`.
     */
    draft?: Partial<DebtContractInput>;
    companies: Company[];
    suppliers: Supplier[];
    onSave: (input: DebtContractInput) => Promise<void>;
}

const VAZIO: DebtContractInput = {
    counterpartyKind: 'INSTITUICAO_FINANCEIRA',
    modality: 'CAPITAL_GIRO',
    status: 'CONTRATADO',
    principalContracted: 0,
    principalReleased: 0,
    retainedAmount: 0,
    fees: 0,
    iof: 0,
    insurance: 0,
    notaryCosts: 0,
    otherCosts: 0,
    netReceived: 0,
    rateType: 'FIXA',
    nominalRate: 0,
    ratePeriod: 'MENSAL',
    gracePrincipalMonths: 0,
    graceInterestMonths: 0,
    capitalizeInterest: false,
    installmentPeriod: 'MENSAL',
    lateFinePct: 2,
    lateInterestMonthPct: 1,
    amortizationSystem: 'PRICE',
};

// §21 — rótulo de campo em sentence case, sem uppercase/font-black.
const Label = ({ children }: { children: React.ReactNode }) => (
    <label className="text-xs font-semibold text-slate-500">{children}</label>
);

const campo = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';

const Secao = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
    <section className="space-y-3">
        <h4 className="text-sm font-bold text-gray-800">{titulo}</h4>
        {children}
    </section>
);

export default function DebtForm({ open, onClose, contract, draft, companies, suppliers, onSave }: Props) {
    const editando = Boolean(contract);
    const { dirty, markDirty, markSaved, confirmDiscard } = useUnsavedChanges();
    const [form, setForm] = React.useState<DebtContractInput>(VAZIO);
    const [salvando, setSalvando] = React.useState(false);
    const [savedAt, setSavedAt] = React.useState<number | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!open) return;
        setForm(contract
            ? { ...(contract as unknown as DebtContractInput) }
            : { ...VAZIO, ...draft });
        setErro(null);
        markSaved();
        // `contract` muda de identidade a cada refetch; a dependência real é o id.
    }, [open, contract?.id, draft?.proposalGroup]); // eslint-disable-line react-hooks/exhaustive-deps

    const set = <K extends keyof DebtContractInput>(key: K, value: DebtContractInput[K]) => {
        setForm(prev => ({ ...prev, [key]: value }));
        markDirty();
    };

    const num = (v: string) => (v === '' ? 0 : Number(v));

    /**
     * O líquido é derivado, não digitado: bruto menos tudo o que o banco retém
     * na liberação. Deixar o usuário digitar os dois é o caminho conhecido para
     * dois números que deveriam bater e não batem.
     */
    const liquidoCalculado = React.useMemo(() => {
        const bruto = form.principalReleased || 0;
        return Math.max(
            0,
            bruto - form.retainedAmount - form.fees - form.iof - form.insurance - form.notaryCosts - form.otherCosts,
        );
    }, [form.principalReleased, form.retainedAmount, form.fees, form.iof, form.insurance, form.notaryCosts, form.otherCosts]);

    const ehMutuo = form.counterpartyKind === 'PARTE_RELACIONADA';

    const handleBack = async () => {
        if (await confirmDiscard()) onClose();
    };

    const handleSave = async () => {
        // A trava do banco (`debt_contracts_contraparte_obrigatoria`) diria a
        // mesma coisa, mas em inglês e depois do round-trip.
        if (!ehMutuo && !form.institutionSupplierId) {
            setErro('Escolha a instituição financeira — sem credor, a parcela não tem para quem ir no Contas a Pagar.');
            return;
        }
        if (ehMutuo && !form.relatedCompanyId) {
            setErro('Escolha a empresa do grupo que é a outra ponta do mútuo.');
            return;
        }
        // O espelho troca as duas empresas de lado. Sem a devedora, a perna
        // CREDORA nasceria sem contraparte e o banco a barraria com
        // `debt_contracts_contraparte_obrigatoria` — erro cru, depois de já
        // ter criado a primeira perna.
        if (ehMutuo && !form.companyId) {
            setErro('Escolha a empresa devedora: o mútuo tem duas pontas, e o espelho precisa das duas.');
            return;
        }
        if (ehMutuo && form.companyId === form.relatedCompanyId) {
            setErro('A empresa devedora e a credora não podem ser a mesma.');
            return;
        }
        setSalvando(true);
        setErro(null);
        try {
            await onSave({ ...form, netReceived: liquidoCalculado });
            markSaved();
            setSavedAt(Date.now());
            // §25: criar fecha (a tarefa acabou); editar permanece aberto.
            if (!editando) onClose();
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível salvar o contrato.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={open} onClose={handleBack} size="2xl" dirty={dirty}>
            <SheetHeader onClose={handleBack}>
                <SheetTitle>
                    {editando ? 'Editar contrato de dívida'
                     : form.status === 'EM_NEGOCIACAO' ? 'Nova proposta de banco'
                     : 'Novo contrato de dívida'}
                </SheetTitle>
                <SheetDescription>
                    O contrato é a fonte do cronograma. As parcelas chegam ao Contas a Pagar decompostas por componente.
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-6">
                {erro && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[10px] px-4 py-3">
                        {erro}
                    </div>
                )}

                <Secao titulo="Identificação">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label>Empresa / SPE contratante</Label>
                            <select className={campo} value={form.companyId ?? ''} onChange={e => set('companyId', e.target.value || undefined)}>
                                <option value="">Selecione…</option>
                                {companies.map(c => (
                                    <option key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label>Tipo de contraparte</Label>
                            <select
                                className={campo}
                                value={form.counterpartyKind}
                                onChange={e => set('counterpartyKind', e.target.value as DebtContractInput['counterpartyKind'])}
                            >
                                <option value="INSTITUICAO_FINANCEIRA">Instituição financeira</option>
                                <option value="PARTE_RELACIONADA">Parte relacionada (grupo / sócios)</option>
                                <option value="TERCEIRO">Terceiro</option>
                            </select>
                        </div>

                        {ehMutuo ? (
                            <div className="space-y-1">
                                <Label>Empresa do grupo (outra ponta)</Label>
                                <select className={campo} value={form.relatedCompanyId ?? ''} onChange={e => set('relatedCompanyId', e.target.value || undefined)}>
                                    <option value="">Selecione…</option>
                                    {companies.map(c => (
                                        <option key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                <Label>Instituição financeira</Label>
                                <select className={campo} value={form.institutionSupplierId ?? ''} onChange={e => set('institutionSupplierId', e.target.value || undefined)}>
                                    <option value="">Selecione…</option>
                                    {suppliers.map(s => (
                                        <option key={s.id} value={s.id}>{getSupplierDisplayName(s, 'razao')}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="space-y-1">
                            <Label>Agência</Label>
                            <input className={campo} value={form.institutionBranch ?? ''} onChange={e => set('institutionBranch', e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>Número do contrato</Label>
                            <input className={campo} value={form.contractNumber ?? ''} onChange={e => set('contractNumber', e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>Modalidade</Label>
                            <select className={campo} value={form.modality} onChange={e => set('modality', e.target.value as DebtContractInput['modality'])}>
                                {Object.entries(DEBT_MODALITY_PT).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1 md:col-span-2">
                            <Label>Finalidade do recurso</Label>
                            <input className={campo} value={form.purpose ?? ''} onChange={e => set('purpose', e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>Data da contratação</Label>
                            <input type="date" className={campo} value={form.signedAt ?? ''} onChange={e => set('signedAt', e.target.value || undefined)} />
                        </div>
                        <div className="space-y-1">
                            <Label>Data da liberação</Label>
                            <input type="date" className={campo} value={form.releasedAt ?? ''} onChange={e => set('releasedAt', e.target.value || undefined)} />
                        </div>
                        <div className="space-y-1">
                            <Label>Status da operação</Label>
                            <select className={campo} value={form.status} onChange={e => set('status', e.target.value as DebtContractInput['status'])}>
                                {Object.entries(DEBT_STATUS_PT).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </Secao>

                <Secao titulo="Valores">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                            <Label>Valor contratado</Label>
                            <input type="number" step="0.01" className={campo} value={form.principalContracted} onChange={e => set('principalContracted', num(e.target.value))} />
                        </div>
                        <div className="space-y-1">
                            <Label>Valor liberado</Label>
                            <input type="number" step="0.01" className={campo} value={form.principalReleased} onChange={e => set('principalReleased', num(e.target.value))} />
                        </div>
                        <div className="space-y-1">
                            <Label>Valor retido</Label>
                            <input type="number" step="0.01" className={campo} value={form.retainedAmount} onChange={e => set('retainedAmount', num(e.target.value))} />
                        </div>
                        <div className="space-y-1">
                            <Label>Tarifas</Label>
                            <input type="number" step="0.01" className={campo} value={form.fees} onChange={e => set('fees', num(e.target.value))} />
                        </div>
                        <div className="space-y-1">
                            <Label>IOF</Label>
                            <input type="number" step="0.01" className={campo} value={form.iof} onChange={e => set('iof', num(e.target.value))} />
                        </div>
                        <div className="space-y-1">
                            <Label>Seguros</Label>
                            <input type="number" step="0.01" className={campo} value={form.insurance} onChange={e => set('insurance', num(e.target.value))} />
                        </div>
                        <div className="space-y-1">
                            <Label>Custos cartorários</Label>
                            <input type="number" step="0.01" className={campo} value={form.notaryCosts} onChange={e => set('notaryCosts', num(e.target.value))} />
                        </div>
                        <div className="space-y-1">
                            <Label>Outras despesas</Label>
                            <input type="number" step="0.01" className={campo} value={form.otherCosts} onChange={e => set('otherCosts', num(e.target.value))} />
                        </div>
                        <div className="space-y-1">
                            <Label>Valor líquido recebido</Label>
                            <div className="h-9 px-3 flex items-center bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium text-gray-800">
                                {formatMoney(liquidoCalculado)}
                            </div>
                            <p className="text-xs text-gray-400">Calculado: liberado − retenções, tarifas, IOF, seguros e custos.</p>
                        </div>
                    </div>
                </Secao>

                <Secao titulo="Condições financeiras">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                            <Label>Tipo de taxa</Label>
                            <select className={campo} value={form.rateType} onChange={e => set('rateType', e.target.value as DebtContractInput['rateType'])}>
                                <option value="FIXA">Fixa</option>
                                <option value="VARIAVEL">Variável</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label>Taxa nominal (%)</Label>
                            <input type="number" step="0.000001" className={campo} value={form.nominalRate} onChange={e => set('nominalRate', num(e.target.value))} />
                        </div>
                        <div className="space-y-1">
                            <Label>Periodicidade da taxa</Label>
                            <select className={campo} value={form.ratePeriod} onChange={e => set('ratePeriod', e.target.value as DebtContractInput['ratePeriod'])}>
                                <option value="MENSAL">Ao mês</option>
                                <option value="ANUAL">Ao ano</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label>Indexador</Label>
                            <select className={campo} value={form.indexName ?? ''} onChange={e => set('indexName', e.target.value || undefined)}>
                                <option value="">Sem indexador</option>
                                <option value="CDI">CDI</option>
                                <option value="SELIC">Selic</option>
                                <option value="IPCA">IPCA</option>
                                <option value="TR">TR</option>
                                <option value="INCC-M">INCC-M</option>
                                <option value="IGP-M">IGP-M</option>
                                <option value="CUB">CUB</option>
                                <option value="OUTROS">Outro</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label>% do indexador</Label>
                            <input type="number" step="0.01" className={campo} value={form.indexPct ?? ''} onChange={e => set('indexPct', e.target.value === '' ? undefined : num(e.target.value))} placeholder="110 = 110% do CDI" />
                        </div>
                        <div className="space-y-1">
                            <Label>Spread (% a.m.)</Label>
                            <input type="number" step="0.000001" className={campo} value={form.spread ?? ''} onChange={e => set('spread', e.target.value === '' ? undefined : num(e.target.value))} />
                        </div>
                        <div className="space-y-1">
                            <Label>Carência de principal (meses)</Label>
                            <input type="number" className={campo} value={form.gracePrincipalMonths} onChange={e => set('gracePrincipalMonths', num(e.target.value))} />
                        </div>
                        <div className="space-y-1">
                            <Label>Carência de juros (meses)</Label>
                            <input type="number" className={campo} value={form.graceInterestMonths} onChange={e => set('graceInterestMonths', num(e.target.value))} />
                        </div>
                        <div className="space-y-1">
                            <Label>Capitalização de juros</Label>
                            <select className={campo} value={form.capitalizeInterest ? 'sim' : 'nao'} onChange={e => set('capitalizeInterest', e.target.value === 'sim')}>
                                <option value="nao">Não capitaliza</option>
                                <option value="sim">Capitaliza no saldo</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label>Multa por atraso (%)</Label>
                            <input type="number" step="0.01" className={campo} value={form.lateFinePct} onChange={e => set('lateFinePct', num(e.target.value))} />
                        </div>
                        <div className="space-y-1">
                            <Label>Juros de mora (% a.m.)</Label>
                            <input type="number" step="0.01" className={campo} value={form.lateInterestMonthPct} onChange={e => set('lateInterestMonthPct', num(e.target.value))} />
                        </div>
                    </div>
                </Secao>

                <Secao titulo="Amortização">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                            <Label>Sistema</Label>
                            <select className={campo} value={form.amortizationSystem} onChange={e => set('amortizationSystem', e.target.value as DebtContractInput['amortizationSystem'])}>
                                {Object.entries(DEBT_AMORTIZATION_PT).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label>Periodicidade das parcelas</Label>
                            <select className={campo} value={form.installmentPeriod} onChange={e => set('installmentPeriod', e.target.value as DebtContractInput['installmentPeriod'])}>
                                <option value="MENSAL">Mensal</option>
                                <option value="BIMESTRAL">Bimestral</option>
                                <option value="TRIMESTRAL">Trimestral</option>
                                <option value="SEMESTRAL">Semestral</option>
                                <option value="ANUAL">Anual</option>
                                <option value="UNICA">Parcela única</option>
                                <option value="IRREGULAR">Irregular</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label>Número de parcelas</Label>
                            <input type="number" className={campo} value={form.installmentCount ?? ''} onChange={e => set('installmentCount', e.target.value === '' ? undefined : num(e.target.value))} />
                        </div>
                        <div className="space-y-1">
                            <Label>1º vencimento</Label>
                            <input type="date" className={campo} value={form.firstDueDate ?? ''} onChange={e => set('firstDueDate', e.target.value || undefined)} />
                        </div>
                        <div className="space-y-1">
                            <Label>Vencimento final</Label>
                            <input type="date" className={campo} value={form.finalDueDate ?? ''} onChange={e => set('finalDueDate', e.target.value || undefined)} />
                        </div>
                    </div>
                </Secao>

                <Secao titulo="Observações">
                    <textarea
                        className="w-full min-h-[80px] px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        value={form.notes ?? ''}
                        onChange={e => set('notes', e.target.value)}
                    />
                </Secao>
            </SheetPanel>

            <SheetFooter>
                {editando && <SaveStatus dirty={dirty} savedAt={savedAt} className="mr-auto" />}
                <button onClick={handleBack} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] transition-all">
                    {editando ? 'Voltar' : 'Cancelar'}
                </button>
                <button
                    onClick={handleSave}
                    disabled={salvando || (editando && !dirty)}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {salvando ? 'Salvando…'
                     : editando ? 'Salvar alterações'
                     : form.status === 'EM_NEGOCIACAO' ? 'Criar proposta'
                     : 'Criar contrato'}
                </button>
            </SheetFooter>
        </Sheet>
    );
}
