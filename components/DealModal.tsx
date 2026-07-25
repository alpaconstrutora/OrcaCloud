import React, { useState, useEffect, useMemo } from 'react';
import { X, DollarSign, Calendar, FileText, Briefcase, User, Info, Building, Check, AlertCircle, TrendingUp, Maximize2, Layers, UserCheck, Percent, PenLine, ArrowLeft, Mail, Phone, MapPin, Pencil, Trash2, Plus, RefreshCw, BedDouble, Bath, DoorClosed, Car, Compass } from 'lucide-react';
import { Property, PropertyDeal, Client, Organization, PaymentInstallment, BrokerProfile, PaymentType } from '../types';
import { commercialService } from '../services/commercialService';
import { paymentTypeService } from '../services/paymentTypeService';
import {
    DEFAULT_PAYMENT_TYPES,
    labelForInstallmentType,
    intervalMonthsForType,
    sortPaymentTypes,
} from '../constants/paymentTypes';
import { clientService } from '../services/clientService';
import { organizationService } from '../services/organizationService';
import { propertyExportService } from '../services/propertyExportService';
import { projectService, ProjectData } from '../services/projectService';
import { brokerService } from '../services/brokerService';
import { commercialFinanceService } from '../services/commercialFinanceService';
import { contractService } from '../services/contractService';
import { Contract } from '../types';
import DealWorkflowBar from './DealWorkflowBar';
import { DealWorkflowStatus } from '../lib/dealWorkflow';
import DealSignaturePanel from './DealSignaturePanel';
import CreditAnalysisPanel from './CreditAnalysisPanel';
import { useConfirm } from './ui/confirm';
import { useStore } from '../store/useStore';

type TabId = 'cliente' | 'unidade' | 'pagamento' | 'partes' | 'contrato';

/** Checklist de documentos exigidos do cliente/comprador, por tipo de pessoa.
 * As chaves (`key`) são o que fica gravado em commercial_deals.doc_checklist —
 * NÃO renomear sem migração de dados. Rótulos podem mudar livremente. */
const DEAL_DOC_CHECKLIST: Record<'PF' | 'PJ', { key: string; label: string }[]> = {
    PF: [
        { key: 'rg_cnh', label: 'RG / CNH' },
        { key: 'cpf', label: 'CPF' },
        { key: 'certidao_estado_civil', label: 'Certidão de estado civil' },
        { key: 'comprovante_residencia', label: 'Comprovante de residência' },
        { key: 'declaracao_irpf', label: 'Declaração IRPF (último ano)' },
        { key: 'certidao_negativa_federal', label: 'Certidão negativa federal' },
        { key: 'comprovante_renda', label: 'Comprovante de renda (3 últimos)' },
        { key: 'extratos_bancarios', label: 'Extratos bancários (3 meses)' },
    ],
    PJ: [
        { key: 'cnpj', label: 'CNPJ' },
        { key: 'contrato_social', label: 'Contrato social ou estatuto atualizado (última alteração)' },
        { key: 'docs_socios', label: 'Documentos dos sócios/administradores' },
        { key: 'certidoes_negativas_empresa', label: 'Certidões negativas da empresa' },
        { key: 'balanco_dre_faturamento', label: 'Balanço, DRE ou faturamento' },
        { key: 'procuracao', label: 'Procuração, se houver representante' },
    ],
};

/** Tipos de Pagamento padrão do sistema, no formato de lista `PaymentType`.
 * Usado como fallback enquanto o catálogo da organização carrega. A fonte de
 * verdade agora é "Configurações → Categorias Gerais → Tipos de Pagamento"
 * (tabela `payment_types`); ver `constants/paymentTypes.ts`. Os rótulos, a
 * periodicidade do gerador e os tipos que geram série são resolvidos em runtime
 * a partir da lista carregada — SINAL/AVULSA/CHAVES continuam sendo códigos
 * tratados por literal na lógica de blocos abaixo. */
const DEFAULT_PAYMENT_TYPE_LIST: PaymentType[] = DEFAULT_PAYMENT_TYPES.map(d => ({
    id: `default-${d.code.toLowerCase()}`,
    name: d.name,
    code: d.code,
    interval_months: d.interval_months,
    generates_series: d.generates_series,
    active: true,
}));

/** Sentinela de "não alterar este campo" nos selects de edição em lote —
 * distinto de `''` (que, para Forma de Pagamento, significa limpar o campo).
 * Sem isso não dá pra abrir o modal só pra mudar o Tipo de Pagamento sem
 * também ser forçado a decidir algo pra Forma de Pagamento (e vice-versa). */
const BULK_KEEP = '__KEEP__';

/**
 * Edição em lote (Plano de Pagamento → seleção múltipla): desconto, Forma de
 * Pagamento e Tipo de Pagamento. Modelo: `components/BankTxEdicaoEmLoteModal.tsx`
 * (Financeiro → Extrato Bancário) — modal dedicado em vez de controles inline
 * na barra de seleção (guia §10).
 *
 * Desconto sempre é aplicado (setando ou removendo — igual sempre foi); Forma
 * de Pagamento e Tipo de Pagamento só são aplicados se o usuário efetivamente
 * escolher algo diferente de "Não alterar" (`BULK_KEEP`), já que nem toda
 * edição em lote quer mexer nesses dois campos.
 *
 * Desconto recalcula o valor final de cada parcela a partir da própria base
 * (originalValue ?? value), então parcelas com valores diferentes recebem o
 * desconto proporcional (%) ou o mesmo abatimento fixo (R$) corretamente.
 */
interface InstallmentLoteModalProps {
    installments: PaymentInstallment[]; // selecionadas
    installmentTypes: PaymentType[];    // catálogo Tipos de Pagamento (ordenado)
    onClose: () => void;
    onSave: (patch: {
        discountType: 'VALUE' | 'PERCENT' | null;
        discountAmount: number;
        paymentType?: PaymentInstallment['paymentType'];
        installmentType?: PaymentInstallment['installmentType'];
    }) => void;
}
const InstallmentLoteDiscountModal: React.FC<InstallmentLoteModalProps> = ({ installments, installmentTypes, onClose, onSave }) => {
    const [discountType, setDiscountType] = useState<'VALUE' | 'PERCENT' | ''>('');
    const [discountAmount, setDiscountAmount] = useState('');
    const [bulkPaymentType, setBulkPaymentType] = useState(BULK_KEEP);
    const [bulkInstallmentType, setBulkInstallmentType] = useState(BULK_KEEP);

    const totalBruto = installments.reduce((s, i) => s + (i.originalValue ?? i.value), 0);
    const amount = parseFloat(discountAmount.replace(',', '.')) || 0;
    const canSave = discountType === '' /* limpar desconto */ || amount > 0;

    const handleSave = () => {
        onSave({
            discountType: discountType || null,
            discountAmount: amount,
            paymentType: bulkPaymentType === BULK_KEEP
                ? undefined
                : ((bulkPaymentType || undefined) as PaymentInstallment['paymentType']),
            installmentType: bulkInstallmentType === BULK_KEEP
                ? undefined
                : ((bulkInstallmentType || undefined) as PaymentInstallment['installmentType']),
        });
    };

    return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-lg font-black text-gray-900">Editar Parcelas em Lote</h2>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {installments.length} parcela{installments.length !== 1 ? 's' : ''} selecionada{installments.length !== 1 ? 's' : ''} · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalBruto)} (bruto)
                        </p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                    <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Tipo de Desconto</label>
                        <select
                            value={discountType}
                            onChange={(e) => setDiscountType(e.target.value as 'VALUE' | 'PERCENT' | '')}
                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-purple-400"
                        >
                            <option value="">Remover desconto de todas</option>
                            <option value="VALUE">Desconto em R$ (mesmo valor em todas)</option>
                            <option value="PERCENT">Desconto em % (mesmo percentual em todas)</option>
                        </select>
                    </div>

                    {discountType !== '' && (
                        <div>
                            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">
                                Valor do desconto {discountType === 'PERCENT' ? '(%)' : '(R$)'}
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={discountAmount}
                                onChange={(e) => setDiscountAmount(e.target.value)}
                                placeholder={discountType === 'PERCENT' ? 'Ex: 10' : 'Ex: 100,00'}
                                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-purple-400"
                            />
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Forma de Pagamento</label>
                        <select
                            value={bulkPaymentType}
                            onChange={(e) => setBulkPaymentType(e.target.value)}
                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-purple-400"
                        >
                            <option value={BULK_KEEP}>Não alterar</option>
                            <option value="">Nenhuma (limpar de todas)</option>
                            <option value="PIX">PIX</option>
                            <option value="TED">TED</option>
                            <option value="DOC">DOC</option>
                            <option value="DINHEIRO">Dinheiro</option>
                            <option value="CHEQUE">Cheque</option>
                            <option value="PERMUTA">Permuta</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Tipo de Pagamento</label>
                        <select
                            value={bulkInstallmentType}
                            onChange={(e) => setBulkInstallmentType(e.target.value)}
                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-purple-400"
                        >
                            <option value={BULK_KEEP}>Não alterar</option>
                            <option value="">Nenhum (limpar de todas)</option>
                            {installmentTypes.map(t => (
                                <option key={t.code || t.id} value={t.code}>{t.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="bg-gray-50 rounded-2xl border border-gray-100 divide-y divide-gray-100 max-h-40 overflow-y-auto">
                        {installments.map(i => (
                            <div key={i.id} className="flex items-center justify-between px-4 py-2 text-xs">
                                <span className="text-gray-700 font-medium truncate max-w-[60%]">{i.description}</span>
                                <span className="text-gray-500 font-bold shrink-0 ml-2">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(i.originalValue ?? i.value)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="px-6 pb-6 pt-4 border-t border-gray-100 flex items-center gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-button uppercase tracking-widest hover:bg-gray-200 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!canSave}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-purple-600 text-white font-bold text-button uppercase tracking-widest hover:bg-purple-700 transition-colors disabled:opacity-40 shadow-lg shadow-purple-900/20"
                    >
                        <Check className="w-3.5 h-3.5" />
                        Aplicar
                    </button>
                </div>
            </div>
        </div>
    );
};

interface DealModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData?: Partial<PropertyDeal>;
    onSave?: () => void;
    defaultType?: 'SALE' | 'RENTAL' | 'SERVICE';
    organizationId?: string;
    /** ID do edifício selecionado — se informado, filtra o dropdown apenas para unidades filhas deste edifício */
    buildingId?: string;
}

const DealModal: React.FC<DealModalProps> = ({ isOpen, onClose, initialData, onSave, defaultType, organizationId, buildingId }) => {
    const [activeTab, setActiveTab] = useState<TabId>('cliente');
    const confirm = useConfirm();
    // Organizações do usuário — para listar corretores de TODAS elas (um corretor
    // cadastrado na Alpa Construtora aparece nas negociações das SPEs de cada
    // empreendimento), não só da org da própria negociação.
    const userOrganizations = useStore(s => s.organizations);

    const [formData, setFormData] = useState<Partial<PropertyDeal>>({
        type: defaultType || 'SALE',
        status: 'IN_NEGOTIATION',
        value: 0,
        date: new Date().toISOString().split('T')[0],
        notes: '',
        payment_method: 'CASH',
        installments: 1,
        down_payment: 0,
        down_payment_installment_type: 'SINAL',
        contract_number: '',
        organization_id: organizationId,
        broker_commission_pct: 0,
        broker_commission_value: 0,
        ...initialData
    });

    useEffect(() => {
        if (isOpen) {
            setActiveTab('cliente');
            setFormData({
                type: defaultType || 'SALE',
                status: 'IN_NEGOTIATION',
                value: 0,
                date: new Date().toISOString().split('T')[0],
                notes: '',
                payment_method: 'CASH',
                installments: 1,
                down_payment: 0,
                down_payment_installment_type: 'SINAL',
                contract_number: '',
                organization_id: organizationId,
                broker_commission_pct: 0,
                broker_commission_value: 0,
                ...initialData
            });
            setSelectedInstallmentIds(new Set());
            setLastCheckedInstallmentIndex(null);
        }
    }, [initialData, isOpen]);

    const [properties, setProperties] = useState<Property[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [projects, setProjects] = useState<ProjectData[]>([]);
    const [brokers, setBrokers] = useState<BrokerProfile[]>([]);
    const [loading, setLoading] = useState(false);
    // Aviso padrão de salvamento — mostrado dentro da própria tela "Gerenciar
    // Negociação" (tela cheia) antes de fechar, já que o toast do módulo-pai só
    // aparece depois que a tela some (o usuário não via confirmação nenhuma).
    const [savedNotice, setSavedNotice] = useState(false);
    const [org, setOrg] = useState<Organization | null>(null);

    // Catálogo de Tipos de Pagamento (Configurações → Categorias Gerais). Alimenta
    // o dropdown "Tipo Pagto." de cada parcela/Entrada, o gerador de parcelas e a
    // edição em lote. Cai nos padrões do sistema enquanto carrega (não pisca vazio).
    const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>(DEFAULT_PAYMENT_TYPE_LIST);
    const installmentTypeOptions = useMemo(
        () => sortPaymentTypes(paymentTypes.filter(t => t.active !== false)),
        [paymentTypes],
    );
    const generatorTypes = useMemo(
        () => installmentTypeOptions.filter(t => t.generates_series),
        [installmentTypeOptions],
    );
    const typeLabel = (code?: string) => labelForInstallmentType(paymentTypes, code);

    // Seleção em lote das parcelas (Plano de Pagamento) — mesmo padrão de
    // BankReconciliation.tsx (Extrato Bancário): Set de ids + âncora de
    // Shift+clique (guia §10.1) + modal dedicado de edição em lote (§10).
    const [selectedInstallmentIds, setSelectedInstallmentIds] = useState<Set<string>>(new Set());
    const [lastCheckedInstallmentIndex, setLastCheckedInstallmentIndex] = useState<number | null>(null);
    const [showInstallmentLoteModal, setShowInstallmentLoteModal] = useState(false);
    const [showGenerateModal, setShowGenerateModal] = useState(false);
    const [generateInstallmentType, setGenerateInstallmentType] = useState<NonNullable<PaymentInstallment['installmentType']>>('MENSAL');
    const [generateInstallmentCount, setGenerateInstallmentCount] = useState(1);
    const [generateFirstDueDate, setGenerateFirstDueDate] = useState('');
    const [showAddAdhocModal, setShowAddAdhocModal] = useState(false);
    const [adhocPosition, setAdhocPosition] = useState(1);
    const [adhocDate, setAdhocDate] = useState('');
    const [adhocValue, setAdhocValue] = useState('');
    const [showRecalcModal, setShowRecalcModal] = useState(false);
    const [recalcSelectedTypes, setRecalcSelectedTypes] = useState<Set<NonNullable<PaymentInstallment['installmentType']>>>(new Set());

    const handleInstallmentRowCheck = (id: string, index: number, checked: boolean, shiftKey: boolean) => {
        const rows = formData.custom_installments || [];
        if (shiftKey && lastCheckedInstallmentIndex !== null) {
            const [start, end] = lastCheckedInstallmentIndex < index ? [lastCheckedInstallmentIndex, index] : [index, lastCheckedInstallmentIndex];
            const rangeIds = rows.slice(start, end + 1).map(i => i.id);
            setSelectedInstallmentIds(prev => new Set([...prev, ...rangeIds]));
        } else {
            setSelectedInstallmentIds(prev => {
                const next = new Set(prev);
                if (checked) next.add(id); else next.delete(id);
                return next;
            });
            setLastCheckedInstallmentIndex(index);
        }
    };

    /** Aplica em lote às parcelas selecionadas: desconto (sempre — setando ou
     * removendo, igual sempre foi, recalculando o valor final de cada uma a
     * partir da própria base) e, se informados, Forma de Pagamento e/ou Tipo
     * de Pagamento (só quando o usuário escolheu algo além de "Não alterar"
     * no modal — `undefined` aqui significa "não mexe nesse campo"). */
    const applyBulkInstallmentEdit = (patch: {
        discountType: 'VALUE' | 'PERCENT' | null;
        discountAmount: number;
        paymentType?: PaymentInstallment['paymentType'];
        installmentType?: PaymentInstallment['installmentType'];
    }) => {
        setFormData(prev => {
            const insts = (prev.custom_installments || []).map(inst => {
                if (!selectedInstallmentIds.has(inst.id)) return inst;
                const base = inst.originalValue ?? inst.value;
                let finalValue = base;
                if (patch.discountType === 'PERCENT') finalValue = base - (base * patch.discountAmount / 100);
                else if (patch.discountType === 'VALUE') finalValue = base - patch.discountAmount;
                finalValue = Math.max(0, finalValue);
                const updated: PaymentInstallment = {
                    ...inst,
                    originalValue: base,
                    discountType: patch.discountType ?? undefined,
                    discountAmount: patch.discountType ? patch.discountAmount : undefined,
                    value: Number(finalValue.toFixed(2)),
                };
                if (patch.paymentType !== undefined) updated.paymentType = patch.paymentType || undefined;
                if (patch.installmentType !== undefined) updated.installmentType = patch.installmentType || undefined;
                return updated;
            });
            return { ...prev, custom_installments: insts };
        });
        setShowInstallmentLoteModal(false);
        setSelectedInstallmentIds(new Set());
    };

    // Ponte Negociação → Contrato formal. Venda (domain='VENDAS') gera um contrato
    // de compra e venda; Locação (domain='LOCACAO') gera um contrato recorrente.
    const [linkedContract, setLinkedContract] = useState<Contract | null>(null);
    const [generatingContract, setGeneratingContract] = useState(false);
    const [contractError, setContractError] = useState<string | null>(null);

    // Quem tem ponte para contrato formal: Venda e Locação (Serviço não).
    const canGenerateContract = formData.type === 'SALE' || formData.type === 'RENTAL';

    // Ao abrir uma negociação de venda/locação já salva, verifica se já há contrato gerado
    useEffect(() => {
        setLinkedContract(null);
        setContractError(null);
        if (isOpen && formData.id && canGenerateContract) {
            contractService.getContractByDealId(formData.id)
                .then(setLinkedContract)
                .catch(err => console.error('[DealModal] Erro ao buscar contrato da negociação:', err));
        }
    }, [isOpen, formData.id, formData.type]);

    // Ao abrir uma negociação já salva, reconstrói o Plano de Pagamento a partir
    // do cofre financeiro (Gestão Comercial) — custom_installments NUNCA é coluna
    // de commercial_deals (removido antes do insert/update, ver
    // commercialService.saveDeal), só sobrevive materializado no cofre. Sem isto,
    // reabrir a negociação sempre mostrava o plano vazio mesmo com parcelas já
    // geradas e salvas — "as parcelas somem" ao sair e voltar.
    useEffect(() => {
        if (!isOpen || !formData.id) return;
        const orgId = formData.organization_id || organizationId;
        if (!orgId) return;
        let active = true;
        commercialFinanceService.getDealInstallments(formData.id, orgId)
            .then(insts => {
                if (active && insts.length > 0) {
                    // Não sobrescreve se já houver algo em edição (ex: efeito refirou
                    // depois que o usuário já gerou/editou parcelas nesta sessão).
                    setFormData(prev => (prev.custom_installments?.length ? prev : { ...prev, custom_installments: insts }));
                }
            })
            .catch(err => console.error('[DealModal] Erro ao recuperar parcelas do cofre:', err));
        return () => { active = false; };
    }, [isOpen, formData.id]);

    const handleGenerateContract = async () => {
        if (!formData.id) return;
        const isRental = formData.type === 'RENTAL';
        if (!formData.client_id) { setContractError(`Selecione o ${isRental ? 'locatário' : 'comprador'} antes de gerar o contrato.`); return; }
        setGeneratingContract(true);
        setContractError(null);
        try {
            const contract = await contractService.createFromDeal({
                id: formData.id,
                organization_id: formData.organization_id || organizationId,
                client_id: formData.client_id,
                property_id: formData.property_id,
                value: formData.value || 0,
                date: formData.date,
                contract_number: formData.contract_number,
                notes: formData.notes,
                payment_method: formData.payment_method,
                installments: formData.installments,
                status: formData.status,
                signature_status: formData.signature_status,
                signature_url: formData.signature_url,
                signed_contract_url: formData.signed_contract_url,
                // Locação: alimenta recorrência/reajuste do contrato
                payment_due_date: formData.payment_due_date,
            }, isRental ? 'LOCACAO' : 'VENDAS');
            setLinkedContract(contract);
        } catch (err: any) {
            console.error('[DealModal] Erro ao gerar contrato:', err);
            setContractError(err?.message || 'Erro ao gerar contrato.');
        } finally {
            setGeneratingContract(false);
        }
    };

    useEffect(() => {
        const load = async () => {
            try {
                const [allProps, c, o, projs] = await Promise.all([
                    commercialService.listProperties(),
                    clientService.listClients(),
                    organizationService.listOrganizations(),
                    projectService.listProjects()
                ]);

                const negotiableProps = buildingId
                    ? allProps.filter(p => p.parent_id === buildingId)
                    : allProps.filter(p => p.type !== 'BUILDING');

                setProperties(negotiableProps);
                setClients(c);
                setProjects(projs.map(proj => ({ ...proj, budget: [] })));
                if (o && o.length > 0) {
                    setOrg(o[0]);
                    if (!formData.id && !formData.organization_id) {
                        setFormData(prev => ({ ...prev, organization_id: o[0].id }));
                    }
                    // Corretores de TODAS as organizações do usuário — não só a da
                    // negociação. Um empreendimento vira uma org-SPE própria (ex:
                    // "Garden Cambuhy SPE"), mas os corretores costumam estar
                    // cadastrados na org do grupo (ex: "Alpa Construtora"); filtrar só
                    // pela org da negociação (a SPE) deixava o dropdown vazio. A RLS de
                    // broker_profiles (is_org_member) já garante que só vêm corretores
                    // das orgs que o usuário participa. Fallback para a org da própria
                    // negociação se a lista de orgs do store ainda não carregou.
                    const orgIdsForBrokers = userOrganizations.length > 0
                        ? userOrganizations.map(org => org.id)
                        : (initialData?.organization_id || organizationId);
                    const brokerData = await brokerService.listProfiles(orgIdsForBrokers);
                    setBrokers(brokerData);
                }
            } catch (err) {
                console.error('Error loading DealModal data:', err);
            }
        };
        if (isOpen) load();
    }, [isOpen, buildingId, userOrganizations.length]);

    // Catálogo de Tipos de Pagamento da org da negociação (REGRA #5: sem org,
    // o service devolve os padrão + o que a RLS liberar; nunca bloqueia a leitura).
    useEffect(() => {
        if (!isOpen) return;
        const dealOrgId = formData.organization_id || organizationId || undefined;
        let cancelled = false;
        paymentTypeService.listTypes(dealOrgId)
            .then(list => { if (!cancelled && list.length) setPaymentTypes(list); })
            .catch(err => console.error('[DealModal] Erro ao carregar tipos de pagamento:', err));
        return () => { cancelled = true; };
    }, [isOpen, formData.organization_id, organizationId]);

    const selectedProperty = properties.find(p => p.id === formData.property_id);
    const selectedClient = clients.find(c => c.id === formData.client_id);
    const selectedBroker = brokers.find(b => b.id === formData.broker_id);

    // Um mesmo corretor cadastrado como fornecedor "em todas as organizações"
    // é materializado em broker_profiles UMA vez por org (syncRealEstateBrokerProfiles
    // roda para cada org do usuário). Como a negociação lista corretores de todas as
    // orgs, o mesmo corretor aparecia 2, 3 vezes no dropdown. Deduplica por
    // identidade real do corretor (e-mail → CPF → nome+agência), mantendo o primeiro
    // registro. Se o corretor já selecionado tiver sido "engolido" pela dedup, mantém
    // sua linha para não zerar a seleção salva.
    const uniqueBrokers = useMemo(() => {
        const seen = new Set<string>();
        const list: BrokerProfile[] = [];
        for (const b of brokers) {
            const key = (b.email || '').trim().toLowerCase()
                || (b.cpf || '').replace(/\D/g, '')
                || `${(b.name || '').trim().toLowerCase()}|${(b.agency_name || '').trim().toLowerCase()}`;
            if (key && seen.has(key)) continue;
            if (key) seen.add(key);
            list.push(b);
        }
        if (formData.broker_id && !list.some(b => b.id === formData.broker_id)) {
            const current = brokers.find(b => b.id === formData.broker_id);
            if (current) list.push(current);
        }
        return list;
    }, [brokers, formData.broker_id]);

    // Linhas de endereço do cliente selecionado — conferência antes de emitir
    // contrato (aba "Dados do Cliente"). Mesma convenção de exibição de
    // ClientList.tsx: campos vazios não geram vírgula/traço solto.
    const clientAddressLine1 = [selectedClient?.address, selectedClient?.address_number].filter(Boolean).join(', ');
    const clientAddressLine2 = [
        selectedClient?.neighborhood,
        [selectedClient?.city, selectedClient?.state].filter(Boolean).join('/'),
        selectedClient?.zip_code ? `CEP ${selectedClient.zip_code}` : '',
    ].filter(Boolean).join(' — ');

    const recalcCommission = (value: number, pct: number) => +(value * (pct / 100)).toFixed(2);

    /** Abre o modal de Gerar Parcelas — a checagem de parcelas pagas e a geração
     * de fato acontecem só ao confirmar (handleConfirmGenerateInstallments),
     * depois de escolher o Tipo de Pagamento (periodicidade), o Nº de Parcelas
     * e a Data do 1º Pagamento lá dentro. Nº de Parcelas parte do valor já
     * salvo em formData.installments; a data sugerida é a mesma que o campo
     * "Data do 1º Pagamento" da aba já usa hoje (ou a Data Efetiva, se aquele
     * campo nunca foi preenchido) — ambos só são atualizados de fato ao
     * confirmar a geração. */
    const handleOpenGenerateModal = () => {
        setGenerateInstallmentType('MENSAL');
        setGenerateInstallmentCount(Math.max(1, Math.floor(Number(formData.installments) || 1)));
        setGenerateFirstDueDate(formData.payment_due_date || formData.date || new Date().toISOString().split('T')[0]);
        setShowGenerateModal(true);
    };

    const handleConfirmGenerateInstallments = async (installmentType: NonNullable<PaymentInstallment['installmentType']>, installmentCount: number, firstDueDate: string) => {
        if (formData.id) {
            setLoading(true);
            try {
                const orgId = formData.organization_id || organizationId || '';
                const { hasPaid, paidCount } = await commercialFinanceService.hasPaidInstallments(formData.id, orgId);
                if (hasPaid) {
                    alert(`Não é possível regerar as parcelas. Esta negociação possui ${paidCount} parcela(s) com status "PAGO" no módulo financeiro. Para habilitar a regeração, você deve primeiro reverter o status dessas parcelas para "PENDENTE" no financeiro.`);
                    setLoading(false);
                    return;
                }
            } catch (err) {
                console.error('[DealModal] Error checking paid installments:', err);
            } finally {
                setLoading(false);
            }
        }

        // Um Plano de Pagamento pode combinar vários Tipos ao mesmo tempo (10
        // mensais + 3 semestrais, por exemplo). Gerar Parcelas SUBSTITUI só o
        // BLOCO do Tipo escolhido (cria se não existir, resubstitui se já
        // existir) — os demais tipos ficam intactos. Parcelas Avulsas nunca
        // entram no rateio nem são tocadas aqui (são criadas uma a uma via
        // handleConfirmAddAdhocInstallment).
        //
        // Como todos os blocos regulares (mensal+trimestral+semestral+anual)
        // dividem o MESMO total (Valor − Entrada − Avulsas), acrescentar ou
        // resubstituir um bloco muda quantas parcelas dividem esse total —
        // por isso os blocos preservados são recalculados junto (mesmo valor
        // por parcela em todos, só a última parcela do bloco recém-gerado
        // absorve o resto do arredondamento).
        const intervalMonths = intervalMonthsForType(paymentTypes, installmentType);
        const count = Math.max(1, Math.floor(Number(installmentCount) || 1));

        setFormData(prev => {
            const allExisting = prev.custom_installments || [];
            const adhoc = allExisting.filter(i => i.installmentType === 'AVULSA');
            // Uma parcela pertence ao BLOCO-ALVO (será substituída pelas novas)
            // quando é do tipo escolhido OU quando é legada/sem tipo (installmentType
            // nulo — deals antigos e parcelas semeadas pelo espelho de Locações).
            // Sem tratar o caso sem-tipo aqui, elas caíam em otherBlocks e eram
            // PRESERVADAS: gerar 36 mensais sobre 36 sem-tipo resultava em 72.
            const isTargetGroup = (i: PaymentInstallment) =>
                i.installmentType === installmentType || !i.installmentType;
            // Blocos de OUTROS tipos — preservados (data/id/desconto/forma de
            // pagamento/observação mantidos), só o valor é recalculado abaixo.
            const otherBlocks = allExisting.filter(i => i.installmentType !== 'AVULSA' && !isTargetGroup(i));

            const downPayment = prev.down_payment || 0;
            const baseValue = prev.value || 0;
            const adhocTotal = adhoc.reduce((sum, i) => sum + (i.originalValue ?? i.value), 0);
            const total = Math.max(0, baseValue - downPayment - adhocTotal);
            const totalRegularCount = otherBlocks.length + count;
            // Rateio igual com centavos exatos: todas as parcelas regulares (de
            // TODOS os tipos combinados) recebem `per`; a última parcela do
            // bloco recém-gerado absorve o resto do arredondamento, para a soma
            // bater exatamente com `total`.
            const per = Math.floor((total / totalRegularCount) * 100) / 100;
            const remainder = Number((total - per * totalRegularCount).toFixed(2));

            // Recalcula os blocos preservados com a nova base — reaplicando o
            // desconto de cada parcela (se houver), igual a updateInstallmentDiscount.
            const recalculatedOtherBlocks = otherBlocks.map(inst => {
                const discType = inst.discountType;
                const discAmt = inst.discountAmount || 0;
                let finalValue = per;
                if (discType === 'PERCENT') finalValue = per - (per * discAmt / 100);
                else if (discType === 'VALUE') finalValue = per - discAmt;
                return { ...inst, originalValue: per, value: Number(Math.max(0, finalValue).toFixed(2)) };
            });

            const stamp = Date.now();
            const newBlock: PaymentInstallment[] = [];
            for (let i = 1; i <= count; i++) {
                const isLast = i === count;
                const value = isLast ? Number((per + remainder).toFixed(2)) : per;

                // firstDueDate ancora a parcela 1 (vem do campo "Data do 1º Pagamento"
                // do modal — sugerida pelo sistema, mas o usuário pode ter trocado); as
                // demais somam o intervalo do Tipo de Pagamento a partir dela. Meio-dia
                // UTC evita o bug de fuso que retrocede 1 dia em UTC-3.
                const date = new Date(firstDueDate + 'T12:00:00Z');
                date.setUTCMonth(date.getUTCMonth() + (i - 1) * intervalMonths);
                newBlock.push({
                    id: `temp-${stamp}-${i}`,
                    description: `Parcela ${i}/${count}`,
                    dueDate: date.toISOString().split('T')[0],
                    value,
                    status: 'PENDING',
                    dealId: prev.id,
                    installmentType
                });
            }
            // Recompõe preservando a ORDEM ORIGINAL do array — Avulsas e outros
            // tipos ficam exatamente na posição em que já estavam (uma Avulsa
            // inserida como "Parcela 1" continua sendo a 1ª depois de gerar outro
            // tipo, não pula pro fim da lista). O bloco do tipo-alvo entra no
            // lugar onde já aparecia (1ª ocorrência antiga); se o tipo nunca
            // existiu, é anexado ao fim, por falta de posição de referência.
            const recalculatedOtherById = new Map(recalculatedOtherBlocks.map(inst => [inst.id, inst]));
            let targetInserted = false;
            const merged: PaymentInstallment[] = [];
            for (const inst of allExisting) {
                // Avulsas ficam intactas na posição original.
                if (inst.installmentType === 'AVULSA') { merged.push(inst); continue; }
                // Bloco-alvo (tipo escolhido OU legado sem tipo) → substituído de
                // uma vez na 1ª ocorrência; as demais ocorrências são descartadas.
                if (isTargetGroup(inst)) {
                    if (!targetInserted) {
                        merged.push(...newBlock);
                        targetInserted = true;
                    }
                    continue;
                }
                merged.push(recalculatedOtherById.get(inst.id) ?? inst);
            }
            if (!targetInserted) merged.push(...newBlock);

            return {
                ...prev,
                installments: totalRegularCount,
                payment_due_date: firstDueDate,
                custom_installments: merged
            };
        });
        // Cronograma novo → limpa qualquer seleção de parcela (os ids mudaram).
        setSelectedInstallmentIds(new Set());
        setLastCheckedInstallmentIndex(null);
        setShowGenerateModal(false);
    };

    /** Abre o modal de Parcela Avulsa. Posição parte do fim da lista atual
     * (append) por padrão — o usuário escolhe outra posição (ex: "Parcela 1")
     * se quiser inserir a avulsa no meio do cronograma. */
    const handleOpenAddAdhocModal = () => {
        const total = formData.custom_installments?.length ?? 0;
        setAdhocPosition(total + 1);
        setAdhocDate(new Date().toISOString().split('T')[0]);
        setAdhocValue('');
        setShowAddAdhocModal(true);
    };

    /** Insere UMA parcela avulsa na posição escolhida — as demais parcelas não
     * têm data/valor/desconto alterados, só a posição delas na lista muda (o
     * número "Parcela N" exibido em cada linha é a própria posição no array,
     * então "atualiza" sozinho ao inserir no meio). Fora da série regular:
     * não entra no rateio do gerador nem é afetada por ele (handleConfirm
     * GenerateInstallments filtra installmentType==='AVULSA' à parte). */
    const handleConfirmAddAdhocInstallment = () => {
        setFormData(prev => {
            const existing = prev.custom_installments || [];
            const insertAt = Math.min(Math.max(1, Math.floor(adhocPosition) || 1), existing.length + 1) - 1;
            const newInst: PaymentInstallment = {
                id: `temp-${Date.now()}-avulsa`,
                description: `Parcela Avulsa (posição ${insertAt + 1})`,
                dueDate: adhocDate || new Date().toISOString().split('T')[0],
                value: parseFloat(adhocValue) || 0,
                status: 'PENDING',
                dealId: prev.id,
                installmentType: 'AVULSA'
            };
            const updated = [...existing];
            updated.splice(insertAt, 0, newInst);
            return { ...prev, custom_installments: updated };
        });
        setShowAddAdhocModal(false);
    };

    /** Abre o modal de Recalcular com nenhum tipo pré-selecionado — o usuário
     * escolhe quais tipos absorvem o ajuste (ex: acrescentou uma Avulsa depois
     * do plano já fechado e agora a soma passou do Valor Total; recalcular as
     * mensais redistribui a diferença só nelas, sem tocar Entrada/Avulsas/
     * outros tipos). */
    const handleOpenRecalcModal = () => {
        setRecalcSelectedTypes(new Set());
        setShowRecalcModal(true);
    };

    const handleToggleRecalcType = (type: NonNullable<PaymentInstallment['installmentType']>) => {
        setRecalcSelectedTypes(prev => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type); else next.add(type);
            return next;
        });
    };

    /**
     * Recalcula só o VALOR das parcelas dos tipos marcados — não mexe em data,
     * id, forma de pagamento ou observação, e não cria/remove parcela nenhuma
     * (isso é papel de Gerar Parcelas / Parcela Avulsa). Entrada, Avulsas e
     * qualquer tipo NÃO marcado são tratados como fixos: seus valores atuais
     * saem do Valor Total antes de dividir o restante pelas parcelas marcadas.
     *
     *   pool = Valor Total − Entrada − (Avulsas + tipos não marcados)
     *   valor por parcela marcada = pool / nº de parcelas marcadas
     *
     * A última parcela marcada absorve o resto do arredondamento, igual ao
     * rateio de Gerar Parcelas — e reaplica desconto já existente na parcela,
     * igual a updateInstallmentDiscount.
     */
    const handleConfirmRecalc = () => {
        if (recalcSelectedTypes.size === 0) return;
        setFormData(prev => {
            const existing = prev.custom_installments || [];
            const selectedRows = existing.filter(i => i.installmentType && recalcSelectedTypes.has(i.installmentType));
            if (selectedRows.length === 0) return prev;

            const fixedTotal = existing
                .filter(i => !(i.installmentType && recalcSelectedTypes.has(i.installmentType)))
                .reduce((sum, i) => sum + (i.originalValue ?? i.value), 0);

            const downPayment = prev.down_payment || 0;
            const baseValue = prev.value || 0;
            const pool = Math.max(0, baseValue - downPayment - fixedTotal);
            const per = Math.floor((pool / selectedRows.length) * 100) / 100;
            const remainder = Number((pool - per * selectedRows.length).toFixed(2));

            let seen = 0;
            const updated = existing.map(inst => {
                if (!inst.installmentType || !recalcSelectedTypes.has(inst.installmentType)) return inst;
                seen++;
                const isLast = seen === selectedRows.length;
                const base = isLast ? Number((per + remainder).toFixed(2)) : per;
                const discType = inst.discountType;
                const discAmt = inst.discountAmount || 0;
                let finalValue = base;
                if (discType === 'PERCENT') finalValue = base - (base * discAmt / 100);
                else if (discType === 'VALUE') finalValue = base - discAmt;
                return { ...inst, originalValue: base, value: Number(Math.max(0, finalValue).toFixed(2)) };
            });

            return { ...prev, custom_installments: updated };
        });
        setShowRecalcModal(false);
    };

    const handleRemoveInstallment = (id: string) => {
        setFormData(prev => ({
            ...prev,
            custom_installments: (prev.custom_installments || []).filter(i => i.id !== id)
        }));
        setSelectedInstallmentIds(prev => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    /**
     * Recalcula o valor final da parcela a partir do valor bruto + desconto
     * (R$ ou %). `value` continua sendo o que materializa em Contas a Receber
     * — editar o valor bruto, o tipo de desconto ou o valor do desconto sempre
     * recalcula `value` a partir da base (`originalValue`), nunca deixando os
     * dois soltos e fora de sincronia.
     */
    const updateInstallmentDiscount = (
        index: number,
        patch: Partial<Pick<PaymentInstallment, 'originalValue' | 'discountType' | 'discountAmount'>>
    ) => {
        setFormData(prev => {
            const insts = [...(prev.custom_installments || [])];
            const inst = insts[index];
            const merged = { ...inst, ...patch };
            const base = merged.originalValue ?? inst.value;
            const discType = merged.discountType;
            const discAmt = merged.discountAmount || 0;
            let finalValue = base;
            if (discType === 'PERCENT') finalValue = base - (base * discAmt / 100);
            else if (discType === 'VALUE') finalValue = base - discAmt;
            finalValue = Math.max(0, finalValue);
            insts[index] = { ...merged, originalValue: base, value: Number(finalValue.toFixed(2)) };
            return { ...prev, custom_installments: insts };
        });
    };

    /**
     * Handler do campo "Data do 1º Pagamento". Se já existem parcelas geradas
     * (custom_installments), muda-la sozinha deixaria a data e o cronograma
     * dessincronizados — pergunta antes de recalcular os vencimentos (mantendo
     * os valores). A gravação em Contas a Receber só acontece ao Salvar.
     */
    const handlePaymentDueDateChange = async (newDate: string) => {
        const hasGenerated = (formData.custom_installments?.length ?? 0) > 0;
        if (hasGenerated && newDate && newDate !== formData.payment_due_date) {
            const ok = await confirm({
                title: 'Atualizar datas das parcelas?',
                message: (
                    <>
                        As parcelas já foram geradas. Deseja recalcular o vencimento de cada
                        uma a partir da nova Data do 1º Pagamento (os valores não mudam)?
                        <p className="mt-2 text-xs text-gray-500">
                            A mudança só é gravada em Contas a Receber ao clicar em "Salvar Alterações".
                        </p>
                    </>
                ),
                variant: 'warning',
                confirmLabel: 'Recalcular parcelas',
            });
            if (ok) {
                setFormData(prev => {
                    const recalced = (prev.custom_installments || []).map((inst, idx) => {
                        const d = new Date(newDate + 'T12:00:00Z');
                        d.setUTCMonth(d.getUTCMonth() + idx);
                        return { ...inst, dueDate: d.toISOString().split('T')[0] };
                    });
                    return { ...prev, payment_due_date: newDate, custom_installments: recalced };
                });
                return;
            }
        }
        setFormData(prev => ({ ...prev, payment_due_date: newDate }));
    };

    const handleExportPDF = () => {
        if (!selectedProperty) {
            alert('Selecione um imóvel antes de exportar.');
            return;
        }
        propertyExportService.generateProposalPDF(formData as PropertyDeal, selectedProperty, selectedClient, org);
    };

    const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
        if (e) e.preventDefault();

        if (!formData.property_id || !formData.client_id) {
            setActiveTab(!formData.property_id ? 'unidade' : 'cliente');
            alert('Por favor, selecione o imóvel e o cliente para continuar.');
            return;
        }

        if (formData.value === 0) {
            const ok = await confirm({
                title: 'Valor zerado',
                message: 'O valor da negociação está zerado. Deseja continuar assim mesmo?',
                variant: 'warning',
                confirmLabel: 'Continuar',
            });
            if (!ok) return;
        }

        setLoading(true);
        console.log('[DealModal] Tentando salvar negociação:', formData);

        try {
            const payload = {
                ...formData,
                organization_id: formData.organization_id || organizationId || org?.id || (initialData as any)?.organization_id
            };

            if (!payload.organization_id) {
                console.error('[DealModal] ERRO: organization_id ausente no payload');
                alert('Erro: Organização não identificada. Por favor, recarregue a página.');
                setLoading(false);
                return;
            }

            const savedDeal = await commercialService.saveDeal(payload);
            console.log('[DealModal] Negociação salva com sucesso:', savedDeal);

            // Emite o aviso padrão de salvamento e dá um instante para o usuário
            // vê-lo dentro da tela antes de propagar/fechar.
            setSavedNotice(true);
            await new Promise(resolve => setTimeout(resolve, 900));

            if (onSave) onSave();
            onClose();
        } catch (err: any) {
            console.error('[DealModal] Erro ao salvar:', err);
            alert(`Erro ao salvar negociação: ${err.message || 'Erro de conexão/banco'}`);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    // "Gerenciar Negociação" (registro já existente) vira tela cheia — mesmo padrão
    // de conversão do ProjectModal (modo edit): sem backdrop/dim, seta "voltar" no
    // lugar do X. "Nova Negociação Comercial" (criação simples) continua modal.
    const isEditMode = !!formData.id;

    // Antes um único hasMissingRequired cobria os dois campos na mesma aba;
    // divididos agora que cada um vive na sua própria aba, aponta exatamente
    // onde falta o dado (badge por aba, não mais genérico).
    const hasMissingClient = !formData.client_id;
    const hasMissingProperty = !formData.property_id;
    const hasBroker = !!formData.broker_id;
    const hasContratoContent = formData.id && (
        ['WAITING_PAYMENT', 'CONTRATO', 'ASSINATURA'].includes(formData.status || '') ||
        formData.contract_number
    );

    const tabs: { id: TabId; label: string; icon: React.ReactNode; badge?: boolean }[] = [
        {
            id: 'cliente',
            label: 'Dados do Cliente',
            icon: <User className="w-4 h-4" />,
            badge: hasMissingClient
        },
        {
            id: 'unidade',
            label: 'Dados da Unidade',
            icon: <Building className="w-4 h-4" />,
            badge: hasMissingProperty
        },
        {
            id: 'pagamento',
            label: 'Forma de Pagamento',
            icon: <DollarSign className="w-4 h-4" />,
        },
        {
            id: 'partes',
            label: 'Partes e Comissões',
            icon: <UserCheck className="w-4 h-4" />,
            badge: hasBroker
        },
        {
            id: 'contrato',
            label: 'Contrato e Assinatura',
            icon: <PenLine className="w-4 h-4" />,
            badge: !!hasContratoContent
        },
    ];

    // `absolute` (não `fixed`): Layout.tsx tem <main className="relative"> abaixo da
    // barra superior sticky (irmã do main, não ancestral) — absolute preenche só a
    // área de conteúdo, deixando a barra visível. `fixed` ignora esse container e
    // cobre a janela inteira, escondendo a navegação do app.
    return (
        <div className={isEditMode ? 'absolute inset-0 z-[110] bg-white flex flex-col' : 'absolute inset-0 z-[110] flex items-center justify-center p-8'}>
            {!isEditMode && (
                <div className="absolute inset-0 bg-[#0B1727]/80 backdrop-blur-xl animate-in fade-in duration-300" onClick={onClose} />
            )}

            <div className={isEditMode
                ? 'relative bg-white w-full h-full overflow-hidden flex flex-col animate-in fade-in duration-300'
                : 'relative bg-white w-full h-full overflow-hidden rounded-[2.5rem] shadow-2xl border border-white/20 animate-in zoom-in-95 duration-300 flex flex-col'
            }>

                {/* Header */}
                <div className="px-8 py-5 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-6 flex-1">
                        <div className="flex flex-col items-center gap-1.5 shrink-0">
                            <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-100 ring-2 ring-white">
                                <Briefcase className="w-6 h-6 text-white" />
                            </div>
                            <div className="text-xs font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 shadow-sm uppercase tracking-tighter">
                                {formData.type === 'SALE' ? 'VENDA' : formData.type === 'RENTAL' ? 'ALUGUEL' : 'SERVIÇO'}
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-3">
                                <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                                    {formData.id ? 'Gerenciar Negociação' : 'Nova Negociação Comercial'}
                                </h2>
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white rounded-md border border-gray-100 shadow-sm">
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Status:</span>
                                    <span className={`text-xs font-black uppercase ${formData.status === 'COMPLETED' ? 'text-green-600' :
                                        formData.status === 'CANCELLED' ? 'text-red-500' : 'text-purple-600'
                                        }`}>
                                        {formData.status?.replace('_', ' ')}
                                    </span>
                                </div>
                            </div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] truncate max-w-xl">
                                {selectedProperty ? `${selectedProperty.name} • ${selectedProperty.address}` : 'Registro de Ativo Imobiliário'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-8 shrink-0">
                        <div className="text-right">
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">Tipo de Acordo</p>
                            <div className="flex items-center gap-2 justify-end">
                                <TrendingUp className="w-4 h-4 text-purple-400" />
                                <span className="text-lg font-black text-purple-600 uppercase tracking-tighter">
                                    {formData.type === 'SALE' ? 'Venda Direta' : formData.type === 'RENTAL' ? 'Contrato Locação' : 'Prestação de Serviço'}
                                </span>
                            </div>
                        </div>
                        <div className="h-10 w-px bg-gray-200" />
                        <div className="text-right">
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">Valor Total</p>
                            <div className="flex items-baseline gap-1 text-purple-600">
                                <span className="text-xs font-bold font-mono">R$</span>
                                <span className="text-3xl font-black">{new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(formData.value || 0)}</span>
                            </div>
                        </div>
                        {(formData.broker_commission_value || 0) > 0 && (
                            <>
                                <div className="h-10 w-px bg-gray-200" />
                                <div className="text-right">
                                    <p className="text-xs font-black text-amber-500 uppercase tracking-widest mb-1 leading-none">Comissão Corretor</p>
                                    <div className="flex items-baseline gap-1 text-amber-600">
                                        <span className="text-xs font-bold font-mono">R$</span>
                                        <span className="text-xl font-black">{new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(formData.broker_commission_value || 0)}</span>
                                    </div>
                                </div>
                            </>
                        )}
                        {isEditMode ? (
                            <button type="button" onClick={onClose} className="w-12 h-12 bg-white text-gray-400 rounded-xl flex items-center justify-center hover:text-blue-600 hover:border-blue-100 transition-all border border-gray-100 shadow-sm group">
                                <ArrowLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
                            </button>
                        ) : (
                            <button type="button" onClick={onClose} className="w-12 h-12 bg-white text-gray-400 rounded-xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all border border-gray-100 shadow-sm group">
                                <X className="w-6 h-6 group-hover:rotate-90 transition-transform" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Tab Bar */}
                <div className="px-8 pt-4 pb-0 bg-white border-b border-gray-100 shrink-0">
                    <div className="flex gap-1">
                        {tabs.map((tab) => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`relative flex items-center gap-2 px-5 py-3 text-button font-black uppercase tracking-widest rounded-t-xl transition-all border-b-2 ${
                                        isActive
                                            ? 'text-purple-600 bg-purple-50/60 border-purple-600'
                                            : 'text-gray-400 bg-transparent border-transparent hover:text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    {tab.icon}
                                    {tab.label}
                                    {tab.badge && tab.id === 'cliente' && hasMissingClient && (
                                        <span className="w-2 h-2 rounded-full bg-red-400 absolute top-2 right-2" />
                                    )}
                                    {tab.badge && tab.id === 'unidade' && hasMissingProperty && (
                                        <span className="w-2 h-2 rounded-full bg-red-400 absolute top-2 right-2" />
                                    )}
                                    {tab.badge && tab.id === 'partes' && hasBroker && (
                                        <span className="w-2 h-2 rounded-full bg-amber-400 absolute top-2 right-2" />
                                    )}
                                    {tab.badge && tab.id === 'contrato' && hasContratoContent && (
                                        <span className="w-2 h-2 rounded-full bg-purple-400 absolute top-2 right-2" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Form content */}
                <form
                    id="deal-modal-form"
                    onSubmit={handleSubmit}
                    className="flex-1 overflow-y-auto p-8"
                >
                    {/* ══════════════════════════════════════════
                        ABA 1 — DADOS DO CLIENTE
                    ══════════════════════════════════════════ */}
                    {activeTab === 'cliente' && (
                        <div className="max-w-2xl space-y-8">
                            {/* Cliente */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-purple-600">
                                    <User className="w-5 h-5" />
                                    <h3 className="font-black uppercase tracking-widest text-xs">Cliente / Comprador</h3>
                                    <span className="text-xs font-semibold text-red-500">Obrigatório</span>
                                </div>
                                <select
                                    required
                                    value={formData.client_id || ''}
                                    onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                                    className="w-full px-8 py-5 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-3xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner text-lg"
                                >
                                    <option value="" disabled>Selecione o Cliente / Comprador...</option>
                                    {clients.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Dados cadastrados do cliente (Minha Organização → Meus Clientes) —
                                somente leitura, para conferência antes de emitir o contrato. Não
                                edita o cadastro aqui (evita duas fontes de verdade); qualquer
                                correção é feita em Meus Clientes. */}
                            {selectedClient && (
                                <div className="p-6 bg-gray-50 rounded-[2rem] border border-gray-100 space-y-4 animate-in slide-in-from-left-4 duration-500 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-purple-600">
                                            <UserCheck className="w-4 h-4" />
                                            <h4 className="font-black uppercase tracking-widest text-xs">Dados Cadastrados — Conferência</h4>
                                        </div>
                                        {selectedClient.category && (
                                            <span className="text-xs font-black bg-white px-2 py-1 rounded-lg border border-gray-100 text-purple-600 shadow-sm uppercase tracking-widest">
                                                {selectedClient.category}
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Tipo de Pessoa</p>
                                            <p className="text-sm font-bold text-gray-800">{selectedClient.type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                                                <FileText className="w-3 h-3" /> CPF / CNPJ
                                            </p>
                                            <p className="text-sm font-bold text-gray-800">{selectedClient.document || '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                                                <Mail className="w-3 h-3" /> E-mail
                                            </p>
                                            <p className="text-sm font-bold text-gray-800 truncate">{selectedClient.email || '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                                                <Phone className="w-3 h-3" /> Telefone
                                            </p>
                                            <p className="text-sm font-bold text-gray-800">{selectedClient.phone || '—'}</p>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                                            <MapPin className="w-3 h-3" /> Endereço
                                        </p>
                                        <p className="text-sm font-bold text-gray-800">{clientAddressLine1 || '—'}</p>
                                        {clientAddressLine2 && (
                                            <p className="text-xs font-medium text-gray-500 mt-0.5">{clientAddressLine2}</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Origem / Canal — alimenta "Fontes de Locação" (e Vendas) */}
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Origem / Canal</label>
                                <select
                                    value={formData.origin_channel || ''}
                                    onChange={(e) => setFormData({ ...formData, origin_channel: e.target.value })}
                                    className="w-full px-6 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-2xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner"
                                >
                                    <option value="">Não informado</option>
                                    <option value="Direto">Direto</option>
                                    <option value="Indicação">Indicação</option>
                                    <option value="Portal Imobiliário">Portal Imobiliário</option>
                                    <option value="Imobiliária / Corretor">Imobiliária / Corretor</option>
                                    <option value="Redes Sociais">Redes Sociais</option>
                                    <option value="Site">Site</option>
                                    <option value="Outros">Outros</option>
                                </select>
                            </div>

                            {/* Checklist de documentos do cliente/comprador — muda conforme
                                Pessoa Física / Jurídica do cadastro. Persistido em
                                commercial_deals.doc_checklist. */}
                            {selectedClient && (() => {
                                const isPJ = selectedClient.type === 'PJ';
                                const items = DEAL_DOC_CHECKLIST[isPJ ? 'PJ' : 'PF'];
                                const checked = formData.doc_checklist || {};
                                const doneCount = items.filter(i => checked[i.key]).length;
                                const toggle = (key: string) => setFormData(prev => ({
                                    ...prev,
                                    doc_checklist: { ...(prev.doc_checklist || {}), [key]: !(prev.doc_checklist || {})[key] },
                                }));
                                return (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-purple-600">
                                                <FileText className="w-5 h-5" />
                                                <h3 className="font-black uppercase tracking-widest text-xs">
                                                    Documentos — {isPJ ? 'Pessoa Jurídica' : 'Pessoa Física'}
                                                </h3>
                                            </div>
                                            <span className="text-xs font-black bg-white px-2 py-1 rounded-lg border border-gray-100 text-purple-600 shadow-sm uppercase tracking-widest">
                                                {doneCount}/{items.length}
                                            </span>
                                        </div>
                                        <div className="space-y-2">
                                            {items.map(item => {
                                                const isChecked = !!checked[item.key];
                                                return (
                                                    <button
                                                        key={item.key}
                                                        type="button"
                                                        onClick={() => toggle(item.key)}
                                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${
                                                            isChecked
                                                                ? 'bg-emerald-50 border-emerald-200'
                                                                : 'bg-gray-50 border-transparent hover:border-purple-200'
                                                        }`}
                                                    >
                                                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-all ${
                                                            isChecked
                                                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                                                : 'bg-white border-gray-300 text-transparent'
                                                        }`}>
                                                            <Check className="w-4 h-4" />
                                                        </span>
                                                        <span className={`text-sm font-bold ${isChecked ? 'text-emerald-800' : 'text-gray-700'}`}>
                                                            {item.label}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* ══════════════════════════════════════════
                        ABA 2 — DADOS DA UNIDADE
                    ══════════════════════════════════════════ */}
                    {activeTab === 'unidade' && (
                        <div className="max-w-2xl space-y-8">
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-purple-600">
                                    <Building className="w-5 h-5" />
                                    <h3 className="font-black uppercase tracking-widest text-xs">Imóvel da Negociação</h3>
                                    <span className="text-xs font-semibold text-red-500">Obrigatório</span>
                                </div>
                                <select
                                    required
                                    value={formData.property_id || ''}
                                    onChange={(e) => {
                                        const propId = e.target.value;
                                        const prop = properties.find(p => p.id === propId);
                                        setFormData({
                                            ...formData,
                                            property_id: propId,
                                            linked_project_id: prop?.project_id || formData.linked_project_id || ''
                                        });
                                    }}
                                    className="w-full px-6 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-2xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner text-base"
                                >
                                    <option value="" disabled>Selecione um imóvel do inventário...</option>
                                    {properties.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} - R$ {(p.price || 0).toLocaleString('pt-BR')}</option>
                                    ))}
                                </select>

                                {selectedProperty && (
                                    <div className="p-6 bg-gray-50 rounded-[2rem] border border-gray-100 flex items-center gap-6 animate-in slide-in-from-left-4 duration-500 shadow-sm">
                                        <div className="w-20 h-20 rounded-xl border-2 border-white shadow-lg overflow-hidden bg-white shrink-0">
                                            {selectedProperty.images?.[0] ?
                                                <img src={selectedProperty.images[0]} className="w-full h-full object-cover" alt="Preview" /> :
                                                <div className="w-full h-full flex items-center justify-center text-gray-200"><Building className="w-10 h-10" /></div>
                                            }
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-lg font-black text-gray-900 tracking-tight">{selectedProperty.name}</p>
                                                <span className="text-xs font-black bg-white px-2 py-1 rounded-lg border border-gray-100 text-purple-600 shadow-sm uppercase tracking-widest">Ativo Disponível</span>
                                            </div>
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-relaxed">{selectedProperty.address}</p>
                                            <div className="flex items-center gap-4 mt-4">
                                                <div className="flex items-center gap-1.5 text-gray-400">
                                                    <Maximize2 className="w-3.5 h-3.5" />
                                                    <span className="text-xs font-black tracking-widest">{selectedProperty.area} m²</span>
                                                </div>
                                                <div className="h-3 w-px bg-gray-200" />
                                                <p className="text-sm font-black text-purple-600 font-mono">R$ {(selectedProperty.price || 0).toLocaleString('pt-BR')}</p>
                                                {formData.linked_project_id && (() => {
                                                    const proj = projects.find(p => p.id === formData.linked_project_id);
                                                    return proj ? (
                                                        <>
                                                            <div className="h-3 w-px bg-gray-200" />
                                                            <div className="flex items-center gap-1.5 text-gray-400">
                                                                <Layers className="w-3.5 h-3.5" />
                                                                <span className="text-xs font-black tracking-widest truncate max-w-[140px]">{proj.name}</span>
                                                            </div>
                                                        </>
                                                    ) : null;
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {selectedProperty && (() => {
                                    const posLabel: Record<string, string> = { FRONT: 'Frente', LATERAL: 'Lateral', BACK: 'Fundos' };
                                    const sunLabel: Record<string, string> = { NORTH: 'Norte', SOUTH: 'Sul', EAST: 'Leste', WEST: 'Oeste' };
                                    const specs = [
                                        { label: 'Pavimento', icon: <Layers className="w-3.5 h-3.5" />, value: selectedProperty.floor ?? '—' },
                                        { label: 'Área Privativa', icon: <Maximize2 className="w-3.5 h-3.5" />, value: selectedProperty.private_area ? `${selectedProperty.private_area} m²` : '—' },
                                        { label: 'Dormitórios', icon: <BedDouble className="w-3.5 h-3.5" />, value: selectedProperty.specs?.bedrooms ?? '—' },
                                        { label: 'Banheiros', icon: <Bath className="w-3.5 h-3.5" />, value: selectedProperty.specs?.bathrooms ?? '—' },
                                        { label: 'Suítes', icon: <DoorClosed className="w-3.5 h-3.5" />, value: selectedProperty.specs?.suites ?? '—' },
                                        { label: 'Vagas', icon: <Car className="w-3.5 h-3.5" />, value: selectedProperty.specs?.parkingSpaces ?? '—' },
                                        { label: 'Posição', icon: <Building className="w-3.5 h-3.5" />, value: selectedProperty.position_type ? (posLabel[selectedProperty.position_type] || selectedProperty.position_type) : '—' },
                                        { label: 'Orientação', icon: <Compass className="w-3.5 h-3.5" />, value: selectedProperty.sun_orientation ? (sunLabel[selectedProperty.sun_orientation] || selectedProperty.sun_orientation) : '—' },
                                    ];
                                    return (
                                        <div className="grid grid-cols-4 gap-3 animate-in slide-in-from-left-4 duration-500">
                                            {specs.map((s) => (
                                                <div key={s.label} className="p-3 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col gap-1">
                                                    <div className="flex items-center gap-1.5 text-gray-400">
                                                        {s.icon}
                                                        <label className="text-[8px] font-black uppercase tracking-widest">{s.label}</label>
                                                    </div>
                                                    <span className="text-sm font-black text-gray-700 truncate">{s.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════
                        ABA 3 — FORMA DE PAGAMENTO
                    ══════════════════════════════════════════ */}
                    {activeTab === 'pagamento' && (
                        <div className="space-y-6">
                            {/* Campos compactos (não precisam de tela cheia) — Tipo, Valor, Datas,
                                Forma de Pagamento, Entrada. Nº Parcelas mudou para dentro do modal
                                de Gerar Parcelas (junto com Tipo de Pagamento). O Plano de Pagamento
                                (abaixo, fora deste container) usa a largura toda: cada parcela +
                                desconto cabe numa linha só. */}
                            <div className="max-w-3xl space-y-6">
                                <div className="flex items-center gap-2 text-purple-600">
                                    <DollarSign className="w-5 h-5" />
                                    <h3 className="font-black uppercase tracking-widest text-xs">
                                        {formData.type === 'SALE' ? 'Condições de Venda' :
                                            formData.type === 'RENTAL' ? 'Condições de Aluguel' : 'Condições do Acordo'}
                                    </h3>
                                </div>

                                {/* Tipo */}
                                <div className={`grid gap-4 bg-gray-50 p-2 rounded-3xl shadow-inner ${(initialData?.type || defaultType) ? 'hidden' : 'grid-cols-3'}`}>
                                    {(['SALE', 'RENTAL', 'SERVICE'] as const).map((t) => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, type: t })}
                                            className={`py-4 rounded-2xl font-black text-button uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${formData.type === t ? 'bg-white text-purple-600 shadow-xl border border-gray-100 scale-[1.02]' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            {t === 'SALE' ? 'Venda' : t === 'RENTAL' ? 'Aluguel' : 'Serviço'}
                                        </button>
                                    ))}
                                </div>

                                {/* Valor */}
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Valor do Fechamento</label>
                                    <div className="relative group">
                                        <span className="absolute left-8 top-1/2 -translate-y-1/2 font-mono font-bold text-purple-300 group-focus-within:text-white transition-colors">BRL</span>
                                        <input
                                            required
                                            type="number"
                                            value={formData.value || ''}
                                            onChange={(e) => {
                                                const newValue = parseFloat(e.target.value) || 0;
                                                const pct = formData.broker_commission_pct || 0;
                                                setFormData({
                                                    ...formData,
                                                    value: newValue,
                                                    broker_commission_value: recalcCommission(newValue, pct)
                                                });
                                            }}
                                            className="w-full pl-20 pr-8 py-6 bg-purple-600 text-white placeholder-purple-300 rounded-[2rem] outline-none font-black text-3xl shadow-xl shadow-purple-600/20 focus:scale-[1.01] transition-all"
                                            placeholder="0,00"
                                        />
                                    </div>
                                </div>

                                {/* Datas */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Data Efetiva</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="date"
                                                value={formData.date}
                                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                                className="w-full pl-11 pr-4 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-2xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Data do 1º Pagamento</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
                                            <input
                                                type="date"
                                                value={formData.payment_due_date || ''}
                                                onChange={(e) => handlePaymentDueDateChange(e.target.value)}
                                                className="w-full pl-11 pr-4 py-4 bg-purple-50/50 border border-purple-100 focus:bg-white focus:border-purple-500 rounded-2xl outline-none font-bold text-purple-700 transition-all shadow-inner text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Forma de Pagamento */}
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Forma de Pagamento</label>
                                    <select
                                        value={formData.payment_method}
                                        onChange={(e) => {
                                            const method = e.target.value;
                                            setFormData({
                                                ...formData,
                                                payment_method: method,
                                                installments: method === 'CASH' ? 1 : formData.installments
                                            });
                                        }}
                                        className="w-full px-6 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-2xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner"
                                    >
                                        <option value="CASH">À Vista</option>
                                        <option value="INSTALLMENTS">Parcelado Direto / Mensalidade</option>
                                        {formData.type === 'SALE' && (
                                            <>
                                                <option value="FINANCING">Financiamento</option>
                                                <option value="PERMUTA">Permuta</option>
                                                <option value="HIBRIDO">Híbrido</option>
                                            </>
                                        )}
                                    </select>
                                </div>

                                {formData.payment_method === 'INSTALLMENTS' && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Entrada (BRL)</label>
                                        <input
                                            type="number"
                                            value={formData.down_payment || ''}
                                            onChange={(e) => setFormData({ ...formData, down_payment: parseFloat(e.target.value) || 0 })}
                                            className="w-full px-4 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-2xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm"
                                            placeholder="0,00"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Plano de Pagamento — largura total: data + valor bruto + desconto +
                                valor final cabem todos na mesma linha por parcela. */}
                            {formData.payment_method === 'INSTALLMENTS' && (
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            {(formData.custom_installments?.length ?? 0) > 0 && (
                                                <input
                                                    type="checkbox"
                                                    title="Selecionar todas"
                                                    checked={formData.custom_installments!.every(i => selectedInstallmentIds.has(i.id))}
                                                    onChange={() => {
                                                        const all = formData.custom_installments || [];
                                                        const allSelected = all.every(i => selectedInstallmentIds.has(i.id));
                                                        setSelectedInstallmentIds(allSelected ? new Set() : new Set(all.map(i => i.id)));
                                                    }}
                                                    className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                                />
                                            )}
                                            <h4 className="text-xs font-black text-purple-600 uppercase tracking-widest">Plano de Pagamento</h4>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {(formData.custom_installments || []).some(i => i.installmentType && i.installmentType !== 'AVULSA') && (
                                                <button
                                                    type="button"
                                                    onClick={handleOpenRecalcModal}
                                                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all bg-white text-amber-600 border border-amber-200 hover:bg-amber-50 active:scale-95"
                                                >
                                                    <RefreshCw className="w-3.5 h-3.5" />
                                                    Recalcular
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={handleOpenAddAdhocModal}
                                                className="flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all bg-white text-purple-600 border border-purple-200 hover:bg-purple-50 active:scale-95"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                                Parcela Avulsa
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleOpenGenerateModal}
                                                disabled={loading}
                                                className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${loading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-purple-100 text-purple-700 hover:bg-purple-200 active:scale-95'}`}
                                            >
                                                {loading ? 'Verificando...' : 'Gerar Parcelas'}
                                            </button>
                                        </div>
                                    </div>

                                    {((formData.down_payment || 0) > 0 || (formData.custom_installments?.length ?? 0) > 0) && (
                                        <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-2 custom-scrollbar">
                                            {/* Entrada — não é item de custom_installments (é o campo down_payment
                                                à parte), mas aparece como 1ª linha do Plano de Pagamento para poder
                                                receber Tipo de Pagamento e Descrição igual às demais parcelas. */}
                                            {(formData.down_payment || 0) > 0 && (
                                                <div className="flex flex-wrap items-center gap-3 p-3 bg-purple-50/40 border border-purple-100 rounded-xl shadow-sm">
                                                    <span className="w-6 shrink-0" />
                                                    <span className="w-6 shrink-0 text-center text-[10px] font-black text-purple-500 uppercase">Entr.</span>

                                                    <input
                                                        type="date"
                                                        value={formData.date}
                                                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                                        className="w-[160px] shrink-0 bg-white border border-transparent focus:border-purple-300 rounded-lg p-2 text-form-input font-bold text-gray-700 outline-none"
                                                    />

                                                    <div className="relative w-[150px] shrink-0">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">R$</span>
                                                        <input
                                                            type="number"
                                                            value={formData.down_payment ?? ''}
                                                            onChange={(e) => setFormData({ ...formData, down_payment: parseFloat(e.target.value) || 0 })}
                                                            className="w-full pl-6 pr-2 py-2 bg-white border border-transparent focus:border-purple-300 rounded-lg text-form-input font-bold text-gray-700 outline-none"
                                                        />
                                                    </div>

                                                    <select
                                                        value={formData.down_payment_installment_type ?? 'SINAL'}
                                                        onChange={(e) => setFormData({ ...formData, down_payment_installment_type: (e.target.value || undefined) as PaymentInstallment['installmentType'] })}
                                                        className="w-[150px] shrink-0 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-2 py-2 bg-white outline-none cursor-pointer"
                                                    >
                                                        {installmentTypeOptions.map(t => (
                                                            <option key={t.code || t.id} value={t.code}>{t.name}</option>
                                                        ))}
                                                    </select>

                                                    <select
                                                        value={formData.down_payment_payment_type ?? ''}
                                                        onChange={(e) => setFormData({ ...formData, down_payment_payment_type: (e.target.value || undefined) as PaymentInstallment['paymentType'] })}
                                                        className="w-[150px] shrink-0 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-2 py-2 bg-white outline-none cursor-pointer"
                                                    >
                                                        <option value="">Forma Pagto.</option>
                                                        <option value="PIX">PIX</option>
                                                        <option value="TED">TED</option>
                                                        <option value="DOC">DOC</option>
                                                        <option value="DINHEIRO">Dinheiro</option>
                                                        <option value="CHEQUE">Cheque</option>
                                                        <option value="PERMUTA">Permuta</option>
                                                    </select>

                                                    <input
                                                        type="text"
                                                        value={formData.down_payment_notes ?? ''}
                                                        onChange={(e) => setFormData({ ...formData, down_payment_notes: e.target.value })}
                                                        placeholder="Descrição / observação"
                                                        className="flex-1 min-w-[160px] text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-2 py-2 bg-white outline-none focus:border-purple-300"
                                                    />
                                                </div>
                                            )}
                                            {formData.custom_installments && formData.custom_installments.map((inst, index) => (
                                                <div key={inst.id} className={`flex flex-wrap items-center gap-3 p-3 bg-white border rounded-xl shadow-sm ${selectedInstallmentIds.has(inst.id) ? 'border-purple-300 bg-purple-50/30' : 'border-purple-100'}`}>
                                                    <input
                                                        type="checkbox"
                                                        title="Dica: segure Shift e clique para selecionar um intervalo"
                                                        checked={selectedInstallmentIds.has(inst.id)}
                                                        onChange={(e) => handleInstallmentRowCheck(inst.id, index, e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)}
                                                        className="w-4 h-4 shrink-0 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                                    />
                                                    <span className="w-6 shrink-0 text-center text-xs font-black text-gray-400">{index + 1}</span>

                                                    <input
                                                        type="date"
                                                        value={inst.dueDate}
                                                        onChange={(e) => {
                                                            const newInsts = [...formData.custom_installments!];
                                                            newInsts[index] = { ...inst, dueDate: e.target.value };
                                                            setFormData({ ...formData, custom_installments: newInsts });
                                                        }}
                                                        className="w-[160px] shrink-0 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-300 rounded-lg p-2 text-form-input font-bold text-gray-700 outline-none"
                                                    />

                                                    <div className="relative w-[150px] shrink-0">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">R$</span>
                                                        <input
                                                            type="number"
                                                            value={inst.originalValue ?? inst.value}
                                                            onChange={(e) => updateInstallmentDiscount(index, { originalValue: parseFloat(e.target.value) || 0 })}
                                                            className="w-full pl-6 pr-2 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-300 rounded-lg text-form-input font-bold text-gray-700 outline-none"
                                                        />
                                                    </div>

                                                    <select
                                                        value={inst.discountType ?? ''}
                                                        onChange={(e) => {
                                                            const type = e.target.value as 'VALUE' | 'PERCENT' | '';
                                                            updateInstallmentDiscount(index, {
                                                                discountType: type || undefined,
                                                                discountAmount: type ? inst.discountAmount : undefined
                                                            });
                                                        }}
                                                        className="w-[150px] shrink-0 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-2 py-2 bg-gray-50 outline-none cursor-pointer"
                                                    >
                                                        <option value="">Sem desconto</option>
                                                        <option value="VALUE">Desconto R$</option>
                                                        <option value="PERCENT">Desconto %</option>
                                                    </select>

                                                    {inst.discountType && (
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={inst.discountAmount ?? ''}
                                                            onChange={(e) => updateInstallmentDiscount(index, { discountAmount: parseFloat(e.target.value) || 0 })}
                                                            placeholder={inst.discountType === 'PERCENT' ? '%' : 'R$'}
                                                            className="w-[110px] shrink-0 text-xs font-semibold text-amber-700 border border-amber-200 rounded-lg px-2 py-2 bg-amber-50 outline-none"
                                                        />
                                                    )}

                                                    <select
                                                        value={inst.installmentType ?? ''}
                                                        onChange={(e) => {
                                                            const newInsts = [...formData.custom_installments!];
                                                            newInsts[index] = { ...inst, installmentType: (e.target.value || undefined) as PaymentInstallment['installmentType'] };
                                                            setFormData({ ...formData, custom_installments: newInsts });
                                                        }}
                                                        className="w-[150px] shrink-0 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-2 py-2 bg-gray-50 outline-none cursor-pointer"
                                                    >
                                                        <option value="">Tipo Pagto.</option>
                                                        {installmentTypeOptions.map(t => (
                                                            <option key={t.code || t.id} value={t.code}>{t.name}</option>
                                                        ))}
                                                    </select>

                                                    <select
                                                        value={inst.paymentType ?? ''}
                                                        onChange={(e) => {
                                                            const newInsts = [...formData.custom_installments!];
                                                            newInsts[index] = { ...inst, paymentType: (e.target.value || undefined) as PaymentInstallment['paymentType'] };
                                                            setFormData({ ...formData, custom_installments: newInsts });
                                                        }}
                                                        className="w-[130px] shrink-0 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-2 py-2 bg-gray-50 outline-none cursor-pointer"
                                                    >
                                                        <option value="">Forma Pagto.</option>
                                                        <option value="PIX">PIX</option>
                                                        <option value="TED">TED</option>
                                                        <option value="DOC">DOC</option>
                                                        <option value="DINHEIRO">Dinheiro</option>
                                                        <option value="CHEQUE">Cheque</option>
                                                        <option value="PERMUTA">Permuta</option>
                                                    </select>

                                                    <input
                                                        type="text"
                                                        value={inst.notes ?? ''}
                                                        onChange={(e) => {
                                                            const newInsts = [...formData.custom_installments!];
                                                            newInsts[index] = { ...inst, notes: e.target.value };
                                                            setFormData({ ...formData, custom_installments: newInsts });
                                                        }}
                                                        placeholder="Descrição / observação"
                                                        className="flex-1 min-w-[160px] text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-2 py-2 bg-gray-50 outline-none focus:bg-white focus:border-purple-300"
                                                    />

                                                    <div className="shrink-0 text-right">
                                                        {inst.discountType && (
                                                            <span className="text-xs font-black text-emerald-600">
                                                                Final: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inst.value)}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <button
                                                        type="button"
                                                        title="Remover parcela"
                                                        onClick={() => handleRemoveInstallment(inst.id)}
                                                        className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                            {(() => {
                                                // Soma bruta valida contra o Valor do Fechamento (parcelas somam o
                                                // preço combinado, independente de desconto). Soma com desconto é
                                                // o que de fato será cobrado — mostrada só quando difere da bruta,
                                                // para não confundir "faltou parcela" com "desconto aplicado".
                                                const grossSum = (formData.custom_installments || []).reduce((sum, i) => sum + (i.originalValue ?? i.value), 0) + (formData.down_payment || 0);
                                                const netSum = (formData.custom_installments || []).reduce((sum, i) => sum + i.value, 0) + (formData.down_payment || 0);
                                                const hasDiscount = Math.abs(netSum - grossSum) > 0.01;
                                                return (
                                                    <div className="max-w-3xl flex items-center justify-between gap-6 p-3 mt-2 bg-gray-50 rounded-xl border border-gray-100">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Soma das Parcelas</span>
                                                            <span className={`text-sm font-black ${Math.abs(grossSum - (formData.value || 0)) < 0.01 ? 'text-green-600' : 'text-amber-600'}`}>
                                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(grossSum)}
                                                            </span>
                                                        </div>
                                                        {hasDiscount && (
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Total com Desconto</span>
                                                                <span className="text-sm font-black text-emerald-600">
                                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(netSum)}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ══════════════════════════════════════════
                        ABA 4 — PARTES & COMISSÃO
                    ══════════════════════════════════════════ */}
                    {activeTab === 'partes' && (
                        <div className="max-w-2xl space-y-8">
                            {/* Corretor */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-amber-600">
                                    <UserCheck className="w-5 h-5" />
                                    <h3 className="font-black uppercase tracking-widest text-xs">Corretor da Negociação</h3>
                                    <span className="text-xs font-semibold text-amber-500">Opcional</span>
                                </div>

                                <select
                                    value={formData.broker_id || ''}
                                    onChange={(e) => {
                                        const brokerId = e.target.value;
                                        const broker = brokers.find(b => b.id === brokerId);
                                        const commissionPct = 0;
                                        const commissionValue = recalcCommission(formData.value || 0, commissionPct);
                                        setFormData({
                                            ...formData,
                                            broker_id: brokerId || undefined,
                                            broker_name: broker?.name || undefined,
                                            broker_commission_pct: commissionPct,
                                            broker_commission_value: commissionValue
                                        });
                                    }}
                                    className="w-full px-6 py-4 bg-amber-50/60 border border-transparent focus:bg-white focus:border-amber-400 rounded-2xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner"
                                >
                                    <option value="">Sem corretor / Venda direta</option>
                                    {uniqueBrokers.map(b => (
                                        <option key={b.id} value={b.id}>
                                            {b.name}{b.agency_name ? ` - ${b.agency_name}` : ''}
                                        </option>
                                    ))}
                                </select>

                                {selectedBroker && (
                                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-center gap-4 animate-in slide-in-from-left-4 duration-400">
                                        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                                            <UserCheck className="w-5 h-5 text-amber-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-black text-gray-900 truncate">{selectedBroker.name}</p>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                {selectedBroker.cpf && (
                                                    <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Doc: {selectedBroker.cpf}</span>
                                                )}
                                                {selectedBroker.agency_name && (
                                                    <span className="text-xs font-bold text-gray-400 truncate">{selectedBroker.agency_name}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className="text-xs font-black text-gray-400 uppercase tracking-widest block">Comissão inicial</span>
                                            <span className="text-lg font-black text-amber-600">0%</span>
                                        </div>
                                    </div>
                                )}

                                {formData.broker_id && (
                                    <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-300">
                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">
                                                <Percent className="w-3 h-3 inline mr-1" />% Comissão
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    step="0.01"
                                                    value={formData.broker_commission_pct ?? ''}
                                                    onChange={(e) => {
                                                        const pct = parseFloat(e.target.value) || 0;
                                                        setFormData({
                                                            ...formData,
                                                            broker_commission_pct: pct,
                                                            broker_commission_value: recalcCommission(formData.value || 0, pct)
                                                        });
                                                    }}
                                                    className="w-full px-4 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-amber-400 rounded-2xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm"
                                                    placeholder="Ex: 5.00"
                                                />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400">%</span>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Valor da Comissão</label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-500 font-mono">R$</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={formData.broker_commission_value ?? ''}
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value) || 0;
                                                        setFormData({
                                                            ...formData,
                                                            broker_commission_value: val,
                                                            broker_commission_pct: 0
                                                        });
                                                    }}
                                                    className="w-full pl-10 pr-4 py-4 bg-amber-50 border border-amber-100 focus:bg-white focus:border-amber-400 rounded-2xl outline-none font-black text-amber-700 font-mono transition-all shadow-inner text-sm"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Forma de Pagto.</label>
                                            <select
                                                value={formData.broker_payment_method || ''}
                                                onChange={(e) => setFormData({ ...formData, broker_payment_method: e.target.value })}
                                                className="w-full px-4 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-amber-400 rounded-2xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner text-sm"
                                            >
                                                <option value="PIX">PIX</option>
                                                <option value="BOLETO">Boleto Bancário</option>
                                                <option value="TRANSFERENCIA">Transferência Bancária</option>
                                                <option value="DINHEIRO">Dinheiro Espécie</option>
                                                <option value="PERMUTA">Permuta</option>
                                                <option value="OUTROS">Outros</option>
                                            </select>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Data de Pagto.</label>
                                            <input
                                                type="date"
                                                value={formData.broker_payment_due_date || formData.date || ''}
                                                onChange={(e) => setFormData({ ...formData, broker_payment_due_date: e.target.value })}
                                                className="w-full px-4 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-amber-400 rounded-2xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════
                        ABA 5 — CONTRATO & ASSINATURA
                    ══════════════════════════════════════════ */}
                    {activeTab === 'contrato' && (
                        <div className="space-y-8">
                            {/* Nº Contrato + Etapa lado a lado */}
                            <div className="grid grid-cols-12 gap-8">
                                <div className="col-span-12 lg:col-span-5 space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">
                                            {formData.type === 'SALE' ? 'Nº Contrato de Compra e Venda' :
                                                formData.type === 'RENTAL' ? 'Nº Contrato de Locação' : 'Nº Contrato de Prestação de Serviço'}
                                        </label>
                                        <div className="relative group">
                                            <FileText className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-purple-500 transition-colors" />
                                            <input
                                                type="text"
                                                value={formData.contract_number || ''}
                                                onChange={(e) => setFormData({ ...formData, contract_number: e.target.value })}
                                                className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-2xl outline-none font-bold text-gray-700 transition-all shadow-inner"
                                                placeholder={formData.type === 'SALE' ? 'Ex: CV-2026-001' : formData.type === 'RENTAL' ? 'Ex: CL-2026-001' : 'Ex: CPS-2026-001'}
                                            />
                                        </div>
                                    </div>

                                    {/* Ponte → Contrato formal (Venda ou Locação, negociação já salva) */}
                                    {canGenerateContract && formData.id && (
                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">
                                                {formData.type === 'RENTAL' ? 'Contrato de Locação' : 'Contrato de Venda'}
                                            </label>
                                            {linkedContract ? (
                                                <div className="p-5 bg-emerald-50 rounded-3xl border border-emerald-100 flex gap-4 items-start">
                                                    <Check className="w-6 h-6 text-emerald-500 shrink-0 mt-0.5" />
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-black text-emerald-800 uppercase tracking-widest mb-1">Contrato Gerado</p>
                                                        <p className="text-xs text-emerald-700 leading-relaxed">
                                                            Nº <span className="font-black">{linkedContract.number}</span> · {linkedContract.status}.
                                                            {formData.type === 'RENTAL'
                                                                ? <> Contrato recorrente mensal, disponível no <span className="font-bold">Portal do Cliente</span> (categoria Locação).</>
                                                                : <> Disponível em <span className="font-bold">Vendas de Ativos → Contratos</span> e no Portal do Cliente.</>}
                                                        </p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={handleGenerateContract}
                                                    disabled={generatingContract}
                                                    className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-purple-600 text-white rounded-2xl font-black hover:bg-purple-700 transition-all shadow-sm active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                                                >
                                                    <FileText className="w-5 h-5" />
                                                    <span className="uppercase text-xs tracking-widest">{generatingContract ? 'Gerando…' : formData.type === 'RENTAL' ? 'Gerar Contrato de Locação' : 'Gerar Contrato de Venda'}</span>
                                                </button>
                                            )}
                                            {contractError && (
                                                <p className="text-xs font-bold text-red-500 px-2 flex items-center gap-1">
                                                    <AlertCircle className="w-3 h-3" /> {contractError}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100 flex gap-4">
                                        <AlertCircle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-xs font-black text-amber-800 uppercase tracking-widest mb-1">Aviso de Disponibilidade</p>
                                            <p className="text-xs text-amber-700 leading-relaxed">
                                                O status "{formData.type === 'RENTAL' ? 'Alugado' : 'Vendido'}" altera automaticamente a visibilidade do ativo no catálogo público.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="col-span-12 lg:col-span-7 space-y-4">
                                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1 block">Etapa da Negociação</label>
                                    <DealWorkflowBar
                                        currentStatus={(formData.status as DealWorkflowStatus) || 'IN_NEGOTIATION'}
                                        deal={formData}
                                        organizationId={formData.organization_id || organizationId}
                                        onTransition={(to, meta) => {
                                            const updates: Partial<typeof formData> = { status: to };
                                            if (to === 'CANCELLED' && meta?.reason) {
                                                updates.cancellation_reason = meta.reason;
                                                updates.cancellation_date = new Date().toISOString();
                                                updates.cancellation_refund_amount = meta.refundAmount || 0;
                                                const distratNotes = `[DISTRATO ${new Date().toLocaleDateString('pt-BR')}] Motivo: ${meta.reason}${meta.refundAmount ? ` | Devolução: R$ ${meta.refundAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}`;
                                                updates.notes = formData.notes ? `${formData.notes}\n${distratNotes}` : distratNotes;
                                            }
                                            setFormData({ ...formData, ...updates });
                                        }}
                                    />
                                    {(formData.payment_method === 'INSTALLMENTS' || formData.payment_method === 'FINANCING') && (
                                        <p className="text-[9px] font-black text-purple-500 uppercase tracking-tighter px-2 flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3" /> Status "Concluído" será ativado automaticamente após a baixa da última parcela.
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Assinatura Eletrônica */}
                            {formData.id && ['WAITING_PAYMENT', 'CONTRATO', 'ASSINATURA'].includes(formData.status || '') && (
                                <DealSignaturePanel
                                    deal={formData}
                                    client={selectedClient}
                                    organizationId={formData.organization_id || organizationId || ''}
                                    onStatusChange={(sigStatus: 'PENDING' | 'SIGNED') => {
                                        setFormData(prev => ({ ...prev, signature_status: sigStatus }));
                                        if (sigStatus === 'SIGNED' && formData.status === 'ASSINATURA') {
                                            confirm({
                                                title: 'Contrato assinado!',
                                                message: 'Deseja avançar a negociação para Concluído?',
                                                variant: 'default',
                                                confirmLabel: 'Avançar',
                                            }).then(ok => {
                                                if (ok) setFormData(prev => ({ ...prev, signature_status: 'SIGNED', status: 'COMPLETED' }));
                                            });
                                        }
                                    }}
                                />
                            )}

                            {/* Análise de Crédito */}
                            {formData.id && (formData.organization_id || organizationId) && (
                                <CreditAnalysisPanel
                                    dealId={formData.id}
                                    organizationId={(formData.organization_id || organizationId) as string}
                                    clientName={selectedClient?.name}
                                />
                            )}

                            {/* Observações */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-purple-600">
                                    <FileText className="w-5 h-5" />
                                    <h3 className="font-black uppercase tracking-widest text-xs">Observações da Negociação</h3>
                                </div>
                                <textarea
                                    value={formData.notes || ''}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    rows={4}
                                    placeholder="Descreva aqui detalhes das parcelas, garantias, taxas de transferência ou observações gerais do fechamento..."
                                    className="w-full p-6 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-[2rem] outline-none font-medium text-gray-700 transition-all shadow-inner resize-none text-sm leading-relaxed"
                                />
                            </div>
                        </div>
                    )}
                </form>

                {/* Footer */}
                <div className="p-8 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-4 text-gray-400">
                        <div className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-300">
                            <Info className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] max-w-xs leading-relaxed">
                            Aprovação sistêmica obrigatória para fechamentos acima da margem de tabela permitida.
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        {formData.id && (
                            <button
                                type="button"
                                onClick={handleExportPDF}
                                className="flex items-center gap-3 px-6 py-4 bg-white text-gray-600 rounded-2xl font-black hover:text-purple-600 hover:border-purple-200 transition-all border border-gray-200 shadow-sm active:scale-95 group"
                            >
                                <FileText className="w-5 h-5 group-hover:animate-bounce" />
                                <span className="uppercase text-xs tracking-widest">Gerar Proposta</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-8 py-4 bg-white text-gray-500 rounded-2xl font-black hover:text-gray-900 transition-all border border-gray-200 shadow-sm active:scale-95"
                        >
                            CANCELAR
                        </button>
                        <button
                            type="submit"
                            form="deal-modal-form"
                            disabled={loading}
                            className="px-12 py-4 bg-purple-600 text-white rounded-2xl font-black shadow-2xl shadow-purple-600/30 hover:bg-purple-700 transition-all flex items-center gap-3 active:scale-95 disabled:opacity-50 ring-4 ring-purple-50"
                        >
                            {loading ? (
                                <div className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Check className="w-6 h-6" />
                            )}
                            SALVAR ALTERAÇÕES
                        </button>
                    </div>
                </div>

                {/* Aviso padrão de salvamento (toast) — mesmo padrão visual do
                    toast de sucesso dos módulos (fixo, canto inferior direito). */}
                {savedNotice && (
                    <div className="fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-[10px] shadow-xl text-sm font-medium bg-emerald-600 text-white animate-in slide-in-from-bottom-4 duration-300">
                        <Check className="w-5 h-5 shrink-0" />
                        Negociação salva com sucesso!
                    </div>
                )}

                {/* Barra de ação em lote — parcelas selecionadas no Plano de Pagamento
                    (guia §10: fixa no rodapé, fora do fluxo normal). */}
                {activeTab === 'pagamento' && selectedInstallmentIds.size > 0 && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] flex items-center gap-3 p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/20">
                        <span className="flex-1 text-sm font-bold whitespace-nowrap">
                            {selectedInstallmentIds.size} parcela{selectedInstallmentIds.size !== 1 ? 's' : ''} selecionada{selectedInstallmentIds.size !== 1 ? 's' : ''}
                            <span className="ml-2 font-normal opacity-75">
                                · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                    (formData.custom_installments || [])
                                        .filter(i => selectedInstallmentIds.has(i.id))
                                        .reduce((s, i) => s + (i.originalValue ?? i.value), 0)
                                )}
                            </span>
                        </span>
                        <button
                            onClick={() => setShowInstallmentLoteModal(true)}
                            className="flex items-center gap-2 px-3 py-2 bg-white text-blue-700 rounded-xl font-bold text-button uppercase tracking-widest hover:bg-blue-50 transition-colors"
                        >
                            <Pencil className="w-3.5 h-3.5" />
                            Editar em Lote
                        </button>
                        <button
                            onClick={() => setSelectedInstallmentIds(new Set())}
                            className="flex items-center gap-2 px-3 py-2 bg-blue-500 rounded-xl font-bold text-button uppercase tracking-widest hover:bg-blue-400 transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                            Desmarcar
                        </button>
                    </div>
                )}

                {showInstallmentLoteModal && (
                    <InstallmentLoteDiscountModal
                        installments={(formData.custom_installments || []).filter(i => selectedInstallmentIds.has(i.id))}
                        installmentTypes={installmentTypeOptions}
                        onClose={() => setShowInstallmentLoteModal(false)}
                        onSave={applyBulkInstallmentEdit}
                    />
                )}

                {showGenerateModal && (
                    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
                            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
                                <div>
                                    <h2 className="text-lg font-black text-gray-900">Gerar Parcelas</h2>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        Parcelas de valor igual, a partir do Valor e da Entrada.
                                    </p>
                                </div>
                                <button onClick={() => setShowGenerateModal(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Nº de Parcelas</label>
                                        <input
                                            type="number"
                                            min="1" max="120"
                                            value={generateInstallmentCount}
                                            onChange={(e) => setGenerateInstallmentCount(parseInt(e.target.value) || 1)}
                                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-purple-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Data do 1º Pagamento</label>
                                        <input
                                            type="date"
                                            value={generateFirstDueDate}
                                            onChange={(e) => setGenerateFirstDueDate(e.target.value)}
                                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-purple-400"
                                        />
                                    </div>
                                </div>
                                <p className="text-xs text-gray-400 -mt-2">
                                    Data sugerida pelo sistema (o mesmo campo "Data do 1º Pagamento" da aba) — troque se quiser ancorar a série em outra data.
                                </p>

                                <div>
                                    <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Tipo de Pagamento</label>
                                    <select
                                        value={generateInstallmentType}
                                        onChange={(e) => setGenerateInstallmentType(e.target.value as NonNullable<PaymentInstallment['installmentType']>)}
                                        className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-purple-400"
                                    >
                                        {generatorTypes.map(t => (
                                            <option key={t.code || t.id} value={t.code}>{t.name}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Define o espaçamento entre as parcelas geradas (ex: trimestral = 1 a cada 3 meses).
                                        Um Plano de Pagamento pode combinar vários tipos — gerar um tipo novo não apaga os
                                        outros já existentes.
                                    </p>
                                </div>

                                {(() => {
                                    const existing = formData.custom_installments || [];
                                    const sameTypeCount = existing.filter(i => i.installmentType === generateInstallmentType).length;
                                    const otherTypesCount = existing.filter(i => i.installmentType !== 'AVULSA' && i.installmentType !== generateInstallmentType).length;
                                    if (sameTypeCount === 0 && otherTypesCount === 0) return null;
                                    return (
                                        <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800 space-y-1">
                                            {sameTypeCount > 0 && (
                                                <p>Substitui as {sameTypeCount} parcela(s) de "{typeLabel(generateInstallmentType)}" atuais — ajustes manuais nelas (descontos, valores editados, forma de pagamento e observações) serão perdidos.</p>
                                            )}
                                            {otherTypesCount > 0 && (
                                                <p>As {otherTypesCount} parcela(s) de outro(s) tipo(s) são mantidas (só o valor é recalculado para a soma continuar batendo com o Valor Total).</p>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>

                            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setShowGenerateModal(false)}
                                    className="px-4 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={() => handleConfirmGenerateInstallments(generateInstallmentType, generateInstallmentCount, generateFirstDueDate)}
                                    className={`px-5 py-2.5 rounded-xl text-sm font-black text-white transition-colors ${loading ? 'bg-gray-300 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}
                                >
                                    {loading ? 'Verificando...' : 'Gerar Parcelas'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showAddAdhocModal && (
                    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
                            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
                                <div>
                                    <h2 className="text-lg font-black text-gray-900">Parcela Avulsa</h2>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        Parcela fora da série regular, inserida na posição escolhida.
                                    </p>
                                </div>
                                <button onClick={() => setShowAddAdhocModal(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Qual será a parcela</label>
                                    <select
                                        value={adhocPosition}
                                        onChange={(e) => setAdhocPosition(parseInt(e.target.value) || 1)}
                                        className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-purple-400"
                                    >
                                        {Array.from({ length: (formData.custom_installments?.length ?? 0) + 1 }, (_, idx) => idx + 1).map(n => (
                                            <option key={n} value={n}>Parcela {n}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-400 mt-1">
                                        As demais parcelas deslocam a posição a partir daqui — datas e valores delas não mudam.
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Data</label>
                                        <input
                                            type="date"
                                            value={adhocDate}
                                            onChange={(e) => setAdhocDate(e.target.value)}
                                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-purple-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Valor (R$)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={adhocValue}
                                            onChange={(e) => setAdhocValue(e.target.value)}
                                            placeholder="0,00"
                                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-purple-400"
                                        />
                                    </div>
                                </div>
                                <p className="text-xs text-gray-400">
                                    Forma de pagamento e descrição ficam editáveis na própria linha, depois de criada.
                                </p>
                            </div>

                            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setShowAddAdhocModal(false)}
                                    className="px-4 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmAddAdhocInstallment}
                                    className="px-5 py-2.5 rounded-xl text-sm font-black text-white bg-purple-600 hover:bg-purple-700 transition-colors"
                                >
                                    Criar Parcela
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showRecalcModal && (
                    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
                            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
                                <div>
                                    <h2 className="text-lg font-black text-gray-900">Recalcular Parcelas</h2>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        Escolha quais tipos absorvem o ajuste — os demais (Entrada, Avulsas e tipos não marcados) ficam com o valor atual.
                                    </p>
                                </div>
                                <button onClick={() => setShowRecalcModal(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                                {(() => {
                                    const existing = formData.custom_installments || [];
                                    const typeGroups = new Map<NonNullable<PaymentInstallment['installmentType']>, { count: number; total: number }>();
                                    existing.forEach(i => {
                                        if (!i.installmentType || i.installmentType === 'AVULSA') return;
                                        const g = typeGroups.get(i.installmentType) || { count: 0, total: 0 };
                                        g.count++;
                                        g.total += (i.originalValue ?? i.value);
                                        typeGroups.set(i.installmentType, g);
                                    });

                                    return (
                                        <div className="space-y-2">
                                            {Array.from(typeGroups.entries()).map(([type, g]) => (
                                                <label key={type} className="flex items-center justify-between gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                                                    <span className="flex items-center gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={recalcSelectedTypes.has(type)}
                                                            onChange={() => handleToggleRecalcType(type)}
                                                            className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                                        />
                                                        <span className="text-sm font-bold text-gray-700">{typeLabel(type)}</span>
                                                        <span className="text-xs text-gray-400">({g.count} parcela{g.count !== 1 ? 's' : ''})</span>
                                                    </span>
                                                    <span className="text-xs font-semibold text-gray-500">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(g.total)}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    );
                                })()}

                                {recalcSelectedTypes.size > 0 && (() => {
                                    const existing = formData.custom_installments || [];
                                    const selectedRows = existing.filter(i => i.installmentType && recalcSelectedTypes.has(i.installmentType));
                                    const fixedTotal = existing
                                        .filter(i => !(i.installmentType && recalcSelectedTypes.has(i.installmentType)))
                                        .reduce((sum, i) => sum + (i.originalValue ?? i.value), 0);
                                    const downPayment = formData.down_payment || 0;
                                    const baseValue = formData.value || 0;
                                    const pool = Math.max(0, baseValue - downPayment - fixedTotal);
                                    const per = selectedRows.length > 0 ? Math.floor((pool / selectedRows.length) * 100) / 100 : 0;
                                    const fmt = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

                                    return (
                                        <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800 space-y-1">
                                            <p>Valor da negociação {fmt(baseValue)} − Entrada {fmt(downPayment)} − Avulsas/outros tipos {fmt(fixedTotal)} = {fmt(pool)}</p>
                                            <p className="font-black">{fmt(pool)} ÷ {selectedRows.length} parcela{selectedRows.length !== 1 ? 's' : ''} = {fmt(per)} cada</p>
                                        </div>
                                    );
                                })()}
                            </div>

                            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setShowRecalcModal(false)}
                                    className="px-4 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    disabled={recalcSelectedTypes.size === 0}
                                    onClick={handleConfirmRecalc}
                                    className={`px-5 py-2.5 rounded-xl text-sm font-black text-white transition-colors ${recalcSelectedTypes.size === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-700'}`}
                                >
                                    Recalcular
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DealModal;
