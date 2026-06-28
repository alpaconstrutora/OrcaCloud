import React from 'react';
import {
    X, Plus, Edit3, Copy, Trash2, Save, ClipboardList,
    Loader2, ChevronDown, ChevronRight, CheckSquare,
    Square, BookOpen, ListChecks, Tag
} from 'lucide-react';
import { contractScopeService, ContractScopeTemplate } from '../services/contractScopeService';

/* ─── Catálogo predefinido ─── */
interface ScopeGroup { id: string; label: string; items: string[]; }

const CATALOG: ScopeGroup[] = [
    {
        id: '01', label: 'Escopos Preliminares',
        items: ['Levantamento topográfico','Sondagem SPT','Terraplenagem','Limpeza do terreno',
            'Supressão vegetal','Locação da obra','Gabarito','Tapumes','Instalações provisórias',
            'Canteiro de obras','Ligações provisórias (água/energia)','Acessos e logística',
            'Controle tecnológico inicial']
    },
    {
        id: '02', label: 'Fundações',
        items: ['Estaca hélice contínua','Estaca escavada','Estaca pré-moldada','Tubulão',
            'Blocos de fundação','Sapatas isoladas','Sapatas corridas','Radier','Viga baldrame',
            'Impermeabilização de fundações','Reaterro compactado']
    },
    {
        id: '03', label: 'Estrutura de Concreto',
        items: ['Formas','Armaduras','Concretagem','Pilares','Vigas','Lajes maciças',
            'Lajes treliçadas','Lajes protendidas','Escadas em concreto','Estrutura pré-moldada',
            'Estrutura protendida','Cura do concreto','Desforma']
    },
    {
        id: '04', label: 'Estrutura Metálica',
        items: ['Fabricação','Jateamento','Pintura industrial','Montagem metálica',
            'Ligações parafusadas','Ligações soldadas','Cobertura metálica','Mezaninos',
            'Plataformas industriais']
    },
    {
        id: '05', label: 'Alvenaria',
        items: ['Alvenaria de vedação','Alvenaria estrutural','Bloco cerâmico','Bloco de concreto',
            'Vergas e contravergas','Encunhamento','Grauteamento']
    },
    {
        id: '06', label: 'Cobertura',
        items: ['Estrutura de telhado','Telhamento metálico','Telha sanduíche','Telha cerâmica',
            'Rufos e calhas','Condutores pluviais','Lanternim','Isolamento térmico',
            'Impermeabilização de cobertura']
    },
    {
        id: '07', label: 'Impermeabilização',
        items: ['Baldrame','Reservatórios','Lajes','Sacadas','Banheiros','Cortinas','Cobertura',
            'Junta de dilatação','Manta asfáltica','Membrana líquida']
    },
    {
        id: '08', label: 'Revestimentos',
        items: ['Chapisco','Emboço','Reboco','Gesso liso','Drywall','Forro de gesso',
            'Forro mineral','Revestimento cerâmico','Porcelanato','Pedra natural',
            'Fachada ventilada']
    },
    {
        id: '09', label: 'Pisos',
        items: ['Piso industrial','Piso polido','Piso epóxi','Piso vinílico','Piso intertravado',
            'Piso drenante','Contrapiso','Nivelamento']
    },
    {
        id: '10', label: 'Pintura',
        items: ['Massa corrida','Selador','Pintura PVA','Pintura acrílica','Pintura epóxi',
            'Pintura industrial','Demarcação de piso','Textura']
    },
    {
        id: '11', label: 'Esquadrias',
        items: ['Alumínio','PVC','Madeira','Fachada glazing','Portas corta-fogo','Portões',
            'Guarda-corpo','Corrimãos']
    },
    {
        id: '12', label: 'Instalações Hidráulicas',
        items: ['Água fria','Água quente','Esgoto sanitário','Drenagem pluvial','Reservatórios',
            'Barrilete','Bombas','Reuso','Irrigação']
    },
    {
        id: '13', label: 'Instalações Elétricas',
        items: ['Infraestrutura elétrica','Eletrocalhas','Eletrodutos','Cabeamento',
            'Quadros elétricos','SPDA','Aterramento','Iluminação','Automação','Gerador',
            'Subestação']
    },
    {
        id: '14', label: 'HVAC / Climatização',
        items: ['Ar-condicionado split','VRF','Chiller','Exaustão','Pressurização',
            'Ventilação mecânica','Dutos','Automação HVAC']
    },
    {
        id: '15', label: 'Incêndio',
        items: ['Hidrantes','Sprinklers','Alarmes','Detectores','Sinalização',
            'Iluminação de emergência','Casa de bombas','Pressurização de escada']
    },
    {
        id: '16', label: 'Telecom e Segurança',
        items: ['CFTV','Controle de acesso','Cabeamento estruturado','Interfonia',
            'Rede lógica','Wi-Fi corporativo','Cerca elétrica']
    },
    {
        id: '17', label: 'Urbanização Externa',
        items: ['Pavimentação','Drenagem externa','Paisagismo','Guias e sarjetas',
            'Estacionamento','Iluminação externa','Muros','Portaria']
    },
    {
        id: '18', label: 'Obras Industriais',
        items: ['Piso de alta resistência','Docas','Marquises','Ponte rolante',
            'Bases de máquinas','Cabines elétricas','Utilidades industriais','Pipe rack']
    },
    {
        id: '19', label: 'Comissionamento e Entrega',
        items: ['Testes operacionais','Start-up','As built','Manual do proprietário',
            'Treinamento operacional','Punch list','Habite-se','AVCB']
    },
    {
        id: '20', label: 'Gestão e Apoio Técnico',
        items: ['Planejamento','Orçamento','Compatibilização BIM','Controle de qualidade',
            'Segurança do trabalho','Controle de custos','Diário de obra','Medições',
            'Gestão documental','Fiscalização','Gerenciamento de obra']
    },
];

function buildContent(selected: Set<string>): string {
    const lines: string[] = [];
    CATALOG.forEach(g => {
        const picked = g.items.filter(item => selected.has(`${g.id}::${item}`));
        if (picked.length === 0) return;
        lines.push(`${g.id} - ${g.label.toUpperCase()}`);
        picked.forEach(i => lines.push(`• ${i}`));
        lines.push('');
    });
    return lines.join('\n').trim();
}

function groupKey(gid: string, item: string) { return `${gid}::${item}`; }

/* ─── Props ─── */
interface Props {
    organizationId: string;
    onClose: () => void;
    onSelect?: (scope: ContractScopeTemplate) => void;
    mode: 'manage' | 'pick';
}

/* ─── Component ─── */
const ContractScopeManager: React.FC<Props> = ({ organizationId, onClose, onSelect, mode }) => {
    /* tabs */
    const [tab, setTab] = React.useState<'catalog' | 'saved'>('catalog');

    /* catalog state */
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [expanded, setExpanded] = React.useState<Set<string>>(new Set(['01']));

    /* saved templates state */
    const [scopes, setScopes] = React.useState<ContractScopeTemplate[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [editing, setEditing] = React.useState<ContractScopeTemplate | null>(null);
    const [isNew, setIsNew] = React.useState(false);
    const [form, setForm] = React.useState({ name: '', content: '' });
    const [saving, setSaving] = React.useState(false);
    const [deletingId, setDeletingId] = React.useState<string | null>(null);

    /* template name for saving from catalog */
    const [catalogTemplateName, setCatalogTemplateName] = React.useState('');
    const [savingCatalog, setSavingCatalog] = React.useState(false);

    const loadScopes = async () => {
        setLoading(true);
        try { setScopes(await contractScopeService.list(organizationId)); }
        finally { setLoading(false); }
    };

    React.useEffect(() => { loadScopes(); }, [organizationId]);

    /* ── catalog helpers ── */
    const toggleGroup = (gid: string) => {
        setExpanded(prev => {
            const n = new Set(prev);
            n.has(gid) ? n.delete(gid) : n.add(gid);
            return n;
        });
    };

    const toggleItem = (gid: string, item: string) => {
        const k = groupKey(gid, item);
        setSelected(prev => {
            const n = new Set(prev);
            n.has(k) ? n.delete(k) : n.add(k);
            return n;
        });
    };

    const toggleGroupAll = (g: ScopeGroup) => {
        const allChecked = g.items.every(i => selected.has(groupKey(g.id, i)));
        setSelected(prev => {
            const n = new Set(prev);
            if (allChecked) g.items.forEach(i => n.delete(groupKey(g.id, i)));
            else g.items.forEach(i => n.add(groupKey(g.id, i)));
            return n;
        });
    };

    const groupState = (g: ScopeGroup): 'all' | 'some' | 'none' => {
        const count = g.items.filter(i => selected.has(groupKey(g.id, i))).length;
        if (count === 0) return 'none';
        if (count === g.items.length) return 'all';
        return 'some';
    };

    const totalSelected = selected.size;

    const handleUseCatalog = () => {
        if (totalSelected === 0) return;
        const content = buildContent(selected);
        const name = catalogTemplateName.trim() || 'Escopo selecionado';
        const fakeScopeObj: ContractScopeTemplate = {
            id: 'catalog-temp', organization_id: organizationId, name, content
        };
        onSelect?.(fakeScopeObj);
        onClose();
    };

    const handleSaveCatalog = async () => {
        if (totalSelected === 0 || !catalogTemplateName.trim()) return;
        setSavingCatalog(true);
        try {
            await contractScopeService.create({
                organization_id: organizationId,
                name: catalogTemplateName.trim(),
                content: buildContent(selected)
            });
            setCatalogTemplateName('');
            setSelected(new Set());
            await loadScopes();
            setTab('saved');
        } finally { setSavingCatalog(false); }
    };

    /* ── saved templates helpers ── */
    const startNew = () => { setIsNew(true); setEditing(null); setForm({ name: '', content: '' }); };
    const startEdit = (s: ContractScopeTemplate) => { setEditing(s); setIsNew(false); setForm({ name: s.name, content: s.content }); };
    const cancelForm = () => { setEditing(null); setIsNew(false); setForm({ name: '', content: '' }); };

    const handleSave = async () => {
        if (!form.name.trim() || !form.content.trim()) return;
        setSaving(true);
        try {
            if (isNew) await contractScopeService.create({ organization_id: organizationId, name: form.name.trim(), content: form.content.trim() });
            else if (editing) await contractScopeService.update(editing.id, { name: form.name.trim(), content: form.content.trim() });
            cancelForm();
            await loadScopes();
        } finally { setSaving(false); }
    };

    const handleDuplicate = async (id: string) => {
        try { await contractScopeService.duplicate(id); await loadScopes(); } catch (e) { console.error(e); }
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try { await contractScopeService.remove(id); await loadScopes(); } finally { setDeletingId(null); }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden border border-gray-100">

                {/* Header */}
                <div className="bg-[#0B1727] px-8 py-5 text-white flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
                            <ClipboardList className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold tracking-tight">
                                {mode === 'pick' ? 'Buscar Escopo' : 'Gerenciar Escopos'}
                            </h2>
                            <p className="text-blue-400 text-xs uppercase tracking-widest">Catálogo de Serviços de Construção</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all hover:rotate-90 duration-300">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100 bg-gray-50/50 shrink-0">
                    <button
                        onClick={() => setTab('catalog')}
                        className={`flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${tab === 'catalog' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                    >
                        <BookOpen className="w-3.5 h-3.5" />
                        Catálogo
                        {totalSelected > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 bg-blue-600 text-white rounded-full text-[9px] font-black">
                                {totalSelected}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setTab('saved')}
                        className={`flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${tab === 'saved' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                    >
                        <ListChecks className="w-3.5 h-3.5" />
                        Modelos Salvos
                        {scopes.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded-full text-[9px] font-black">
                                {scopes.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* ── CATALOG TAB ── */}
                {tab === 'catalog' && (
                    <>
                        <div className="flex-1 overflow-y-auto">
                            {CATALOG.map(g => {
                                const state = groupState(g);
                                const isOpen = expanded.has(g.id);
                                const pickedCount = g.items.filter(i => selected.has(groupKey(g.id, i))).length;

                                return (
                                    <div key={g.id} className="border-b border-gray-50 last:border-0">
                                        {/* Group header */}
                                        <div className="flex items-center gap-0 px-4 py-1 hover:bg-gray-50/80 group/row">
                                            {/* Checkbox */}
                                            <button
                                                onClick={() => toggleGroupAll(g)}
                                                className="p-1.5 text-gray-400 hover:text-blue-600 flex-shrink-0 transition-colors"
                                            >
                                                {state === 'all'
                                                    ? <CheckSquare className="w-4 h-4 text-blue-600" />
                                                    : state === 'some'
                                                        ? <CheckSquare className="w-4 h-4 text-blue-400" />
                                                        : <Square className="w-4 h-4" />
                                                }
                                            </button>
                                            {/* Expand + label */}
                                            <button
                                                onClick={() => toggleGroup(g.id)}
                                                className="flex items-center gap-2.5 flex-1 py-2.5 text-left min-w-0"
                                            >
                                                <span className="w-7 h-7 rounded-lg bg-blue-600 text-white text-xs font-black flex items-center justify-center flex-shrink-0">
                                                    {g.id}
                                                </span>
                                                <span className="flex-1 text-xs font-black text-gray-900 uppercase tracking-tight">
                                                    {g.label}
                                                </span>
                                                {pickedCount > 0 && (
                                                    <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                                                        {pickedCount}/{g.items.length}
                                                    </span>
                                                )}
                                                {!pickedCount && (
                                                    <span className="text-[9px] font-bold text-gray-300">
                                                        {g.items.length} itens
                                                    </span>
                                                )}
                                                {isOpen
                                                    ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                                    : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                                }
                                            </button>
                                        </div>

                                        {/* Items */}
                                        {isOpen && (
                                            <div className="pb-1">
                                                {g.items.map(item => {
                                                    const k = groupKey(g.id, item);
                                                    const checked = selected.has(k);
                                                    return (
                                                        <button
                                                            key={item}
                                                            onClick={() => toggleItem(g.id, item)}
                                                            className={`w-full flex items-center gap-3 pl-14 pr-6 py-2 text-left transition-colors hover:bg-blue-50/50 group ${checked ? 'bg-blue-50/30' : ''}`}
                                                        >
                                                            {checked
                                                                ? <CheckSquare className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                                                                : <Square className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 group-hover:text-gray-400" />
                                                            }
                                                            <span className={`text-xs font-medium ${checked ? 'text-blue-700 font-semibold' : 'text-gray-600'}`}>
                                                                {item}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Catalog footer */}
                        <div className="border-t border-gray-100 bg-gray-50 px-6 py-4 shrink-0 space-y-3">
                            {totalSelected > 0 && mode === 'manage' && (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        placeholder="Nome do modelo para salvar *"
                                        value={catalogTemplateName}
                                        onChange={e => setCatalogTemplateName(e.target.value)}
                                        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                                    />
                                    <button
                                        onClick={handleSaveCatalog}
                                        disabled={savingCatalog || !catalogTemplateName.trim()}
                                        className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-40 hover:bg-blue-600 transition-colors"
                                    >
                                        {savingCatalog ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                        Salvar modelo
                                    </button>
                                </div>
                            )}
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-gray-400 uppercase tracking-widest">
                                    {totalSelected > 0 ? `${totalSelected} item(ns) selecionado(s)` : 'Nenhum item selecionado'}
                                </span>
                                <div className="flex gap-2">
                                    {totalSelected > 0 && (
                                        <button
                                            onClick={() => setSelected(new Set())}
                                            className="px-3 py-1.5 text-xs font-black text-gray-400 uppercase tracking-widest border border-gray-200 rounded-lg hover:bg-white transition-colors"
                                        >
                                            Limpar
                                        </button>
                                    )}
                                    <button
                                        onClick={handleUseCatalog}
                                        disabled={totalSelected === 0}
                                        className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-40 hover:bg-blue-700 transition-colors"
                                    >
                                        <Tag className="w-3.5 h-3.5" />
                                        {mode === 'pick' ? 'Usar selecionados' : 'Pré-visualizar'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* ── SAVED TEMPLATES TAB ── */}
                {tab === 'saved' && (
                    <div className="flex-1 overflow-y-auto flex flex-col">
                        <div className="flex-1 overflow-y-auto p-6 space-y-3">
                            {/* Form */}
                            {mode === 'manage' && (isNew || editing) && (
                                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <p className="text-xs font-black text-blue-700 uppercase tracking-widest">
                                        {isNew ? 'Novo modelo' : `Editando: ${editing?.name}`}
                                    </p>
                                    <input
                                        type="text"
                                        placeholder="Nome do modelo *"
                                        value={form.name}
                                        onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                                        className="w-full px-4 py-3 bg-white border border-blue-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    />
                                    <textarea
                                        rows={5}
                                        placeholder="Conteúdo do escopo *"
                                        value={form.content}
                                        onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                                        className="w-full px-4 py-3 bg-white border border-blue-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.content.trim()}
                                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50 hover:bg-blue-700 transition-colors">
                                            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                            {saving ? 'Salvando…' : 'Salvar'}
                                        </button>
                                        <button onClick={cancelForm} className="px-4 py-2 bg-white text-gray-500 border border-gray-200 rounded-xl text-xs font-medium hover:bg-gray-50 transition-colors">
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Toolbar */}
                            {mode === 'manage' && !isNew && !editing && (
                                <button onClick={startNew}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-600 transition-colors">
                                    <Plus className="w-3.5 h-3.5" /> Novo modelo manual
                                </button>
                            )}

                            {/* List */}
                            {loading ? (
                                <div className="flex items-center justify-center py-16">
                                    <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
                                </div>
                            ) : scopes.length === 0 ? (
                                <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
                                    <ClipboardList className="w-10 h-10 opacity-20" />
                                    <p className="text-sm font-medium">Nenhum modelo salvo.</p>
                                    <button onClick={() => setTab('catalog')}
                                        className="text-sm text-blue-600 font-semibold hover:underline">
                                        Criar a partir do catálogo →
                                    </button>
                                </div>
                            ) : scopes.map(s => (
                                <div key={s.id}
                                    className={`bg-gray-50 border rounded-2xl p-4 transition-all ${mode === 'pick' ? 'cursor-pointer hover:border-blue-400 hover:bg-blue-50/40' : 'border-gray-100'}`}
                                    onClick={mode === 'pick' ? () => { onSelect?.(s); onClose(); } : undefined}>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
                                            <p className="text-xs text-gray-400 mt-1 line-clamp-3 whitespace-pre-line">{s.content}</p>
                                        </div>
                                        {mode === 'manage' && (
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button onClick={e => { e.stopPropagation(); startEdit(s); }}
                                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Editar">
                                                    <Edit3 className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={e => { e.stopPropagation(); handleDuplicate(s.id); }}
                                                    className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Duplicar">
                                                    <Copy className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={e => { e.stopPropagation(); handleDelete(s.id); }} disabled={deletingId === s.id}
                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50" title="Excluir">
                                                    {deletingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                </button>
                                            </div>
                                        )}
                                        {mode === 'pick' && (
                                            <span className="text-xs font-black text-blue-600 uppercase tracking-wider shrink-0">Usar →</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ContractScopeManager;
