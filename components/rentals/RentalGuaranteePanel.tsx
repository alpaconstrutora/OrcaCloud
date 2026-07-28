import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ShieldCheck, AlertTriangle, Plus, Loader2, Save, History, Landmark, Users,
    FileCheck, RefreshCw,
} from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { KpiCard } from '../ui/KpiCard';
import { useConfirm } from '../ui/confirm';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import Button from '../ui/Button';
import {
    rentalGuaranteeService, RENTAL_KIND_LABELS, GUARANTEE_STATUS_LABELS,
    DEPOSIT_EVENT_LABELS, checkLegalRules, computeCoverageIndex, monthlyRentOf,
} from '../../services/rentalGuaranteeService';
import {
    Contract, ContractGuarantee, ContractGuarantor, GuaranteeDocument,
    GuaranteeDepositEvent, GuaranteeDepositEventType, RentalGuaranteeKind,
    RENTAL_GUARANTEE_KINDS, CaucaoType, GuaranteeStatus,
} from '../../types';

interface Props {
    /** Contrato de locação gerado a partir desta negociação. */
    contract: Contract;
    onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

/** Data BR por split — `new Date(iso)` retrocede um dia em UTC-3. */
const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
};
const fmtCur = (n?: number) =>
    (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const todayISO = () => new Date().toISOString().slice(0, 10);
const parseNum = (s: string) => {
    const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};

// §21: rótulo de campo em sentence case, sem uppercase/font-black.
const LABEL = 'text-xs font-semibold text-slate-500';
const INPUT = 'w-full h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';
const TD = 'px-6 py-2.5 border-r border-gray-100 last:border-r-0';

const CAUCAO_LABELS: Record<CaucaoType, string> = {
    DINHEIRO: 'Dinheiro',
    BEM_MOVEL: 'Bem móvel',
    BEM_IMOVEL: 'Bem imóvel',
    TITULOS: 'Títulos ou ações',
    QUOTAS: 'Quotas de fundo',
};

/** §8: status é texto colorido simples — sem pílula, fundo ou uppercase. */
const StatusText: React.FC<{ status?: string }> = ({ status }) => {
    const cores: Record<string, string> = {
        VIGENTE: 'text-emerald-700', EM_ANALISE: 'text-blue-600',
        PENDENTE_DOCUMENTOS: 'text-amber-700', PENDENTE_ASSINATURA: 'text-amber-700',
        PENDENTE_REGISTRO: 'text-amber-700', EM_RENOVACAO: 'text-indigo-700',
        INSUFICIENTE: 'text-red-600', VENCIDA: 'text-red-600',
        CANCELADA: 'text-gray-500', SUBSTITUIDA: 'text-gray-500',
        LIBERADA: 'text-gray-600', DEVOLVIDA: 'text-gray-600',
    };
    return (
        <span className={`text-sm font-normal ${cores[status || ''] || 'text-gray-600'}`}>
            {GUARANTEE_STATUS_LABELS[status || ''] || status || '—'}
        </span>
    );
};

/**
 * Garantias Locatícias — aba de "Gerenciar Negociação".
 *
 * A garantia é uma entidade VERSIONADA presa ao CONTRATO (não à negociação):
 * substituir não edita a linha, cria uma versão nova ligada à anterior. Por isso
 * este painel exige um contrato gerado — sem ele não há a que prender a garantia.
 *
 * Fase 1: sem garantia, caução (com o ciclo financeiro de dinheiro), fiança e
 * seguro-fiança. Motor de suficiência e acionamento ficam na Etapa 2.
 */
const RentalGuaranteePanel: React.FC<Props> = ({ contract, onNotify }) => {
    const confirm = useConfirm();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [chain, setChain] = useState<ContractGuarantee[]>([]);
    const [active, setActive] = useState<ContractGuarantee | null>(null);
    const [guarantors, setGuarantors] = useState<ContractGuarantor[]>([]);
    const [documents, setDocuments] = useState<GuaranteeDocument[]>([]);
    const [deposits, setDeposits] = useState<GuaranteeDepositEvent[]>([]);

    // Formulário da garantia ativa (ou da primeira, quando ainda não existe)
    const [kind, setKind] = useState<RentalGuaranteeKind>('SEM_GARANTIA');
    const [caucaoType, setCaucaoType] = useState<CaucaoType>('DINHEIRO');
    const [provider, setProvider] = useState('');
    const [productName, setProductName] = useState('');
    const [policyNumber, setPolicyNumber] = useState('');
    const [guaranteedValue, setGuaranteedValue] = useState('');
    const [premium, setPremium] = useState('');
    const [validFrom, setValidFrom] = useState('');
    const [validUntil, setValidUntil] = useState('');
    const [costBearer, setCostBearer] = useState<'LOCATARIO' | 'LOCADOR' | 'AMBOS'>('LOCATARIO');
    const [status, setStatus] = useState<GuaranteeStatus>('EM_ANALISE');
    const [depositBank, setDepositBank] = useState('');
    const [depositAgency, setDepositAgency] = useState('');
    const [depositAccount, setDepositAccount] = useState('');
    const [depositHolder, setDepositHolder] = useState('');
    const [depositDate, setDepositDate] = useState('');
    const [notes, setNotes] = useState('');

    // Substituição (§7) — quando marcado, salvar versiona em vez de editar.
    const [substituting, setSubstituting] = useState(false);
    const [substitutionReason, setSubstitutionReason] = useState('');

    // Sheets
    const [guarantorSheet, setGuarantorSheet] = useState<ContractGuarantor | 'new' | null>(null);
    const [depositSheet, setDepositSheet] = useState(false);

    const rent = monthlyRentOf(contract);

    const fillForm = useCallback((g: ContractGuarantee | null) => {
        setKind((g?.kind as RentalGuaranteeKind) || 'SEM_GARANTIA');
        setCaucaoType(g?.caucao_type || 'DINHEIRO');
        setProvider(g?.insurer || '');
        setProductName(g?.product_name || '');
        setPolicyNumber(g?.policy_number || '');
        setGuaranteedValue(g?.guaranteed_value != null ? String(g.guaranteed_value) : '');
        setPremium(g?.premium != null ? String(g.premium) : '');
        setValidFrom(g?.valid_from || contract.start_date || '');
        setValidUntil(g?.valid_until || contract.end_date || '');
        setCostBearer(g?.cost_bearer || 'LOCATARIO');
        setStatus(g?.status || 'EM_ANALISE');
        setDepositBank(g?.deposit_bank || '');
        setDepositAgency(g?.deposit_agency || '');
        setDepositAccount(g?.deposit_account || '');
        setDepositHolder(g?.deposit_account_holder || '');
        setDepositDate(g?.deposit_date || '');
        setNotes(g?.notes || '');
        setSubstituting(false);
        setSubstitutionReason('');
    }, [contract.start_date, contract.end_date]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const cadeia = await rentalGuaranteeService.listByContract(contract.id);
            setChain(cadeia);
            const ativa = cadeia.find(g => g.is_active) ?? null;
            setActive(ativa);
            fillForm(ativa);
            if (ativa) {
                const [gs, ds, es] = await Promise.all([
                    rentalGuaranteeService.listGuarantors(ativa.id),
                    rentalGuaranteeService.listDocuments(ativa.id),
                    ativa.kind === 'CAUCAO' && ativa.caucao_type === 'DINHEIRO'
                        ? rentalGuaranteeService.listDepositEvents(ativa.id)
                        : Promise.resolve([] as GuaranteeDepositEvent[]),
                ]);
                setGuarantors(gs); setDocuments(ds); setDeposits(es);
            } else {
                setGuarantors([]); setDocuments([]); setDeposits([]);
            }
        } catch (e) {
            onNotify(`Erro ao carregar garantias: ${e instanceof Error ? e.message : ''}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [contract.id, fillForm, onNotify]);

    useEffect(() => { void load(); }, [load]);

    const saldoCaucao = useMemo(
        () => rentalGuaranteeService.depositBalance(deposits), [deposits]);

    const isCaucaoDinheiro = kind === 'CAUCAO' && caucaoType === 'DINHEIRO';

    // Conferência legal a cada mudança do formulário — o usuário vê o problema
    // antes de tentar salvar, não depois de um erro do banco.
    const legal = useMemo(() => checkLegalRules(
        {
            kind, caucao_type: caucaoType,
            guaranteed_value: parseNum(guaranteedValue),
            deposit_bank: depositBank, deposit_account: depositAccount,
            policy_number: policyNumber,
        },
        rent,
        guarantors,
    ), [kind, caucaoType, guaranteedValue, depositBank, depositAccount, policyNumber, rent, guarantors]);

    const coverage = useMemo(() => computeCoverageIndex(
        parseNum(guaranteedValue), rent,
        { penaltyMonths: contract.rescission_penalty_months ?? 0 },
    ), [guaranteedValue, rent, contract.rescission_penalty_months]);

    // A garantia venceu antes do contrato? (§5.4 — alerta, não bloqueio.)
    const vigenciaCurta = Boolean(
        validUntil && contract.end_date && validUntil < contract.end_date);

    const handleSave = async () => {
        if (legal.blocking.length > 0) {
            onNotify(legal.blocking[0], 'error');
            return;
        }
        if (substituting && !substitutionReason.trim()) {
            onNotify('Informe o motivo da substituição — é o que fica no histórico.', 'error');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                organization_id: contract.organization_id,
                contract_id: contract.id,
                kind,
                caucao_type: kind === 'CAUCAO' ? caucaoType : undefined,
                insurer: provider || undefined,
                product_name: productName || undefined,
                policy_number: policyNumber || undefined,
                guaranteed_value: guaranteedValue ? parseNum(guaranteedValue) : undefined,
                coverage_limit: guaranteedValue ? parseNum(guaranteedValue) : undefined,
                rent_months_equivalent: rent > 0 && guaranteedValue
                    ? parseFloat((parseNum(guaranteedValue) / rent).toFixed(2)) : undefined,
                premium: premium ? parseNum(premium) : undefined,
                valid_from: validFrom || undefined,
                valid_until: validUntil || undefined,
                cost_bearer: costBearer,
                status,
                deposit_bank: isCaucaoDinheiro ? (depositBank || undefined) : undefined,
                deposit_agency: isCaucaoDinheiro ? (depositAgency || undefined) : undefined,
                deposit_account: isCaucaoDinheiro ? (depositAccount || undefined) : undefined,
                deposit_account_holder: isCaucaoDinheiro ? (depositHolder || undefined) : undefined,
                deposit_date: isCaucaoDinheiro ? (depositDate || undefined) : undefined,
                notes: notes || undefined,
                // Salvar é a confirmação humana que a reanálise pedia.
                requires_reanalysis: false,
            };

            const salva = active && substituting
                ? await rentalGuaranteeService.substitute(active.id, payload, substitutionReason.trim())
                : await rentalGuaranteeService.save({ ...payload, id: active?.id });

            // Checklist sugerido só na criação da garantia — nunca por cima de
            // um checklist que o usuário já ajustou.
            if (!active) {
                try { await rentalGuaranteeService.seedChecklist(salva); } catch { /* opcional */ }
            }
            await rentalGuaranteeService.syncGuarantorNameToContract(contract.id, salva.id);

            onNotify(substituting ? 'Garantia substituída — a anterior virou histórico.' : 'Garantia salva.');
            await load();
        } catch (e) {
            onNotify(`Erro ao salvar: ${e instanceof Error ? e.message : ''}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    // §22: criar/editar/excluir atualiza o array local, sem recarregar tudo.
    const handleGuarantorSaved = (g: ContractGuarantor) => {
        setGuarantors(prev => prev.some(x => x.id === g.id)
            ? prev.map(x => (x.id === g.id ? g : x))
            : [...prev, g]);
        void rentalGuaranteeService.syncGuarantorNameToContract(contract.id, g.guarantee_id);
    };

    const handleRemoveGuarantor = async (g: ContractGuarantor) => {
        const ok = await confirm({
            title: 'Excluir garantidor?',
            message: `${g.name} será removido desta garantia. Esta ação não pode ser desfeita.`,
            variant: 'danger', confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await rentalGuaranteeService.removeGuarantor(g.id);
            setGuarantors(prev => prev.filter(x => x.id !== g.id));
        } catch (e) {
            onNotify(`Erro ao excluir: ${e instanceof Error ? e.message : ''}`, 'error');
        }
    };

    const toggleDocReceived = async (d: GuaranteeDocument) => {
        try {
            const saved = await rentalGuaranteeService.saveDocument({
                id: d.id,
                organization_id: d.organization_id,
                guarantee_id: d.guarantee_id,
                label: d.label,
                received: !d.received,
                received_at: !d.received ? todayISO() : undefined,
            });
            setDocuments(prev => prev.map(x => (x.id === saved.id ? saved : x)));
        } catch (e) {
            onNotify(`Erro ao atualizar documento: ${e instanceof Error ? e.message : ''}`, 'error');
        }
    };

    const handleAddDocument = async () => {
        if (!active) return;
        try {
            const saved = await rentalGuaranteeService.saveDocument({
                organization_id: contract.organization_id,
                guarantee_id: active.id,
                label: 'Novo documento',
                is_required: true,
                received: false,
            });
            setDocuments(prev => [...prev, saved]);
        } catch (e) {
            onNotify(`Erro ao adicionar: ${e instanceof Error ? e.message : ''}`, 'error');
        }
    };

    const handleRemoveDocument = async (d: GuaranteeDocument) => {
        const ok = await confirm({
            title: 'Excluir documento do checklist?',
            message: `"${d.label}" sairá da lista de pendências desta garantia.`,
            variant: 'danger', confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await rentalGuaranteeService.removeDocument(d.id);
            setDocuments(prev => prev.filter(x => x.id !== d.id));
        } catch (e) {
            onNotify(`Erro ao excluir: ${e instanceof Error ? e.message : ''}`, 'error');
        }
    };

    if (loading) {
        return (
            <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-500">Carregando garantias...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* ── KPIs (§4) ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                <KpiCard shadow={false} size="sm" label="Modalidade"
                    value={RENTAL_KIND_LABELS[kind]}
                    icon={<ShieldCheck className="w-4 h-4" />}
                    color={kind === 'SEM_GARANTIA' ? 'red' : 'blue'} />
                <KpiCard shadow={false} size="sm" label="Situação"
                    value={GUARANTEE_STATUS_LABELS[status] || status}
                    icon={<FileCheck className="w-4 h-4" />}
                    color={status === 'VIGENTE' ? 'emerald' : status === 'EM_ANALISE' ? 'indigo' : 'amber'} />
                <KpiCard shadow={false} size="sm" label="Valor garantido"
                    value={fmtCur(parseNum(guaranteedValue))}
                    sub={rent > 0 ? `${(parseNum(guaranteedValue) / rent).toFixed(1)} aluguéis` : undefined}
                    icon={<Landmark className="w-4 h-4" />} color="violet" />
                {isCaucaoDinheiro ? (
                    <KpiCard shadow={false} size="sm" label="Saldo da caução"
                        value={fmtCur(saldoCaucao)} sub="A devolver ao locatário"
                        icon={<Landmark className="w-4 h-4" />}
                        color={saldoCaucao > 0 ? 'amber' : 'gray'} />
                ) : (
                    <KpiCard shadow={false} size="sm" label="Índice de cobertura"
                        value={kind === 'SEM_GARANTIA' ? '—' : `${(coverage.ratio * 100).toFixed(0)}%`}
                        sub={kind === 'SEM_GARANTIA' ? undefined : coverage.label}
                        icon={<ShieldCheck className="w-4 h-4" />}
                        color={coverage.band === 'CRITICA' ? 'red'
                            : coverage.band === 'INSUFICIENTE' ? 'amber'
                            : coverage.band === 'ADEQUADA' ? 'blue' : 'emerald'} />
                )}
            </div>

            {/* ── Avisos legais e de consistência ───────────────────────── */}
            {(legal.blocking.length > 0 || legal.warnings.length > 0 || vigenciaCurta
                || active?.requires_reanalysis) && (
                <div className="space-y-2">
                    {legal.blocking.map((m, i) => (
                        <div key={`b${i}`} className="flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-100 rounded-[10px] text-sm text-red-700">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{m}
                        </div>
                    ))}
                    {active?.requires_reanalysis && (
                        <div className="flex items-start gap-2.5 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-[10px] text-sm text-indigo-700">
                            <RefreshCw className="w-4 h-4 mt-0.5 shrink-0" />
                            Contrato renovado: esta garantia precisa de reanálise explícita.
                            Confira as condições do novo período e salve para confirmar.
                        </div>
                    )}
                    {vigenciaCurta && (
                        <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 border border-amber-100 rounded-[10px] text-sm text-amber-700">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            A garantia termina em {fmtDate(validUntil)}, antes do fim da vigência do
                            contrato ({fmtDate(contract.end_date)}).
                        </div>
                    )}
                    {legal.warnings.map((m, i) => (
                        <div key={`w${i}`} className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 border border-amber-100 rounded-[10px] text-sm text-amber-700">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{m}
                        </div>
                    ))}
                </div>
            )}

            {/* ── Identificação da garantia ─────────────────────────────── */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3">
                    <div>
                        <h3 className="font-black text-slate-800 text-lg">Garantia locatícia</h3>
                        <p className="text-gray-400 text-sm mt-1.5 font-medium">
                            Uma única modalidade por contrato (art. 43 da Lei 8.245/91). Trocar de
                            modalidade cria uma versão nova e preserva a anterior no histórico.
                        </p>
                    </div>
                    {active && (
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-600 shrink-0 cursor-pointer">
                            <input type="checkbox" checked={substituting}
                                onChange={e => setSubstituting(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                            Substituir garantia
                        </label>
                    )}
                </div>

                <div className="p-4 space-y-4">
                    {substituting && (
                        <div className="space-y-1.5">
                            <label className={LABEL}>Motivo da substituição</label>
                            <input type="text" className={INPUT} value={substitutionReason}
                                onChange={e => setSubstitutionReason(e.target.value)}
                                placeholder="Ex: exoneração do fiador, troca por seguro-fiança" />
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <label className={LABEL}>Modalidade jurídica</label>
                            <select className={INPUT} value={kind}
                                onChange={e => setKind(e.target.value as RentalGuaranteeKind)}>
                                {RENTAL_GUARANTEE_KINDS.map(k => (
                                    <option key={k} value={k}>{RENTAL_KIND_LABELS[k]}</option>
                                ))}
                            </select>
                        </div>

                        {kind === 'CAUCAO' && (
                            <div className="space-y-1.5">
                                <label className={LABEL}>Espécie da caução</label>
                                <select className={INPUT} value={caucaoType}
                                    onChange={e => setCaucaoType(e.target.value as CaucaoType)}>
                                    {(Object.keys(CAUCAO_LABELS) as CaucaoType[]).map(t => (
                                        <option key={t} value={t}>{CAUCAO_LABELS[t]}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className={LABEL}>Situação</label>
                            <select className={INPUT} value={status}
                                onChange={e => setStatus(e.target.value as GuaranteeStatus)}>
                                {(['EM_ANALISE', 'PENDENTE_DOCUMENTOS', 'PENDENTE_ASSINATURA',
                                   'PENDENTE_REGISTRO', 'VIGENTE', 'EM_RENOVACAO', 'INSUFICIENTE',
                                   'VENCIDA', 'CANCELADA', 'LIBERADA', 'DEVOLVIDA'] as GuaranteeStatus[]).map(s => (
                                    <option key={s} value={s}>{GUARANTEE_STATUS_LABELS[s]}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {kind !== 'SEM_GARANTIA' && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <label className={LABEL}>Provedor (seguradora, banco, garantidora)</label>
                                    <input type="text" className={INPUT} value={provider}
                                        onChange={e => setProvider(e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className={LABEL}>Produto comercial</label>
                                    <input type="text" className={INPUT} value={productName}
                                        onChange={e => setProductName(e.target.value)}
                                        placeholder="Ex: título de capitalização" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className={LABEL}>Nº da apólice / instrumento</label>
                                    <input type="text" className={INPUT} value={policyNumber}
                                        onChange={e => setPolicyNumber(e.target.value)} />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="space-y-1.5">
                                    <label className={LABEL}>Valor garantido (R$)</label>
                                    <input type="text" className={INPUT} value={guaranteedValue}
                                        onChange={e => setGuaranteedValue(e.target.value)} placeholder="0,00" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className={LABEL}>Custo / prêmio (R$)</label>
                                    <input type="text" className={INPUT} value={premium}
                                        onChange={e => setPremium(e.target.value)} placeholder="0,00" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className={LABEL}>Início da vigência</label>
                                    <input type="date" className={INPUT} value={validFrom}
                                        onChange={e => setValidFrom(e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className={LABEL}>Fim da vigência</label>
                                    <input type="date" className={INPUT} value={validUntil}
                                        onChange={e => setValidUntil(e.target.value)} />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <label className={LABEL}>Quem paga o custo</label>
                                    <select className={INPUT} value={costBearer}
                                        onChange={e => setCostBearer(e.target.value as typeof costBearer)}>
                                        <option value="LOCATARIO">Locatário</option>
                                        <option value="LOCADOR">Locador</option>
                                        <option value="AMBOS">Dividido</option>
                                    </select>
                                </div>
                                <div className="md:col-span-2 space-y-1.5">
                                    <label className={LABEL}>Observações e condições especiais</label>
                                    <input type="text" className={INPUT} value={notes}
                                        onChange={e => setNotes(e.target.value)} />
                                </div>
                            </div>
                        </>
                    )}

                    {/* Conta do depósito — art. 38 §2º: caderneta de poupança */}
                    {isCaucaoDinheiro && (
                        <div className="pt-2 border-t border-gray-100 space-y-4">
                            <p className="text-sm font-medium text-gray-500">
                                Conta do depósito — a caução em dinheiro vai para caderneta de
                                poupança e os rendimentos revertem ao locatário (art. 38 §2º).
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                <div className="space-y-1.5">
                                    <label className={LABEL}>Banco</label>
                                    <input type="text" className={INPUT} value={depositBank}
                                        onChange={e => setDepositBank(e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className={LABEL}>Agência</label>
                                    <input type="text" className={INPUT} value={depositAgency}
                                        onChange={e => setDepositAgency(e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className={LABEL}>Conta</label>
                                    <input type="text" className={INPUT} value={depositAccount}
                                        onChange={e => setDepositAccount(e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className={LABEL}>Titular</label>
                                    <input type="text" className={INPUT} value={depositHolder}
                                        onChange={e => setDepositHolder(e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className={LABEL}>Data do depósito</label>
                                    <input type="date" className={INPUT} value={depositDate}
                                        onChange={e => setDepositDate(e.target.value)} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 flex justify-end">
                    {/* §17: botão primário compacto */}
                    <button type="button" onClick={handleSave}
                        disabled={saving || legal.blocking.length > 0}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40">
                        {saving ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Save className="w-[15px] h-[15px]" />}
                        {substituting ? 'Substituir garantia' : active ? 'Salvar garantia' : 'Cadastrar garantia'}
                    </button>
                </div>
            </div>

            {/* ── Garantidores e bens ───────────────────────────────────── */}
            {active && kind !== 'SEM_GARANTIA' && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-gray-400" />
                            <h3 className="font-black text-slate-800 text-lg">Garantidores e bens</h3>
                        </div>
                        <button type="button" onClick={() => setGuarantorSheet('new')}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
                            <Plus className="w-[15px] h-[15px]" />
                            Novo garantidor
                        </button>
                    </div>

                    {guarantors.length === 0 ? (
                        <div className="text-center py-12">
                            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum garantidor cadastrado</h3>
                            <p className="text-sm text-gray-500">
                                Fiança exige ao menos um fiador. Caução em bem exige o titular do bem.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-auto max-h-[50vh]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        <th className="px-6 py-2 border-r border-gray-100">Nome</th>
                                        <th className="px-6 py-2 border-r border-gray-100">CPF/CNPJ</th>
                                        <th className="px-6 py-2 border-r border-gray-100">Renda mensal</th>
                                        <th className="px-6 py-2 border-r border-gray-100">Outorga conjugal</th>
                                        <th className="px-6 py-2 border-r border-gray-100">Análise</th>
                                        <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {guarantors.map(g => (
                                        <tr key={g.id} className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                            onClick={() => setGuarantorSheet(g)}>
                                            <td className={`${TD} text-sm font-normal text-gray-700`}>{g.name}</td>
                                            <td className={`${TD} text-sm font-normal text-gray-600`}>{g.document || '—'}</td>
                                            <td className={`${TD} text-sm font-medium text-gray-800`}>{fmtCur(g.monthly_income)}</td>
                                            <td className={`${TD} text-sm font-normal ${g.spouse_consent ? 'text-emerald-700' : 'text-amber-700'}`}>
                                                {g.person_type === 'PJ' ? 'Não se aplica' : g.spouse_consent ? 'Registrada' : 'Pendente'}
                                            </td>
                                            <td className={`${TD} text-sm font-normal ${
                                                g.analysis_result === 'APROVADO' ? 'text-emerald-700'
                                                : g.analysis_result === 'REPROVADO' ? 'text-red-600' : 'text-gray-600'}`}>
                                                {g.analysis_result === 'APROVADO' ? 'Aprovado'
                                                    : g.analysis_result === 'REPROVADO' ? 'Reprovado' : 'Pendente'}
                                            </td>
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                                    <ActionIconButton kind="delete" onClick={() => void handleRemoveGuarantor(g)} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── Checklist de documentos ───────────────────────────────── */}
            {active && kind !== 'SEM_GARANTIA' && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <FileCheck className="w-4 h-4 text-gray-400" />
                            <h3 className="font-black text-slate-800 text-lg">Documentos</h3>
                        </div>
                        <button type="button" onClick={handleAddDocument}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
                            <Plus className="w-[15px] h-[15px]" />
                            Novo documento
                        </button>
                    </div>

                    {documents.length === 0 ? (
                        <div className="text-center py-12">
                            <FileCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Checklist vazio</h3>
                            <p className="text-sm text-gray-500">Adicione os documentos exigidos para esta modalidade.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <th className="px-6 py-2 border-r border-gray-100">Documento</th>
                                    <th className="px-6 py-2 border-r border-gray-100">Obrigatório</th>
                                    <th className="px-6 py-2 border-r border-gray-100">Recebido</th>
                                    <th className="px-6 py-2 border-r border-gray-100">Validade</th>
                                    <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {documents.map(d => (
                                    <tr key={d.id} className="hover:bg-blue-50/50 transition-colors group">
                                        <td className={TD}>
                                            {/* §7.1: editável inline usa a MESMA tipografia da célula */}
                                            <input type="text" defaultValue={d.label}
                                                onBlur={async e => {
                                                    if (e.target.value === d.label) return;
                                                    const saved = await rentalGuaranteeService.saveDocument({
                                                        id: d.id, organization_id: d.organization_id,
                                                        guarantee_id: d.guarantee_id, label: e.target.value,
                                                    });
                                                    setDocuments(prev => prev.map(x => (x.id === saved.id ? saved : x)));
                                                }}
                                                className="w-full text-sm font-normal text-gray-700 px-2 py-1 rounded border border-transparent bg-transparent hover:border-gray-200 focus:bg-white focus:border-blue-500 outline-none transition-all" />
                                        </td>
                                        <td className={`${TD} text-sm font-normal text-gray-600`}>
                                            {d.is_required ? 'Sim' : 'Não'}
                                        </td>
                                        <td className={TD}>
                                            <label className="flex items-center gap-2 text-sm font-normal text-gray-700 cursor-pointer">
                                                <input type="checkbox" checked={d.received}
                                                    onChange={() => void toggleDocReceived(d)}
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                                {d.received ? fmtDate(d.received_at) : 'Pendente'}
                                            </label>
                                        </td>
                                        <td className={`${TD} text-sm font-normal text-gray-600`}>{fmtDate(d.valid_until)}</td>
                                        <td className="px-6 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <ActionIconButton kind="delete" onClick={() => void handleRemoveDocument(d)} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* ── Movimentações da caução (PASSIVO) ─────────────────────── */}
            {active && isCaucaoDinheiro && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2">
                                <Landmark className="w-4 h-4 text-gray-400" />
                                <h3 className="font-black text-slate-800 text-lg">Movimentações da caução</h3>
                            </div>
                            <p className="text-gray-400 text-sm mt-1.5 font-medium">
                                Caução é dinheiro de terceiro com obrigação de devolver — não é receita
                                de locação. Estes lançamentos não entram em Contas a Receber.
                            </p>
                        </div>
                        <button type="button" onClick={() => setDepositSheet(true)}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0">
                            <Plus className="w-[15px] h-[15px]" />
                            Novo lançamento
                        </button>
                    </div>

                    {deposits.length === 0 ? (
                        <div className="text-center py-12">
                            <Landmark className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma movimentação</h3>
                            <p className="text-sm text-gray-500">Registre o depósito inicial da caução.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <th className="px-6 py-2 border-r border-gray-100">Data</th>
                                    <th className="px-6 py-2 border-r border-gray-100">Tipo</th>
                                    <th className="px-6 py-2 border-r border-gray-100">Descrição</th>
                                    <th className="px-6 py-2 border-r border-gray-100">Valor</th>
                                    <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {deposits.map(e => (
                                    <tr key={e.id} className="hover:bg-blue-50/50 transition-colors group">
                                        <td className={`${TD} text-sm font-normal text-gray-600`}>{fmtDate(e.event_date)}</td>
                                        <td className={`${TD} text-sm font-normal text-gray-700`}>{DEPOSIT_EVENT_LABELS[e.event_type]}</td>
                                        <td className={`${TD} text-sm font-normal text-gray-700`}>{e.description || '—'}</td>
                                        <td className={`${TD} text-sm font-medium ${e.amount < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                                            {fmtCur(e.amount)}
                                        </td>
                                        <td className="px-6 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <ActionIconButton kind="delete" onClick={async () => {
                                                    const ok = await confirm({
                                                        title: 'Excluir lançamento?',
                                                        message: `${DEPOSIT_EVENT_LABELS[e.event_type]} de ${fmtCur(e.amount)} será removido e o saldo da caução recalculado.`,
                                                        variant: 'danger', confirmLabel: 'Excluir',
                                                    });
                                                    if (!ok) return;
                                                    await rentalGuaranteeService.removeDepositEvent(e.id);
                                                    setDeposits(prev => prev.filter(x => x.id !== e.id));
                                                }} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                <tr className="bg-gray-50">
                                    <td className={`${TD} text-sm font-medium text-gray-800`} colSpan={3}>
                                        Saldo a devolver ao locatário
                                    </td>
                                    <td className={`${TD} text-sm font-medium text-gray-800`}>{fmtCur(saldoCaucao)}</td>
                                    <td className="px-6 py-2.5"></td>
                                </tr>
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* ── Histórico de versões ──────────────────────────────────── */}
            {chain.filter(g => !g.is_active).length > 0 && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                        <History className="w-4 h-4 text-gray-400" />
                        <h3 className="font-black text-slate-800 text-lg">Histórico de garantias</h3>
                    </div>
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                <th className="px-6 py-2 border-r border-gray-100">Versão</th>
                                <th className="px-6 py-2 border-r border-gray-100">Modalidade</th>
                                <th className="px-6 py-2 border-r border-gray-100">Vigência</th>
                                <th className="px-6 py-2 border-r border-gray-100">Valor garantido</th>
                                <th className="px-6 py-2 border-r border-gray-100">Situação</th>
                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Motivo da troca</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {chain.filter(g => !g.is_active).map(g => (
                                <tr key={g.id} className="hover:bg-blue-50/50 transition-colors">
                                    <td className={`${TD} text-sm font-normal text-gray-600`}>v{g.version ?? 1}</td>
                                    <td className={`${TD} text-sm font-normal text-gray-700`}>
                                        {RENTAL_KIND_LABELS[g.kind as RentalGuaranteeKind] || g.kind}
                                    </td>
                                    <td className={`${TD} text-sm font-normal text-gray-600`}>
                                        {fmtDate(g.valid_from)} — {fmtDate(g.valid_until)}
                                    </td>
                                    <td className={`${TD} text-sm font-medium text-gray-800`}>{fmtCur(g.guaranteed_value)}</td>
                                    <td className={TD}><StatusText status={g.status} /></td>
                                    <td className={`${TD} text-sm font-normal text-gray-600`}>{g.substitution_reason || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {guarantorSheet && active && (
                <GuarantorSheet
                    organizationId={contract.organization_id}
                    guaranteeId={active.id}
                    initial={guarantorSheet === 'new' ? null : guarantorSheet}
                    onClose={() => setGuarantorSheet(null)}
                    onSaved={g => { handleGuarantorSaved(g); setGuarantorSheet(null); }}
                    onError={m => onNotify(m, 'error')}
                />
            )}

            {depositSheet && active && (
                <DepositSheet
                    guarantee={active}
                    balance={saldoCaucao}
                    onClose={() => setDepositSheet(false)}
                    onSaved={(e, refunded) => {
                        setDeposits(prev => [...prev, e]);
                        setDepositSheet(false);
                        if (refunded) void load(); // devolução muda o status da garantia
                    }}
                    onError={m => onNotify(m, 'error')}
                />
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Sheet: garantidor (UI_PATTERNS.md — painel lateral é o padrão para formulário
// secundário; modal central fica para interrupção crítica)
// ─────────────────────────────────────────────────────────────────────────────

const GuarantorSheet: React.FC<{
    organizationId: string;
    guaranteeId: string;
    initial: ContractGuarantor | null;
    onClose: () => void;
    onSaved: (g: ContractGuarantor) => void;
    onError: (msg: string) => void;
}> = ({ organizationId, guaranteeId, initial, onClose, onSaved, onError }) => {
    const [personType, setPersonType] = useState<'PF' | 'PJ'>(initial?.person_type || 'PF');
    const [name, setName] = useState(initial?.name || '');
    const [document, setDocument] = useState(initial?.document || '');
    const [email, setEmail] = useState(initial?.email || '');
    const [phone, setPhone] = useState(initial?.phone || '');
    const [maritalStatus, setMaritalStatus] = useState(initial?.marital_status || '');
    const [maritalRegime, setMaritalRegime] = useState(initial?.marital_regime || '');
    const [spouseName, setSpouseName] = useState(initial?.spouse_name || '');
    const [spouseConsent, setSpouseConsent] = useState(initial?.spouse_consent ?? false);
    const [income, setIncome] = useState(initial?.monthly_income != null ? String(initial.monthly_income) : '');
    const [netWorth, setNetWorth] = useState(initial?.net_worth != null ? String(initial.net_worth) : '');
    const [properties, setProperties] = useState(initial?.properties_offered || '');
    const [analysis, setAnalysis] = useState(initial?.analysis_result || 'PENDENTE');
    const [docsValidUntil, setDocsValidUntil] = useState(initial?.documents_valid_until || '');
    const [signed, setSigned] = useState(initial?.signed ?? false);
    const [saving, setSaving] = useState(false);

    const casado = /cas|uni[ãa]o/i.test(maritalStatus);
    const separacaoAbsoluta = /separa[çc][ãa]o absoluta/i.test(maritalRegime);
    const precisaOutorga = personType === 'PF' && casado && !separacaoAbsoluta;

    const handleSave = async () => {
        if (!name.trim()) { onError('Informe o nome do garantidor.'); return; }
        setSaving(true);
        try {
            const saved = await rentalGuaranteeService.saveGuarantor({
                id: initial?.id,
                organization_id: organizationId,
                guarantee_id: guaranteeId,
                person_type: personType,
                name: name.trim(),
                document: document || undefined,
                email: email || undefined,
                phone: phone || undefined,
                marital_status: maritalStatus || undefined,
                marital_regime: maritalRegime || undefined,
                spouse_name: spouseName || undefined,
                spouse_consent: spouseConsent,
                monthly_income: income ? parseNum(income) : undefined,
                net_worth: netWorth ? parseNum(netWorth) : undefined,
                properties_offered: properties || undefined,
                analysis_result: analysis as ContractGuarantor['analysis_result'],
                documents_valid_until: docsValidUntil || undefined,
                signed,
            });
            onSaved(saved);
        } catch (e) {
            onError(`Erro ao salvar garantidor: ${e instanceof Error ? e.message : ''}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet open onClose={onClose} size="md">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{initial ? 'Editar garantidor' : 'Novo garantidor'}</SheetTitle>
                <SheetDescription>
                    Fiador, ou titular do bem oferecido em caução.
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-6 space-y-5">
                {precisaOutorga && !spouseConsent && (
                    <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 border border-amber-100 rounded-[10px] text-sm text-amber-700">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        Salvo no regime de separação absoluta, a fiança prestada por pessoa casada
                        exige autorização do cônjuge (CC arts. 1.647 a 1.649).
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className={LABEL}>Tipo</label>
                        <select className={INPUT} value={personType}
                            onChange={e => setPersonType(e.target.value as 'PF' | 'PJ')}>
                            <option value="PF">Pessoa física</option>
                            <option value="PJ">Pessoa jurídica</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL}>{personType === 'PJ' ? 'CNPJ' : 'CPF'}</label>
                        <input type="text" className={INPUT} value={document}
                            onChange={e => setDocument(e.target.value)} />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                        <label className={LABEL}>Nome / razão social</label>
                        <input type="text" className={INPUT} value={name}
                            onChange={e => setName(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL}>E-mail</label>
                        <input type="email" className={INPUT} value={email}
                            onChange={e => setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL}>Telefone</label>
                        <input type="text" className={INPUT} value={phone}
                            onChange={e => setPhone(e.target.value)} />
                    </div>
                </div>

                {personType === 'PF' && (
                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                        <div className="space-y-1.5">
                            <label className={LABEL}>Estado civil</label>
                            <select className={INPUT} value={maritalStatus}
                                onChange={e => setMaritalStatus(e.target.value)}>
                                <option value="">Não informado</option>
                                <option value="Solteiro(a)">Solteiro(a)</option>
                                <option value="Casado(a)">Casado(a)</option>
                                <option value="União estável">União estável</option>
                                <option value="Divorciado(a)">Divorciado(a)</option>
                                <option value="Viúvo(a)">Viúvo(a)</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Regime de bens</label>
                            <select className={INPUT} value={maritalRegime}
                                onChange={e => setMaritalRegime(e.target.value)}>
                                <option value="">Não informado</option>
                                <option value="Comunhão parcial">Comunhão parcial</option>
                                <option value="Comunhão universal">Comunhão universal</option>
                                <option value="Separação absoluta">Separação absoluta</option>
                                <option value="Participação final nos aquestos">Participação final nos aquestos</option>
                            </select>
                        </div>
                        {casado && (
                            <>
                                <div className="space-y-1.5">
                                    <label className={LABEL}>Nome do cônjuge</label>
                                    <input type="text" className={INPUT} value={spouseName}
                                        onChange={e => setSpouseName(e.target.value)} />
                                </div>
                                <div className="flex items-end">
                                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer h-9">
                                        <input type="checkbox" checked={spouseConsent}
                                            onChange={e => setSpouseConsent(e.target.checked)}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                        Outorga conjugal obtida
                                    </label>
                                </div>
                            </>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                    <div className="space-y-1.5">
                        <label className={LABEL}>Renda mensal (R$)</label>
                        <input type="text" className={INPUT} value={income}
                            onChange={e => setIncome(e.target.value)} placeholder="0,00" />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL}>Patrimônio (R$)</label>
                        <input type="text" className={INPUT} value={netWorth}
                            onChange={e => setNetWorth(e.target.value)} placeholder="0,00" />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                        <label className={LABEL}>Imóveis apresentados</label>
                        <input type="text" className={INPUT} value={properties}
                            onChange={e => setProperties(e.target.value)}
                            placeholder="Matrícula, cartório, endereço" />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL}>Resultado da análise</label>
                        <select className={INPUT} value={analysis}
                            onChange={e => setAnalysis(e.target.value as typeof analysis)}>
                            <option value="PENDENTE">Pendente</option>
                            <option value="APROVADO">Aprovado</option>
                            <option value="REPROVADO">Reprovado</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL}>Documentos válidos até</label>
                        <input type="date" className={INPUT} value={docsValidUntil}
                            onChange={e => setDocsValidUntil(e.target.value)} />
                    </div>
                    <div className="col-span-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                            <input type="checkbox" checked={signed}
                                onChange={e => setSigned(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                            Assinou o instrumento de garantia
                        </label>
                    </div>
                </div>
            </SheetPanel>
            <SheetFooter>
                <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                <Button variant="primary" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Salvar
                </Button>
            </SheetFooter>
        </Sheet>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Sheet: lançamento no ledger da caução
// ─────────────────────────────────────────────────────────────────────────────

const DepositSheet: React.FC<{
    guarantee: ContractGuarantee;
    balance: number;
    onClose: () => void;
    onSaved: (e: GuaranteeDepositEvent, refunded: boolean) => void;
    onError: (msg: string) => void;
}> = ({ guarantee, balance, onClose, onSaved, onError }) => {
    const [type, setType] = useState<GuaranteeDepositEventType>('DEPOSITO');
    const [date, setDate] = useState(todayISO());
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        const valor = parseNum(amount);
        if (valor <= 0) { onError('Informe um valor maior que zero.'); return; }
        setSaving(true);
        try {
            // Devolução passa por refundDeposit: é lá que o saldo é conferido e
            // o status da garantia muda para LIBERADA/DEVOLVIDA.
            const saved = type === 'DEVOLUCAO'
                ? await rentalGuaranteeService.refundDeposit(guarantee, valor, { date, description })
                : await rentalGuaranteeService.addDepositEvent({
                    organization_id: guarantee.organization_id,
                    guarantee_id: guarantee.id,
                    event_type: type,
                    event_date: date,
                    amount: valor,
                    description: description || undefined,
                });
            onSaved(saved, type === 'DEVOLUCAO');
        } catch (e) {
            onError(`Erro ao lançar: ${e instanceof Error ? e.message : ''}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet open onClose={onClose} size="sm">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Novo lançamento na caução</SheetTitle>
                <SheetDescription>Saldo atual a devolver: {fmtCur(balance)}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-6 space-y-5">
                <div className="space-y-1.5">
                    <label className={LABEL}>Tipo</label>
                    <select className={INPUT} value={type}
                        onChange={e => setType(e.target.value as GuaranteeDepositEventType)}>
                        {(Object.keys(DEPOSIT_EVENT_LABELS) as GuaranteeDepositEventType[]).map(t => (
                            <option key={t} value={t}>{DEPOSIT_EVENT_LABELS[t]}</option>
                        ))}
                    </select>
                    <p className="text-xs text-gray-400 font-medium">
                        {type === 'DEPOSITO' || type === 'RENDIMENTO'
                            ? 'Aumenta o saldo devido ao locatário.'
                            : 'Reduz o saldo devido ao locatário.'}
                    </p>
                </div>
                <div className="space-y-1.5">
                    <label className={LABEL}>Data</label>
                    <input type="date" className={INPUT} value={date} onChange={e => setDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                    <label className={LABEL}>Valor (R$)</label>
                    <input type="text" className={INPUT} value={amount}
                        onChange={e => setAmount(e.target.value)} placeholder="0,00" />
                </div>
                <div className="space-y-1.5">
                    <label className={LABEL}>Descrição</label>
                    <input type="text" className={INPUT} value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Ex: reparo de pintura apurado na vistoria de saída" />
                </div>
            </SheetPanel>
            <SheetFooter>
                <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                <Button variant="primary" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Lançar
                </Button>
            </SheetFooter>
        </Sheet>
    );
};

export default RentalGuaranteePanel;
