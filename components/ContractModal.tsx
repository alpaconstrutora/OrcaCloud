import React from 'react';
import Button from './ui/Button';
import { X, FileText, Calendar, Building2, User, DollarSign, Shield, Tag, Briefcase, Loader2, AlertCircle, HandCoins, MapPin, ClipboardList, Users } from 'lucide-react';
import HierarchicalSelect from './HierarchicalSelect';
import { Contract, ContractInstallment, Supplier, CostCenter, ChartOfAccount, ContractStatus, ContractType, ContractNature, ContractTypeRecord } from '../types';
import { PaymentAccount } from '../types/financial';
import { supplierService, getSupplierDisplayName } from '../services/supplierService';
import { appSettingsService } from '../services/appSettingsService';
import { clientService as crmClientService } from '../services/clientService';
import { financialRegistryService } from '../services/financialRegistryService';
import { projectService } from '../services/projectService';
import { storageService } from '../services/storageService';
import { laborService } from '../services/laborService';
import { contractTypeService } from '../services/contractTypeService';
import { sanitizeFileName } from '../utils/storageUtils';
import ContractScopeManager from './ContractScopeManager';
import ContractGuaranteeModal from './ContractGuaranteeModal';
import { Upload, ExternalLink, KeyRound } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';

interface ContractModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<Contract>) => Promise<void>;
    projectId: string;
    organizationId?: string;
    initialData?: Partial<Contract>;
    direction?: 'OUTGOING' | 'INCOMING';
    onToast?: (message: string, type: 'success' | 'error') => void;
    // Rótulos do cabeçalho — sobrescrevem o texto padrão "Serviço" para outros domínios (ex.: Vendas).
    titleNew?: string;
    moduleLabel?: string;
}

export const ContractModal: React.FC<ContractModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    projectId,
    organizationId: organizationIdProp,
    initialData,
    direction,
    onToast,
    titleNew,
    moduleLabel,
}) => {
    // Quando "Todas as Organizações" está selecionado no seletor global, organizationIdProp vem undefined.
    // Contrato não pode existir sem organização — exigimos a escolha aqui dentro.
    const { organizations: storeOrganizations } = useStore();
    const [pickedOrgId, setPickedOrgId] = React.useState<string>('');
    const organizationId = organizationIdProp || pickedOrgId || initialData?.organization_id || undefined;
    const needsOrgPicker = !organizationIdProp && !initialData?.id;
    const [formData, setFormData] = React.useState<Partial<Contract>>({
        number: '',
        title: '',
        description: '',
        contract_type: 'Empreitada Global',
        nature: 'Fornecimento',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
        status: 'Rascunho',
        original_value: 0,
        retention_rate: 0,
        reajuste_index: 'INCC',
        payment_method: 'Boleto Bancário',
        payment_installments: 1,
        project_id: (projectId || initialData?.project_id || '') as string,
        budget_id: initialData?.budget_id,
        is_recurring: false,
        billing_cycle: 'Mensal',
        due_day: 10,
        ...initialData
    });

    const [projects, setProjects] = React.useState<{ id: string; name: string; settings?: { classification?: string } }[]>([]);
    const [showGuaranteeModal, setShowGuaranteeModal] = React.useState(false);

    const buildSchedule = (count: number, value: number, startDate: string): ContractInstallment[] => {
        const base = count > 0 ? Math.floor((value / count) * 100) / 100 : 0;
        const remainder = Math.round((value - base * count) * 100) / 100;
        const start = startDate ? new Date(startDate + 'T12:00:00') : new Date();
        return Array.from({ length: count }, (_, i) => {
            const d = new Date(start);
            d.setMonth(d.getMonth() + i);
            return {
                date: d.toISOString().split('T')[0],
                value: i === count - 1 ? Math.round((base + remainder) * 100) / 100 : base,
            };
        });
    };

    const [installmentSchedule, setInstallmentSchedule] = React.useState<ContractInstallment[]>(() => {
        if (initialData?.payment_schedule?.length) return initialData.payment_schedule;
        if (initialData?.payment_term_type === 'Parcelado') {
            return buildSchedule(
                initialData.payment_installments ?? 1,
                initialData.original_value ?? 0,
                initialData.start_date ?? new Date().toISOString().split('T')[0]
            );
        }
        return [];
    });

    const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
    const [crmClients, setCrmClients] = React.useState<{ id: string; name: string; document?: string }[]>([]);
    const [costCenters, setCostCenters] = React.useState<CostCenter[]>([]);
    const [employees, setEmployees] = React.useState<{ id: string; name: string; role?: string }[]>([]);
    const [chartOfAccounts, setChartOfAccounts] = React.useState<ChartOfAccount[]>([]);
    const [contractTypes, setContractTypes] = React.useState<ContractTypeRecord[]>([]);
    const [paymentAccounts, setPaymentAccounts] = React.useState<PaymentAccount[]>([]);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [scopePickerOpen, setScopePickerOpen] = React.useState(false);
    const [scopeManagerOpen, setScopeManagerOpen] = React.useState(false);
    const [showClientCreate, setShowClientCreate] = React.useState(false);
    const [newClientName, setNewClientName] = React.useState('');
    const [newClientDoc, setNewClientDoc] = React.useState('');
    const [newClientType, setNewClientType] = React.useState<'PJ' | 'PF'>('PJ');
    const [savingClient, setSavingClient] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [isFetchingNumber, setIsFetchingNumber] = React.useState(false);
    const [numberError, setNumberError] = React.useState<string | null>(null);
    const [isCheckingNumber, setIsCheckingNumber] = React.useState(false);
    const numberInputRef = React.useRef<string>(formData.number ?? '');

    React.useEffect(() => {
        if (isOpen) {
            loadDependencies();
            if (!initialData?.id) {
                setNumberError(null);
                setPickedOrgId('');
                numberInputRef.current = '';
                setFormData({
                    number: '',
                    title: '',
                    description: '',
                    contract_type: 'Empreitada Global',
                    nature: 'Fornecimento',
                    start_date: new Date().toISOString().split('T')[0],
                    end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
                    status: 'Rascunho',
                    original_value: 0,
                    retention_rate: 0,
                    reajuste_index: 'INCC',
                    payment_method: 'Boleto Bancário',
                    payment_installments: 1,
                    project_id: projectId || '',
                    is_recurring: false,
                    billing_cycle: 'Mensal',
                    due_day: 10,
                    ...initialData,
                });
                setInstallmentSchedule([]);
            }
        }
    }, [isOpen, organizationIdProp]);

    // Initialize installment schedule when switching to Parcelado
    const prevTermType = React.useRef(formData.payment_term_type);
    React.useEffect(() => {
        if (formData.payment_term_type === 'Parcelado' && prevTermType.current !== 'Parcelado' && installmentSchedule.length === 0) {
            setInstallmentSchedule(buildSchedule(formData.payment_installments ?? 1, formData.original_value ?? 0, formData.start_date ?? new Date().toISOString().split('T')[0]));
        }
        prevTermType.current = formData.payment_term_type;
    }, [formData.payment_term_type]);

    // Auto-fill execution address from selected obra location
    React.useEffect(() => {
        if (!formData.project_id || initialData?.id) return;
        const obra = projects.find(p => p.id === formData.project_id);
        if (!obra) return;
        const s = obra.settings as any;
        if (!s) return;
        setFormData(prev => ({
            ...prev,
            execution_street:       s.street        || prev.execution_street,
            execution_number:       s.number        || prev.execution_number,
            execution_neighborhood: s.neighborhood  || prev.execution_neighborhood,
            execution_city:         s.city          || prev.execution_city,
            execution_state:        s.state         || prev.execution_state,
            execution_zip:          s.zipCode       || prev.execution_zip,
        }));
    }, [formData.project_id, projects]);

    // Auto-fetch next sequential number for new contracts — sequence separada por direction
    const contractDirection = direction ?? (initialData?.direction as string | undefined);
    React.useEffect(() => {
        if (!isOpen || initialData?.id || !organizationId) return;
        let cancelled = false;
        (async () => {
            setIsFetchingNumber(true);
            numberInputRef.current = '';
            setFormData(prev => ({ ...prev, number: '' }));
            try {
                let numQuery = supabase
                    .from('contracts')
                    .select('number')
                    .eq('organization_id', organizationId);
                if (contractDirection === 'OUTGOING') {
                    numQuery = numQuery.eq('direction', 'OUTGOING');
                } else {
                    numQuery = (numQuery as any).or('direction.eq.INCOMING,direction.is.null');
                }
                const { data: rows } = await numQuery;
                if (cancelled) return;
                const usedNums = new Set(
                    (rows ?? []).map(r => parseInt(r.number ?? '', 10)).filter(n => !isNaN(n))
                );
                let nextNum = 1;
                while (usedNums.has(nextNum)) nextNum++;
                const n = String(nextNum).padStart(3, '0');
                numberInputRef.current = n;
                setFormData(prev => ({ ...prev, number: n }));
            } catch (e) {
                console.error('Erro ao buscar próximo número de contrato:', e);
            } finally {
                if (!cancelled) setIsFetchingNumber(false);
            }
        })();
        return () => { cancelled = true; };
    }, [isOpen, initialData, organizationId]);

    // Recarrega listas dependentes de organização (fornecedores/clientes/etc.) quando o usuário
    // escolhe a organização no seletor interno (modo "Todas as Organizações").
    React.useEffect(() => {
        if (isOpen && needsOrgPicker && pickedOrgId) {
            loadDependencies();
        }
    }, [pickedOrgId]);

    React.useEffect(() => {
        if (initialData) {
            if (initialData.number) numberInputRef.current = initialData.number;
            setFormData(prev => ({ ...prev, ...initialData }));
            if (initialData.payment_schedule?.length) {
                setInstallmentSchedule(initialData.payment_schedule);
            } else if (initialData.payment_term_type === 'Parcelado') {
                setInstallmentSchedule(buildSchedule(
                    initialData.payment_installments ?? 1,
                    initialData.original_value ?? 0,
                    initialData.start_date ?? new Date().toISOString().split('T')[0]
                ));
            } else {
                setInstallmentSchedule([]);
            }
        }
    }, [initialData]);

    const loadDependencies = async () => {
        setIsSubmitting(true);
        try {
            const [s, cl, cc, ca, p, emps, pa, ct] = await Promise.all([
                supplierService.listSuppliers(organizationId),
                crmClientService.listClients(organizationId),
                financialRegistryService.listCostCenters(organizationId),
                financialRegistryService.listChartOfAccounts(organizationId),
                projectService.listProjects(undefined, organizationId, true),
                laborService.listEmployees(organizationId).catch(() => [] as { id: string; name: string; role?: string }[]),
                financialRegistryService.listPaymentAccounts(organizationId).catch(() => [] as PaymentAccount[]),
                contractTypeService.listTypes(organizationId).catch(() => [] as ContractTypeRecord[])
            ]);
            setSuppliers(s);
            setCrmClients((cl as any[]).map(c => ({ id: c.id, name: c.name, document: c.document })));
            setCostCenters(cc);
            setChartOfAccounts(ca);
            setProjects(p);
            setEmployees((emps as any[]).filter(e => e.status !== 'DEMITIDO').map(e => ({ id: e.id, name: e.name, role: e.role })));
            setPaymentAccounts(pa);
            setContractTypes(ct);
        } catch (error) {
            console.error("Erro ao carregar dependências do contrato:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleNumberBlur = async () => {
        if (!numberInputRef.current) return;
        let value = numberInputRef.current.trim();

        // Auto-pad numeric input to 3 digits
        if (/^\d{1,3}$/.test(value)) {
            value = value.padStart(3, '0');
            numberInputRef.current = value;
            setFormData(prev => ({ ...prev, number: value }));
        }

        // Validate format
        if (!/^\d{3}$/.test(value)) {
            setNumberError('Formato inválido. Use 3 dígitos (ex: 001, 042, 123).');
            return;
        }

        // Unicidade garantida pelo unique index do banco ao salvar
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !organizationId) return;

        setIsSubmitting(true);
        try {
            const cleanName = sanitizeFileName(file.name);
            const path = `${organizationId}/contracts/signed_${Date.now()}_${cleanName}`;

            await storageService.uploadFile('documents', path, file);
            const publicUrl = storageService.getPublicUrl('documents', path);

            setFormData(prev => ({ ...prev, signed_contract_url: publicUrl }));
        } catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error("Erro ao fazer upload do contrato:", err);
            alert(`Erro ao fazer upload: ${err.message || 'Erro desconhecido'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const NON_OBRA = new Set(['ORCAMENTO', 'DIARIO', 'PLANEJAMENTO']);
    const obrasList = projects.filter(p =>
        p.name !== 'Gestão Comercial' &&
        !NON_OBRA.has(p.settings?.classification ?? '')
    );
    const orcamentosList = projects.filter(p => p.settings?.classification === 'ORCAMENTO');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!organizationId) {
            setError('Selecione a organização para criar este contrato.');
            return;
        }

        const currentNumber = (numberInputRef.current || formData.number || '');
        if (!currentNumber || !/^\d{3}$/.test(currentNumber)) {
            setNumberError('Formato inválido. Use 3 dígitos (ex: 001, 042, 123).');
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = { ...formData, organization_id: organizationId };
            if (payload.is_recurring) {
                payload.payment_installments = undefined;
            } else {
                payload.billing_cycle = undefined;
                payload.due_day = undefined;
            }
            if (payload.payment_term_type === 'Parcelado' && !payload.is_recurring) {
                payload.payment_schedule = installmentSchedule;
            } else {
                payload.payment_schedule = undefined;
            }
            // Sanitize all UUID fields: any _id key with empty string fails Postgres UUID cast
            for (const key of Object.keys(payload) as (keyof typeof payload)[]) {
                if (key.endsWith('_id') && (payload[key] as unknown) === '') {
                    (payload as Record<string, unknown>)[key] = undefined;
                }
            }
            // Sanitize DATE fields: empty string would fail Postgres date cast
            if (!payload.end_date) payload.end_date = undefined;
            if (!payload.start_date) payload.start_date = undefined;
            await onSubmit(payload);
            onToast?.(initialData?.id ? 'Contrato atualizado com sucesso!' : 'Contrato criado com sucesso!', 'success');
        } catch (err: unknown) {
            const msg = err instanceof Error
                ? err.message
                : (err && typeof err === 'object' && 'message' in err)
                    ? String((err as { message: unknown }).message)
                    : String(err);
            console.error("Erro ao processar contrato:", err);
            // Constraint de número duplicado — incrementa automaticamente e tenta de novo
            if (msg.includes('contracts_outgoing_num_unique') || msg.includes('contracts_incoming_num_unique')) {
                try {
                    const dir = contractDirection;
                    let q = supabase.from('contracts').select('number').eq('organization_id', organizationId ?? '');
                    if (dir === 'OUTGOING') q = q.eq('direction', 'OUTGOING');
                    else q = (q as any).or('direction.eq.INCOMING,direction.is.null');
                    const { data: rows } = await q;
                    const used = new Set((rows ?? []).map((r: any) => parseInt(r.number ?? '', 10)).filter((n: number) => !isNaN(n)));
                    let next = 1;
                    while (used.has(next)) next++;
                    const nextNum = String(next).padStart(3, '0');
                    numberInputRef.current = nextNum;
                    setFormData(prev => ({ ...prev, number: nextNum }));
                    setNumberError(`Número em uso. Sugerido: ${nextNum}`);
                } catch { /* ignore */ }
            } else {
                setError(msg || "Erro desconhecido ao salvar contrato.");
                onToast?.(msg || 'Erro ao salvar contrato.', 'error');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const isOutgoing = direction === 'OUTGOING' || (formData.direction ?? initialData?.direction) === 'OUTGOING';

    const handleCreateClient = async () => {
        if (!newClientName.trim() || !organizationId) return;
        setSavingClient(true);
        try {
            const client = await crmClientService.saveClient({
                organization_id: organizationId,
                name: newClientName.trim(),
                document: newClientDoc.trim() || undefined,
                type: newClientType,
            } as any);
            const simple = { id: client.id, name: client.name, document: (client as any).document };
            setCrmClients(prev => [...prev, simple].sort((a, b) => a.name.localeCompare(b.name)));
            setFormData(prev => ({ ...prev, client_id: client.id }));
            setShowClientCreate(false);
            setNewClientName('');
            setNewClientDoc('');
        } catch (e) {
            console.error('Erro ao criar cliente:', e);
        } finally {
            setSavingClient(false);
        }
    };

    if (!isOpen) return null;

    return (
        <>
        <div className="fixed inset-0 z-[100]">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose} />
            <div className="absolute top-0 right-0 bottom-0 flex flex-col bg-white shadow-2xl w-full max-w-5xl overflow-hidden border-l border-gray-200 animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="border-b border-gray-100 bg-gray-50/50 flex justify-between items-start gap-6 shrink-0 px-8 py-6">
                    <div className="flex items-start gap-5 flex-1 min-w-0">
                        <div className="flex flex-col items-center gap-2 shrink-0">
                            <div className="bg-blue-600 p-2.5 rounded-xl text-white shadow-lg shadow-blue-100 flex items-center justify-center w-12 h-12">
                                <FileText className="w-6 h-6" />
                            </div>
                            <div className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 shadow-sm text-center">
                                {initialData?.id ? 'EDIT' : 'NOVO'}
                            </div>
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">
                                    {initialData?.id ? 'Ajustar Contrato' : (titleNew ?? (isOutgoing ? 'Novo Contrato de Serviço' : 'Novo Contrato'))}
                                </h2>
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 rounded-md border border-gray-200 shadow-sm">
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Módulo:</span>
                                    <span className="text-xs font-bold text-gray-600 uppercase">
                                        {moduleLabel ?? (isOutgoing ? 'Contratos de Serviço ao Cliente' : 'Gestão Estratégica de Suprimentos')}
                                    </span>
                                </div>
                            </div>
                            <p className="text-sm text-gray-500 font-medium leading-tight">
                                {initialData?.id ? 'Atualize as informações do contrato selecionado.' : 'Preencha os dados para criar um novo contrato.'}
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 rounded-full"
                    >
                        <X className="w-6 h-6" />
                    </Button>
                </div>

                {/* Form Body - 2:1 Layout */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col md:flex-row">
                    {/* Main Section (2/3) */}
                    <div className="flex-[2] overflow-y-auto p-10 space-y-10 scrollbar-hide border-r border-gray-100 bg-white">
                        {/* Section: Identificação */}
                        <div className="space-y-6">
                            <div className="flex items-center justify-between border-b border-gray-50 pb-4">
                                <div className="flex items-center gap-2">
                                    <Tag className="w-4 h-4 text-blue-600" />
                                    <h3 className="text-sm font-medium text-gray-900 uppercase tracking-widest">Identificação do Contrato</h3>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-medium text-gray-400 uppercase tracking-widest">É um contrato recorrente?</span>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            className="sr-only peer"
                                            checked={formData.is_recurring}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                is_recurring: e.target.checked,
                                                // Clear end_date when switching to recurring (it's optional for recurring)
                                                end_date: e.target.checked ? undefined : formData.end_date,
                                            })}
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                                {needsOrgPicker && (
                                    <div className="col-span-2 space-y-2">
                                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Organização *</label>
                                        <div className="relative group">
                                            <Building2 className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                            <select
                                                required
                                                value={pickedOrgId}
                                                onChange={(e) => setPickedOrgId(e.target.value)}
                                                className="w-full pl-14 pr-6 py-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                            >
                                                <option value="">Selecione a organização deste contrato</option>
                                                {storeOrganizations.map(org => (
                                                    <option key={org.id} value={org.id}>{org.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <p className="text-xs text-amber-600 ml-1">
                                            "Todas as Organizações" está selecionado — escolha em qual organização este contrato deve ser criado.
                                        </p>
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Número do Contrato</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            required
                                            maxLength={3}
                                            placeholder={isFetchingNumber ? 'Carregando...' : '001'}
                                            value={formData.number ?? ''}
                                            onChange={(e) => {
                                                numberInputRef.current = e.target.value;
                                                setNumberError(null);
                                                setFormData({ ...formData, number: e.target.value });
                                            }}
                                            onBlur={handleNumberBlur}
                                            className={`w-full px-6 py-4 bg-gray-50 border rounded-2xl text-sm font-semibold font-mono focus:outline-none focus:ring-4 transition-all ${numberError ? 'border-red-400 focus:ring-red-500/10 focus:border-red-500' : 'border-gray-100 focus:ring-blue-500/10 focus:border-blue-500'}`}
                                        />
                                        {isCheckingNumber && (
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                                            </div>
                                        )}
                                    </div>
                                    {numberError && (
                                        <p className="text-xs text-red-500 ml-1 flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3" /> {numberError}
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Título / Objeto</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Título resumido do contrato"
                                        value={formData.title}
                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                    />
                                </div>
                                {isOutgoing ? (
                                    <div className="col-span-2 space-y-2">
                                        <div className="flex items-center justify-between ml-1">
                                            <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Cliente / Contratante</label>
                                            {!showClientCreate && (
                                                <button type="button" onClick={() => setShowClientCreate(true)} className="text-xs font-medium text-blue-600 hover:text-blue-800 uppercase tracking-wider">
                                                    + Novo Cliente
                                                </button>
                                            )}
                                        </div>
                                        {showClientCreate ? (
                                            <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Cadastrar novo cliente</p>
                                                <div className="flex bg-white rounded-xl border border-blue-200 p-1 gap-1">
                                                    {(['PJ', 'PF'] as const).map(t => (
                                                        <button key={t} type="button" onClick={() => setNewClientType(t)}
                                                            className={`flex-1 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${newClientType === t ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                                                            {t === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}
                                                        </button>
                                                    ))}
                                                </div>
                                                <input
                                                    type="text"
                                                    required
                                                    placeholder="Nome / Razão Social *"
                                                    value={newClientName}
                                                    onChange={e => setNewClientName(e.target.value)}
                                                    className="w-full px-4 py-3 bg-white border border-blue-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder={newClientType === 'PJ' ? 'CNPJ (opcional)' : 'CPF (opcional)'}
                                                    value={newClientDoc}
                                                    onChange={e => setNewClientDoc(e.target.value)}
                                                    className="w-full px-4 py-3 bg-white border border-blue-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                                />
                                                <div className="flex gap-2">
                                                    <Button type="button" variant="primary" onClick={handleCreateClient} disabled={!newClientName.trim() || savingClient}
                                                        className="flex-1 py-2.5 rounded-xl text-button font-semibold uppercase tracking-wider">
                                                        {savingClient ? 'Salvando…' : 'Salvar Cliente'}
                                                    </Button>
                                                    <Button type="button" variant="secondary" onClick={() => { setShowClientCreate(false); setNewClientName(''); setNewClientDoc(''); }}
                                                        className="px-4 py-2.5 rounded-xl text-button font-medium">
                                                        Cancelar
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="relative group">
                                                <User className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                                <select
                                                    value={formData.client_id || ''}
                                                    onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                                                    className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                                >
                                                    <option value="">{crmClients.length === 0 ? 'Nenhum cliente — clique em + Novo Cliente' : 'Selecione o cliente'}</option>
                                                    {crmClients.map(c => (
                                                        <option key={c.id} value={c.id}>{c.name}{c.document ? ` (${c.document})` : ''}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="col-span-2 space-y-2">
                                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Fornecedor / Contratado</label>
                                        <div className="relative group">
                                            <User className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                            <select
                                                required
                                                value={formData.supplier_id || ''}
                                                onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                                                className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                            >
                                                <option value="">Selecione um fornecedor</option>
                                                {suppliers.map(s => (
                                                    <option key={s.id} value={s.id}>{getSupplierDisplayName(s, appSettingsService.get().supplierNameDisplay)} ({s.document || 'Sem doc'})</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}
                                <div className="col-span-2 space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Status do Contrato</label>
                                    <div className="relative group">
                                        <select
                                            required
                                            value={formData.status || 'Rascunho'}
                                            onChange={(e) => setFormData({ ...formData, status: e.target.value as ContractStatus })}
                                            className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                        >
                                            <option value="Rascunho">Rascunho (interno)</option>
                                            <option value="Minuta">Minuta (visível ao cliente)</option>
                                            <option value="Revisão">Revisão</option>
                                            <option value="Enviado">Enviado</option>
                                            <option value="Aprovado">Aprovado</option>
                                            <option value="Assinado">Assinado</option>
                                            <option value="Ativo">Ativo</option>
                                            <option value="Concluído">Concluído</option>
                                            <option value="Suspenso">Suspenso</option>
                                            <option value="Encerrado">Encerrado</option>
                                            <option value="Cancelado">Cancelado</option>
                                        </select>
                                    </div>
                                </div>

                                {/* GED: Upload Contrato Assinado */}
                                <div className="col-span-2 space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Contrato Assinado (GED)</label>
                                    {formData.signed_contract_url ? (
                                        <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-100 rounded-2xl group/file">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                                                    <FileText className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-medium text-blue-600 uppercase tracking-widest">Documento Vinculado</p>
                                                    <p className="text-xs font-medium text-gray-700 truncate max-w-[200px]">Contrato_Assinado.pdf</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <a
                                                    href={formData.signed_contract_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-2 bg-white text-blue-600 rounded-lg border border-blue-100 hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                                    title="Visualizar Documento"
                                                >
                                                    <ExternalLink className="w-4 h-4" />
                                                </a>
                                                <ActionIconButton kind="delete" title="Remover Documento" onClick={() => setFormData({ ...formData, signed_contract_url: undefined })} />
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            onClick={() => document.getElementById('contract-upload')?.click()}
                                            className="w-full p-8 border-2 border-dashed border-gray-200 rounded-[32px] hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer group"
                                        >
                                            <input
                                                id="contract-upload"
                                                type="file"
                                                accept=".pdf,.doc,.docx"
                                                className="hidden"
                                                onChange={handleFileUpload}
                                            />
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                                                    <Upload className="w-6 h-6" />
                                                </div>
                                                <p className="text-xs font-medium text-gray-400 uppercase tracking-widest group-hover:text-blue-600">Fazer upload do contrato assinado (PDF)</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Section: Escopo (OUTGOING only) */}
                        {isOutgoing && (
                            <div className="space-y-6">
                                <div className="flex items-center gap-2 border-b border-gray-50 pb-4">
                                    <ClipboardList className="w-4 h-4 text-blue-600" />
                                    <h3 className="text-sm font-medium text-gray-900 uppercase tracking-widest">Escopo do Serviço</h3>
                                </div>
                                <div className="grid grid-cols-1 gap-6">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between ml-1">
                                            <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Escopo / Objeto do Contrato</label>
                                            <div className="flex gap-2">
                                                <button type="button" onClick={() => setScopePickerOpen(true)}
                                                    className="text-xs font-medium text-blue-600 hover:text-blue-800 uppercase tracking-wider">
                                                    Buscar Salvo
                                                </button>
                                                <span className="text-gray-200">|</span>
                                                <button type="button" onClick={() => setScopeManagerOpen(true)}
                                                    className="text-xs font-medium text-gray-400 hover:text-gray-700 uppercase tracking-wider">
                                                    Gerenciar
                                                </button>
                                            </div>
                                        </div>
                                        <textarea
                                            rows={3}
                                            placeholder="Descreva o objeto e escopo detalhado dos serviços contratados"
                                            value={formData.description || ''}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all resize-none"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Serviços Inclusos</label>
                                            <textarea
                                                rows={3}
                                                placeholder="Liste os serviços incluídos no contrato"
                                                value={formData.services_included || ''}
                                                onChange={(e) => setFormData({ ...formData, services_included: e.target.value })}
                                                className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all resize-none"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Serviços Excluídos</label>
                                            <textarea
                                                rows={3}
                                                placeholder="Liste os serviços NÃO incluídos no contrato"
                                                value={formData.services_excluded || ''}
                                                onChange={(e) => setFormData({ ...formData, services_excluded: e.target.value })}
                                                className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all resize-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Section: Partes e Execução (OUTGOING only) */}
                        {isOutgoing && (
                            <div className="space-y-6">
                                <div className="flex items-center gap-2 border-b border-gray-50 pb-4">
                                    <Users className="w-4 h-4 text-blue-600" />
                                    <h3 className="text-sm font-medium text-gray-900 uppercase tracking-widest">Partes e Execução</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Responsável Interno</label>
                                        {employees.length > 0 ? (
                                            <select
                                                value={formData.internal_responsible || ''}
                                                onChange={e => setFormData({ ...formData, internal_responsible: e.target.value })}
                                                className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                            >
                                                <option value="">Selecione o responsável</option>
                                                {employees.map(e => (
                                                    <option key={e.id} value={e.name}>
                                                        {e.name}{e.role ? ` — ${e.role}` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                type="text"
                                                placeholder="Nome do responsável pela empresa"
                                                value={formData.internal_responsible || ''}
                                                onChange={e => setFormData({ ...formData, internal_responsible: e.target.value })}
                                                className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                            />
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Responsável do Cliente</label>
                                        <input
                                            type="text"
                                            placeholder="Nome do responsável no cliente"
                                            value={formData.client_responsible || ''}
                                            onChange={(e) => setFormData({ ...formData, client_responsible: e.target.value })}
                                            className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                        />
                                    </div>
                                    <div className="col-span-2 space-y-3">
                                        <div className="flex items-center gap-2 ml-1">
                                            <MapPin className="w-3.5 h-3.5 text-blue-500" />
                                            <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Endereço de Execução</label>
                                        </div>
                                        <div className="grid grid-cols-[1fr_120px] gap-3">
                                            <input
                                                type="text"
                                                placeholder="Logradouro (rua, avenida…)"
                                                value={formData.execution_street || ''}
                                                onChange={(e) => setFormData({ ...formData, execution_street: e.target.value })}
                                                className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Número"
                                                value={formData.execution_number || ''}
                                                onChange={(e) => setFormData({ ...formData, execution_number: e.target.value })}
                                                className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                            />
                                        </div>
                                        <div className="grid grid-cols-[1fr_1fr_80px_100px] gap-3">
                                            <input
                                                type="text"
                                                placeholder="Bairro"
                                                value={formData.execution_neighborhood || ''}
                                                onChange={(e) => setFormData({ ...formData, execution_neighborhood: e.target.value })}
                                                className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Cidade"
                                                value={formData.execution_city || ''}
                                                onChange={(e) => setFormData({ ...formData, execution_city: e.target.value })}
                                                className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                            />
                                            <input
                                                type="text"
                                                placeholder="UF"
                                                maxLength={2}
                                                value={formData.execution_state || ''}
                                                onChange={(e) => setFormData({ ...formData, execution_state: e.target.value.toUpperCase() })}
                                                className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium uppercase focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                            />
                                            <input
                                                type="text"
                                                placeholder="CEP"
                                                maxLength={9}
                                                value={formData.execution_zip || ''}
                                                onChange={(e) => setFormData({ ...formData, execution_zip: e.target.value })}
                                                className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">SLA (Dias de Resposta)</label>
                                        <div className="relative group">
                                            <input
                                                type="number"
                                                min="0"
                                                placeholder="Ex: 2"
                                                value={formData.sla_days ?? ''}
                                                onChange={(e) => setFormData({ ...formData, sla_days: parseInt(e.target.value) || undefined })}
                                                className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                            />
                                            <span className="absolute right-6 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 uppercase">Dias</span>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Garantia Contratual</label>
                                        <div className="relative group">
                                            <input
                                                type="number"
                                                min="0"
                                                placeholder="Ex: 12"
                                                value={formData.warranty_months ?? ''}
                                                onChange={(e) => setFormData({ ...formData, warranty_months: parseInt(e.target.value) || undefined })}
                                                className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                            />
                                            <span className="absolute right-6 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 uppercase">Meses</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Section: Classificação e Valores */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-2 border-b border-gray-50 pb-4">
                                <DollarSign className="w-4 h-4 text-blue-600" />
                                <h3 className="text-sm font-medium text-gray-900 uppercase tracking-widest">Valores e Classificação</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Tipo de Contrato</label>
                                    <select
                                        required
                                        value={formData.contract_type}
                                        onChange={(e) => setFormData({ ...formData, contract_type: e.target.value as ContractType })}
                                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                    >
                                        <optgroup label="Serviços ao Cliente">
                                            {contractTypes.filter(t => t.category === 'Serviços').map(t => (
                                                <option key={t.id} value={t.name}>{t.name}</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="Suprimentos">
                                            {contractTypes.filter(t => t.category === 'Suprimentos').map(t => (
                                                <option key={t.id} value={t.name}>{t.name}</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="Geral">
                                            {contractTypes.filter(t => t.category === 'Geral').map(t => (
                                                <option key={t.id} value={t.name}>{t.name}</option>
                                            ))}
                                        </optgroup>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Natureza</label>
                                    <select
                                        required
                                        value={formData.nature}
                                        onChange={(e) => setFormData({ ...formData, nature: e.target.value as ContractNature })}
                                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="Fornecimento">Fornecimento</option>
                                        <option value="Serviço">Serviço</option>
                                        <option value="Mão de Obra">Mão de Obra</option>
                                        <option value="Locação">Locação</option>
                                        <option value="Outros">Outros</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">
                                        {formData.is_recurring ? 'Valor por Ciclo (Opcional)' : 'Valor Original (Base)'}
                                    </label>
                                    <div className="relative group">
                                        <span className="absolute left-6 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">R$</span>
                                        <input
                                            type="number"
                                            required={!formData.is_recurring}
                                            min="0"
                                            step="0.01"
                                            placeholder={formData.is_recurring ? 'Variável — preencha se souber' : '0,00'}
                                            value={formData.original_value || ''}
                                            onChange={(e) => {
                                                const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                                setFormData({ ...formData, original_value: val });
                                            }}
                                            className="w-full pl-14 pr-6 py-4 bg-blue-50/30 border border-blue-100/50 rounded-2xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                        />
                                    </div>
                                </div>
                                {isOutgoing && (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Valor Mão de Obra (Opcional)</label>
                                            <div className="relative group">
                                                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">R$</span>
                                                <input type="number" min="0" step="0.01" placeholder="0,00"
                                                    value={formData.labor_value || ''}
                                                    onChange={e => setFormData({ ...formData, labor_value: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                                                    className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Valor Materiais (Opcional)</label>
                                            <div className="relative group">
                                                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">R$</span>
                                                <input type="number" min="0" step="0.01" placeholder="0,00"
                                                    value={formData.materials_value || ''}
                                                    onChange={e => setFormData({ ...formData, materials_value: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                                                    className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}
                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Retenção de Garantia (%)</label>
                                    <div className="relative group">
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="0.1"
                                            value={formData.retention_rate || ''}
                                            onChange={(e) => {
                                                const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                                setFormData({ ...formData, retention_rate: val });
                                            }}
                                            className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                        />
                                        <span className="absolute right-6 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section: Pagamento */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-2 border-b border-gray-50 pb-4">
                                <HandCoins className="w-4 h-4 text-blue-600" />
                                <h3 className="text-sm font-medium text-gray-900 uppercase tracking-widest">Condições de Pagamento</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                                {/* Modalidade de faturamento */}
                                <div className="col-span-2 space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Modalidade de Faturamento</label>
                                    <div className="flex gap-2 flex-wrap">
                                        {([
                                            { value: undefined, label: 'Padrão' },
                                            { value: 'MEDICAO', label: 'Por Medição' },
                                            { value: 'ETAPA', label: 'Por Etapa' },
                                            { value: 'SINAL_PARCELAS', label: 'Sinal + Parcelas' },
                                            { value: 'COST_PLUS', label: 'Administração' },
                                        ] as const).map(opt => (
                                            <button
                                                key={opt.label}
                                                type="button"
                                                onClick={() => setFormData(prev => ({ ...prev, billing_mode: opt.value as any }))}
                                                className={`px-4 py-2 rounded-xl text-form-input font-medium uppercase tracking-wider border transition-all ${
                                                    (formData.billing_mode ?? undefined) === opt.value
                                                        ? 'bg-blue-600 text-white border-blue-600'
                                                        : 'bg-gray-50 text-gray-500 border-gray-100 hover:border-blue-300'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                    {formData.billing_mode === 'MEDICAO' && (
                                        <div className="mt-3 p-4 bg-blue-50 border border-blue-100 rounded-2xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Exigências para liberar pagamento</p>
                                            <div className="space-y-2">
                                                {([
                                                    { key: 'require_invoice' as const, label: 'Nota Fiscal obrigatória' },
                                                    { key: 'require_evidence' as const, label: 'Evidência fotográfica obrigatória' },
                                                    { key: 'require_approval' as const, label: 'Aprovação manual obrigatória' },
                                                ]).map(({ key, label }) => (
                                                    <label key={key} className="flex items-center gap-3 cursor-pointer group">
                                                        <input
                                                            type="checkbox"
                                                            checked={(formData.release_requirements as any)?.[key] ?? false}
                                                            onChange={e => setFormData(prev => ({
                                                                ...prev,
                                                                release_requirements: {
                                                                    require_invoice: false,
                                                                    require_evidence: false,
                                                                    require_approval: false,
                                                                    ...(prev.release_requirements ?? {}),
                                                                    [key]: e.target.checked,
                                                                },
                                                            }))}
                                                            className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                                                        />
                                                        <span className="text-xs font-medium text-blue-800">{label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Forma de Pagamento</label>
                                    <select
                                        required
                                        value={formData.payment_method}
                                        onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="Boleto Bancário">Boleto Bancário</option>
                                        <option value="Pix">Pix</option>
                                        <option value="Cartão de Crédito">Cartão de Crédito</option>
                                        <option value="Cartão de Débito">Cartão de Débito</option>
                                        <option value="Transferência Bancária">Transferência Bancária</option>
                                        <option value="Dinheiro">Dinheiro</option>
                                    </select>
                                </div>
                                {isOutgoing && (
                                    <div className="space-y-2">
                                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Conta de Recebimento</label>
                                        <div className="relative group">
                                            <select
                                                value={formData.payment_account_id || ''}
                                                onChange={(e) => setFormData({ ...formData, payment_account_id: e.target.value || undefined })}
                                                className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                            >
                                                <option value="">Selecione a conta da organização</option>
                                                {paymentAccounts.map(acc => (
                                                    <option key={acc.id} value={acc.id}>
                                                        {acc.name}{acc.bank ? ` — ${acc.bank}` : ''}{acc.account_number ? ` (${acc.account_number})` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Condição de Pagamento</label>
                                    <div className="flex bg-gray-50 rounded-2xl p-1 border border-gray-100">
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, payment_term_type: 'Vista' })}
                                            className={`flex-1 py-3 px-4 rounded-xl text-form-label font-medium uppercase tracking-wider transition-all ${formData.payment_term_type === 'Vista' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            À Vista
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, payment_term_type: 'Parcelado' })}
                                            className={`flex-1 py-3 px-4 rounded-xl text-button font-medium uppercase tracking-wider transition-all ${formData.payment_term_type === 'Parcelado' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            Parcelado
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Prazo de Pagamento (Dias)</label>
                                    <div className="relative group">
                                        <input
                                            type="number"
                                            min="0"
                                            value={formData.payment_days ?? ''}
                                            onChange={(e) => setFormData({ ...formData, payment_days: parseInt(e.target.value) || 0 })}
                                            className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                        />
                                        <span className="absolute right-6 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 uppercase">Dias</span>
                                    </div>
                                </div>

                                {formData.payment_term_type === 'Parcelado' && !formData.is_recurring && (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-300 col-span-2">
                                        <div className="space-y-2">
                                            <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Nº de Parcelas</label>
                                            <div className="relative group">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={formData.payment_installments}
                                                    onChange={(e) => {
                                                        const count = parseInt(e.target.value) || 1;
                                                        setFormData(prev => ({ ...prev, payment_installments: count }));
                                                        setInstallmentSchedule(buildSchedule(count, formData.original_value ?? 0, formData.start_date ?? new Date().toISOString().split('T')[0]));
                                                    }}
                                                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all hover:border-blue-200"
                                                />
                                                <span className="absolute right-6 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 uppercase">X</span>
                                            </div>
                                        </div>

                                        {installmentSchedule.length > 0 && (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Cronograma de Parcelas</label>
                                                    <button
                                                        type="button"
                                                        onClick={() => setInstallmentSchedule(buildSchedule(formData.payment_installments ?? 1, formData.original_value ?? 0, formData.start_date ?? new Date().toISOString().split('T')[0]))}
                                                        className="text-xs text-blue-600 hover:text-blue-800 font-medium uppercase tracking-wider"
                                                    >
                                                        Redistribuir igualmente
                                                    </button>
                                                </div>
                                                <div className="rounded-2xl border border-gray-100 overflow-hidden">
                                                    <div className="grid grid-cols-[40px_1fr_1fr] bg-gray-50 border-b border-gray-100 px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                                                        <span>#</span>
                                                        <span>Vencimento</span>
                                                        <span className="text-right">Valor (R$)</span>
                                                    </div>
                                                    <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                                                        {installmentSchedule.map((inst, i) => (
                                                            <div key={i} className="grid grid-cols-[40px_1fr_1fr] items-center px-4 py-2 gap-2 hover:bg-gray-50 transition-colors">
                                                                <span className="text-xs font-bold text-gray-400">{i + 1}</span>
                                                                <input
                                                                    type="date"
                                                                    value={inst.date}
                                                                    onChange={e => {
                                                                        const updated = [...installmentSchedule];
                                                                        updated[i] = { ...updated[i], date: e.target.value };
                                                                        setInstallmentSchedule(updated);
                                                                    }}
                                                                    className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                                                />
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.01"
                                                                    value={inst.value}
                                                                    onChange={e => {
                                                                        const updated = [...installmentSchedule];
                                                                        updated[i] = { ...updated[i], value: parseFloat(e.target.value) || 0 };
                                                                        setInstallmentSchedule(updated);
                                                                    }}
                                                                    className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="grid grid-cols-[40px_1fr_1fr] bg-gray-50 border-t border-gray-100 px-4 py-2">
                                                        <span className="col-span-2 text-xs font-bold text-gray-500 uppercase tracking-wider">Total</span>
                                                        <span className={`text-right text-form-label font-black ${Math.abs(installmentSchedule.reduce((s, i) => s + i.value, 0) - (formData.original_value ?? 0)) > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
                                                            R$ {installmentSchedule.reduce((s, i) => s + i.value, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                </div>
                                                {Math.abs(installmentSchedule.reduce((s, i) => s + i.value, 0) - (formData.original_value ?? 0)) > 0.01 && (
                                                    <p className="text-xs text-red-500 ml-1">
                                                        Soma das parcelas difere do valor do contrato (R$ {(formData.original_value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                {formData.is_recurring && (
                                    <>
                                        <div className="space-y-2 animate-in fade-in slide-in-from-left-2 duration-300">
                                            <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Periodicidade</label>
                                            <select
                                                required
                                                value={formData.billing_cycle || 'Mensal'}
                                                onChange={(e) => setFormData({ ...formData, billing_cycle: e.target.value as 'Mensal' | 'Bimestral' | 'Semestral' | 'Anual' })}
                                                className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                            >
                                                <option value="Mensal">Mensal</option>
                                                <option value="Bimestral">Bimestral</option>
                                                <option value="Semestral">Semestral</option>
                                                <option value="Anual">Anual</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2 animate-in fade-in slide-in-from-left-2 duration-300">
                                            <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Dia de Vencimento</label>
                                            <div className="relative group">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="31"
                                                    required
                                                    value={formData.due_day}
                                                    onChange={(e) => setFormData({ ...formData, due_day: parseInt(e.target.value) || 10 })}
                                                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all hover:border-blue-200"
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Section: Locação (só quando nature = Locação) */}
                        {formData.nature === 'Locação' && (
                            <div className="space-y-6">
                                <div className="flex items-center gap-2 border-b border-gray-50 pb-4">
                                    <KeyRound className="w-4 h-4 text-emerald-600" />
                                    <h3 className="text-sm font-medium text-gray-900 uppercase tracking-widest">Locação</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Fiador (opcional)</label>
                                        <input
                                            type="text"
                                            value={formData.guarantor_name || ''}
                                            onChange={(e) => setFormData({ ...formData, guarantor_name: e.target.value })}
                                            placeholder="Nome do fiador"
                                            className="w-full px-6 py-4 bg-white border border-gray-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all hover:border-blue-200"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Multa Rescisória (nº de aluguéis)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.5"
                                            value={formData.rescission_penalty_months ?? ''}
                                            onChange={(e) => setFormData({ ...formData, rescission_penalty_months: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                                            placeholder="Ex.: 3"
                                            className="w-full px-6 py-4 bg-white border border-gray-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all hover:border-blue-200"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Garantia (caução / fiança / seguro)</label>
                                    {initialData?.id ? (
                                        <button
                                            type="button"
                                            onClick={() => setShowGuaranteeModal(true)}
                                            className="w-full px-6 py-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-sm font-semibold text-emerald-700 hover:bg-emerald-100 transition-all flex items-center justify-center gap-2"
                                        >
                                            <Shield className="w-4 h-4" /> Adicionar / gerenciar garantia
                                        </button>
                                    ) : (
                                        <p className="text-xs font-medium text-gray-400 px-1">Salve o contrato para registrar a caução/fiança.</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Section: Centros de Custo e Orçamento */}
                        <div className="space-y-6 pb-10">
                            <div className="flex items-center gap-2 border-b border-gray-50 pb-4">
                                <Briefcase className="w-4 h-4 text-blue-600" />
                                <h3 className="text-sm font-medium text-gray-900 uppercase tracking-widest">Centro de Custo e Orçamento</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Centro de Custo</label>
                                    <HierarchicalSelect
                                        items={costCenters}
                                        value={formData.cost_center_id || ''}
                                        onChange={(v) => setFormData({ ...formData, cost_center_id: v })}
                                        valueField="id"
                                        placeholder="Nenhum centro vinculado"
                                        hoverCls="hover:bg-blue-50"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Conta Financeira</label>
                                    <HierarchicalSelect
                                        items={chartOfAccounts}
                                        value={formData.category_id || ''}
                                        onChange={(v) => setFormData({ ...formData, category_id: v })}
                                        valueField="id"
                                        placeholder="Nenhuma conta vinculada"
                                        hoverCls="hover:bg-blue-50"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Obra Relacionada</label>
                                    <div className="relative group">
                                        <Building2 className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                        <select
                                            required
                                            value={formData.project_id || ''}
                                            onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                                            className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                        >
                                            <option value="">Selecione uma obra</option>
                                            {obrasList.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Orçamento de Referência (Opcional)</label>
                                    <div className="relative group">
                                        <FileText className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                        <select
                                            value={formData.budget_id || ''}
                                            onChange={(e) => setFormData({ ...formData, budget_id: e.target.value || undefined })}
                                            className="w-full pl-14 pr-6 py-4 bg-blue-50/30 border border-blue-100/50 rounded-2xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                        >
                                            <option value="">Mesmo da obra ou nenhum</option>
                                            {orcamentosList.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Classificação Fiscal (Opcional)</label>
                                    <input
                                        type="text"
                                        placeholder="Enquadramento indicado ao módulo Fiscal (ex: cessão de mão de obra)"
                                        value={formData.fiscal_classification || ''}
                                        onChange={(e) => setFormData({ ...formData, fiscal_classification: e.target.value })}
                                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section: Identificação da Obra (Fase 5.4 — CP-02) */}
                        <div className="space-y-6 pb-10">
                            <div className="flex items-center gap-2 border-b border-gray-50 pb-4">
                                <MapPin className="w-4 h-4 text-blue-600" />
                                <h3 className="text-sm font-medium text-gray-900 uppercase tracking-widest">Identificação da Obra</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">CNO / Matrícula CEI</label>
                                    <input
                                        type="text"
                                        placeholder="Ex: 12.345.67890/12"
                                        value={formData.cno || ''}
                                        onChange={(e) => setFormData({ ...formData, cno: e.target.value })}
                                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Matrícula / Registro da Obra</label>
                                    <input
                                        type="text"
                                        placeholder="Registro alternativo (opcional)"
                                        value={formData.obra_registration || ''}
                                        onChange={(e) => setFormData({ ...formData, obra_registration: e.target.value })}
                                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Gestor da Obra</label>
                                    <input
                                        type="text"
                                        placeholder="Nome do gestor responsável"
                                        value={formData.manager_name || ''}
                                        onChange={(e) => setFormData({ ...formData, manager_name: e.target.value })}
                                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Fiscal do Contrato</label>
                                    <input
                                        type="text"
                                        placeholder="Nome do fiscal responsável"
                                        value={formData.inspector_name || ''}
                                        onChange={(e) => setFormData({ ...formData, inspector_name: e.target.value })}
                                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar Summary (1/3) */}
                    <div className="flex-1 overflow-y-auto p-10 bg-gray-50 space-y-8 flex flex-col shrink-0">
                        <div className="space-y-6">
                            <div className="flex items-center gap-2 border-b border-gray-200 pb-4">
                                <Calendar className="w-4 h-4 text-blue-600" />
                                <h3 className="text-sm font-medium text-gray-900 uppercase tracking-widest">Cronograma</h3>
                            </div>
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Data Início</label>
                                    <input
                                        type="date"
                                        required
                                        value={formData.start_date}
                                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                        className="w-full px-6 py-4 bg-white border border-gray-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all hover:border-blue-200"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">
                                        {formData.is_recurring ? "Data Fim (Limite Opcional)" : "Data Fim (Previsão)"}
                                    </label>
                                    <input
                                        type="date"
                                        required={!formData.is_recurring}
                                        value={formData.end_date || ''}
                                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                                        className="w-full px-6 py-4 bg-white border border-gray-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all hover:border-blue-200"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest ml-1">Índice Reajuste</label>
                                    <select
                                        value={formData.reajuste_index}
                                        onChange={(e) => setFormData({ ...formData, reajuste_index: e.target.value })}
                                        className="w-full px-6 py-4 bg-white border border-gray-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all hover:border-blue-200 select-none"
                                    >
                                        <option value="INCC">INCC</option>
                                        <option value="IPCA">IPCA</option>
                                        <option value="IGP-M">IGP-M</option>
                                        <option value="Outros">Outros</option>
                                        <option value="Sem Reajuste">Sem Reajuste</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-blue-600 rounded-[32px] text-white shadow-xl shadow-blue-200 mt-auto">
                            <h4 className="text-xs font-medium uppercase tracking-[0.2em] opacity-60 mb-2">Exposição Financeira</h4>
                            <div className="flex items-baseline gap-2">
                                <span className="text-xl font-medium tracking-tighter">R$</span>
                                <span className="text-3xl font-medium tracking-tighter">
                                    {formData.original_value?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                            <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-xs font-medium uppercase tracking-widest opacity-80">
                                <span>Retenção Prevista:</span>
                                <span>R$ {((formData.original_value || 0) * (formData.retention_rate || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>

                        {error && (
                            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 animate-in fade-in slide-in-from-top-2 mb-4">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                <p className="text-xs font-medium uppercase tracking-wider leading-tight">{error}</p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isSubmitting || isFetchingNumber || !organizationId}
                            className={`w-full py-5 rounded-[24px] text-white transition-all shadow-xl font-medium text-form-label uppercase tracking-[0.2em] flex items-center justify-center gap-3 group ${(isSubmitting || isFetchingNumber || !organizationId)
                                ? 'bg-gray-400 cursor-not-allowed shadow-none'
                                : 'bg-gray-900 hover:bg-emerald-600 shadow-gray-200 hover:shadow-emerald-200 active:scale-95'
                                }`}
                        >
                            {isSubmitting ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <Shield className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            )}
                            {isSubmitting ? 'Salvando...' : (initialData ? 'Confirmar Ajustes' : 'Efetuar Cadastro')}
                        </button>
                    </div>
                </form>
            </div>
        </div>

        {/* Scope picker */}
        {scopePickerOpen && organizationId && (
            <ContractScopeManager
                organizationId={organizationId}
                mode="pick"
                onClose={() => setScopePickerOpen(false)}
                onSelect={s => setFormData(prev => ({ ...prev, description: s.content }))}
            />
        )}

        {/* Scope manager */}
        {scopeManagerOpen && organizationId && (
            <ContractScopeManager
                organizationId={organizationId}
                mode="manage"
                onClose={() => setScopeManagerOpen(false)}
            />
        )}

        {/* Garantia de locação (caução / fiança / seguro) — exige contrato salvo */}
        {showGuaranteeModal && initialData?.id && organizationId && (
            <ContractGuaranteeModal
                isOpen={showGuaranteeModal}
                onClose={() => setShowGuaranteeModal(false)}
                onSuccess={() => setShowGuaranteeModal(false)}
                contract={{ ...formData, id: initialData.id, organization_id: organizationId } as Contract}
            />
        )}
        </>
    );
};

