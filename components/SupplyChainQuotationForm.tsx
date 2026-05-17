import React from 'react';
import { ArrowLeft, Plus, Trash2, Save, Building2, Calendar, FileText, Package, Filter, HandCoins, Layers, AlertCircle, X } from 'lucide-react';
import { QuotationRequest, ProjectSettings, Supplier, QuotationRequestItem, SinapiType, SinapiCategory, BudgetEntry } from '../types';
import { quotationService } from '../services/quotationService';
import { projectService } from '../services/projectService';
import { supplierService } from '../services/supplierService';
import { sinapiService } from '../services/sinapiService';
import MaterialSelectionModal from './MaterialSelectionModal';

interface SupplyChainQuotationFormProps {
    onBack: () => void;
    onSave: () => void;
    editingQuotationId?: string | null;
}

const SupplyChainQuotationForm: React.FC<SupplyChainQuotationFormProps> = ({ onBack, onSave, editingQuotationId }) => {
    const [loading, setLoading] = React.useState(false);
    const [formError, setFormError] = React.useState<string | null>(null);
    const [projects, setProjects] = React.useState<any[]>([]);
    const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);

    const [formData, setFormData] = React.useState<Omit<QuotationRequest, 'id' | 'number'>>({
        projectId: '',
        title: '',
        description: '',
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'Aberta',
        items: [],
        invitedSupplierIds: [],
        deliveryDate: '',
        deliveryMethod: 'CIF - Entrega por conta do fornecedor',
        deliveryLocation: 'Canteiro de Obras',
        paymentMethod: 'Boleto',
        paymentTermType: 'Vista',
        paymentDays: 30,
        paymentInstallments: 1
    });

    const [projectData, setProjectData] = React.useState<any | null>(null);
    const [selectedItems, setSelectedItems] = React.useState<Set<string>>(new Set());
    const [customQuantities, setCustomQuantities] = React.useState<Map<string, number>>(new Map());
    const [customPrices, setCustomPrices] = React.useState<Map<string, number>>(new Map());
    const [selectedMaterialsData, setSelectedMaterialsData] = React.useState<Map<string, any>>(new Map());

    // Composition Selection State
    const [selectedCompositionItem, setSelectedCompositionItem] = React.useState<BudgetEntry | null>(null);
    const [isMaterialModalOpen, setIsMaterialModalOpen] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        const fetchData = async () => {
            try {
                const [projList, supList] = await Promise.all([
                    projectService.listProjects(),
                    supplierService.listSuppliers()
                ]);
                if (cancelled) return;
                // Filter budgets, cost estimations, and obras (including those without classification)
                const orcamentos = projList.filter((p: any) =>
                    !p.settings?.classification ||
                    p.settings?.classification === 'ORCAMENTO' ||
                    p.settings?.classification === 'COST_ESTIMATION' ||
                    p.settings?.classification === 'OBRA'
                );
                setProjects(orcamentos);
                setSuppliers(supList);
            } catch (err) {
                console.error("Error loading form data:", err);
            }
        };
        fetchData();
        return () => { cancelled = true; };
    }, []);

    // Helper to fetch and update prices for a budget
    const fetchBudgetPrices = React.useCallback(async (budget: BudgetEntry[], settings: any) => {
        const allCodes = new Set<string>();
        budget.forEach(item => {
            if (item.sinapiItem) {
                allCodes.add(item.sinapiItem.code);
                item.sinapiItem.composition?.forEach(comp => {
                    allCodes.add(comp.code);
                });
            }
        });
        const codes = Array.from(allCodes);
        if (codes.length === 0) return;

        const state = settings?.state || 'SP';
        const chargeType = settings?.socialChargesMode || 'Sem Desoneração';

        try {
            const items = await sinapiService.getItemsByCodes(codes, state, chargeType);
            const priceMap = new Map<string, number>();
            items.forEach(item => {
                if (item.price !== undefined && item.price !== null) {
                    priceMap.set(item.code, item.price);
                }
            });
            setCustomPrices(prev => {
                const next = new Map(prev);
                priceMap.forEach((v, k) => {
                    // Update only if current is 0 or doesn't exist
                    if (v > 0 || !next.has(k)) {
                        next.set(k, v);
                    }
                });
                return next;
            });
        } catch (err) {
            console.error("Error fetching budget prices:", err);
        }
    }, []);

    // Load existing quotation data if editing
    React.useEffect(() => {
        if (!editingQuotationId) return;
        let cancelled = false;

        const loadQuotation = async () => {
            try {
                const reqs = await quotationService.listRequests();
                if (cancelled) return;
                const quote = reqs.find(q => q.id === editingQuotationId);

                if (quote) {
                    setFormData({
                        projectId: quote.projectId,
                        title: quote.title,
                        description: quote.description || '',
                        deadline: quote.deadline.split('T')[0],
                        status: quote.status,
                        items: [], // Will separate manual from budget items below
                        invitedSupplierIds: quote.invitedSupplierIds,
                        deliveryDate: quote.deliveryDate || '',
                        deliveryMethod: quote.deliveryMethod || 'CIF - Entrega por conta do fornecedor',
                        deliveryLocation: quote.deliveryLocation || '',
                        paymentMethod: quote.paymentMethod || 'Boleto',
                        paymentTermType: quote.paymentTermType || 'Vista',
                        paymentDays: quote.paymentDays || 30,
                        paymentInstallments: quote.paymentInstallments || 1
                    });

                    // Pre-fill prices from quotation items if they exist
                    const existingPrices = new Map<string, number>();
                    quote.items.forEach((item: QuotationRequestItem) => {
                        if (item.unitPrice !== undefined && item.unitPrice !== null) {
                            existingPrices.set(item.code, item.unitPrice);
                        }
                    });
                    if (existingPrices.size > 0) {
                        setCustomPrices(prev => {
                            const next = new Map(prev);
                            existingPrices.forEach((v, k) => {
                                if (v > 0 || !next.has(k)) {
                                    next.set(k, v);
                                }
                            });
                            return next;
                        });
                    }
                }
            } catch (err) {
                console.error("Error loading quotation for edit:", err);
            }
        };

        loadQuotation();
        return () => { cancelled = true; };
    }, [editingQuotationId]);

    // Load budget items and project details when projectId changes
    React.useEffect(() => {
        if (!formData.projectId) {
            setProjectData(null);
            setSelectedItems(new Set());
            setCustomQuantities(new Map());
            return;
        }
        let cancelled = false;

        const loadProjectData = async () => {
            try {
                const data = await projectService.loadProject(formData.projectId);
                if (cancelled) return;
                setProjectData(data);

                // Fetch updated prices
                if (data?.budget) {
                    fetchBudgetPrices(data.budget, data.settings);
                }

                // For existing quotations, map items to selection state or manual items
                if (editingQuotationId) {
                    const reqs = await quotationService.listRequests();
                    const quote = reqs.find(q => q.id === editingQuotationId);

                    if (quote && data.budget) {
                        const budgetCodes = new Set(data.budget.map((b: BudgetEntry) => b.sinapiItem?.code).filter(Boolean));
                        const newSelected = new Set<string>();
                        const newQuantities = new Map<string, number>();
                        const manualItems: QuotationRequestItem[] = [];

                        quote.items.forEach(item => {
                            if (budgetCodes.has(item.code)) {
                                newSelected.add(item.code);
                                newQuantities.set(item.code, item.quantity);
                            } else {
                                manualItems.push(item);
                            }
                        });

                        setSelectedItems(newSelected);
                        setCustomQuantities(newQuantities);
                        setFormData(prev => ({ ...prev, items: manualItems }));
                    }
                } else if (!editingQuotationId && data && data.budget) {
                    // Auto-select materials if it's a new quotation
                    const materialItems = data.budget.filter((item: BudgetEntry) =>
                        item.sinapiItem && (
                            item.sinapiItem.type === SinapiType.INPUT ||
                            item.sinapiItem.type === SinapiType.COMPOSITION
                        )
                    );

                    const newSelected = new Set<string>();
                    const newQuantities = new Map<string, number>();

                    materialItems.forEach((item: BudgetEntry) => {
                        if (item.sinapiItem) {
                            newSelected.add(item.sinapiItem.code);
                            newQuantities.set(item.sinapiItem.code, item.quantity);
                        }
                    });

                    setSelectedItems(newSelected);
                    setCustomQuantities(newQuantities);
                }

                // Auto-fill delivery location with project address for new quotations
                if (!editingQuotationId && data.settings) {
                    const { street, number, neighborhood, city, state } = data.settings;
                    const addressParts = [];
                    if (street) addressParts.push(street);
                    if (number) addressParts.push(number);
                    if (neighborhood) addressParts.push(neighborhood);

                    let formattedAddress = addressParts.join(', ');
                    if (city || state) {
                        formattedAddress += ` - ${city || ''}${city && state ? '/' : ''}${state || ''}`;
                    }

                    if (formattedAddress.trim()) {
                        setFormData(prev => ({ ...prev, deliveryLocation: formattedAddress }));
                    }
                }
            } catch (err) {
                console.error("Error loading project data:", err);
            }
        };

        loadProjectData();
        return () => { cancelled = true; };
    }, [formData.projectId, editingQuotationId, fetchBudgetPrices]);

    const quotationItems = React.useMemo(() => {
        // 1. Get items from budget
        const budgetItems = projectData?.budget
            .filter((item: BudgetEntry) => item.sinapiItem && selectedItems.has(item.sinapiItem.code))
            .map((item: BudgetEntry) => {
                const code = item.sinapiItem!.code;
                const qty = Number(customQuantities.get(code) || item.quantity);
                const price = customPrices.get(code) ?? Number(item.sinapiItem!.price || 0);
                return {
                    code: code,
                    description: item.sinapiItem!.description,
                    unit: item.sinapiItem!.unit,
                    quantity: qty,
                    unitPrice: price,
                    total: qty * price
                };
            }) || [];

        // 2. Get items from materials data (compositions)
        const compositionItems = Array.from(selectedMaterialsData.values())
            .filter(insumo => selectedItems.has(insumo.code) && !budgetItems.some((bi: any) => bi.code === insumo.code))
            .map(insumo => {
                const code = insumo.code;
                const qty = Number(customQuantities.get(code) || 0);
                const price = customPrices.get(code) ?? Number(insumo.price || 0);
                return {
                    code: code,
                    description: insumo.description,
                    unit: insumo.unit,
                    quantity: qty,
                    unitPrice: price,
                    total: qty * price
                };
            });

        return [...budgetItems, ...compositionItems];
    }, [projectData, selectedItems, customQuantities, selectedMaterialsData, customPrices]);

    const totalQuotationValue = React.useMemo(() => {
        return quotationItems.reduce((sum, item) => sum + item.total, 0);
    }, [quotationItems]);

    const toggleItem = (code: string, budgetQty: number, budgetItemId?: string) => {
        const newSelected = new Set(selectedItems);
        const newQuantities = new Map(customQuantities);

        if (newSelected.has(code)) {
            newSelected.delete(code);
            newQuantities.delete(code);
        } else {
            // Se o item for uma composição, abrimos o modal em vez de selecionar diretamente
            const budgetItem = projectData?.budget.find((b: any) => b.id === budgetItemId);
            if (budgetItem?.sinapiItem?.type === SinapiType.COMPOSITION) {
                setSelectedCompositionItem(budgetItem);
                setIsMaterialModalOpen(true);
                return;
            }

            newSelected.add(code);
            newQuantities.set(code, budgetQty);
        }

        setSelectedItems(newSelected);
        setCustomQuantities(newQuantities);
    };

    const handleCompositionSelection = (selectedInsumos: any[]) => {
        const newSelected = new Set(selectedItems);
        const newQuantities = new Map(customQuantities);
        const newData = new Map(selectedMaterialsData);
        const newCodesToFetch: string[] = [];
        selectedInsumos.forEach(insumo => {
            newSelected.add(insumo.code);
            const currentQty = newQuantities.get(insumo.code) || 0;
            newQuantities.set(insumo.code, currentQty + insumo.selectedQuantity);
            
            // Store full data for persistence
            newData.set(insumo.code, insumo);

            if (!customPrices.has(insumo.code) || customPrices.get(insumo.code) === 0) {
                newCodesToFetch.push(insumo.code);
            }
        });

        setSelectedItems(newSelected);
        setCustomQuantities(newQuantities);
        setSelectedMaterialsData(newData);
        setIsMaterialModalOpen(false);
        setSelectedCompositionItem(null);

        // Fetch prices for newly added insumos if they are missing
        if (newCodesToFetch.length > 0 && projectData?.settings) {
            const state = projectData.settings.state || 'SP';
            const chargeType = projectData.settings.socialChargesMode || 'Sem Desoneração';
            sinapiService.getItemsByCodes(newCodesToFetch, state, chargeType)
                .then(items => {
                    setCustomPrices(prev => {
                        const next = new Map(prev);
                        items.forEach(item => {
                            if (item.price) next.set(item.code, item.price);
                        });
                        return next;
                    });
                })
                .catch(console.error);
        }
    };

    const updateItemQuantity = (code: string, qty: number) => {
        const newQuantities = new Map(customQuantities);
        newQuantities.set(code, Math.max(0, qty));
        setCustomQuantities(newQuantities);
    };

    const updateItemPrice = (code: string, price: number) => {
        const newPrices = new Map(customPrices);
        newPrices.set(code, Math.max(0, price));
        setCustomPrices(newPrices);
    };

    const handleAddItem = () => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, { code: '', description: '', unit: 'un', quantity: 1 }]
        }));
    };

    const handleRemoveItem = (index: number) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index)
        }));
    };

    const handleUpdateItem = (index: number, field: keyof QuotationRequestItem, value: any) => {
        setFormData(prev => {
            const newItems = [...prev.items];
            newItems[index] = { ...newItems[index], [field]: value };
            return { ...prev, items: newItems };
        });
    };

    const handleToggleSupplier = (supplierId: string) => {
        setFormData(prev => ({
            ...prev,
            invitedSupplierIds: prev.invitedSupplierIds.includes(supplierId)
                ? prev.invitedSupplierIds.filter(id => id !== supplierId)
                : [...prev.invitedSupplierIds, supplierId]
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading) return;

        // Consolidate budget items + manual items
        const allItems = [
            ...quotationItems.map(i => ({
                code: i.code,
                description: i.description,
                unit: i.unit,
                quantity: i.quantity,
                unitPrice: i.unitPrice
            })),
            ...formData.items
        ];

        setFormError(null);

        if (allItems.length === 0) {
            setFormError("Por favor, adicione pelo menos um item à cotação.");
            return;
        }

        if (formData.invitedSupplierIds.length === 0) {
            setFormError("Por favor, selecione pelo menos um fornecedor para convidar.");
            return;
        }

        setLoading(true);
        try {
            if (editingQuotationId) {
                await quotationService.updateRequest(editingQuotationId, {
                    ...formData,
                    items: allItems
                });
            } else {
                await quotationService.createRequest({
                    ...formData,
                    items: allItems
                });
            }
            onSave();
        } catch (err: any) {
            console.error("Error saving quotation:", err);
            setFormError(`Erro ao salvar cotação: ${err.message || 'Erro desconhecido'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="absolute inset-0 z-[110] flex items-center justify-center p-12 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
            <div className="relative bg-white rounded-[3rem] shadow-2xl w-full h-full flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden border border-white/20">

                {/* Cabeçalho Executivo Premium */}
                <div className="px-12 py-10 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={onBack}
                            className="p-4 bg-white text-gray-400 hover:text-blue-600 border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all group"
                        >
                            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        </button>
                        <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl shadow-sm shadow-blue-100/50 hidden md:block">
                            <FileText className="w-8 h-8" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                                {editingQuotationId ? 'Editar Solicitação de Cotação' : 'Nova Solicitação de Cotação'}
                            </h1>
                            <p className="text-gray-400 text-[11px] font-black uppercase tracking-[0.3em] mt-1.5 flex items-center gap-2">
                                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                                {editingQuotationId ? 'Gestão de Suprimentos • Edição Executiva' : 'Gestão de Suprimentos • Criação de Cotação'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || (selectedItems.size + formData.items.length) === 0}
                        className="flex items-center gap-2 bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-900/20 active:scale-95 transition-all"
                    >
                        <Save className="w-4 h-4" />
                        <span>{editingQuotationId ? 'Salvar Alterações' : 'Disparar Cotação'}</span>
                    </button>
                </div>

                {formError && (
                    <div className="px-12 py-3 bg-red-50 border-b border-red-100 flex items-center gap-3 text-red-600 shrink-0 animate-in slide-in-from-top-2 duration-200">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <p className="text-xs font-medium flex-1">{formError}</p>
                        <button onClick={() => setFormError(null)} className="text-red-400 hover:text-red-600 transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Main Form */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* General Info Card */}
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-blue-500" />
                                    Dados da Cotação
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Título da Cotação</label>
                                        <input
                                            required
                                            type="text"
                                            value={formData.title}
                                            onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                                            placeholder="Ex: Materiais Hidráulicos - Fase 1"
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Obra / Orçamento</label>
                                        <select
                                            required
                                            value={formData.projectId}
                                            onChange={e => setFormData(prev => ({ ...prev, projectId: e.target.value }))}
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                        >
                                            <option value="">Selecione um projeto...</option>
                                            {projects.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Prazo para Resposta</label>
                                        <input
                                            required
                                            type="date"
                                            value={formData.deadline}
                                            onChange={e => setFormData(prev => ({ ...prev, deadline: e.target.value }))}
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>

                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Descrição / Notas Adicionais</label>
                                        <textarea
                                            value={formData.description || ''}
                                            onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                            rows={2}
                                            placeholder="Instruções adicionais para os fornecedores..."
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Data de Entrega Desejada</label>
                                        <input
                                            type="date"
                                            value={formData.deliveryDate}
                                            onChange={e => setFormData(prev => ({ ...prev, deliveryDate: e.target.value }))}
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Entrega</label>
                                        <select
                                            value={formData.deliveryMethod}
                                            onChange={e => setFormData(prev => ({ ...prev, deliveryMethod: e.target.value }))}
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-bold"
                                        >
                                            <option value="CIF - Entrega por conta do fornecedor">CIF - Entrega por conta do fornecedor</option>
                                            <option value="FOB - Retirada por conta do comprador">FOB - Retirada por conta do comprador</option>
                                            <option value="Entrega Própria Fornecedor">Entrega Própria Fornecedor</option>
                                            <option value="Transportadora Terceirizada">Transportadora Terceirizada</option>
                                            <option value="Retirada em Mãos">Retirada em Mãos</option>
                                        </select>
                                    </div>

                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Local de Entrega</label>
                                        <input
                                            type="text"
                                            value={formData.deliveryLocation}
                                            onChange={e => setFormData(prev => ({ ...prev, deliveryLocation: e.target.value }))}
                                            placeholder="Ex: Canteiro de Obras / Almoxarifado"
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Pagamento Preferencial</label>
                                        <select
                                            value={formData.paymentMethod}
                                            onChange={e => setFormData(prev => ({ ...prev, paymentMethod: e.target.value }))}
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-bold"
                                        >
                                            <option value="Boleto">Boleto Bancário</option>
                                            <option value="Pix">Pix</option>
                                            <option value="Cartão de Crédito">Cartão de Crédito</option>
                                            <option value="Cartão de Débito">Cartão de Débito</option>
                                            <option value="Transferência">Transferência Bancária</option>
                                            <option value="Dinheiro">Dinheiro</option>
                                        </select>
                                    </div>

                                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100 mt-2">
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Condição de Pagamento</label>
                                            <div className="flex bg-white rounded-lg p-1 border border-gray-200">
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({ ...prev, paymentTermType: 'Vista' }))}
                                                    className={`flex-1 py-1.5 px-3 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${formData.paymentTermType === 'Vista' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                                >
                                                    À Vista
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({ ...prev, paymentTermType: 'Parcelado' }))}
                                                    className={`flex-1 py-1.5 px-3 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${formData.paymentTermType === 'Parcelado' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                                >
                                                    Parcelado
                                                </button>
                                            </div>
                                        </div>

                                        {formData.paymentTermType === 'Vista' ? (
                                            <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Prazo de Pagamento (Dias)</label>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={formData.paymentDays}
                                                        onChange={e => setFormData(prev => ({ ...prev, paymentDays: parseInt(e.target.value) || 0 }))}
                                                        className="w-full rounded-lg border border-gray-300 p-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none pr-12 bg-white"
                                                    />
                                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 uppercase">Dias</div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Quantidade de Parcelas</label>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        value={formData.paymentInstallments}
                                                        onChange={e => setFormData(prev => ({ ...prev, paymentInstallments: parseInt(e.target.value) || 1 }))}
                                                        className="w-full rounded-lg border border-gray-300 p-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none pr-12 bg-white"
                                                    />
                                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 uppercase">X</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Items Section */}
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                        <Package className="w-4 h-4 text-blue-500" />
                                        Itens do Orçamento
                                    </h3>
                                    {projectData && (
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                            Selecione os itens para cotação
                                        </p>
                                    )}
                                </div>

                                {projectData ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-xs">
                                                <tr>
                                                    <th className="px-4 py-3 rounded-l-lg w-10"></th>
                                                    <th className="px-4 py-3">Cód.</th>
                                                    <th className="px-4 py-3">Descrição</th>
                                                    <th className="px-4 py-3 text-right">Qtd. Orç.</th>
                                                    <th className="px-4 py-3">Unid.</th>
                                                    <th className="px-4 py-3 text-right">Preço Unit.</th>
                                                    <th className="px-4 py-3 text-right rounded-r-lg bg-blue-50 text-blue-600">Qtd. Cotar</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {projectData.budget
                                                    .filter((item: BudgetEntry) => item.sinapiItem && (item.sinapiItem.type === SinapiType.INPUT || item.sinapiItem.type === SinapiType.COMPOSITION))
                                                    .map((item: BudgetEntry) => {
                                                        const code = item.sinapiItem!.code;
                                                        const isSelected = selectedItems.has(code);
                                                        return (
                                                            <tr 
                                                                key={code} 
                                                                className={`hover:bg-gray-50 transition-colors cursor-pointer ${isSelected ? 'bg-blue-50/30' : ''}`}
                                                                onClick={() => toggleItem(code, item.quantity, item.id)}
                                                            >
                                                                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isSelected}
                                                                        onChange={() => toggleItem(code, item.quantity, item.id)}
                                                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                                                                    />
                                                                </td>
                                                                <td className="px-4 py-3 text-xs font-mono text-gray-400">
                                                                    <div className="flex items-center gap-2">
                                                                        {item.sinapiItem?.type === SinapiType.COMPOSITION && (
                                                                            <Layers className="w-3 h-3 text-blue-500" />
                                                                        )}
                                                                        {code}
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-3 font-medium text-gray-900">
                                                                    <div className="flex flex-col">
                                                                        <span>{item.sinapiItem!.description}</span>
                                                                        {item.sinapiItem?.type === SinapiType.COMPOSITION && (
                                                                            <span className="text-[9px] text-blue-600 font-bold uppercase tracking-wider mt-0.5 animate-pulse">Clique para selecionar insumos</span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-3 text-right text-gray-500">{item.quantity}</td>
                                                                <td className="px-4 py-3 text-gray-400">{item.sinapiItem!.unit}</td>
                                                                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                                                    {isSelected ? (
                                                                        <div className="flex flex-col items-end gap-1">
                                                                            <input
                                                                                type="number"
                                                                                min={0}
                                                                                step="any"
                                                                                value={customPrices.get(code) ?? item.sinapiItem!.price ?? 0}
                                                                                onChange={(e) => updateItemPrice(code, parseFloat(e.target.value) || 0)}
                                                                                className="w-24 text-right rounded border border-emerald-300 p-1 text-xs font-bold text-emerald-700 bg-emerald-50 outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
                                                                            />
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-gray-900 font-medium">
                                                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.sinapiItem!.price || 0)}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-3 text-right bg-blue-50/30" onClick={(e) => e.stopPropagation()}>
                                                                    {isSelected ? (
                                                                        <input
                                                                            type="number"
                                                                            value={customQuantities.get(code) ?? item.quantity}
                                                                            onChange={(e) => updateItemQuantity(code, parseFloat(e.target.value) || 0)}
                                                                            className="w-20 bg-white border border-blue-200 rounded px-2 py-1 text-right font-bold text-blue-600 focus:ring-1 focus:ring-blue-500 outline-none"
                                                                        />
                                                                    ) : (
                                                                        <span className="text-gray-300 italic">--</span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="py-12 flex flex-col items-center border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50/50">
                                        <Package className="w-8 h-8 text-gray-200 mb-2" />
                                        <p className="text-sm font-medium text-gray-400">Selecione uma obra para ver os itens do orçamento</p>
                                    </div>
                                )}
                            </div>

                            {/* Manual Items Section */}
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                        <Plus className="w-4 h-4 text-blue-500" />
                                        Itens Manuais / Extras
                                    </h3>
                                    <button
                                        type="button"
                                        onClick={handleAddItem}
                                        className="text-blue-600 hover:text-blue-800 text-xs font-bold flex items-center gap-1"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        Adicionar Item Manual
                                    </button>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-xs">
                                            <tr>
                                                <th className="px-4 py-3 rounded-l-lg">Código</th>
                                                <th className="px-4 py-3">Descrição</th>
                                                <th className="px-4 py-3 text-right">Qtd.</th>
                                                <th className="px-4 py-3">Unid.</th>
                                                <th className="px-4 py-3 text-right rounded-r-lg">Ação</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {formData.items.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="text"
                                                            value={item.code}
                                                            onChange={e => handleUpdateItem(idx, 'code', e.target.value)}
                                                            className="w-20 bg-transparent border-none p-0 text-xs font-mono text-gray-500 focus:ring-0"
                                                            placeholder="Cód."
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            required
                                                            type="text"
                                                            value={item.description}
                                                            onChange={e => handleUpdateItem(idx, 'description', e.target.value)}
                                                            className="w-full bg-transparent border-none p-0 font-medium text-gray-900 focus:ring-0"
                                                            placeholder="Descrição do material..."
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <input
                                                            required
                                                            type="number"
                                                            value={item.quantity}
                                                            onChange={e => handleUpdateItem(idx, 'quantity', parseFloat(e.target.value))}
                                                            className="w-16 bg-transparent border-none p-0 text-right font-bold text-blue-600 focus:ring-0"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            required
                                                            type="text"
                                                            value={item.unit}
                                                            onChange={e => handleUpdateItem(idx, 'unit', e.target.value)}
                                                            className="w-12 bg-transparent border-none p-0 text-gray-500 focus:ring-0"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveItem(idx)}
                                                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {formData.items.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400 italic">
                                                        Nenhum item manual adicionado.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Suppliers Section */}
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Building2 className="w-4 h-4 text-blue-500" />
                                    Fornecedores Convidados
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {suppliers.map(sup => (
                                        <button
                                            key={sup.id}
                                            type="button"
                                            onClick={() => handleToggleSupplier(sup.id)}
                                            className={`p-4 rounded-xl border text-left transition-all ${formData.invitedSupplierIds.includes(sup.id)
                                                ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-500/10'
                                                : 'bg-white border-gray-100 hover:bg-gray-50 shadow-sm'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-black text-gray-900 truncate">{sup.name}</span>
                                                {formData.invitedSupplierIds.includes(sup.id) && (
                                                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                                                )}
                                            </div>
                                            <p className="text-[10px] font-bold text-gray-400 truncate">{sup.email || 'Sem e-mail'}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Summary Sidebar */}
                        <div className="space-y-6">
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 sticky top-6">
                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Package className="w-4 h-4 text-blue-500" />
                                    Resumo da Solicitação
                                </h3>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500">Itens Selecionados</span>
                                        <span className="font-bold text-gray-900">{selectedItems.size + formData.items.length}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm text-green-600 font-bold">
                                        <span>Valor Estimado</span>
                                        <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalQuotationValue)}</span>
                                    </div>
                                    
                                    <div className="h-px bg-gray-100" />

                                    {quotationItems.length > 0 && (
                                        <div className="space-y-3">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Itens do Orçamento</p>
                                            <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                                {quotationItems.map(item => (
                                                    <div key={item.code} className="bg-gray-50 p-3 rounded-xl border border-gray-100/50">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-tight truncate flex-1">{item.description}</span>
                                                            <span className="text-[10px] font-black text-gray-900 ml-2">{item.quantity} {item.unit}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-[9px] text-gray-400 font-medium">
                                                            <span>{item.code} • {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unitPrice)}</span>
                                                            <span className="text-gray-900">Subtotal: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total)}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="h-px bg-gray-100" />

                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500">Fornecedores Selecionados</span>
                                        <span className="font-bold text-blue-600">
                                            {formData.invitedSupplierIds.length}
                                        </span>
                                    </div>

                                    <div className="h-px bg-gray-100" />

                                    <div className="text-xs text-gray-400">
                                        Certifique-se de preencher o título, selecionar a obra e convidar ao menos um fornecedor para disparar a cotação.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {isMaterialModalOpen && selectedCompositionItem && (
                <MaterialSelectionModal
                    isOpen={isMaterialModalOpen}
                    onClose={() => {
                        setIsMaterialModalOpen(false);
                        setSelectedCompositionItem(null);
                    }}
                    onSelect={handleCompositionSelection}
                    item={selectedCompositionItem.sinapiItem!}
                    budgetQuantity={selectedCompositionItem.quantity}
                    customPrices={customPrices}
                />
            )}
        </div>
    );
};

export default SupplyChainQuotationForm;
