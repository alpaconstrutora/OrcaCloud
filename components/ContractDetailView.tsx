import React from 'react';
import {
    ArrowLeft, FileText, Calendar, Shield, DollarSign,
    Layers, Plus, History, CheckCircle2, AlertCircle,
    MoreHorizontal, ArrowUpRight, TrendingUp, BarChart3,
    ArrowRight, Save, Trash2, Edit3, PlusCircle, Clock,
    Camera, ExternalLink, HandCoins, CreditCard, X,
    Video, Image as ImageIcon, Send, FileDown, Zap,
    Package, Pencil, Settings, Search, Lock as LockIcon
} from 'lucide-react';
import {
    Contract, ContractItem, ContractAddendum,
    ContractMeasurement, ContractMeasurementItem, BudgetEntry, ProjectSettings, ContractTemplate,
    ContractUtilityBill, SinapiItem, CustomDatabase, SinapiType
} from '../types';
import { contractService } from '../services/contractService';
import { customDatabaseService } from '../services/customDatabaseService';
import { projectService } from '../services/projectService';
import BudgetPickerModal from './BudgetPickerModal';
import ContractMeasurementModal from './ContractMeasurementModal';
import ContractAddendumModal from './ContractAddendumModal';
import UtilityBillModal from './UtilityBillModal';
import DatabasePickerModal from './DatabasePickerModal';
import { organizationService } from '../services/organizationService';
import { exportService } from '../services/exportService';
import { webhookService } from '../services/webhookService';
import { supplierService } from '../services/supplierService';
import { Organization } from '../types';

// ─── Avulso helpers ────────────────────────────────────────────────────────────
interface AvulsoItem { code: string; description: string; unit: string; quantity: number; unitPrice: number; }
const AVULSO_EMPTY: AvulsoItem = { code: '', description: '', unit: '', quantity: 1, unitPrice: 0 };
const toCurrencyDigits = (v: number) => String(Math.round(v * 100));
const fromCurrencyDigits = (d: string) => parseInt(d || '0', 10) / 100;
const displayCurrencyDigits = (d: string) => {
    const n = parseInt(d || '0', 10);
    return (n / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const DEFAULT_UNITS = ['kg', 'm', 'm²', 'm³', 'l', 'pç', 'un', 'bd', 'br', 'h', 'svç', 'vb'];
const UNITS_KEY = 'orcacloud_units';
const loadUnits = (): string[] => { try { const s = localStorage.getItem(UNITS_KEY); return s ? JSON.parse(s) : [...DEFAULT_UNITS]; } catch { return [...DEFAULT_UNITS]; } };
const persistUnits = (u: string[]) => localStorage.setItem(UNITS_KEY, JSON.stringify(u));
// ───────────────────────────────────────────────────────────────────────────────

interface ContractDetailViewProps {
    contractId: string;
    onBack: () => void;
    budget: BudgetEntry[];
}

const ContractDetailView: React.FC<ContractDetailViewProps> = ({ contractId, onBack, budget }) => {
    const [contract, setContract] = React.useState<Contract | null>(null);
    const [items, setItems] = React.useState<ContractItem[]>([]);
    const [addendums, setAddendums] = React.useState<ContractAddendum[]>([]);
    const [measurements, setMeasurements] = React.useState<ContractMeasurement[]>([]);
    const [activeBudget, setActiveBudget] = React.useState<BudgetEntry[]>(budget || []);
    const [utilityBills, setUtilityBills] = React.useState<ContractUtilityBill[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [activeTab, setActiveTab] = React.useState<'overview' | 'items' | 'addendums' | 'measurements' | 'utility_bills'>('overview');
    const [isBudgetPickerOpen, setIsBudgetPickerOpen] = React.useState(false);
    const [avulsoModalConfig, setAvulsoModalConfig] = React.useState<{ open: boolean; editingIndex: number | null; initial: AvulsoItem | null }>({ open: false, editingIndex: null, initial: null });
    const [isTemplateModalOpen, setIsTemplateModalOpen] = React.useState(false);
    const [selectedTemplate, setSelectedTemplate] = React.useState<ContractTemplate | undefined>(undefined);
    const [isMeasurementModalOpen, setIsMeasurementModalOpen] = React.useState(false);
    const [editingMeasurement, setEditingMeasurement] = React.useState<ContractMeasurement | null>(null);
    const [editingMeasurementItems, setEditingMeasurementItems] = React.useState<ContractMeasurementItem[]>([]);
    const [isAddendumModalOpen, setIsAddendumModalOpen] = React.useState(false);
    const [isUtilityBillModalOpen, setIsUtilityBillModalOpen] = React.useState(false);
    const [editingUtilityBill, setEditingUtilityBill] = React.useState<ContractUtilityBill | null>(null);
    const [organization, setOrganization] = React.useState<Organization | null>(null);
    const [projectSettings, setProjectSettings] = React.useState<ProjectSettings | null>(null);
    const [exporting, setExporting] = React.useState(false);
    const [syncingFinance, setSyncingFinance] = React.useState(false);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [pendingConfirm, setPendingConfirm] = React.useState<{ message: string; onConfirm: () => void } | null>(null);
    const [reajusteModal, setReajusteModal] = React.useState(false);
    const [reajusteBase, setReajusteBase] = React.useState('');
    const [reajusteAtual, setReajusteAtual] = React.useState('');
    const [reajusteNotes, setReajusteNotes] = React.useState('');
    const [applyingReajuste, setApplyingReajuste] = React.useState(false);

    const notify = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const askConfirm = (message: string, onConfirm: () => void) => {
        setPendingConfirm({ message, onConfirm });
    };

    React.useEffect(() => {
        let cancelled = false;
        const run = async () => {
            await loadContractData();
        };
        run();
        return () => { cancelled = true; };
    }, [contractId]);

    const { totalBudgeted, totalContracted, hasDivergence } = React.useMemo(() => {
        let budgeted = 0;
        let contracted = 0;
        items.forEach(item => {
            contracted += item.total_price;
            const bItem = activeBudget.find(b => b.id === item.budget_item_id);
            budgeted += bItem ? (bItem.sinapiItem.price * item.quantity) : item.total_price;
        });

        // Divergence between items sum and budget sum OR between contract header and budget sum
        // ONLY trigger if there are items to prevent zeroing empty contracts
        const div = items.length > 0 && (Math.abs(budgeted - (contract?.original_value || 0)) > 0.01 || Math.abs(budgeted - contracted) > 0.01);

        return { totalBudgeted: budgeted, totalContracted: contracted, hasDivergence: div };
    }, [items, activeBudget, contract]);

    const loadContractData = async () => {
        try {
            setLoading(true);
            const [c, i, a, m, u] = await Promise.all([
                contractService.getContractById(contractId),
                contractService.listContractItems(contractId),
                contractService.listAddendums(contractId),
                contractService.listMeasurements(contractId),
                contractService.listUtilityBills(contractId)
            ]);
            setContract(c);
            setItems(i);
            setAddendums(a);
            setMeasurements(m);
            setUtilityBills(u);

            // 1. Try to load project settings if obra is linked
            const sourceProjectId = c?.budget_id || c?.project_id;
            if (sourceProjectId) {
                try {
                    const projectData = await projectService.loadProject(sourceProjectId);
                    if (projectData) {
                        setProjectSettings({
                            ...projectData.settings,
                            id: projectData.id,
                            name: projectData.name,
                            organizationId: projectData.organization_id || projectData.settings?.organizationId
                        });

                        // Always load budget from linked project (budget_id takes precedence)
                        if (projectData.budget && projectData.budget.length > 0) {
                            setActiveBudget(projectData.budget);
                        }
                    }
                } catch (err) {
                    console.error("Erro ao carregar dados do projeto:", err);
                }
            }

            // 2. Always try to load organization if contract has it
            if (c?.organization_id) {
                try {
                    const orgs = await organizationService.listOrganizations();
                    const org = orgs.find((o) => o.id === c.organization_id);
                    if (org) setOrganization(org);
                } catch (err) {
                    console.error("Erro ao carregar organização:", err);
                }
            }
        } catch (error) {
            console.error("Erro ao carregar dados do contrato:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleApproveAddendum = (id: string) => {
        askConfirm("Deseja aprovar este aditivo? Isso alterará permanentemente o valor/prazo do contrato.", () => {
            setPendingConfirm(null);
            (async () => {
                try {
                    await contractService.approveAddendum(id, 'Admin');
                    await loadContractData();
                    notify("Aditivo aprovado com sucesso!", "success");
                } catch (error) {
                    console.error("Erro ao aprovar aditivo:", error);
                    notify("Erro ao aprovar aditivo.", "error");
                }
            })();
        });
    };

    const handleExportReport = async () => {
        if (!contract || !projectSettings || !organization) {
            notify("Dados insuficientes para gerar o relatório.", "error");
            return;
        }

        try {
            setExporting(true);

            // 1. Fetch items for ALL measurements
            // This is needed because the photo annex needs the item descriptions and quantities
            const measurementsWithItems = await Promise.all(
                measurements.map(async (m) => {
                    const mItems = await contractService.getMeasurementItems(m.id);
                    // Map items with descriptions from the contract items list
                    const enrichedItems = mItems.map(mi => {
                        const contractItem = items.find(ci => ci.id === mi.contract_item_id);
                        return {
                            ...mi,
                            contract_item_description: contractItem?.description || 'Item não identificado'
                        };
                    });
                    return { ...m, items: enrichedItems };
                })
            );

            await exportService.generateContractFinancialReportPDF(
                contract,
                items,
                measurementsWithItems,
                addendums,
                organization,
                projectSettings
            );
        } catch (error: unknown) {
            console.error("Erro ao exportar relatório:", error);
            notify(`Erro ao gerar PDF: ${error instanceof Error ? error.message : 'Erro desconhecido'}`, "error");
        } finally {
            setExporting(false);
        }
    };

    const handleEditMeasurement = async (measurement: ContractMeasurement) => {
        try {
            const mItems = await contractService.getMeasurementItems(measurement.id);
            setEditingMeasurement(measurement);
            setEditingMeasurementItems(mItems);
            setIsMeasurementModalOpen(true);
        } catch (error) {
            console.error("Erro ao carregar itens da medição:", error);
            notify("Erro ao carregar detalhes da medição.", "error");
        }
    };

    const [selectedHistoryItem, setSelectedHistoryItem] = React.useState<ContractItem | null>(null);
    const [itemHistory, setItemHistory] = React.useState<{ measurement: ContractMeasurement, item: ContractMeasurementItem }[]>([]);

    const handleViewItemHistory = async (item: ContractItem) => {
        try {
            setLoading(true);
            const allMeasurements = await contractService.listMeasurements(contract?.id || '');
            const allItems = await Promise.all(
                allMeasurements.map(m => contractService.getMeasurementItems(m.id))
            );
            const history: { measurement: ContractMeasurement, item: ContractMeasurementItem }[] = [];
            allMeasurements.forEach((m, i) => {
                const matching = allItems[i].find(mi => mi.contract_item_id === item.id);
                if (matching) history.push({ measurement: m, item: matching });
            });
            setItemHistory(history.sort((a, b) => new Date(b.measurement.measurement_date).getTime() - new Date(a.measurement.measurement_date).getTime()));
            setSelectedHistoryItem(item);
        } catch (error) {
            console.error("Erro ao carregar histórico do item:", error);
            alert("Erro ao carregar histórico.");
        } finally {
            setLoading(false);
        }
    };

    const handleAdjustToBudget = () => {
        if (!contract) return;

        if (items.length === 0) {
            notify("Não é possível ajustar o contrato sem itens. Por favor, importe os itens do orçamento primeiro.", "error");
            return;
        }

        if (!activeBudget.length) return;

        let totalBudgeted = 0;
        items.forEach(item => {
            const bItem = activeBudget.find(b => b.id === item.budget_item_id);
            totalBudgeted += bItem ? (bItem.sinapiItem.price * item.quantity) : item.total_price;
        });

        askConfirm(`Isso irá ajustar todos os itens do contrato para os valores originais do orçamento (WBS). Novo Total do Contrato: R$ ${totalBudgeted.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Deseja continuar?`, () => {
            setPendingConfirm(null);
            (async () => {
                try {
                    setLoading(true);

                    const updatePromises = items.map(item => {
                        const bItem = activeBudget.find(b => b.id === item.budget_item_id);
                        if (!bItem) return Promise.resolve();
                        const newPrice = bItem.sinapiItem.price;
                        const newTotal = newPrice * item.quantity;
                        return contractService.updateContractItem(item.id, {
                            unit_price: newPrice,
                            total_price: newTotal
                        });
                    });

                    await Promise.all(updatePromises);

                    await contractService.updateContract(contract.id, {
                        original_value: totalBudgeted,
                        current_value: totalBudgeted
                    });

                    await loadContractData();
                    notify("Contrato ajustado com sucesso pelo orçamento!", "success");
                } catch (error) {
                    console.error("Erro ao ajustar contrato:", error);
                    notify("Erro ao ajustar contrato.", "error");
                } finally {
                    setLoading(false);
                }
            })();
        });
    };

    const handleDeleteItem = (itemId: string) => {
        askConfirm("Tem certeza que deseja remover este item do contrato? Esta ação afetará o saldo contratual.", () => {
            setPendingConfirm(null);
            (async () => {
                try {
                    setLoading(true);
                    await contractService.deleteContractItem(itemId);
                    await loadContractData();
                    notify("Item removido com sucesso!", "success");
                } catch (error) {
                    console.error("Erro ao remover item do contrato:", error);
                    notify("Erro ao remover item. Tente novamente.", "error");
                } finally {
                    setLoading(false);
                }
            })();
        });
    };

    const handleSelectBudgetItem = async (budgetItem: BudgetEntry) => {
        if (!contract) return;

        try {
            await contractService.addContractItem({
                contract_id: contractId,
                budget_item_id: budgetItem.id || budgetItem.sinapiItem?.code || 'WBS',
                description: budgetItem.sinapiItem?.description || 'Item sem descrição',
                unit: budgetItem.sinapiItem?.unit || 'UNID',
                quantity: budgetItem.quantity || 1,
                unit_price: budgetItem.sinapiItem?.price || 0,
                total_price: (budgetItem.quantity || 1) * (budgetItem.sinapiItem?.price || 0)
            });

            // Recarregar itens
            const updatedItems = await contractService.listContractItems(contractId);
            setItems(updatedItems);
            setIsBudgetPickerOpen(false);
        } catch (error) {
            console.error("Erro ao importar item do orçamento:", error);
            notify("Erro ao importar item. Tente novamente.", "error");
        }
    };

    const handleConfirmAvulso = async (item: AvulsoItem, editingIndex: number | null) => {
        if (!contract) return;
        try {
            if (editingIndex !== null) {
                // Find the avulso item by its position in the items list and update it
                const avulsoItems = items.filter(i => i.budget_item_id === 'AVULSO');
                const target = avulsoItems[editingIndex];
                if (target) {
                    await contractService.updateContractItem(target.id, {
                        description: item.description,
                        unit: item.unit,
                        quantity: item.quantity,
                        unit_price: item.unitPrice,
                        total_price: item.quantity * item.unitPrice,
                        budget_item_id: item.code || 'AVULSO',
                    });
                }
            } else {
                await contractService.addContractItem({
                    contract_id: contractId,
                    budget_item_id: item.code || 'AVULSO',
                    description: item.description,
                    unit: item.unit,
                    quantity: item.quantity,
                    unit_price: item.unitPrice,
                    total_price: item.quantity * item.unitPrice,
                });
            }
            const updatedItems = await contractService.listContractItems(contractId);
            setItems(updatedItems);
            setAvulsoModalConfig({ open: false, editingIndex: null, initial: null });
            notify('Item avulso salvo com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao salvar item avulso:', error);
            notify('Erro ao salvar item avulso.', 'error');
        }
    };

    const handleApplyReajuste = async () => {
        if (!contract) return;
        const base = parseFloat(reajusteBase.replace(',', '.'));
        const atual = parseFloat(reajusteAtual.replace(',', '.'));
        if (isNaN(base) || base <= 0 || isNaN(atual) || atual <= 0) {
            notify('Informe índices válidos (maiores que zero).', 'error');
            return;
        }
        setApplyingReajuste(true);
        try {
            const updated = await contractService.applyReajuste(contract.id, base, atual, reajusteNotes || undefined);
            setContract(updated);
            setReajusteModal(false);
            setReajusteBase('');
            setReajusteAtual('');
            setReajusteNotes('');
            notify(`Reajuste aplicado. Novo valor: R$ ${updated.current_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'success');
        } catch (e) {
            notify(`Erro ao aplicar reajuste: ${e instanceof Error ? e.message : 'Tente novamente.'}`, 'error');
        } finally {
            setApplyingReajuste(false);
        }
    };

    const handleDownloadPDF = async () => {
        if (!contract || !projectSettings || !organization) {
            notify("Dados insuficientes para emitir o contrato.", "error");
            return;
        }

        try {
            setLoading(true);
            await exportService.generateServiceContractPDF(
                contract,
                items,
                organization,
                projectSettings
            );
            notify("PDF do contrato gerado com sucesso!", "success");
        } catch (error: unknown) {
            console.error("Erro ao emitir contrato:", error);
            notify(`Erro na operação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleSyncFinance = async () => {
        if (!contract) return;
        if (!contract.original_value || contract.original_value <= 0) {
            notify("Contrato sem valor definido — edite o contrato e informe o valor antes de lançar.", "error");
            return;
        }
        setSyncingFinance(true);
        try {
            const { count } = await contractService.syncContractToFinance(contract);
            if (count === 0) {
                notify("Nenhuma entrada gerada — verifique valor e datas do contrato.", "error");
            } else if (contract.is_recurring) {
                const horizon = contract.end_date ? 'até o fim do contrato' : 'próximos 12 ciclos';
                notify(`Financeiro atualizado: parcelas geradas a partir do próximo vencimento (${horizon})`, "success");
            } else {
                notify(`Financeiro atualizado: ${count} lançamento${count > 1 ? 's' : ''} criado${count > 1 ? 's' : ''}`, "success");
            }
        } catch (e) {
            notify("Erro ao lançar no financeiro. Tente novamente.", "error");
        } finally {
            setSyncingFinance(false);
        }
    };

    const handleSendWebhook = (template?: ContractTemplate) => {
        if (!contract) {
            notify("Dados insuficientes para enviar o contrato.", "error");
            return;
        }

        const templates = projectSettings?.financialInfo?.contractTemplates || [];
        if (templates.length > 0 && !template) {
            setIsTemplateModalOpen(true);
            return;
        }

        const confirmMessage = contract.status === 'Enviado'
            ? "Este contrato já foi enviado. Deseja enviar novamente para o fornecedor via automação?"
            : "Deseja enviar o contrato para o fornecedor via automação? Isso atualizará o status para 'Enviado'.";

        askConfirm(confirmMessage, () => {
            setPendingConfirm(null);
            (async () => {
                try {
                    setLoading(true);

                    let supplierData = null;
                    if (contract.supplier_id) {
                        supplierData = await supplierService.getById(contract.supplier_id);
                    }

                    await webhookService.triggerContractSentWebhook(
                        contract,
                        supplierData ?? undefined,
                        projectSettings ?? undefined,
                        false,
                        template
                    );

                    if (contract.status !== 'Enviado' && contract.status !== 'Ativo') {
                        await contractService.updateContract(contract.id, {
                            status: 'Enviado'
                        });
                    }

                    await loadContractData();
                    setIsTemplateModalOpen(false);
                    notify("Contrato enviado via automação com sucesso!", "success");
                } catch (error: unknown) {
                    console.error("Erro ao enviar contrato:", error);
                    notify(`Erro na operação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`, "error");
                } finally {
                    setLoading(false);
                }
            })();
        });
    };

    const renderTemplateModal = () => {
        const templates = projectSettings?.financialInfo?.contractTemplates || [];
        if (!isTemplateModalOpen) return null;

        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
                <div className="bg-white rounded-[2.5rem] shadow-2xl p-10 w-full max-w-lg border border-gray-100 animate-in zoom-in-95 duration-300">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-600/20">
                                    <Zap className="w-5 h-5" />
                                </div>
                                <span className="text-[12px] font-medium text-blue-600 uppercase tracking-[0.3em]">Automação</span>
                            </div>
                            <h3 className="text-2xl font-medium text-gray-900 tracking-tight">Escolha o Template</h3>
                            <p className="text-sm text-gray-500 font-medium">Selecione o modelo de contrato para emissão.</p>
                        </div>
                        <button onClick={() => setIsTemplateModalOpen(false)} className="p-3 hover:bg-gray-100 rounded-2xl transition-all text-gray-400">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="space-y-4 mb-10">
                        {templates.map((template) => (
                            <button
                                key={template.id}
                                onClick={() => handleSendWebhook(template)}
                                className="w-full p-6 bg-gray-50 border-2 border-transparent hover:border-blue-500 hover:bg-white rounded-[2rem] transition-all text-left flex items-center justify-between group"
                            >
                                <div>
                                    <p className="text-base font-medium text-gray-900 leading-tight mb-1">{template.name}</p>
                                    <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest leading-none">ID: {template.externalId}</p>
                                </div>
                                <div className="p-3 bg-white rounded-2xl text-gray-400 group-hover:text-blue-600 group-hover:bg-blue-50 transition-all border border-gray-100">
                                    <ArrowRight className="w-5 h-5" />
                                </div>
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => setIsTemplateModalOpen(false)}
                        className="w-full py-5 bg-gray-100 text-gray-400 rounded-[1.5rem] font-medium text-[12px] uppercase tracking-widest hover:bg-gray-200 hover:text-gray-600 transition-all"
                    >
                        Cancelar Envio
                    </button>
                </div>
            </div>
        );
    };

    const totalMeasurements = measurements.reduce((sum, m) => sum + (m.total_value || 0), 0);
    const physicalProgress = contract ? (totalMeasurements / (contract.current_value || 1)) * 100 : 0;

    const timeProgress = React.useMemo(() => {
        if (!contract || !contract.start_date || !contract.end_date) return 0;
        const start = new Date(contract.start_date + 'T12:00:00').getTime();
        const end = new Date(contract.end_date + 'T12:00:00').getTime();
        const now = new Date().getTime();
        if (now < start) return 0;
        if (now > end) return 100;
        const total = end - start;
        if (total <= 0) return 100;
        return ((now - start) / total) * 100;
    }, [contract?.start_date, contract?.end_date]);

    const addendumsMetrics = React.useMemo(() => {
        if (!contract) return { totalImpact: 0, percentage: 0 };
        const totalImpact = addendums
            .filter(a => a.status === 'Aprovado')
            .reduce((sum, a) => sum + (a.value_impact || 0), 0);
        const percentage = (totalImpact / (contract.original_value || 1)) * 100;
        return { totalImpact, percentage };
    }, [addendums, contract?.original_value]);

    const activities = React.useMemo(() => {
        const m = measurements.map(item => ({
            id: item.id,
            date: new Date(item.created_at || item.measurement_date),
            title: `Medição #${item.number}`,
            description: `Status: ${item.status}`,
            type: 'measurement'
        }));
        const a = addendums.map(item => ({
            id: item.id,
            date: new Date(item.created_at || ''),
            title: `Aditivo ${item.number}`,
            description: item.description,
            type: 'addendum'
        }));
        const u = utilityBills.map(item => ({
            id: item.id,
            date: new Date((item.created_at || item.reference_month + 'T12:00:00')),
            title: `Fatura de Consumo`,
            description: `Mês Ref: ${new Date(item.reference_month).toLocaleDateString('pt-BR', {month: 'short', year: 'numeric'})} | Status: ${item.status}`,
            type: 'utility'
        }));
        return [...m, ...a, ...u].sort((x, y) => y.date.getTime() - x.date.getTime());
    }, [measurements, addendums, utilityBills]);

    if (loading || !contract) {
        return (
            <div className="flex flex-col items-center justify-center p-20 space-y-4">
                <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-gray-400 font-medium animate-pulse uppercase tracking-widest text-[12px]">Carregando Dossiê Contratual...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-3 bg-white border border-gray-100 rounded-2xl text-gray-400 hover:text-blue-600 hover:border-blue-100 transition-all shadow-sm active:scale-95 group"
                    >
                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[12px] font-medium text-blue-500 uppercase tracking-widest">{contract.number}</span>
                            <span className="w-1 h-1 bg-gray-300 rounded-full" />
                            <span className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">{contract.contract_type}</span>
                        </div>
                        <h1 className="text-3xl font-medium text-gray-900 tracking-tight uppercase leading-none">{contract.title}</h1>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end mr-4">
                        <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">Saldo Contratual</p>
                        <p className="text-2xl font-medium text-gray-900 tracking-tighter">
                            R$ {(contract.current_value - totalMeasurements).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                    </div>

                    <button
                        onClick={handleDownloadPDF}
                        disabled={loading}
                        className="flex items-center gap-2 px-6 py-4 bg-white border border-gray-200 text-gray-700 rounded-2xl hover:bg-gray-50 transition-all font-medium text-[12px] uppercase tracking-widest shadow-sm"
                        title="Baixar PDF do Contrato"
                    >
                        <FileDown className="w-4 h-4 text-blue-600" />
                        Emitir PDF
                    </button>

                    <button
                        onClick={handleSyncFinance}
                        disabled={syncingFinance}
                        className="flex items-center gap-2 px-6 py-4 bg-white border border-emerald-200 text-emerald-700 rounded-2xl hover:bg-emerald-50 transition-all font-medium text-[12px] uppercase tracking-widest shadow-sm disabled:opacity-50"
                        title="Lançar / Re-lançar este contrato no módulo financeiro"
                    >
                        <DollarSign className="w-4 h-4" />
                        {syncingFinance ? 'Lançando...' : 'Lançar Financeiro'}
                    </button>

                    <button
                        onClick={() => handleSendWebhook()}
                        disabled={loading}
                        className="flex items-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 font-medium text-[12px] uppercase tracking-widest disabled:opacity-50"
                        title="Enviar para Automação (Make.com)"
                    >
                        <Zap className="w-4 h-4" />
                        Enviar Automação
                    </button>

                </div>
            </div>

            <div className="flex bg-white p-1.5 rounded-3xl border border-gray-100 shadow-sm w-fit sticky top-4 z-40 backdrop-blur-md bg-white/80">
                {(contract.is_recurring ? [
                    { id: 'overview', label: 'Visão Geral', icon: Layers },
                    { id: 'utility_bills', label: 'Faturas de Consumo', icon: BarChart3 }
                ] : [
                    { id: 'overview', label: 'Visão Geral', icon: Layers },
                    { id: 'items', label: 'Itens do Contrato', icon: FileText },
                    { id: 'addendums', label: 'Aditivos (VA/PR)', icon: History },
                    { id: 'measurements', label: 'Medições (M/F)', icon: BarChart3 },
                ]).map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as 'overview' | 'items' | 'addendums' | 'measurements' | 'utility_bills')}
                        className={`flex items-center gap-2 px-6 py-3 rounded-2xl transition-all font-medium text-[12px] uppercase tracking-widest ${activeTab === tab.id
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {hasDivergence && (
                <div className="mt-8 bg-amber-50 border border-amber-100 p-6 rounded-[32px] flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-500 shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center">
                            <AlertCircle className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-amber-900 uppercase tracking-tight">Divergência Orçamentária Detectada</p>
                            <p className="text-[12px] font-medium text-amber-700 uppercase leading-relaxed">
                                O valor total do contrato difere do planejado no orçamento.<br />
                                Contrato: <span className="text-amber-900">R$ {contract?.original_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> |
                                Orçamento: <span className="text-amber-900">R$ {totalBudgeted.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleAdjustToBudget}
                        className="px-6 py-3 bg-amber-600 text-white text-[12px] font-medium uppercase tracking-widest rounded-xl hover:bg-amber-700 transition-all shadow-sm flex items-center gap-2"
                    >
                        <TrendingUp className="w-4 h-4" /> Ajustar pelo Orçado
                    </button>
                </div>
            )}

            {/* Tab: Visão Geral */}
            {activeTab === 'overview' && (
                <div className="grid grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="col-span-2 space-y-6">
                        {/* Workflow de Aprovação */}
                        {contract.approval_status && (
                            <ApprovalWorkflowCard
                                contract={contract}
                                onSubmit={async () => {
                                    const updated = await contractService.submitForApproval(contract.id);
                                    setContract(updated);
                                    notify('Contrato enviado para aprovação.', 'success');
                                }}
                                onApprove={async (level, notes) => {
                                    const updated = await contractService.approveContract(contract.id, level, 'Usuário', notes);
                                    setContract(updated);
                                    notify(updated.approval_status === 'APROVADO' ? 'Contrato aprovado!' : 'Nível aprovado. Aguardando próximo aprovador.', 'success');
                                }}
                                onReject={async (reason) => {
                                    const updated = await contractService.rejectContract(contract.id, 'Usuário', reason);
                                    setContract(updated);
                                    notify('Contrato rejeitado e retornado para rascunho.', 'info');
                                }}
                            />
                        )}
                        {/* Status & Timing */}
                        <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm space-y-8">
                            <div className="flex justify-between items-center">
                                <h3 className="text-[12px] font-medium text-gray-900 uppercase tracking-widest flex items-center gap-2 text-blue-600">
                                    <Clock className="w-4 h-4" /> Resumo de Execução
                                </h3>
                                <div className="flex gap-2">
                                    <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-[12px] font-medium uppercase tracking-wider">
                                        ID: {contract.id.slice(0, 8)}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-4 gap-8">
                                <div className="space-y-1">
                                    <p className="text-[12px] font-medium text-gray-400 uppercase tracking-[0.15em]">{contract.is_recurring ? 'Ciclo' : 'Vigência Total'}</p>
                                    <p className="text-sm font-medium text-gray-700">
                                        {contract.is_recurring ? contract.billing_cycle : `${Math.ceil((new Date(contract.end_date!).getTime() - new Date(contract.start_date).getTime()) / (1000 * 60 * 60 * 24))} Dias`}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[12px] font-medium text-gray-400 uppercase tracking-[0.15em]">Data Início</p>
                                    <p className="text-sm font-medium text-gray-700">{new Date(contract.start_date + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[12px] font-medium text-gray-400 uppercase tracking-[0.15em]">{contract.is_recurring ? 'Dia do Vencimento' : 'Data Término'}</p>
                                    <p className="text-sm font-medium text-gray-700">{contract.is_recurring ? `Todo dia ${contract.due_day}` : (contract.end_date ? new Date(contract.end_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'N/A')}</p>
                                </div>
                                {!contract.is_recurring && (
                                    <div className="space-y-1">
                                        <p className="text-[12px] font-medium text-gray-400 uppercase tracking-[0.15em]">Tempo Decorrido</p>
                                        <p className="text-sm font-medium text-blue-600">{timeProgress.toFixed(1)}%</p>
                                    </div>
                                )}
                            </div>

                            {/* Progress Bars */}
                            {!contract.is_recurring && (
                                <div className="space-y-6 pt-4">
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-end">
                                        <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">Progresso Físico-Financeiro</p>
                                        <p className="text-sm font-medium text-gray-900">{physicalProgress.toFixed(1)}%</p>
                                    </div>
                                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden border border-gray-50 p-0.5">
                                        <div
                                            className={`h-full rounded-full shadow-inner transition-all duration-1000 ${physicalProgress > 100 ? 'bg-red-500' : 'bg-blue-600'}`}
                                            style={{ width: `${Math.min(physicalProgress, 100)}%` }}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-end">
                                        <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">Execução do Prazo</p>
                                        <p className="text-sm font-medium text-gray-900">{timeProgress.toFixed(1)}%</p>
                                    </div>
                                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden border border-gray-50 p-0.5">
                                        <div
                                            className={`h-full rounded-full shadow-inner transition-all duration-1000 ${timeProgress > 100 ? 'bg-red-500' : 'bg-gray-900'}`}
                                            style={{ width: `${Math.min(timeProgress, 100)}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                            )}
                        </div>

                        {/* Recent Activity / Timeline Placeholder */}
                        <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm space-y-6">
                            <h3 className="text-[12px] font-medium text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                <History className="w-4 h-4 text-blue-600" /> Histórico Recente
                            </h3>
                            <div className="space-y-4">
                                {activities.length === 0 ? (
                                    <p className="text-xs text-gray-400 font-medium px-4 py-8 text-center italic">Nenhuma atividade registrada ainda.</p>
                                ) : activities.slice(0, 5).map((activity, i) => (
                                    <div key={activity.id || i} className="flex items-start gap-4 p-4 hover:bg-gray-50 rounded-2xl transition-all border border-transparent hover:border-gray-100">
                                        <div className={`p-2 ${activity.type === 'measurement' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'} rounded-xl shrink-0`}>
                                            <CheckCircle2 className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-800">{activity.title}</p>
                                            <div className="flex items-center gap-2">
                                                <p className="text-[12px] text-gray-400 font-medium">{activity.description}</p>
                                                <span className="w-1 h-1 bg-gray-200 rounded-full" />
                                                <p className="text-[12px] text-gray-400 font-medium">{activity.date.toLocaleDateString('pt-BR')}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {/* Financial Overview Card */}
                        <div className="bg-[#0B1727] p-8 rounded-[40px] text-white space-y-8 relative overflow-hidden group shadow-2xl shadow-blue-900/10">
                            <div className="absolute top-0 right-0 w-40 h-40 bg-blue-600/10 rounded-full -mr-20 -mt-20 group-hover:scale-150 transition-transform duration-700" />

                            <div className="space-y-6 relative z-10">
                                <div>
                                    <p className="text-[12px] font-medium text-blue-400 uppercase tracking-[0.2em] mb-2">Valor Atual do Contrato</p>
                                    <h4 className="text-4xl font-medium tracking-tighter">
                                        R$ {contract.current_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </h4>
                                    <div className="flex items-center gap-2 mt-2 text-emerald-400">
                                        <TrendingUp className="w-4 h-4" />
                                        <span className="text-[12px] font-medium uppercase tracking-widest">{addendumsMetrics.percentage > 0 ? '+' : ''} {addendumsMetrics.percentage.toFixed(1)}% em Aditivos</span>
                                    </div>
                                </div>

                                <div className="space-y-4 pt-6 border-t border-white/10">
                                    <div className="flex justify-between items-center text-[12px]">
                                        <span className="text-gray-400 font-medium uppercase tracking-wider">Valor Original</span>
                                        <span className="font-medium">R$ {contract.original_value.toLocaleString('pt-BR')}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[12px]">
                                        <span className="text-gray-400 font-medium uppercase tracking-wider">Total Medido</span>
                                        <span className="font-medium text-blue-400">R$ {totalMeasurements.toLocaleString('pt-BR')}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[12px]">
                                        <span className="text-gray-400 font-medium uppercase tracking-wider">Retenções</span>
                                        <span className="font-medium text-amber-400">R$ {(totalMeasurements * (contract.retention_rate / 100)).toLocaleString('pt-BR')}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[12px] pt-3 border-t border-white/10">
                                        <span className="text-emerald-400 font-medium uppercase tracking-wider">Saldo a Faturar</span>
                                        <span className="font-medium text-emerald-400">R$ {(contract.current_value - totalMeasurements).toLocaleString('pt-BR')}</span>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleExportReport}
                                disabled={exporting}
                                className={`w-full py-4 ${exporting ? 'bg-gray-700 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500'} text-white rounded-2xl transition-all font-medium text-[12px] uppercase tracking-widest shadow-xl shadow-blue-950/20 active:scale-95 flex items-center justify-center gap-2`}
                            >
                                {exporting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        Gerando Dossiê...
                                    </>
                                ) : (
                                    <>
                                        <FileText className="w-4 h-4" />
                                        Emitir Relatório Completo
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Additional Info Cards */}
                        <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm space-y-4">
                            <h4 className="text-[12px] font-medium text-gray-400 uppercase tracking-widest px-2">Configurações</h4>
                            <div className="space-y-3">
                                {contract.budget_snapshot != null && (
                                    <div className="p-4 bg-emerald-50 rounded-2xl flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <LockIcon className="w-5 h-5 text-emerald-500" />
                                            <span className="text-[12px] font-medium text-gray-700">Orçamento contratado</span>
                                        </div>
                                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-wide">Congelado</span>
                                    </div>
                                )}
                                <div className="p-4 bg-gray-50 rounded-2xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Shield className="w-5 h-5 text-gray-400" />
                                        <span className="text-[12px] font-medium text-gray-700">Índice Reajuste</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[12px] font-medium text-blue-600 uppercase">{contract.reajuste_index || '—'}</span>
                                        {contract.reajuste_index && (
                                            <button
                                                onClick={() => setReajusteModal(true)}
                                                className="text-[10px] font-semibold text-white bg-blue-600 hover:bg-blue-700 px-2 py-0.5 rounded-full transition-colors"
                                            >
                                                Aplicar
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {(contract.reajuste_data_base || contract.reajuste_proximo) && (
                                    <div className="p-3 bg-blue-50 rounded-2xl text-[11px] text-blue-700 space-y-0.5">
                                        {contract.reajuste_data_base && (
                                            <p>Base: {new Date(contract.reajuste_data_base).toLocaleDateString('pt-BR')}</p>
                                        )}
                                        {contract.reajuste_proximo && (
                                            <p>Próximo: {new Date(contract.reajuste_proximo).toLocaleDateString('pt-BR')}</p>
                                        )}
                                    </div>
                                )}
                                <div className="p-4 bg-gray-50 rounded-2xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <DollarSign className="w-5 h-5 text-gray-400" />
                                        <span className="text-[12px] font-medium text-gray-700">Retenção Garantia</span>
                                    </div>
                                    <span className="text-[12px] font-medium text-amber-600">{contract.retention_rate}%</span>
                                </div>
                            </div>
                        </div>

                        {/* Payment Info Card */}
                        <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm space-y-4">
                            <h4 className="text-[12px] font-medium text-gray-400 uppercase tracking-widest px-2">Pagamento</h4>
                            <div className="space-y-3">
                                <div className="p-4 bg-blue-50/50 rounded-2xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <HandCoins className="w-5 h-5 text-blue-500" />
                                        <div className="flex flex-col">
                                            <span className="text-[12px] font-medium text-gray-400 uppercase tracking-wider">Forma</span>
                                            <span className="text-[12px] font-medium text-gray-700">{contract.payment_method || 'A definir'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* GED: signed contract card */}
                        <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm space-y-4">
                            <h4 className="text-[12px] font-medium text-gray-400 uppercase tracking-widest px-2">Documentos (GED)</h4>
                            <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl group flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-[12px] font-medium text-blue-600 uppercase tracking-widest leading-none mb-1">Contrato Assinado</p>
                                        <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">
                                            {contract.signed_contract_url ? 'PDF Vinculado' : 'Não Anexado'}
                                        </p>
                                    </div>
                                </div>
                                {contract.signed_contract_url && (
                                    <a
                                        href={contract.signed_contract_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 bg-white text-blue-600 rounded-lg border border-blue-100 hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                        title="Abrir Contrato Assinado"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                    </a>
                                )}
                            </div>

                            {/* Assinatura Eletrônica */}
                            <SignaturePanel
                                contract={contract}
                                onSend={async (signers) => {
                                    if (!contract.signed_contract_url) {
                                        notify('Anexe o PDF do contrato antes de enviar para assinatura.', 'error');
                                        return;
                                    }
                                    try {
                                        notify('Enviando para ZapSign…', 'info');
                                        // Busca o PDF como base64
                                        const pdfResp = await fetch(contract.signed_contract_url);
                                        const blob = await pdfResp.blob();
                                        const base64 = await new Promise<string>((res, rej) => {
                                            const fr = new FileReader();
                                            fr.onload = () => res((fr.result as string).split(',')[1]);
                                            fr.onerror = rej;
                                            fr.readAsDataURL(blob);
                                        });
                                        await contractService.sendForSignature(
                                            contract.id,
                                            contract.organization_id,
                                            base64,
                                            `Contrato ${contract.number} — ${contract.title}`,
                                            signers
                                        );
                                        const updated = await contractService.getContractById(contract.id);
                                        if (updated) setContract(updated);
                                        notify('Contrato enviado para assinatura!', 'success');
                                    } catch (e) {
                                        notify(`Erro: ${e instanceof Error ? e.message : 'Tente novamente.'}`, 'error');
                                    }
                                }}
                                onRefreshStatus={async () => {
                                    if (!contract.signature_token) return;
                                    try {
                                        await contractService.getSignatureStatus(contract.signature_token);
                                        const updated = await contractService.getContractById(contract.id);
                                        if (updated) setContract(updated);
                                        notify('Status atualizado.', 'info');
                                    } catch (e) {
                                        notify(`Erro ao consultar status: ${e instanceof Error ? e.message : ''}`, 'error');
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Tab: Itens do Contrato */}
            {activeTab === 'items' && (
                <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                    {/* Summary Dashboard */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                            <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest mb-1">Total Orçado (WBS)</p>
                            <h3 className="text-xl font-medium text-gray-900 tracking-tight">R$ {totalBudgeted.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                        </div>
                        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                            <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest mb-1">Total Contratado</p>
                            <h3 className="text-xl font-medium text-gray-900 tracking-tight">R$ {totalContracted.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                        </div>
                        {(() => {
                            const diff = totalBudgeted - totalContracted;
                            const percent = totalBudgeted > 0 ? (diff / totalBudgeted) * 100 : 0;
                            return (
                                <div className={`p-6 rounded-3xl border shadow-sm ${diff >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                                    <p className={`text-[12px] font-medium uppercase tracking-widest mb-1 ${diff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {diff >= 0 ? 'Economia Gerada' : 'Excesso de Custo'}
                                    </p>
                                    <div className="flex items-baseline gap-2">
                                        <h3 className={`text-xl font-medium tracking-tight ${diff >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                            {diff >= 0 ? '+' : ''} R$ {diff.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </h3>
                                        <span className={`text-[12px] font-medium ${diff >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                            ({percent.toFixed(1)}%)
                                        </span>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                        <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
                            <div>
                                <h3 className="text-lg font-medium text-gray-900 tracking-tight uppercase">Planilha de Itens Contratados</h3>
                                <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest mt-0.5">Vínculo direto com o orçamento da obra (WBS)</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setAvulsoModalConfig({ open: true, editingIndex: null, initial: null })}
                                    className="flex items-center gap-2 px-5 py-3 bg-orange-50 border border-orange-200 text-orange-700 rounded-xl hover:bg-orange-100 transition-all font-medium text-[12px] uppercase tracking-widest"
                                >
                                    <Package className="w-4 h-4" /> Item Avulso
                                </button>
                                <button
                                    onClick={() => setIsBudgetPickerOpen(true)}
                                    className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-xl hover:bg-blue-600 transition-all font-medium text-[12px] uppercase tracking-widest"
                                >
                                    <PlusCircle className="w-4 h-4" /> Importar do Orçamento
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 border-y border-gray-100">
                                    <tr>
                                        <th className="px-8 py-3 text-[12px] font-medium text-gray-400 uppercase tracking-widest">WBS / Item</th>
                                        <th className="px-6 py-3 text-[12px] font-medium text-gray-400 uppercase tracking-widest">Descrição</th>
                                        <th className="px-2 py-3 text-[12px] font-medium text-gray-400 uppercase tracking-widest text-center">Unid</th>
                                        <th className="px-4 py-3 text-[12px] font-medium text-gray-400 uppercase tracking-widest text-right">Qtd</th>
                                        <th className="px-4 py-3 text-[12px] font-medium text-gray-400 uppercase tracking-widest text-right border-l border-gray-100">Unit (C)</th>
                                        <th className="px-4 py-3 text-[12px] font-medium text-blue-500 uppercase tracking-widest text-right bg-blue-50/30">Unit (O)</th>
                                        <th className="px-4 py-3 text-[12px] font-medium text-gray-400 uppercase tracking-widest text-right border-l border-gray-100">Total (C)</th>
                                        <th className="px-4 py-3 text-[12px] font-medium text-blue-500 uppercase tracking-widest text-right bg-blue-50/30">Total (O)</th>
                                        <th className="px-8 py-3 text-[12px] font-medium text-emerald-600 uppercase tracking-widest text-right bg-emerald-50/30 border-l border-emerald-100">Economia</th>
                                        <th className="px-6 py-3 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {items.length === 0 ? (
                                        <tr>
                                            <td colSpan={10} className="px-8 py-20 text-center">
                                                <div className="max-w-xs mx-auto space-y-4">
                                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
                                                        <FileText className="w-8 h-8 text-gray-200" />
                                                    </div>
                                                    <p className="text-sm font-bold text-gray-400">Nenhum item vinculado a este contrato.</p>
                                                    <button onClick={() => setIsBudgetPickerOpen(true)} className="text-xs font-black text-blue-600 uppercase tracking-widest hover:underline">Adicionar Primeiro Item</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : items.map((item) => (
                                        <tr key={item.id} className="hover:bg-blue-50/20 transition-colors group">
                                            <td className="px-8 py-4">
                                                {item.budget_item_id === 'AVULSO' || (!item.budget_item_id) ? (
                                                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-md text-[12px] font-medium uppercase tracking-wider border border-orange-200 flex items-center gap-1 w-fit">
                                                        <Package className="w-3 h-3" /> AVULSO
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-[12px] font-medium uppercase tracking-wider border border-gray-200">
                                                        {item.budget_item_id}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <p className="text-sm font-bold text-gray-700 uppercase tracking-tight leading-tight">{item.description}</p>
                                                    <div className="flex items-center gap-3 mt-1">
                                                        <p className="text-[12px] text-gray-400 font-medium tracking-tighter">ID: {item.id.slice(0, 8)}</p>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleViewItemHistory(item);
                                                            }}
                                                            className="flex items-center gap-1.5 text-[12px] font-medium text-blue-600 hover:text-blue-700 transition-colors uppercase tracking-tight"
                                                            title="Ver Histórico de Medições"
                                                        >
                                                            <History className="w-3 h-3" /> Histórico
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-2 py-4 text-center">
                                                <span className="text-[12px] font-medium text-gray-400 uppercase">{item.unit}</span>
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                <p className="text-sm font-medium text-gray-900 tracking-tighter">{item.quantity.toLocaleString()}</p>
                                            </td>
                                            <td className="px-4 py-4 text-right border-l border-gray-50">
                                                <p className="text-xs font-bold text-gray-700">R$ {item.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                            </td>
                                            <td className="px-4 py-4 text-right bg-blue-50/10">
                                                {(() => {
                                                    const bItem = activeBudget.find(b => b.id === item.budget_item_id);
                                                    if (!bItem) return <span className="text-gray-300">-</span>;
                                                    return (
                                                        <p className="text-xs font-bold text-blue-600">R$ {bItem.sinapiItem.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                    );
                                                })()}
                                            </td>
                                            <td className="px-4 py-4 text-right border-l border-gray-50">
                                                <p className="text-sm font-medium text-gray-900 tracking-tighter">R$ {item.total_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                            </td>
                                            <td className="px-4 py-4 text-right bg-blue-50/10">
                                                {(() => {
                                                    const bItem = activeBudget.find(b => b.id === item.budget_item_id);
                                                    if (!bItem) return <span className="text-gray-300">-</span>;
                                                    const totalBudgeted = bItem.sinapiItem.price * item.quantity;
                                                    return (
                                                        <p className="text-xs font-bold text-blue-600">R$ {totalBudgeted.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                    );
                                                })()}
                                            </td>
                                            <td className="px-8 py-4 text-right bg-emerald-50/10 border-l border-emerald-50">
                                                {(() => {
                                                    const bItem = activeBudget.find(b => b.id === item.budget_item_id);
                                                    if (!bItem) return <span className="text-gray-300 font-bold">-</span>;
                                                    const saving = (bItem.sinapiItem.price - item.unit_price) * item.quantity;
                                                    const percent = ((bItem.sinapiItem.price - item.unit_price) / bItem.sinapiItem.price) * 100;
                                                    return (
                                                        <div className="flex flex-col items-end">
                                                            <p className={`text-sm font-medium tracking-tighter ${saving >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                                {saving >= 0 ? '+' : ''} R$ {saving.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                            </p>
                                                            <p className={`text-[12px] font-medium uppercase tracking-tighter ${saving >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                                {saving >= 0 ? '↓' : '↑'} {Math.abs(percent).toFixed(1)}%
                                                            </p>
                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {(item.budget_item_id === 'AVULSO' || !item.budget_item_id || item.budget_item_id === item.budget_item_id) && (
                                                        <button
                                                            onClick={() => {
                                                                // Find index among avulso items only
                                                                const avulsoItems = items.filter(i => i.budget_item_id === 'AVULSO' || (!i.budget_item_id));
                                                                const idx = avulsoItems.findIndex(a => a.id === item.id);
                                                                if (idx !== -1) {
                                                                    setAvulsoModalConfig({
                                                                        open: true,
                                                                        editingIndex: idx,
                                                                        initial: { code: item.budget_item_id === 'AVULSO' ? '' : (item.budget_item_id || ''), description: item.description, unit: item.unit, quantity: item.quantity, unitPrice: item.unit_price }
                                                                    });
                                                                }
                                                            }}
                                                            className={`p-2 rounded-lg transition-all shadow-sm ${item.budget_item_id === 'AVULSO' || !item.budget_item_id ? 'text-orange-400 hover:text-orange-600 hover:bg-orange-50' : 'text-gray-200 cursor-not-allowed opacity-50'}`}
                                                            title={item.budget_item_id === 'AVULSO' || !item.budget_item_id ? 'Editar Item Avulso' : 'Edição de item WBS disponível em breve'}
                                                            disabled={item.budget_item_id !== 'AVULSO' && !!item.budget_item_id}
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleDeleteItem(item.id)}
                                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-white rounded-lg transition-all shadow-sm"
                                                        title="Remover Item"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab: Aditivos */}
            {activeTab === 'addendums' && (
                <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="flex justify-between items-center mb-2">
                        <div>
                            <h3 className="text-xl font-medium text-gray-900 tracking-tight flex items-center gap-3">
                                Aditivos Contratuais <span className="text-[12px] font-medium bg-blue-100 text-blue-600 px-3 py-1 rounded-full uppercase tracking-widest">{addendums.length} Total</span>
                            </h3>
                            <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest mt-1">Gestão de alterações de valor, prazo e escopo.</p>
                        </div>
                        <button
                            onClick={() => setIsAddendumModalOpen(true)}
                            className="flex items-center gap-2 px-8 py-4 bg-gray-900 text-white rounded-2xl hover:bg-emerald-600 transition-all shadow-xl shadow-gray-200 font-medium text-[12px] uppercase tracking-widest group"
                        >
                            <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                            Solicitar Novo Aditivo
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {addendums.length === 0 ? (
                            <div className="col-span-2 bg-white rounded-[40px] p-20 text-center border-2 border-dashed border-gray-100">
                                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <History className="w-10 h-10 text-gray-200" />
                                </div>
                                <h3 className="text-xl font-medium text-gray-900 tracking-tight">Sem histórico de aditivos</h3>
                                <p className="text-gray-400 text-sm mt-2 font-medium">Este contrato ainda mantém seus termos originais.</p>
                            </div>
                        ) : addendums.map((addendum) => (
                            <div key={addendum.id} className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-blue-900/5 transition-all group relative overflow-hidden">
                                <div className={`absolute top-0 right-0 w-32 h-32 bg-${addendum.status === 'Aprovado' ? 'emerald' : 'amber'}-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700`} />

                                <div className="flex justify-between items-start mb-6 relative z-10">
                                    <div>
                                        <p className="text-[12px] font-medium text-blue-500 uppercase tracking-widest mb-1">Aditivo {addendum.number}</p>
                                        <h4 className="text-lg font-medium text-gray-900 uppercase tracking-tight leading-tight">{addendum.description}</h4>
                                    </div>
                                    <span className={`px-2 py-1 rounded-lg text-[12px] font-medium uppercase tracking-widest ${addendum.status === 'Aprovado' ? 'bg-emerald-100 text-emerald-800' :
                                        addendum.status === 'Pendente' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                        {addendum.status}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-8 bg-gray-50 p-6 rounded-2xl relative z-10">
                                    <div className="space-y-1">
                                        <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">Impacto Financeiro</p>
                                        <p className={`text-lg font-medium tracking-tighter ${addendum.value_impact > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                            {addendum.value_impact > 0 ? '+' : ''} R$ {addendum.value_impact.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">Nova Data Término</p>
                                        <p className="text-lg font-medium text-gray-900 tracking-tighter">
                                            {addendum.new_end_date ? new Date(addendum.new_end_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'N/A'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between text-[12px] font-medium text-gray-400 uppercase tracking-widest border-t border-gray-50 pt-4 relative z-10">
                                    <div className="flex flex-col gap-1">
                                        <span className="opacity-60">Solicitado em:</span>
                                        <span className="text-gray-900">{new Date(addendum.created_at || '').toLocaleDateString('pt-BR')}</span>
                                    </div>
                                    {addendum.status === 'Aprovado' ? (
                                        <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl">
                                            <CheckCircle2 className="w-3 h-3" />
                                            <span>Aprovado em {new Date(addendum.approved_at || '').toLocaleDateString('pt-BR')}</span>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => handleApproveAddendum(addendum.id)}
                                            className="px-6 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 font-medium text-[12px] uppercase tracking-widest active:scale-95 flex items-center gap-2"
                                        >
                                            <CheckCircle2 className="w-3 h-3" />
                                            Aprovar Aditivo
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Tab: Medições */}
            {activeTab === 'measurements' && (
                <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="flex justify-between items-center mb-2">
                        <div>
                            <h3 className="text-xl font-medium text-gray-900 tracking-tight flex items-center gap-3">
                                Diário de Medições <span className="text-[12px] font-medium bg-emerald-100 text-emerald-600 px-3 py-1 rounded-full uppercase tracking-widest">{measurements.length} Registradas</span>
                            </h3>
                            <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest mt-1">Acompanhamento da execução física e liberação de pagamentos.</p>
                        </div>
                        <button
                            onClick={() => {
                                setEditingMeasurement(null);
                                setEditingMeasurementItems([]);
                                setIsMeasurementModalOpen(true);
                            }}
                            className="flex items-center gap-2 px-8 py-4 bg-gray-900 text-white rounded-2xl hover:bg-blue-600 transition-all shadow-xl shadow-gray-200 font-medium text-[12px] uppercase tracking-widest group"
                        >
                            <BarChart3 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                            Nova Medição de Período
                        </button>
                    </div>

                    <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="px-8 py-5 text-[12px] font-medium text-gray-400 uppercase tracking-widest">ID / Período</th>
                                    <th className="px-6 py-5 text-[12px] font-medium text-gray-400 uppercase tracking-widest">Status</th>
                                    <th className="px-6 py-5 text-[12px] font-medium text-gray-400 uppercase tracking-widest text-right">Valor Medido</th>
                                    <th className="px-6 py-5 text-[12px] font-medium text-gray-400 uppercase tracking-widest text-right">Retenções</th>
                                    <th className="px-8 py-5 text-[12px] font-medium text-gray-400 uppercase tracking-widest text-right">Valor Líquido</th>
                                    <th className="px-6 py-5 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-gray-700">
                                {measurements.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-8 py-20 text-center">
                                            <p className="text-sm font-bold text-gray-400">Nenhuma medição realizada para este contrato.</p>
                                        </td>
                                    </tr>
                                ) : measurements.map((m) => (
                                    <tr key={m.id} className="hover:bg-blue-50/20 transition-all group">
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                                                    <BarChart3 className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="text-[12px] font-medium text-blue-500 uppercase tracking-widest mb-0.5">Medição #{m.number}</p>
                                                    <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                                                        {new Date(m.period_start + 'T12:00:00').toLocaleDateString('pt-BR')} a {new Date(m.period_end + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-6 font-normal text-sm">
                                            <span className={`px-2 py-1 rounded-lg text-[12px] font-medium uppercase tracking-widest ${m.status === 'Paga' ? 'bg-green-100 text-green-800' :
                                                m.status === 'Processada' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                                                }`}>
                                                {m.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-6 text-right font-normal text-sm text-gray-700">
                                            R$ {m.total_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-6 text-right font-normal text-sm text-red-600">
                                            - R$ {m.retention_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <p className="text-base font-medium text-gray-900 tracking-tighter">R$ {m.net_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                        </td>
                                        <td className="px-6 py-6 border-l border-gray-50 flex items-center gap-2">
                                            {m.invoice_url && (
                                                <a
                                                    href={m.invoice_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="w-10 h-10 rounded-xl flex items-center justify-center bg-gray-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all shadow-sm border border-emerald-100/50"
                                                    title="Ver Nota Fiscal (NF)"
                                                >
                                                    <FileText className="w-4 h-4" />
                                                </a>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleEditMeasurement(m);
                                                }}
                                                className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-300 hover:text-blue-600 hover:bg-white transition-all shadow-sm group-hover:text-blue-600"
                                            >
                                                <Edit3 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            {measurements.length > 1 && (() => {
                                const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                                const totVal = measurements.reduce((s, m) => s + (m.total_value || 0), 0);
                                const totRet = measurements.reduce((s, m) => s + (m.retention_value || 0), 0);
                                const totNet = measurements.reduce((s, m) => s + (m.net_value || 0), 0);
                                return (
                                    <tfoot>
                                        <tr className="border-t-2 border-gray-200 bg-gray-50/80">
                                            <td className="px-8 py-4 text-[12px] font-medium text-gray-500 uppercase tracking-widest">
                                                Total ({measurements.length} medições)
                                            </td>
                                            <td />
                                            <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                                                R$ {fmt(totVal)}
                                            </td>
                                            <td className="px-6 py-4 text-right text-sm font-medium text-red-600">
                                                - R$ {fmt(totRet)}
                                            </td>
                                            <td className="px-8 py-4 text-right text-base font-medium text-gray-900 tracking-tighter">
                                                R$ {fmt(totNet)}
                                            </td>
                                            <td />
                                        </tr>
                                    </tfoot>
                                );
                            })()}
                        </table>
                    </div>
                </div>
            )}

            {/* Tab: Faturas de Consumo */}
            {activeTab === 'utility_bills' && (
                <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="flex justify-between items-center mb-2">
                        <div>
                            <h3 className="text-xl font-medium text-gray-900 tracking-tight flex items-center gap-3">
                                Histórico de Consumo <span className="text-[12px] font-medium bg-blue-100 text-blue-600 px-3 py-1 rounded-full uppercase tracking-widest">{utilityBills.length} Faturas</span>
                            </h3>
                            <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest mt-1">Gerencie os pagamentos mensais deste contrato recorrente.</p>
                        </div>
                        <button
                            onClick={() => {
                                setEditingUtilityBill(null);
                                setIsUtilityBillModalOpen(true);
                            }}
                            className="flex items-center gap-2 px-8 py-4 bg-gray-900 text-white rounded-2xl hover:bg-blue-600 transition-all shadow-xl shadow-gray-200 font-medium text-[12px] uppercase tracking-widest group"
                        >
                            <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                            Lançar Fatura
                        </button>
                    </div>

                    <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="px-8 py-5 text-[12px] font-medium text-gray-400 uppercase tracking-widest">Mês Ref.</th>
                                    <th className="px-6 py-5 text-[12px] font-medium text-gray-400 uppercase tracking-widest">Status</th>
                                    <th className="px-6 py-5 text-[12px] font-medium text-gray-400 uppercase tracking-widest">Vencimento</th>
                                    <th className="px-6 py-5 text-[12px] font-medium text-gray-400 uppercase tracking-widest text-right">Consumo</th>
                                    <th className="px-8 py-5 text-[12px] font-medium text-gray-400 uppercase tracking-widest text-right">Valor Total</th>
                                    <th className="px-6 py-5 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-gray-700">
                                {utilityBills.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-8 py-20 text-center">
                                            <p className="text-sm font-bold text-gray-400">Nenhuma fatura registrada para este contrato.</p>
                                        </td>
                                    </tr>
                                ) : utilityBills.map((bill) => (
                                    <tr key={bill.id} className="hover:bg-blue-50/20 transition-all group">
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                                                    <BarChart3 className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors uppercase">
                                                        {new Date(bill.reference_month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-6 font-normal text-sm">
                                            <span className={`px-2 py-1 rounded-lg text-[12px] font-medium uppercase tracking-widest ${bill.status === 'Pago' ? 'bg-green-100 text-green-800' :
                                                bill.status === 'Atrasado' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                                                }`}>
                                                {bill.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-6 font-normal text-sm text-gray-700">
                                            {bill.due_date ? new Date(bill.due_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'N/A'}
                                        </td>
                                        <td className="px-6 py-6 text-right font-normal text-sm text-gray-700">
                                            {bill.consumption_metric ? bill.consumption_metric.toLocaleString('pt-BR') : '-'}
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <p className="text-base font-medium text-gray-900 tracking-tighter">R$ {bill.total_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                        </td>
                                        <td className="px-6 py-6 border-l border-gray-50 flex items-center gap-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingUtilityBill(bill);
                                                    setIsUtilityBillModalOpen(true);
                                                }}
                                                className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-300 hover:text-blue-600 hover:bg-white transition-all shadow-sm group-hover:text-blue-600"
                                            >
                                                <Edit3 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modals */}
            {avulsoModalConfig.open && (
                <AvulsoItemModal
                    initial={avulsoModalConfig.initial}
                    onConfirm={(item) => handleConfirmAvulso(item, avulsoModalConfig.editingIndex)}
                    onClose={() => setAvulsoModalConfig({ open: false, editingIndex: null, initial: null })}
                />
            )}

            <BudgetPickerModal
                isOpen={isBudgetPickerOpen}
                onClose={() => setIsBudgetPickerOpen(false)}
                onSelect={handleSelectBudgetItem}
                budget={activeBudget}
            />

            {isMeasurementModalOpen && contract && (
                <ContractMeasurementModal
                    isOpen={isMeasurementModalOpen}
                    onClose={() => {
                        setIsMeasurementModalOpen(false);
                        setEditingMeasurement(null);
                        setEditingMeasurementItems([]);
                    }}
                    contract={contract}
                    items={items}
                    addendums={addendums.filter(a => a.status === 'Aprovado')}
                    onSuccess={loadContractData}
                    initialData={editingMeasurement || undefined}
                    initialItems={editingMeasurementItems}
                />
            )}

            {isAddendumModalOpen && contract && (
                <ContractAddendumModal
                    isOpen={isAddendumModalOpen}
                    onClose={() => setIsAddendumModalOpen(false)}
                    contract={contract}
                    onSuccess={loadContractData}
                />
            )}

            {isUtilityBillModalOpen && contract && (
                <UtilityBillModal
                    isOpen={isUtilityBillModalOpen}
                    onClose={() => {
                        setIsUtilityBillModalOpen(false);
                        setEditingUtilityBill(null);
                    }}
                    contract={contract}
                    onSuccess={loadContractData}
                    initialData={editingUtilityBill || undefined}
                />
            )}

            {selectedHistoryItem && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 md:p-12 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={() => setSelectedHistoryItem(null)} />

                    <div className="bg-white w-full max-w-4xl rounded-[48px] shadow-2xl overflow-hidden relative z-10 flex flex-col max-h-[85vh]">
                        {/* Header */}
                        <div className="bg-[#0B1727] p-8 text-white relative shrink-0">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
                                            <History className="w-5 h-5 text-white" />
                                        </div>
                                        <div>
                                            <p className="text-[12px] font-medium text-blue-400 uppercase tracking-[0.2em]">Rastreabilidade de Item</p>
                                            <h2 className="text-2xl font-medium tracking-tight uppercase leading-none">{selectedHistoryItem.description}</h2>
                                        </div>
                                    </div>
                                    <p className="text-gray-400 font-medium text-xs mt-2">ID: {selectedHistoryItem.id}</p>
                                </div>
                                <button
                                    onClick={() => setSelectedHistoryItem(null)}
                                    className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-gray-400 hover:text-white border border-white/10"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="grid grid-cols-3 gap-6 mt-8 p-4 bg-white/5 rounded-2xl border border-white/10">
                                <div>
                                    <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest mb-1">Total Contratado</p>
                                    <p className="text-lg font-medium">{selectedHistoryItem.quantity.toLocaleString()} {selectedHistoryItem.unit}</p>
                                </div>
                                <div>
                                    <p className="text-[12px] font-medium text-blue-400 uppercase tracking-widest mb-1">Total Medido</p>
                                    <p className="text-lg font-medium text-blue-400">
                                        {itemHistory.reduce((acc, h) => acc + h.item.quantity_executed, 0).toLocaleString()} {selectedHistoryItem.unit}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[12px] font-medium text-emerald-400 uppercase tracking-widest mb-1">Saldo Remanescente</p>
                                    <p className="text-lg font-medium text-emerald-400">
                                        {(selectedHistoryItem.quantity - itemHistory.reduce((acc, h) => acc + h.item.quantity_executed, 0)).toLocaleString()} {selectedHistoryItem.unit}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto p-8 bg-gray-50">
                            <div className="space-y-4">
                                {itemHistory.length === 0 ? (
                                    <div className="text-center py-20">
                                        <History className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                                        <p className="text-gray-400 font-bold">Nenhuma medição encontrada para este item.</p>
                                    </div>
                                ) : itemHistory.map((h, idx) => (
                                    <div key={h.measurement.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex justify-between items-center group hover:border-blue-200 transition-all">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-medium text-[12px]">
                                                #{h.measurement.number}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-gray-900 tracking-tight">
                                                    Executado: <span className="text-blue-600">{h.item.quantity_executed.toLocaleString()} {selectedHistoryItem.unit}</span>
                                                </p>
                                                <div className="flex items-center gap-3 text-[12px] text-gray-400 font-medium">
                                                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(h.measurement.measurement_date).toLocaleDateString('pt-BR')}</span>
                                                    <span>Alocado: R$ {h.item.value_executed.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-3">
                                            {h.item.attachment_urls && h.item.attachment_urls.length > 0 ? (
                                                <div className="flex flex-wrap gap-3">
                                                    {h.item.attachment_urls.map((url, idx) => (
                                                        <div key={idx} className="flex items-center gap-2 bg-gray-50 p-2 rounded-2xl border border-gray-100 group/item">
                                                            {url.match(/\.(mp4|webm|ogg)$/i) ? (
                                                                <div className="relative group/vid">
                                                                    <video
                                                                        src={url}
                                                                        className="w-16 h-12 object-cover rounded-lg border border-gray-100"
                                                                    />
                                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover/vid:opacity-100 transition-opacity rounded-lg">
                                                                        <Video className="w-3 h-3 text-white" />
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <img
                                                                    src={url}
                                                                    className="w-16 h-12 object-cover rounded-lg border border-gray-100 hover:scale-110 transition-transform cursor-pointer"
                                                                    onClick={() => window.open(url, '_blank')}
                                                                    alt="Medição"
                                                                />
                                                            )}

                                                            <a
                                                                href={url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-xl text-[12px] font-medium uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                                            >
                                                                {url.match(/\.(mp4|webm|ogg)$/i) ? <Video className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                                                                Ver
                                                            </a>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-[12px] font-medium text-gray-300 uppercase italic">Sem anexo</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-8 bg-white border-t border-gray-100 shrink-0 text-center">
                            <button
                                onClick={() => setSelectedHistoryItem(null)}
                                className="px-10 py-3 bg-gray-900 text-white rounded-2xl font-medium text-[12px] uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl shadow-gray-200"
                            >
                                Fechar Histórico
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Notification toast */}
            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] max-w-sm px-6 py-4 rounded-2xl shadow-2xl font-medium text-sm animate-in fade-in slide-in-from-bottom-4 duration-300 flex items-center gap-3 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' :
                    notification.type === 'error' ? 'bg-red-600 text-white' :
                    'bg-gray-900 text-white'
                }`}>
                    {notification.message}
                </div>
            )}

            {/* Inline confirm dialog */}
            {pendingConfirm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-[32px] shadow-2xl p-8 max-w-md w-full space-y-6 border border-gray-100 animate-in zoom-in-95 duration-200">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-amber-100 rounded-2xl shrink-0">
                                <AlertCircle className="w-6 h-6 text-amber-600" />
                            </div>
                            <p className="text-sm font-medium text-gray-700 leading-relaxed">{pendingConfirm.message}</p>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setPendingConfirm(null)}
                                className="px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium text-[12px] uppercase tracking-widest hover:bg-gray-200 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={pendingConfirm.onConfirm}
                                className="px-6 py-3 bg-red-600 text-white rounded-xl font-medium text-[12px] uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-200"
                            >
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isTemplateModalOpen && renderTemplateModal()}

            {/* Modal de Reajuste */}
            {reajusteModal && contract && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-[32px] shadow-2xl p-8 max-w-sm w-full space-y-5 border border-gray-100">
                        <div>
                            <h3 className="text-base font-semibold text-gray-900">Aplicar Reajuste</h3>
                            <p className="text-[12px] text-gray-400 mt-1">Índice: <span className="text-blue-600 font-semibold uppercase">{contract.reajuste_index}</span></p>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Índice Base (data de referência)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={reajusteBase}
                                    onChange={e => setReajusteBase(e.target.value)}
                                    placeholder="ex: 2850.00"
                                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Índice Atual (hoje)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={reajusteAtual}
                                    onChange={e => setReajusteAtual(e.target.value)}
                                    placeholder="ex: 3010.00"
                                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            {reajusteBase && reajusteAtual && parseFloat(reajusteBase) > 0 && parseFloat(reajusteAtual) > 0 && (
                                <div className="p-3 bg-blue-50 rounded-xl text-[12px] text-blue-700">
                                    Fator: {(parseFloat(reajusteAtual) / parseFloat(reajusteBase)).toFixed(5)} ·
                                    Novo valor: R$ {(contract.current_value * parseFloat(reajusteAtual) / parseFloat(reajusteBase)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </div>
                            )}
                            <div>
                                <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Observação (opcional)</label>
                                <input
                                    type="text"
                                    value={reajusteNotes}
                                    onChange={e => setReajusteNotes(e.target.value)}
                                    placeholder="ex: INCC-M Janeiro/2027"
                                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setReajusteModal(false); setReajusteBase(''); setReajusteAtual(''); setReajusteNotes(''); }}
                                className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleApplyReajuste}
                                disabled={applyingReajuste}
                                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                                {applyingReajuste ? 'Aplicando…' : 'Aplicar Reajuste'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── UnitManagerModal ─────────────────────────────────────────────────────────
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
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                        {units.map((unit, i) => (
                            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                                {editingIdx === i ? (
                                    <input autoFocus type="text" value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleEditSave()} className="flex-1 text-sm font-bold border border-blue-300 rounded-lg px-2 py-0.5 outline-none focus:ring-2 focus:ring-blue-400" />
                                ) : (
                                    <span className="flex-1 text-sm font-bold text-gray-800">{unit}</span>
                                )}
                                {editingIdx === i ? (
                                    <button onClick={handleEditSave} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-all"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                                ) : (
                                    <button onClick={() => { setEditingIdx(i); setEditVal(unit); }} className="p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"><Pencil className="w-3.5 h-3.5" /></button>
                                )}
                                <button onClick={() => setUnits(prev => prev.filter((_, j) => j !== i))} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="px-6 pb-6 flex justify-end">
                    <button onClick={handleClose} className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-black transition-all">Concluído</button>
                </div>
            </div>
        </div>
    );
};

// ─── AvulsoItemModal ──────────────────────────────────────────────────────────
interface AvulsoItemModalProps {
    initial: AvulsoItem | null;
    onConfirm: (item: AvulsoItem) => void;
    onClose: () => void;
}

const AvulsoItemModal: React.FC<AvulsoItemModalProps> = ({ initial, onConfirm, onClose }) => {
    const isEditing = initial !== null;
    const [form, setForm] = React.useState<AvulsoItem>(initial ?? AVULSO_EMPTY);
    const [priceDigits, setPriceDigits] = React.useState(() => initial ? toCurrencyDigits(initial.unitPrice) : '0');
    const [units, setUnits] = React.useState<string[]>(loadUnits);
    const [showUnitManager, setShowUnitManager] = React.useState(false);
    const [pickerOpen, setPickerOpen] = React.useState(false);
    const [formError, setFormError] = React.useState<string | null>(null);
    const [saveToBase, setSaveToBase] = React.useState(false);
    const [databases, setDatabases] = React.useState<CustomDatabase[]>([]);
    const [selectedDatabaseId, setSelectedDatabaseId] = React.useState<string>('');
    const [savingToBase, setSavingToBase] = React.useState(false);

    React.useEffect(() => {
        if (saveToBase && databases.length === 0) {
            customDatabaseService.listDatabases().then(dbs => {
                setDatabases(dbs);
                if (dbs.length === 1) setSelectedDatabaseId(dbs[0].id);
            });
        }
    }, [saveToBase]);

    const handlePickerSelect = (item: SinapiItem) => {
        const price = item.price || 0;
        setForm({ code: item.code, description: item.description, unit: item.unit, quantity: 1, unitPrice: price });
        setPriceDigits(toCurrencyDigits(price));
        setPickerOpen(false);
    };

    const handleConfirm = async () => {
        if (!form.description.trim()) { setFormError('Descrição obrigatória.'); return; }
        if (!form.unit.trim()) { setFormError('Unidade obrigatória.'); return; }
        if (form.quantity <= 0) { setFormError('Quantidade deve ser maior que zero.'); return; }
        if (saveToBase && !selectedDatabaseId) { setFormError('Selecione uma base de dados para salvar.'); return; }
        setFormError(null);

        if (saveToBase && selectedDatabaseId) {
            setSavingToBase(true);
            try {
                await customDatabaseService.saveItem({
                    code: form.code || `AVULSO-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
                    description: form.description,
                    unit: form.unit,
                    price: form.unitPrice,
                    type: SinapiType.SERVICE,
                    category: 'Própria',
                    database_id: selectedDatabaseId,
                });
            } catch (e) {
                console.error('Erro ao salvar na base própria:', e);
            } finally {
                setSavingToBase(false);
            }
        }

        onConfirm({ ...form });
    };

    const totalItem = form.quantity * form.unitPrice;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-8 py-6 bg-orange-50 border-b border-orange-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-black text-gray-900">{isEditing ? 'Editar Item Avulso' : 'Adicionar Item Avulso'}</h2>
                        <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mt-0.5">Item não vinculado ao orçamento</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-orange-100 rounded-xl transition-all text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-8 space-y-5">
                    {/* Database picker button */}
                    <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        className="w-full flex items-center justify-center gap-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 rounded-xl py-3 text-sm font-black uppercase tracking-wider transition-all"
                    >
                        <Search className="w-4 h-4" />
                        Buscar na base de dados (SINAPI / Própria)
                    </button>
                    <p className="text-[10px] text-gray-400 -mt-3">Ou preencha os campos abaixo manualmente.</p>

                    <div className="h-px bg-gray-100" />

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Código <span className="text-gray-300 font-normal normal-case">(opcional)</span></label>
                            <input
                                type="text"
                                value={form.code}
                                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                                placeholder="Ex: 00001"
                                className="w-full rounded-xl border border-gray-200 p-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Unidade *</label>
                            <div className="flex gap-2">
                                <select
                                    value={units.includes(form.unit) ? form.unit : form.unit ? '__custom__' : ''}
                                    onChange={e => { if (e.target.value !== '__custom__') setForm(f => ({ ...f, unit: e.target.value })); }}
                                    className="flex-1 rounded-xl border border-gray-200 p-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none bg-white"
                                >
                                    <option value="">Selecione...</option>
                                    {units.map(u => <option key={u} value={u}>{u}</option>)}
                                    {form.unit && !units.includes(form.unit) && <option value="__custom__">{form.unit}</option>}
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
                                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
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
                                onChange={e => setForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                                onFocus={e => e.target.select()}
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
                                    onChange={e => {
                                        const digits = (e.target.value.replace(/\D/g, '') || '').replace(/^0+/, '') || '0';
                                        setPriceDigits(digits);
                                        setForm(f => ({ ...f, unitPrice: fromCurrencyDigits(digits) }));
                                    }}
                                    className="w-full pl-9 rounded-xl border border-gray-200 p-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none text-right font-bold"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Salvar na base própria */}
                    <div className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50">
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={saveToBase}
                                onChange={e => setSaveToBase(e.target.checked)}
                                className="w-4 h-4 rounded accent-orange-500 cursor-pointer"
                            />
                            <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Salvar na base de dados própria</span>
                        </label>
                        {saveToBase && (
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Base de dados *</label>
                                {databases.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic">Carregando bases...</p>
                                ) : (
                                    <select
                                        value={selectedDatabaseId}
                                        onChange={e => setSelectedDatabaseId(e.target.value)}
                                        className="w-full rounded-xl border border-gray-200 p-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none bg-white"
                                    >
                                        <option value="">Selecione uma base...</option>
                                        {databases.map(db => (
                                            <option key={db.id} value={db.id}>{db.name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        )}
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
                                R$ {totalItem.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                        disabled={savingToBase}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-black transition-all shadow-lg shadow-orange-500/20"
                    >
                        {isEditing ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        {savingToBase ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Adicionar Item'}
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
                subtitle="Selecione um item da base de dados para adicionar ao contrato."
                zIndex={210}
            />
        </div>
    );
};
// ─────────────────────────────────────────────────────────────────────────────

// ─── SignaturePanel ───────────────────────────────────────────────────────────
interface SignaturePanelProps {
    contract: Contract;
    onSend: (signers: { name: string; email: string; phone?: string }[]) => Promise<void>;
    onRefreshStatus: () => Promise<void>;
}

const SIGNATURE_STATUS_LABEL: Record<string, string> = {
    PENDING: 'Pendente', SENT: 'Enviado — Aguardando assinatura',
    SIGNED: 'Assinado', EXPIRED: 'Expirado', CANCELLED: 'Cancelado',
};
const SIGNATURE_STATUS_COLOR: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-700',
    SENT: 'bg-blue-100 text-blue-700',
    SIGNED: 'bg-emerald-100 text-emerald-700',
    EXPIRED: 'bg-red-100 text-red-600',
    CANCELLED: 'bg-gray-100 text-gray-500',
};

const SignaturePanel: React.FC<SignaturePanelProps> = ({ contract, onSend, onRefreshStatus }) => {
    const [showForm, setShowForm] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [signers, setSigners] = React.useState([{ name: '', email: '', phone: '' }]);

    const hasSig = !!contract.signature_status;
    const isSigned = contract.signature_status === 'SIGNED';

    const addSigner = () => setSigners(s => [...s, { name: '', email: '', phone: '' }]);
    const removeSigner = (i: number) => setSigners(s => s.filter((_, idx) => idx !== i));
    const updateSigner = (i: number, field: string, value: string) =>
        setSigners(s => s.map((sg, idx) => idx === i ? { ...sg, [field]: value } : sg));

    const handleSend = async () => {
        const valid = signers.every(s => s.name.trim() && s.email.trim());
        if (!valid) return;
        setBusy(true);
        try {
            await onSend(signers.filter(s => s.name && s.email).map(s => ({
                name: s.name, email: s.email, phone: s.phone || undefined,
            })));
            setShowForm(false);
        } finally { setBusy(false); }
    };

    if (isSigned) return (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="flex-1">
                <p className="text-[12px] font-semibold text-emerald-700 uppercase tracking-wide">Contrato Assinado Eletronicamente</p>
                {contract.signature_completed_at && (
                    <p className="text-[11px] text-emerald-600 mt-0.5">
                        {new Date(contract.signature_completed_at).toLocaleString('pt-BR')}
                    </p>
                )}
            </div>
        </div>
    );

    return (
        <div className="space-y-3 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between">
                <p className="text-[12px] font-medium text-gray-500 uppercase tracking-wide">Assinatura Eletrônica</p>
                {hasSig && (
                    <button onClick={() => { setBusy(true); onRefreshStatus().finally(() => setBusy(false)); }} disabled={busy}
                        className="text-[11px] text-blue-600 hover:underline disabled:opacity-50">
                        {busy ? 'Atualizando…' : '↻ Atualizar status'}
                    </button>
                )}
            </div>

            {hasSig && contract.signature_status && (
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${SIGNATURE_STATUS_COLOR[contract.signature_status] ?? ''}`}>
                    {SIGNATURE_STATUS_LABEL[contract.signature_status] ?? contract.signature_status}
                </div>
            )}

            {contract.signature_url && contract.signature_status === 'SENT' && (
                <a href={contract.signature_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[12px] text-blue-600 hover:underline">
                    <ExternalLink size={12} /> Link de assinatura
                </a>
            )}

            {!hasSig && !showForm && (
                <button onClick={() => setShowForm(true)}
                    className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                    <Send size={14} /> Enviar para Assinatura (ZapSign)
                </button>
            )}

            {showForm && (
                <div className="space-y-3 p-4 bg-gray-50 rounded-2xl">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Signatários</p>
                    {signers.map((s, i) => (
                        <div key={i} className="grid grid-cols-3 gap-2 items-end">
                            <input value={s.name} onChange={e => updateSigner(i, 'name', e.target.value)}
                                placeholder="Nome *" className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            <input value={s.email} onChange={e => updateSigner(i, 'email', e.target.value)}
                                placeholder="E-mail *" type="email" className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            <div className="flex gap-1">
                                <input value={s.phone} onChange={e => updateSigner(i, 'phone', e.target.value)}
                                    placeholder="WhatsApp" className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                {signers.length > 1 && (
                                    <button onClick={() => removeSigner(i)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    <button onClick={addSigner} className="text-[12px] text-blue-600 hover:underline">+ Adicionar signatário</button>
                    <div className="flex gap-2 pt-1">
                        <button onClick={() => setShowForm(false)} className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium">Cancelar</button>
                        <button onClick={handleSend} disabled={busy || !signers.every(s => s.name && s.email)}
                            className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                            {busy ? 'Enviando…' : 'Enviar'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── ApprovalWorkflowCard ─────────────────────────────────────────────────────
interface ApprovalWorkflowCardProps {
    contract: Contract;
    onSubmit: () => Promise<void>;
    onApprove: (level: 1 | 2, notes?: string) => Promise<void>;
    onReject: (reason: string) => Promise<void>;
}

const ApprovalWorkflowCard: React.FC<ApprovalWorkflowCardProps> = ({ contract, onSubmit, onApprove, onReject }) => {
    const [busy, setBusy] = React.useState(false);
    const [rejectReason, setRejectReason] = React.useState('');
    const [approveNotes, setApproveNotes] = React.useState('');
    const [showRejectInput, setShowRejectInput] = React.useState(false);
    const [showApproveInput, setShowApproveInput] = React.useState(false);

    const status = contract.approval_status ?? 'RASCUNHO';
    const chain = contract.approval_chain ?? [];
    const required = contract.approval_required_levels ?? 1;
    const approvedLevels = chain.filter(s => s.action === 'APROVADO').map(s => s.level);
    const nextLevel = (approvedLevels.includes(1) ? 2 : 1) as 1 | 2;
    const needsLevel2 = required === 2 && !approvedLevels.includes(2) && approvedLevels.includes(1);

    const act = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

    const STATUS_COLOR: Record<string, string> = {
        RASCUNHO: 'bg-gray-100 text-gray-600',
        PENDENTE: 'bg-amber-100 text-amber-700',
        APROVADO: 'bg-emerald-100 text-emerald-700',
        REJEITADO: 'bg-red-100 text-red-700',
    };

    return (
        <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-[12px] font-medium text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Workflow de Aprovação
                </h4>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[status] ?? STATUS_COLOR.RASCUNHO}`}>
                    {status}
                </span>
            </div>

            {/* Cadeia de aprovação */}
            {chain.length > 0 && (
                <div className="space-y-2">
                    {chain.map((step, i) => (
                        <div key={i} className={`flex items-start gap-3 p-3 rounded-xl text-sm ${step.action === 'APROVADO' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                            {step.action === 'APROVADO'
                                ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                : <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-800 text-[12px]">
                                    {step.role} — <span className={step.action === 'APROVADO' ? 'text-emerald-700' : 'text-red-700'}>{step.action}</span>
                                </p>
                                <p className="text-[11px] text-gray-400">{step.approved_by} · {new Date(step.approved_at).toLocaleDateString('pt-BR')}</p>
                                {step.notes && <p className="text-[11px] text-gray-500 italic mt-0.5">"{step.notes}"</p>}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Ações */}
            {status === 'PENDENTE' && (
                <div className="space-y-3 pt-1">
                    {showApproveInput ? (
                        <div className="space-y-2">
                            <input
                                type="text"
                                placeholder="Observação (opcional)"
                                value={approveNotes}
                                onChange={e => setApproveNotes(e.target.value)}
                                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            <div className="flex gap-2">
                                <button onClick={() => setShowApproveInput(false)} className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium">
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => act(() => onApprove(nextLevel, approveNotes || undefined).then(() => { setShowApproveInput(false); setApproveNotes(''); }))}
                                    disabled={busy}
                                    className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {busy ? 'Aprovando…' : `Aprovar (Nível ${nextLevel})`}
                                </button>
                            </div>
                        </div>
                    ) : showRejectInput ? (
                        <div className="space-y-2">
                            <input
                                type="text"
                                placeholder="Motivo da rejeição *"
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                            />
                            <div className="flex gap-2">
                                <button onClick={() => setShowRejectInput(false)} className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium">
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => { if (!rejectReason.trim()) return; act(() => onReject(rejectReason.trim()).then(() => { setShowRejectInput(false); setRejectReason(''); })); }}
                                    disabled={busy || !rejectReason.trim()}
                                    className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                                >
                                    {busy ? 'Rejeitando…' : 'Rejeitar'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowApproveInput(true)}
                                className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700"
                            >
                                {needsLevel2 ? 'Aprovar — Nível 2' : 'Aprovar'}
                            </button>
                            <button
                                onClick={() => setShowRejectInput(true)}
                                className="flex-1 py-2 bg-red-100 text-red-700 rounded-xl text-sm font-medium hover:bg-red-200"
                            >
                                Rejeitar
                            </button>
                        </div>
                    )}
                </div>
            )}

            {status === 'RASCUNHO' && (
                <button
                    onClick={() => act(onSubmit)}
                    disabled={busy}
                    className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                    {busy ? 'Enviando…' : 'Enviar para Aprovação'}
                </button>
            )}

            {status === 'APROVADO' && (
                <p className="text-[12px] text-emerald-600 font-medium text-center">Contrato aprovado e ativo.</p>
            )}
            {status === 'REJEITADO' && (
                <p className="text-[12px] text-red-600 font-medium text-center">Contrato rejeitado — retornado para rascunho para edição.</p>
            )}
        </div>
    );
};

export default ContractDetailView;
