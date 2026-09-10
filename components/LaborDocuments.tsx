import React, { useState, useEffect } from 'react';
import {
    FileText, Plus, Search,
    AlertTriangle, Clock, User, Calendar,
    LayoutGrid, List
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import {
    laborService, Employee, EmployeeDocument, DocumentCategory
} from '../services/laborService';
import { supabase } from '../lib/supabase';
import LaborDocumentModal from './LaborDocumentModal';
import { useConfirm } from './ui/confirm';
import { usePersistedState } from './ui/TableUtils';
import StandardTable, { StandardTableColumn } from './ui/StandardTable';

// Colunas da tabela padrão (§6.10)
const DOC_COLUMNS: StandardTableColumn[] = [
    { key: 'colaborador', label: 'Colaborador', sortable: true, width: 200 },
    { key: 'titulo', label: 'Título', sortable: true, width: 240 },
    { key: 'categoria', label: 'Categoria', sortable: true, width: 160 },
    { key: 'criacao', label: 'Criação', sortable: true, width: 110 },
    { key: 'exame', label: 'Exame', sortable: true, width: 110 },
    { key: 'vencimento', label: 'Vencimento', sortable: true, width: 130 },
    { key: 'status', label: 'Status', sortable: true, width: 150 },
];

interface LaborDocumentsProps {
    employees: Employee[];
    orgId: string | null;
    onRefresh?: () => void;
    organizations: Array<{ id: string; name: string }>;
}

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
    ASO: 'ASO',
    NR: 'Norma Regulamentadora',
    IDENTIDADE: 'Identidade/RG',
    CONTRATO: 'Contrato',
    TREINAMENTO: 'Treinamento',
    OUTROS: 'Outros'
};

const LaborDocuments: React.FC<LaborDocumentsProps> = ({ employees, orgId, onRefresh, organizations }) => {
    const confirm = useConfirm();
    const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = usePersistedState<string>('laborDocuments:search', '');
    const [filterCategory, setFilterCategory] = useState<DocumentCategory | 'ALL'>('ALL');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingDoc, setEditingDoc] = useState<EmployeeDocument | null>(null);
    const [viewMode, setViewMode] = usePersistedState<'cards' | 'list'>('laborDocuments:viewMode', 'cards');

    const fetchDocuments = async () => {
        setLoading(true);
        try {
            const data = await laborService.listDocuments({ orgId });
            setDocuments(data);
        } catch (err) {
            console.error('[LaborDocuments] Error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDocuments(); }, [orgId]);

    const handleDelete = async (id: string, filePath: string) => {
        const ok = await confirm({ title: 'Excluir documento?', message: 'Esta ação não pode ser desfeita.', variant: 'danger', confirmLabel: 'Excluir' });
        if (!ok) return;
        try {
            await laborService.deleteDocument(id, filePath);
            fetchDocuments();
            if (onRefresh) onRefresh();
        } catch {
            alert('Erro ao excluir documento.');
        }
    };

    const handleDownload = (doc: EmployeeDocument) => {
        const { data } = supabase.storage
            .from('organization-assets')
            .getPublicUrl(doc.file_url);
        window.open(data.publicUrl, '_blank');
    };

    const handleEdit = (doc: EmployeeDocument) => {
        setEditingDoc(doc);
        setIsModalOpen(true);
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        setEditingDoc(null);
    };

    const handleModalSaved = () => {
        setIsModalOpen(false);
        setEditingDoc(null);
        fetchDocuments();
        if (onRefresh) onRefresh();
    };

    // Controles que os dois modos compartilham (categoria, toggle, ação primária).
    const controles = (
        <>
            <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value as DocumentCategory | 'ALL')}
                className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
            >
                <option value="ALL">Todas as categorias</option>
                {Object.entries(CATEGORY_LABELS).map(([val, lab]) => (
                    <option key={val} value={val}>{lab}</option>
                ))}
            </select>
            <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                <button onClick={() => setViewMode('cards')} title="Visualização em cards"
                    className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'cards' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                    <LayoutGrid className="w-4 h-4" />
                </button>
                <button onClick={() => setViewMode('list')} title="Visualização em lista"
                    className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                    <List className="w-4 h-4" />
                </button>
            </div>
            <button
                onClick={() => { setEditingDoc(null); setIsModalOpen(true); }}
                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
            >
                <Plus className="w-[15px] h-[15px]" />
                Novo documento
            </button>
        </>
    );

    const filtered = documents.filter(d => {
        const matchesSearch = d.title.toLowerCase().includes(search.toLowerCase()) ||
            d.employee_name?.toLowerCase().includes(search.toLowerCase());
        const matchesCat = filterCategory === 'ALL' || d.category === filterCategory;
        return matchesSearch && matchesCat;
    });

    const isExpired = (date?: string) => {
        if (!date) return false;
        return new Date(date) < new Date();
    };

    const isNearExpiry = (date?: string) => {
        if (!date) return false;
        const d = new Date(date);
        const soon = new Date();
        soon.setMonth(soon.getMonth() + 1);
        return d > new Date() && d < soon;
    };

    const getExpiryBadge = (doc: EmployeeDocument) => {
        if (!doc.expiry_date) return null;
        if (isExpired(doc.expiry_date)) {
            return (
                <span className="flex items-center gap-1 text-sm font-normal text-red-600">
                    <AlertTriangle className="w-3 h-3" /> Vencido
                </span>
            );
        }
        if (isNearExpiry(doc.expiry_date)) {
            return (
                <span className="flex items-center gap-1 text-sm font-normal text-amber-600">
                    <Clock className="w-3 h-3" /> Expira em breve
                </span>
            );
        }
        return (
            <span className="flex items-center gap-1 text-sm font-normal text-emerald-600">
                <Clock className="w-3 h-3" /> Vigente
            </span>
        );
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* 1. Título */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Documentos</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">ASO, treinamentos, contratos e demais documentos dos colaboradores.</p>
            </div>

            {/* Filters & Actions */}
            {/* Controles compartilhados — categoria, toggle cards/lista (§5.1) e ação primária (§17) */}
            {viewMode === 'cards' && (
                <div className="flex flex-col md:flex-row gap-2.5 items-center">
                    <div className="flex-1 relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por título ou colaborador..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                    </div>
                    {controles}
                </div>
            )}

            {/* Document List */}
            {viewMode === 'list' ? (
                /* ── LIST VIEW — tabela padrão (§6.10); mesma busca dos cards ── */
                <StandardTable<EmployeeDocument>
                    storageKey="labor:documents:lista"
                    columns={DOC_COLUMNS}
                    rows={documents.filter(d => filterCategory === 'ALL' || d.category === filterCategory)}
                    rowKey={d => d.id}
                    search={search}
                    onSearchChange={setSearch}
                    searchText={d => `${d.title} ${d.employee_name ?? ''}`}
                    searchPlaceholder="Buscar por título ou colaborador..."
                    filters={controles}
                    sortValue={(key, d) => {
                        switch (key) {
                            case 'colaborador': return d.employee_name ?? '';
                            case 'titulo': return d.title;
                            case 'categoria': return CATEGORY_LABELS[d.category];
                            case 'criacao': return d.created_at ?? '';
                            case 'exame': return d.exam_date ?? '';
                            case 'vencimento': return d.expiry_date ?? '';
                            case 'status': return isExpired(d.expiry_date) ? 0 : isNearExpiry(d.expiry_date) ? 1 : d.expiry_date ? 2 : 3;
                            default: return null;
                        }
                    }}
                    renderCell={(key, doc) => {
                        const expired = isExpired(doc.expiry_date);
                        const near = isNearExpiry(doc.expiry_date);
                        switch (key) {
                            case 'colaborador': return (
                                <div className="flex items-center gap-2 text-sm font-normal text-gray-700">
                                    <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                    {doc.employee_name || '—'}
                                </div>
                            );
                            case 'titulo': return <span className="block truncate text-sm font-normal text-gray-700" title={doc.title}>{doc.title}</span>;
                            case 'categoria': return <span className="text-sm font-normal text-gray-600">{CATEGORY_LABELS[doc.category]}</span>;
                            case 'criacao': return <span className="text-sm font-normal text-gray-600">{doc.created_at ? new Date(doc.created_at).toLocaleDateString('pt-BR') : '—'}</span>;
                            case 'exame': return <span className="text-sm font-normal text-gray-600">{doc.exam_date ? new Date(doc.exam_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</span>;
                            case 'vencimento': return (
                                <span className={`text-sm font-normal ${expired ? 'text-red-600' : near ? 'text-amber-600' : 'text-gray-600'}`}>
                                    {doc.expiry_date ? new Date(doc.expiry_date + 'T00:00:00').toLocaleDateString('pt-BR') : 'Sem vencimento'}
                                </span>
                            );
                            case 'status': return getExpiryBadge(doc);
                            default: return null;
                        }
                    }}
                    actions={{
                        width: 130,
                        render: doc => (
                            <>
                                <ActionIconButton kind="edit" size="sm" onClick={() => handleEdit(doc)} />
                                <ActionIconButton kind="download" size="sm" onClick={() => handleDownload(doc)} />
                                <ActionIconButton kind="delete" size="sm" onClick={() => handleDelete(doc.id, doc.file_url)} />
                            </>
                        ),
                    }}
                    empty={{ icon: <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum documento encontrado', subtitle: 'Faça o upload do primeiro documento para este colaborador.' }}
                />
            ) : loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Clock className="w-10 h-10 text-indigo-600 animate-spin" />
                    <p className="text-slate-500 font-bold">Carregando documentos...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                    <FileText className="w-16 h-16 text-slate-300 mb-4" />
                    <h3 className="text-lg font-bold text-slate-900">Nenhum documento encontrado</h3>
                    <p className="text-slate-500 text-sm">Faça o upload do primeiro documento para este colaborador.</p>
                </div>
            ) : (
                /* ── CARD VIEW ── */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filtered.map(doc => {
                        const expired = isExpired(doc.expiry_date);
                        const near = isNearExpiry(doc.expiry_date);

                        return (
                            <div key={doc.id} className="group bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 p-6 flex flex-col gap-4">
                                <div className="flex items-start justify-between">
                                    <div className={`p-3 rounded-2xl ${expired ? 'bg-red-50 text-red-600' : near ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                        <FileText className="w-6 h-6" />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <ActionIconButton kind="edit" onClick={() => handleEdit(doc)} />
                                        <ActionIconButton kind="download" onClick={() => handleDownload(doc)} />
                                        <ActionIconButton kind="delete" onClick={() => handleDelete(doc.id, doc.file_url)} />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <span className="text-xs font-black uppercase tracking-widest text-slate-400">{CATEGORY_LABELS[doc.category]}</span>
                                        {getExpiryBadge(doc)}
                                    </div>
                                    <h4 className="text-base font-black text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{doc.title}</h4>
                                    <div className="flex flex-col gap-1.5 mt-3">
                                        <div className="flex items-center gap-2 text-xs text-slate-500 font-bold">
                                            <User className="w-3.5 h-3.5" />
                                            {doc.employee_name || 'Desconhecido'}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                                            <Calendar className="w-3.5 h-3.5" />
                                            Criado em: {doc.created_at ? new Date(doc.created_at).toLocaleDateString('pt-BR') : '—'}
                                        </div>
                                        {doc.exam_date && (
                                            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                                                <Calendar className="w-3.5 h-3.5" />
                                                Exame: {new Date(doc.exam_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                                            </div>
                                        )}
                                        {doc.expiry_date && (
                                            <div className={`flex items-center gap-2 text-button font-black ${expired ? 'text-red-600' : near ? 'text-amber-600' : 'text-slate-500'}`}>
                                                <AlertTriangle className="w-3.5 h-3.5" />
                                                Vencimento: {new Date(doc.expiry_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {doc.notes && (
                                    <p className="text-xs text-slate-400 font-medium italic border-t border-slate-50 pt-3">{doc.notes}</p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {isModalOpen && (
                <LaborDocumentModal
                    employees={employees}
                    orgId={orgId}
                    onClose={handleModalClose}
                    onSaved={handleModalSaved}
                    editDoc={editingDoc ?? undefined}
                />
            )}
        </div>
    );
};

export default LaborDocuments;
