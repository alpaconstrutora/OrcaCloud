import React, { useEffect } from 'react';
import { BudgetEntry, ProjectSettings, SinapiItem, Organization } from '../types';
import { exportService } from '../services/exportService';
import { sinapiService } from '../services/sinapiService';
import { projectService } from '../services/projectService';
import { FileDown, FileText, Printer, ChevronDown, ChevronRight, Share2, Loader2, Building2, Layers, Search, ClipboardList, Box, Database } from 'lucide-react';

interface ReportViewerProps {
    budget: BudgetEntry[];
    settings: ProjectSettings;
    organizations: Organization[]; // New prop
    onUpdateBudget?: (newBudget: BudgetEntry[]) => void;
    onLoadProject?: (id: string, targetView?: string) => void;
    currentProjectId?: string | null;
    organizationId?: string;
}

const ReportViewer: React.FC<ReportViewerProps> = ({ budget, settings, organizations = [], onUpdateBudget, onLoadProject, currentProjectId, organizationId }) => {
    const [reportType, setReportType] = React.useState<'ANALYTIC' | 'SYNTHETIC' | 'INPUTS' | 'INPUTS_ANALYTIC'>('ANALYTIC');
    const [detailLevel, setDetailLevel] = React.useState<'GROUP' | 'PHASE' | 'SUBPHASE' | 'ITEM'>('ITEM');
    const [auxiliaryItems, setAuxiliaryItems] = React.useState<Map<string, SinapiItem>>(new Map());
    const [isLoadingInsumos, setIsLoadingInsumos] = React.useState(false);
    const [projects, setProjects] = React.useState<{ id: string, name: string }[]>([]);
    const [isLoadingProjects, setIsLoadingProjects] = React.useState(false);
    const [selectedNature, setSelectedNature] = React.useState<string>('ALL');
    const [showNatureBreakdown, setShowNatureBreakdown] = React.useState(false);

    // Default to the first organization if available
    const [selectedOrganizationId, setSelectedOrganizationId] = React.useState<string | 'NONE'>(
        organizations.length > 0 ? organizations[0].id : 'NONE'
    );

    // Fetch projects list
    useEffect(() => {
        let cancelled = false;
        const fetchProjects = async () => {
            setIsLoadingProjects(true);
            try {
                const data = await projectService.listProjects();
                if (!cancelled) setProjects(data.map(p => ({ id: p.id!, name: p.name })));
            } catch (error) {
                console.error("Error fetching projects:", error);
            } finally {
                if (!cancelled) setIsLoadingProjects(false);
            }
        };
        fetchProjects();
        return () => { cancelled = true; };
    }, []);

    // Update selected org if organizations list changes (e.g. first load)
    useEffect(() => {
        if (selectedOrganizationId === 'NONE' && organizations.length > 0) {
            setSelectedOrganizationId(organizations[0].id);
        }
    }, [organizations]);

    const selectedOrganization = selectedOrganizationId === 'NONE'
        ? null
        : organizations.find(o => o.id === selectedOrganizationId) || null;

    // Effect to recursively fetch missing compositions for Insumos report
    React.useEffect(() => {
        if (reportType !== 'INPUTS' && reportType !== 'INPUTS_ANALYTIC' && !showNatureBreakdown) return;
        let cancelled = false;
        const loadAuxiliaryItems = async () => {
            setIsLoadingInsumos(true);
            const resolvedCodes = new Set<string>();
            const itemsToResolve = new Set<string>();

            // Initialize with items from budget that are compositions
            // Initialize with all children from budget compositions to ensure we have prices
            budget.forEach(entry => {
                entry.sinapiItem.composition?.forEach(comp => {
                    // We want to resolve EVERYTHING to guarantee authoritative prices
                    itemsToResolve.add(comp.code);
                });
            });

            // If we already have some items in state, mark them as resolved so we don't fetch again
            // (Unless we want to ensure freshness, but sticking to cache is better for perf)
            auxiliaryItems.forEach((_, code) => {
                if (itemsToResolve.has(code)) {
                    itemsToResolve.delete(code);
                }
                resolvedCodes.add(code);
            });

            let currentMap = new Map(auxiliaryItems);
            let safety = 0;

            while (itemsToResolve.size > 0 && safety < 10) {
                safety++;
                const batch = Array.from(itemsToResolve);
                itemsToResolve.clear();

                if (batch.length === 0) break;

                try {
                    // Pass current project state and charge mode to resolve correct prices
                    // Use settings.location as state (UF) and settings.socialChargesMode
                    const fetched = await sinapiService.getItemsByCodes(
                        batch,
                        settings.location,
                        settings.socialChargesMode
                    );

                    fetched.forEach(item => {
                        const existing = currentMap.get(item.code);
                        // Only update if:
                        // 1. Item not in map
                        // 2. Existing item has 0 price and new item has price > 0
                        // 3. New item is generally "better" (optional, but price is key here)
                        if (!existing || (existing.price === 0 && item.price > 0)) {
                            currentMap.set(item.code, item);
                        }

                        resolvedCodes.add(item.code);

                        // Scan children to ensure we have their details (including price)
                        item.composition?.forEach(child => {
                            // We want to fetch EVERYTHING to ensure we have prices
                            if (!resolvedCodes.has(child.code) && !currentMap.has(child.code)) {
                                itemsToResolve.add(child.code);
                            }
                        });
                    });
                } catch (error) {
                    console.error("Error batch fetching compositions:", error);
                    break;
                }
            }

            if (!cancelled) {
                setAuxiliaryItems(currentMap);
                setIsLoadingInsumos(false);
            }
        };

        loadAuxiliaryItems();
        return () => { cancelled = true; };
    }, [reportType, budget, showNatureBreakdown]); // Re-run if budget changes, type changes, or breakdown is toggled

    const totalDirectCost = budget.reduce((acc, item) => acc + (item.quantity * (item.sinapiItem?.price || 0)), 0);
    const totalGlobal = budget.reduce((acc, item) => acc + (item.quantity * (item.sinapiItem?.price || 0) * (1 + (item.bdi ?? (settings.bdi || 0)) / 100)), 0);
    const totalBDI = totalGlobal - totalDirectCost;

    const handleDownloadPDF = async () => {
        const typeForExport = reportType === 'INPUTS_ANALYTIC' ? 'INPUTS' : reportType;
        await exportService.generatePDF(
            budget,
            settings,
            {
                fileName: `Orcamento_${reportType}`,
                organization: selectedOrganization,
                showNatureBreakdown: showNatureBreakdown,
                auxiliaryItems: auxiliaryItems
            },
            typeForExport as any
        );
    };

    const handleDownloadExcel = () => {
        const typeForExport = reportType === 'INPUTS_ANALYTIC' ? 'INPUTS' : reportType;
        exportService.generateExcel(
            budget,
            settings,
            {
                fileName: `Orcamento_${reportType}`,
                organization: selectedOrganization,
                showNatureBreakdown: showNatureBreakdown,
                auxiliaryItems: auxiliaryItems
            },
            typeForExport as any
        );
    };

    // Helper to remove leading WBS codes (e.g., "01.02. ") from labels
    const cleanLabel = (label: string) => {
        return label.replace(/^\d+(\.\d+)*\.\s*/, '');
    };

    // Base calculation for a list of items
    const calculateItemsTotal = (items: BudgetEntry[]) => {
        return items.reduce((acc, item) => {
            const price = item.sinapiItem?.price || 0;
            const quantity = item.quantity || 0;
            const bdi = item.bdi ?? (settings.bdi || 0);
            return acc + (quantity * price * (1 + bdi / 100));
        }, 0);
    };

    // 1. Soma dos itens da subetapa
    const calculateSubPhaseTotal = (groupName: string, phaseName: string, subPhaseName: string) => {
        const items = budget.filter(b => b.group === groupName && b.phase === phaseName && b.subPhase === subPhaseName);
        return calculateItemsTotal(items);
    };

    // 2. Soma das subetapas da etapa
    const calculatePhaseTotal = (groupName: string, phaseObj: { name: string, subPhases: string[] }) => {
        if (!phaseObj || !phaseObj.subPhases) return 0;
        return (phaseObj.subPhases || []).reduce((acc, subPhaseName) => {
            return acc + calculateSubPhaseTotal(groupName, phaseObj.name, subPhaseName);
        }, 0);
    };

    // 3. Soma das etapas do grupo
    const calculateGroupTotal = (groupObj: { name: string, phases: { name: string, subPhases: string[] }[] }) => {
        if (!groupObj || !groupObj.phases) return 0;
        return (groupObj.phases || []).reduce((acc, phaseObj) => {
            return acc + calculatePhaseTotal(groupObj.name, phaseObj);
        }, 0);
    };
    // 4. Calculate Insumos (Inputs) Aggregation with Recursion
    const calculateInsumos = (scopeItems: BudgetEntry[]) => {
        const insumosMap = new Map<string, {
            code: string;
            description: string;
            unit: string;
            price: number;
            type: string;
            quantity: number;
            total: number;
            locations: string[];
        }>();

        // Recursive function to traverse items
        const traverse = (item: { code: string, description: string, unit: string, price: number, type: string, composition?: any[] } | null | undefined, quantityMultiplier: number, path: string[]) => {
            if (!item) return;

            // Check if it's a Composition that needs explosion
            let composition = item.composition;
            const itemType = (item.type || '') as string;
            const isComposition = itemType === 'COMPOSITION' || itemType === 'COMP' || itemType === 'SERVICE';

            // If composition is missing or empty, check if we have it in auxiliary items
            if ((!composition || composition.length === 0) && isComposition) {
                const aux = auxiliaryItems.get(item.code);
                if (aux) {
                    composition = aux.composition;
                }
            }

            // Decide whether to recurse or add to list
            if (isComposition && composition && composition.length > 0) {
                // Recurse into children
                composition.forEach((comp: any) => {
                    traverse({
                        code: comp.code,
                        description: comp.description,
                        unit: comp.unit,
                        price: comp.price,
                        type: comp.type,
                        // If the child is an item in a list, it doesn't have its own composition property usually,
                        // unless we looked it up. The lookup happens in the NEXT recursion step if type is COMPOSITION.
                        composition: undefined
                    }, quantityMultiplier * comp.quantity, [...path, item.code]);
                });
            } else {
                // Base Case: It's an INPUT or an unresolvable COMPOSITION (treat as input)
                const totalQty = quantityMultiplier;

                // Try to get authoritative item (with price) from auxiliaryItems
                const authItem = auxiliaryItems.get(item.code);
                const finalPrice = authItem ? authItem.price : item.price;

                const existing = insumosMap.get(item.code);
                const currentPathStr = path.length > 0 ? path.join(' > ') : 'Direto';

                if (existing) {
                    existing.quantity += totalQty;
                    existing.total += totalQty * finalPrice;
                    if (!existing.locations.includes(currentPathStr)) {
                        existing.locations.push(currentPathStr);
                    }
                } else {
                    insumosMap.set(item.code, {
                        code: item.code,
                        description: authItem ? authItem.description : item.description, // Also use authoritative description if available
                        unit: authItem ? authItem.unit : item.unit,
                        price: finalPrice,
                        type: item.type === 'INS' ? 'INPUT' : (item.type === 'COMP' ? 'COMPOSITION' : (item.type === 'SERVICE' ? 'SERVICE' : item.type)),
                        quantity: totalQty,
                        total: totalQty * finalPrice,
                        locations: [currentPathStr]
                    });
                }
            }
        };

        // Start traversal from scope items
        scopeItems.forEach(budgetEntry => {
            const item = budgetEntry.sinapiItem;
            if (item) {
                // Traverse the top level item
                traverse(item, budgetEntry.quantity, []);
            }
        });

        return Array.from(insumosMap.values()).sort((a, b) => a.description.localeCompare(b.description));
    };

    const getNatureBreakdown = (entry: BudgetEntry) => {
        const breakdown = { material: 0, labor: 0, equipment: 0, other: 0 };

        const traverse = (item: any, quantity: number) => {
            if (!item) return;

            const itemType = (item.type || '') as string;
            const isComposition = itemType === 'COMPOSITION' || itemType === 'COMP' || itemType === 'SERVICE';
            let composition = item.composition;

            if ((!composition || composition.length === 0) && isComposition) {
                const aux = auxiliaryItems.get(item.code);
                if (aux) composition = aux.composition;
            }

            if (isComposition && composition && composition.length > 0) {
                composition.forEach((comp: any) => {
                    traverse({
                        code: comp.code,
                        description: comp.description,
                        unit: comp.unit,
                        price: comp.price,
                        type: comp.type,
                        nature: comp.nature
                    }, quantity * comp.quantity);
                });
            } else {
                const authItem = auxiliaryItems.get(item.code);
                const nature = authItem?.nature || item.nature;
                const price = authItem ? authItem.price : (item.price || 0);
                const bdiFactor = 1 + (entry.bdi ?? (settings.bdi || 0)) / 100;
                const total = price * quantity * bdiFactor;

                if (nature === 'Material') breakdown.material += total;
                else if (nature === 'Mão de Obra') breakdown.labor += total;
                else if (nature === 'Equipamento') breakdown.equipment += total;
                else breakdown.other += total;
            }
        };

        if (entry.sinapiItem) {
            traverse(entry.sinapiItem, entry.quantity);
        }
        return breakdown;
    };

    const calculateSubPhaseNatureTotal = (groupName: string, phaseName: string, subPhaseName: string) => {
        const total = { labor: 0, material: 0, equipment: 0 };
        budget
            .filter(item => item.group === groupName && item.phase === phaseName && item.subPhase === subPhaseName)
            .forEach(item => {
                const breakdown = getNatureBreakdown(item);
                total.labor += breakdown.labor;
                total.material += breakdown.material;
                total.equipment += breakdown.equipment;
            });
        return total;
    };

    const calculatePhaseNatureTotal = (groupName: string, phaseName: string) => {
        const total = { labor: 0, material: 0, equipment: 0 };
        budget
            .filter(item => item.group === groupName && item.phase === phaseName)
            .forEach(item => {
                const breakdown = getNatureBreakdown(item);
                total.labor += breakdown.labor;
                total.material += breakdown.material;
                total.equipment += breakdown.equipment;
            });
        return total;
    };

    const calculateGroupNatureTotal = (groupName: string) => {
        const total = { labor: 0, material: 0, equipment: 0 };
        budget
            .filter(item => item.group === groupName)
            .forEach(item => {
                const breakdown = getNatureBreakdown(item);
                total.labor += breakdown.labor;
                total.material += breakdown.material;
                total.equipment += breakdown.equipment;
            });
        return total;
    };

    const insumosSource = calculateInsumos(budget);
    const insumosGlobal = selectedNature === 'ALL'
        ? insumosSource
        : insumosSource.filter(item => {
            const aux = auxiliaryItems.get(item.code);
            const nature = aux?.nature;
            return nature === selectedNature;
        });
    const totalInsumos = insumosGlobal.reduce((acc, item) => acc + item.total, 0);


    return (
        <div className="h-full flex flex-col space-y-4">

            {/* Header / Toolbar */}
            <div className="flex flex-col gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Relatórios e Exportação</h1>
                        <p className="text-sm text-gray-500">Visualize e exporte o orçamento final do projeto.</p>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Group: Arquivos / Exportação */}
                        <div className="flex items-center gap-2 p-1.5 rounded-lg border border-dashed border-gray-200">
                            <button
                                onClick={handleDownloadPDF}
                                className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 hover:-translate-y-0.5 active:translate-y-0 transition-all font-bold text-xs shadow-md shadow-red-100"
                            >
                                <FileText className="w-4 h-4" />
                                DOWNLOAD PDF
                            </button>
                            <button
                                onClick={handleDownloadExcel}
                                className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 hover:-translate-y-0.5 active:translate-y-0 transition-all font-bold text-xs shadow-md shadow-emerald-100"
                            >
                                <FileDown className="w-4 h-4" />
                                EXCEL
                            </button>
                        </div>
                    </div>
                </div>

                <div className="h-px bg-gray-100 w-full" />

                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        {/* Group: Seletores de Contexto */}
                        <div className="flex flex-wrap items-center gap-2 bg-gray-50/80 p-1.5 rounded-xl border border-gray-100">
                            {/* Project Selector */}
                            <div className="flex items-center gap-2 px-2 py-1 bg-white rounded-lg border border-gray-200 shadow-sm">
                                <span className="text-[10px] font-black text-gray-400 uppercase flex items-center gap-1.5">
                                    <Building2 className="w-3.5 h-3.5 text-blue-500" />
                                    Obra:
                                </span>
                                <select
                                    value={currentProjectId || ''}
                                    onChange={(e) => onLoadProject?.(e.target.value, 'reports')}
                                    className="bg-transparent text-sm rounded-md py-1 pr-1 outline-none cursor-pointer text-gray-700 font-bold focus:text-blue-600 transition-colors max-w-[180px]"
                                    disabled={isLoadingProjects}
                                >
                                    {!currentProjectId && <option value="">Selecione...</option>}
                                    {projects.map(project => (
                                        <option key={project.id} value={project.id}>
                                            {project.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Organization Selector */}
                            <div className="flex items-center gap-2 px-2 py-1 bg-white rounded-lg border border-gray-200 shadow-sm">
                                <span className="text-[10px] font-black text-gray-400 uppercase flex items-center gap-1.5">
                                    <Layers className="w-3.5 h-3.5 text-indigo-500" />
                                    Org:
                                </span>
                                <select
                                    value={selectedOrganizationId}
                                    onChange={(e) => setSelectedOrganizationId(e.target.value)}
                                    className="bg-transparent text-sm rounded-md py-1 pr-1 outline-none cursor-pointer text-gray-700 font-bold focus:text-indigo-600 transition-colors max-w-[150px]"
                                >
                                    <option value="NONE">Sem Organização</option>
                                    {organizations.map(org => (
                                        <option key={org.id} value={org.id}>{org.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Detail Level Selector */}
                            {(reportType === 'ANALYTIC' || reportType === 'INPUTS_ANALYTIC') && detailLevel && (
                                <div className="flex items-center gap-2 px-2 py-1 bg-white rounded-lg border border-gray-200 shadow-sm">
                                    <span className="text-[10px] font-black text-gray-400 uppercase flex items-center gap-1.5 whitespace-nowrap">
                                        <Search className="w-3.5 h-3.5 text-amber-500" />
                                        Detalhar Até:
                                    </span>
                                    <select
                                        value={detailLevel}
                                        onChange={(e) => setDetailLevel(e.target.value as any)}
                                        className="bg-transparent text-sm rounded-md py-1 pr-1 outline-none cursor-pointer text-gray-700 font-bold focus:text-amber-600 transition-colors"
                                    >
                                        <option value="GROUP">Grupos</option>
                                        <option value="PHASE">Etapas</option>
                                        <option value="SUBPHASE">Subetapas</option>
                                        <option value="ITEM">Itens (Completo)</option>
                                    </select>
                                </div>
                            )}

                            {/* Breakdown Toggle */}
                            {reportType === 'ANALYTIC' && (
                                <button
                                    onClick={() => setShowNatureBreakdown(!showNatureBreakdown)}
                                    className={`flex items-center gap-2 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${showNatureBreakdown ? 'bg-blue-600 text-white border-blue-700 shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                                >
                                    <Layers className="w-3.5 h-3.5" />
                                    Composição de Custos
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Report Type Switcher (Tabs) */}
                    <div className="flex bg-gray-100/80 p-1 rounded-xl border border-gray-200 shadow-inner">
                        <button
                            onClick={() => setReportType('ANALYTIC')}
                            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${reportType === 'ANALYTIC' ? 'bg-white shadow-md text-blue-600 scale-[1.02]' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                        >
                            <ClipboardList className="w-4 h-4" />
                            Orçamento
                        </button>

                        <button
                            onClick={() => setReportType('INPUTS_ANALYTIC')}
                            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${reportType === 'INPUTS_ANALYTIC' ? 'bg-white shadow-md text-blue-600 scale-[1.02]' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                        >
                            <Box className="w-4 h-4" />
                            Insumos (EAP)
                        </button>

                        <button
                            onClick={() => setReportType('INPUTS')}
                            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${reportType === 'INPUTS' ? 'bg-white shadow-md text-blue-600 scale-[1.02]' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                        >
                            <Database className="w-4 h-4" />
                            Insumos (Global)
                        </button>
                    </div>

                    {reportType === 'INPUTS' && (
                        <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
                            {[
                                { id: 'ALL', label: 'Todos', icon: Database },
                                { id: 'Material', label: 'Materiais', icon: Box },
                                { id: 'Mão de Obra', label: 'Mão de Obra', icon: Building2 },
                                { id: 'Equipamento', label: 'Equipamentos', icon: Layers }
                            ].map((nature) => (
                                <button
                                    key={nature.id}
                                    onClick={() => setSelectedNature(nature.id)}
                                    className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${selectedNature === nature.id ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                                >
                                    <nature.icon className="w-3 h-3" />
                                    {nature.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Report Preview (Paper Metaphor) */}
            <div className="flex-1 bg-gray-200 overflow-y-auto p-8 flex justify-center items-start">
                <div className={`bg-white shadow-2xl w-full ${showNatureBreakdown && reportType === 'ANALYTIC' ? 'max-w-[297mm]' : 'max-w-[210mm]'} min-h-[297mm] h-auto p-[15mm] flex flex-col relative transition-all duration-300`}>

                    {/* Report Header */}
                    <div className="border-b-2 border-gray-800 pb-4 mb-6">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-4">
                                {selectedOrganization && selectedOrganization.logoUrl && (
                                    <img
                                        src={selectedOrganization.logoUrl}
                                        alt={selectedOrganization.name}
                                        className="h-16 w-auto object-contain max-w-[120px]"
                                    />
                                )}
                                <div>
                                    {selectedOrganization ? (
                                        <>
                                            <h2 className="text-xl font-extrabold text-gray-800 uppercase tracking-tight">{selectedOrganization.name}</h2>
                                            <div className="text-xs text-gray-500 mt-1 font-medium space-y-0.5">
                                                {selectedOrganization.cnpj && <p>CNPJ: {selectedOrganization.cnpj}</p>}
                                                <p>{[
                                                    selectedOrganization.address?.city,
                                                    selectedOrganization.address?.state
                                                ].filter(Boolean).join(' - ')}</p>
                                                <p>{[selectedOrganization.email, selectedOrganization.phone].filter(Boolean).join(' | ')}</p>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <h2 className="text-3xl font-extrabold text-gray-800 uppercase tracking-tight">{settings.name}</h2>
                                            <p className="text-gray-500 font-medium mt-1">{settings.location} | {new Date().toLocaleDateString('pt-BR')}</p>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="text-right">
                                <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                                    {(reportType === 'INPUTS' || reportType === 'INPUTS_ANALYTIC') && selectedNature !== 'ALL'
                                        ? `Custo Total: ${selectedNature}`
                                        : 'Custo Total Global'}
                                </div>
                                <div className="text-2xl font-black text-gray-900 bg-gray-100 px-3 py-1 rounded">
                                    R$ {((reportType === 'INPUTS' || reportType === 'INPUTS_ANALYTIC') && selectedNature !== 'ALL'
                                        ? totalInsumos
                                        : totalGlobal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Project & Technical Details */}
                    <div className="grid grid-cols-2 gap-8 text-xs text-gray-600 mb-8 border-b border-gray-100 pb-6">
                        {/* Column 1: Dados da Obra */}
                        <div className="space-y-1">
                            <h4 className="font-bold text-gray-900 uppercase mb-2 border-b border-gray-200 pb-1 flex items-center gap-2">
                                Dados da Obra
                            </h4>
                            <div className="grid grid-cols-[80px_1fr] gap-1">
                                <span className="font-semibold text-gray-500">Cliente:</span>
                                <span className="uppercase">{settings.client || '—'}</span>

                                <span className="font-semibold text-gray-500">Endereço:</span>
                                <span className="uppercase">
                                    {[
                                        settings.street,
                                        settings.number,
                                        settings.neighborhood,
                                        settings.city,
                                        settings.state
                                    ].filter(Boolean).join(', ') || '—'}
                                </span>
                            </div>
                        </div>

                        {/* Column 2: Configurações Técnicas */}
                        <div className="space-y-1">
                            <h4 className="font-bold text-gray-900 uppercase mb-2 border-b border-gray-200 pb-1">
                                Parâmetros Técnicos
                            </h4>
                            <div className="grid grid-cols-[100px_1fr] gap-1">
                                <span className="font-semibold text-gray-500">Base Referência:</span>
                                <span>{settings.database}</span>

                                <span className="font-semibold text-gray-500">Data da Base:</span>
                                <span>{settings.referenceMonth}</span>

                                <span className="font-semibold text-gray-500">Estado:</span>
                                <span className="uppercase">{settings.location || '—'}</span>

                                <span className="font-semibold text-gray-500">Encargos:</span>
                                <span>{settings.socialChargesMode}</span>

                                <span className="font-semibold text-gray-500">BDI (Global):</span>
                                <span>{settings.bdi || 0}%</span>

                                <span className="font-semibold text-gray-500">Leis Sociais (LS):</span>
                                <span>{settings.ls || 0}%</span>
                            </div>
                        </div>
                    </div>



                    {/* Report Content - Table Structure */}
                    <div>

                        {reportType === 'INPUTS' ? (
                            isLoadingInsumos ? (
                                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                                    <Loader2 className="w-10 h-10 animate-spin mb-4 text-blue-500" />
                                    <p>Calculando insumos e explodindo composições...</p>
                                </div>
                            ) : (
                                <table className="w-full text-xs text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-800 text-white uppercase tracking-wider text-[10px] items-center">
                                            <th className="py-2 px-2 w-20 font-bold border-r border-gray-700">Tipo</th>
                                            <th className="py-2 px-2 w-20 font-bold border-r border-gray-700">Código</th>
                                            <th className="py-2 px-2 font-bold border-r border-gray-700">Descrição do Insumo</th>
                                            <th className="py-2 px-2 w-12 text-center font-bold border-r border-gray-700">Unid.</th>
                                            <th className="py-2 px-2 w-16 text-center font-bold border-r border-gray-700">Qtd. Total</th>
                                            <th className="py-2 px-2 w-20 text-right font-bold border-r border-gray-700">Unitário</th>
                                            <th className="py-2 px-2 w-24 text-right font-bold">Custo Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {insumosGlobal.map((item, index) => (
                                            <tr key={index} className="hover:bg-gray-50 text-[10px]">
                                                <td className="py-1.5 px-2 border-r border-gray-100 text-gray-500">{item.type}</td>
                                                <td className="py-1.5 px-2 border-r border-gray-100 font-mono text-gray-500">{item.code}</td>
                                                <td className="py-1.5 px-2 border-r border-gray-100 text-gray-800 font-medium">
                                                    {item.description}
                                                    {item.locations && item.locations.length > 0 && (
                                                        <div className="text-[9px] text-gray-400 mt-0.5 max-w-[300px] truncate" title={`Origem: ${item.locations.join('\n')}`}>
                                                            Origem: {item.locations[0]}{item.locations.length > 1 ? ` (+${item.locations.length - 1})` : ''}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="py-1.5 px-2 border-r border-gray-100 text-center text-gray-500">{item.unit}</td>
                                                <td className="py-1.5 px-2 border-r border-gray-100 text-center font-bold text-gray-700">{item.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</td>
                                                <td className="py-1.5 px-2 border-r border-gray-100 text-right text-gray-600">{item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                                <td className="py-1.5 px-2 text-right font-bold text-gray-900">{item.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                            </tr>
                                        ))}
                                        <tr className="bg-gray-100 font-bold text-gray-900 text-xs border-t-2 border-gray-200">
                                            <td colSpan={6} className="py-3 px-2 text-right uppercase">Total de Insumos (Sem BDI)</td>
                                            <td className="py-3 px-2 text-right">{totalInsumos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            )
                        ) : (
                            <table className="w-full text-xs text-left border-collapse">
                                <thead>
                                    <tr className="bg-blue-600 text-white uppercase tracking-wider text-[10px] items-center">
                                        <th className={`py-2 px-2 ${showNatureBreakdown ? 'w-12' : 'w-16'} font-bold border-r border-blue-500`}>Item</th>
                                        <th className="py-2 px-2 w-12 text-center font-bold border-r border-blue-500">Base</th>
                                        <th className="py-2 px-2 w-16 font-bold border-r border-blue-500">Código</th>
                                        <th className="py-2 px-2 font-bold border-r border-blue-500">Descrição</th>
                                        <th className="py-2 px-2 w-12 text-center font-bold border-r border-blue-500">Unid.</th>
                                        <th className="py-2 px-2 w-12 text-center font-bold border-r border-blue-500">Qtd.</th>
                                        <th className={`py-2 px-2 ${showNatureBreakdown ? 'w-16' : 'w-20'} text-right font-bold border-r border-blue-500`}>Unitário</th>
                                        <th className={`py-2 px-2 ${showNatureBreakdown ? 'w-20' : 'w-24'} text-right font-bold`}>Total</th>
                                        {showNatureBreakdown && (
                                            <>
                                                <th className="py-2 px-2 w-18 text-right font-bold border-r border-blue-800 bg-blue-700 text-[9px] border-l-2 border-l-white/20 whitespace-nowrap">Mão de Obra</th>
                                                <th className="py-2 px-2 w-18 text-right font-bold border-r border-blue-800 bg-blue-700 text-[9px] whitespace-nowrap">Material</th>
                                                <th className="py-2 px-2 w-18 text-right font-bold border-r border-blue-800 bg-blue-700 text-[9px] whitespace-nowrap">Equip.</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {(settings.wbs || []).map((group, gIndex) => {
                                        const groupItems = budget.filter(b => b.group === group.name);

                                        // Generate Group index string for Item column (e.g., "01")
                                        const groupItemStr = String(gIndex + 1).padStart(2, '0');

                                        return (
                                            <React.Fragment key={group.id}>
                                                {/* GROUP ROW */}
                                                <tr className="bg-blue-800 text-white font-bold uppercase text-[11px] break-inside-avoid print:bg-blue-800 print:text-white">
                                                    <td className="py-2 px-2 border-r border-blue-700">{groupItemStr}</td>
                                                    <td className="py-2 px-2 border-r border-blue-700"></td>
                                                    <td className="py-2 px-2 border-r border-blue-700"></td>
                                                    <td colSpan={4} className="py-2 px-2 border-r border-blue-700">{cleanLabel(group.name)}</td>
                                                    <td className="py-2 px-2 text-right">{calculateGroupTotal(group).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                                    {showNatureBreakdown && (() => {
                                                        const nat = calculateGroupNatureTotal(group.name);
                                                        return (
                                                            <>
                                                                <td className="py-2 px-2 text-right text-blue-200 border-r border-blue-700 font-mono text-[9px] border-l-2 border-l-blue-700">{nat.labor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                                <td className="py-2 px-2 text-right text-blue-200 border-r border-blue-700 font-mono text-[9px]">{nat.material.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                                <td className="py-2 px-2 text-right text-blue-200 font-mono text-[9px]">{nat.equipment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                            </>
                                                        );
                                                    })()}
                                                </tr>

                                                {detailLevel !== 'GROUP' && (group.phases || []).map((phase, pIndex) => {
                                                    const phaseItems = budget.filter(b => b.group === group.name && b.phase === phase.name);
                                                    const hasItemsRecursive = phaseItems.length > 0 || (phase.subPhases || []).some(sp => budget.some(b => b.phase === phase.name && b.subPhase === sp));

                                                    // Generate Phase index string (e.g., "01.01")
                                                    const phaseItemStr = `${groupItemStr}.${String(pIndex + 1).padStart(2, '0')}`;

                                                    return (
                                                        <React.Fragment key={phase.id}>
                                                            {/* PHASE ROW */}
                                                            <tr className="bg-gray-100 font-bold text-gray-800 uppercase text-[10px] break-inside-avoid">
                                                                <td className="py-1.5 px-2 border-r border-gray-200">{phaseItemStr}</td>
                                                                <td className="py-1.5 px-2 border-r border-gray-200"></td>
                                                                <td className="py-1.5 px-2 border-r border-gray-200"></td>
                                                                <td colSpan={4} className="py-1.5 px-2 border-r border-gray-200">
                                                                    <div className="flex justify-between items-center">
                                                                        <span>{cleanLabel(phase.name)}</span>
                                                                        {!hasItemsRecursive && <span className="text-gray-400 font-normal text-[9px] normal-case italic">(Sem itens)</span>}
                                                                    </div>
                                                                </td>
                                                                <td className="py-1.5 px-2 text-right">{calculatePhaseTotal(group.name, phase).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                                                {showNatureBreakdown && (() => {
                                                                    const nat = calculatePhaseNatureTotal(group.name, phase.name);
                                                                    return (
                                                                        <>
                                                                            <td className="py-1.5 px-2 text-right text-gray-500 border-r border-gray-200 font-mono text-[9px] border-l-2 border-l-gray-300">{nat.labor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                                            <td className="py-1.5 px-2 text-right text-gray-500 border-r border-gray-200 font-mono text-[9px]">{nat.material.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                                            <td className="py-1.5 px-2 text-right text-gray-500 font-mono text-[9px]">{nat.equipment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                                        </>
                                                                    );
                                                                })()}
                                                            </tr>

                                                            {detailLevel !== 'PHASE' && (phase.subPhases || []).map((subPhase, spIndex) => {
                                                                const items = budget.filter(b => b.phase === phase.name && b.subPhase === subPhase);

                                                                // Generate Subphase index string (e.g., "01.01.01")
                                                                const subPhaseItemStr = `${phaseItemStr}.${String(spIndex + 1).padStart(2, '0')}`;

                                                                return (
                                                                    <React.Fragment key={subPhase}>
                                                                        {/* SUBPHASE ROW */}
                                                                        <tr className="text-[10px] font-bold text-gray-500 uppercase break-inside-avoid border-b border-gray-100">
                                                                            <td className="py-1 px-2 border-r border-gray-100">{subPhaseItemStr}</td>
                                                                            <td className="py-1 px-2 border-r border-gray-100"></td>
                                                                            <td className="py-1 px-2 border-r border-gray-100"></td>
                                                                            <td colSpan={4} className="py-1 px-2 border-r border-gray-100">
                                                                                <div className="flex justify-between items-center">
                                                                                    <span>{cleanLabel(subPhase)}</span>
                                                                                    {items.length === 0 && <span className="font-normal text-[9px] text-gray-300 italic">Vazio</span>}
                                                                                </div>
                                                                            </td>
                                                                            <td className="py-1 px-2 text-right">{calculateSubPhaseTotal(group.name, phase.name, subPhase).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                                                            {showNatureBreakdown && (() => {
                                                                                const nat = calculateSubPhaseNatureTotal(group.name, phase.name, subPhase);
                                                                                return (
                                                                                    <>
                                                                                        <td className="py-1 px-2 text-right text-gray-400 border-r border-gray-100 font-mono text-[9px] border-l-2 border-l-gray-200">{nat.labor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                                                        <td className="py-1 px-2 text-right text-gray-400 border-r border-gray-100 font-mono text-[9px]">{nat.material.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                                                        <td className="py-1 px-2 text-right text-gray-400 font-mono text-[9px]">{nat.equipment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                                                    </>
                                                                                );
                                                                            })()}
                                                                        </tr>

                                                                        {/* ITEMS for ANALYTIC */}
                                                                        {reportType === 'ANALYTIC' && detailLevel === 'ITEM' && items.map((item, itemIndex) => {
                                                                            const breakdown = showNatureBreakdown ? getNatureBreakdown(item) : null;
                                                                            return (
                                                                                <tr key={item.id} className="text-[10px] hover:bg-gray-50 break-inside-avoid">
                                                                                    <td className="py-1 px-2 border-r border-gray-100 text-gray-400 font-mono">
                                                                                        {subPhaseItemStr}.{String(itemIndex + 1).padStart(2, '0')}
                                                                                    </td>
                                                                                    <td className="py-1 px-2 align-top text-center border-r border-gray-100">
                                                                                        <span className={`text-[8px] px-1 rounded font-bold border ${item.sinapiItem?.source === 'Própria' || item.sinapiItem?.isOverride ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                                                                                            {item.sinapiItem?.source === 'Própria' || item.sinapiItem?.isOverride ? 'PRÓP.' : 'SINAPI'}
                                                                                        </span>
                                                                                    </td>
                                                                                    <td className="py-1 px-2 align-top font-mono text-gray-500 border-r border-gray-100">{item.sinapiItem?.code || '---'}</td>
                                                                                    <td className="py-1 px-2 align-top text-gray-800 border-r border-gray-100">{item.sinapiItem?.description || 'Item sem descrição'}</td>
                                                                                    <td className="py-1 px-2 align-top text-center text-gray-500 border-r border-gray-100">{item.sinapiItem?.unit || 'un'}</td>
                                                                                    <td className="py-1 px-2 align-top text-center text-gray-800 border-r border-gray-100 font-mono">{item.quantity}</td>
                                                                                    <td className="py-1 px-2 align-top text-right text-gray-800 border-r border-gray-100 font-mono">{(item.sinapiItem?.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                                                    <td className="py-1 px-2 align-top text-right font-medium text-gray-900">{(item.quantity * (item.sinapiItem?.price || 0) * (1 + (item.bdi ?? (settings.bdi || 0)) / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                                                    {showNatureBreakdown && breakdown && (
                                                                                        <>
                                                                                            <td className="py-1 px-2 align-top text-right text-blue-700 border-r border-gray-100 font-mono italic opacity-90 bg-blue-50/40 font-bold border-l-2 border-l-gray-200">{breakdown.labor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                                                            <td className="py-1 px-2 align-top text-right text-blue-700 border-r border-gray-100 font-mono italic opacity-90 bg-blue-50/40 font-bold">{breakdown.material.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                                                            <td className="py-1 px-2 align-top text-right text-blue-700 border-r border-gray-100 font-mono italic opacity-90 bg-blue-50/40 font-bold">{breakdown.equipment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                                                        </>
                                                                                    )}
                                                                                </tr>
                                                                            );
                                                                        })}

                                                                        {/* INPUTS for INPUTS_ANALYTIC */}
                                                                        {reportType === 'INPUTS_ANALYTIC' && detailLevel === 'ITEM' && items.length > 0 && (() => {
                                                                            const subPhaseInputs = calculateInsumos(items);
                                                                            return subPhaseInputs.map((input, inputIndex) => (
                                                                                <tr key={`${subPhaseItemStr}-input-${input.code}`} className="text-[10px] hover:bg-gray-50 break-inside-avoid">
                                                                                    <td className="py-1 px-2 border-r border-gray-100 text-gray-400 font-mono pl-6">
                                                                                        {subPhaseItemStr}.{String(inputIndex + 1).padStart(2, '0')}
                                                                                    </td>
                                                                                    <td className="py-1 px-2 align-top text-center border-r border-gray-100">
                                                                                        <span className="text-[8px] px-1 rounded font-bold border bg-gray-50 text-gray-600 border-gray-200">
                                                                                            INSUMO
                                                                                        </span>
                                                                                    </td>
                                                                                    <td className="py-1 px-2 align-top font-mono text-gray-500 border-r border-gray-100">{input.code}</td>
                                                                                    <td className="py-1 px-2 align-top text-gray-600 border-r border-gray-100 italic">{input.description}</td>
                                                                                    <td className="py-1 px-2 align-top text-center text-gray-500 border-r border-gray-100">{input.unit}</td>
                                                                                    <td className="py-1 px-2 align-top text-center text-gray-800 border-r border-gray-100">{input.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</td>
                                                                                    <td className="py-1 px-2 align-top text-right text-gray-800 border-r border-gray-100 font-mono">
                                                                                        {input.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                                    </td>
                                                                                    <td className="py-1 px-2 align-top text-right font-medium text-gray-900">
                                                                                        {input.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                                    </td>
                                                                                </tr>
                                                                            ));
                                                                        })()}
                                                                    </React.Fragment>
                                                                );
                                                            })}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div >

                    {/* Report Footer */}
                    < div className="border-t-2 border-gray-200 pt-4 mt-8 flex justify-between text-xs text-gray-400" >
                        <div>
                            <p>BDI Aplicado: {settings.bdi}% ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalBDI)})</p>
                            <p className="text-[10px] mt-1">Gerado via OrçaCloud SaaS em {new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        <div className="text-right">
                            Página 1 de 1
                        </div>
                    </div >

                </div >
            </div >

        </div >
    );
};

export default ReportViewer;
