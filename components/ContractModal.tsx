import React from 'react';
import { X, FileText, Calendar, Building2, User, DollarSign, Shield, Tag, Briefcase, Loader2, AlertCircle, HandCoins } from 'lucide-react';
import HierarchicalSelect from './HierarchicalSelect';
import { Contract, Supplier, CostCenter, ChartOfAccount } from '../types';
import { supplierService } from '../services/supplierService';
import { financialRegistryService } from '../services/financialRegistryService';
import { projectService } from '../services/projectService';
import { storageService } from '../services/storageService';
import { sanitizeFileName } from '../utils/storageUtils';
import { Upload, Trash2, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ContractModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<Contract>) => Promise<void>;
    projectId: string;
    organizationId?: string;
    initialData?: Contract;
}

export const ContractModal: React.FC<ContractModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    projectId,
    organizationId,
    initialData
}) => {
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

    const [projects, setProjects] = React.useState<any[]>([]);

    const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
    const [costCenters, setCostCenters] = React.useState<CostCenter[]>([]);
    const [chartOfAccounts, setChartOfAccounts] = React.useState<ChartOfAccount[]>([]);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [isFetchingNumber, setIsFetchingNumber] = React.useState(false);

    React.useEffect(() => {
        if (isOpen) {
            loadDependencies();
        }
    }, [isOpen, organizationId]);

    // Auto-fetch next sequential number for new contracts
    React.useEffect(() => {
        if (!isOpen || initialData || !organizationId) return;
        (async () => {
            setIsFetchingNumber(true);
            try {
                const { data } = await supabase.rpc('get_next_contract_number', { p_org_id: organizationId });
                if (data) setFormData(prev => ({ ...prev, number: String(data).padStart(3, '0') }));
            } catch (e) {
                console.error(e);
            } finally {
                setIsFetchingNumber(false);
            }
        })();
    }, [isOpen, initialData, organizationId]);

    React.useEffect(() => {
        if (initialData) {
            setFormData(prev => ({ ...prev, ...initialData }));
        }
    }, [initialData]);

    const loadDependencies = async () => {
        setIsSubmitting(true);
        try {
            const [s, cc, ca, p] = await Promise.all([
                supplierService.listSuppliers(organizationId),
                financialRegistryService.listCostCenters(organizationId),
                financialRegistryService.listChartOfAccounts(organizationId),
                projectService.listProjects(undefined, organizationId, true)
            ]);
            setSuppliers(s);
            setCostCenters(cc);
            setChartOfAccounts(ca);
            setProjects(p);
        } catch (error) {
            console.error("Erro ao carregar dependências do contrato:", error);
        } finally {
            setIsSubmitting(false);
        }
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
        } catch (error: any) {
            console.error("Erro ao fazer upload do contrato:", error);
            alert(`Erro ao fazer upload: ${error.message || 'Erro desconhecido'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const obrasList = projects.filter(p => !p.settings?.classification || p.settings.classification === 'OBRA');
    const orcamentosList = projects.filter(p => p.settings?.classification === 'ORCAMENTO');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);
        try {
            const payload = { ...formData, organization_id: organizationId };
            if (payload.is_recurring) {
                payload.payment_installments = undefined;
            } else {
                payload.billing_cycle = undefined;
                payload.due_day = undefined;
            }
            await onSubmit(payload);
        } catch (err: any) {
            console.error("Erro ao processar contrato:", err);
            setError(err.message || "Erro desconhecido ao salvar contrato.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-gray-50 w-full max-w-5xl h-[90vh] rounded-[40px] shadow-2xl flex flex-col overflow-hidden border border-white/20">
                {/* Header */}
                <div className="bg-[#0B1727] p-8 text-white relative shrink-0">
                    <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-blue-600/20 to-transparent" />
                    <div className="flex justify-between items-start relative z-10">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                                <FileText className="w-8 h-8 text-white" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-medium tracking-tight">{initialData ? 'Ajustar Contrato' : 'Novo Contrato'}</h2>
                                <p className="text-blue-400 text-[12px] font-medium uppercase tracking-[0.2em] mt-1">Gestão Estratégica de Suprimentos</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all hover:rotate-90 duration-300"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
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
                                    <span className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">É um contrato recorrente?</span>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            className="sr-only peer"
                                            checked={formData.is_recurring}
                                            onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked })}
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Número do Contrato</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder={isFetchingNumber ? 'Carregando...' : '001'}
                                        value={formData.number ?? ''}
                                        onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold font-mono focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Título / Objeto</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Título resumido do contrato"
                                        value={formData.title}
                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                    />
                                </div>
                                <div className="col-span-2 space-y-2">
                                    <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Fornecedor / Contratado</label>
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
                                                <option key={s.id} value={s.id}>{s.name} ({s.document || 'Sem doc'})</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="col-span-2 space-y-2">
                                    <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Status do Contrato</label>
                                    <div className="relative group">
                                        <select
                                            required
                                            value={formData.status || 'Rascunho'}
                                            onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                                            className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                        >
                                            <option value="Rascunho">Rascunho</option>
                                            <option value="Ativo">Ativo</option>
                                            <option value="Suspenso">Suspenso</option>
                                            <option value="Encerrado">Encerrado</option>
                                            <option value="Cancelado">Cancelado</option>
                                        </select>
                                    </div>
                                </div>

                                {/* GED: Upload Contrato Assinado */}
                                <div className="col-span-2 space-y-2">
                                    <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Contrato Assinado (GED)</label>
                                    {formData.signed_contract_url ? (
                                        <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-100 rounded-2xl group/file">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                                                    <FileText className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="text-[12px] font-medium text-blue-600 uppercase tracking-widest">Documento Vinculado</p>
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
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, signed_contract_url: undefined })}
                                                    className="p-2 bg-white text-red-500 rounded-lg border border-red-50 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                                    title="Remover Documento"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
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
                                                <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest group-hover:text-blue-600">Fazer upload do contrato assinado (PDF)</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Section: Classificação e Valores */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-2 border-b border-gray-50 pb-4">
                                <DollarSign className="w-4 h-4 text-blue-600" />
                                <h3 className="text-sm font-medium text-gray-900 uppercase tracking-widest">Valores e Classificação</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Tipo de Contrato</label>
                                    <select
                                        required
                                        value={formData.contract_type}
                                        onChange={(e) => setFormData({ ...formData, contract_type: e.target.value as any })}
                                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="Empreitada Global">Empreitada Global</option>
                                        <option value="Preço Unitário">Preço Unitário</option>
                                        <option value="Administração">Administração</option>
                                        <option value="Subempreitada">Subempreitada</option>
                                        <option value="Outros">Outros</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Natureza</label>
                                    <select
                                        required
                                        value={formData.nature}
                                        onChange={(e) => setFormData({ ...formData, nature: e.target.value as any })}
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
                                    <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">{formData.is_recurring ? 'Valor Estimado Mensal' : 'Valor Original (Base)'}</label>
                                    <div className="relative group">
                                        <span className="absolute left-6 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">R$</span>
                                        <input
                                            type="number"
                                            required
                                            min="0"
                                            step="0.01"
                                            value={formData.original_value || ''}
                                            onChange={(e) => {
                                                const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                                setFormData({ ...formData, original_value: val });
                                            }}
                                            className="w-full pl-14 pr-6 py-4 bg-blue-50/30 border border-blue-100/50 rounded-2xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Retenção de Garantia (%)</label>
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
                                <div className="space-y-2">
                                    <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Forma de Pagamento</label>
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
                                <div className="space-y-2">
                                    <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Condição de Pagamento</label>
                                    <div className="flex bg-gray-50 rounded-2xl p-1 border border-gray-100">
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, payment_term_type: 'Vista' })}
                                            className={`flex-1 py-3 px-4 rounded-xl text-[12px] font-medium uppercase tracking-wider transition-all ${formData.payment_term_type === 'Vista' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            À Vista
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, payment_term_type: 'Parcelado' })}
                                            className={`flex-1 py-3 px-4 rounded-xl text-[12px] font-medium uppercase tracking-wider transition-all ${formData.payment_term_type === 'Parcelado' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            Parcelado
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Prazo de Pagamento (Dias)</label>
                                    <div className="relative group">
                                        <input
                                            type="number"
                                            min="0"
                                            value={formData.payment_days ?? ''}
                                            onChange={(e) => setFormData({ ...formData, payment_days: parseInt(e.target.value) || 0 })}
                                            className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                        />
                                        <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[12px] font-medium text-gray-400 uppercase">Dias</span>
                                    </div>
                                </div>

                                {formData.payment_term_type === 'Parcelado' && !formData.is_recurring && (
                                    <div className="space-y-2 animate-in fade-in slide-in-from-left-2 duration-300">
                                        <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Nº de Parcelas</label>
                                        <div className="relative group">
                                            <input
                                                type="number"
                                                min="1"
                                                value={formData.payment_installments}
                                                onChange={(e) => setFormData({ ...formData, payment_installments: parseInt(e.target.value) || 1 })}
                                                className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all hover:border-blue-200"
                                            />
                                            <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[12px] font-medium text-gray-400 uppercase">X</span>
                                        </div>
                                    </div>
                                )}
                                
                                {formData.is_recurring && (
                                    <>
                                        <div className="space-y-2 animate-in fade-in slide-in-from-left-2 duration-300">
                                            <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Periodicidade</label>
                                            <select
                                                required
                                                value={formData.billing_cycle || 'Mensal'}
                                                onChange={(e) => setFormData({ ...formData, billing_cycle: e.target.value as any })}
                                                className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                            >
                                                <option value="Mensal">Mensal</option>
                                                <option value="Bimestral">Bimestral</option>
                                                <option value="Semestral">Semestral</option>
                                                <option value="Anual">Anual</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2 animate-in fade-in slide-in-from-left-2 duration-300">
                                            <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Dia de Vencimento</label>
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

                        {/* Section: Centros de Custo e Orçamento */}
                        <div className="space-y-6 pb-10">
                            <div className="flex items-center gap-2 border-b border-gray-50 pb-4">
                                <Briefcase className="w-4 h-4 text-blue-600" />
                                <h3 className="text-sm font-medium text-gray-900 uppercase tracking-widest">Centro de Custo e Orçamento</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Centro de Custo</label>
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
                                    <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Conta Financeira</label>
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
                                    <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Obra Relacionada</label>
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
                                    <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Orçamento de Referência (Opcional)</label>
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
                                    <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Data Início</label>
                                    <input
                                        type="date"
                                        required
                                        value={formData.start_date}
                                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                        className="w-full px-6 py-4 bg-white border border-gray-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all hover:border-blue-200"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">
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
                                    <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Índice Reajuste</label>
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
                            <h4 className="text-[12px] font-medium uppercase tracking-[0.2em] opacity-60 mb-2">Exposição Financeira</h4>
                            <div className="flex items-baseline gap-2">
                                <span className="text-xl font-medium tracking-tighter">R$</span>
                                <span className="text-3xl font-medium tracking-tighter">
                                    {formData.original_value?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                            <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-[12px] font-medium uppercase tracking-widest opacity-80">
                                <span>Retenção Prevista:</span>
                                <span>R$ {((formData.original_value || 0) * (formData.retention_rate || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>

                        {error && (
                            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 animate-in fade-in slide-in-from-top-2 mb-4">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                <p className="text-[12px] font-medium uppercase tracking-wider leading-tight">{error}</p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={`w-full py-5 rounded-[24px] text-white transition-all shadow-xl font-medium text-[12px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 group ${isSubmitting
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
    );
};
