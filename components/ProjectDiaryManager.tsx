import React, { useState, useMemo, useEffect } from 'react';
import {
    BookOpen,
    Plus,
    Calendar,
    ChevronRight,
    Search,
    Users,
    FileText,
    Download,
    MoreHorizontal,
    Camera,
    Paperclip,
    Save,
    CheckCircle2,
    Trash2,
    X,
    User,
    Briefcase as BriefcaseIcon,
    ArrowLeft,
    Link2,
    LayoutGrid,
    LayoutList,
    FileDown,
    Settings,
    Sun,
    CloudRain,
    CloudSun,
    Ban,
    Video,
    Pencil
} from 'lucide-react';
import { ProjectSettings, DiaryEntry, BudgetEntry, WeatherShift, DiaryActivity, LaborEntry, ProjectSchedule } from '../types';
import { projectService } from '../services/projectService';
import { useStore } from '../store/useStore';


// Bug 2: tipo explícito para substituir projects: any[]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ProjectSummary {
    id: string;
    name: string;
    settings?: any;
}

interface ProjectDiaryManagerProps {
    settings: ProjectSettings;
    projects: ProjectSummary[];
    onLoadProject: (id: string, targetView?: string) => void;
    onUpdateSettings: (settings: ProjectSettings) => void;
    organizationId?: string;
    onBackToList?: () => void;
    onSave?: () => Promise<void>;
    onGenerateReport?: () => void;
}


const ProjectDiaryManager: React.FC<ProjectDiaryManagerProps> = ({ settings, projects, onLoadProject, onUpdateSettings, organizationId, onBackToList, onSave, onGenerateReport }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isAdding, setIsAdding] = useState(
        localStorage.getItem('diary_is_adding') === 'true'
    );
    const [editingId, setEditingId] = useState<string | null>(
        localStorage.getItem('diary_editing_id')
    );
    const [activeTab, setActiveTab] = useState<'geral' | 'comentarios' | 'arquivos'>(
        (localStorage.getItem('diary_active_tab') as 'geral' | 'comentarios' | 'arquivos') || 'geral'
    );
    const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);
    const [isLinkingPlanningOpen, setIsLinkingPlanningOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>(
        (localStorage.getItem('diary_view_mode') as 'grid' | 'list') || 'list'
    );
    const [linkedSchedule, setLinkedSchedule] = useState<ProjectSchedule | null>(null);
    const [linkedBudget, setLinkedBudget] = useState<BudgetEntry[]>([]);
    const [isLoadingLinked, setIsLoadingLinked] = useState(false);

    // Persistência de estado
    React.useEffect(() => {
        localStorage.setItem('diary_is_adding', isAdding.toString());
    }, [isAdding]);

    React.useEffect(() => {
        if (editingId) localStorage.setItem('diary_editing_id', editingId);
        else localStorage.removeItem('diary_editing_id');
    }, [editingId]);

    React.useEffect(() => {
        if (activeTab) localStorage.setItem('diary_active_tab', activeTab);
    }, [activeTab]);

    React.useEffect(() => {
        if (viewMode) localStorage.setItem('diary_view_mode', viewMode);
    }, [viewMode]);

    // Bug 1: reset per-project state when switching projects
    const isFirstRender = React.useRef(true);
    React.useEffect(() => {
        if (isFirstRender.current) { isFirstRender.current = false; return; }
        setIsAdding(false);
        setEditingId(null);
        setFormData({
            date: new Date().toISOString().split('T')[0],
            weather: 'Ensolarado',
            description: '',
            temperature: '28°/18°',
            status: 'Rascunho',
            weatherShifts: [
                { turn: 'Manhã', weather: 'Claro', condition: 'Praticável' },
                { turn: 'Tarde', weather: 'Claro', condition: 'Praticável' },
                { turn: 'Noite', weather: 'Claro', condition: 'Praticável' }
            ],
            activities: [],
            labor: [],
            images: [],
            videos: [],
            documents: [],
            impediments: ''
        });
    }, [settings.name]);

    // Notification system
    const [notification, setNotification] = useState<string | null>(null);
    const notify = (msg: string) => {
        setNotification(msg);
        setTimeout(() => setNotification(null), 4000);
    };
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const [formData, setFormData] = useState<Partial<DiaryEntry>>({
        date: new Date().toISOString().split('T')[0],
        weather: 'Ensolarado',
        description: '',
        temperature: '28°/18°',
        status: 'Rascunho',
        weatherShifts: [
            { turn: 'Manhã', weather: 'Claro', condition: 'Praticável' },
            { turn: 'Tarde', weather: 'Claro', condition: 'Praticável' },
            { turn: 'Noite', weather: 'Claro', condition: 'Praticável' }
        ],
        activities: [],
        labor: [],
        images: [],
        videos: [],
        documents: [],
        impediments: ''
    });

    const { organizations, activeOrganizationId, fetchOrganizations } = useStore();
    const [activeLaborSearchIdx, setActiveLaborSearchIdx] = useState<number | null>(null);

    // Carregar organizações se estiverem vazias
    useEffect(() => {
        if (organizations.length === 0) {
            fetchOrganizations();
        }
    }, [organizations.length, fetchOrganizations]);

    const laborSuggestions = useMemo(() => {
        const suggestions: { id: string; name: string; type: 'role' | 'worker' | 'team'; subLabel?: string }[] = [];
        
        organizations.forEach(org => {
            const res = org.resources || { roles: [], workers: [], teams: [] };
            
            // 1. Trabalhadores (Alta prioridade)
            (res.workers || []).forEach(w => {
                if (!suggestions.find(s => s.type === 'worker' && s.id === w.id)) {
                    const role = res.roles?.find(r => r.id === w.roleId);
                    suggestions.push({ 
                        id: w.id, 
                        name: w.name, 
                        type: 'worker', 
                        subLabel: role?.name 
                    });
                }
            });

            // 2. Equipes
            (res.teams || []).forEach(t => {
                if (!suggestions.find(s => s.type === 'team' && s.id === t.id)) {
                    suggestions.push({ 
                        id: t.id, 
                        name: t.name, 
                        type: 'team',
                        subLabel: `${t.memberIds?.length || 0} integrantes`
                    });
                }
            });

            // 3. Funções que REALMENTE possuem trabalhadores vinculados
            const activeRoleIds = new Set((res.workers || []).map(w => w.roleId).filter(Boolean));
            (res.roles || []).forEach(r => {
                if (activeRoleIds.has(r.id)) {
                    if (!suggestions.find(s => s.type === 'role' && s.name === r.name)) {
                        suggestions.push({ id: r.id, name: r.name, type: 'role' });
                    }
                }
            });
        });

        return suggestions;
    }, [organizations]);

    const entries = useMemo(() => {
        const list = settings.diaryEntries || [];
        if (!searchTerm) return list;
        return list.filter(e =>
            e.date.includes(searchTerm) ||
            e.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            e.activities?.some(a => a.description.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [settings.diaryEntries, searchTerm]);

    const metrics = useMemo(() => {
        if (!settings.schedule?.startDate || !settings.schedule?.endDate) {
            return { remaining: 0, total: 0, elapsed: 0, period: 'datas não definidas' };
        }
        const start = new Date(settings.schedule.startDate);
        const end = new Date(settings.schedule.endDate);
        const today = new Date();

        const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const elapsedDays = Math.max(0, Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
        const remainingDays = Math.max(0, totalDays - elapsedDays);

        return {
            remaining: remainingDays,
            total: totalDays,
            elapsed: elapsedDays,
            period: `${start.toLocaleDateString('pt-BR')} até ${end.toLocaleDateString('pt-BR')}`
        };
    }, [settings.schedule]);

    // Lógica de Autodescoberta de Projeto Vinculado
    const autoLinkedProjectId = useMemo(() => {
        // Se houver vínculo manual de Obra/Orçamento nas configurações do Diário
        const baseId = settings.linkedProjectId;
        if (!baseId) return null;

        const linkedProject = projects.find(p => p.id === baseId);
        if (!linkedProject) return baseId;

        // Se o projeto já for um Planejamento, retornar ele mesmo
        if (linkedProject.settings?.classification === 'PLANEJAMENTO') return baseId;

        // Se for uma Obra ou Orçamento, procurar o Planejamento vinculado a ela
        // 1. Busca direta: Planejamento que aponta para o baseId
        const directLink = projects.find(p =>
            p.settings?.classification === 'PLANEJAMENTO' &&
            p.settings?.linkedProjectId === baseId
        );
        if (directLink) return directLink.id;

        // 2. Busca indireta: Se baseId for Obra, procurar Planejamento que aponta para um Orçamento daquela Obra
        if (linkedProject.settings?.classification === 'OBRA') {
            const linkedBudgets = projects.filter(p =>
                p.settings?.classification === 'ORCAMENTO' &&
                p.settings?.linkedProjectId === baseId
            ).map(p => p.id);

            if (linkedBudgets.length > 0) {
                const indirectLink = projects.find(p =>
                    p.settings?.classification === 'PLANEJAMENTO' &&
                    linkedBudgets.includes(p.settings?.linkedProjectId ?? '')
                );
                if (indirectLink) return indirectLink.id;
            }
        }

        // 3. Busca inversa: Orçamento que aponta para a Obra baseId, mas queremos o Planejamento
        // Caso o usuário tenha vinculado o diário ao Orçamento e o Planejamento esteja na Obra
        if (linkedProject.settings?.classification === 'ORCAMENTO' && linkedProject.settings?.linkedProjectId) {
            const obraId = linkedProject.settings.linkedProjectId;
            const linkThroughObra = projects.find(p =>
                p.settings?.classification === 'PLANEJAMENTO' &&
                p.settings?.linkedProjectId === obraId
            );
            if (linkThroughObra) return linkThroughObra.id;
        }

        return baseId; // Fallback
    }, [settings.linkedProjectId, projects]);

    // Carregar dados do projeto de planejamento vinculado (manual ou automático)
    React.useEffect(() => {
        let cancelled = false; // Bug 4: prevent stale async updates
        const loadLinkedProject = async () => {
            const idToLoad = autoLinkedProjectId;

            if (idToLoad) {
                setIsLoadingLinked(true);
                try {
                    const projectData = await projectService.loadProject(idToLoad);
                    if (cancelled) return;
                    if (projectData) {
                        // Priority 1: Schedule from the linked project itself
                        if (projectData.settings?.schedule) {
                            setLinkedSchedule(projectData.settings.schedule);
                        } else {
                            setLinkedSchedule(null);
                        }

                        // Priority 2: Budget from the linked project itself
                        if (projectData.budget && projectData.budget.length > 0) {
                            setLinkedBudget(projectData.budget);
                        }
                        // Priority 3: If planning has no budget, try to load from ITS OWN linked project (The Budget)
                        else if (projectData.settings?.linkedProjectId) {
                            const parentProject = await projectService.loadProject(projectData.settings.linkedProjectId);
                            if (parentProject?.budget) {
                                setLinkedBudget(parentProject.budget);
                            } else {
                                setLinkedBudget([]);
                            }
                        } else {
                            setLinkedBudget([]);
                        }
                    }
                } catch (error) {
                    console.error("Erro ao carregar projeto vinculado:", error);
                } finally {
                    if (!cancelled) setIsLoadingLinked(false);
                }
            } else {
                setLinkedSchedule(null);
                setLinkedBudget([]);
            }
        };

        loadLinkedProject();
        return () => { cancelled = true; };
    }, [autoLinkedProjectId]);


    const handleSave = async () => {
        if (!formData.date || (!formData.description && (!formData.activities || formData.activities.length === 0))) {
            notify('Data e pelo menos uma descrição ou atividade são obrigatórias.');
            return;
        }

        let newEntries = [...(settings.diaryEntries || [])];
        const currentEntry: DiaryEntry = editingId
            ? { ...(newEntries.find(e => e.id === editingId) || {}), ...formData } as DiaryEntry
            : {
                id: crypto.randomUUID(),
                date: formData.date!,
                weather: formData.weather || 'Ensolarado',
                description: formData.description || '',
                temperature: formData.temperature,
                weatherShifts: formData.weatherShifts,
                activities: formData.activities || [],
                labor: formData.labor || [],
                status: formData.status || 'Rascunho',
                images: formData.images || [],
                videos: formData.videos || [],
                documents: formData.documents || [],
                impediments: formData.impediments
            };

        if (editingId) {
            newEntries = newEntries.map(e => e.id === editingId ? currentEntry : e);
        } else {
            newEntries.unshift(currentEntry);
        }

        // Sincronização com o projeto de planejamento vinculado
        const targetSyncProjectId = autoLinkedProjectId;
        if (targetSyncProjectId && linkedSchedule && currentEntry.activities?.length) {
            try {
                console.log(`[ProjectDiaryManager] Synchronizing with project: ${targetSyncProjectId}`);
                const linkedProject = await projectService.loadProject(targetSyncProjectId);
                if (linkedProject && linkedProject.settings?.schedule) {
                    const updatedSchedule = { ...linkedProject.settings.schedule };
                    const itemSchedules = [...(updatedSchedule.itemSchedules || [])];
                    let hasChanges = false;

                    // Pegar todos os diários para encontrar a evolução MÁXIMA de cada item
                    // Isso evita que um diário antigo com evolução menor sobrescreva o valor atual
                    const allEntries = [currentEntry, ...(settings.diaryEntries || []).filter(e => e.id !== currentEntry.id)];

                    const maxEvolutionByItem = new Map<string, number>();
                    allEntries.forEach(entry => {
                        if (entry.status !== 'Recusado') {
                            entry.activities?.forEach(act => {
                                if (act.itemId) {
                                    const currentMax = maxEvolutionByItem.get(act.itemId) || 0;
                                    maxEvolutionByItem.set(act.itemId, Math.max(currentMax, act.evolution || 0));
                                }
                            });
                        }
                    });

                    maxEvolutionByItem.forEach((maxEvolution, itemId) => {
                        const itemIdx = itemSchedules.findIndex(is => is.id === itemId);
                        if (itemIdx >= 0) {
                            if (itemSchedules[itemIdx].manualRealPct !== maxEvolution) {
                                itemSchedules[itemIdx] = {
                                    ...itemSchedules[itemIdx],
                                    manualRealPct: maxEvolution
                                };
                                hasChanges = true;
                            }
                        } else {
                            // Se o item não existir no cronograma, adicionamos (fallback de segurança)
                            itemSchedules.push({ id: itemId, manualRealPct: maxEvolution });
                            hasChanges = true;
                        }
                    });

                    if (hasChanges) {
                        updatedSchedule.itemSchedules = itemSchedules;
                        await projectService.saveProject({
                            ...linkedProject,
                            settings: {
                                ...linkedProject.settings,
                                schedule: updatedSchedule
                            }
                        });
                    }
                }
            } catch (error) {
                console.error("Erro ao sincronizar com planejamento:", error);
                notify('Falha ao sincronizar com o projeto de planejamento. O diário foi salvo localmente.'); // Bug 5
            }
        }


        newEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        onUpdateSettings({ ...settings, diaryEntries: newEntries });

        // Salvar projeto principal
        if (onSave) {
            await onSave();
        }

        setIsAdding(false);

        setEditingId(null);
        resetForm();
    };

    const resetForm = () => {
        setFormData({
            date: new Date().toISOString().split('T')[0],
            weather: 'Ensolarado',
            description: '',
            temperature: '28°/18°',
            status: 'Rascunho',
            weatherShifts: [
                { turn: 'Manhã', weather: 'Claro', condition: 'Praticável' },
                { turn: 'Tarde', weather: 'Claro', condition: 'Praticável' },
                { turn: 'Noite', weather: 'Claro', condition: 'Praticável' }
            ],
            activities: [],
            labor: [],
            images: [],
            videos: [],
            documents: [],
            impediments: ''
        });
    };

    const handleAddNew = () => {
        resetForm();
        setEditingId(null);
        setIsAdding(true);
        setActiveTab('geral');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleEdit = (entry: DiaryEntry, targetTab: 'geral' | 'comentarios' | 'arquivos' = 'geral') => {
        setFormData(entry);
        setEditingId(entry.id);
        setIsAdding(true);
        setActiveTab(targetTab);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = (id: string) => {
        setConfirmDeleteId(id);
    };

    const confirmDelete = async () => {
        if (!confirmDeleteId) return;
        const newEntries = (settings.diaryEntries || []).filter(e => e.id !== confirmDeleteId);
        onUpdateSettings({ ...settings, diaryEntries: newEntries });
        setConfirmDeleteId(null);
        if (onSave) await onSave();
    };

    const handleWeatherShiftChange = (index: number, field: keyof WeatherShift, value: string) => {
        setFormData((prev: Partial<DiaryEntry>) => {
            const newShifts = [...(prev.weatherShifts || [])];
            newShifts[index] = { ...newShifts[index], [field]: value };
            return { ...prev, weatherShifts: newShifts };
        });
    };

    const addActivity = () => {
        const newActivities: DiaryActivity[] = [...(formData.activities || []), {
            itemId: '',
            description: '',
            plannedQty: 0,
            realizedQty: 0,
            evolution: 0,
            status: 'Em Andamento',
            comment: ''
        }];
        setFormData({ ...formData, activities: newActivities });
    };

    const handleActivityChange = (index: number, field: keyof DiaryActivity, value: string | number) => {
        setFormData((prev: Partial<DiaryEntry>) => {
            const newActivities = [...(prev.activities || [])];
            if (field === 'evolution') {
                const num = parseInt(String(value), 10) || 0; // Bug 9: radix + NaN guard
                const plannedQty = newActivities[index].plannedQty || 0;
                newActivities[index] = {
                    ...newActivities[index],
                    evolution: num,
                    realizedQty: (num / 100) * plannedQty,
                    status: num === 100 ? 'Finalizada' : 'Em Andamento'
                };
            } else if (field === 'realizedQty') {
                const num = parseFloat(String(value)) || 0;
                const plannedQty = newActivities[index].plannedQty || 1;
                newActivities[index] = {
                    ...newActivities[index],
                    realizedQty: num,
                    evolution: Math.min(100, Math.round((num / plannedQty) * 100))
                };
            } else {
                newActivities[index] = { ...newActivities[index], [field]: value };
            }
            return { ...prev, activities: newActivities };
        });
    };

    const removeActivity = (index: number) => {
        setFormData({ ...formData, activities: (formData.activities || []).filter((_, i) => i !== index) });
    };

    const addLabor = () => {
        const newLabor = [...(formData.labor || []), { category: '', quantity: 1, observations: '' }];
        setFormData({ ...formData, labor: newLabor });
    };

    const handleLaborChange = (index: number, field: keyof LaborEntry, value: string | number) => {
        setFormData((prev: Partial<DiaryEntry>) => {
            const newLabor = [...(prev.labor || [])];
            newLabor[index] = { ...newLabor[index], [field]: value };
            return { ...prev, labor: newLabor };
        });
    };

    const removeLabor = (index: number) => {
        setFormData({ ...formData, labor: (formData.labor || []).filter((_, i) => i !== index) });
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video' | 'document') => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target?.result as string;
            if (type === 'image') setFormData(prev => ({ ...prev, images: [...(prev.images || []), result] }));
            else if (type === 'video') setFormData(prev => ({ ...prev, videos: [...(prev.videos || []), result] }));
            else setFormData(prev => ({ ...prev, documents: [...(prev.documents || []), { name: file.name, url: result, type: file.type }] }));
        };
        reader.readAsDataURL(file);
    };

    const removeFile = (index: number, type: 'image' | 'video' | 'document') => {
        if (type === 'image') setFormData(prev => ({ ...prev, images: (prev.images || []).filter((_, i) => i !== index) }));
        else if (type === 'video') setFormData(prev => ({ ...prev, videos: (prev.videos || []).filter((_, i) => i !== index) }));
        else setFormData(prev => ({ ...prev, documents: (prev.documents || []).filter((_, i) => i !== index) }));
    };

    return (
        <div className="space-y-6 pb-20">
            {/* Professional Header */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    {onBackToList && (
                        <button
                            onClick={onBackToList}
                            className="p-3 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-transparent hover:border-indigo-100 shadow-sm hover:shadow-md"
                            title="Voltar para a lista"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                    )}
                    <div>
                        <h1 className="text-2xl font-medium text-gray-900 tracking-tight">Diário de Obras</h1>
                        <div className="flex items-center gap-2 mt-1 relative">
                            <span className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">Obra:</span>
                            <div className="relative">
                                <button
                                    onClick={() => setIsProjectSelectorOpen(!isProjectSelectorOpen)}
                                    className="flex items-center gap-2 text-[12px] font-medium text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-all border border-indigo-100"
                                >
                                    {settings.name || 'Selecionar Obra'}
                                    <ChevronRight className={`w-3 h-3 transition-transform ${isProjectSelectorOpen ? 'rotate-90' : ''}`} />
                                </button>

                                {isProjectSelectorOpen && (
                                    <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="px-3 py-2 border-b border-gray-50 mb-1">
                                            <span className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">Minhas Obras</span>
                                        </div>
                                        <div className="max-h-60 overflow-y-auto">
                                            {projects
                                                .filter(p => p.settings?.classification !== 'COMERCIAL' && p.name !== 'Gestão Comercial')
                                                .map((p) => (
                                                    <button
                                                        key={p.id}
                                                        onClick={() => {
                                                            onLoadProject(p.id, 'project-diary');
                                                            setIsProjectSelectorOpen(false);
                                                        }}
                                                        className={`w-full text-left px-4 py-2 text-[12px] font-medium hover:bg-gray-50 flex items-center justify-between group ${p.id === settings.id ? 'text-indigo-600 bg-indigo-50/50' : 'text-gray-600'}`}
                                                    >
                                                        <span className="truncate">{p.name}</span>
                                                        {p.id === settings.id && <CheckCircle2 className="w-4 h-4 text-indigo-500" />}
                                                    </button>
                                                ))}
                                            {projects.length === 0 && (
                                                <div className="px-4 py-8 text-center">
                                                    <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">Nenhuma obra encontrada</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-8 items-center">
                    <div className="flex flex-wrap gap-8 items-center">
                        <div className="text-center">
                            <span className="block text-[12px] font-medium text-gray-400 uppercase tracking-widest">Prazo Restante</span>
                            <span className="text-xl font-medium text-indigo-600">{metrics.remaining} dias</span>
                        </div>
                        <div className="w-px h-8 bg-gray-100" />
                        <div className="text-center">
                            <span className="block text-[12px] font-medium text-gray-400 uppercase tracking-widest">Prazo Total</span>
                            <span className="text-sm font-medium text-gray-700 bg-gray-50 px-3 py-1 rounded-lg">{metrics.total} dias</span>
                        </div>
                        <div className="text-center">
                            <span className="block text-[12px] font-medium text-gray-400 uppercase tracking-widest">Prazo Decorrido</span>
                            <span className="text-sm font-medium text-gray-700 bg-gray-50 px-3 py-1 rounded-lg">{metrics.elapsed} dias</span>
                        </div>
                        <div className="text-center">
                            <span className="block text-[12px] font-medium text-gray-400 uppercase tracking-widest">Período Planejado</span>
                            <span className="text-xs font-medium text-gray-500 bg-gray-50 px-3 py-1 rounded-lg">{metrics.period}</span>
                        </div>
                        <div className="w-px h-8 bg-gray-100" />
                        <div className="relative">
                            <button
                                onClick={() => setIsLinkingPlanningOpen(!isLinkingPlanningOpen)}
                                className={`flex items-center gap-2 text-[10px] font-bold px-3 py-1.5 rounded-full transition-all border uppercase tracking-widest ${autoLinkedProjectId
                                    ? (settings.linkedProjectId ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-blue-600 bg-blue-50 border-blue-100')
                                    : 'text-amber-600 bg-amber-50 border-amber-100 animate-pulse'
                                    }`}
                            >
                                <Link2 className="w-3.5 h-3.5" />
                                {settings.linkedProjectId ? 'Planejamento Ativo' : (autoLinkedProjectId ? 'Planejamento Auto' : 'Vincular Planejamento')}
                            </button>

                            {isLinkingPlanningOpen && (
                                <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <h4 className="text-[12px] font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">Selecionar Planejamento</h4>
                                    <div className="max-h-60 overflow-y-auto space-y-1">
                                        {projects
                                            .filter(p => p.settings?.classification === 'PLANEJAMENTO')
                                            .map((p) => {
                                                const isAuto = !settings.linkedProjectId && autoLinkedProjectId === p.id;
                                                const isManual = settings.linkedProjectId === p.id;

                                                return (
                                                    <button
                                                        key={p.id}
                                                        onClick={() => {
                                                            onUpdateSettings({
                                                                ...settings,
                                                                linkedProjectId: p.id,
                                                                linkedProjectName: p.name
                                                            });
                                                            setIsLinkingPlanningOpen(false);
                                                        }}
                                                        className={`w-full text-left px-4 py-3 rounded-xl text-[12px] font-medium transition-all flex items-center justify-between group ${isManual || isAuto
                                                            ? 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                                                            : 'hover:bg-gray-50 text-gray-600 border border-transparent'
                                                            }`}
                                                    >
                                                        <div className="flex flex-col">
                                                            <span>{p.name}</span>
                                                            {isAuto && <span className="text-[9px] text-blue-500 font-bold uppercase tracking-tighter">Sugestão automática</span>}
                                                            {isManual && <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-tighter">Vínculo manual</span>}
                                                        </div>
                                                        {(isManual || isAuto) && <CheckCircle2 className={`w-4 h-4 ${isManual ? 'text-emerald-500' : 'text-blue-500'}`} />}
                                                    </button>
                                                );
                                            })}
                                        {projects.filter(p => p.settings?.classification === 'PLANEJAMENTO').length === 0 && (
                                            <div className="py-8 text-center">
                                                <p className="text-[10px] font-bold text-gray-400 uppercase">Nenhum planejamento encontrado</p>
                                            </div>
                                        )}
                                    </div>
                                    {settings.linkedProjectId && (
                                        <button
                                            onClick={() => {
                                                onUpdateSettings({
                                                    ...settings,
                                                    linkedProjectId: undefined,
                                                    linkedProjectName: undefined
                                                });
                                                setIsLinkingPlanningOpen(false);
                                            }}
                                            className="w-full mt-3 py-2 text-[10px] font-bold text-red-500 hover:bg-red-50 rounded-xl transition-all uppercase tracking-widest"
                                        >
                                            Remover Vínculo
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex gap-2">
                    <div className="flex bg-gray-100 p-1 rounded-xl mr-2">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid'
                                ? 'bg-white text-indigo-600 shadow-sm'
                                : 'text-gray-400 hover:text-gray-600'
                                }`}
                            title="Visualização em Blocos"
                        >
                            <LayoutGrid className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 rounded-lg transition-all ${viewMode === 'list'
                                ? 'bg-white text-indigo-600 shadow-sm'
                                : 'text-gray-400 hover:text-gray-600'
                                }`}
                            title="Visualização em Linhas"
                        >
                            <LayoutList className="w-5 h-5" />
                        </button>
                    </div>
                    <button
                        onClick={() => onGenerateReport?.()}
                        className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
                        title="Gerar Relatório"
                    >
                        <FileDown className="w-5 h-5" />
                    </button>
                    <button disabled title="Configurações (em breve)" className="p-2 bg-gray-50 text-gray-400 rounded-lg cursor-not-allowed opacity-60">
                        <Settings className="w-5 h-5" />
                    </button>
                    {!isAdding && (
                        <button
                            onClick={handleAddNew}
                            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium text-[12px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg active:scale-95"
                        >
                            <Plus className="w-5 h-5" />
                            NOVA ENTRADA
                        </button>
                    )}
                </div>
            </div>

            {/* Main Content Area */}
            {
                !isAdding && (
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por data ou descrição..."
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-transparent rounded-xl text-sm font-medium focus:bg-white focus:border-indigo-500 outline-none transition-all"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                )
            }

            {
                isAdding && (
                    <div className="bg-white rounded-3xl shadow-2xl border border-indigo-100 animate-in zoom-in-95 duration-200">
                        {/* Entry Editor Header */}
                        <div className="p-6 bg-gray-50/50 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div className="flex flex-wrap items-center gap-6">
                                <div className="flex items-center gap-3">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Status do Relatório</span>
                                        <div className="flex bg-gray-100/50 p-1 rounded-xl">
                                            {[
                                                { val: 'Rascunho', color: 'bg-white text-gray-500 shadow-sm border border-gray-100' },
                                                { val: 'Em Análise', color: 'bg-amber-100 text-amber-700 shadow-sm border border-amber-200' },
                                                { val: 'Aprovado', color: 'bg-emerald-100 text-emerald-700 shadow-sm border border-emerald-200' },
                                                { val: 'Recusado', color: 'bg-red-100 text-red-700 shadow-sm border border-red-200' }
                                            ].map(s => (
                                                <button
                                                    key={s.val}
                                                    onClick={() => setFormData({ ...formData, status: s.val as DiaryEntry['status'] })}
                                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tighter transition-all ${formData.status === s.val ? s.color : 'text-gray-400 hover:text-gray-600'}`}
                                                >
                                                    {s.val}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="w-[1px] h-10 bg-gray-100 mx-2" />
                                    <div className="flex items-center gap-3 bg-indigo-50/50 px-4 py-2 rounded-2xl border border-indigo-100/50">
                                        <Calendar className="w-5 h-5 text-indigo-600" />
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Data do Diário</span>
                                            <input
                                                type="date"
                                                value={formData.date}
                                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                                className="bg-transparent border-none outline-none text-sm font-black text-indigo-900 p-0"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => { setIsAdding(false); setEditingId(null); resetForm(); }}
                                    className="px-6 py-2.5 bg-white text-gray-500 rounded-xl font-medium text-[12px] uppercase tracking-widest hover:bg-gray-50 transition-all border border-gray-100"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium text-[12px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
                                >
                                    <Save className="w-5 h-5" />
                                    Salvar Registro
                                </button>
                            </div>
                        </div>

                        {/* Editor Tabs */}
                        <div className="flex border-b border-gray-100 bg-white">
                            <button onClick={() => setActiveTab('geral')} className={`px-8 py-4 text-[12px] font-medium uppercase tracking-widest border-b-2 transition-all ${activeTab === 'geral' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Dados Gerais</button>
                            <button onClick={() => setActiveTab('comentarios')} className={`px-8 py-4 text-[12px] font-medium uppercase tracking-widest border-b-2 transition-all ${activeTab === 'comentarios' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Comentários</button>
                            <button onClick={() => setActiveTab('arquivos')} className={`px-8 py-4 text-[12px] font-medium uppercase tracking-widest border-b-2 transition-all ${activeTab === 'arquivos' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Arquivos ({(formData.images?.length || 0) + (formData.videos?.length || 0) + (formData.documents?.length || 0)})</button>
                        </div>

                        <div className="p-8">
                            {activeTab === 'geral' && (
                                <div className="space-y-10">
                                    {/* Weather Conditions */}
                                    <section>
                                        <h3 className="text-[14px] font-medium text-gray-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                                            <CloudSun className="w-5 h-5 text-indigo-500" />
                                            Condições Climáticas e Previsão
                                        </h3>

                                        {/* Bug 3: replaced fake hardcoded forecast with informational banner */}
                                        <div className="flex items-center gap-3 mb-6 px-4 py-3 bg-amber-50 border border-amber-100 rounded-2xl text-amber-700">
                                            <CloudSun className="w-5 h-5 shrink-0 text-amber-500" />
                                            <span className="text-[11px] font-medium">Previsão do tempo automática estará disponível em breve. Registre as condições observadas na tabela abaixo.</span>
                                        </div>

                                        <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-gray-50 border-b border-gray-100">
                                                        <th className="px-6 py-3 text-[12px] font-medium text-gray-400 uppercase tracking-widest">Turno</th>
                                                        <th className="px-6 py-3 text-[12px] font-medium text-gray-400 uppercase tracking-widest">Tempo</th>
                                                        <th className="px-6 py-3 text-[12px] font-medium text-gray-400 uppercase tracking-widest">Condição</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {(formData.weatherShifts || []).map((shift, idx) => (
                                                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                                            <td className="px-6 py-4 text-xs font-medium text-gray-600">{shift.turn}</td>
                                                            <td className="px-6 py-4">
                                                                <select
                                                                    value={shift.weather}
                                                                    onChange={(e) => handleWeatherShiftChange(idx, 'weather', e.target.value)}
                                                                    className="bg-transparent border-none outline-none text-xs font-medium text-gray-700 bg-gray-50 px-3 py-1.5 rounded-lg focus:bg-white focus:ring-1 focus:ring-indigo-100 transition-all"
                                                                >
                                                                    {['Claro', 'Nublado', 'Chuva Leve', 'Chuva Forte', 'Instável'].map(w => <option key={w} value={w}>{w}</option>)}
                                                                </select>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="flex gap-2">
                                                                    {['Praticável', 'Impraticável'].map(c => (
                                                                        <button
                                                                            key={c}
                                                                            onClick={() => handleWeatherShiftChange(idx, 'condition', c)}
                                                                            className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${shift.condition === c ? (c === 'Praticável' ? 'bg-emerald-500 text-white shadow-md shadow-emerald-100' : 'bg-red-500 text-white shadow-md shadow-red-100') : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                                                                        >
                                                                            {c}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </section>

                                    {/* Labour List */}
                                    <section>
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="text-[14px] font-medium text-gray-800 uppercase tracking-widest flex items-center gap-2">
                                                <MoreHorizontal className="w-5 h-5 text-indigo-500" />
                                                Efetivo de Mão de Obra
                                            </h3>
                                            <div className="flex gap-2">
                                                {(linkedBudget.length > 0 || linkedSchedule) && (
                                                    <button
                                                        onClick={() => {
                                                            const planningLabor = linkedBudget
                                                                .filter(b => b.sinapiItem?.category === 'Mão de Obra' || b.sinapiItem?.nature === 'Mão de Obra')
                                                                .map(b => ({
                                                                    id: crypto.randomUUID(),
                                                                    category: b.sinapiItem.description,
                                                                    quantity: 0,
                                                                    observations: 'Importado do Planejamento'
                                                                }));

                                                            if (planningLabor.length > 0) {
                                                                setFormData({ ...formData, labor: [...(formData.labor || []), ...planningLabor] });
                                                            } else {
                                                                notify('Nenhuma mão de obra encontrada no planejamento vinculado.');
                                                            }
                                                        }}
                                                        className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl hover:bg-emerald-100 active:scale-95 transition-all outline-none border border-emerald-100 uppercase tracking-widest"
                                                    >
                                                        <Download className="w-4 h-4" /> Importar do Planejamento
                                                    </button>
                                                )}
                                                <button onClick={addLabor} className="flex items-center gap-2 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl hover:bg-indigo-100 active:scale-95 transition-all outline-none border border-indigo-100 uppercase tracking-widest">
                                                    <Plus className="w-4 h-4" /> Adicionar Mão de Obra
                                                </button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                            {(formData.labor || []).map((lab, idx) => (
                                                <div key={idx} className="p-4 bg-gray-50/50 rounded-2xl border border-gray-100 group relative">
                                                    <button onClick={() => removeLabor(idx)} className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full border border-red-100 text-red-500 opacity-0 group-hover:opacity-100 transition-all shadow-sm hover:bg-red-50 flex items-center justify-center"><X className="w-3 h-3" /></button>
                                                    <div className="space-y-3">
                                                        <div className={`relative ${activeLaborSearchIdx === idx ? 'z-50' : ''}`}>
                                                            <input
                                                                placeholder="Clique para buscar trabalhador ou equipe..."
                                                                value={lab.category}
                                                                onFocus={() => setActiveLaborSearchIdx(idx)}
                                                                onChange={(e) => {
                                                                    handleLaborChange(idx, 'category', e.target.value);
                                                                    setActiveLaborSearchIdx(idx);
                                                                }}
                                                                className="w-full bg-white border border-gray-100 rounded-lg px-2 py-1.5 text-xs font-medium focus:ring-2 focus:ring-indigo-100 outline-none mt-1"
                                                            />
                                                            
                                                            {activeLaborSearchIdx === idx && (
                                                                <>
                                                                    <div 
                                                                        className="fixed inset-0 z-[-1]" 
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setActiveLaborSearchIdx(null);
                                                                        }} 
                                                                    ></div>
                                                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-gray-100 py-2 z-[60] max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
                                                                        {(() => {
                                                                            const filtered = laborSuggestions.filter(s => 
                                                                                !lab.category || 
                                                                                s.name.toLowerCase().includes(lab.category.toLowerCase()) ||
                                                                                s.subLabel?.toLowerCase().includes(lab.category.toLowerCase())
                                                                            );
                                                                            
                                                                            const workers = filtered.filter(s => s.type === 'worker');
                                                                            const teams = filtered.filter(s => s.type === 'team');
                                                                            const roles = filtered.filter(s => s.type === 'role');

                                                                            if (organizations.length === 0) {
                                                                                return (
                                                                                    <div className="px-3 py-4 text-center">
                                                                                        <p className="text-[10px] font-bold text-indigo-500 animate-pulse uppercase tracking-widest">Carregando banco de talentos...</p>
                                                                                    </div>
                                                                                );
                                                                            }

                                                                            if (filtered.length === 0) {
                                                                                return (
                                                                                    <div className="px-3 py-4 text-center">
                                                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Nenhum recurso encontrado no time</p>
                                                                                    </div>
                                                                                );
                                                                            }

                                                                            return (
                                                                                <div className="flex flex-col">
                                                                                    {workers.length > 0 && (
                                                                                        <>
                                                                                            <div className="px-3 py-1.5 bg-gray-50 text-[9px] font-bold text-gray-400 uppercase tracking-widest border-y border-gray-100 first:border-t-0">Trabalhadores</div>
                                                                                            {workers.map(s => (
                                                                                                <button
                                                                                                    key={s.id}
                                                                                                    type="button"
                                                                                                    onClick={() => {
                                                                                                        handleLaborChange(idx, 'category', s.name);
                                                                                                        if (s.subLabel) handleLaborChange(idx, 'observations', s.subLabel);
                                                                                                        setActiveLaborSearchIdx(null);
                                                                                                    }}
                                                                                                    className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 flex flex-col transition-colors border-b border-gray-50 last:border-none"
                                                                                                >
                                                                                                    <div className="flex items-center gap-2">
                                                                                                        <User className="w-3.5 h-3.5 text-indigo-500" />
                                                                                                        <span className="text-[11px] font-bold text-gray-700">{s.name}</span>
                                                                                                    </div>
                                                                                                    {s.subLabel && <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-widest ml-5.5">{s.subLabel}</span>}
                                                                                                </button>
                                                                                            ))}
                                                                                        </>
                                                                                    )}
                                                                                    {teams.length > 0 && (
                                                                                        <>
                                                                                            <div className="px-3 py-1.5 bg-gray-50 text-[9px] font-bold text-gray-400 uppercase tracking-widest border-y border-gray-100">Equipes</div>
                                                                                            {teams.map(s => (
                                                                                                <button
                                                                                                    key={s.id}
                                                                                                    type="button"
                                                                                                    onClick={() => {
                                                                                                        handleLaborChange(idx, 'category', s.name);
                                                                                                        setActiveLaborSearchIdx(null);
                                                                                                    }}
                                                                                                    className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 flex flex-col transition-colors border-b border-gray-50 last:border-none"
                                                                                                >
                                                                                                    <div className="flex items-center gap-2">
                                                                                                        <Users className="w-3.5 h-3.5 text-emerald-500" />
                                                                                                        <span className="text-[11px] font-bold text-gray-700">{s.name}</span>
                                                                                                    </div>
                                                                                                    {s.subLabel && <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest ml-5.5">{s.subLabel}</span>}
                                                                                                </button>
                                                                                            ))}
                                                                                        </>
                                                                                    )}
                                                                                    {roles.length > 0 && (
                                                                                        <>
                                                                                            <div className="px-3 py-1.5 bg-gray-50 text-[9px] font-bold text-gray-400 uppercase tracking-widest border-y border-gray-100">Funções / Categorias</div>
                                                                                            {roles.map(s => (
                                                                                                <button
                                                                                                    key={s.id}
                                                                                                    type="button"
                                                                                                    onClick={() => {
                                                                                                        handleLaborChange(idx, 'category', s.name);
                                                                                                        setActiveLaborSearchIdx(null);
                                                                                                    }}
                                                                                                    className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 flex flex-col transition-colors border-b border-gray-50 last:border-none"
                                                                                                >
                                                                                                    <div className="flex items-center gap-2">
                                                                                                        <BriefcaseIcon className="w-3.5 h-3.5 text-amber-500" />
                                                                                                        <span className="text-[11px] font-bold text-gray-700">{s.name}</span>
                                                                                                    </div>
                                                                                                </button>
                                                                                            ))}
                                                                                        </>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })()}
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <div className="flex-1 flex items-center gap-2">
                                                                <span className="text-[10px] font-bold text-gray-400 uppercase">Qtd:</span>
                                                                <input
                                                                    type="number"
                                                                    value={lab.quantity}
                                                                    onChange={(e) => handleLaborChange(idx, 'quantity', parseInt(e.target.value) || 0)}
                                                                    className="w-full bg-white border border-gray-100 rounded-lg px-2 py-1.5 text-xs font-medium focus:ring-2 focus:ring-indigo-100 outline-none"
                                                                />
                                                            </div>
                                                            <div className="flex-1 flex items-center gap-2">
                                                                <span className="text-[10px] font-bold text-gray-400 uppercase">Horas:</span>
                                                                <input
                                                                    type="number"
                                                                    placeholder="8"
                                                                    value={lab.hours || ''}
                                                                    onChange={(e) => handleLaborChange(idx, 'hours', parseFloat(e.target.value) || 0)}
                                                                    className="w-full bg-white border border-gray-100 rounded-lg px-2 py-1.5 text-xs font-medium focus:ring-2 focus:ring-indigo-100 outline-none"
                                                                />
                                                            </div>
                                                        </div>
                                                        <input
                                                            placeholder="Observações (ex: Terceirizado)"
                                                            value={lab.observations || ''}
                                                            onChange={(e) => handleLaborChange(idx, 'observations', e.target.value)}
                                                            className="w-full bg-white border border-gray-100 rounded-lg px-2 py-1.5 text-[10px] focus:ring-2 focus:ring-indigo-100 outline-none"
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>

                                    {/* Activities */}
                                    <section>
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="text-[14px] font-medium text-gray-800 uppercase tracking-widest flex items-center gap-2">
                                                <CheckCircle2 className="w-5 h-5 text-indigo-500" />
                                                Atividades do Dia
                                            </h3>
                                            <button onClick={addActivity} className="flex items-center gap-2 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl hover:bg-indigo-100 active:scale-95 transition-all outline-none border border-indigo-100 uppercase tracking-widest">
                                                <Plus className="w-4 h-4" /> Adicionar Atividade
                                            </button>
                                        </div>
                                        <div className="space-y-3">
                                            {(formData.activities || []).map((act, idx) => (
                                                <div key={idx} className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-wrap lg:flex-nowrap items-center gap-6 group">
                                                    <div className="flex-1 min-w-[300px] flex items-center gap-4">
                                                        <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 font-bold shrink-0">{idx + 1}</div>
                                                        <div className="flex-1 space-y-2">
                                                            {linkedSchedule && linkedSchedule.itemSchedules && linkedSchedule.itemSchedules.length > 0 ? (
                                                                <div className="flex flex-col gap-1">
                                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter ml-1">Vincular Item do Cronograma</span>
                                                                    <select
                                                                        value={act.itemId || ''}
                                                                        onChange={(e) => {
                                                                            const itemId = e.target.value;
                                                                            const scheduleItem = linkedSchedule.itemSchedules?.find(is => is.id === itemId);
                                                                            const budgetItem = linkedBudget.find(b => b.id === itemId);

                                                                            if (itemId) {
                                                                                const newActs = [...(formData.activities || [])];
                                                                                newActs[idx] = {
                                                                                    ...newActs[idx],
                                                                                    itemId: itemId,
                                                                                    description: budgetItem?.sinapiItem?.description || act.description,
                                                                                    plannedQty: budgetItem?.quantity || 0,
                                                                                    evolution: scheduleItem?.manualRealPct || 0
                                                                                };
                                                                                setFormData({ ...formData, activities: newActs });
                                                                            } else {
                                                                                handleActivityChange(idx, 'itemId', '');
                                                                            }
                                                                        }}
                                                                        className="w-full bg-indigo-50/50 border border-indigo-100 outline-none focus:bg-white focus:ring-1 focus:ring-indigo-100 p-2.5 rounded-xl text-xs font-semibold text-indigo-700 transition-all"
                                                                    >
                                                                        <option value="">-- Selecione um item --</option>
                                                                        {linkedSchedule.itemSchedules.map(is => {
                                                                            const budgetItem = linkedBudget.find(b => b.id === is.id);
                                                                            return (
                                                                                <option key={is.id} value={is.id}>
                                                                                    {budgetItem?.sinapiItem?.description || 'Item sem nome'}
                                                                                </option>
                                                                            );
                                                                        })}
                                                                    </select>
                                                                </div>
                                                            ) : null}

                                                            <input
                                                                placeholder="Descrição da atividade realizada..."
                                                                value={act.description}
                                                                onChange={(e) => handleActivityChange(idx, 'description', e.target.value)}
                                                                className="w-full bg-gray-50 border-none outline-none focus:bg-white focus:ring-1 focus:ring-indigo-100 p-3 rounded-xl text-sm font-medium transition-all"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="w-64 flex flex-col gap-2">
                                                        <div className="flex justify-between px-1">
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase">Evolução</span>
                                                            <span className="text-[10px] font-bold text-indigo-600 uppercase">{act.evolution || 0}%</span>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            min="0"
                                                            max="100"
                                                            step="5"
                                                            value={act.evolution || 0}
                                                            onChange={(e) => handleActivityChange(idx, 'evolution', e.target.value)}
                                                            className="w-full accent-indigo-600 h-1.5 bg-gray-100 rounded-full cursor-pointer"
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${act.evolution === 100 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                                            {act.evolution === 100 ? 'Finalizada' : 'Em Andamento'}
                                                        </span>
                                                        <button onClick={() => removeActivity(idx)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                </div>
                            )}

                            {activeTab === 'comentarios' && (
                                <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                                    <section className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                                        <div className="flex justify-between items-center mb-6">
                                            <h3 className="text-[14px] font-medium text-gray-800 uppercase tracking-widest flex items-center gap-2">
                                                <Paperclip className="w-5 h-5 text-indigo-500" />
                                                Relato Geral / Justificativas
                                            </h3>
                                        </div>
                                        <textarea
                                            placeholder="Detalhe o que ocorreu no dia, ocorrências relevantes, visitas técnicas..."
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            className="w-full h-48 p-6 bg-gray-50 border-none outline-none focus:bg-white focus:ring-1 focus:ring-indigo-100 rounded-[2rem] text-sm font-medium leading-relaxed transition-all resize-none shadow-inner"
                                        />
                                    </section>

                                    <section className="bg-red-50/30 rounded-3xl border border-red-100 p-8 shadow-sm">
                                        <h3 className="text-[14px] font-medium text-red-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                                            <Ban className="w-5 h-5" />
                                            Impedimentos / Paralisações (opcional)
                                        </h3>
                                        <textarea
                                            placeholder="Descreva aqui se houve algum impedimento para o trabalho..."
                                            value={formData.impediments}
                                            onChange={(e) => setFormData({ ...formData, impediments: e.target.value })}
                                            className="w-full h-32 p-6 bg-white border border-red-100 outline-none focus:ring-2 focus:ring-red-200 rounded-[2rem] text-sm font-medium leading-relaxed transition-all resize-none shadow-sm"
                                        />
                                    </section>
                                </div>
                            )}

                            {activeTab === 'arquivos' && (
                                <div className="space-y-12 animate-in slide-in-from-right-4 duration-300">
                                    {/* Uploaders */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="relative group overflow-hidden bg-indigo-50 border-2 border-dashed border-indigo-200 rounded-3xl p-8 flex flex-col items-center justify-center text-center hover:bg-indigo-100/50 hover:border-indigo-400 transition-all cursor-pointer shadow-sm active:scale-95">
                                            <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'image')} className="absolute inset-0 opacity-0 cursor-pointer" />
                                            <Camera className="w-8 h-8 text-indigo-500 mb-3" />
                                            <span className="text-[12px] font-bold text-indigo-800 uppercase tracking-widest">Fotos</span>
                                            <span className="text-[10px] text-indigo-400 font-medium">JPG, PNG</span>
                                        </div>
                                        <div className="relative group overflow-hidden bg-blue-50 border-2 border-dashed border-blue-200 rounded-3xl p-8 flex flex-col items-center justify-center text-center hover:bg-blue-100/50 hover:border-blue-400 transition-all cursor-pointer shadow-sm active:scale-95">
                                            <input type="file" accept="video/*" onChange={(e) => handleFileUpload(e, 'video')} className="absolute inset-0 opacity-0 cursor-pointer" />
                                            <Video className="w-8 h-8 text-blue-500 mb-3" />
                                            <span className="text-[12px] font-bold text-blue-800 uppercase tracking-widest">Vídeos</span>
                                            <span className="text-[10px] text-blue-400 font-medium">MP4</span>
                                        </div>
                                        <div className="relative group overflow-hidden bg-emerald-50 border-2 border-dashed border-emerald-200 rounded-3xl p-8 flex flex-col items-center justify-center text-center hover:bg-emerald-100/50 hover:border-emerald-400 transition-all cursor-pointer shadow-sm active:scale-95">
                                            <input type="file" onChange={(e) => handleFileUpload(e, 'document')} className="absolute inset-0 opacity-0 cursor-pointer" />
                                            <FileText className="w-8 h-8 text-emerald-500 mb-3" />
                                            <span className="text-[12px] font-bold text-emerald-800 uppercase tracking-widest">Documentos</span>
                                            <span className="text-[10px] text-emerald-400 font-medium">PDF, DOC, XLS</span>
                                        </div>
                                    </div>

                                    {/* Media Grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                                        {(formData.images || []).map((img, i) => (
                                            <div key={i} className="aspect-square relative group bg-gray-100 rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-xl transition-all">
                                                <img src={img} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                                <button onClick={() => removeFile(i, 'image')} className="absolute top-3 right-3 p-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:bg-red-600 scale-75 group-hover:scale-100"><X className="w-4 h-4" /></button>
                                            </div>
                                        ))}
                                        {(formData.videos || []).map((vid, i) => (
                                            <div key={i} className="aspect-square relative group bg-slate-900 rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-xl transition-all flex items-center justify-center">
                                                <Video className="w-10 h-10 text-white/50" />
                                                <button onClick={() => removeFile(i, 'video')} className="absolute top-3 right-3 p-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:bg-red-600 scale-75 group-hover:scale-100"><X className="w-4 h-4" /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div >
                )
            }

            {/* Entries list */}
            <div className="space-y-4">
                {entries.length === 0 ? (
                    <div className="bg-white p-24 rounded-3xl border border-gray-100 flex flex-col items-center text-center">
                        <div className="w-20 h-20 bg-gray-50 rounded-[2rem] flex items-center justify-center mb-6 shadow-inner border border-gray-100">
                            <BookOpen className="w-10 h-10 text-gray-300" />
                        </div>
                        <h3 className="text-xl font-medium text-gray-400 uppercase tracking-widest">Nenhum registro ainda</h3>
                        <p className="text-gray-400 text-[12px] max-w-xs mt-2 font-medium">Os registros aparecerão aqui conforme você os adiciona.</p>
                    </div>
                ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {entries.map((entry) => (
                            <div key={entry.id} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all group flex flex-col h-full">
                                <div className="flex justify-between items-start gap-4 mb-4">
                                    <div className="flex flex-col items-center justify-center min-w-[60px] py-2 bg-indigo-600 rounded-xl shadow-lg border border-indigo-700">
                                        <span className="text-xl font-medium text-white leading-none">
                                            {new Date(entry.date + 'T12:00:00').getDate()}
                                        </span>
                                        <span className="text-[12px] font-medium text-indigo-100 uppercase tracking-widest mt-0.5">
                                            {new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(entry.date + 'T12:00:00')).replace('.', '')}
                                        </span>
                                    </div>
                                    <div className="flex-1 flex flex-wrap gap-2 justify-end">
                                        <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 rounded-lg text-amber-700 border border-amber-100">
                                            <Sun className="w-3 h-3" />
                                            <span className="text-[12px] font-medium uppercase tracking-widest">{entry.weather}</span>
                                        </div>
                                        <div className={`px-2 py-1 rounded-lg text-[12px] font-medium uppercase tracking-widest border ${entry.status === 'Aprovado' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                            entry.status === 'Recusado' ? 'bg-red-50 text-red-600 border-red-100' :
                                                'bg-indigo-50 text-indigo-600 border-indigo-100'
                                            }`}>
                                            {entry.status || 'Rascunho'}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 space-y-4">
                                    <p className="text-gray-700 text-sm font-medium leading-relaxed italic line-clamp-4">"{entry.description || 'Sem descrição'}"</p>

                                    {entry.activities && entry.activities.length > 0 && (
                                        <div className="space-y-1">
                                            <span className="text-[12px] font-medium text-gray-400 uppercase tracking-widest block mb-1">Atividades Principais</span>
                                            {entry.activities.slice(0, 3).map((act, i) => (
                                                <div key={i} className="flex items-center gap-2 text-[12px] text-gray-600">
                                                    <CheckCircle2 className={`w-3 h-3 shrink-0 ${act.status === 'Finalizada' ? 'text-emerald-500' : 'text-amber-500'}`} />
                                                    <span className="truncate flex-1 font-medium">{act.description}</span>
                                                    <span className="font-medium text-indigo-600">{act.evolution}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="flex flex-wrap gap-2 pt-2">
                                        {(entry.images?.length || 0) > 0 && <span className="flex items-center gap-1 text-[12px] font-medium text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100"><Camera className="w-3 h-3" /> {entry.images?.length} fotos</span>}
                                        {(entry.videos?.length || 0) > 0 && <span className="flex items-center gap-1 text-[12px] font-medium text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100"><Video className="w-3 h-3" /> {entry.videos?.length} vídeos</span>}
                                        {(entry.documents?.length || 0) > 0 && <span className="flex items-center gap-1 text-[12px] font-medium text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100"><FileText className="w-3 h-3" /> {entry.documents?.length} docs</span>}
                                    </div>
                                </div>

                                <div className="mt-6 flex justify-between items-center pt-4 border-t border-gray-50">
                                    <div className="flex -space-x-2">
                                        {entry.images?.slice(0, 3).map((img, i) => (
                                            <div key={i} className="w-8 h-8 rounded-lg border border-white overflow-hidden shadow-sm">
                                                <img src={img} className="w-full h-full object-cover" />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => handleEdit(entry)} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"><Pencil className="w-4 h-4" /></button>
                                        <button onClick={() => handleDelete(entry.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="px-6 py-4 text-[12px] font-medium text-gray-400 uppercase tracking-widest w-[120px]">Data</th>
                                    <th className="px-6 py-4 text-[12px] font-medium text-gray-400 uppercase tracking-widest">Relato Curto</th>
                                    <th className="px-6 py-4 text-[12px] font-medium text-gray-400 uppercase tracking-widest w-[150px]">Status</th>
                                    <th className="px-6 py-4 text-[12px] font-medium text-gray-400 uppercase tracking-widest w-[100px] text-center">Clima</th>
                                    <th className="px-6 py-4 text-[12px] font-medium text-gray-400 uppercase tracking-widest w-[120px] text-center">Mídia</th>
                                    <th className="px-6 py-4 text-right"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {entries.map((entry) => (
                                    <tr key={entry.id} className="hover:bg-gray-50/50 transition-colors group cursor-pointer" onClick={() => handleEdit(entry)}>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 flex flex-col items-center justify-center bg-indigo-50 rounded-xl text-indigo-600 border border-indigo-100">
                                                    <span className="text-sm font-medium leading-none">{new Date(entry.date + 'T12:00:00').getDate()}</span>
                                                    <span className="text-[12px] font-medium uppercase">{new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(entry.date + 'T12:00:00')).replace('.', '')}</span>
                                                </div>
                                                <span className="text-sm font-medium text-gray-400">{new Date(entry.date + 'T12:00:00').getFullYear()}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="space-y-1">
                                                <p className="text-sm font-medium text-gray-700 line-clamp-1">{entry.description || 'Sem descrição'}</p>
                                                <div className="flex gap-2">
                                                    {entry.activities?.slice(0, 2).map((act, i) => (
                                                        <span key={i} className="text-xs font-bold text-gray-400 border border-gray-100 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                                                            <CheckCircle2 className="w-2.5 h-2.5" /> {act.evolution}%
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-[12px] font-medium uppercase tracking-wider ${entry.status === 'Aprovado' ? 'bg-emerald-50 text-emerald-600' :
                                                entry.status === 'Recusado' ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'
                                                }`}>
                                                {entry.status || 'Rascunho'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                <Sun className="w-4 h-4 text-amber-500" />
                                                <span className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">{entry.weather}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex items-center justify-center gap-3">
                                                {(entry.images?.length || 0) > 0 && <div className="flex flex-col items-center text-indigo-400"><Camera className="w-4 h-4" /><span className="text-[12px] font-medium">{entry.images?.length}</span></div>}
                                                {(entry.videos?.length || 0) > 0 && <div className="flex flex-col items-center text-blue-400"><Video className="w-4 h-4" /><span className="text-[12px] font-medium">{entry.videos?.length}</span></div>}
                                                {(entry.documents?.length || 0) > 0 && <div className="flex flex-col items-center text-emerald-400"><FileText className="w-4 h-4" /><span className="text-[12px] font-medium">{entry.documents?.length}</span></div>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                <button onClick={(e) => { e.stopPropagation(); handleEdit(entry); }} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"><Pencil className="w-4 h-4" /></button>
                                                <button onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Notification toast */}
            {notification && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-gray-900 text-white rounded-2xl shadow-2xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300">
                    {notification}
                    <button onClick={() => setNotification(null)} className="text-gray-400 hover:text-white ml-2"><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Confirm delete modal */}
            {confirmDeleteId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-8 max-w-sm w-full mx-4 animate-in zoom-in-95 duration-200">
                        <h3 className="text-base font-medium text-gray-900 mb-2">Excluir registro</h3>
                        <p className="text-sm text-gray-500 mb-6">Esta ação não pode ser desfeita. O registro diário será removido permanentemente.</p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-5 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="px-5 py-2 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-100"
                            >
                                Excluir
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};

export default ProjectDiaryManager;
