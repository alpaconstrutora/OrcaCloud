import React, { useState, useMemo, useEffect } from 'react';
import {
    Plus, Trash2, Edit2, X, Search,
    Building2, BarChart as BarChartIcon, AlertTriangle, Users, TrendingUp, CheckCircle,
    ChevronDown, ChevronRight
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { SchedulingEngine } from '../utils/schedulingEngine';
import { ResourceRole, ResourceWorker, ResourceTeam, Organization, ItemScheduleDetails, ResourceAllocation, BudgetEntry } from '../types';

// Local types for capacity histogram data
interface CapacityResourceEntry {
    used: number;
    capacity: number;
    name: string;
    taskIds: Set<string>;
}

interface CapacityDayEntry {
    name: string;
    timestamp: number;
    [resourceId: string]: CapacityResourceEntry | string | number;
}

interface ChartDataEntry {
    name: string;
    [key: string]: string | number;
}

type AllocationStatus = 'CONFIRMED' | 'SUGGESTION' | 'GAP';
type AllocationSource = 'COMPOSITION' | 'MANUAL';

interface SmartAssignment {
    taskId: string;
    taskName: string;
    roleId: string | null | undefined;
    roleName: string;
    allocationId?: string;
    worker?: ResourceWorker;
    suggestion?: ResourceWorker;
    status: AllocationStatus;
    source: AllocationSource;
    compIdx?: number;
    budgetedCost?: number;
}

interface BottleneckEntry {
    name: string;
    over: number;
    used: number;
    capacity: number;
}

interface ProjectResources {
    roles: ResourceRole[];
    workers: ResourceWorker[];
}

interface ResourceManagementProps {
    resources: {
        roles: ResourceRole[];
        workers: ResourceWorker[];
        teams: ResourceTeam[];
    };
    itemSchedules?: ItemScheduleDetails[];
    useWorkingDays?: boolean;
    onUpdateResources: (
        resources: {
            roles: ResourceRole[];
            workers: ResourceWorker[];
            teams: ResourceTeam[];
        },
        updatedItemSchedules?: ItemScheduleDetails[]
    ) => void;
    onLevelResources?: () => void;
    title?: string;
    description?: string;
    organizations?: Organization[];
    localLabel?: string;
    budget?: BudgetEntry[];
}

export const ResourceManagement: React.FC<ResourceManagementProps> = ({
    resources = { roles: [], workers: [], teams: [] },
    itemSchedules = [],
    useWorkingDays = true,
    budget = [],
    onUpdateResources,
    title = "Gestão de Mão de Obra",
    description = "Gerencie funções, trabalhadores e equipes",
    organizations = [],
    localLabel = "Local"
}) => {
    const [activeTab, setActiveTab] = useState<'roles' | 'workers' | 'teams' | 'capacity' | 'allocation'>('roles');
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [capacityScale, setCapacityScale] = useState<'day' | 'week' | 'month'>('week');
    const [selectedResourceId, setSelectedResourceId] = useState<string>('all');
    const [allocationFilter, setAllocationFilter] = useState<'all' | 'thisWeek' | 'next15Days' | 'thisMonth'>('all');

    // --- Capacity Calculation Logic ---
    const capacityData = useMemo(() => {
        if (!itemSchedules || itemSchedules.length === 0) return [];

        const histogram = SchedulingEngine.calculateResourceHistogram(
            itemSchedules,
            useWorkingDays ?? true,
            resources.workers,
            resources.teams
        );

        const resourceLimits = new Map<string, number>();
        resources.roles.forEach(r => {
            const count = resources.workers.filter(w => w.roleId === r.id).length;
            resourceLimits.set(r.id, Math.max(1, count));
        });
        resources.workers.forEach(w => resourceLimits.set(w.id, 1));
        resources.teams.forEach(t => resourceLimits.set(t.id, 1));

        let minDate: Date | null = null;
        let maxDate: Date | null = null;
        itemSchedules.forEach(t => {
            if (t.startDate) {
                const d = new Date(t.startDate);
                if (!minDate || d < minDate) minDate = d;
            }
            if (t.endDate) {
                const d = new Date(t.endDate);
                if (!maxDate || d > maxDate) maxDate = d;
            }
        });

        const histogramDates = Object.keys(histogram).sort();
        const allDates: string[] = [...histogramDates];

        if (allDates.length === 0 && minDate && maxDate) {
            let curr = new Date(minDate);
            const end = new Date(maxDate);
            let dCount = 0;
            while (curr <= end && dCount < 90) {
                allDates.push(curr.toISOString().split('T')[0]);
                curr.setDate(curr.getDate() + 1);
                dCount++;
            }
        }

        if (allDates.length === 0) return [];

        const grouped: Record<string, CapacityDayEntry> = {};
        allDates.forEach(dateStr => {
            const date = new Date(dateStr + 'T12:00:00');
            let key = dateStr;
            if (capacityScale === 'week') {
                const year = date.getFullYear();
                const oneJan = new Date(year, 0, 1);
                const numberOfDays = Math.floor((date.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
                const weekNum = Math.ceil((date.getDay() + 1 + numberOfDays) / 7);
                key = `S${weekNum}/${year}`;
            } else if (capacityScale === 'month') {
                key = `${date.getMonth() + 1}/${date.getFullYear()}`;
            }

            if (!grouped[key]) grouped[key] = { name: key, timestamp: date.getTime() };

            const dayUsage = histogram[dateStr] || {};
            const resourcesToTrack = selectedResourceId === 'all' ? Array.from(resourceLimits.keys()) : [selectedResourceId];

            resourcesToTrack.forEach(resId => {
                const usage = dayUsage[resId] || { total: 0 };
                const limit = resourceLimits.get(resId) || 0;
                if (!grouped[key][resId]) {
                    const resName = resources.roles.find(r => r.id === resId)?.name ||
                                   resources.workers.find(w => w.id === resId)?.name ||
                                   resources.teams.find(t => t.id === resId)?.name || resId;
                    grouped[key][resId] = { used: 0, capacity: limit, name: resName, taskIds: new Set<string>() };
                }
                (grouped[key][resId] as CapacityResourceEntry).used = Math.max((grouped[key][resId] as CapacityResourceEntry).used, usage.total);
                if (usage.taskIds) usage.taskIds.forEach((tid: string) => (grouped[key][resId] as CapacityResourceEntry).taskIds.add(tid));
            });
        });

        return Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp);
    }, [itemSchedules, useWorkingDays, resources, capacityScale, selectedResourceId]);

    // Calcular nomes das séries para o gráfico (Top 10 + Outros)
    const chartSeries = useMemo(() => {
        if (selectedResourceId !== 'all') return ['used'];
        
        const usageTotals = new Map<string, number>();
        capacityData.forEach(day => {
            Object.entries(day).forEach(([k, v]) => {
                if (k !== 'name' && k !== 'timestamp' && typeof v === 'object' && v !== null && 'used' in v) {
                    usageTotals.set(k, (usageTotals.get(k) || 0) + (v as CapacityResourceEntry).used);
                }
            });
        });

        const top10Ids = Array.from(usageTotals.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(x => x[0]);

        const names = top10Ids.map(id => {
            return resources.roles.find(r => r.id === id)?.name ||
                   resources.workers.find(w => w.id === id)?.name ||
                   resources.teams.find(t => t.id === id)?.name || id;
        });

        if (usageTotals.size > 10) names.push('Outros');
        return names;
    }, [capacityData, selectedResourceId, resources]);

    const chartData = useMemo(() => {
        if (selectedResourceId === 'all') {
            const usageTotals = new Map<string, number>();
            capacityData.forEach(day => {
                Object.entries(day).forEach(([k, v]) => {
                    if (k !== 'name' && k !== 'timestamp' && typeof v === 'object' && v !== null && 'used' in v) {
                        usageTotals.set(k, (usageTotals.get(k) || 0) + (v as CapacityResourceEntry).used);
                    }
                });
            });
            const top10Ids = Array.from(usageTotals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(x => x[0]);

            return capacityData.map(d => {
                const entry: ChartDataEntry = { name: d.name as string };
                // Garantir que todas as chaves existam (mesmo com 0) para o Recharts não falhar
                chartSeries.forEach(s => { entry[s] = 0; });
                let othersSum = 0;

                Object.entries(d).forEach(([k, v]) => {
                    if (k !== 'name' && k !== 'timestamp' && typeof v === 'object' && v !== null && 'used' in v) {
                        const resVal = v as CapacityResourceEntry;
                        if (top10Ids.includes(k)) {
                            entry[resVal.name] = resVal.used;
                        } else {
                            othersSum += resVal.used;
                        }
                    }
                });
                if (chartSeries.includes('Outros')) entry['Outros'] = othersSum;
                return entry;
            });
        } else {
            return capacityData.map(d => {
                let used = 0, cap = 0, name = '';
                const resVal = d[selectedResourceId];
                if (resVal && typeof resVal === 'object' && 'used' in resVal) {
                    const rv = resVal as CapacityResourceEntry;
                    used = rv.used; cap = rv.capacity; name = rv.name;
                }
                return { name: d.name as string, used, capacity: cap, resourceName: name };
            });
        }
    }, [capacityData, selectedResourceId, chartSeries]);

    const capacityStats = useMemo(() => {
        let totalUt = 0, utDays = 0, overloadedP = 0;
        const bs: BottleneckEntry[] = [];
        const hiringGaps = new Map<string, { roleName: string; totalHours: number; periods: Set<string> }>();

        capacityData.forEach(day => {
            let dayOver = false, dUsed = 0, dCap = 0;
            Object.entries(day).forEach(([k, v]) => {
                if (k !== 'name' && k !== 'timestamp' && typeof v === 'object' && v !== null && 'used' in v) {
                    const res = v as CapacityResourceEntry;
                    // Somar todos se 'all', senão apenas o selecionado
                    if (selectedResourceId === 'all' || k === selectedResourceId) {
                        dUsed += res.used;
                        dCap += res.capacity;
                        if (res.used > res.capacity) {
                            dayOver = true;
                            bs.push({ name: `${res.name} (${day.name as string})`, over: res.used - res.capacity, used: res.used, capacity: res.capacity });
                        }

                        // Detectar gap de contratação (demanda > capacidade do cargo)
                        if (res.used > res.capacity && resources.roles.some(r => r.id === k)) {
                             const existing = hiringGaps.get(k) || { roleName: res.name, totalHours: 0, periods: new Set() };
                             existing.totalHours += (res.used - res.capacity) * (capacityScale === 'day' ? 1 : capacityScale === 'week' ? 5 : 22);
                             existing.periods.add(day.name as string);
                             hiringGaps.set(k, existing);
                        }
                    }
                }
            });
            if (dCap > 0) { 
                totalUt += (dUsed / dCap); 
                utDays++; 
            }
            if (dayOver) overloadedP++;
        });

        // Alertas de funções sem qualquer colaborador físico (Considerando Composições)
        budget.forEach(budgetItem => {
            const task = itemSchedules.find(s => s.id === budgetItem.id);
            if (!task) return;

            const compositions = budgetItem.sinapiItem?.composition || [];
            const laborNeeds = compositions.filter(c => SchedulingEngine.isLaborItem(c));

            laborNeeds.forEach(comp => {
                const desc = String(comp.description || '').toUpperCase();
                const LABOR_ROLES_KEYWORDS = ['PEDREIRO', 'SERVENTE', 'CARPINTEIRO', 'ARMADOR', 'PINTOR', 'ELETRICISTA', 'ENCANADOR', 'MESTRE', 'ENCARREGADO', 'GESSEIRO', 'TELHADISTA', 'SERRALHEIRO', 'BOMBEIRO', 'AJUDANTE', 'AUXILIAR', 'TEC', 'OPERADOR', 'MOTORISTA', 'MONTADOR', 'OFICIAL'];
                const kw = LABOR_ROLES_KEYWORDS.find(k => desc.includes(k));
                if (!kw) return;

                const role = resources.roles.find(r => r.name.toUpperCase().includes(kw));
                if (role) {
                    const hasPhysicalAssigned = task.allocations?.some(a => {
                        if (a.resourceType === 'WORKER') {
                            const w = resources.workers.find(worker => worker.id === a.resourceId);
                            return w?.roleId === role.id;
                        }
                        return false;
                    });

                    if (!hasPhysicalAssigned) {
                        const gapId = `comp-gap-${role.id}`;
                        const existing = hiringGaps.get(gapId) || { roleName: `Contratar: ${role.name}`, totalHours: 0, periods: new Set() };
                        existing.totalHours += (budgetItem.quantity * comp.quantity);
                        existing.periods.add('Orçamento');
                        hiringGaps.set(gapId, existing);
                    }
                }
            });
        });

        return { 
            bottleneckCount: overloadedP, 
            averageOccupancy: utDays > 0 ? Math.round((totalUt/utDays)*100) : 0, 
            bottlenecks: bs.slice(0, 3),
            hiringAlerts: Array.from(hiringGaps.values()).slice(0, 5)
        };
    }, [capacityData, selectedResourceId, resources, capacityScale, itemSchedules, budget]);

    // --- Smart Suggestion Logic (Budget Based) ---
    const smartAssignments = useMemo(() => {
        if (!itemSchedules?.length) return [];
        const list: SmartAssignment[] = [];
        const allWorkers = resources.workers;
        const LABOR_ROLES_KEYWORDS = [
            'PEDREIRO', 'SERVENTE', 'CARPINTEIRO', 'ARMADOR', 'PINTOR', 
            'ELETRICISTA', 'ENCANADOR', 'MESTRE', 'ENCARREGADO', 'GESSEIRO', 
            'TELHADISTA', 'SERRALHEIRO', 'BOMBEIRO', 'AJUDANTE', 'OFICIAL',
            'TOPOGRAFO', 'APONTADOR', 'ALMOXARIFE', 'VIGIA', 'OPERADOR', 'MOTORISTA', 'MONTADOR'
        ];

        itemSchedules.forEach(taskSchedule => {
            const budgetItem = (budget || []).find(b => b.id === taskSchedule.id);
            const taskName = budgetItem?.sinapiItem?.description || 'Tarefa do Cronograma';
            let foundTechnical = false;

            // 1. Verificar Composition (Mão de Obra Técnica do SINAPI)
            if (budgetItem?.sinapiItem?.composition) {
                const compositions = budgetItem.sinapiItem.composition || [];
                const laborNeeds = compositions.filter(c => SchedulingEngine.isLaborItem(c));

                laborNeeds.forEach(comp => {
                    const desc = String(comp.description || '').toUpperCase();
                    const matchedKeyword = LABOR_ROLES_KEYWORDS.find(k => desc.includes(k));
                    if (!matchedKeyword) return;

                    let systemRole = resources.roles.find(r => r.name.toUpperCase() === matchedKeyword);
                    if (!systemRole) systemRole = resources.roles.find(r => r.name.toUpperCase().includes(matchedKeyword));

                    if (!systemRole) return;
                    foundTechnical = true;

                    const existingPhysical = (taskSchedule.allocations || []).find(a => {
                        if (a.resourceType === 'WORKER') {
                            const w = allWorkers.find(worker => worker.id === a.resourceId);
                            return w?.roleId === systemRole!.id;
                        }
                        return false;
                    });

                    const compAny = comp as unknown as { unit_price?: number; unitPrice?: number };
                    const budgetedCost = compAny.unit_price || compAny.unitPrice || comp.price || 0;

                    if (existingPhysical) {
                        const worker = allWorkers.find(w => w.id === existingPhysical.resourceId);
                        list.push({ taskId: taskSchedule.id, taskName, roleId: systemRole.id, roleName: systemRole.name, allocationId: existingPhysical.id, worker, status: 'CONFIRMED', source: 'COMPOSITION', budgetedCost });
                    } else {
                        const suggestion = allWorkers.find(w => w.roleId === systemRole!.id);
                        list.push({ taskId: taskSchedule.id, taskName, roleId: systemRole!.id, roleName: systemRole!.name, suggestion, status: suggestion ? 'SUGGESTION' : 'GAP', source: 'COMPOSITION', compIdx: comp.quantity, budgetedCost });
                    }
                });
            }

            // 2. Verificar Alocações MANUAIS existentes
            taskSchedule.allocations?.forEach(alloc => {
                const alreadyListed = list.some(l => l.taskId === taskSchedule.id && l.allocationId === alloc.id);
                if (!alreadyListed) {
                    foundTechnical = true;
                    if (alloc.resourceType === 'WORKER') {
                        const worker = allWorkers.find(w => w.id === alloc.resourceId);
                        const role = resources.roles.find(r => r.id === worker?.roleId);
                        list.push({ taskId: taskSchedule.id, taskName, roleId: role?.id, roleName: role?.name || 'Manual', allocationId: alloc.id, worker, status: 'CONFIRMED', source: 'MANUAL' });
                    } else if (alloc.resourceType === 'ROLE') {
                        const role = resources.roles.find(r => r.id === alloc.resourceId);
                        const suggestion = allWorkers.find(w => w.roleId === role?.id);
                        list.push({ taskId: taskSchedule.id, taskName, roleId: role?.id, roleName: role?.name || '', allocationId: alloc.id, suggestion, status: suggestion ? 'SUGGESTION' : 'GAP', source: 'MANUAL' });
                    }
                }
            });

            // 3. FALLBACK: Se for uma tarefa executiva (folha) e não tiver nada, exibir como PENDENTE
            if (!foundTechnical && (taskSchedule.duration || 0) > 0) {
                list.push({ taskId: taskSchedule.id, taskName, roleId: null, roleName: 'A Definir', status: 'GAP', source: 'MANUAL' });
            }
        });

        return list;
    }, [itemSchedules, resources, budget]);

    // --- Aggregated Views (Grouped by Name) ---
    const groupedRoles = useMemo(() => {
        const groups: Record<string, ResourceRole[]> = {};
        resources.roles.forEach(r => {
            const name = r.name.toUpperCase().trim();
            if (!groups[name]) groups[name] = [];
            groups[name].push(r);
        });
        return Object.entries(groups).map(([name, items]) => ({ name, items, id: items[0].id }));
    }, [resources.roles]);

    const filteredAssignments = useMemo(() => {
        if (allocationFilter === 'all') return smartAssignments;

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        let filterEnd = new Date(startOfToday);
        if (allocationFilter === 'thisWeek') {
            const daysToNextMonday = (8 - startOfToday.getDay()) % 7 || 7;
            filterEnd.setDate(startOfToday.getDate() + daysToNextMonday);
        } else if (allocationFilter === 'next15Days') {
            filterEnd.setDate(startOfToday.getDate() + 15);
        } else if (allocationFilter === 'thisMonth') {
            filterEnd = new Date(startOfToday.getFullYear(), startOfToday.getMonth() + 1, 0);
        }

        return smartAssignments.filter(a => {
            const task = itemSchedules.find(t => t.id === a.taskId);
            if (!task?.startDate) return true; // Mostrar sempre tarefas sem data
            
            const taskStart = new Date(task.startDate);
            const taskEnd = task.endDate ? new Date(task.endDate) : taskStart;
            
            // Interseção entre [hoje, filterEnd] e [taskStart, taskEnd]
            return (taskStart <= filterEnd) && (taskEnd >= startOfToday);
        });
    }, [smartAssignments, allocationFilter, itemSchedules]);

    const groupedAssignments = useMemo(() => {
        const groups: Record<string, SmartAssignment[]> = {};
        (filteredAssignments || []).forEach(a => {
            const role = a?.roleName || 'Sem Cargo';
            if (!groups[role]) groups[role] = [];
            groups[role].push(a);
        });
        return groups;
    }, [filteredAssignments]);

    const workerConflicts = useMemo(() => {
        const conflicts: Record<string, string[]> = {}; 
        if (!smartAssignments.length) return conflicts;

        // 1. Vincular datas às alocações confirmadas
        const activeAllocations = smartAssignments
            .filter(a => a.status === 'CONFIRMED' && a.worker)
            .map(a => {
                const task = itemSchedules.find(t => t.id === a.taskId);
                return {
                    ...a,
                    start: task?.startDate ? new Date(task.startDate) : null,
                    end: task?.endDate ? new Date(task.endDate) : null
                };
            })
            .filter(a => a.start && a.end);

        // 2. Detecção de sobreposição por colaborador
        activeAllocations.forEach((main, i) => {
            activeAllocations.forEach((other, j) => {
                if (i === j) return;
                if (main.worker?.id !== other.worker?.id) return;

                // Overlap: (A.Inicio <= B.Fim) && (A.Fim >= B.Inicio)
                const hasOverlap = (main.start! <= other.end!) && (main.end! >= other.start!);
                if (hasOverlap) {
                    if (!conflicts[main.taskId]) conflicts[main.taskId] = [];
                    if (!conflicts[main.taskId].includes(other.taskName)) {
                        conflicts[main.taskId].push(other.taskName);
                    }
                }
            });
        });

        return conflicts;
    }, [smartAssignments, itemSchedules]);

    const handleConfirmSuggestion = (item: SmartAssignment) => {
        if (!item.suggestion) return;
        const newSchedules = itemSchedules.map(task => {
            if (task.id === item.taskId) {
                const currentAllocations = task.allocations || [];
                const newAlloc: ResourceAllocation = {
                    id: crypto.randomUUID(),
                    resourceId: item.suggestion!.id,
                    resourceType: 'WORKER' as const,
                    quantity: 1,
                    hoursPerDay: 8
                };
                
                // Se já existia uma alocação de ROLE para esse projeto, removemos e colocamos o WORKER
                // Se era de composição pura (sem alocação manual prévia), apenas adicionamos
                return {
                    ...task,
                    allocations: item.allocationId 
                        ? currentAllocations.map(a => a.id === item.allocationId ? newAlloc : a)
                        : [...currentAllocations, newAlloc]
                };
            }
            return task;
        });
        onUpdateResources(resources, newSchedules);
    };

    // --- Save Handlers ---
    const handleSaveRole = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data = {
            name: formData.get('name') as string,
            description: formData.get('description') as string,
            costPerHour: parseFloat(formData.get('costPerHour') as string) || 0,
            costPerDay: parseFloat(formData.get('costPerDay') as string) || 0,
            organizationId: formData.get('organizationId') as string || undefined,
        };
        if (editingId) {
            onUpdateResources({ ...resources, roles: resources.roles.map(r => r.id === editingId ? { ...r, ...data } : r) });
        } else {
            onUpdateResources({ ...resources, roles: [...resources.roles, { id: crypto.randomUUID(), ...data, source: localLabel }] });
        }
        setIsAdding(false); setEditingId(null);
    };

    const handleSaveWorker = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data = {
            name: formData.get('name') as string,
            roleId: formData.get('roleId') as string,
            email: formData.get('email') as string || undefined,
            phone: formData.get('phone') as string || undefined,
            organizationId: formData.get('organizationId') as string || undefined,
        };
        if (editingId) {
            onUpdateResources({ ...resources, workers: resources.workers.map(w => w.id === editingId ? { ...w, ...data } : w) });
        } else {
            onUpdateResources({ ...resources, workers: [...resources.workers, { id: crypto.randomUUID(), ...data, source: localLabel }] });
        }
        setIsAdding(false); setEditingId(null);
    };

    const handleSaveTeam = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const mids = Array.from(formData.getAll('memberIds')) as string[];
        const data = { name: formData.get('name') as string, memberIds: mids, organizationId: formData.get('organizationId') as string || undefined };
        if (editingId) {
            onUpdateResources({ ...resources, teams: resources.teams.map(t => t.id === editingId ? { ...t, ...data } : t) });
        } else {
            onUpdateResources({ ...resources, teams: [...resources.teams, { id: crypto.randomUUID(), ...data, source: localLabel }] });
        }
        setIsAdding(false); setEditingId(null);
    };

    const handleDeleteRole = (id: string) => {
        if (!confirm('Excluir função?')) return;
        onUpdateResources({ ...resources, roles: resources.roles.filter(r => r.id !== id) });
    };

    const handleDeleteWorker = (id: string) => {
        if (!confirm('Excluir trabalhador?')) return;
        onUpdateResources({ ...resources, workers: resources.workers.filter(w => w.id !== id) });
    };

    const handleDeleteTeam = (id: string) => {
        if (!confirm('Excluir equipe?')) return;
        onUpdateResources({ ...resources, teams: resources.teams.filter(t => t.id !== id) });
    };

    const handleEditRole = (r: ResourceRole) => { setEditingId(r.id); setIsAdding(true); };
    const handleEditWorker = (w: ResourceWorker) => { setEditingId(w.id); setIsAdding(true); };
    const handleEditTeam = (t: ResourceTeam) => { setEditingId(t.id); setIsAdding(true); };

    // --- Import Modal Logic ---
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [expandedRoles, setExpandedRoles] = useState<Record<string, boolean>>({});

    const toggleAllAssignments = (expanded: boolean) => {
        const nextState: Record<string, boolean> = {};
        Object.keys(groupedAssignments || {}).forEach(name => {
            nextState[name] = expanded;
        });
        setExpandedRoles(nextState);
    };

    const toggleGroup = (roleName: string) => {
        setExpandedRoles(prev => ({
            ...prev,
            [roleName]: !prev[roleName]
        }));
    };

    const handleConfirmImport = (rIds: string[], wIds: string[], tIds: string[], orgId: string) => {
        const selectedOrg = organizations.find(o => o.id === orgId);
        if (!selectedOrg || !selectedOrg.resources) return;

        const rolesToImport = selectedOrg.resources.roles.filter(r => rIds.includes(r.id));
        const workersToImport = selectedOrg.resources.workers.filter(w => wIds.includes(w.id));
        const teamsToImport = selectedOrg.resources.teams?.filter(t => tIds.includes(t.id)) || [];

        const projectRoles = [...resources.roles];
        const roleIdMap = new Map<string, string>();

        // 1. Mapear e preparar cargos explicitamente selecionados
        rolesToImport.forEach(orgRole => {
            const existing = projectRoles.find(r => r.name.toLowerCase() === orgRole.name.toLowerCase());
            if (existing) { 
                roleIdMap.set(orgRole.id, existing.id); 
            } else {
                const newId = crypto.randomUUID();
                projectRoles.push({ ...orgRole, id: newId, source: selectedOrg.name });
                roleIdMap.set(orgRole.id, newId);
            }
        });

        // 2. IMPORTANTE: Garantir que trabalhadores selecionados tenham seus cargos no projeto (Importação Implícita)
        workersToImport.forEach(orgWorker => {
            if (orgWorker.roleId && !roleIdMap.has(orgWorker.roleId)) {
                // Procurar o cargo original na organização
                const orgRole = selectedOrg.resources?.roles.find(r => r.id === orgWorker.roleId);
                if (orgRole) {
                    // Tentar encontrar por nome no projeto (caso já exista mas não tenha sido mapeado)
                    const existingInProject = projectRoles.find(r => r.name.toLowerCase() === orgRole.name.toLowerCase());
                    if (existingInProject) {
                        roleIdMap.set(orgWorker.roleId, existingInProject.id);
                    } else {
                        // Se não existe nem por nome, cria AUTOMATICAMENTE para não deixar o worker órfão
                        const newId = crypto.randomUUID();
                        projectRoles.push({ ...orgRole, id: newId, source: selectedOrg.name });
                        roleIdMap.set(orgWorker.roleId, newId);
                    }
                }
            }
        });

        const projectWorkers = [...resources.workers];
        workersToImport.forEach(orgWorker => {
            const existsInProject = projectWorkers.some(w => w.name.toLowerCase() === orgWorker.name.toLowerCase());
            if (!existsInProject) {
                let targetRoleId = orgWorker.roleId;
                if (roleIdMap.has(orgWorker.roleId)) { 
                    targetRoleId = roleIdMap.get(orgWorker.roleId)!; 
                } else {
                    // Fallback extra por nome caso nada tenha funcionado
                    const orgRole = selectedOrg.resources?.roles.find(r => r.id === orgWorker.roleId);
                    if (orgRole) {
                        const existing = projectRoles.find(r => r.name.toLowerCase() === orgRole.name.toLowerCase());
                        if (existing) { targetRoleId = existing.id; }
                    }
                }
                projectWorkers.push({ ...orgWorker, id: crypto.randomUUID(), roleId: targetRoleId, source: selectedOrg.name });
            }
        });

        const projectTeams = [...resources.teams];
        teamsToImport.forEach(orgTeam => {
            if (!projectTeams.some(t => t.name.toLowerCase() === orgTeam.name.toLowerCase())) {
                projectTeams.push({ ...orgTeam, id: crypto.randomUUID(), source: selectedOrg.name });
            }
        });

        onUpdateResources({ roles: projectRoles, workers: projectWorkers, teams: projectTeams });
        setIsImportModalOpen(false);
    };

    const editingRole = activeTab === 'roles' ? resources.roles.find(r => r.id === editingId) : null;
    const editingWorker = activeTab === 'workers' ? resources.workers.find(w => w.id === editingId) : null;
    const editingTeam = activeTab === 'teams' ? resources.teams.find(t => t.id === editingId) : null;

    return (
        <div className="flex flex-col h-full bg-gray-50/50">
            {/* Header Tabs */}
            <div className="px-6 pt-6 bg-white border-b border-gray-200">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 font-outfit">{title}</h2>
                        <p className="text-sm text-gray-500 mt-1">{description}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {organizations.length > 0 && (
                            <button onClick={() => setIsImportModalOpen(true)} className="flex items-center gap-2 bg-white border border-blue-200 text-blue-600 px-4 py-2 rounded-xl hover:bg-blue-50 transition-all font-bold text-sm">
                                <Building2 className="w-4 h-4" /> Importar da Empresa
                            </button>
                        )}
                        {activeTab !== 'capacity' && (
                            <button onClick={() => { setIsAdding(true); setEditingId(null); }} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-all font-bold text-sm">
                                <Plus className="w-4 h-4" /> Novo {activeTab === 'roles' ? 'Cargo' : activeTab === 'workers' ? 'Trabalhador' : 'Equipe'}
                            </button>
                        )}
                    </div>
                </div>
                
                <div className="flex gap-8">
                    {['roles', 'workers', 'teams', 'capacity', 'allocation'].map(tab => (
                        <button key={tab} onClick={() => { setActiveTab(tab as 'roles' | 'workers' | 'teams' | 'capacity' | 'allocation'); setIsAdding(false); }} className={`pb-4 text-sm font-bold transition-all border-b-2 ${activeTab === tab ? 'text-blue-600 border-blue-600' : 'text-gray-400 border-transparent hover:text-gray-600'}`}>
                            {tab === 'roles' ? 'Funções' : tab === 'workers' ? 'Trabalhadores' : tab === 'teams' ? 'Equipes' : tab === 'capacity' ? 'Capacidade' : 'Alocação'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {isAdding && (
                    <div className="mb-6 bg-white p-6 rounded-3xl border shadow-sm">
                        <form onSubmit={activeTab === 'roles' ? handleSaveRole : activeTab === 'workers' ? handleSaveWorker : handleSaveTeam} className="space-y-4">
                            <input name="name" defaultValue={editingRole?.name || editingWorker?.name || editingTeam?.name || ''} placeholder="Nome" className="w-full p-3 border rounded-xl" required />
                            {activeTab === 'roles' && <input name="costPerHour" type="number" defaultValue={editingRole?.costPerHour} placeholder="Custo por hora" className="w-full p-3 border rounded-xl" />}
                            {activeTab === 'workers' && (
                                <select name="roleId" defaultValue={editingWorker?.roleId} className="w-full p-3 border rounded-xl" required>
                                    <option value="">Selecionar Função</option>
                                    {resources.roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                            )}
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setIsAdding(false)} className="px-6 py-2">Cancelar</button>
                                <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-xl">Salvar</button>
                            </div>
                        </form>
                    </div>
                )}

                {activeTab === 'roles' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {groupedRoles.map(group => (
                            <div key={group.name} className="bg-white p-6 rounded-3xl border border-gray-100 hover:border-blue-300 transition-all shadow-sm flex flex-col group">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h4 className="font-black text-gray-900 text-base">{group.name}</h4>
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {group.items.map(item => (
                                                <span key={item.id} className="text-[9px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-black uppercase tracking-tight">
                                                    {item.description?.includes('Código') ? item.description.split(':').pop()?.trim() : (item.source || 'Local')}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    {group.items.length === 1 && (
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleEditRole(group.items[0])} className="p-1 hover:bg-gray-100 rounded-lg"><Edit2 className="w-4 h-4 text-gray-400" /></button>
                                            <button onClick={() => handleDeleteRole(group.items[0].id)} className="p-1 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" /></button>
                                        </div>
                                    )}
                                </div>
                                {group.items.length > 1 && (
                                    <div className="mt-auto pt-4 border-t border-gray-50 flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                        <span>{group.items.length} variações SINAPI</span>
                                        <button onClick={() => { setActiveTab('roles'); /* Futuro: Abrir modal de detalhamento */ }} className="text-blue-600 hover:underline">Ver Todos</button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'workers' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {resources.workers.map(w => (
                            <div key={w.id} className="bg-white p-5 rounded-2xl border hover:border-blue-300 transition-all flex justify-between items-start shadow-sm">
                                <div>
                                    <h4 className="font-bold">{w.name}</h4>
                                    <p className="text-xs text-blue-600 font-medium">{resources.roles.find(r => r.id === w.roleId)?.name}</p>
                                    <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold uppercase mt-2 inline-block">{w.source || 'Local'}</span>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleEditWorker(w)}><Edit2 className="w-4 h-4 text-gray-400" /></button>
                                    <button onClick={() => handleDeleteWorker(w.id)}><Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'teams' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {resources.teams.map(team => (
                            <div key={team.id} className="bg-white p-5 rounded-2xl border hover:border-blue-300 transition-all flex justify-between items-start shadow-sm">
                                <div>
                                    <h4 className="font-bold">{team.name}</h4>
                                    <p className="text-xs text-gray-500 font-medium">
                                        {team.memberIds.length} {team.memberIds.length === 1 ? 'membro' : 'membros'}
                                    </p>
                                    <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold uppercase mt-2 inline-block">{team.source || 'Local'}</span>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleEditTeam(team)} className="p-1 hover:bg-gray-100 rounded-lg transition-all"><Edit2 className="w-4 h-4 text-gray-400" /></button>
                                    <button onClick={() => handleDeleteTeam(team.id)} className="p-1 hover:bg-gray-100 rounded-lg transition-all"><Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" /></button>
                                </div>
                            </div>
                        ))}
                        {resources.teams.length === 0 && (
                            <div className="col-span-full py-12 flex flex-col items-center justify-center text-gray-400 bg-white rounded-3xl border border-dashed">
                                <Users className="w-12 h-12 mb-4 opacity-10" />
                                <p className="text-sm font-bold">Nenhuma equipe criada.</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'capacity' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-white p-6 rounded-3xl border shadow-sm">
                                <span className="text-[10px] font-black uppercase text-gray-400 block mb-1">Ocupação Média</span>
                                <div className="flex items-end gap-2">
                                    <span className="text-3xl font-black text-gray-900 font-outfit">{capacityStats.averageOccupancy}%</span>
                                    <span className="text-xs text-gray-500 mb-1.5 font-bold">do total</span>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-3xl border shadow-sm">
                                <span className="text-[10px] font-black uppercase text-gray-400 block mb-1">Gargalos</span>
                                <div className="flex items-end gap-2">
                                    <span className={`text-3xl font-black font-outfit ${capacityStats.bottleneckCount > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                        {capacityStats.bottleneckCount}
                                    </span>
                                    <span className="text-xs text-gray-500 mb-1.5 font-bold">períodos</span>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-3xl border shadow-sm">
                                <span className="text-[10px] font-black uppercase text-gray-400 block mb-1">Escala</span>
                                <select 
                                    value={capacityScale} 
                                    onChange={(e) => setCapacityScale(e.target.value as 'day' | 'week' | 'month')}
                                    className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-lg outline-none cursor-pointer"
                                >
                                    <option value="day">Diário</option>
                                    <option value="week">Semanal</option>
                                    <option value="month">Mensal</option>
                                </select>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-3xl border shadow-sm">
                            <div className="flex items-center justify-between mb-8">
                                <h4 className="text-sm font-black uppercase text-gray-900 flex items-center gap-2">
                                    <BarChartIcon className="w-4 h-4 text-blue-600" /> Histograma de Recursos
                                </h4>
                                <select 
                                    value={selectedResourceId} 
                                    onChange={(e) => setSelectedResourceId(e.target.value)}
                                    className="text-xs font-bold text-gray-500 border rounded-lg px-2 py-1 outline-none"
                                >
                                    <option value="all">Visão Geral</option>
                                    {resources.roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    {resources.workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                            </div>
                            <div className="h-80 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                                        <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                                        <YAxis fontSize={10} axisLine={false} tickLine={false} />
                                        <Tooltip 
                                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                            cursor={{ fill: '#f3f4f6', radius: 4 }}
                                        />
                                        <Legend iconType="circle" />
                                        {selectedResourceId === 'all' ? (
                                            chartSeries.map((res, i) => (
                                                <Bar 
                                                    key={res} 
                                                    dataKey={res} 
                                                    stackId="a" 
                                                    fill={res === 'Outros' ? '#94a3b8' : `hsl(${i * 35}, 70%, 50%)`} 
                                                    radius={[2, 2, 0, 0]} 
                                                />
                                            ))
                                        ) : (
                                            <Bar dataKey="used" fill="#3b82f6" name="Uso" radius={[4, 4, 0, 0]} />
                                        )}
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {capacityStats.bottlenecks.length > 0 && (
                            <div className="bg-red-50 p-6 rounded-3xl border border-red-100">
                                <h5 className="text-xs font-black uppercase text-red-600 flex items-center gap-2 mb-4">
                                    <AlertTriangle className="w-4 h-4" /> Alertas Críticos de Gargalo
                                </h5>
                                <div className="space-y-2">
                                    {capacityStats.bottlenecks.map((b, i) => (
                                        <div key={i} className="flex items-center justify-between bg-white/50 p-3 rounded-xl border border-red-200/50">
                                            <span className="text-sm font-bold text-red-900">{b.name}</span>
                                            <span className="text-sm font-black text-red-600">+{b.over.toFixed(1)} excedente</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {capacityStats.hiringAlerts.length > 0 && (
                            <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 mt-6">
                                <h5 className="text-xs font-black uppercase text-blue-600 flex items-center gap-2 mb-4">
                                    <Users className="w-4 h-4" /> Recomendação de Contratação / Alocação
                                </h5>
                                <div className="space-y-4">
                                    {capacityStats.hiringAlerts.map((h, i) => (
                                        <div key={i} className="flex items-center justify-between bg-white/50 p-4 rounded-2xl border border-blue-200/50 shadow-sm">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="block text-sm font-black text-blue-900">{h.roleName}</span>
                                                    {h.roleName.includes('Contratar') && <span className="text-[8px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-black uppercase">Falta no Orçamento</span>}
                                                </div>
                                                <div className="flex gap-2 mt-1">
                                                    {Array.from(h.periods).slice(0, 3).map(p => (
                                                        <span key={p} className="text-[8px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-bold">{p}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className="block text-lg font-black text-blue-600">{Math.ceil(h.totalHours)}h</span>
                                                <span className="text-[10px] font-bold text-gray-400">DEMANDA TOTAL</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'allocation' && (
                    <div className="space-y-6">
                        <div className="bg-blue-600 p-8 rounded-[2.5rem] text-white shadow-xl shadow-blue-600/20 relative overflow-hidden">
                            <div className="relative z-10">
                                <h3 className="text-2xl font-black mb-2">Motor de Alocação Inteligente</h3>
                                <p className="text-blue-100 text-sm font-medium max-w-xl">
                                    Otimize sua equipe cruzando as necessidades do cronograma com a disponibilidade dos seus colaboradores físicos.
                                </p>
                            </div>
                            <div className="absolute right-0 top-0 h-full w-1/3 bg-white/10 skew-x-12 translate-x-12" />
                        </div>

                        {/* Controles Globais */}
                        <div className="flex justify-end items-center gap-3 px-2">
                             <select 
                                value={allocationFilter}
                                onChange={(e) => setAllocationFilter(e.target.value as 'all' | 'thisWeek' | 'next15Days' | 'thisMonth')}
                                className="text-[10px] font-black uppercase text-gray-600 bg-white border border-gray-200 px-4 py-2.5 rounded-2xl outline-none focus:border-blue-300 transition-all hover:bg-gray-50"
                             >
                                <option value="all">Todo o Cronograma</option>
                                <option value="thisWeek">Esta Semana</option>
                                <option value="next15Days">Próximos 15 dias</option>
                                <option value="thisMonth">Este Mês</option>
                             </select>
                             <button 
                                onClick={() => toggleAllAssignments(true)}
                                className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 px-5 py-2.5 rounded-2xl border border-blue-100/50 hover:bg-blue-100 transition-all flex items-center gap-2"
                             >
                                <ChevronDown className="w-3.5 h-3.5" /> Expandir Tudo
                             </button>
                             <button 
                                onClick={() => toggleAllAssignments(false)}
                                className="text-[10px] font-black uppercase text-gray-500 bg-gray-50 px-5 py-2.5 rounded-2xl border border-gray-100 hover:bg-gray-100 transition-all flex items-center gap-2"
                             >
                                <ChevronRight className="w-3.5 h-3.5" /> Recolher Tudo
                             </button>
                        </div>

                        <div className="space-y-8 pb-12">
                            {Object.entries(groupedAssignments || {}).map(([roleName, assignments]) => {
                                const isExpanded = expandedRoles[roleName] !== false; // Default expanded
                                return (
                                    <div key={roleName} className="space-y-4">
                                        <button 
                                            onClick={() => toggleGroup(roleName)}
                                            className="w-full flex items-center justify-between px-6 py-4 bg-gray-50/50 rounded-2xl hover:bg-gray-100/50 transition-all border border-transparent hover:border-gray-200"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`w-1.5 h-6 rounded-full transition-colors ${isExpanded ? 'bg-blue-600' : 'bg-gray-300'}`} />
                                                <h3 className="text-lg font-black text-gray-900 uppercase tracking-wide">{roleName}</h3>
                                                <span className="text-xs font-bold text-gray-400 bg-white/80 px-3 py-1 rounded-full border border-gray-100 shadow-sm">
                                                    {(assignments || []).length} requisitos
                                                </span>
                                            </div>
                                            {isExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                                        </button>

                                        {isExpanded && (
                                            <div className="grid grid-cols-1 gap-4 px-2">
                                                {(assignments || []).map((item, idx) => (
                                                    <div key={idx} className={`p-6 rounded-[2rem] border transition-all hover:shadow-lg ${item?.status === 'CONFIRMED' ? 'bg-emerald-50/20 border-emerald-100/50' : 'bg-white border-gray-100 shadow-sm'}`}>
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-5">
                                                                <div className={`p-4 rounded-2xl ${item?.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                                                                    {item?.status === 'CONFIRMED' ? <Users className="w-6 h-6" /> : <TrendingUp className="w-6 h-6" />}
                                                                </div>
                                                                <div>
                                                                    <h4 className="font-black text-gray-900 text-base leading-tight">{item?.taskName || 'Tarefa'}</h4>
                                                                    <div className="flex items-center gap-3 mt-1.5">
                                                                        <span className={`text-[9px] px-3 py-1 rounded-full font-black uppercase tracking-tighter ${item?.source === 'COMPOSITION' ? 'bg-indigo-50 text-indigo-500' : 'bg-gray-50 text-gray-500'}`}>
                                                                            {item?.source === 'COMPOSITION' ? 'Técnico / Orçado' : 'Adição Manual'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-6">
                                                                {item?.status === 'CONFIRMED' ? (
                                                                    <div className="flex items-center gap-4 px-6 py-2 bg-emerald-50 rounded-2xl border border-emerald-100/50">
                                                                        <div className="text-right">
                                                                            <span className="block text-[10px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-1">Alocado</span>
                                                                            <div className="flex flex-col items-end">
                                                                                <span className="text-sm font-bold text-emerald-900 underline decoration-emerald-200">{item?.worker?.name || '---'}</span>
                                                                                {workerConflicts[item.taskId] && (
                                                                                    <div className="flex items-center gap-1.5 mt-1 text-red-500 bg-red-50 px-2 py-0.5 rounded-full border border-red-100 animate-pulse" title={`Conflito com: ${workerConflicts[item.taskId].join(', ')}`}>
                                                                                        <AlertTriangle className="w-3 h-3" />
                                                                                        <span className="text-[9px] font-black uppercase">Sobrecarga</span>
                                                                                    </div>
                                                                                )}
                                                                                {/* Indicador Financeiro */}
                                                                                {(() => {
                                                                                    const workerRole = resources.roles.find(r => r.id === item.worker?.roleId);
                                                                                    const actualCost = workerRole?.costPerHour || 0;
                                                                                    const budgetCost = item.budgetedCost || 0;
                                                                                    
                                                                                    if (item.source === 'MANUAL' && !item.budgetedCost) {
                                                                                        return <span className="text-[8px] mt-1 bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-black uppercase">Custo Adicional</span>;
                                                                                    }
                                                                                    
                                                                                    if (actualCost > budgetCost && budgetCost > 0) {
                                                                                        return (
                                                                                            <span className="text-[8px] mt-1 bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full font-black uppercase border border-red-100">
                                                                                                + R$ {(actualCost - budgetCost).toFixed(2)}/h
                                                                                            </span>
                                                                                        );
                                                                                    }
                                                                                    return <span className="text-[8px] mt-1 bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full font-black uppercase border border-emerald-100">Meta Atingida</span>;
                                                                                })()}
                                                                            </div>
                                                                        </div>
                                                                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                                                                    </div>
                                                                ) : item?.status === 'SUGGESTION' ? (
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="text-right">
                                                                            <span className="block text-[10px] font-black text-blue-600 uppercase tracking-widest leading-none mb-1">Dica do Sistema</span>
                                                                            <span className="text-sm font-bold text-gray-900">{item?.suggestion?.name || '---'}</span>
                                                                        </div>
                                                                        <button 
                                                                            onClick={() => handleConfirmSuggestion(item)}
                                                                            className="flex items-center gap-3 px-8 py-3 bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all hover:-translate-y-0.5 shadow-xl shadow-emerald-600/20 active:translate-y-0"
                                                                        >
                                                                            Confirmar
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="text-right px-5 bg-red-50 py-2.5 rounded-2xl border border-red-100/50">
                                                                            <span className="block text-[10px] font-black text-red-600 uppercase tracking-widest">Equipe Incompleta</span>
                                                                            <span className="text-[10px] font-bold text-red-400">Cargo não preenchido</span>
                                                                        </div>
                                                                        <button className="px-8 py-3 border-2 border-dashed border-gray-200 text-gray-400 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:border-blue-300 hover:text-blue-500 transition-all">
                                                                            Escolher / Contratar
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {smartAssignments.length === 0 && (
                                <div className="text-center py-24 bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-200">
                                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <Search className="w-10 h-10 text-gray-300" />
                                    </div>
                                    <h3 className="text-xl font-black text-gray-400">Nenhum requisito de mão de obra</h3>
                                    <p className="text-sm font-bold text-gray-300 mt-2">Adicione cargos às suas tarefas no cronograma para iniciar.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <ResourceImportModal 
                isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)}
                organizations={organizations}
                projectResources={{ roles: resources.roles, workers: resources.workers }}
                initialTab={activeTab}
                onConfirm={(r, w, t, orgId) => {
                    handleConfirmImport(r, w, t, orgId);
                }}
            />
        </div>
    );
};

const ResourceImportModal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    organizations: Organization[]; 
    onConfirm: (r: string[], w: string[], t: string[], org: string) => void; 
    projectResources: ProjectResources;
    initialTab: string;
}> = ({ isOpen, onClose, organizations, onConfirm, projectResources, initialTab }) => {
    const [selectedOrgId, setSelectedOrgId] = useState<string>(organizations[0]?.id || '');
    const [search, setSearch] = useState('');
    const [selRoles, setSelRoles] = useState<Set<string>>(new Set());
    const [selWorkers, setSelWorkers] = useState<Set<string>>(new Set());
    const [selTeams, setSelTeams] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!selectedOrgId && organizations.length > 0) {
            setSelectedOrgId(organizations[0].id);
        }
    }, [organizations, selectedOrgId]);

    if (!isOpen) return null;
    const selectedOrg = organizations.find(o => o.id === selectedOrgId);
    
    // Determine what to show based on initialTab
    const showRoles = initialTab === 'roles' || initialTab === 'capacity';
    const showWorkers = initialTab === 'workers' || initialTab === 'capacity';
    const showTeams = initialTab === 'teams' || initialTab === 'capacity';

    const filteredRoles = selectedOrg?.resources?.roles.filter(r => r.name.toLowerCase().includes(search.toLowerCase())) || [];
    const filteredWorkers = selectedOrg?.resources?.workers.filter(w => w.name.toLowerCase().includes(search.toLowerCase())) || [];
    const filteredTeams = selectedOrg?.resources?.teams?.filter(t => t.name.toLowerCase().includes(search.toLowerCase())) || [];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50/50">
                    <h3 className="text-xl font-bold">Importação Inteligente</h3>
                    <button onClick={onClose}><X /></button>
                </div>
                <div className="flex-1 flex overflow-hidden">
                    <div className="w-1/3 border-r p-4 overflow-y-auto bg-gray-50/30">
                        {organizations.map(org => (
                            <button key={org.id} onClick={() => { setSelectedOrgId(org.id); setSelRoles(new Set()); setSelWorkers(new Set()); }} className={`w-full p-3 rounded-xl text-left mb-2 ${selectedOrgId === org.id ? 'bg-white shadow-md text-blue-600' : ''}`}>
                                <Building2 className="inline mr-2 w-4 h-4" /> {org.name}
                            </button>
                        ))}
                    </div>
                    <div className="flex-1 p-6 flex flex-col">
                        <input type="text" placeholder={`Buscar ${initialTab === 'workers' ? 'trabalhadores' : initialTab === 'roles' ? 'cargos' : 'recursos'}...`} value={search} onChange={e => setSearch(e.target.value)} className="w-full p-3 bg-gray-100 rounded-xl mb-6 outline-none" />
                        <div className="flex-1 overflow-y-auto">
                            {showRoles && filteredRoles.length > 0 && (
                                <div className="mb-6">
                                    <div className="grid grid-cols-2 gap-3">
                                        {filteredRoles.map(r => {
                                            const exists = projectResources.roles.some(pr => pr.name.toLowerCase() === r.name.toLowerCase());
                                            return (
                                                <label key={r.id} className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-all">
                                                    <input type="checkbox" checked={selRoles.has(r.id)} onChange={() => { const n = new Set(selRoles); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); setSelRoles(n); }} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" />
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold text-gray-700">{r.name}</span>
                                                        {exists && <span className="text-[8px] text-blue-500 font-bold uppercase mt-0.5">No Projeto</span>}
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            {showWorkers && filteredWorkers.length > 0 && (
                                <div className="mb-6">
                                    <h4 className="text-[10px] font-black uppercase mb-3 text-gray-400 tracking-widest">Trabalhadores ({filteredWorkers.length})</h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        {filteredWorkers.map(w => {
                                            const roleName = selectedOrg?.resources?.roles.find(r => r.id === w.roleId)?.name || 'Sem cargo';
                                            const exists = projectResources.workers.some(pw => pw.name.toLowerCase() === w.name.toLowerCase());
                                            return (
                                                <label key={w.id} className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-all">
                                                    <input type="checkbox" checked={selWorkers.has(w.id)} onChange={() => { const n = new Set(selWorkers); if (n.has(w.id)) n.delete(w.id); else n.add(w.id); setSelWorkers(n); }} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" />
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-bold text-gray-800">{w.name}</span>
                                                            {exists && <span className="text-[8px] text-blue-500 font-bold uppercase">No Projeto</span>}
                                                        </div>
                                                        <span className="text-[10px] text-gray-400 font-bold uppercase">{roleName}</span>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            {showTeams && filteredTeams.length > 0 && (
                                <div className="mb-6">
                                    <h4 className="text-[10px] font-black uppercase mb-3 text-gray-400 tracking-widest">Equipes ({filteredTeams.length})</h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        {filteredTeams.map(t => (
                                            <label key={t.id} className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-all">
                                                <input type="checkbox" checked={selTeams.has(t.id)} onChange={() => { const n = new Set(selTeams); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); setSelTeams(n); }} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" />
                                                <span className="text-sm font-bold text-gray-700">{t.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            {((showRoles && filteredRoles.length === 0) && (showWorkers && filteredWorkers.length === 0) && (showTeams && filteredTeams.length === 0)) && (
                                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                    <Search className="w-12 h-12 mb-4 opacity-20" />
                                    <p className="text-sm font-medium">Nenhum recurso encontrado nesta empresa.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="p-6 border-t flex justify-between bg-gray-50">
                    <span className="font-bold text-gray-500">{selRoles.size + selWorkers.size + selTeams.size} selecionados</span>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-6 py-2 font-bold text-gray-500 hover:bg-gray-200 rounded-xl transition-all">Cancelar</button>
                        <button onClick={() => onConfirm(Array.from(selRoles), Array.from(selWorkers), Array.from(selTeams), selectedOrgId)} className="bg-blue-600 text-white px-10 py-2 rounded-xl font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all">Confirmar</button>
                    </div>
                </div>
            </div>
        </div>
    );
};
