import React, { useState, useEffect, useCallback } from 'react';
import {
    ChevronRight, ChevronDown, Plus, Edit2, Trash2,
    Save, X, AlertCircle, Loader2, Layers, Sparkles,
} from 'lucide-react';
import {
    CompanyDepartment, CompanyDepartmentInsert,
    DEPT_COLORS,
} from '../types';
import { companyService } from '../services/companyService';

interface Props {
    companyId: string;
}

// ─── Árvore ───────────────────────────────────────────────────

interface DeptNode extends CompanyDepartment {
    children: DeptNode[];
}

function buildTree(depts: CompanyDepartment[]): DeptNode[] {
    const map: Record<string, DeptNode> = {};
    depts.forEach(d => { map[d.id] = { ...d, children: [] }; });

    const roots: DeptNode[] = [];
    depts.forEach(d => {
        if (d.parent_id && map[d.parent_id]) {
            map[d.parent_id].children.push(map[d.id]);
        } else {
            roots.push(map[d.id]);
        }
    });

    const sort = (nodes: DeptNode[]) => {
        nodes.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
        nodes.forEach(n => sort(n.children));
    };
    sort(roots);
    return roots;
}

// ─── Form inline ─────────────────────────────────────────────

type FormData = { nome: string; descricao: string; responsavel_nome: string; cor: string };
const EMPTY_FORM: FormData = { nome: '', descricao: '', responsavel_nome: '', cor: '#374151' };

const cls = "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

interface InlineFormProps {
    initial?: FormData;
    onSave: (f: FormData) => Promise<void>;
    onCancel: () => void;
    saving: boolean;
    title: string;
}

const InlineForm: React.FC<InlineFormProps> = ({ initial = EMPTY_FORM, onSave, onCancel, saving, title }) => {
    const [form, setForm] = useState<FormData>(initial);
    const set = (k: keyof FormData, v: string) => setForm(p => ({ ...p, [k]: v }));

    return (
        <div className="mt-2 ml-6 bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
            <p className="text-xs font-black uppercase tracking-widest text-blue-600">{title}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input className={cls} placeholder="Nome do departamento *"
                    value={form.nome} onChange={e => set('nome', e.target.value)} />
                <input className={cls} placeholder="Responsável"
                    value={form.responsavel_nome} onChange={e => set('responsavel_nome', e.target.value)} />
                <input className={cls} placeholder="Descrição (opcional)"
                    value={form.descricao} onChange={e => set('descricao', e.target.value)} />
                <div className="flex items-center gap-2">
                    {DEPT_COLORS.map(c => (
                        <button key={c.value} type="button"
                            onClick={() => set('cor', c.value)}
                            title={c.label}
                            className={`w-6 h-6 rounded-full border-2 transition-all flex-shrink-0 ${form.cor === c.value ? 'border-gray-900 scale-125' : 'border-transparent'}`}
                            style={{ backgroundColor: c.value }} />
                    ))}
                </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={onCancel}
                    className="px-3 py-1.5 text-button font-black uppercase text-gray-500 hover:text-gray-700">
                    Cancelar
                </button>
                <button type="button" disabled={saving || !form.nome.trim()}
                    onClick={() => onSave(form)}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white rounded-xl font-black text-button uppercase tracking-wide hover:bg-blue-700 disabled:opacity-50 active:scale-95">
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Salvar
                </button>
            </div>
        </div>
    );
};

// ─── Nó da árvore (recursivo) ─────────────────────────────────

interface NodeProps {
    node: DeptNode;
    depth: number;
    expandedIds: Set<string>;
    toggleExpand: (id: string) => void;
    onAddChild: (parentId: string) => void;
    onEdit: (dept: CompanyDepartment) => void;
    onDelete: (dept: CompanyDepartment) => void;
    activeFormId: string | null;   // id do nó que tem form aberto
    activeFormType: 'add' | 'edit' | null;
    formData: FormData;
    formSaving: boolean;
    onFormSave: () => Promise<void>;
    onFormCancel: () => void;
    onFormChange: (f: FormData) => void;
}

const DeptNode: React.FC<NodeProps> = ({
    node, depth, expandedIds, toggleExpand,
    onAddChild, onEdit, onDelete,
    activeFormId, activeFormType, formData, formSaving,
    onFormSave, onFormCancel, onFormChange,
}) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const showAddForm = activeFormId === node.id && activeFormType === 'add';
    const showEditForm = activeFormId === node.id && activeFormType === 'edit';

    const indent = depth * 20;

    return (
        <div>
            <div className={`flex items-center gap-2 py-2 px-3 rounded-xl hover:bg-gray-50 group transition-colors ${!node.ativo ? 'opacity-50' : ''}`}
                style={{ paddingLeft: `${indent + 12}px` }}>
                {/* Toggle */}
                <button onClick={() => toggleExpand(node.id)}
                    className={`w-5 h-5 flex items-center justify-center flex-shrink-0 transition-colors ${hasChildren ? 'text-gray-400 hover:text-gray-600' : 'invisible'}`}>
                    {isExpanded
                        ? <ChevronDown className="w-4 h-4" />
                        : <ChevronRight className="w-4 h-4" />}
                </button>

                {/* Dot colorido */}
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: node.cor }} />

                {/* Nome + responsável */}
                <div className="flex-1 min-w-0">
                    <span className={`text-sm font-black text-gray-900 ${depth === 0 ? 'text-base' : depth === 1 ? 'text-sm' : 'text-xs'}`}>
                        {node.nome}
                    </span>
                    {node.responsavel_nome && (
                        <span className="ml-2 text-xs font-black uppercase tracking-wide text-gray-400">
                            {node.responsavel_nome}
                        </span>
                    )}
                    {node.descricao && (
                        <p className="text-xs text-gray-400 truncate">{node.descricao}</p>
                    )}
                </div>

                {/* Ações — visíveis no hover */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => onAddChild(node.id)} title="Adicionar subdepartamento"
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onEdit(node)} title="Editar"
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onDelete(node)} title="Excluir"
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Form de adicionar filho */}
            {showAddForm && (
                <div style={{ paddingLeft: `${indent + 28}px` }}>
                    <InlineForm
                        title="Novo Subdepartamento"
                        initial={{ ...EMPTY_FORM, cor: node.cor }}
                        onSave={async () => { await onFormSave(); }}
                        onCancel={onFormCancel}
                        saving={formSaving} />
                </div>
            )}

            {/* Form de editar */}
            {showEditForm && (
                <div style={{ paddingLeft: `${indent + 28}px` }}>
                    <InlineForm
                        title="Editar Departamento"
                        initial={formData}
                        onSave={async () => { await onFormSave(); }}
                        onCancel={onFormCancel}
                        saving={formSaving} />
                </div>
            )}

            {/* Filhos */}
            {isExpanded && node.children.map(child => (
                <DeptNode key={child.id} node={child} depth={depth + 1}
                    expandedIds={expandedIds} toggleExpand={toggleExpand}
                    onAddChild={onAddChild} onEdit={onEdit} onDelete={onDelete}
                    activeFormId={activeFormId} activeFormType={activeFormType}
                    formData={formData} formSaving={formSaving}
                    onFormSave={onFormSave} onFormCancel={onFormCancel}
                    onFormChange={onFormChange} />
            ))}
        </div>
    );
};

// ─── Componente principal ─────────────────────────────────────

const CompanyDepartmentsTab: React.FC<Props> = ({ companyId }) => {
    const [depts, setDepts] = useState<CompanyDepartment[]>([]);
    const [loading, setLoading] = useState(true);
    const [seeding, setSeeding] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [activeFormId, setActiveFormId] = useState<string | null>(null);   // nó alvo
    const [activeFormType, setActiveFormType] = useState<'add' | 'edit' | 'root' | null>(null);
    const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
    const [formSaving, setFormSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const list = await companyService.listDepartments(companyId);
            setDepts(list);
            // Expande todos por padrão na primeira carga
            setExpandedIds(new Set(list.map(d => d.id)));
        } catch (e: unknown) { setError((e as Error).message); }
        finally { setLoading(false); }
    }, [companyId]);

    useEffect(() => { load(); }, [load]);

    const toggleExpand = (id: string) => setExpandedIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    const openAddRoot = () => { setActiveFormId('__root__'); setActiveFormType('root'); setFormData(EMPTY_FORM); };
    const openAddChild = (parentId: string) => {
        const parent = depts.find(d => d.id === parentId);
        setActiveFormId(parentId);
        setActiveFormType('add');
        setFormData({ ...EMPTY_FORM, cor: parent?.cor ?? '#374151' });
        setExpandedIds(prev => new Set([...prev, parentId]));
    };
    const openEdit = (dept: CompanyDepartment) => {
        setActiveFormId(dept.id);
        setActiveFormType('edit');
        setFormData({ nome: dept.nome, descricao: dept.descricao ?? '', responsavel_nome: dept.responsavel_nome ?? '', cor: dept.cor });
    };
    const closeForm = () => { setActiveFormId(null); setActiveFormType(null); setError(null); };

    const handleFormSave = async () => {
        if (!formData.nome.trim()) return;
        setFormSaving(true);
        setError(null);
        try {
            if (activeFormType === 'edit' && activeFormId) {
                await companyService.updateDepartment(activeFormId, {
                    nome: formData.nome.trim(),
                    descricao: formData.descricao.trim() || undefined,
                    responsavel_nome: formData.responsavel_nome.trim() || undefined,
                    cor: formData.cor,
                });
            } else {
                const parentId = (activeFormType === 'add' && activeFormId !== '__root__')
                    ? activeFormId ?? undefined
                    : undefined;
                const payload: CompanyDepartmentInsert = {
                    company_id: companyId,
                    parent_id: parentId,
                    nome: formData.nome.trim(),
                    descricao: formData.descricao.trim() || undefined,
                    responsavel_nome: formData.responsavel_nome.trim() || undefined,
                    cor: formData.cor,
                    ordem: depts.filter(d => d.parent_id === parentId).length,
                    ativo: true,
                };
                await companyService.createDepartment(payload);
            }
            await load();
            closeForm();
        } catch (e: unknown) { setError((e as Error).message); }
        finally { setFormSaving(false); }
    };

    const handleDelete = async (dept: CompanyDepartment) => {
        const hasChildren = depts.some(d => d.parent_id === dept.id);
        const msg = hasChildren
            ? `Excluir "${dept.nome}" e todos os seus subdepartamentos?`
            : `Excluir "${dept.nome}"?`;
        if (!confirm(msg)) return;
        try {
            await companyService.removeDepartment(dept.id);
            await load();
        } catch (e: unknown) { setError((e as Error).message); }
    };

    const handleSeed = async () => {
        if (depts.length > 0 && !confirm('Já existem departamentos. Adicionar a estrutura padrão sobre eles?')) return;
        setSeeding(true);
        setError(null);
        try {
            await companyService.seedDefaultDepartments(companyId);
            await load();
        } catch (e: unknown) { setError((e as Error).message); }
        finally { setSeeding(false); }
    };

    const tree = buildTree(depts);
    const nodeProps = { expandedIds, toggleExpand, onAddChild: openAddChild, onEdit: openEdit, onDelete: handleDelete, activeFormId, activeFormType: activeFormType === 'root' ? null : activeFormType, formData, formSaving, onFormSave: handleFormSave, onFormCancel: closeForm, onFormChange: setFormData };

    return (
        <div className="space-y-4">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <p className="text-xs font-black uppercase tracking-widest text-gray-500">Organograma</p>
                    <span className="text-xs font-black px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        {depts.length} departamento{depts.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {depts.length === 0 && (
                        <button onClick={handleSeed} disabled={seeding}
                            className="flex items-center gap-1.5 px-4 py-2 border border-blue-200 bg-blue-50 text-blue-600 rounded-xl font-black text-button uppercase tracking-wide hover:bg-blue-100 transition-all active:scale-95 disabled:opacity-60">
                            {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                            Pré-carregar estrutura
                        </button>
                    )}
                    <button onClick={openAddRoot}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl font-black text-button uppercase tracking-wide hover:bg-blue-700 transition-all active:scale-95">
                        <Plus className="w-3.5 h-3.5" /> Novo Departamento
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
                </div>
            )}

            {/* Form de raiz */}
            {activeFormType === 'root' && (
                <InlineForm
                    title="Novo Departamento Raiz"
                    onSave={async () => { await handleFormSave(); }}
                    onCancel={closeForm}
                    saving={formSaving} />
            )}

            {/* Árvore */}
            {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : tree.length === 0 ? (
                <div className="flex flex-col items-center py-14 text-gray-400 gap-3">
                    <Layers className="w-10 h-10 opacity-30" />
                    <p className="text-sm font-medium">Nenhum departamento cadastrado.</p>
                    <button onClick={handleSeed} disabled={seeding}
                        className="flex items-center gap-2 px-5 py-2.5 border border-blue-200 bg-blue-50 text-blue-600 rounded-xl font-black text-button uppercase tracking-wide hover:bg-blue-100 transition-all active:scale-95 disabled:opacity-60">
                        {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        Pré-carregar estrutura padrão
                    </button>
                </div>
            ) : (
                <div className="border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-100">
                    {tree.map(node => (
                        <DeptNode key={node.id} node={node} depth={0} {...nodeProps} />
                    ))}
                </div>
            )}

            {/* Legenda de cores */}
            {depts.length > 0 && (
                <div className="flex items-center gap-4 flex-wrap pt-2">
                    <p className="text-xs font-black uppercase tracking-widest text-gray-400">Legenda</p>
                    {[...new Set(depts.map(d => d.cor))].map(cor => {
                        const first = depts.find(d => d.cor === cor && !d.parent_id);
                        if (!first) return null;
                        return (
                            <div key={cor} className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cor }} />
                                <span className="text-xs text-gray-500 font-black">{first.nome}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default CompanyDepartmentsTab;
