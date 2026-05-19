import React from 'react';
import { ArrowLeft, Save, Building2, Package, Search, Calendar, FileText, CheckCircle2, Filter, HandCoins, Layers, AlertCircle, X, Plus, Trash2, Pencil, Settings } from 'lucide-react';
import HierarchicalSelect from './HierarchicalSelect';
import { projectService, ProjectData } from '../services/projectService';
import { supplierService } from '../services/supplierService';
import { orderService } from '../services/orderService';
import { sinapiService } from '../services/sinapiService';
import { organizationService } from '../services/organizationService';
import { financialRegistryService } from '../services/financialRegistryService';
import MaterialSelectionModal from './MaterialSelectionModal';
import DatabasePickerModal from './DatabasePickerModal';
import { Supplier, BudgetEntry, SinapiType, SinapiItem, PaymentAccount, CostCenter, ChartOfAccount } from '../types';
import { formatCurrency } from '../utils/financialMath';

interface AvulsoItem { code: string; description: string; unit: string; quantity: number; unitPrice: number; }

interface SupplyChainOrderFormProps {
    onBack: () => void;
    onSave: () => void;
    editingOrderId?: string | null;
}

const SupplyChainOrderForm: React.FC<SupplyChainOrderFormProps> = ({ onBack, onSave, editingOrderId }) => {
    const isEditing = !!editingOrderId;
    const [loading, setLoading] = React.useState(true);
    const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
    const [projects, setProjects] = React.useState<any[]>([]);
    const [accounts, setAccounts] = React.useState<PaymentAccount[]>([]);
    const [costCenters, setCostCenters] = React.useState<CostCenter[]>([]);
    const [coa, setCoa] = React.useState<ChartOfAccount[]>([]);

    const [selectedSupplierId, setSelectedSupplierId] = React.useState('');
    const [selectedProjectId, setSelectedProjectId] = React.useState('');
    const [deliveryDate, setDeliveryDate] = React.useState('');
    const [paymentMethod, setPaymentMethod] = React.useState('Boleto');
    const [paymentTermType, setPaymentTermType] = React.useState<'Vista' | 'Parcelado'>('Vista');
    const [paymentDays, setPaymentDays] = React.useState(30);
    const [paymentInstallments, setPaymentInstallments] = React.useState(1);
    const [notes, setNotes] = React.useState('');
    const [bankAccount, setBankAccount] = React.useState('');
    const [costCenter, setCostCenter] = React.useState('');
    const [chartOfAccounts, setChartOfAccounts] = React.useState('');
    const [deliveryMethod, setDeliveryMethod] = React.useState('CIF - Entrega por conta do fornecedor');
    const [deliveryLocation, setDeliveryLocation] = React.useState('Canteiro de Obras');

    const [projectData, setProjectData] = React.useState<ProjectData | null>(null);
    const [selectedItems, setSelectedItems] = React.useState<Set<string>>(new Set());
    const [customQuantities, setCustomQuantities] = React.useState<Map<string, number>>(new Map());
    const [customPrices, setCustomPrices] = React.useState<Map<string, number>>(new Map());
    const [selectedMaterialsData, setSelectedMaterialsData] = React.useState<Map<string, any>>(new Map());

    // Composition Selection State
    const [selectedCompositionItem, setSelectedCompositionItem] = React.useState<BudgetEntry | null>(null);
    const [isMaterialModalOpen, setIsMaterialModalOpen] = React.useState(false);
    const [formError, setFormError] = React.useState<string | null>(null);

    // Avulso Items State
    const [avulsoItems, setAvulsoItems] = React.useState<AvulsoItem[]>([]);
    const [avulsoModalConfig, setAvulsoModalConfig] = React.useState<{ open: boolean; editingIndex: number | null; initial: AvulsoItem | null }>({ open: false, editingIndex: null, initial: null });

    // Load initial data
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [suppliersList, projectsList, orgs] = await Promise.all([
                    supplierService.listSuppliers(),
                    projectService.listProjects(),
                    organizationService.listOrganizations()
                ]);
                if (cancelled) return;
                setSuppliers(suppliersList);
                const orcamentos = projectsList.filter((p: any) => p.settings?.classification === 'ORCAMENTO' || p.settings?.classification === 'COST_ESTIMATION');
                setProjects(orcamentos);

                if (orgs && orgs.length > 0) {
                    const orgId = orgs[0].id;
                    const [accs, centers, accounts_coa] = await Promise.all([
                        financialRegistryService.listPaymentAccounts(orgId),
                        financialRegistryService.listCostCenters(orgId),
                        financialRegistryService.listChartOfAccounts(orgId)
                    ]);
                    if (cancelled) return;
                    setAccounts(accs);
                    setCostCenters(centers);
                    setCoa(accounts_coa);
                }
            } catch (error) {
                console.error("Error loading form data:", error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Load existing order data when editing
    React.useEffect(() => {
        if (!editingOrderId) return;
        let cancelled = false;
        (async () => {
            try {
                const allOrders = await orderService.listOrders();
                if (cancelled) return;
                const existingOrder = allOrders.find(o => o.id === editingOrderId);
                if (existingOrder) {
                    setSelectedSupplierId(existingOrder.supplierId || '');
                    setSelectedProjectId(existingOrder.projectId || '');
                    setDeliveryDate(existingOrder.deliveryDate || '');
                    setPaymentMethod(existingOrder.paymentMethod || 'Boleto');
                    setPaymentTermType(existingOrder.paymentTermType || 'Vista');
                    setPaymentDays(existingOrder.paymentDays || 30);
                    setPaymentInstallments(existingOrder.paymentInstallments || 1);
                    setNotes(existingOrder.notes || '');
                    setBankAccount(existingOrder.bankAccount || '');
                    setCostCenter(existingOrder.costCenter || '');
                    setChartOfAccounts(existingOrder.chartOfAccounts || '');
                    // Separate avulso items from budget items
                    const budgetOrderItems = existingOrder.items.filter((i: any) => !i.avulso);
                    const avulsoOrderItems = existingOrder.items.filter((i: any) => i.avulso);
                    setAvulsoItems(avulsoOrderItems.map((i: any) => ({
                        code: i.code, description: i.description, unit: i.unit,
                        quantity: i.quantity, unitPrice: i.unitPrice
                    })));
                    // Pre-select budget items from the order
                    const itemCodes = new Set(budgetOrderItems.map((i: any) => i.code));
                    setSelectedItems(itemCodes);
                    // Pre-fill quantities and prices from the order
                    const quantities = new Map<string, number>();
                    const prices = new Map<string, number>();
                    existingOrder.items.forEach((i: any) => {
                        if (i.quantity !== undefined) quantities.set(i.code, i.quantity);
                        if (i.unitPrice !== undefined) prices.set(i.code, i.unitPrice);
                    });
                    setCustomQuantities(prev => new Map([...prev, ...quantities]));
                    setCustomPrices(prev => {
                        const next = new Map(prev);
                        prices.forEach((v, k) => {
                            if (v > 0 || !next.has(k)) {
                                next.set(k, v);
                            }
                        });
                        return next;
                    });
                    setDeliveryMethod(existingOrder.deliveryMethod || 'CIF - Entrega por conta do fornecedor');
                    setDeliveryLocation(existingOrder.deliveryLocation || 'Canteiro de Obras');
                    setEditingVersion(existingOrder.version);
                }
            } catch (error) {
                console.error('Error loading order for editing:', error);
            }
        })();
        return () => { cancelled = true; };
    }, [editingOrderId]);

    const [editingVersion, setEditingVersion] = React.useState<number | undefined>(undefined);
    const [purchasedQuantities, setPurchasedQuantities] = React.useState<Map<string, number>>(new Map());

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

    // Load project details and existing orders when selected
    React.useEffect(() => {
        if (!selectedProjectId) {
            setProjectData(null);
            setPurchasedQuantities(new Map());
            return;
        }

        let cancelled = false;

        // Load Project Data
        (async () => {
            try {
                const data = await projectService.loadProject(selectedProjectId);
                if (cancelled) return;
                let finalProjectData = data;

                // Handle linked project for budget
                if ((!data.budget || data.budget.length === 0) && data.settings?.linkedProjectId) {
                    try {
                        const linkedData = await projectService.loadProject(data.settings.linkedProjectId);
                        if (linkedData?.budget?.length > 0) {
                            finalProjectData = { ...data, budget: linkedData.budget };
                        }
                    } catch (err) {
                        console.error("Error loading linked project:", err);
                    }
                }

                if (cancelled) return;
                setProjectData(finalProjectData);

                // Fetch updated prices
                if (finalProjectData?.budget) {
                    fetchBudgetPrices(finalProjectData.budget, finalProjectData.settings);
                }

                // Auto-fill delivery location
                if (!editingOrderId && finalProjectData.settings) {
                    const { street, number, neighborhood, city, state } = finalProjectData.settings;
                    const addressParts = [];
                    if (street) addressParts.push(street);
                    if (number) addressParts.push(number);
                    if (neighborhood) addressParts.push(neighborhood);

                    let formattedAddress = addressParts.join(', ');
                    if (city || state) {
                        formattedAddress += ` - ${city || ''}${city && state ? '/' : ''}${state || ''}`;
                    }

                    if (formattedAddress.trim()) {
                        setDeliveryLocation(formattedAddress);
                    }
                }
            } catch (err) {
                console.error("Error loading project data:", err);
            }
        })();

        // Load Existing Orders
        (async () => {
            try {
                const orders = await orderService.listOrders(selectedProjectId);
                if (cancelled) return;
                const quantities = new Map<string, number>();
                orders.forEach(order => {
                    if (order.status !== 'Cancelado') {
                        order.items.forEach(item => {
                            const current = quantities.get(item.code) || 0;
                            quantities.set(item.code, current + item.quantity);
                        });
                    }
                });
                setPurchasedQuantities(quantities);
            } catch (err) {
                console.error("Error loading orders:", err);
            }
        })();

        return () => { cancelled = true; };
    }, [selectedProjectId, editingOrderId, fetchBudgetPrices]);

    const orderItems = React.useMemo(() => {
        // 1. Get items from budget
        const budgetItems = projectData?.budget.filter(item =>
            item.sinapiItem && selectedItems.has(item.sinapiItem.code)
        ).map(item => {
            const code = item.sinapiItem!.code;
            const qty = Number(customQuantities.get(code) ?? item.quantity);
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
            .filter((insumo: any) => selectedItems.has(insumo.code) && !budgetItems.some((bi: any) => bi.code === insumo.code))
            .map((insumo: any) => {
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

        // 3. Get avulso items
        const avulsoOrderItems = avulsoItems.map(item => ({
            code: item.code,
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
            avulso: true as const,
        }));

        return [...budgetItems, ...compositionItems, ...avulsoOrderItems];
    }, [projectData, selectedItems, customQuantities, selectedMaterialsData, customPrices, avulsoItems]);

    const totalOrderValue = React.useMemo(() => {
        return orderItems.reduce((sum, item) => sum + item.total, 0);
    }, [orderItems]);

    const toggleItem = (code: string, remainingQty?: number, budgetItemId?: string) => {
        const newSelected = new Set(selectedItems);
        const newQuantities = new Map(customQuantities);
        if (newSelected.has(code)) {
            newSelected.delete(code);
            newQuantities.delete(code);
        } else {
            const budgetItem = projectData?.budget.find(b => b.id === budgetItemId);
            if (budgetItem?.sinapiItem?.type === SinapiType.COMPOSITION) {
                setSelectedCompositionItem(budgetItem);
                setIsMaterialModalOpen(true);
                return;
            }

            newSelected.add(code);
            if (!newQuantities.has(code)) {
                newQuantities.set(code, Math.max(remainingQty ?? 1, 0));
            }

            if (budgetItemId && projectData?.settings?.schedule?.itemSchedules) {
                const scheduleItem = projectData.settings.schedule.itemSchedules.find(
                    (s: any) => s.id === budgetItemId
                );
                if (scheduleItem?.startDate && !deliveryDate) {
                    setDeliveryDate(scheduleItem.startDate);
                }
            }
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

    const handleSaveOrder = async () => {
        setFormError(null);
        if (!selectedSupplierId || !selectedProjectId || (selectedItems.size === 0 && avulsoItems.length === 0)) {
            setFormError("Por favor, selecione um fornecedor, uma obra e pelo menos um material.");
            return;
        }

        if (!deliveryDate) {
            setFormError("Por favor, selecione uma data de entrega.");
            return;
        }

        setLoading(true);
        try {
            if (orderItems.length === 0) {
                setFormError("Nenhum item válido para salvar.");
                setLoading(false);
                return;
            }

            if (isEditing && editingOrderId) {
                await orderService.updateOrder(editingOrderId, {
                    projectId: selectedProjectId,
                    supplierId: selectedSupplierId,
                    deliveryDate: deliveryDate,
                    paymentMethod: paymentMethod,
                    paymentTermType: paymentTermType,
                    paymentDays: paymentDays,
                    paymentInstallments: paymentInstallments,
                    notes: notes,
                    bankAccount: bankAccount,
                    costCenter: costCenter,
                    chartOfAccounts: chartOfAccounts,
                    deliveryMethod: deliveryMethod,
                    deliveryLocation: deliveryLocation,
                    items: orderItems,
                }, editingVersion);
            } else {
                await orderService.createOrder({
                    projectId: selectedProjectId,
                    supplierId: selectedSupplierId,
                    deliveryDate: deliveryDate,
                    paymentMethod: paymentMethod,
                    paymentTermType: paymentTermType,
                    paymentDays: paymentDays,
                    paymentInstallments: paymentInstallments,
                    status: 'Rascunho',
                    notes: notes,
                    bankAccount: bankAccount,
                    costCenter: costCenter,
                    chartOfAccounts: chartOfAccounts,
                    deliveryMethod: deliveryMethod,
                    deliveryLocation: deliveryLocation,
                    items: orderItems,
                    projectName: projectData?.name
                });
            }
            onSave();
        } catch (error: any) {
            console.error("Erro ao salvar pedido:", error);
            if (error?.message?.startsWith('CONFLICT')) {
                setFormError("Pedido foi modificado por outro usuário. Feche o formulário, recarregue e tente novamente.");
            } else {
                const errorMessage = error.message || error.details || "Erro desconhecido";
                setFormError(`Erro ao salvar o pedido: ${errorMessage}`);
            }
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="absolute inset-0 z-[110] flex items-center justify-center p-2 md:p-8 lg:p-12 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
            <div className="relative bg-white rounded-2xl md:rounded-[3rem] shadow-2xl w-full h-full flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden border border-white/20">

                <div className="px-4 py-5 md:px-8 md:py-7 lg:px-12 lg:py-10 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={onBack}
                            className="p-4 bg-white text-gray-400 hover:text-blue-600 border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all group"
                        >
                            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        </button>
                        <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl shadow-sm shadow-blue-100/50 hidden md:block">
                            <Package className="w-8 h-8" />
                        </div>
                        <div>
                            <h1 className="text-xl md:text-3xl font-black text-gray-900 tracking-tight">
                                {isEditing ? 'Editar Pedido de Compra' : 'Novo Pedido de Compra'}
                            </h1>
                            <p className="text-gray-400 text-[11px] font-black uppercase tracking-[0.3em] mt-1.5 flex items-center gap-2">
                                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                                {isEditing ? 'Gestão de Suprimentos • Edição Executiva' : 'Gestão de Suprimentos • Criação de Pedido'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleSaveOrder}
                        disabled={!selectedSupplierId || !selectedProjectId || (selectedItems.size === 0 && avulsoItems.length === 0)}
                        className="flex items-center gap-2 bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-900/20 active:scale-95 transition-all"
                    >
                        <Save className="w-4 h-4" />
                        <span>Salvar Pedido</span>
                    </button>
                </div>

                {formError && (
                    <div className="px-4 md:px-12 py-3 bg-red-50 border-b border-red-100 flex items-center gap-3 text-red-600 shrink-0 animate-in slide-in-from-top-2 duration-200">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <p className="text-xs font-medium flex-1">{formError}</p>
                        <button onClick={() => setFormError(null)} className="text-red-400 hover:text-red-600 transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 custom-scrollbar">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-blue-500" />
                                    Dados Gerais
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor</label>
                                        <select
                                            value={selectedSupplierId}
                                            onChange={(e) => setSelectedSupplierId(e.target.value)}
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                        >
                                            <option value="">Selecione um fornecedor...</option>
                                            {suppliers.map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Obra / Orçamento</label>
                                        <select
                                            value={selectedProjectId}
                                            onChange={(e) => setSelectedProjectId(e.target.value)}
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                        >
                                            <option value="">Selecione a obra...</option>
                                            {projects.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Data de Entrega</label>
                                        <input
                                            type="date"
                                            value={deliveryDate}
                                            onChange={(e) => setDeliveryDate(e.target.value)}
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Entrega</label>
                                        <select
                                            value={deliveryMethod}
                                            onChange={(e) => setDeliveryMethod(e.target.value)}
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                        >
                                            <option value="CIF - Entrega por conta do fornecedor">CIF - Entrega por conta do fornecedor</option>
                                            <option value="FOB - Retirada por conta do comprador">FOB - Retirada por conta do comprador</option>
                                            <option value="Entrega Própria Fornecedor">Entrega Própria Fornecedor</option>
                                            <option value="Transportadora Terceirizada">Transportadora Terceirizada</option>
                                            <option value="Retirada em Mãos">Retirada em Mãos</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Local de Entrega</label>
                                        <input
                                            type="text"
                                            value={deliveryLocation}
                                            onChange={(e) => setDeliveryLocation(e.target.value)}
                                            placeholder="Ex: Almoxarifado / Canteiro Obra 1"
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Pagamento</label>
                                        <select
                                            value={paymentMethod}
                                            onChange={(e) => setPaymentMethod(e.target.value)}
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
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
                                                    onClick={() => setPaymentTermType('Vista')}
                                                    className={`flex-1 py-1.5 px-3 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${paymentTermType === 'Vista' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                                >
                                                    À Vista
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setPaymentTermType('Parcelado')}
                                                    className={`flex-1 py-1.5 px-3 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${paymentTermType === 'Parcelado' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                                >
                                                    Parcelado
                                                </button>
                                            </div>
                                        </div>

                                        {paymentTermType === 'Vista' ? (
                                            <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Prazo de Pagamento (Dias)</label>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={paymentDays}
                                                        onChange={(e) => setPaymentDays(parseInt(e.target.value) || 0)}
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
                                                        value={paymentInstallments}
                                                        onChange={(e) => setPaymentInstallments(parseInt(e.target.value) || 1)}
                                                        className="w-full rounded-lg border border-gray-300 p-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none pr-12 bg-white"
                                                    />
                                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 uppercase">X</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Notas / Observações</label>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        rows={3}
                                        placeholder="Ex: Entregar no portão lateral..."
                                        className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                    />
                                </div>

                                <div className="mt-8 space-y-6 pt-6 border-t border-gray-100">
                                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em] flex items-center gap-3">
                                        <Filter className="w-4 h-4 text-indigo-600" />
                                        Alocação do Gasto
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] px-1">Conta de Pagamento</label>
                                            <div className="relative group">
                                                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none" />
                                                <select
                                                    value={bankAccount}
                                                    onChange={(e) => setBankAccount(e.target.value)}
                                                    className="w-full bg-gray-50/50 border border-gray-100 rounded-2xl pl-12 pr-4 py-4 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all appearance-none"
                                                >
                                                    <option value="">Selecione uma conta...</option>
                                                    {accounts.map(acc => (
                                                        <option key={acc.id} value={acc.name}>{acc.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] px-1">Centro de Custo</label>
                                            <HierarchicalSelect
                                                items={costCenters}
                                                value={costCenter}
                                                onChange={setCostCenter}
                                                valueField="name"
                                                placeholder="Selecione o centro de custo..."
                                                hoverCls="hover:bg-indigo-50"
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] px-1">Plano de Contas</label>
                                            <HierarchicalSelect
                                                items={coa}
                                                value={chartOfAccounts}
                                                onChange={setChartOfAccounts}
                                                valueField="code"
                                                placeholder="Selecione o plano de contas..."
                                                hoverCls="hover:bg-indigo-50"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {selectedProjectId && (
                                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                            <Package className="w-4 h-4 text-orange-500" />
                                            Itens Avulsos
                                            {avulsoItems.length > 0 && (
                                                <span className="ml-1 bg-orange-100 text-orange-700 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                                                    {avulsoItems.length}
                                                </span>
                                            )}
                                        </h3>
                                        <button
                                            type="button"
                                            onClick={() => setAvulsoModalConfig({ open: true, editingIndex: null, initial: null })}
                                            className="flex items-center gap-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            Item Avulso
                                        </button>
                                    </div>

                                    {avulsoItems.length === 0 ? (
                                        <div className="text-center py-8 text-gray-400 text-xs">
                                            Nenhum item avulso adicionado. Use o botão acima para adicionar itens que não estão no orçamento.
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left text-sm">
                                                <thead className="bg-orange-50 text-orange-600 font-bold uppercase text-xs">
                                                    <tr>
                                                        <th className="px-4 py-3 rounded-l-lg">Código</th>
                                                        <th className="px-4 py-3">Descrição</th>
                                                        <th className="px-4 py-3 text-right">Unid.</th>
                                                        <th className="px-4 py-3 text-right">Qtd.</th>
                                                        <th className="px-4 py-3 text-right">Valor Unit.</th>
                                                        <th className="px-4 py-3 text-right">Total</th>
                                                        <th className="px-4 py-3 rounded-r-lg w-20"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {avulsoItems.map((item, idx) => (
                                                        <tr key={idx} className="hover:bg-orange-50/30 transition-colors">
                                                            <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.code || '—'}</td>
                                                            <td className="px-4 py-3 font-medium text-gray-900">{item.description}</td>
                                                            <td className="px-4 py-3 text-right text-gray-500">{item.unit}</td>
                                                            <td className="px-4 py-3 text-right font-medium">{item.quantity}</td>
                                                            <td className="px-4 py-3 text-right font-medium">
                                                                {formatCurrency(item.unitPrice)}
                                                            </td>
                                                            <td className="px-4 py-3 text-right font-bold text-orange-700">
                                                                {formatCurrency(item.quantity * item.unitPrice)}
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                <div className="flex items-center justify-end gap-1">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setAvulsoModalConfig({ open: true, editingIndex: idx, initial: item })}
                                                                        className="p-1.5 text-gray-300 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all"
                                                                    >
                                                                        <Pencil className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setAvulsoItems(prev => prev.filter((_, i) => i !== idx))}
                                                                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                                    >
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </button>
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

                            {projectData && (
                                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <Package className="w-4 h-4 text-blue-500" />
                                        Seleção de Materiais da Obra
                                    </h3>

                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-xs">
                                                <tr>
                                                    <th className="px-4 py-3 rounded-l-lg w-10">
                                                        <input type="checkbox" className="rounded border-gray-300" />
                                                    </th>
                                                    <th className="px-4 py-3">Código</th>
                                                    <th className="px-4 py-3">Descrição</th>
                                                    <th className="px-4 py-3 text-right">Qtd. Orçada</th>
                                                    <th className="px-4 py-3 text-right text-blue-600">Qtd. Comprada</th>
                                                    <th className="px-4 py-3 text-right text-green-600">Qtd. à Comprar</th>
                                                    <th className="px-4 py-3 text-right">Unid.</th>
                                                    <th className="px-4 py-3 text-right">Valor Unit.</th>
                                                    <th className="px-4 py-3 text-right text-indigo-600 rounded-r-lg">Qtd. Pedido</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {projectData.budget
                                                    .filter((item: BudgetEntry) => item.sinapiItem && (item.sinapiItem.type === SinapiType.INPUT || item.sinapiItem.type === SinapiType.COMPOSITION))
                                                    .map((item: BudgetEntry) => {
                                                        const purchased = purchasedQuantities.get(item.sinapiItem!.code) || 0;
                                                        const remaining = item.quantity - purchased;
                                                        const code = item.sinapiItem!.code;

                                                        return (
                                                            <tr
                                                                key={item.id}
                                                                className={`hover:bg-blue-50/50 transition-colors cursor-pointer ${selectedItems.has(code) ? 'bg-blue-50' : ''}`}
                                                                onClick={() => toggleItem(code, remaining, item.id)}
                                                            >
                                                                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedItems.has(code)}
                                                                        onChange={() => toggleItem(code, remaining, item.id)}
                                                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                                    />
                                                                </td>
                                                                <td className="px-4 py-3 font-mono text-xs text-gray-500">
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
                                                                <td className="px-4 py-3 text-right font-medium">{item.quantity}</td>
                                                                <td className="px-4 py-3 text-right font-medium text-blue-600">{purchased}</td>
                                                                <td className="px-4 py-3 text-right font-bold text-green-600">{remaining}</td>
                                                                <td className="px-4 py-3 text-right text-gray-500">{item.sinapiItem!.unit}</td>
                                                                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                                                    {selectedItems.has(code) ? (
                                                                        <div className="flex flex-col items-end gap-1">
                                                                            <input
                                                                                type="number"
                                                                                min={0}
                                                                                step="any"
                                                                                value={customPrices.get(code) ?? item.sinapiItem!.price ?? 0}
                                                                                onChange={(e) => updateItemPrice(code, parseFloat(e.target.value) || 0)}
                                                                                className="w-28 text-right rounded-lg border border-emerald-300 p-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                                                                            />
                                                                            <span className="text-[9px] text-gray-400">Preço Unit.</span>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-gray-900 font-medium">
                                                                            {formatCurrency(item.sinapiItem!.price || 0)}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                                                    {selectedItems.has(code) ? (
                                                                        <input
                                                                            type="number"
                                                                            min={0}
                                                                            step="any"
                                                                            value={customQuantities.get(code) ?? 0}
                                                                            onChange={(e) => updateItemQuantity(code, parseFloat(e.target.value) || 0)}
                                                                            className="w-24 text-right rounded-lg border border-indigo-300 p-1.5 text-sm font-bold text-indigo-700 bg-indigo-50 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                                                        />
                                                                    ) : (
                                                                        <span className="text-gray-300">—</span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-6">
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 sticky top-6">
                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                    Resumo do Pedido
                                </h3>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500">Itens Selecionados</span>
                                        <span className="font-bold text-gray-900">{selectedItems.size}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500">Valor Total</span>
                                        <span className="font-bold text-green-600">
                                            {formatCurrency(totalOrderValue)}
                                        </span>
                                    </div>
                                    <div className="h-px bg-gray-100" />

                                    {orderItems.length > 0 && (
                                        <div className="space-y-3">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Itens Detalhados</p>
                                            <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                                {orderItems.map(item => (
                                                    <div key={item.code} className="bg-gray-50 p-3 rounded-xl border border-gray-100/50">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-tight truncate flex-1">{item.description}</span>
                                                            <span className="text-[10px] font-black text-gray-900 ml-2">{item.quantity} {item.unit}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-[9px] text-gray-400 font-medium">
                                                            <span>{item.code} • {formatCurrency(item.unitPrice)}</span>
                                                            <span className="text-gray-900">Subtotal: {formatCurrency(item.total)}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {avulsoModalConfig.open && (
                    <AvulsoItemModal
                        projectData={projectData}
                        initial={avulsoModalConfig.initial}
                        onConfirm={(item) => {
                            const { editingIndex } = avulsoModalConfig;
                            if (editingIndex !== null) {
                                setAvulsoItems(prev => prev.map((a, i) => i === editingIndex ? item : a));
                            } else {
                                setAvulsoItems(prev => [...prev, item]);
                            }
                            setAvulsoModalConfig({ open: false, editingIndex: null, initial: null });
                        }}
                        onClose={() => setAvulsoModalConfig({ open: false, editingIndex: null, initial: null })}
                    />
                )}

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
        </div>
    );
};

interface AvulsoItemModalProps {
    projectData: any;
    initial: AvulsoItem | null;
    onConfirm: (item: AvulsoItem) => void;
    onClose: () => void;
}

const EMPTY_FORM: AvulsoItem = { code: '', description: '', unit: '', quantity: 1, unitPrice: 0 };

// ─── Unit management ─────────────────────────────────────────────────────────
const DEFAULT_UNITS = ['kg', 'm', 'm²', 'm³', 'l', 'pç', 'un', 'bd', 'br'];
const UNITS_KEY = 'orcacloud_units';
const loadUnits = (): string[] => { try { const s = localStorage.getItem(UNITS_KEY); return s ? JSON.parse(s) : [...DEFAULT_UNITS]; } catch { return [...DEFAULT_UNITS]; } };
const persistUnits = (u: string[]) => localStorage.setItem(UNITS_KEY, JSON.stringify(u));

interface UnitManagerModalProps { units: string[]; onClose: (updated: string[]) => void; }

const UnitManagerModal: React.FC<UnitManagerModalProps> = ({ units: init, onClose }) => {
    const [units, setUnits] = React.useState<string[]>(init);
    const [newUnit, setNewUnit] = React.useState('');
    const [editingIdx, setEditingIdx] = React.useState<number | null>(null);
    const [editVal, setEditVal] = React.useState('');
    const [error, setError] = React.useState('');

    const handleAdd = () => {
        const t = newUnit.trim();
        if (!t) { setError('Digite uma unidade.'); return; }
        if (units.map(u => u.toLowerCase()).includes(t.toLowerCase())) { setError('Unidade já existe.'); return; }
        setUnits(prev => [...prev, t]);
        setNewUnit('');
        setError('');
    };

    const handleEditSave = () => {
        const t = editVal.trim();
        if (!t || editingIdx === null) return;
        setUnits(prev => prev.map((u, i) => i === editingIdx ? t : u));
        setEditingIdx(null);
    };

    const handleClose = () => { persistUnits(units); onClose(units); };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleClose}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-black text-gray-900">Gerenciar Unidades</h2>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Unidades de medida</p>
                    </div>
                    <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newUnit}
                            onChange={e => { setNewUnit(e.target.value); setError(''); }}
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                            placeholder="Nova unidade..."
                            className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none"
                        />
                        <button onClick={handleAdd} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap">
                            <Plus className="w-3.5 h-3.5" /> Adicionar
                        </button>
                    </div>
                    {error && <p className="text-xs text-red-500 -mt-2">{error}</p>}

                    <div className="space-y-1.5 max-h-60 overflow-y-auto custom-scrollbar">
                        {units.map((unit, i) => (
                            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                                {editingIdx === i ? (
                                    <input
                                        autoFocus
                                        type="text"
                                        value={editVal}
                                        onChange={e => setEditVal(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleEditSave()}
                                        className="flex-1 text-sm font-bold border border-blue-300 rounded-lg px-2 py-0.5 outline-none focus:ring-2 focus:ring-blue-400"
                                    />
                                ) : (
                                    <span className="flex-1 text-sm font-bold text-gray-800">{unit}</span>
                                )}
                                {editingIdx === i ? (
                                    <button onClick={handleEditSave} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-all">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                    </button>
                                ) : (
                                    <button onClick={() => { setEditingIdx(i); setEditVal(unit); }} className="p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all">
                                        <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                <button onClick={() => setUnits(prev => prev.filter((_, j) => j !== i))} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="px-6 pb-6 flex justify-end">
                    <button onClick={handleClose} className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-black transition-all">
                        Concluído
                    </button>
                </div>
            </div>
        </div>
    );
};
// ─────────────────────────────────────────────────────────────────────────────

const toCurrencyDigits = (value: number) => String(Math.round(value * 100));
const fromCurrencyDigits = (digits: string) => parseInt(digits || '0', 10) / 100;
const displayCurrencyDigits = (digits: string) => {
    const num = parseInt(digits || '0', 10);
    return (num / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const AvulsoItemModal: React.FC<AvulsoItemModalProps> = ({ projectData, initial, onConfirm, onClose }) => {
    const isEditing = initial !== null;
    const [form, setForm] = React.useState<AvulsoItem>(initial ?? EMPTY_FORM);
    const [priceDigits, setPriceDigits] = React.useState(() =>
        initial ? toCurrencyDigits(initial.unitPrice) : '0'
    );
    const [units, setUnits] = React.useState<string[]>(loadUnits);
    const [showUnitManager, setShowUnitManager] = React.useState(false);
    const [pickerOpen, setPickerOpen] = React.useState(false);
    const [formError, setFormError] = React.useState<string | null>(null);

    const handlePickerSelect = (item: SinapiItem) => {
        const price = item.price || 0;
        setForm({ code: item.code, description: item.description, unit: item.unit, quantity: 1, unitPrice: price });
        setPriceDigits(toCurrencyDigits(price));
        setPickerOpen(false);
    };

    const handleConfirm = () => {
        if (!form.description.trim()) { setFormError('Descrição obrigatória.'); return; }
        if (!form.unit.trim()) { setFormError('Unidade obrigatória.'); return; }
        if (form.quantity <= 0) { setFormError('Quantidade deve ser maior que zero.'); return; }
        setFormError(null);
        onConfirm({ ...form });
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="px-8 py-6 bg-orange-50 border-b border-orange-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-black text-gray-900">{isEditing ? 'Editar Item Avulso' : 'Adicionar Item Avulso'}</h2>
                        <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mt-0.5">Item não orçado</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-orange-100 rounded-xl transition-all text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-8 space-y-5">
                    {/* Picker button */}
                    <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        className="w-full flex items-center justify-center gap-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 rounded-xl py-3 text-sm font-black uppercase tracking-wider transition-all"
                    >
                        <Search className="w-4 h-4" />
                        Buscar na base de dados
                    </button>
                    <p className="text-[10px] text-gray-400 -mt-3">Ou preencha os campos abaixo manualmente.</p>

                    <div className="h-px bg-gray-100" />

                    {/* Manual fields */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Código <span className="text-gray-300 font-normal normal-case tracking-normal">(opcional)</span></label>
                            <input
                                type="text"
                                value={form.code}
                                onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))}
                                placeholder="Ex: 00001"
                                className="w-full rounded-xl border border-gray-200 p-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Unidade *</label>
                            <div className="flex gap-2">
                                <select
                                    value={units.includes(form.unit) ? form.unit : form.unit ? '__custom__' : ''}
                                    onChange={e => {
                                        if (e.target.value !== '__custom__') setForm(f => ({ ...f, unit: e.target.value }));
                                    }}
                                    className="flex-1 rounded-xl border border-gray-200 p-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none bg-white"
                                >
                                    <option value="">Selecione...</option>
                                    {units.map(u => <option key={u} value={u}>{u}</option>)}
                                    {form.unit && !units.includes(form.unit) && (
                                        <option value="__custom__">{form.unit}</option>
                                    )}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => setShowUnitManager(true)}
                                    title="Gerenciar unidades"
                                    className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-all shrink-0"
                                >
                                    <Settings className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Descrição *</label>
                            <input
                                type="text"
                                value={form.description}
                                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                                placeholder="Descrição do material ou serviço"
                                className="w-full rounded-xl border border-gray-200 p-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Quantidade *</label>
                            <input
                                type="number"
                                min={0.001}
                                step="any"
                                value={form.quantity}
                                onChange={(e) => setForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                                className="w-full rounded-xl border border-gray-200 p-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Preço Unitário (R$)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400 pointer-events-none select-none">R$</span>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={displayCurrencyDigits(priceDigits)}
                                    onChange={(e) => {
                                        const digits = e.target.value.replace(/\D/g, '');
                                        const trimmed = digits.replace(/^0+/, '') || '0';
                                        setPriceDigits(trimmed);
                                        setForm(f => ({ ...f, unitPrice: fromCurrencyDigits(trimmed) }));
                                    }}
                                    className="w-full pl-9 rounded-xl border border-gray-200 p-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none text-right font-bold"
                                />
                            </div>
                        </div>
                    </div>

                    {formError && (
                        <p className="text-xs text-red-600 flex items-center gap-1.5 bg-red-50 px-3 py-2 rounded-lg">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            {formError}
                        </p>
                    )}

                    {form.quantity > 0 && form.unitPrice > 0 && (
                        <div className="flex justify-between items-center bg-orange-50 rounded-xl px-4 py-3">
                            <span className="text-xs font-bold text-orange-700 uppercase tracking-wider">Total do Item</span>
                            <span className="text-sm font-black text-orange-700">
                                {formatCurrency(form.quantity * form.unitPrice)}
                            </span>
                        </div>
                    )}
                </div>

                <div className="px-8 pb-8 flex gap-3 justify-end">
                    <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all">
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-black transition-all shadow-lg shadow-orange-500/20"
                    >
                        {isEditing ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        {isEditing ? 'Salvar Alterações' : 'Adicionar Item'}
                    </button>
                </div>
            </div>

            {showUnitManager && (
                <UnitManagerModal
                    units={units}
                    onClose={updated => { setUnits(updated); setShowUnitManager(false); }}
                />
            )}

            <DatabasePickerModal
                isOpen={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onSelect={handlePickerSelect}
                title="Buscar Material / Serviço"
                subtitle="Selecione um item da base de dados para adicionar ao pedido."
                zIndex={210}
            />
        </div>
    );
};

export default SupplyChainOrderForm;
