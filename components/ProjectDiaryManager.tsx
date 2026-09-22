import React, { useState, useMemo, useEffect } from 'react';
import {
    BookOpen,
    Plus,
    Calendar,
    CalendarClock,
    CalendarRange,
    ChevronDown,
    Hourglass,
    Users,
    FileText,
    Download,
    MoreHorizontal,
    Camera,
    Paperclip,
    Save,
    CheckCircle2,
    X,
    ArrowLeft,
    Link2,
    FileDown,
    Settings,
    Sun,
    CloudRain,
    CloudSun,
    Ban,
    Video
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { KpiCard } from './ui/KpiCard';
import StandardTable, { StandardTableColumn } from './ui/StandardTable';
import TabsBar from './ui/TabsBar';
import DiaryLaborFromRhSheet from './DiaryLaborFromRhSheet';
import type { Employee } from '../services/laborService';
import { ProjectSettings, DiaryEntry, BudgetEntry, WeatherShift, DiaryActivity, LaborEntry, ProjectSchedule } from '../types';
import { projectService } from '../services/projectService';
import { useStore } from '../store/useStore';
import Button from './ui/Button';


type DiaryEditorTab = 'clima' | 'atividades' | 'comentarios' | 'arquivos';

/** Painel lateral "Status do relatório" — cor de texto por status, sem pílula (§8). */
const REPORT_STATUS_OPTIONS: { val: NonNullable<DiaryEntry['status']>; hint: string; active: string }[] = [
    { val: 'Rascunho',   hint: 'Em preenchimento',               active: 'bg-gray-100 text-gray-800 border-gray-200' },
    { val: 'Em Análise', hint: 'Aguardando conferência',         active: 'bg-amber-50 text-amber-700 border-amber-200' },
    { val: 'Aprovado',   hint: 'Conferido e validado',           active: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { val: 'Recusado',   hint: 'Devolvido para correção',        active: 'bg-red-50 text-red-700 border-red-200' },
];

// Efetivo de Mão de Obra (editor do registro) — células editáveis §7.1.
const LABOR_COLUMNS: StandardTableColumn[] = [
    { key: 'category', label: 'Trabalhador / equipe', sortable: true, width: 320 },
    { key: 'quantity', label: 'Qtd', sortable: true, width: 90, align: 'center' },
    { key: 'hours', label: 'Horas', sortable: true, width: 90, align: 'center' },
    { key: 'observations', label: 'Observações', sortable: true, width: 320 },
];
/** Linha da tabela do efetivo: a entrada mais o índice em `formData.labor` (sem id próprio). */
type LaborRow = LaborEntry & { idx: number };
const LABOR_DATALIST_ID = 'diario-efetivo-sugestoes';

// §6.10 — só colunas de DADO; "Ações" entra por `actions`.
const DIARY_COLUMNS: StandardTableColumn[] = [
    // soma (1170) + Ações (110) cabe na largura útil de 1290px sem rolagem horizontal
    { key: 'date', label: 'Data', sortable: true, width: 115 },
    { key: 'description', label: 'Relato', sortable: true, width: 290 },
    { key: 'activities', label: 'Atividades', sortable: true, width: 110, align: 'center' },
    { key: 'labor', label: 'Efetivo', sortable: true, width: 95, align: 'center' },
    { key: 'weather', label: 'Clima', sortable: true, width: 125 },
    { key: 'media', label: 'Mídia', sortable: true, width: 125, align: 'center' },
    { key: 'impediments', label: 'Impedimentos', sortable: true, width: 190 },
    { key: 'status', label: 'Situação', sortable: true, width: 120 },
];

/** 'YYYY-MM-DD' ancorado ao meio-dia local — `new Date('YYYY-MM-DD')` é UTC e volta um dia em UTC-3. */
const parseEntryDate = (raw: string) => new Date(`${String(raw).slice(0, 10)}T12:00:00`);
const formatEntryDate = (raw: string) => {
    const d = parseEntryDate(raw);
    return isNaN(d.getTime()) ? raw : d.toLocaleDateString('pt-BR');
};

/** §8 — texto colorido simples, sem pílula. */
const STATUS_COLOR: Record<NonNullable<DiaryEntry['status']>, string> = {
    'Rascunho': 'text-gray-600',
    'Em Análise': 'text-amber-600',
    'Aprovado': 'text-green-600',
    'Recusado': 'text-red-600',
};

const mediaCount = (e: DiaryEntry) => (e.images?.length || 0) + (e.videos?.length || 0) + (e.documents?.length || 0);
const laborCount = (e: DiaryEntry) => (e.labor || []).reduce((s, l) => s + (Number(l.quantity) || 0), 0);

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
    // O diário SEMPRE abre na tabela de registros. `isAdding`/`editingId` eram
    // persistidos em localStorage: quem saía com um registro aberto (seta ←)
    // reabria o diário direto no editor — com o formulário vazio e `editingId`
    // apontando para o último registro, que um Salvar sobrescreveria em branco
    // (2026-09-22). As chaves antigas são limpas para não ressuscitar o estado.
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    React.useEffect(() => {
        localStorage.removeItem('diary_is_adding');
        localStorage.removeItem('diary_editing_id');
    }, []);
    // "Dados gerais" foi desmembrada em 2026-09-21: Condições Climáticas e
    // Atividades do Dia (efetivo + atividades) viraram abas próprias. O valor
    // persistido 'geral' cai na primeira delas.
    const [activeTab, setActiveTab] = useState<DiaryEditorTab>(() => {
        const salvo = localStorage.getItem('diary_active_tab') as DiaryEditorTab | 'geral' | null;
        return salvo && salvo !== 'geral' ? salvo : 'clima';
    });
    const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);
    const [isLinkingPlanningOpen, setIsLinkingPlanningOpen] = useState(false);
    const [linkedSchedule, setLinkedSchedule] = useState<ProjectSchedule | null>(null);
    const [linkedBudget, setLinkedBudget] = useState<BudgetEntry[]>([]);
    const [isLoadingLinked, setIsLoadingLinked] = useState(false);

    React.useEffect(() => {
        if (activeTab) localStorage.setItem('diary_active_tab', activeTab);
    }, [activeTab]);

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
    const [rhSheetOpen, setRhSheetOpen] = useState(false);

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

    // A busca (data, relato, atividades) é da StandardTable — array estável para o recorte.
    const entries = useMemo(() => settings.diaryEntries || [], [settings.diaryEntries]);

    const metrics = useMemo(() => {
        if (!settings.schedule?.startDate || !settings.schedule?.endDate) {
            return { remaining: 0, total: 0, elapsed: 0, period: 'datas não definidas' };
        }
        const start = parseEntryDate(settings.schedule.startDate);
        const end = parseEntryDate(settings.schedule.endDate);
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
        setActiveTab('clima');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleEdit = (entry: DiaryEntry, targetTab: DiaryEditorTab = 'clima') => {
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

    /**
     * Itens do cronograma que podem ser vinculados a uma atividade: só os que
     * ainda existem no orçamento do planejamento. `itemSchedules` guarda linhas
     * órfãs de versões anteriores do orçamento (Divino Espírito Santo: 132 no
     * cronograma, 37 no orçamento) — sem nome, elas apareciam como dezenas de
     * "Item sem nome" no select. Mesmo critério de OperacionalForm.
     */
    const itensCronogramaVinculaveis = useMemo(() => {
        const its = linkedSchedule?.itemSchedules || [];
        const porId = new Map(linkedBudget.map(b => [b.id, b]));
        return its
            .map(is => ({ schedule: is, budget: porId.get(is.id) }))
            .filter((x): x is { schedule: typeof x.schedule; budget: BudgetEntry } => !!x.budget && !!x.budget.sinapiItem?.description);
    }, [linkedSchedule, linkedBudget]);

    const laborRows = useMemo<LaborRow[]>(
        () => (formData.labor || []).map((lab, idx) => ({ ...lab, idx })),
        [formData.labor],
    );

    /** Efetivo vindo de RH › Colaboradores: uma linha por colaborador, cargo em observações. */
    const addLaborFromRh = (colaboradores: Employee[]) => {
        const novos: LaborEntry[] = colaboradores.map(c => ({ category: c.name, quantity: 1, observations: c.role || '' }));
        setFormData(prev => ({ ...prev, labor: [...(prev.labor || []), ...novos] }));
        notify(`${novos.length} colaborador(es) adicionado(s) ao efetivo.`);
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
            {/* §20 — h1 solto + subtítulo mt-1.5 (o subtítulo carrega o seletor de obra);
                ações na mesma linha, à direita, como na lista de diários */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    {onBackToList && (
                        <button
                            onClick={onBackToList}
                            className="h-9 w-9 flex items-center justify-center bg-white text-gray-500 border border-gray-200 rounded-[6px] hover:bg-gray-50 hover:text-gray-700 transition-all active:scale-95 shrink-0"
                            title="Voltar para a lista"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Diário de Obras</h1>
                        <div className="text-gray-400 text-sm mt-1.5 font-medium flex items-center gap-1.5">
                            <span>Obra:</span>
                            <div className="relative">
                                <button
                                    onClick={() => setIsProjectSelectorOpen(!isProjectSelectorOpen)}
                                    className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                                >
                                    {settings.name || 'Selecionar obra'}
                                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isProjectSelectorOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {isProjectSelectorOpen && (
                                    <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="px-3 py-2 border-b border-gray-50 mb-1">
                                            <span className="text-xs font-medium text-gray-400 uppercase tracking-widest">Minhas Obras</span>
                                        </div>
                                        <div className="max-h-60 overflow-y-auto">
                                            {projects
                                                .filter(p => p.settings?.classification !== 'COMERCIAL')
                                                .map((p) => (
                                                    <button
                                                        key={p.id}
                                                        onClick={() => {
                                                            onLoadProject(p.id, 'project-diary');
                                                            setIsProjectSelectorOpen(false);
                                                        }}
                                                        className={`w-full text-left px-4 py-2 text-button font-medium hover:bg-gray-50 flex items-center justify-between group ${p.id === settings.id ? 'text-indigo-600 bg-indigo-50/50' : 'text-gray-600'}`}
                                                    >
                                                        <span className="truncate">{p.name}</span>
                                                        {p.id === settings.id && <CheckCircle2 className="w-4 h-4 text-indigo-500" />}
                                                    </button>
                                                ))}
                                            {projects.length === 0 && (
                                                <div className="px-4 py-8 text-center">
                                                    <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">Nenhuma obra encontrada</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* §17 — variante compacta; o vínculo de planejamento é ação secundária (borda), cor pelo estado */}
                <div className="flex items-center gap-2 shrink-0">
                    <div className="relative">
                            <button
                                onClick={() => setIsLinkingPlanningOpen(!isLinkingPlanningOpen)}
                                className={`flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 ${autoLinkedProjectId
                                    ? (settings.linkedProjectId ? 'text-emerald-600 hover:bg-emerald-50' : 'text-blue-600 hover:bg-blue-50')
                                    : 'text-amber-600 hover:bg-amber-50'
                                    }`}
                            >
                                <Link2 className="w-[15px] h-[15px]" />
                                {settings.linkedProjectId ? 'Planejamento ativo' : (autoLinkedProjectId ? 'Planejamento automático' : 'Vincular planejamento')}
                            </button>

                            {isLinkingPlanningOpen && (
                                <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">Selecionar Planejamento</h4>
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
                                                        className={`w-full text-left px-4 py-3 rounded-xl text-button font-medium transition-all flex items-center justify-between group ${isManual || isAuto
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
                                                <p className="text-xs font-bold text-gray-400 uppercase">Nenhum planejamento encontrado</p>
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
                                            className="w-full mt-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-xl transition-all uppercase tracking-widest"
                                        >
                                            Remover Vínculo
                                        </button>
                                    )}
                                </div>
                            )}
                    </div>
                    <button
                        onClick={() => onGenerateReport?.()}
                        className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                        title="Gerar relatório"
                    >
                        <FileDown className="w-4 h-4" />
                    </button>
                    <button disabled title="Configurações (em breve)" className="h-9 w-9 flex items-center justify-center bg-gray-50 text-gray-400 rounded-[6px] cursor-not-allowed opacity-60">
                        <Settings className="w-4 h-4" />
                    </button>
                    {/* Editando: Cancelar + Salvar registro tomam o lugar de "Nova entrada" (§17) */}
                    {isAdding ? (
                        <>
                            <button
                                type="button"
                                onClick={() => { setIsAdding(false); setEditingId(null); resetForm(); }}
                                className="h-9 px-3.5 bg-white text-gray-600 border border-gray-200 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                            >
                                <Save className="w-[15px] h-[15px]" />
                                Salvar registro
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={handleAddNew}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                        >
                            <Plus className="w-[15px] h-[15px]" />
                            Nova entrada
                        </button>
                    )}
                </div>
            </div>

            {/* Abas do editor — §19.1, na ordem título → abas → KPIs (§20.1); só existem enquanto se edita */}
            {isAdding && (
                <TabsBar
                    tabs={[
                        { id: 'clima', label: 'Condições Climáticas' },
                        { id: 'atividades', label: 'Atividades do Dia', badge: (formData.labor?.length || 0) + (formData.activities?.length || 0) },
                        { id: 'comentarios', label: 'Comentários' },
                        { id: 'arquivos', label: 'Arquivos', badge: (formData.images?.length || 0) + (formData.videos?.length || 0) + (formData.documents?.length || 0) },
                    ]}
                    value={activeTab}
                    onChange={setActiveTab}
                />
            )}

            {/* §4 + §20.1 — prazos da obra como KPIs; mb-3 fecha o bloco de cromo */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                <KpiCard label="Prazo restante" value={`${metrics.remaining} dias`} icon={<Hourglass className="w-4 h-4" />} color="blue" />
                <KpiCard label="Prazo total" value={`${metrics.total} dias`} icon={<CalendarRange className="w-4 h-4" />} color="gray" />
                <KpiCard label="Prazo decorrido" value={`${metrics.elapsed} dias`} icon={<CalendarClock className="w-4 h-4" />} color="emerald" />
                <KpiCard label="Período planejado" value={metrics.period} icon={<Calendar className="w-4 h-4" />} color="gray" />
            </div>

            {
                isAdding && (
                    <div className="bg-white rounded-3xl shadow-2xl border border-indigo-100 animate-in zoom-in-95 duration-200">
                        {/* Corpo: conteúdo da aba ativa à esquerda; Data + Status em painel lateral à direita.
                            As abas ficam acima dos KPIs (§19.1/§20.1) e a data mora no painel — o card não tem cabeçalho. */}
                        <div className="flex flex-col lg:flex-row">
                        <div className="flex-1 min-w-0">
                        <div className="p-8">
                            {activeTab === 'clima' && (
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
                                            <span className="text-xs font-medium">Previsão do tempo automática estará disponível em breve. Registre as condições observadas na tabela abaixo.</span>
                                        </div>

                                        <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-gray-50 border-b border-gray-100">
                                                        <th className="px-6 py-3 text-table-header font-medium text-gray-400 uppercase tracking-widest">Turno</th>
                                                        <th className="px-6 py-3 text-table-header font-medium text-gray-400 uppercase tracking-widest">Tempo</th>
                                                        <th className="px-6 py-3 text-table-header font-medium text-gray-400 uppercase tracking-widest">Condição</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {(formData.weatherShifts || []).map((shift, idx) => (
                                                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                                            <td className="px-6 py-4 text-table-body font-medium text-gray-600">{shift.turn}</td>
                                                            <td className="px-6 py-4">
                                                                <select
                                                                    value={shift.weather}
                                                                    onChange={(e) => handleWeatherShiftChange(idx, 'weather', e.target.value)}
                                                                    className="bg-transparent border-none outline-none text-form-input font-medium text-gray-700 bg-gray-50 px-3 py-1.5 rounded-lg focus:bg-white focus:ring-1 focus:ring-indigo-100 transition-all"
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
                                                                            className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${shift.condition === c ? (c === 'Praticável' ? 'bg-emerald-500 text-white shadow-md shadow-emerald-100' : 'bg-red-500 text-white shadow-md shadow-red-100') : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
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
                                </div>
                            )}

                            {activeTab === 'atividades' && (
                                <div className="space-y-10">
                                    {/* Efetivo de Mão de Obra — §6.10 StandardTable com células editáveis §7.1;
                                        os botões de adicionar moram em toolbarRight (§17). O dropdown legado de
                                        sugestões (organizations[].resources) virou <datalist>: dentro da tabela um
                                        popover absoluto seria cortado pelo overflow. */}
                                    <section>
                                        <h3 className="text-[14px] font-medium text-gray-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                                            <MoreHorizontal className="w-5 h-5 text-indigo-500" />
                                            Efetivo de Mão de Obra
                                        </h3>
                                        <datalist id={LABOR_DATALIST_ID}>
                                            {laborSuggestions.map(sug => (
                                                <option key={`${sug.type}-${sug.id}`} value={sug.name}>{sug.subLabel}</option>
                                            ))}
                                        </datalist>
                                        <StandardTable<LaborRow>
                                            storageKey="diario:efetivo"
                                            columns={LABOR_COLUMNS}
                                            rows={laborRows}
                                            rowKey={r => String(r.idx)}
                                            searchText={r => `${r.category} ${r.observations || ''}`}
                                            searchPlaceholder="Buscar no efetivo..."
                                            sortValue={(key, r) => {
                                                switch (key) {
                                                    case 'category': return r.category || '';
                                                    case 'quantity': return Number(r.quantity) || 0;
                                                    case 'hours': return Number(r.hours) || 0;
                                                    case 'observations': return r.observations || '';
                                                    default: return null;
                                                }
                                            }}
                                            renderCell={(key, r) => {
                                                const campo = 'w-full text-sm font-normal px-2 py-1 rounded border transition-all outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
                                                const estado = (v: unknown) => (v !== '' && v !== undefined && v !== null && v !== 0)
                                                    ? 'text-gray-900 bg-gray-50 border-gray-100'
                                                    : 'text-gray-400 bg-white border-dashed border-gray-200';
                                                switch (key) {
                                                    case 'category':
                                                        return (
                                                            <input
                                                                list={LABOR_DATALIST_ID}
                                                                placeholder="Trabalhador, equipe ou função"
                                                                value={r.category}
                                                                onChange={(e) => {
                                                                    const nome = e.target.value;
                                                                    handleLaborChange(r.idx, 'category', nome);
                                                                    // Escolheu um trabalhador da lista: a função vai para observações (como o dropdown antigo fazia)
                                                                    const w = laborSuggestions.find(sug => sug.type === 'worker' && sug.name === nome);
                                                                    if (w?.subLabel && !r.observations) handleLaborChange(r.idx, 'observations', w.subLabel);
                                                                }}
                                                                className={`${campo} ${estado(r.category)}`}
                                                            />
                                                        );
                                                    case 'quantity':
                                                        return (
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                value={r.quantity}
                                                                onChange={(e) => handleLaborChange(r.idx, 'quantity', parseInt(e.target.value) || 0)}
                                                                className={`${campo} text-center ${estado(r.quantity)}`}
                                                            />
                                                        );
                                                    case 'hours':
                                                        return (
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                step={0.5}
                                                                placeholder="8"
                                                                value={r.hours || ''}
                                                                onChange={(e) => handleLaborChange(r.idx, 'hours', parseFloat(e.target.value) || 0)}
                                                                className={`${campo} text-center ${estado(r.hours)}`}
                                                            />
                                                        );
                                                    case 'observations':
                                                        return (
                                                            <input
                                                                placeholder="Ex.: Terceirizado"
                                                                value={r.observations || ''}
                                                                onChange={(e) => handleLaborChange(r.idx, 'observations', e.target.value)}
                                                                className={`${campo} ${estado(r.observations)}`}
                                                            />
                                                        );
                                                    default:
                                                        return null;
                                                }
                                            }}
                                            actions={{
                                                width: 80,
                                                render: r => <ActionIconButton kind="delete" onClick={() => removeLabor(r.idx)} />,
                                            }}
                                            toolbarRight={
                                                <div className="flex items-center gap-2">
                                                    {(linkedBudget.length > 0 || linkedSchedule) && (
                                                        <button
                                                            type="button"
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
                                                            className="flex items-center gap-1.5 h-9 px-3.5 bg-white text-emerald-600 border border-gray-200 rounded-[6px] hover:bg-emerald-50 font-medium text-[13px] transition-all active:scale-95"
                                                        >
                                                            <Download className="w-[15px] h-[15px]" /> Importar do planejamento
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setRhSheetOpen(true)}
                                                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white text-blue-600 border border-gray-200 rounded-[6px] hover:bg-blue-50 font-medium text-[13px] transition-all active:scale-95"
                                                        title="Selecionar colaboradores de Recursos Humanos › Colaboradores"
                                                    >
                                                        <Users className="w-[15px] h-[15px]" /> Adicionar do RH
                                                    </button>
                                                    {/* §17 — variante compacta */}
                                                    <button
                                                        type="button"
                                                        onClick={addLabor}
                                                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                                                    >
                                                        <Plus className="w-[15px] h-[15px]" /> Adicionar mão de obra
                                                    </button>
                                                </div>
                                            }
                                            empty={{
                                                icon: <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                                                title: 'Nenhum efetivo lançado',
                                                subtitle: 'Adicione do RH, importe do planejamento ou lance uma linha manual.',
                                            }}
                                        />
                                    </section>

                                    {/* Activities */}
                                    <section>
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="text-[14px] font-medium text-gray-800 uppercase tracking-widest flex items-center gap-2">
                                                <CheckCircle2 className="w-5 h-5 text-indigo-500" />
                                                Atividades do Dia
                                            </h3>
                                            <button onClick={addActivity} className="flex items-center gap-2 text-xs font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl hover:bg-indigo-100 active:scale-95 transition-all outline-none border border-indigo-100 uppercase tracking-widest">
                                                <Plus className="w-4 h-4" /> Adicionar Atividade
                                            </button>
                                        </div>
                                        <div className="space-y-3">
                                            {(formData.activities || []).map((act, idx) => (
                                                <div key={idx} className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-wrap lg:flex-nowrap items-center gap-6 group">
                                                    <div className="flex-1 min-w-[300px] flex items-center gap-4">
                                                        <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 font-bold shrink-0">{idx + 1}</div>
                                                        <div className="flex-1 space-y-2">
                                                            {itensCronogramaVinculaveis.length > 0 ? (
                                                                <div className="flex flex-col gap-1">
                                                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter ml-1">Vincular Item do Cronograma</span>
                                                                    <select
                                                                        value={act.itemId || ''}
                                                                        onChange={(e) => {
                                                                            const itemId = e.target.value;
                                                                            const vinculo = itensCronogramaVinculaveis.find(x => x.schedule.id === itemId);
                                                                            const scheduleItem = vinculo?.schedule;
                                                                            const budgetItem = vinculo?.budget;

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
                                                                        className="w-full bg-indigo-50/50 border border-indigo-100 outline-none focus:bg-white focus:ring-1 focus:ring-indigo-100 p-2.5 rounded-xl text-form-input font-semibold text-indigo-700 transition-all"
                                                                    >
                                                                        <option value="">-- Selecione um item --</option>
                                                                        {itensCronogramaVinculaveis.map(({ schedule: is, budget: budgetItem }) => (
                                                                            <option key={is.id} value={is.id}>
                                                                                {budgetItem.sinapiItem.description}
                                                                            </option>
                                                                        ))}
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
                                                            <span className="text-xs font-bold text-gray-400 uppercase">Evolução</span>
                                                            <span className="text-xs font-bold text-indigo-600 uppercase">{act.evolution || 0}%</span>
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
                                                        <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border ${act.evolution === 100 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                                            {act.evolution === 100 ? 'Finalizada' : 'Em Andamento'}
                                                        </span>
                                                        <ActionIconButton kind="delete" onClick={() => removeActivity(idx)} />
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
                                            <span className="text-xs font-bold text-indigo-800 uppercase tracking-widest">Fotos</span>
                                            <span className="text-xs text-indigo-400 font-medium">JPG, PNG</span>
                                        </div>
                                        <div className="relative group overflow-hidden bg-blue-50 border-2 border-dashed border-blue-200 rounded-3xl p-8 flex flex-col items-center justify-center text-center hover:bg-blue-100/50 hover:border-blue-400 transition-all cursor-pointer shadow-sm active:scale-95">
                                            <input type="file" accept="video/*" onChange={(e) => handleFileUpload(e, 'video')} className="absolute inset-0 opacity-0 cursor-pointer" />
                                            <Video className="w-8 h-8 text-blue-500 mb-3" />
                                            <span className="text-xs font-bold text-blue-800 uppercase tracking-widest">Vídeos</span>
                                            <span className="text-xs text-blue-400 font-medium">MP4</span>
                                        </div>
                                        <div className="relative group overflow-hidden bg-emerald-50 border-2 border-dashed border-emerald-200 rounded-3xl p-8 flex flex-col items-center justify-center text-center hover:bg-emerald-100/50 hover:border-emerald-400 transition-all cursor-pointer shadow-sm active:scale-95">
                                            <input type="file" onChange={(e) => handleFileUpload(e, 'document')} className="absolute inset-0 opacity-0 cursor-pointer" />
                                            <FileText className="w-8 h-8 text-emerald-500 mb-3" />
                                            <span className="text-xs font-bold text-emerald-800 uppercase tracking-widest">Documentos</span>
                                            <span className="text-xs text-emerald-400 font-medium">PDF, DOC, XLS</span>
                                        </div>
                                    </div>

                                    {/* Media Grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                                        {(formData.images || []).map((img, i) => (
                                            <div key={i} className="aspect-square relative group bg-gray-100 rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-xl transition-all">
                                                <img src={img} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                                <Button onClick={() => removeFile(i, 'image')} variant="danger" size="icon" className="absolute top-3 right-3 rounded-full opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100"><X className="w-4 h-4" /></Button>
                                            </div>
                                        ))}
                                        {(formData.videos || []).map((vid, i) => (
                                            <div key={i} className="aspect-square relative group bg-slate-900 rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-xl transition-all flex items-center justify-center">
                                                <Video className="w-10 h-10 text-white/50" />
                                                <Button onClick={() => removeFile(i, 'video')} variant="danger" size="icon" className="absolute top-3 right-3 rounded-full opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100"><X className="w-4 h-4" /></Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        </div>

                        {/* Painel lateral direito — Status do relatório (lista vertical; cor por status, §8) */}
                        <aside className="lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-gray-100 p-6 space-y-6">
                            <div className="space-y-1.5">
                                <label htmlFor="diario-data" className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4 text-gray-400" /> Data do diário
                                </label>
                                <input
                                    id="diario-data"
                                    type="date"
                                    value={formData.date}
                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                />
                            </div>
                            <div className="space-y-3">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900">Status do relatório</h3>
                                <p className="text-xs text-gray-400 mt-0.5">Situação deste registro do diário.</p>
                            </div>
                            <div className="space-y-2" role="radiogroup" aria-label="Status do relatório">
                                {REPORT_STATUS_OPTIONS.map(opt => {
                                    const ativo = (formData.status || 'Rascunho') === opt.val;
                                    return (
                                        <button
                                            key={opt.val}
                                            type="button"
                                            role="radio"
                                            aria-checked={ativo}
                                            onClick={() => setFormData({ ...formData, status: opt.val })}
                                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-[6px] border text-left transition-all ${ativo ? opt.active : 'bg-white text-gray-700 border-gray-100 hover:bg-gray-50'}`}
                                        >
                                            <span className="min-w-0">
                                                <span className="block text-sm font-medium">{opt.val}</span>
                                                <span className={`block text-xs ${ativo ? 'opacity-80' : 'text-gray-400'}`}>{opt.hint}</span>
                                            </span>
                                            {ativo && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                                        </button>
                                    );
                                })}
                            </div>
                            </div>
                        </aside>
                        </div>
                    </div >
                )
            }

            {/* Registros — §6.10 StandardTable: busca acoplada, colunas, autofit, ordenação */}
            <StandardTable<DiaryEntry>
                storageKey="diario:registros"
                columns={DIARY_COLUMNS}
                rows={entries}
                rowKey={e => e.id}
                searchScope={settings.name}
                searchPlaceholder="Buscar por data, relato ou atividade..."
                searchText={e => [
                    e.date,
                    formatEntryDate(e.date),
                    e.description || '',
                    e.impediments || '',
                    ...(e.activities || []).map(a => a.description),
                ].join(' ')}
                sortValue={(key, e) => {
                    switch (key) {
                        case 'date': return e.date;
                        case 'description': return e.description || '';
                        case 'activities': return e.activities?.length || 0;
                        case 'labor': return laborCount(e);
                        case 'weather': return e.weather || '';
                        case 'media': return mediaCount(e);
                        case 'impediments': return e.impediments || '';
                        case 'status': return e.status || 'Rascunho';
                        default: return null;
                    }
                }}
                renderCell={(key, e) => {
                    switch (key) {
                        case 'date':
                            return <span className="text-sm font-normal text-gray-700 whitespace-nowrap">{formatEntryDate(e.date)}</span>;
                        case 'description':
                            return <span className="text-sm font-normal text-gray-700 truncate block" title={e.description}>{e.description || '-'}</span>;
                        case 'activities': {
                            const acts = e.activities || [];
                            const done = acts.filter(a => a.status === 'Finalizada').length;
                            return <span className="text-sm font-normal text-gray-700">{acts.length ? `${done}/${acts.length}` : '-'}</span>;
                        }
                        case 'labor': {
                            const n = laborCount(e);
                            return <span className="text-sm font-normal text-gray-700">{n || '-'}</span>;
                        }
                        case 'weather':
                            return (
                                <span className="flex items-center gap-1.5 text-sm font-normal text-gray-700">
                                    <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                    <span className="truncate">{e.weather || '-'}</span>
                                </span>
                            );
                        case 'media': {
                            const img = e.images?.length || 0, vid = e.videos?.length || 0, doc = e.documents?.length || 0;
                            if (!img && !vid && !doc) return <span className="text-sm font-normal text-gray-400">-</span>;
                            return (
                                <span className="flex items-center justify-center gap-3 text-sm font-normal text-gray-700">
                                    {img > 0 && <span className="flex items-center gap-1" title="Fotos"><Camera className="w-3.5 h-3.5 text-gray-400" />{img}</span>}
                                    {vid > 0 && <span className="flex items-center gap-1" title="Vídeos"><Video className="w-3.5 h-3.5 text-gray-400" />{vid}</span>}
                                    {doc > 0 && <span className="flex items-center gap-1" title="Documentos"><FileText className="w-3.5 h-3.5 text-gray-400" />{doc}</span>}
                                </span>
                            );
                        }
                        case 'impediments':
                            return e.impediments?.trim()
                                ? <span className="text-sm font-normal text-amber-600 truncate block" title={e.impediments}>{e.impediments}</span>
                                : <span className="text-sm font-normal text-gray-400">-</span>;
                        case 'status': {
                            const st = e.status || 'Rascunho';
                            return <span className={`text-sm font-normal ${STATUS_COLOR[st]}`}>{st}</span>;
                        }
                        default:
                            return null;
                    }
                }}
                onRowClick={e => handleEdit(e)}
                actions={{
                    width: 110,
                    render: e => (
                        <div className="flex items-center justify-end gap-1" onClick={ev => ev.stopPropagation()}>
                            <ActionIconButton kind="edit" onClick={() => handleEdit(e)} />
                            <ActionIconButton kind="delete" onClick={() => handleDelete(e.id)} />
                        </div>
                    ),
                }}
                empty={{
                    icon: <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhum registro ainda',
                    subtitle: 'Os registros aparecerão aqui conforme você os adiciona.',
                }}
            />

            <DiaryLaborFromRhSheet
                open={rhSheetOpen}
                onClose={() => setRhSheetOpen(false)}
                jaNoEfetivo={(formData.labor || []).map(l => l.category)}
                onAdd={addLaborFromRh}
            />

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
                            <Button
                                onClick={confirmDelete}
                                variant="danger"
                                className="shadow-lg shadow-red-100"
                            >
                                Excluir
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};

export default ProjectDiaryManager;
