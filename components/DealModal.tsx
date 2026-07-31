import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, DollarSign, Calendar, FileText, User, Info, Building, Check, AlertCircle, Maximize2, Layers, UserCheck, Percent, PenLine, ArrowLeft, Mail, Phone, MapPin, Pencil, Trash2, Plus, RefreshCw, BedDouble, Bath, DoorClosed, Car, Compass, ShieldCheck, FileDown, Settings } from 'lucide-react';
import { Property, PropertyDeal, Client, Organization, PaymentInstallment, BrokerProfile, PaymentType, DealUnit } from '../types';
import { commercialService, dealUnitsOf, dealUnitsTotal } from '../services/commercialService';
import ActionIconButton from './ui/ActionIconButton';
import { ColumnConfig, useTableColumns, ColumnConfigButton } from './ui/TableUtils';
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
import { contractService, generateRecurringInstallmentsForPeriod } from '../services/contractService';
import { buildRentalResolveContext } from '../services/rentalDocumentContextService';
import EmitDocumentModal from './EmitDocumentModal';
import DocxTemplateManager from './DocxTemplateManager';
import { contractRenewalService } from '../services/contractRenewalService';
import { Contract } from '../types';
import DealWorkflowBar from './DealWorkflowBar';
import { DealWorkflowStatus } from '../lib/dealWorkflow';
import DealSignaturePanel from './DealSignaturePanel';
import ContractRenewalsPanel from './rentals/ContractRenewalsPanel';
import RentalGuaranteePanel from './rentals/RentalGuaranteePanel';
import DocumentVersionsPanel from './contracts/DocumentVersionsPanel';
import CreditAnalysisPanel from './CreditAnalysisPanel';
import { useConfirm } from './ui/confirm';
import { useStore } from '../store/useStore';

type TabId = 'cliente' | 'unidade' | 'pagamento' | 'parcelas' | 'partes' | 'contrato' | 'garantias';

/** Data BR por split — `new Date(iso)` retrocede um dia em UTC-3. */
const fmtDateBR = (iso?: string) => {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
};

/** Alvo da geração de parcelas: a negociação, um contrato da cadeia ou um aditivo. */
interface GenerateTarget {
    id: string;
    kind: 'CONTRACT' | 'ADDENDUM';
    label: string;
    periodo: string;
    fromDate: string;
    toDate: string;
    amount: number;
    contract: Contract;
}

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
            <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
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
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Tipo de Desconto</label>
                        <select
                            value={discountType}
                            onChange={(e) => setDiscountType(e.target.value as 'VALUE' | 'PERCENT' | '')}
                            className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        >
                            <option value="">Remover desconto de todas</option>
                            <option value="VALUE">Desconto em R$ (mesmo valor em todas)</option>
                            <option value="PERCENT">Desconto em % (mesmo percentual em todas)</option>
                        </select>
                    </div>

                    {discountType !== '' && (
                        <div>
                            <label className="text-xs font-semibold text-slate-500 mb-1 block">
                                Valor do desconto {discountType === 'PERCENT' ? '(%)' : '(R$)'}
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={discountAmount}
                                onChange={(e) => setDiscountAmount(e.target.value)}
                                placeholder={discountType === 'PERCENT' ? 'Ex: 10' : 'Ex: 100,00'}
                                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            />
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Forma de Pagamento</label>
                        <select
                            value={bulkPaymentType}
                            onChange={(e) => setBulkPaymentType(e.target.value)}
                            className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Tipo de Pagamento</label>
                        <select
                            value={bulkInstallmentType}
                            onChange={(e) => setBulkInstallmentType(e.target.value)}
                            className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        >
                            <option value={BULK_KEEP}>Não alterar</option>
                            <option value="">Nenhum (limpar de todas)</option>
                            {installmentTypes.map(t => (
                                <option key={t.code || t.id} value={t.code}>{t.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="bg-gray-50 rounded-[10px] border border-gray-100 divide-y divide-gray-100 max-h-40 overflow-y-auto">
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
                        className="flex-1 h-9 rounded-[6px] bg-white border border-gray-200 shadow-sm text-gray-600 font-medium text-[13px] hover:text-gray-900 transition-all active:scale-95"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!canSave}
                        className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[6px] bg-blue-600 text-white font-medium text-[13px] hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-40"
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
    /** Abre direto numa aba (ex.: 'contrato', vindo da fila de Renovações). */
    initialTab?: string;
}

// Mesmas colunas nas duas séries da aba Parcelas (plano de pagamento e parcelas
// do contrato) — ver comentário em torno de contractEntries: elas têm que ler
// igual, então compartilham a mesma configuração de colunas visíveis.
const PARCELAS_COLUMNS: ColumnConfig[] = [
    { key: 'vencimento', label: 'Vencimento', sortable: false },
    { key: 'valor', label: 'Valor', sortable: false },
    { key: 'desconto', label: 'Desconto', sortable: false },
    { key: 'valor_final', label: 'Valor final', sortable: false },
    { key: 'tipo', label: 'Tipo', sortable: false },
    { key: 'forma_pagto', label: 'Forma pagto.', sortable: false },
    { key: 'descricao', label: 'Descrição', sortable: false },
    { key: 'actions', label: 'Ações', sortable: false },
];

const DealModal: React.FC<DealModalProps> = ({ isOpen, onClose, initialData, onSave, defaultType, organizationId, buildingId, initialTab }) => {
    const [activeTab, setActiveTab] = useState<TabId>((initialTab as TabId) || 'cliente');
    // Sub-aba de "Contrato e Assinatura" (só locação com contrato gerado).
    const [contratoSubTab, setContratoSubTab] = useState<'dados' | 'renovacoes' | 'documentos'>('dados');
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
            // Abre na aba pedida por quem chamou (a fila de Renovações manda
            // 'contrato'); sem isso o modal sempre voltava para 'cliente'.
            setActiveTab((initialTab as TabId) || 'cliente');
            setContratoSubTab(initialTab === 'contrato' ? 'renovacoes' : 'dados');
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

    /**
     * Locação — Forma de Pagamento: o Valor Total do Contrato é SEMPRE
     * mensal × parcelas, e por isso é read-only. Digitar um total que
     * contradiz os outros dois campos não é um caso real: na assinatura o
     * total É o produto. A única forma legítima de divergir nasce depois, ao
     * aplicar desconto numa parcela já lançada — e aí quem grava é a pergunta
     * `perguntarCorrigirTotalContrato`, com o usuário decidindo.
     *
     * Consequência assumida: mexer no mensal ou no nº de parcelas depois de um
     * desconto reescreve o total pelo produto. É o certo — mudou o que foi
     * acordado, o desconto anterior não vale mais como base.
     */
    const rentalComputedTotal = (d: Partial<PropertyDeal>) =>
        Number((((d.installment_value || 0) * (d.installments || 0))).toFixed(2));

    /** Total salvo ≠ mensal × parcelas: só acontece via desconto nas parcelas. */
    const divergeDoProduto = formData.type === 'RENTAL'
        && (formData.contract_total_value ?? 0) > 0
        && Math.abs((formData.contract_total_value ?? 0) - rentalComputedTotal(formData)) > 0.01;

    const handleRentalMonthlyChange = (raw: string) => {
        const monthly = raw === '' ? undefined : parseFloat(raw) || 0;
        setFormData(prev => {
            const next = { ...prev, installment_value: monthly };
            return { ...next, contract_total_value: rentalComputedTotal(next) };
        });
    };

    const handleRentalInstallmentsChange = (raw: string) => {
        const n = raw === '' ? undefined : Math.max(1, Math.floor(Number(raw) || 1));
        setFormData(prev => {
            const next = { ...prev, installments: n };
            return { ...next, contract_total_value: rentalComputedTotal(next) };
        });
    };

    const [properties, setProperties] = useState<Property[]>([]);
    /** Unidade cujo cartão de detalhe/specs está aberto na aba Unidades. */
    const [expandedUnitId, setExpandedUnitId] = useState<string | null>(null);
    const [clients, setClients] = useState<Client[]>([]);
    const [projects, setProjects] = useState<ProjectData[]>([]);
    const [brokers, setBrokers] = useState<BrokerProfile[]>([]);
    const [loading, setLoading] = useState(false);
    // Aviso padrão de salvamento — mostrado dentro da própria tela "Gerenciar
    // Negociação" (tela cheia) antes de fechar, já que o toast do módulo-pai só
    // aparece depois que a tela some (o usuário não via confirmação nenhuma).
    const [savedNotice, setSavedNotice] = useState(false);
    // Toast de erro (§13) — substitui os alert() nativos, que quebravam a
    // identidade visual e não são acessíveis (mesma razão do §14 p/ confirm()).
    const [errorNotice, setErrorNotice] = useState<string | null>(null);
    const notifyError = (message: string) => {
        setErrorNotice(message);
        setTimeout(() => setErrorNotice(null), 5000);
    };
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
    // Colunas visíveis da aba Parcelas — compartilhada pelas duas tabelas (plano
    // de pagamento e parcelas do contrato), guia §5.2 (toolbar acoplada).
    const parcelasCols = useTableColumns(PARCELAS_COLUMNS, 'dealModalParcelasColumns');
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
    /**
     * Pergunta se o Valor do Fechamento deve acompanhar o desconto.
     *
     * O desconto muda o que será COBRADO, não o preço combinado — por isso a
     * decisão é do usuário: desconto comercial (o fechamento cai) × condição de
     * pagamento (o preço fica, e a soma das parcelas passa a divergir de
     * propósito, o que a faixa âmbar da aba Parcelas já sinaliza).
     *
     * ⚠️ O Valor do Fechamento é a SOMA DAS UNIDADES (aba Unidade, campo
     * read-only). Aceitar aqui desacopla os dois: o total do negócio deixa de
     * bater com o rateio por unidade. Por isso a pergunta diz isso.
     */
    const perguntarCorrigirFechamento = async (liquido: number) => {
        const atual = formData.value || 0;
        if (Math.abs(liquido - atual) < 0.01) return;
        const fmt = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
        const ok = await confirm({
            title: 'Corrigir o Valor do Fechamento?',
            message: `Com o desconto, a soma das parcelas passa a ser ${fmt(liquido)}, e o Valor do Fechamento é ${fmt(atual)}. `
                + `Atualizar o fechamento para ${fmt(liquido)}? `
                + 'O total deixa de ser a soma das unidades — mantenha como está se o desconto for só condição de pagamento.',
            variant: 'default',
            confirmLabel: 'Atualizar fechamento',
            cancelLabel: 'Manter valor',
        });
        if (ok) setFormData(prev => ({ ...prev, value: Number(liquido.toFixed(2)) }));
    };

    /**
     * Pergunta se o Valor Total do Contrato deve acompanhar o desconto.
     *
     * Na geração o total é sempre mensal × parcelas — não há como divergir. A
     * divergência só nasce DEPOIS, quando o usuário aplica um desconto numa
     * parcela já lançada: aí a soma do que será cobrado deixa de bater com o
     * total acordado. Quem decide é o usuário, pela mesma razão do
     * perguntarCorrigirFechamento: desconto comercial baixa o total; desconto
     * pontual (pagamento antecipado, acerto de um mês) não mexe no contrato.
     */
    const perguntarCorrigirTotalContrato = async (somaCobrada: number) => {
        const atual = Number(formData.contract_total_value) || 0;
        if (!(atual > 0) || Math.abs(somaCobrada - atual) < 0.01) return;
        const fmt = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
        const ok = await confirm({
            title: 'Ajustar o Valor Total do Contrato?',
            message: `Com o desconto, a soma das parcelas passa a ser ${fmt(somaCobrada)}, e o Valor Total do Contrato é ${fmt(atual)}. `
                + `Atualizar o total para ${fmt(somaCobrada)}? `
                + 'Mantenha como está se o desconto for pontual e o valor acordado não mudou.',
            variant: 'default',
            confirmLabel: 'Atualizar total',
            cancelLabel: 'Manter valor',
        });
        if (ok) setFormData(prev => ({ ...prev, contract_total_value: Number(somaCobrada.toFixed(2)) }));
    };

    /** Soma líquida do plano (parcelas com desconto aplicado + entrada). */
    const somaLiquidaPlano = (insts?: PaymentInstallment[]) =>
        (insts ?? formData.custom_installments ?? []).reduce((acc, i) => acc + i.value, 0)
        + (formData.down_payment || 0);

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
        // setFormData acima é assíncrono; o cálculo aqui reproduz o resultado
        // para não perguntar com o valor antigo.
        const liquido = (formData.custom_installments || []).reduce((acc, i) => {
            if (!selectedInstallmentIds.has(i.id)) return acc + i.value;
            const base = i.originalValue ?? i.value;
            const desc = patch.discountType === 'PERCENT' ? (base * patch.discountAmount) / 100
                : patch.discountType === 'VALUE' ? patch.discountAmount : 0;
            return acc + Math.max(0, base - desc);
        }, 0) + (formData.down_payment || 0);
        void perguntarCorrigirFechamento(liquido);
    };

    // Ponte Negociação → Contrato formal. Venda (domain='VENDAS') gera um contrato
    // de compra e venda; Locação (domain='LOCACAO') gera um contrato recorrente.
    const [linkedContract, setLinkedContract] = useState<Contract | null>(null);
    // Gerar Parcelas: alvo escolhido ('DEAL' = plano de pagamento da negociação)
    const [generateTarget, setGenerateTarget] = useState<string>('DEAL');
    const [generateTargets, setGenerateTargets] = useState<GenerateTarget[]>([]);
    const alvoSelecionado = generateTargets.find(t => t.id === generateTarget);
    const [generateResult, setGenerateResult] = useState<{ ok: boolean; msg: string } | null>(null);
    // Aba Parcelas: qual série está sendo exibida — 'DEAL' (plano de pagamento
    // da negociação) ou um contrato (parcelas em Contas a Receber). São origens
    // diferentes, e antes só a primeira tinha tela.
    const [viewTarget, setViewTarget] = useState<string>('DEAL');
    const [contractEntries, setContractEntries] = useState<{
        id: string; transaction_date: string; amount: number; status: string; description: string | null;
        original_amount?: number | null; discount_type?: string | null; discount_amount?: number | null;
        installment_type?: string | null; payment_type?: string | null;
    }[]>([]);
    const [loadingEntries, setLoadingEntries] = useState(false);
    // Selecao em lote da serie do CONTRATO — espelha selectedInstallmentIds do
    // plano de pagamento, inclusive o Shift+clique (guia §10.1).
    const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
    const [lastEntryIndex, setLastEntryIndex] = useState<number | null>(null);
    const [showEntryLoteModal, setShowEntryLoteModal] = useState(false);
    const [generatingContract, setGeneratingContract] = useState(false);
    const [contractError, setContractError] = useState<string | null>(null);
    // Emissão do documento (minuta) do contrato — ver EmitDocumentModal.
    const [emitOpen, setEmitOpen] = useState(false);
    const [docxManagerOpen, setDocxManagerOpen] = useState(false);
    // Remonta o DocumentVersionsPanel para o usuário VER a versão recém-gravada
    // aparecer (o painel não expõe recarga imperativa).
    const [docsRefreshKey, setDocsRefreshKey] = useState(0);

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

    // Contexto de emissão do documento. `useCallback` porque o EmitDocumentModal
    // o usa como dependência de efeito — uma arrow nova a cada render refaria a
    // carga sem parar.
    const loadRentalDocContext = useCallback(() => {
        if (!linkedContract) return Promise.resolve({});
        return buildRentalResolveContext({
            contractId: linkedContract.id,
            dealId: formData.id,
            organizationId: linkedContract.organization_id || formData.organization_id || organizationId,
        });
    }, [linkedContract, formData.id, formData.organization_id, organizationId]);

    /* Ação de emitir a minuta. Aparece em dois lugares — no card "Contrato
       Gerado" (onde a geração termina hoje num beco sem saída) e no topo da
       sub-aba Documentos (para quem já está lá vendo as versões). */
    const emitDocumentActions = (
        <div className="flex flex-wrap items-center gap-2">
            <button
                type="button"
                onClick={() => setEmitOpen(true)}
                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
            >
                <FileDown className="w-[15px] h-[15px]" />
                Gerar Documento do Contrato
            </button>
            <button
                type="button"
                onClick={() => setDocxManagerOpen(true)}
                className="flex items-center gap-1.5 h-9 px-3 text-blue-600 hover:text-blue-700 font-medium text-[13px] transition-all"
            >
                <Settings className="w-[15px] h-[15px]" />
                Modelos de documento
            </button>
        </div>
    );

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
                end_date: formData.end_date,
                billing_cycle: formData.billing_cycle,
                reajuste_index: formData.reajuste_index,
                // Fonte do valor da PARCELA do aluguel — `value` é o total do contrato.
                custom_installments: formData.custom_installments,
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

    // ─────────────────────────────────────────────────────────────────────
    // UNIDADES DO CONTRATO
    // Um contrato pode reunir várias unidades (apto + vaga + box no mesmo
    // aluguel). `formData.units` é a fonte de verdade: `value` do contrato é a
    // SOMA das unidades e `property_id` é a unidade principal. Contratos
    // legados (só property_id) são normalizados por dealUnitsOf.
    // ─────────────────────────────────────────────────────────────────────
    const dealUnits = useMemo(() => dealUnitsOf(formData), [formData]);
    const unitsTotal = useMemo(() => dealUnitsTotal(dealUnits), [dealUnits]);

    /** Preço de referência da unidade conforme o eixo (locação usa rental_price). */
    const referenceValueOf = (p: Property | undefined) =>
        !p ? 0 : (formData.type === 'RENTAL' ? (p.rental_price ?? p.price ?? 0) : (p.price ?? 0));

    /** Aplica uma nova lista de unidades e propaga total, principal e comissão. */
    const applyUnits = (next: DealUnit[]) => {
        const normalized = next.map((u, i) => ({ ...u, is_primary: next.some(x => x.is_primary) ? !!u.is_primary : i === 0 }));
        const primary = normalized.find(u => u.is_primary) || normalized[0];
        const total = dealUnitsTotal(normalized);
        const primaryProp = properties.find(p => p.id === primary?.property_id);
        setFormData(prev => ({
            ...prev,
            units: normalized,
            property_id: primary?.property_id || '',
            value: total,
            broker_commission_value: recalcCommission(total, prev.broker_commission_pct || 0),
            linked_project_id: primaryProp?.project_id || prev.linked_project_id || ''
        }));
    };

    const addUnit = (propertyId: string) => {
        if (!propertyId || dealUnits.some(u => u.property_id === propertyId)) return;
        const prop = properties.find(p => p.id === propertyId);
        applyUnits([...dealUnits, {
            property_id: propertyId,
            value: referenceValueOf(prop),
            is_primary: dealUnits.length === 0
        }]);
        setExpandedUnitId(propertyId);
    };

    const removeUnit = (propertyId: string) => {
        const rest = dealUnits.filter(u => u.property_id !== propertyId);
        // Se a principal saiu, a primeira restante assume.
        applyUnits(rest.map((u, i) => ({ ...u, is_primary: i === 0 })));
        if (expandedUnitId === propertyId) setExpandedUnitId(null);
    };

    const setUnitValue = (propertyId: string, value: number) =>
        applyUnits(dealUnits.map(u => u.property_id === propertyId ? { ...u, value } : u));

    const setPrimaryUnit = (propertyId: string) =>
        applyUnits(dealUnits.map(u => ({ ...u, is_primary: u.property_id === propertyId })));

    const availableToAdd = useMemo(
        () => properties.filter(p => !dealUnits.some(u => u.property_id === p.id)),
        [properties, dealUnits]
    );

    /** Obras distintas entre as unidades — só para avisar, nunca bloquear. */
    const mixedProjects = useMemo(() => {
        const ids = new Set(dealUnits
            .map(u => properties.find(p => p.id === u.property_id)?.project_id)
            .filter(Boolean) as string[]);
        return ids.size > 1;
    }, [dealUnits, properties]);

    const selectedProperty = properties.find(p => p.id === formData.property_id);
    const expandedProperty = properties.find(p => p.id === (expandedUnitId || formData.property_id));
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
    // Alvos disponíveis também na aba Parcelas (para o seletor de visualização).
    useEffect(() => {
        if (activeTab === 'parcelas' && linkedContract && generateTargets.length === 0) {
            void carregarAlvosDeGeracao();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, linkedContract]);

    useEffect(() => {
        // Trocar de série zera a seleção: manter ids de outra lista deixaria a
        // barra de lote contando parcelas que não estão mais na tela.
        setSelectedEntryIds(new Set());
        setLastEntryIndex(null);
        if (viewTarget === 'DEAL') { setContractEntries([]); return; }
        const alvo = generateTargets.find(t => t.id === viewTarget);
        if (!alvo) return;
        let ativo = true;
        setLoadingEntries(true);
        contractService.listFinancialEntries(alvo.contract)
            .then(rows => { if (ativo) setContractEntries(rows); })
            .catch(e => console.error('[DealModal] Erro ao listar parcelas do contrato:', e))
            .finally(() => { if (ativo) setLoadingEntries(false); });
        return () => { ativo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewTarget, generateTargets]);

    /**
     * Edita uma parcela do contrato. Atualiza a tela na hora (otimista) e grava;
     * se o banco recusar (parcela paga), recarrega a série e mostra o motivo —
     * é o mesmo comportamento das células do plano de pagamento.
     */
    const patchContractEntry = (entryId: string, patch: {
        due_date?: string; amount?: number; description?: string;
        discount_type?: string | null; discount_amount?: number | null;
        installment_type?: string | null; payment_type?: string | null;
    }) => {
        setContractEntries(prev => prev.map(e => e.id === entryId
            ? {
                ...e,
                ...(patch.due_date ? { transaction_date: patch.due_date } : {}),
                ...(patch.amount != null ? { amount: patch.amount } : {}),
                ...(patch.description != null ? { description: patch.description } : {}),
                ...(patch.discount_type !== undefined ? { discount_type: patch.discount_type } : {}),
                ...(patch.discount_amount !== undefined ? { discount_amount: patch.discount_amount } : {}),
                ...(patch.installment_type !== undefined ? { installment_type: patch.installment_type } : {}),
                ...(patch.payment_type !== undefined ? { payment_type: patch.payment_type } : {}),
            }
            : e));
        // Valor e desconto são recalculados no servidor (bruto → líquido), então
        // a linha é relida depois; os demais campos ficam com o estado otimista.
        const recalcula = patch.amount != null
            || patch.discount_type !== undefined || patch.discount_amount !== undefined;
        // Desconto muda o que será COBRADO; o total acordado é decisão do usuário.
        const mexeuNoDesconto = patch.discount_type !== undefined || patch.discount_amount !== undefined;
        void contractService.updateFinancialEntry(entryId, patch)
            .then(async () => {
                if (!recalcula) return;
                const alvo = generateTargets.find(t => t.id === viewTarget);
                if (!alvo) return;
                const rows = await contractService.listFinancialEntries(alvo.contract);
                setContractEntries(rows);
                if (mexeuNoDesconto) {
                    await perguntarCorrigirTotalContrato(
                        rows.reduce((s, r) => s + (Number(r.amount) || 0), 0));
                }
            })
            .catch(async (err) => {
                setContractError(err instanceof Error ? err.message : 'Erro ao salvar a parcela.');
                const alvo = generateTargets.find(t => t.id === viewTarget);
                if (alvo) setContractEntries(await contractService.listFinancialEntries(alvo.contract));
            });
    };

    /** Seleção com intervalo por Shift+clique — mesmo comportamento do plano. */
    const handleEntryRowCheck = (id: string, index: number, checked: boolean, shiftKey: boolean, visiveis: string[]) => {
        setSelectedEntryIds(prev => {
            const next = new Set(prev);
            if (shiftKey && lastEntryIndex !== null) {
                const [ini, fim] = lastEntryIndex < index ? [lastEntryIndex, index] : [index, lastEntryIndex];
                visiveis.slice(ini, fim + 1).forEach(v => next.add(v));
                return next;
            }
            if (checked) next.add(id); else next.delete(id);
            return next;
        });
        if (!shiftKey) setLastEntryIndex(index);
    };

    /**
     * Aplica desconto / tipo / forma de pagamento às parcelas selecionadas do
     * contrato. Usa o MESMO modal do plano de pagamento; a diferença é que aqui
     * cada linha é gravada no banco (uma por vez, para o servidor recalcular o
     * líquido pela mesma regra) e a série é relida no fim.
     */
    const applyBulkEntryEdit = async (patch: {
        discountType: 'VALUE' | 'PERCENT' | null;
        discountAmount: number;
        paymentType?: PaymentInstallment['paymentType'];
        installmentType?: PaymentInstallment['installmentType'];
    }) => {
        const alvos = contractEntries.filter(e => selectedEntryIds.has(e.id) && e.status === 'PENDING');
        setShowEntryLoteModal(false);
        try {
            for (const e of alvos) {
                await contractService.updateFinancialEntry(e.id, {
                    discount_type: patch.discountType,
                    discount_amount: patch.discountType ? patch.discountAmount : null,
                    ...(patch.paymentType !== undefined ? { payment_type: patch.paymentType || null } : {}),
                    ...(patch.installmentType !== undefined ? { installment_type: patch.installmentType || null } : {}),
                });
            }
            const alvo = generateTargets.find(t => t.id === viewTarget);
            if (alvo) {
                const rows = await contractService.listFinancialEntries(alvo.contract);
                setContractEntries(rows);
                // Mesmo desvio do desconto avulso: a soma cobrada deixa de bater
                // com o total acordado, e quem decide é o usuário.
                await perguntarCorrigirTotalContrato(
                    rows.reduce((s, r) => s + (Number(r.amount) || 0), 0));
            }
            setSelectedEntryIds(new Set());
        } catch (err) {
            setContractError(err instanceof Error ? err.message : 'Erro ao editar as parcelas em lote.');
        }
    };

    /** Exclui uma parcela lançada pelo contrato. Paga/conciliada é recusada pelo serviço. */
    const handleRemoveContractEntry = async (entryId: string) => {
        const ok = await confirm({
            title: 'Excluir esta parcela?',
            message: 'A cobrança sai de Contas a Receber. Parcela já paga ou conciliada não pode ser excluída.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await contractService.removeFinancialEntry(entryId);
            setContractEntries(prev => prev.filter(e => e.id !== entryId));
        } catch (e) {
            setContractError(e instanceof Error ? e.message : 'Erro ao excluir a parcela.');
        }
    };

    const handleOpenGenerateModal = () => {
        setGenerateInstallmentType('MENSAL');
        setGenerateInstallmentCount(Math.max(1, Math.floor(Number(formData.installments) || 1)));
        setGenerateFirstDueDate(formData.payment_due_date || formData.date || new Date().toISOString().split('T')[0]);
        setGenerateTarget('DEAL');
        setGenerateResult(null);
        void carregarAlvosDeGeracao();
        setShowGenerateModal(true);
    };

    /**
     * Alvos possíveis da geração: a própria negociação (plano de pagamento) ou
     * um CONTRATO da cadeia de renovação / o período de um ADITIVO.
     *
     * Locação tem duas origens de parcela — a série da negociação
     * (`tx-{dealId}-…`) e a do contrato (`CONTRACT_RECURRING`). Sem escolher o
     * alvo, não havia como gerar as parcelas de uma prorrogação por aqui.
     */
    const carregarAlvosDeGeracao = async () => {
        if (!linkedContract) { setGenerateTargets([]); return; }
        try {
            const cadeia = await contractRenewalService.getRenewalChain(linkedContract.id);
            const contratos = cadeia.length > 0 ? cadeia : [linkedContract];
            const listas = await Promise.all(contratos.map(c => contractService.listAddendums(c.id)));

            const alvos: GenerateTarget[] = contratos.map(c => ({
                id: c.id,
                kind: 'CONTRACT' as const,
                label: `Contrato ${c.number}`,
                periodo: `${c.start_date ?? ''} a ${c.end_date ?? ''}`,
                fromDate: c.start_date,
                toDate: c.end_date ?? '',
                amount: c.current_value ?? c.original_value ?? 0,
                contract: c,
            }));

            listas.flat()
                .filter(a => a.new_start_date && a.new_end_date && a.status !== 'Cancelado')
                .forEach(a => {
                    const dono = contratos.find(c => c.id === a.contract_id);
                    if (!dono) return;
                    alvos.push({
                        id: `ad:${a.id}`,
                        kind: 'ADDENDUM',
                        label: `Aditivo ${a.number} (${dono.number})`,
                        periodo: `${a.new_start_date} a ${a.new_end_date}`,
                        fromDate: a.new_start_date!,
                        toDate: a.new_end_date!,
                        amount: a.new_value ?? dono.current_value ?? 0,
                        contract: dono,
                    });
                });

            setGenerateTargets(alvos);
        } catch (e) {
            console.error('[DealModal] Erro ao carregar alvos de geração:', e);
            setGenerateTargets([]);
        }
    };

    /**
     * Valor e quantidade da geração no contrato — vêm dos campos da aba Forma de
     * Pagamento (Valor Mensal do Contrato e Número de Parcelas), que são o que o
     * usuário negociou. O valor do próprio contrato (current/original_value) fica
     * só como fallback de contrato antigo, cadastrado antes desses campos.
     * O Valor Total é sempre mensal × parcelas — não entra como terceiro input
     * porque divergir dele aqui seria contradição; a divergência só nasce depois,
     * ao aplicar desconto numa parcela (ver perguntarCorrigirTotalContrato).
     */
    const geracaoContrato = (target: GenerateTarget) => {
        const mensal = Number(formData.installment_value) || 0;
        const parcelas = Math.floor(Number(formData.installments) || 0);
        return {
            amount: mensal > 0 ? mensal : target.amount,
            maxCount: parcelas > 0 ? parcelas : undefined,
            usouCampos: mensal > 0,
        };
    };

    /**
     * Gera as parcelas de um CONTRATO ou de um ADITIVO — cadência (ciclo, dia de
     * vencimento) vem do contrato; a janela, do alvo escolhido; valor e
     * quantidade, dos campos da aba Forma de Pagamento.
     * Idempotente por data: repetir não duplica.
     */
    const handleGenerateForContract = async (target: GenerateTarget) => {
        setLoading(true);
        try {
            const { amount, maxCount } = geracaoContrato(target);
            const r = await generateRecurringInstallmentsForPeriod(target.contract, {
                fromDate: target.fromDate,
                toDate: target.toDate,
                amount,
                maxCount,
                label: target.label,
            });
            // O modal continua ABERTO com o resultado: as parcelas de contrato vão
            // para Contas a Receber (internal_transactions), NÃO para o plano de
            // pagamento desta negociação — fechar em silêncio dava a impressão de
            // que nada tinha sido gerado.
            // Período REAL da série gerada — com o Nº de Parcelas mandando, o
            // último vencimento pode passar do fim da vigência do contrato, e
            // repetir a janela pedida aqui mentiria sobre o que foi lançado.
            const ini = r.dueDates[0] ?? target.fromDate;
            const fim = r.dueDates[r.dueDates.length - 1] ?? target.toDate;
            setGenerateResult(r.inserted > 0
                ? { ok: true, msg: `${r.inserted} parcela(s) geradas em Contas a Receber para ${target.label}, de ${fmtDateBR(ini)} a ${fmtDateBR(fim)}. Elas não aparecem na aba Parcelas: lá fica o plano de pagamento da negociação.` }
                : { ok: false, msg: `Nenhuma parcela nova — as ${r.skipped} do período (${fmtDateBR(ini)} a ${fmtDateBR(fim)}) já existiam em Contas a Receber.` });
        } catch (e) {
            // Log detalhado: o erro do PostgREST traz code/details/hint que a
            // mensagem sozinha esconde — sem isso, "não gerou" fica indepurável.
            console.error('[DealModal] Falha ao gerar parcelas do contrato:', {
                alvo: target.label, contrato: target.contract.number,
                janela: [target.fromDate, target.toDate],
                valor: geracaoContrato(target).amount,
                parcelas: geracaoContrato(target).maxCount,
                ciclo: target.contract.billing_cycle, dia: target.contract.due_day,
                erro: e,
            });
            const det = (e as { message?: string; details?: string; hint?: string; code?: string });
            setGenerateResult({
                ok: false,
                msg: [det?.message, det?.details, det?.hint, det?.code && `(${det.code})`]
                    .filter(Boolean).join(' · ') || 'Erro ao gerar as parcelas do contrato.',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmGenerateInstallments = async (installmentType: NonNullable<PaymentInstallment['installmentType']>, installmentCount: number, firstDueDate: string) => {
        if (formData.id) {
            setLoading(true);
            try {
                const orgId = formData.organization_id || organizationId || '';
                const { hasPaid, paidCount } = await commercialFinanceService.hasPaidInstallments(formData.id, orgId);
                if (hasPaid) {
                    notifyError(`Não é possível regerar as parcelas. Esta negociação possui ${paidCount} parcela(s) com status "PAGO" no módulo financeiro. Para habilitar a regeração, você deve primeiro reverter o status dessas parcelas para "PENDENTE" no financeiro.`);
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
            notifyError('Selecione um imóvel antes de exportar.');
            return;
        }
        // Todas as unidades do contrato, na ordem da lista (principal primeiro).
        const unitProperties = dealUnits
            .map(u => properties.find(p => p.id === u.property_id))
            .filter(Boolean) as Property[];
        propertyExportService.generateProposalPDF(formData as PropertyDeal, selectedProperty, selectedClient, org, unitProperties);
    };

    const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
        if (e) e.preventDefault();

        if (dealUnits.length === 0 || !formData.client_id) {
            setActiveTab(dealUnits.length === 0 ? 'unidade' : 'cliente');
            notifyError('Por favor, selecione ao menos um imóvel e o cliente para continuar.');
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
                notifyError('Erro: Organização não identificada. Por favor, recarregue a página.');
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
            notifyError(`Erro ao salvar negociação: ${err.message || 'Erro de conexão/banco'}`);
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
    const hasMissingProperty = dealUnits.length === 0;
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
            // O plano de pagamento saiu de "Forma de Pagamento" para cá: lá são
            // as CONDIÇÕES do acordo, aqui é a lista de cobranças — tarefa
            // diferente, e que precisa da largura toda da tela.
            id: 'parcelas',
            label: 'Parcelas',
            icon: <Layers className="w-4 h-4" />,
            badge: (formData.custom_installments?.length ?? 0) > 0,
        },
        {
            id: 'partes',
            label: 'Partes e Comissões',
            icon: <UserCheck className="w-4 h-4" />,
            badge: hasBroker
        },
        {
            id: 'contrato',
            label: 'Contrato',
            icon: <PenLine className="w-4 h-4" />,
            badge: !!hasContratoContent
        },
        // Só locação: garantia locatícia é regida pela Lei do Inquilinato e não
        // existe em venda de ativo nem em prestação de serviço.
        ...(formData.type === 'RENTAL' ? [{
            id: 'garantias' as TabId,
            label: 'Garantias Locatícias',
            icon: <ShieldCheck className="w-4 h-4" />,
            badge: !linkedContract,
        }] : []),
    ];

    // `absolute` (não `fixed`): Layout.tsx tem <main className="relative"> abaixo da
    // barra superior sticky (irmã do main, não ancestral) — absolute preenche só a
    // área de conteúdo, deixando a barra visível. `fixed` ignora esse container e
    // cobre a janela inteira, escondendo a navegação do app.
    // Em tela cheia o fundo é o mesmo `bg-gray-50` do shell do app (Layout.tsx),
    // para os cards brancos terem o contraste de Gestão de Unidades. Em modal, o
    // card continua branco sobre o backdrop escuro.
    return (
        <div className={isEditMode ? 'absolute inset-0 z-[110] bg-gray-50 flex flex-col' : 'absolute inset-0 z-[110] flex items-center justify-center p-8'}>
            {!isEditMode && (
                <div className="absolute inset-0 bg-[#0B1727]/80 backdrop-blur-xl animate-in fade-in duration-300" onClick={onClose} />
            )}

            <div className={isEditMode
                ? 'relative w-full h-full overflow-hidden flex flex-col animate-in fade-in duration-300'
                : 'relative bg-white w-full h-full overflow-hidden rounded-[10px] shadow-2xl border border-white/20 animate-in zoom-in-95 duration-300 flex flex-col'
            }>

                {/* Cabeçalho — §20: h1 solto + subtítulo mt-1.5, sem card/banda colorida.
                    Sem blocos de métrica: tela de edição não exibe KPI (ver abaixo). */}
                <div className="px-8 pt-6 pb-3 shrink-0">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                                {formData.id ? 'Gerenciar Negociação' : 'Nova Negociação Comercial'}
                            </h1>
                            <p className="text-gray-400 text-sm mt-1.5 font-medium truncate max-w-xl">
                                {selectedProperty
                                    ? `${selectedProperty.name}${dealUnits.length > 1 ? ` +${dealUnits.length - 1}` : ''} • ${selectedProperty.address}`
                                    : 'Registro de ativo imobiliário'}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            title={isEditMode ? 'Voltar' : 'Fechar'}
                            className="h-9 w-9 shrink-0 flex items-center justify-center bg-white text-gray-400 rounded-[6px] border border-gray-200 shadow-sm hover:text-blue-600 hover:border-blue-200 transition-all active:scale-95"
                        >
                            {isEditMode ? <ArrowLeft className="w-4 h-4" /> : <X className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {/* Toolbar de abas — §19.1: trilho bg-gray-50 em card branco, aba ativa
                    bg-white text-blue-600 shadow-sm; flex-wrap, nunca overflow-x-auto. */}
                <div className="px-8 shrink-0">
                    <div className="flex items-center bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                        <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                            {tabs.map((tab) => {
                                const isActive = activeTab === tab.id;
                                // Ponto de atenção por aba: vermelho = obrigatório faltando,
                                // âmbar/azul = informativo. Mantém o sinal sem virar pílula (§8).
                                const dot = tab.id === 'cliente' && hasMissingClient ? 'bg-red-400'
                                    : tab.id === 'unidade' && hasMissingProperty ? 'bg-red-400'
                                    : tab.id === 'partes' && hasBroker ? 'bg-amber-400'
                                    : tab.id === 'contrato' && hasContratoContent ? 'bg-blue-400'
                                    // Sem contrato gerado não há a que prender a garantia — vermelho.
                                    : tab.id === 'garantias' && !linkedContract ? 'bg-red-400'
                                    : tab.id === 'parcelas' && tab.badge ? 'bg-blue-400'
                                    : null;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`relative flex items-center gap-1.5 px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                            isActive
                                                ? 'bg-white text-blue-600 shadow-sm'
                                                : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                    >
                                        {tab.icon}
                                        {tab.label}
                                        {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Sem KPIs no cabeçalho: esta é uma tela de EDIÇÃO, não um painel.
                    Tipo/Situação/Valor/Comissão são campos editáveis logo abaixo —
                    repeti-los como cartão só empurrava o formulário para baixo. */}

                {/* Form content */}
                <form
                    id="deal-modal-form"
                    onSubmit={handleSubmit}
                    /* pt-3: as abas acima já carregam mb-3 — somados dão os 24px
                       do último bloco de cromo até o conteúdo (§20.1). */
                    className="flex-1 overflow-y-auto px-8 pb-8 pt-3"
                >
                    {/* ══════════════════════════════════════════
                        ABA 1 — DADOS DO CLIENTE
                    ══════════════════════════════════════════ */}
                    {activeTab === 'cliente' && (
                        <div className="max-w-2xl space-y-8">
                            {/* Cliente */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-blue-600">
                                    <User className="w-5 h-5" />
                                    <h3 className="text-sm font-bold text-gray-800">Cliente / Comprador</h3>
                                    <span className="text-xs font-semibold text-red-500">Obrigatório</span>
                                </div>
                                <select
                                    required
                                    value={formData.client_id || ''}
                                    onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer"
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
                                <div className="p-6 bg-white rounded-[10px] border border-gray-100 space-y-4 animate-in slide-in-from-left-4 duration-500 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-blue-600">
                                            <UserCheck className="w-4 h-4" />
                                            <h4 className="text-sm font-bold text-gray-800">Dados Cadastrados — Conferência</h4>
                                        </div>
                                        {selectedClient.category && (
                                            <span className="text-sm font-normal text-blue-600">
                                                {selectedClient.category}
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-xs font-semibold text-slate-500 mb-1">Tipo de Pessoa</p>
                                            <p className="text-sm font-bold text-gray-800">{selectedClient.type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                                                <FileText className="w-3 h-3" /> CPF / CNPJ
                                            </p>
                                            <p className="text-sm font-bold text-gray-800">{selectedClient.document || '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                                                <Mail className="w-3 h-3" /> E-mail
                                            </p>
                                            <p className="text-sm font-bold text-gray-800 truncate">{selectedClient.email || '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                                                <Phone className="w-3 h-3" /> Telefone
                                            </p>
                                            <p className="text-sm font-bold text-gray-800">{selectedClient.phone || '—'}</p>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
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
                                <label className="text-xs font-semibold text-slate-500">Origem / Canal</label>
                                <select
                                    value={formData.origin_channel || ''}
                                    onChange={(e) => setFormData({ ...formData, origin_channel: e.target.value })}
                                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer"
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

                            {/* Competência do aluguel — só locação. Define o mês de auferimento
                                em relação ao vencimento, usado na apuração por competência. */}
                            {formData.type === 'RENTAL' && (
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-500">Competência do aluguel</label>
                                    <select
                                        value={String(formData.rental_competencia_offset_months ?? 0)}
                                        onChange={(e) => setFormData({ ...formData, rental_competencia_offset_months: parseInt(e.target.value, 10) })}
                                        className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer"
                                    >
                                        <option value="0">Mesmo mês do vencimento</option>
                                        <option value="1">Vence 1 mês após a competência (postecipado)</option>
                                        <option value="2">Vence 2 meses após a competência</option>
                                        <option value="-1">Vence no mês anterior (antecipado)</option>
                                    </select>
                                    <p className="text-xs font-normal text-gray-400 px-1">
                                        Mês em que o aluguel é auferido, em relação ao vencimento. Usado no regime de competência para datar os tributos.
                                    </p>
                                </div>
                            )}

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
                                            <div className="flex items-center gap-2 text-blue-600">
                                                <FileText className="w-5 h-5" />
                                                <h3 className="text-sm font-bold text-gray-800">
                                                    Documentos — {isPJ ? 'Pessoa Jurídica' : 'Pessoa Física'}
                                                </h3>
                                            </div>
                                            <span className="text-sm font-normal text-blue-600">
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
                                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-[10px] border text-left transition-all ${
                                                            isChecked
                                                                ? 'bg-emerald-50 border-emerald-200'
                                                                : 'bg-white border-gray-200 hover:border-blue-300'
                                                        }`}
                                                    >
                                                        <span className={`w-6 h-6 rounded-[6px] flex items-center justify-center shrink-0 border transition-all ${
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
                                <div className="flex items-center gap-2 text-blue-600">
                                    <Building className="w-5 h-5" />
                                    <h3 className="text-sm font-bold text-gray-800">Imóveis da Negociação</h3>
                                    <span className="text-xs font-semibold text-red-500">Obrigatório</span>
                                </div>

                                <p className="text-xs text-gray-500 px-1">
                                    Um mesmo contrato pode reunir várias unidades (apartamento, vaga, box).
                                    O valor de cada uma é editável e o total do contrato é a soma.
                                </p>

                                {/* Lista das unidades do contrato */}
                                <div className="space-y-2">
                                    {dealUnits.length === 0 && (
                                        <div className="p-6 bg-white rounded-[10px] border border-dashed border-gray-200 text-center text-sm text-gray-400">
                                            Nenhuma unidade adicionada. Selecione abaixo.
                                        </div>
                                    )}
                                    {dealUnits.map(u => {
                                        const prop = properties.find(p => p.id === u.property_id);
                                        const isExpanded = (expandedUnitId || formData.property_id) === u.property_id;
                                        return (
                                            <div
                                                key={u.property_id}
                                                className={`flex items-center gap-3 p-3 rounded-[10px] border transition-all ${isExpanded ? 'bg-white border-blue-200 shadow-sm' : 'bg-white border-gray-100'}`}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedUnitId(u.property_id)}
                                                    className="flex-1 text-left min-w-0"
                                                >
                                                    <p className="text-sm text-gray-900 truncate">{prop?.name || 'Unidade removida do inventário'}</p>
                                                    <p className="text-xs text-gray-400 truncate">{prop?.address || '—'}</p>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => setPrimaryUnit(u.property_id)}
                                                    title={u.is_primary ? 'Unidade principal do contrato' : 'Definir como unidade principal'}
                                                    className={`px-2 py-1 rounded-[6px] border text-xs transition-colors shrink-0 ${u.is_primary ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-400 hover:text-blue-600'}`}
                                                >
                                                    {u.is_primary ? 'Principal' : 'Tornar principal'}
                                                </button>

                                                <div className="relative shrink-0">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={u.value || ''}
                                                        onChange={(e) => setUnitValue(u.property_id, parseFloat(e.target.value) || 0)}
                                                        className="w-36 pl-9 pr-3 py-2 bg-white border border-gray-200 focus:border-blue-500 rounded-[6px] outline-none text-sm text-right text-gray-700 transition-all"
                                                        placeholder="0,00"
                                                    />
                                                </div>

                                                <ActionIconButton
                                                    kind="delete"
                                                    title="Remover unidade do contrato"
                                                    onClick={() => removeUnit(u.property_id)}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Adicionar unidade */}
                                <select
                                    value=""
                                    onChange={(e) => addUnit(e.target.value)}
                                    disabled={availableToAdd.length === 0}
                                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <option value="">
                                        {availableToAdd.length === 0
                                            ? 'Todas as unidades do inventário já estão neste contrato'
                                            : '+ Adicionar unidade ao contrato...'}
                                    </option>
                                    {availableToAdd.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.name} - R$ {referenceValueOf(p).toLocaleString('pt-BR')}
                                        </option>
                                    ))}
                                </select>

                                {/* Total do contrato */}
                                {dealUnits.length > 0 && (
                                    <div className="flex items-center justify-between px-6 py-4 bg-blue-50 rounded-[10px] border border-blue-100">
                                        <span className="text-sm font-normal text-gray-500">
                                            Total do contrato · {dealUnits.length} {dealUnits.length === 1 ? 'unidade' : 'unidades'}
                                        </span>
                                        <span className="text-2xl font-bold text-gray-900">
                                            R$ {unitsTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                )}

                                {mixedProjects && (
                                    <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 rounded-[10px] border border-amber-100 text-xs text-amber-700">
                                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                        <span>
                                            As unidades deste contrato pertencem a obras diferentes. O contrato será
                                            vinculado à obra da unidade principal.
                                        </span>
                                    </div>
                                )}

                                {expandedProperty && (
                                    <div className="p-6 bg-white rounded-[10px] border border-gray-100 flex items-center gap-6 animate-in slide-in-from-left-4 duration-500 shadow-sm">
                                        <div className="w-20 h-20 rounded-[6px] border-2 border-white shadow-lg overflow-hidden bg-white shrink-0">
                                            {expandedProperty.images?.[0] ?
                                                <img src={expandedProperty.images[0]} className="w-full h-full object-cover" alt="Preview" /> :
                                                <div className="w-full h-full flex items-center justify-center text-gray-200"><Building className="w-10 h-10" /></div>
                                            }
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-base font-bold text-gray-900">{expandedProperty.name}</p>
                                                <span className="text-sm font-normal text-blue-600">Ativo Disponível</span>
                                            </div>
                                            <p className="text-sm font-normal text-gray-500 leading-relaxed">{expandedProperty.address}</p>
                                            <div className="flex items-center gap-4 mt-4">
                                                <div className="flex items-center gap-1.5 text-gray-400">
                                                    <Maximize2 className="w-3.5 h-3.5" />
                                                    <span className="text-sm font-normal">{expandedProperty.area} m²</span>
                                                </div>
                                                <div className="h-3 w-px bg-gray-200" />
                                                <p className="text-sm font-medium text-gray-800">R$ {(expandedProperty.price || 0).toLocaleString('pt-BR')}</p>
                                                {formData.linked_project_id && (() => {
                                                    const proj = projects.find(p => p.id === formData.linked_project_id);
                                                    return proj ? (
                                                        <>
                                                            <div className="h-3 w-px bg-gray-200" />
                                                            <div className="flex items-center gap-1.5 text-gray-400">
                                                                <Layers className="w-3.5 h-3.5" />
                                                                <span className="text-sm font-normal truncate max-w-[140px]">{proj.name}</span>
                                                            </div>
                                                        </>
                                                    ) : null;
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {expandedProperty && (() => {
                                    const posLabel: Record<string, string> = { FRONT: 'Frente', LATERAL: 'Lateral', BACK: 'Fundos' };
                                    const sunLabel: Record<string, string> = { NORTH: 'Norte', SOUTH: 'Sul', EAST: 'Leste', WEST: 'Oeste' };
                                    const specs = [
                                        { label: 'Pavimento', icon: <Layers className="w-3.5 h-3.5" />, value: expandedProperty.floor ?? '—' },
                                        { label: 'Área Privativa', icon: <Maximize2 className="w-3.5 h-3.5" />, value: expandedProperty.private_area ? `${expandedProperty.private_area} m²` : '—' },
                                        { label: 'Dormitórios', icon: <BedDouble className="w-3.5 h-3.5" />, value: expandedProperty.specs?.bedrooms ?? '—' },
                                        { label: 'Banheiros', icon: <Bath className="w-3.5 h-3.5" />, value: expandedProperty.specs?.bathrooms ?? '—' },
                                        { label: 'Suítes', icon: <DoorClosed className="w-3.5 h-3.5" />, value: expandedProperty.specs?.suites ?? '—' },
                                        { label: 'Vagas', icon: <Car className="w-3.5 h-3.5" />, value: expandedProperty.specs?.parkingSpaces ?? '—' },
                                        { label: 'Posição', icon: <Building className="w-3.5 h-3.5" />, value: expandedProperty.position_type ? (posLabel[expandedProperty.position_type] || expandedProperty.position_type) : '—' },
                                        { label: 'Orientação', icon: <Compass className="w-3.5 h-3.5" />, value: expandedProperty.sun_orientation ? (sunLabel[expandedProperty.sun_orientation] || expandedProperty.sun_orientation) : '—' },
                                    ];
                                    return (
                                        <div className="grid grid-cols-4 gap-3 animate-in slide-in-from-left-4 duration-500">
                                            {specs.map((s) => (
                                                <div key={s.label} className="p-3 bg-white rounded-[10px] border border-gray-100 flex flex-col gap-1">
                                                    <div className="flex items-center gap-1.5 text-gray-400">
                                                        {s.icon}
                                                        <label className="text-xs font-semibold text-slate-500">{s.label}</label>
                                                    </div>
                                                    <span className="text-sm font-medium text-gray-700 truncate">{s.value}</span>
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
                                <div className="flex items-center gap-2 text-blue-600">
                                    <DollarSign className="w-5 h-5" />
                                    <h3 className="text-sm font-bold text-gray-800">
                                        {formData.type === 'SALE' ? 'Condições de Venda' :
                                            formData.type === 'RENTAL' ? 'Condições de Aluguel' : 'Condições do Acordo'}
                                    </h3>
                                </div>

                                {/* Tipo */}
                                <div className={`flex items-center bg-white p-1 rounded-[10px] border border-gray-200 shadow-sm gap-1 w-fit ${(initialData?.type || defaultType) ? 'hidden' : ''}`}>
                                    {(['SALE', 'RENTAL', 'SERVICE'] as const).map((t) => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, type: t })}
                                            className={`h-7 px-3 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${formData.type === t ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            {t === 'SALE' ? 'Venda' : t === 'RENTAL' ? 'Aluguel' : 'Serviço'}
                                        </button>
                                    ))}
                                </div>

                                {/* Valor */}
                                {/* Valor — derivado da SOMA das unidades (aba Unidade).
                                    Read-only de propósito: com N unidades no contrato, um
                                    total digitado à mão divergiria do rateio por unidade. */}
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-500">
                                        {formData.type === 'RENTAL' ? 'Valor Mensal Sugerido' : 'Valor do Fechamento'}
                                    </label>
                                    <div className="relative group">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-normal text-gray-400">BRL</span>
                                        <input
                                            type="text"
                                            readOnly
                                            value={(formData.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            className="w-full h-9 pl-12 pr-3 bg-gray-50 border border-gray-200 rounded-[6px] outline-none text-sm font-medium text-gray-800 cursor-default"
                                            placeholder="0,00"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('unidade')}
                                        className="text-xs text-gray-400 hover:text-blue-600 px-1 transition-colors"
                                    >
                                        Soma de {dealUnits.length} {dealUnits.length === 1 ? 'unidade' : 'unidades'} — editar na aba Unidade
                                    </button>
                                </div>

                                {/* Locação — o valor negociado pode divergir do sugerido pelas
                                    unidades. Mensal e nº de parcelas são digitados; o Total é
                                    derivado (mensal × parcelas) e read-only: a única divergência
                                    legítima nasce do desconto nas parcelas, e aí quem grava é a
                                    pergunta perguntarCorrigirTotalContrato. */}
                                {formData.type === 'RENTAL' && (
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-slate-500">Valor Mensal do Contrato</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-normal text-gray-400">BRL</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={formData.installment_value ?? ''}
                                                    onChange={(e) => handleRentalMonthlyChange(e.target.value)}
                                                    className="w-full h-9 pl-12 pr-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                                    placeholder="0,00"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-slate-500">Número de Parcelas</label>
                                            <input
                                                type="number"
                                                min="1"
                                                step="1"
                                                value={formData.installments ?? ''}
                                                onChange={(e) => handleRentalInstallmentsChange(e.target.value)}
                                                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                                placeholder="12"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-slate-500">Valor Total do Contrato</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-normal text-gray-400">BRL</span>
                                                <input
                                                    type="text"
                                                    readOnly
                                                    value={(formData.contract_total_value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    className="w-full h-9 pl-12 pr-3 bg-gray-50 border border-gray-200 rounded-[6px] outline-none text-sm font-medium text-gray-800 cursor-default"
                                                    placeholder="0,00"
                                                />
                                            </div>
                                            <span className="block text-xs text-gray-400 px-1">
                                                {divergeDoProduto
                                                    ? 'Ajustado por desconto nas parcelas — some ou refaça as parcelas para voltar a mensal × parcelas.'
                                                    : 'Mensal × parcelas. Só muda ao aplicar desconto nas parcelas.'}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Datas */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-slate-500">Data Efetiva</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="date"
                                                value={formData.date}
                                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                                className="w-full h-9 pl-9 pr-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-slate-500">Data do 1º Pagamento</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
                                            <input
                                                type="date"
                                                value={formData.payment_due_date || ''}
                                                onChange={(e) => handlePaymentDueDateChange(e.target.value)}
                                                className="w-full h-9 pl-9 pr-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Forma de Pagamento */}
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-500">Forma de Pagamento</label>
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
                                        className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer"
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
                                        <label className="text-xs font-semibold text-slate-500">Entrada (BRL)</label>
                                        <input
                                            type="number"
                                            value={formData.down_payment || ''}
                                            onChange={(e) => setFormData({ ...formData, down_payment: parseFloat(e.target.value) || 0 })}
                                            className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                            placeholder="0,00"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* O Plano de Pagamento saiu daqui para a aba PARCELAS:
                                esta aba define as CONDIÇÕES (valor, datas, forma, entrada);
                                a lista de parcelas é outra tarefa e pedia a largura toda. */}
                            {formData.payment_method === 'INSTALLMENTS' && (
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('parcelas')}
                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                                >
                                    <DollarSign className="w-[15px] h-[15px]" />
                                    Ver plano de pagamento
                                </button>
                            )}
                        </div>
                    )}


                    {/* ══════════════════════════════════════════
                        ABA — PARCELAS (Plano de Pagamento)
                        Saiu de "Forma de Pagamento": lá ficam as CONDIÇÕES
                        (valor, datas, forma, entrada); aqui fica a LISTA, que
                        é outra tarefa e precisa da largura toda.
                        Padrão: docs/ui_ux_guia_unificado.md — KPIs §4, toolbar
                        de botões §5.3, tabela acoplada §5.2/§6, tipografia §7,
                        editáveis inline §7.1, lote §10, vazio §12, escala §16.
                    ══════════════════════════════════════════ */}
                    {activeTab === 'parcelas' && (() => {
                        const parcelas = formData.custom_installments || [];
                        const entrada = formData.down_payment || 0;
                        const somaBruta = parcelas.reduce((s, i) => s + (i.originalValue ?? i.value), 0) + entrada;
                        const bate = Math.abs(somaBruta - (formData.value || 0)) < 0.01;
                        const todasSelecionadas = parcelas.length > 0 && parcelas.every(i => selectedInstallmentIds.has(i.id));
                        // Célula editável dentro de TD: mesma tipografia do texto (§7.1).
                        const CELL = 'w-full text-sm font-normal px-2 py-1 rounded border border-gray-100 bg-gray-50 focus:bg-white focus:border-blue-400 outline-none transition-all';
                        // Mesma caixa da célula editável, em estado bloqueado: parcela paga
                        // não se altera pela negociação (estorno é no financeiro).
                        const CELL_RO = 'w-full text-sm font-normal px-2 py-1 rounded border border-gray-100 bg-gray-100 text-gray-500 outline-none cursor-not-allowed';

                        const alvoVisualizado = generateTargets.find(t => t.id === viewTarget);

                        return (
                            <div className="space-y-6">
                                {/* Seletor de série. O plano de pagamento da negociação e as
                                    parcelas do contrato são origens DIFERENTES (a segunda vive
                                    em Contas a Receber) — sem este seletor, as parcelas de uma
                                    renovação eram geradas e não apareciam em lugar nenhum. */}
                                {generateTargets.length > 0 && (
                                    <div className="flex flex-col md:flex-row md:items-center gap-2.5">
                                        <label className="text-xs font-semibold text-slate-500 shrink-0">Ver parcelas de</label>
                                        <select
                                            value={viewTarget}
                                            onChange={(e) => setViewTarget(e.target.value)}
                                            className="h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                                        >
                                            <option value="DEAL">Negociação — plano de pagamento</option>
                                            {generateTargets.filter(t => t.kind === 'CONTRACT').map(t => (
                                                <option key={t.id} value={t.id}>{t.label} — Contas a Receber</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {alvoVisualizado ? (
                                    /* Parcelas do CONTRATO — somente leitura: quem edita valor e
                                       vencimento aqui é o financeiro, não a negociação. */
                                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                                        <div className="p-3 border-b border-gray-100 bg-white flex items-center justify-end">
                                            <ColumnConfigButton
                                                columns={PARCELAS_COLUMNS}
                                                visibleColumns={parcelasCols.visibleColumns}
                                                showColumnConfig={parcelasCols.showColumnConfig}
                                                onToggleShow={() => parcelasCols.setShowColumnConfig(!parcelasCols.showColumnConfig)}
                                                onToggleColumn={parcelasCols.toggleColumn}
                                                onReset={parcelasCols.resetColumns}
                                            />
                                        </div>
                                        {loadingEntries ? (
                                            <div className="text-center py-12">
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                                                <p className="mt-2 text-gray-500">Carregando...</p>
                                            </div>
                                        ) : contractEntries.length === 0 ? (
                                            <div className="text-center py-12">
                                                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                                <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma parcela lançada</h3>
                                                <p className="text-sm text-gray-500">
                                                    Use "Gerar parcelas" e escolha este contrato (ou um aditivo dele) para lançá-las.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="overflow-auto max-h-[60vh]">
                                                {/* MESMAS colunas do plano de pagamento acima, para as duas
                                                    séries lerem igual. O que a parcela de contrato não tem
                                                    — desconto, tipo e forma de pagamento — aparece como "—"
                                                    em vez de sumir a coluna: coluna que muda de lugar
                                                    conforme a origem obriga a reaprender a tabela. */}
                                                <table className="w-full text-left border-collapse">
                                                    <thead>
                                                        <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                                            <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
                                                                {(() => {
                                                                    const editaveis = contractEntries.filter(e => e.status === 'PENDING');
                                                                    const todas = editaveis.length > 0 && editaveis.every(e => selectedEntryIds.has(e.id));
                                                                    return (
                                                                        <input
                                                                            type="checkbox"
                                                                            title="Selecionar todas"
                                                                            checked={todas}
                                                                            disabled={editaveis.length === 0}
                                                                            onChange={() => setSelectedEntryIds(todas ? new Set() : new Set(editaveis.map(e => e.id)))}
                                                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
                                                                        />
                                                                    );
                                                                })()}
                                                            </th>
                                                            <th className="w-12 px-6 py-2 border-r border-gray-100 text-table-header font-semibold">#</th>
                                                            {parcelasCols.visibleColumns.includes('vencimento') && (
                                                                <th className="px-6 py-2 border-r border-gray-100 text-table-header font-semibold">Vencimento</th>
                                                            )}
                                                            {parcelasCols.visibleColumns.includes('valor') && (
                                                                <th className="px-6 py-2 border-r border-gray-100 text-table-header font-semibold">Valor</th>
                                                            )}
                                                            {parcelasCols.visibleColumns.includes('desconto') && (
                                                                <th className="px-6 py-2 border-r border-gray-100 text-table-header font-semibold">Desconto</th>
                                                            )}
                                                            {parcelasCols.visibleColumns.includes('valor_final') && (
                                                                <th className="px-6 py-2 border-r border-gray-100 text-table-header font-semibold">Valor final</th>
                                                            )}
                                                            {parcelasCols.visibleColumns.includes('tipo') && (
                                                                <th className="px-6 py-2 border-r border-gray-100 text-table-header font-semibold">Tipo</th>
                                                            )}
                                                            {parcelasCols.visibleColumns.includes('forma_pagto') && (
                                                                <th className="px-6 py-2 border-r border-gray-100 text-table-header font-semibold">Forma pagto.</th>
                                                            )}
                                                            {parcelasCols.visibleColumns.includes('descricao') && (
                                                                <th className="px-6 py-2 border-r border-gray-100 text-table-header font-semibold">Descrição</th>
                                                            )}
                                                            {parcelasCols.visibleColumns.includes('actions') && (
                                                                <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                                            )}
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200">
                                                        {[...contractEntries]
                                                            .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))
                                                            .map((e, i) => {
                                                                const pago = e.status !== 'PENDING';
                                                                return (
                                                                    <tr key={e.id} className={`hover:bg-blue-50/50 transition-colors ${selectedEntryIds.has(e.id) ? 'bg-blue-50/60' : ''}`}>
                                                                        <td className="px-4 py-2.5 border-r border-gray-100 text-center">
                                                                            {/* Só parcela PENDENTE entra no lote: paga/conciliada
                                                                                nao pode ser alterada (§10 — checkbox so' onde a
                                                                                acao em lote e' valida). */}
                                                                            {!pago && (
                                                                                <input
                                                                                    type="checkbox"
                                                                                    title="Dica: segure Shift e clique para selecionar um intervalo"
                                                                                    checked={selectedEntryIds.has(e.id)}
                                                                                    onChange={(ev) => handleEntryRowCheck(
                                                                                        e.id, i, ev.target.checked,
                                                                                        (ev.nativeEvent as MouseEvent).shiftKey,
                                                                                        [...contractEntries]
                                                                                            .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))
                                                                                            .map(x => x.id),
                                                                                    )}
                                                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                                                />
                                                                            )}
                                                                        </td>
                                                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{i + 1}</td>
                                                                        {parcelasCols.visibleColumns.includes('vencimento') && (
                                                                            <td className="px-6 py-2.5 border-r border-gray-100">
                                                                                <input
                                                                                    type="date"
                                                                                    value={e.transaction_date.slice(0, 10)}
                                                                                    disabled={pago}
                                                                                    onChange={(ev) => patchContractEntry(e.id, { due_date: ev.target.value })}
                                                                                    className={pago ? CELL_RO : CELL}
                                                                                />
                                                                            </td>
                                                                        )}
                                                                        {parcelasCols.visibleColumns.includes('valor') && (
                                                                            <td className="px-6 py-2.5 border-r border-gray-100">
                                                                                <input
                                                                                    type="number"
                                                                                    value={e.original_amount ?? e.amount}
                                                                                    disabled={pago}
                                                                                    onChange={(ev) => patchContractEntry(e.id, { amount: parseFloat(ev.target.value) || 0 })}
                                                                                    className={pago ? CELL_RO : CELL}
                                                                                />
                                                                            </td>
                                                                        )}
                                                                        {/* Mesmos dropdowns do plano de pagamento — os campos passaram
                                                                            a existir em internal_transactions (migration 20270828000005).
                                                                            "Valor" e' o bruto; "Valor final" e' o liquido cobrado. */}
                                                                        {parcelasCols.visibleColumns.includes('desconto') && (
                                                                            <td className="px-6 py-2.5 border-r border-gray-100">
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <select
                                                                                        value={e.discount_type ?? ''}
                                                                                        disabled={pago}
                                                                                        onChange={(ev) => patchContractEntry(e.id, {
                                                                                            discount_type: ev.target.value || null,
                                                                                            discount_amount: ev.target.value ? (e.discount_amount ?? 0) : null,
                                                                                        })}
                                                                                        className={`${pago ? CELL_RO : CELL} cursor-pointer`}
                                                                                    >
                                                                                        <option value="">Sem desconto</option>
                                                                                        <option value="VALUE">R$</option>
                                                                                        <option value="PERCENT">%</option>
                                                                                    </select>
                                                                                    {e.discount_type && (
                                                                                        <input
                                                                                            type="number" min="0" step="0.01"
                                                                                            value={e.discount_amount ?? ''}
                                                                                            disabled={pago}
                                                                                            placeholder={e.discount_type === 'PERCENT' ? '%' : 'R$'}
                                                                                            onChange={(ev) => patchContractEntry(e.id, { discount_amount: parseFloat(ev.target.value) || 0 })}
                                                                                            className={`${pago ? CELL_RO : CELL} w-24`}
                                                                                        />
                                                                                    )}
                                                                                </div>
                                                                            </td>
                                                                        )}
                                                                        {parcelasCols.visibleColumns.includes('valor_final') && (
                                                                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-gray-800">
                                                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(e.amount)}
                                                                            </td>
                                                                        )}
                                                                        {parcelasCols.visibleColumns.includes('tipo') && (
                                                                            <td className="px-6 py-2.5 border-r border-gray-100">
                                                                                <select
                                                                                    value={e.installment_type ?? ''}
                                                                                    disabled={pago}
                                                                                    onChange={(ev) => patchContractEntry(e.id, { installment_type: ev.target.value || null })}
                                                                                    className={`${pago ? CELL_RO : CELL} cursor-pointer`}
                                                                                >
                                                                                    <option value="">Tipo Pagto.</option>
                                                                                    {installmentTypeOptions.map(t => (
                                                                                        <option key={t.code || t.id} value={t.code}>{t.name}</option>
                                                                                    ))}
                                                                                </select>
                                                                            </td>
                                                                        )}
                                                                        {parcelasCols.visibleColumns.includes('forma_pagto') && (
                                                                            <td className="px-6 py-2.5 border-r border-gray-100">
                                                                                <select
                                                                                    value={e.payment_type ?? ''}
                                                                                    disabled={pago}
                                                                                    onChange={(ev) => patchContractEntry(e.id, { payment_type: ev.target.value || null })}
                                                                                    className={`${pago ? CELL_RO : CELL} cursor-pointer`}
                                                                                >
                                                                                    <option value="">Forma Pagto.</option>
                                                                                    <option value="PIX">PIX</option>
                                                                                    <option value="TED">TED</option>
                                                                                    <option value="DOC">DOC</option>
                                                                                    <option value="DINHEIRO">Dinheiro</option>
                                                                                    <option value="CHEQUE">Cheque</option>
                                                                                    <option value="PERMUTA">Permuta</option>
                                                                                </select>
                                                                            </td>
                                                                        )}
                                                                        {parcelasCols.visibleColumns.includes('descricao') && (
                                                                            <td className="px-6 py-2.5 border-r border-gray-100">
                                                                                <input
                                                                                    type="text"
                                                                                    value={e.description ?? ''}
                                                                                    disabled={pago}
                                                                                    placeholder="Descrição / observação"
                                                                                    onChange={(ev) => patchContractEntry(e.id, { description: ev.target.value })}
                                                                                    className={pago ? CELL_RO : CELL}
                                                                                />
                                                                            </td>
                                                                        )}
                                                                        {parcelasCols.visibleColumns.includes('actions') && (
                                                                            <td className="px-6 py-2.5 text-right">
                                                                                <div className="flex items-center justify-end gap-1.5">
                                                                                    <span className={`text-sm font-normal ${pago ? 'text-emerald-600' : 'text-gray-400'}`}>
                                                                                        {e.status === 'PENDING' ? 'Previsto'
                                                                                            : e.status === 'PAID' ? 'Pago'
                                                                                                : e.status === 'CONCILIATED' ? 'Conciliado' : e.status}
                                                                                    </span>
                                                                                    <ActionIconButton
                                                                                        kind="delete"
                                                                                        title={pago
                                                                                            ? 'Parcela paga/conciliada — estorne no financeiro antes de excluir'
                                                                                            : 'Excluir esta parcela'}
                                                                                        onClick={() => handleRemoveContractEntry(e.id)}
                                                                                    />
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
                                ) : (
                                <>
                                {/* Sem KPIs (removidos a pedido): o rodapé de totais da própria
                                    tabela de parcelas já mostra soma, desconto e líquido. */}

                                {/* Toolbar de botões — §5.3: escopo à esquerda, ação primária à direita */}
                                <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                                    <p className="text-sm text-gray-500">
                                        {formData.payment_method === 'INSTALLMENTS'
                                            ? 'Cada linha é uma cobrança. Data, valor, desconto e forma de pagamento são editáveis aqui.'
                                            : 'A forma de pagamento atual não é parcelada — troque em "Forma de Pagamento" para montar um plano.'}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        {parcelas.some(i => i.installmentType && i.installmentType !== 'AVULSA') && (
                                            <button type="button" onClick={handleOpenRecalcModal}
                                                className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all">
                                                <RefreshCw className="w-4 h-4" /> Recalcular
                                            </button>
                                        )}
                                        <button type="button" onClick={handleOpenAddAdhocModal}
                                            className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-sm font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 transition-all">
                                            <Plus className="w-4 h-4" /> Parcela avulsa
                                        </button>
                                        <button type="button" onClick={handleOpenGenerateModal} disabled={loading}
                                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50">
                                            <Plus className="w-[15px] h-[15px]" />
                                            {loading ? 'Verificando…' : 'Gerar parcelas'}
                                        </button>
                                    </div>
                                </div>

                                {/* Tabela acoplada — §5.2: toolbar interna (só o botão de colunas,
                                    sem moldura própria) + tabela, um único card. */}
                                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                                    <div className="p-3 border-b border-gray-100 bg-white flex items-center justify-end">
                                        <ColumnConfigButton
                                            columns={PARCELAS_COLUMNS}
                                            visibleColumns={parcelasCols.visibleColumns}
                                            showColumnConfig={parcelasCols.showColumnConfig}
                                            onToggleShow={() => parcelasCols.setShowColumnConfig(!parcelasCols.showColumnConfig)}
                                            onToggleColumn={parcelasCols.toggleColumn}
                                            onReset={parcelasCols.resetColumns}
                                        />
                                    </div>
                                    {parcelas.length === 0 && entrada <= 0 ? (
                                        /* Empty state — §12 (sem moldura própria dentro do card) */
                                        <div className="text-center py-12">
                                            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma parcela no plano</h3>
                                            <p className="text-sm text-gray-500">
                                                Use "Gerar parcelas" para criar o cronograma, ou "Parcela avulsa" para lançar uma cobrança isolada.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="overflow-auto max-h-[60vh]">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    {/* Sticky §6.5, sentence case §6.2, px-6 + border-r §6.6.
                                                        Sem SortableHeader (§6.3): a ORDEM é o cronograma — a
                                                        posição da parcela é o próprio dado (Parcela Avulsa
                                                        insere "na posição N"), então reordenar mentiria. */}
                                                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                                        <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
                                                            {parcelas.length > 0 && (
                                                                <input
                                                                    type="checkbox"
                                                                    title="Selecionar todas"
                                                                    checked={todasSelecionadas}
                                                                    onChange={() => setSelectedInstallmentIds(todasSelecionadas ? new Set() : new Set(parcelas.map(i => i.id)))}
                                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                                />
                                                            )}
                                                        </th>
                                                        <th className="w-12 px-6 py-2 border-r border-gray-100 text-table-header font-semibold">#</th>
                                                        {parcelasCols.visibleColumns.includes('vencimento') && (
                                                            <th className="px-6 py-2 border-r border-gray-100 text-table-header font-semibold">Vencimento</th>
                                                        )}
                                                        {parcelasCols.visibleColumns.includes('valor') && (
                                                            <th className="px-6 py-2 border-r border-gray-100 text-table-header font-semibold">Valor</th>
                                                        )}
                                                        {parcelasCols.visibleColumns.includes('desconto') && (
                                                            <th className="px-6 py-2 border-r border-gray-100 text-table-header font-semibold">Desconto</th>
                                                        )}
                                                        {parcelasCols.visibleColumns.includes('valor_final') && (
                                                            <th className="px-6 py-2 border-r border-gray-100 text-table-header font-semibold">Valor final</th>
                                                        )}
                                                        {parcelasCols.visibleColumns.includes('tipo') && (
                                                            <th className="px-6 py-2 border-r border-gray-100 text-table-header font-semibold">Tipo</th>
                                                        )}
                                                        {parcelasCols.visibleColumns.includes('forma_pagto') && (
                                                            <th className="px-6 py-2 border-r border-gray-100 text-table-header font-semibold">Forma pagto.</th>
                                                        )}
                                                        {parcelasCols.visibleColumns.includes('descricao') && (
                                                            <th className="px-6 py-2 border-r border-gray-100 text-table-header font-semibold">Descrição</th>
                                                        )}
                                                        {parcelasCols.visibleColumns.includes('actions') && (
                                                            <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                                        )}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200">
                                                    {/* Entrada — não é item de custom_installments (é o campo
                                                        down_payment), mas entra como 1ª linha para receber tipo,
                                                        forma e descrição igual às demais. */}
                                                    {entrada > 0 && (
                                                        <tr className="bg-blue-50/40">
                                                            <td className="px-4 py-2.5 border-r border-gray-100"></td>
                                                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">Entr.</td>
                                                            {parcelasCols.visibleColumns.includes('vencimento') && (
                                                                <td className="px-6 py-2.5 border-r border-gray-100">
                                                                    <input type="date" value={formData.date}
                                                                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                                                        className={CELL} />
                                                                </td>
                                                            )}
                                                            {parcelasCols.visibleColumns.includes('valor') && (
                                                                <td className="px-6 py-2.5 border-r border-gray-100">
                                                                    <input type="number" value={formData.down_payment ?? ''}
                                                                        onChange={(e) => setFormData({ ...formData, down_payment: parseFloat(e.target.value) || 0 })}
                                                                        className={CELL} />
                                                                </td>
                                                            )}
                                                            {parcelasCols.visibleColumns.includes('desconto') && (
                                                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-400">—</td>
                                                            )}
                                                            {parcelasCols.visibleColumns.includes('valor_final') && (
                                                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-gray-800">
                                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(entrada)}
                                                                </td>
                                                            )}
                                                            {parcelasCols.visibleColumns.includes('tipo') && (
                                                                <td className="px-6 py-2.5 border-r border-gray-100">
                                                                    <select
                                                                        value={formData.down_payment_installment_type ?? 'SINAL'}
                                                                        onChange={(e) => setFormData({ ...formData, down_payment_installment_type: (e.target.value || undefined) as PaymentInstallment['installmentType'] })}
                                                                        className={`${CELL} cursor-pointer`}>
                                                                        {installmentTypeOptions.map(t => (
                                                                            <option key={t.code || t.id} value={t.code}>{t.name}</option>
                                                                        ))}
                                                                    </select>
                                                                </td>
                                                            )}
                                                            {parcelasCols.visibleColumns.includes('forma_pagto') && (
                                                                <td className="px-6 py-2.5 border-r border-gray-100">
                                                                    <select
                                                                        value={formData.down_payment_payment_type ?? ''}
                                                                        onChange={(e) => setFormData({ ...formData, down_payment_payment_type: (e.target.value || undefined) as PaymentInstallment['paymentType'] })}
                                                                        className={`${CELL} cursor-pointer`}>
                                                                        <option value="">Forma Pagto.</option>
                                                                        <option value="PIX">PIX</option>
                                                                        <option value="TED">TED</option>
                                                                        <option value="DOC">DOC</option>
                                                                        <option value="DINHEIRO">Dinheiro</option>
                                                                        <option value="CHEQUE">Cheque</option>
                                                                        <option value="PERMUTA">Permuta</option>
                                                                    </select>
                                                                </td>
                                                            )}
                                                            {parcelasCols.visibleColumns.includes('descricao') && (
                                                                <td className="px-6 py-2.5 border-r border-gray-100">
                                                                    <input type="text" value={formData.down_payment_notes ?? ''}
                                                                        onChange={(e) => setFormData({ ...formData, down_payment_notes: e.target.value })}
                                                                        placeholder="Descrição / observação" className={CELL} />
                                                                </td>
                                                            )}
                                                            {parcelasCols.visibleColumns.includes('actions') && (
                                                                <td className="px-6 py-2.5"></td>
                                                            )}
                                                        </tr>
                                                    )}

                                                    {parcelas.map((inst, index) => (
                                                        <tr key={inst.id}
                                                            className={`hover:bg-blue-50/50 transition-colors ${selectedInstallmentIds.has(inst.id) ? 'bg-blue-50/60' : ''}`}>
                                                            <td className="px-4 py-2.5 border-r border-gray-100 text-center">
                                                                <input
                                                                    type="checkbox"
                                                                    title="Dica: segure Shift e clique para selecionar um intervalo"
                                                                    checked={selectedInstallmentIds.has(inst.id)}
                                                                    onChange={(e) => handleInstallmentRowCheck(inst.id, index, e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)}
                                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                                />
                                                            </td>
                                                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{index + 1}</td>
                                                            {parcelasCols.visibleColumns.includes('vencimento') && (
                                                                <td className="px-6 py-2.5 border-r border-gray-100">
                                                                    <input
                                                                        type="date"
                                                                        value={inst.dueDate}
                                                                        onChange={(e) => {
                                                                            const newInsts = [...parcelas];
                                                                            newInsts[index] = { ...inst, dueDate: e.target.value };
                                                                            setFormData({ ...formData, custom_installments: newInsts });
                                                                        }}
                                                                        className={CELL}
                                                                    />
                                                                </td>
                                                            )}
                                                            {parcelasCols.visibleColumns.includes('valor') && (
                                                                <td className="px-6 py-2.5 border-r border-gray-100">
                                                                    <input
                                                                        type="number"
                                                                        value={inst.originalValue ?? inst.value}
                                                                        onChange={(e) => updateInstallmentDiscount(index, { originalValue: parseFloat(e.target.value) || 0 })}
                                                                        className={CELL}
                                                                    />
                                                                </td>
                                                            )}
                                                            {parcelasCols.visibleColumns.includes('desconto') && (
                                                                <td className="px-6 py-2.5 border-r border-gray-100">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <select
                                                                            value={inst.discountType ?? ''}
                                                                            onChange={(e) => {
                                                                                const type = e.target.value as 'VALUE' | 'PERCENT' | '';
                                                                                updateInstallmentDiscount(index, {
                                                                                    discountType: type || undefined,
                                                                                    discountAmount: type ? inst.discountAmount : undefined
                                                                                });
                                                                                // Tirar o desconto também mexe no líquido — mesma pergunta.
                                                                                if (!type) {
                                                                                    const base = inst.originalValue ?? inst.value;
                                                                                    void perguntarCorrigirFechamento(
                                                                                        somaLiquidaPlano() - inst.value + base);
                                                                                }
                                                                            }}
                                                                            className={`${CELL} cursor-pointer`}>
                                                                            <option value="">Sem desconto</option>
                                                                            <option value="VALUE">R$</option>
                                                                            <option value="PERCENT">%</option>
                                                                        </select>
                                                                        {/* A pergunta sobre corrigir o fechamento sai no BLUR, não a
                                                                            cada tecla — perguntar a cada dígito abriria o modal no
                                                                            meio da digitação. */}
                                                                        {inst.discountType && (
                                                                            <input
                                                                                type="number" min="0" step="0.01"
                                                                                value={inst.discountAmount ?? ''}
                                                                                onChange={(e) => updateInstallmentDiscount(index, { discountAmount: parseFloat(e.target.value) || 0 })}
                                                                                onBlur={() => void perguntarCorrigirFechamento(somaLiquidaPlano())}
                                                                                placeholder={inst.discountType === 'PERCENT' ? '%' : 'R$'}
                                                                                className={`${CELL} w-24`}
                                                                            />
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            )}
                                                            {parcelasCols.visibleColumns.includes('valor_final') && (
                                                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-gray-800">
                                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inst.value)}
                                                                </td>
                                                            )}
                                                            {parcelasCols.visibleColumns.includes('tipo') && (
                                                                <td className="px-6 py-2.5 border-r border-gray-100">
                                                                    <select
                                                                        value={inst.installmentType ?? ''}
                                                                        onChange={(e) => {
                                                                            const newInsts = [...parcelas];
                                                                            newInsts[index] = { ...inst, installmentType: (e.target.value || undefined) as PaymentInstallment['installmentType'] };
                                                                            setFormData({ ...formData, custom_installments: newInsts });
                                                                        }}
                                                                        className={`${CELL} cursor-pointer`}>
                                                                        <option value="">Tipo Pagto.</option>
                                                                        {installmentTypeOptions.map(t => (
                                                                            <option key={t.code || t.id} value={t.code}>{t.name}</option>
                                                                        ))}
                                                                    </select>
                                                                </td>
                                                            )}
                                                            {parcelasCols.visibleColumns.includes('forma_pagto') && (
                                                                <td className="px-6 py-2.5 border-r border-gray-100">
                                                                    <select
                                                                        value={inst.paymentType ?? ''}
                                                                        onChange={(e) => {
                                                                            const newInsts = [...parcelas];
                                                                            newInsts[index] = { ...inst, paymentType: (e.target.value || undefined) as PaymentInstallment['paymentType'] };
                                                                            setFormData({ ...formData, custom_installments: newInsts });
                                                                        }}
                                                                        className={`${CELL} cursor-pointer`}>
                                                                        <option value="">Forma Pagto.</option>
                                                                        <option value="PIX">PIX</option>
                                                                        <option value="TED">TED</option>
                                                                        <option value="DOC">DOC</option>
                                                                        <option value="DINHEIRO">Dinheiro</option>
                                                                        <option value="CHEQUE">Cheque</option>
                                                                        <option value="PERMUTA">Permuta</option>
                                                                    </select>
                                                                </td>
                                                            )}
                                                            {parcelasCols.visibleColumns.includes('descricao') && (
                                                                <td className="px-6 py-2.5 border-r border-gray-100">
                                                                    <input
                                                                        type="text"
                                                                        value={inst.notes ?? ''}
                                                                        onChange={(e) => {
                                                                            const newInsts = [...parcelas];
                                                                            newInsts[index] = { ...inst, notes: e.target.value };
                                                                            setFormData({ ...formData, custom_installments: newInsts });
                                                                        }}
                                                                        placeholder="Descrição / observação"
                                                                        className={CELL}
                                                                    />
                                                                </td>
                                                            )}
                                                            {parcelasCols.visibleColumns.includes('actions') && (
                                                                <td className="px-6 py-2.5 text-right">
                                                                    <div className="flex items-center justify-end gap-1.5">
                                                                        <ActionIconButton kind="delete" title="Remover parcela"
                                                                            onClick={() => handleRemoveInstallment(inst.id)} />
                                                                    </div>
                                                                </td>
                                                            )}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>

                                {!bate && parcelas.length > 0 && (
                                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-[10px] p-3 text-sm">
                                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                        <span>
                                            A soma das parcelas ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(somaBruta)})
                                            não fecha com o valor do fechamento ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.value || 0)}).
                                            Use "Recalcular" ou ajuste as parcelas.
                                        </span>
                                    </div>
                                )}
                                </>
                                )}
                            </div>
                        );
                    })()}

                    {/* ══════════════════════════════════════════
                        ABA 4 — PARTES & COMISSÃO
                    ══════════════════════════════════════════ */}
                    {activeTab === 'partes' && (
                        <div className="max-w-2xl space-y-8">
                            {/* Corretor */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-amber-600">
                                    <UserCheck className="w-5 h-5" />
                                    <h3 className="text-sm font-bold text-gray-800">Corretor da Negociação</h3>
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
                                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer"
                                >
                                    <option value="">Sem corretor / Venda direta</option>
                                    {uniqueBrokers.map(b => (
                                        <option key={b.id} value={b.id}>
                                            {b.name}{b.agency_name ? ` - ${b.agency_name}` : ''}
                                        </option>
                                    ))}
                                </select>

                                {selectedBroker && (
                                    <div className="p-4 bg-amber-50 rounded-[10px] border border-amber-100 flex items-center gap-4 animate-in slide-in-from-left-4 duration-400">
                                        <div className="w-10 h-10 bg-amber-100 rounded-[6px] flex items-center justify-center shrink-0">
                                            <UserCheck className="w-5 h-5 text-amber-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{selectedBroker.name}</p>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                {selectedBroker.cpf && (
                                                    <span className="text-sm font-normal text-gray-500">Doc: {selectedBroker.cpf}</span>
                                                )}
                                                {selectedBroker.agency_name && (
                                                    <span className="text-xs font-bold text-gray-400 truncate">{selectedBroker.agency_name}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className="text-xs font-semibold text-slate-500 block">Comissão inicial</span>
                                            <span className="text-sm font-medium text-gray-800">0%</span>
                                        </div>
                                    </div>
                                )}

                                {formData.broker_id && (
                                    <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-300">
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-slate-500">
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
                                                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                                    placeholder="Ex: 5.00"
                                                />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-normal text-gray-400">%</span>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-slate-500">Valor da Comissão</label>
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
                                                    className="w-full h-9 pl-9 pr-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-slate-500">Forma de Pagto.</label>
                                            <select
                                                value={formData.broker_payment_method || ''}
                                                onChange={(e) => setFormData({ ...formData, broker_payment_method: e.target.value })}
                                                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer"
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
                                            <label className="text-xs font-semibold text-slate-500">Data de Pagto.</label>
                                            <input
                                                type="date"
                                                value={formData.broker_payment_due_date || formData.date || ''}
                                                onChange={(e) => setFormData({ ...formData, broker_payment_due_date: e.target.value })}
                                                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════
                        ABA 6 — GARANTIAS LOCATÍCIAS
                        A garantia pertence ao CONTRATO, não à negociação: é ele
                        que a Lei do Inquilinato regula, e é dele que a garantia
                        precisa herdar vigência e valor do aluguel. Por isso a
                        aba mora aqui (onde o usuário trabalha) mas exige o
                        contrato gerado — sem ele não há a que prender.
                    ══════════════════════════════════════════ */}
                    {activeTab === 'garantias' && (
                        linkedContract ? (
                            <RentalGuaranteePanel
                                contract={linkedContract}
                                onNotify={(msg, type) => {
                                    if (type === 'error') notifyError(msg);
                                    else { setSavedNotice(true); setTimeout(() => setSavedNotice(false), 3000); }
                                }}
                            />
                        ) : (
                            <div className="text-center py-12">
                                <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-gray-900 mb-2">Contrato ainda não gerado</h3>
                                <p className="text-sm text-gray-500 max-w-md mx-auto">
                                    A garantia locatícia é vinculada ao contrato — vigência, valor do
                                    aluguel e as regras da Lei 8.245/91 saem dele. Gere o contrato na
                                    aba Contrato para cadastrar a garantia.
                                </p>
                            </div>
                        )
                    )}

                    {/* ══════════════════════════════════════════
                        ABA 5 — CONTRATO & ASSINATURA
                    ══════════════════════════════════════════ */}
                    {activeTab === 'contrato' && (
                        <div className="space-y-8">
                            {/* Sub-abas — só locação com contrato gerado. Renovações e
                                documentos do contrato moram AQUI, na mesma aba de
                                sempre: a fila em Locações › Renovações apenas aponta
                                para cá, para não existirem dois lugares que mexem no
                                mesmo contrato. */}
                            {/* Trilho em card branco (§19.1) — sobre o fundo cinza da
                                página um trilho bg-gray-50 solto perderia definição. */}
                            {formData.type === 'RENTAL' && linkedContract && (
                                <div className="flex flex-wrap items-center bg-white p-1 rounded-[10px] border border-gray-200 shadow-sm gap-1 w-fit">
                                    {([
                                        { id: 'dados', label: 'Dados do contrato' },
                                        { id: 'renovacoes', label: 'Renovações' },
                                        { id: 'documentos', label: 'Documentos' },
                                    ] as const).map(sub => (
                                        <button
                                            key={sub.id}
                                            type="button"
                                            onClick={() => setContratoSubTab(sub.id)}
                                            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                                contratoSubTab === sub.id
                                                    ? 'bg-blue-50 text-blue-600'
                                                    : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                        >
                                            {sub.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {formData.type === 'RENTAL' && linkedContract && contratoSubTab === 'renovacoes' && (
                                <ContractRenewalsPanel
                                    contract={linkedContract}
                                    onNotify={(msg, type) => (type === 'error' ? setContractError(msg) : setContractError(null))}
                                    onChanged={async () => {
                                        const atualizado = await contractService.getContractById(linkedContract.id);
                                        if (atualizado) setLinkedContract(atualizado);
                                    }}
                                />
                            )}

                            {formData.type === 'RENTAL' && linkedContract && contratoSubTab === 'documentos' && (
                                <div className="space-y-4">
                                    {/* Quem já está vendo as versões precisa poder gerar uma
                                        nova sem voltar para a sub-aba de dados. */}
                                    {emitDocumentActions}
                                    <DocumentVersionsPanel
                                        key={`docs-${docsRefreshKey}`}
                                        ownerType="CONTRACT"
                                        ownerId={linkedContract.id}
                                        contractId={linkedContract.id}
                                        organizationId={linkedContract.organization_id}
                                        label={`Contrato ${linkedContract.number}`}
                                        onNotify={(msg, type) => (type === 'error' ? setContractError(msg) : setContractError(null))}
                                    />
                                </div>
                            )}

                            {(formData.type !== 'RENTAL' || !linkedContract || contratoSubTab === 'dados') && (
                            <>
                            {/* Nº Contrato + Etapa lado a lado */}
                            <div className="grid grid-cols-12 gap-8">
                                <div className="col-span-12 lg:col-span-5 space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-slate-500">
                                            {formData.type === 'SALE' ? 'Nº Contrato de Compra e Venda' :
                                                formData.type === 'RENTAL' ? 'Nº Contrato de Locação' : 'Nº Contrato de Prestação de Serviço'}
                                        </label>
                                        <div className="relative group">
                                            <FileText className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                            <input
                                                type="text"
                                                value={formData.contract_number || ''}
                                                onChange={(e) => setFormData({ ...formData, contract_number: e.target.value })}
                                                className="w-full h-9 pl-9 pr-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                                placeholder={formData.type === 'SALE' ? 'Ex: CV-2026-001' : formData.type === 'RENTAL' ? 'Ex: CL-2026-001' : 'Ex: CPS-2026-001'}
                                            />
                                        </div>
                                    </div>

                                    {/* Vigência da locação — mora AQUI, na aba Contrato, junto do
                                        número: é dado do contrato, não da negociação. (Nasceu na aba
                                        Cliente, ao lado da competência do aluguel, e ninguém achava.)
                                        Sem `end_date` o contrato gerado não tem fim de vigência: as
                                        parcelas caem no fallback de 12 ciclos, nada entra na fila de
                                        Renovações e nenhum alerta de vencimento dispara.
                                        Ver contractService.createFromDeal. */}
                                    {formData.type === 'RENTAL' && (
                                        <div className="space-y-6">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-xs font-semibold text-slate-500">Início da Vigência</label>
                                                    <input
                                                        type="date"
                                                        value={formData.date || ''}
                                                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                                        className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                                    />
                                                </div>

                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between px-1">
                                                        <label className="text-xs font-semibold text-slate-500">Fim da Vigência</label>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                // +12 meses − 1 dia, em UTC puro (em UTC-3 o
                                                                // construtor local retrocede um dia).
                                                                const base = formData.date || new Date().toISOString().slice(0, 10);
                                                                const [y, m, d] = base.slice(0, 10).split('-').map(Number);
                                                                const dt = new Date(Date.UTC(y, m - 1, d));
                                                                dt.setUTCFullYear(dt.getUTCFullYear() + 1);
                                                                dt.setUTCDate(dt.getUTCDate() - 1);
                                                                setFormData({ ...formData, end_date: dt.toISOString().slice(0, 10) });
                                                            }}
                                                            className="text-xs font-medium text-blue-600 hover:text-blue-700"
                                                        >
                                                            12 meses
                                                        </button>
                                                    </div>
                                                    <input
                                                        type="date"
                                                        value={formData.end_date || ''}
                                                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                                                        className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                                    />
                                                </div>
                                            </div>

                                            {formData.end_date && formData.date && formData.end_date <= formData.date && (
                                                <p className="text-xs font-normal text-red-600 px-1">
                                                    O fim da vigência deve ser posterior ao início.
                                                </p>
                                            )}

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-xs font-semibold text-slate-500">Periodicidade</label>
                                                    <select
                                                        value={formData.billing_cycle || 'Mensal'}
                                                        onChange={(e) => setFormData({ ...formData, billing_cycle: e.target.value as PropertyDeal['billing_cycle'] })}
                                                        className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer"
                                                    >
                                                        <option value="Mensal">Mensal</option>
                                                        <option value="Bimestral">Bimestral</option>
                                                        <option value="Semestral">Semestral</option>
                                                        <option value="Anual">Anual</option>
                                                    </select>
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-xs font-semibold text-slate-500">Índice de Reajuste</label>
                                                    <select
                                                        value={formData.reajuste_index || 'IGP-M'}
                                                        onChange={(e) => setFormData({ ...formData, reajuste_index: e.target.value })}
                                                        className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer"
                                                    >
                                                        <option value="IGP-M">IGP-M</option>
                                                        <option value="IPCA">IPCA</option>
                                                        <option value="INCC">INCC</option>
                                                        <option value="INCC-M">INCC-M</option>
                                                        <option value="CUB">CUB</option>
                                                        <option value="OUTROS">Outros</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <p className="text-xs font-normal text-gray-400 px-1">
                                                O índice precisa estar cadastrado em Configurações do Sistema para o reajuste ser calculado na renovação.
                                            </p>
                                        </div>
                                    )}

                                    {/* Ponte → Contrato formal (Venda ou Locação, negociação já salva) */}
                                    {canGenerateContract && formData.id && (
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-slate-500">
                                                {formData.type === 'RENTAL' ? 'Contrato de Locação' : 'Contrato de Venda'}
                                            </label>
                                            {linkedContract ? (
                                                <div className="p-5 bg-emerald-50 rounded-[10px] border border-emerald-100 flex gap-4 items-start">
                                                    <Check className="w-6 h-6 text-emerald-500 shrink-0 mt-0.5" />
                                                    <div className="min-w-0 space-y-3">
                                                        <div>
                                                            <p className="text-sm font-bold text-emerald-800 mb-1">Contrato Gerado</p>
                                                            <p className="text-xs text-emerald-700 leading-relaxed">
                                                                Nº <span className="font-black">{linkedContract.number}</span> · {linkedContract.status}.
                                                                {formData.type === 'RENTAL'
                                                                    ? <> Contrato recorrente mensal, disponível no <span className="font-bold">Portal do Cliente</span> (categoria Locação).</>
                                                                    : <> Disponível em <span className="font-bold">Vendas de Ativos → Contratos</span> e no Portal do Cliente.</>}
                                                            </p>
                                                        </div>
                                                        {/* O registro do contrato existe, mas o DOCUMENTO não — é
                                                            aqui que a minuta é gerada a partir de um modelo .docx. */}
                                                        {emitDocumentActions}
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={handleGenerateContract}
                                                    disabled={generatingContract}
                                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                                                >
                                                    <FileText className="w-5 h-5" />
                                                    <span>{generatingContract ? 'Gerando…' : formData.type === 'RENTAL' ? 'Gerar Contrato de Locação' : 'Gerar Contrato de Venda'}</span>
                                                </button>
                                            )}
                                            {contractError && (
                                                <p className="text-xs font-normal text-red-600 px-1 flex items-center gap-1">
                                                    <AlertCircle className="w-3 h-3" /> {contractError}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    <div className="p-6 bg-amber-50 rounded-[10px] border border-amber-100 flex gap-4">
                                        <AlertCircle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-sm font-bold text-amber-800 mb-1">Aviso de Disponibilidade</p>
                                            <p className="text-xs text-amber-700 leading-relaxed">
                                                O status "{formData.type === 'RENTAL' ? 'Alugado' : 'Vendido'}" altera automaticamente a visibilidade do ativo no catálogo público.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="col-span-12 lg:col-span-7 space-y-4">
                                    <label className="text-xs font-semibold text-slate-500 block">Etapa da Negociação</label>
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
                                        <p className="text-xs font-normal text-gray-500 px-1 flex items-center gap-1">
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
                                <div className="flex items-center gap-2 text-blue-600">
                                    <FileText className="w-5 h-5" />
                                    <h3 className="text-sm font-bold text-gray-800">Observações da Negociação</h3>
                                </div>
                                <textarea
                                    value={formData.notes || ''}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    rows={4}
                                    placeholder="Descreva aqui detalhes das parcelas, garantias, taxas de transferência ou observações gerais do fechamento..."
                                    className="w-full p-3 bg-white border border-gray-200 rounded-[6px] outline-none text-sm font-normal text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none leading-relaxed"
                                />
                            </div>
                            </>
                            )}
                        </div>
                    )}
                </form>

                {/* Rodapé — §17: ação primária compacta (h-9, sentence case, sem
                    shadow-xl/ring/uppercase); secundárias no mesmo h-9. */}
                <div className="px-8 py-4 border-t border-gray-100 bg-white flex items-center justify-between gap-4 shrink-0">
                    <div className="flex items-center gap-2 text-gray-400 min-w-0">
                        <Info className="w-4 h-4 shrink-0" />
                        <p className="text-sm font-normal max-w-md truncate">
                            Aprovação sistêmica obrigatória para fechamentos acima da margem de tabela permitida.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {formData.id && (
                            <button
                                type="button"
                                onClick={handleExportPDF}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-white text-gray-600 rounded-[6px] border border-gray-200 shadow-sm font-medium text-[13px] hover:text-blue-600 hover:border-blue-200 transition-all active:scale-95"
                            >
                                <FileText className="w-[15px] h-[15px]" />
                                Gerar proposta
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-9 px-3.5 bg-white text-gray-500 rounded-[6px] border border-gray-200 shadow-sm font-medium text-[13px] hover:text-gray-900 transition-all active:scale-95"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            form="deal-modal-form"
                            disabled={loading}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                        >
                            {loading ? (
                                <div className="w-[15px] h-[15px] border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Check className="w-[15px] h-[15px]" />
                            )}
                            Salvar alterações
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

                {/* Toast de erro — §13 (vermelho = erro). Substitui os alert() nativos. */}
                {errorNotice && (
                    <div className="fixed bottom-6 right-6 z-[300] flex items-start gap-3 px-5 py-4 rounded-[10px] shadow-xl text-sm font-medium bg-red-600 text-white max-w-md animate-in slide-in-from-bottom-4 duration-300">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        {errorNotice}
                    </div>
                )}

                {/* Barra de ação em lote — parcelas selecionadas no Plano de Pagamento
                    (guia §10: fixa no rodapé, fora do fluxo normal). */}
                {activeTab === 'parcelas' && selectedInstallmentIds.size > 0 && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] flex items-center gap-3 p-4 bg-blue-600 text-white rounded-[10px] shadow-lg shadow-blue-900/20">
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
                            className="flex items-center gap-2 px-3 py-2 bg-white text-blue-700 rounded-[6px] font-bold text-button uppercase tracking-widest hover:bg-blue-50 transition-colors"
                        >
                            <Pencil className="w-3.5 h-3.5" />
                            Editar em Lote
                        </button>
                        <button
                            onClick={() => setSelectedInstallmentIds(new Set())}
                            className="flex items-center gap-2 px-3 py-2 bg-blue-500 rounded-[6px] font-bold text-button uppercase tracking-widest hover:bg-blue-400 transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                            Desmarcar
                        </button>
                    </div>
                )}

                {/* Mesma barra, para a série do CONTRATO (§10). As duas nunca
                    aparecem juntas: o seletor mostra uma série de cada vez. */}
                {activeTab === 'parcelas' && selectedEntryIds.size > 0 && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] flex items-center gap-3 p-4 bg-blue-600 text-white rounded-[10px] shadow-lg shadow-blue-900/20">
                        <span className="flex-1 text-sm font-bold whitespace-nowrap">
                            {selectedEntryIds.size} parcela{selectedEntryIds.size !== 1 ? 's' : ''} selecionada{selectedEntryIds.size !== 1 ? 's' : ''}
                            <span className="ml-2 font-normal opacity-75">
                                · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                    contractEntries
                                        .filter(e => selectedEntryIds.has(e.id))
                                        .reduce((acc, e) => acc + (e.original_amount ?? e.amount), 0)
                                )}
                            </span>
                        </span>
                        <button
                            onClick={() => setShowEntryLoteModal(true)}
                            className="flex items-center gap-2 px-3 py-2 bg-white text-blue-700 rounded-[6px] font-bold text-button uppercase tracking-widest hover:bg-blue-50 transition-colors"
                        >
                            <Pencil className="w-3.5 h-3.5" />
                            Editar em Lote
                        </button>
                        <button
                            onClick={() => setSelectedEntryIds(new Set())}
                            className="flex items-center gap-2 px-3 py-2 bg-blue-500 rounded-[6px] font-bold text-button uppercase tracking-widest hover:bg-blue-400 transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                            Desmarcar
                        </button>
                    </div>
                )}

                {showEntryLoteModal && (
                    <InstallmentLoteDiscountModal
                        installments={contractEntries
                            .filter(e => selectedEntryIds.has(e.id))
                            .map(e => ({
                                // O modal só lê id/valor/desconto para montar a prévia —
                                // mapear a parcela do contrato para o formato dele evita
                                // duplicar um modal idêntico só por causa do tipo.
                                id: e.id,
                                dueDate: e.transaction_date.slice(0, 10),
                                value: e.amount,
                                originalValue: e.original_amount ?? e.amount,
                                discountType: (e.discount_type as 'VALUE' | 'PERCENT' | undefined) ?? undefined,
                                discountAmount: e.discount_amount ?? undefined,
                                installmentType: (e.installment_type as PaymentInstallment['installmentType']) ?? undefined,
                                paymentType: (e.payment_type as PaymentInstallment['paymentType']) ?? undefined,
                                status: 'PENDING',
                                description: e.description ?? '',
                            } as PaymentInstallment))}
                        installmentTypes={installmentTypeOptions}
                        onClose={() => setShowEntryLoteModal(false)}
                        onSave={applyBulkEntryEdit}
                    />
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
                        <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
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
                                {/* Alvo da geração. Locação tem DUAS origens de parcela — a
                                    série da negociação e a do contrato — e a prorrogação por
                                    aditivo cria um período novo que não existe na negociação.
                                    Sem escolher aqui, não havia como gerar aquelas parcelas. */}
                                {generateTargets.length > 0 && (
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Gerar parcelas para</label>
                                        <select
                                            value={generateTarget}
                                            onChange={(e) => setGenerateTarget(e.target.value)}
                                            className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                                        >
                                            <option value="DEAL">Negociação — plano de pagamento</option>
                                            {generateTargets.map(t => (
                                                <option key={t.id} value={t.id}>
                                                    {t.label} · {fmtDateBR(t.fromDate)} a {fmtDateBR(t.toDate)}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="text-xs text-gray-400 mt-1">
                                            {alvoSelecionado
                                                ? `Usa a cadência do contrato (${alvoSelecionado.contract.billing_cycle ?? 'Mensal'}, dia ${alvoSelecionado.contract.due_day ?? '—'}) a partir de ${fmtDateBR(alvoSelecionado.fromDate)}. Repetir não duplica: vencimentos já lançados são pulados.`
                                                : 'As parcelas entram no plano de pagamento desta negociação.'}
                                        </p>
                                    </div>
                                )}

                                {/* Conferência do que vai ser gerado. Os três valores são os
                                    campos da aba Forma de Pagamento — aqui só se lê, para o
                                    usuário não ter que confiar de memória no que digitou lá. */}
                                {alvoSelecionado && (() => {
                                    const { amount, maxCount, usouCampos } = geracaoContrato(alvoSelecionado);
                                    const n = maxCount ?? 0;
                                    const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
                                    return (
                                        <div className="space-y-2">
                                            <div className="grid grid-cols-3 gap-2">
                                                {[
                                                    { label: 'Valor mensal', value: fmt(amount) },
                                                    { label: 'Nº de parcelas', value: n > 0 ? String(n) : 'Toda a vigência' },
                                                    { label: 'Valor total', value: n > 0 ? fmt(amount * n) : '—' },
                                                ].map(c => (
                                                    <div key={c.label} className="p-3 bg-gray-50 rounded-[6px] border border-gray-100">
                                                        <p className="text-xs font-semibold text-slate-500">{c.label}</p>
                                                        <p className="text-sm font-medium text-gray-800 mt-0.5">{c.value}</p>
                                                    </div>
                                                ))}
                                            </div>
                                            <p className="text-xs text-gray-400">
                                                {usouCampos
                                                    ? 'Valores da aba Forma de Pagamento — altere lá para gerar diferente.'
                                                    : 'O Valor Mensal do Contrato está vazio na aba Forma de Pagamento; usando o valor cadastrado no contrato.'}
                                            </p>
                                        </div>
                                    );
                                })()}

                                {!alvoSelecionado && (
                                <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Nº de Parcelas</label>
                                        <input
                                            type="number"
                                            min="1" max="120"
                                            value={generateInstallmentCount}
                                            onChange={(e) => setGenerateInstallmentCount(parseInt(e.target.value) || 1)}
                                            className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Data do 1º Pagamento</label>
                                        <input
                                            type="date"
                                            value={generateFirstDueDate}
                                            onChange={(e) => setGenerateFirstDueDate(e.target.value)}
                                            className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                        />
                                    </div>
                                </div>
                                <p className="text-xs text-gray-400 -mt-2">
                                    Data sugerida pelo sistema (o mesmo campo "Data do 1º Pagamento" da aba) — troque se quiser ancorar a série em outra data.
                                </p>

                                <div>
                                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Tipo de Pagamento</label>
                                    <select
                                        value={generateInstallmentType}
                                        onChange={(e) => setGenerateInstallmentType(e.target.value as NonNullable<PaymentInstallment['installmentType']>)}
                                        className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
                                        <div className="p-3 bg-amber-50 border border-amber-100 rounded-[6px] text-xs text-amber-800 space-y-1">
                                            {sameTypeCount > 0 && (
                                                <p>Substitui as {sameTypeCount} parcela(s) de "{typeLabel(generateInstallmentType)}" atuais — ajustes manuais nelas (descontos, valores editados, forma de pagamento e observações) serão perdidos.</p>
                                            )}
                                            {otherTypesCount > 0 && (
                                                <p>As {otherTypesCount} parcela(s) de outro(s) tipo(s) são mantidas (só o valor é recalculado para a soma continuar batendo com o Valor Total).</p>
                                            )}
                                        </div>
                                    );
                                })()}
                                </>
                                )}
                            </div>

                            {generateResult && (
                                <div className={`mx-6 mb-4 flex items-start gap-2 rounded-[6px] p-3 text-sm ${
                                    generateResult.ok
                                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                                        : 'bg-amber-50 border border-amber-200 text-amber-800'
                                }`}>
                                    {generateResult.ok
                                        ? <Check className="w-4 h-4 shrink-0 mt-0.5" />
                                        : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                                    <span>{generateResult.msg}</span>
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setShowGenerateModal(false)}
                                    className="px-4 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
                                >
                                    {generateResult?.ok ? 'Fechar' : 'Cancelar'}
                                </button>
                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={() => (alvoSelecionado
                                        ? handleGenerateForContract(alvoSelecionado)
                                        : handleConfirmGenerateInstallments(generateInstallmentType, generateInstallmentCount, generateFirstDueDate))}
                                    className={`flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-[13px] font-medium text-white transition-all active:scale-95 ${loading ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                                >
                                    {loading ? 'Gerando...' : alvoSelecionado ? 'Gerar no contrato' : 'Gerar Parcelas'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showAddAdhocModal && (
                    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                        <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
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
                                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Qual será a parcela</label>
                                    <select
                                        value={adhocPosition}
                                        onChange={(e) => setAdhocPosition(parseInt(e.target.value) || 1)}
                                        className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
                                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Data</label>
                                        <input
                                            type="date"
                                            value={adhocDate}
                                            onChange={(e) => setAdhocDate(e.target.value)}
                                            className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Valor (R$)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={adhocValue}
                                            onChange={(e) => setAdhocValue(e.target.value)}
                                            placeholder="0,00"
                                            className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
                                    className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-[13px] font-medium text-white bg-blue-600 hover:bg-blue-700 transition-all active:scale-95"
                                >
                                    Criar Parcela
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showRecalcModal && (
                    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                        <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
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
                                                <label key={type} className="flex items-center justify-between gap-3 p-3 bg-gray-50 border border-gray-200 rounded-[6px] cursor-pointer hover:bg-gray-100 transition-colors">
                                                    <span className="flex items-center gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={recalcSelectedTypes.has(type)}
                                                            onChange={() => handleToggleRecalcType(type)}
                                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
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
                                        <div className="p-3 bg-amber-50 border border-amber-100 rounded-[6px] text-xs text-amber-800 space-y-1">
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
                                    className={`flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-[13px] font-medium text-white transition-all active:scale-95 ${recalcSelectedTypes.size === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-700'}`}
                                >
                                    Recalcular
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Emissão do documento do contrato. Painel lateral (UI_PATTERNS §3:
                    "Criar registro simples" → Sheet) — o EmitDocumentModal já é
                    Sheet-like. Contexto de locação (locador, unidades, garantia,
                    fiador) vem do rentalDocumentContextService; `persistVersion`
                    grava a minuta como versão rascunho antes de baixar. */}
                {emitOpen && linkedContract && (
                    <EmitDocumentModal
                        organizationId={linkedContract.organization_id || formData.organization_id || organizationId || ''}
                        contract={linkedContract}
                        organization={null}
                        loadContext={loadRentalDocContext}
                        persistVersion
                        lockClient
                        onVersionSaved={() => { setContratoSubTab('documentos'); setDocsRefreshKey(k => k + 1); }}
                        onManageTemplates={() => { setEmitOpen(false); setDocxManagerOpen(true); }}
                        onClose={() => setEmitOpen(false)}
                        notify={(msg, type) => setContractError(type === 'error' ? msg : null)}
                    />
                )}

                {docxManagerOpen && (
                    <DocxTemplateManager
                        organizationId={linkedContract?.organization_id || formData.organization_id || organizationId || ''}
                        onClose={() => setDocxManagerOpen(false)}
                    />
                )}
            </div>
        </div>
    );
};

export default DealModal;
