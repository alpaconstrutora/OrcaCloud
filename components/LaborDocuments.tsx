import React, { useState, useEffect } from 'react';
import { 
    FileText, Plus, Search, Filter, Trash2, Download, 
    AlertTriangle, CheckCircle2, Clock, Building2, User, Calendar
} from 'lucide-react';
import { 
    laborService, Employee, EmployeeDocument, DocumentCategory 
} from '../services/laborService';
import LaborDocumentModal from './LaborDocumentModal';

interface LaborDocumentsProps {
    employees: Employee[];
    orgId: string;
    onRefresh?: () => void;
}

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
    ASO: 'ASO',
    NR: 'Norma Regulamentadora',
    IDENTIDADE: 'Identidade/RG',
    CONTRATO: 'Contrato',
    TREINAMENTO: 'Treinamento',
    OUTROS: 'Outros'
};

const STATUS_COLORS = {
    ATIVO: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    VENCIDO: 'bg-red-100 text-red-700 border-red-200',
    PENDENTE: 'bg-amber-100 text-amber-700 border-amber-200'
};

const LaborDocuments: React.FC<LaborDocumentsProps> = ({ employees, orgId, onRefresh }) => {
    const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState<DocumentCategory | 'ALL'>('ALL');
    const [isModalOpen, setIsModalOpen] = useState(false);

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
        if (!window.confirm('Excluir este documento permanentemente?')) return;
        try {
            await laborService.deleteDocument(id, filePath);
            fetchDocuments();
            if (onRefresh) onRefresh();
        } catch (err) {
            alert('Erro ao excluir documento.');
        }
    };

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

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Filters & Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex flex-1 items-center gap-3">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Buscar por título ou colaborador..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        />
                    </div>
                    <select 
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value as any)}
                        className="px-4 py-2 bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="ALL">Todas Categorias</option>
                        {Object.entries(CATEGORY_LABELS).map(([val, lab]) => (
                            <option key={val} value={val}>{lab}</option>
                        ))}
                    </select>
                </div>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 font-black text-xs uppercase tracking-tight"
                >
                    <Plus className="w-4 h-4" />
                    Novo Documento
                </button>
            </div>

            {/* Document List */}
            {loading ? (
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
                                    <div className="flex items-center gap-1">
                                        <button 
                                            onClick={() => window.open(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/organization-assets/${doc.file_url}`)}
                                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                            title="Download"
                                        >
                                            <Download className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => handleDelete(doc.id, doc.file_url)}
                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                            title="Excluir"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{CATEGORY_LABELS[doc.category]}</span>
                                        {expired && <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-100 animate-pulse"><AlertTriangle className="w-2.5 h-2.5" /> Vencido</span>}
                                        {near && <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100"><Clock className="w-2.5 h-2.5" /> Expira em breve</span>}
                                    </div>
                                    <h4 className="text-base font-black text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{doc.title}</h4>
                                    <div className="flex flex-col gap-1.5 mt-3">
                                        <div className="flex items-center gap-2 text-xs text-slate-500 font-bold">
                                            <User className="w-3.5 h-3.5" />
                                            {doc.employee_name || 'Desconhecido'}
                                        </div>
                                        {doc.expiry_date && (
                                            <div className={`flex items-center gap-2 text-xs font-black ${expired ? 'text-red-600' : near ? 'text-amber-600' : 'text-slate-500'}`}>
                                                <Calendar className="w-3.5 h-3.5" />
                                                Expira em: {new Date(doc.expiry_date).toLocaleDateString('pt-BR')}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {doc.notes && (
                                    <p className="text-[11px] text-slate-400 font-medium italic border-t border-slate-50 pt-3">{doc.notes}</p>
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
                    onClose={() => setIsModalOpen(false)}
                    onSaved={() => {
                        setIsModalOpen(false);
                        fetchDocuments();
                        if (onRefresh) onRefresh();
                    }}
                />
            )}
        </div>
    );
};

export default LaborDocuments;
