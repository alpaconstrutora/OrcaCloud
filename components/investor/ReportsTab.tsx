import React from 'react';
import { FileText, ArrowUpRight, Download, Plus, X, LayoutDashboard, Table2 } from 'lucide-react';
import { InvestorReport, ReportCategory, REPORT_CATEGORY_LABELS } from '../../services/investorPortalService';

const CATEGORIES = Object.entries(REPORT_CATEGORY_LABELS) as [ReportCategory, string][];

interface Props {
    reports: InvestorReport[];
    isAdmin: boolean;
    viewMode: 'grid' | 'list';
    uploadCategory: ReportCategory;
    onViewModeChange: (mode: 'grid' | 'list') => void;
    onUploadCategoryChange: (cat: ReportCategory) => void;
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onDelete: (id: string) => void;
    openConfirm: (msg: string, onConfirm: () => void) => void;
}

const ReportsTab: React.FC<Props> = ({
    reports, isAdmin, viewMode, uploadCategory,
    onViewModeChange, onUploadCategoryChange, onUpload, onDelete, openConfirm,
}) => {
    const [filterCat, setFilterCat] = React.useState<ReportCategory | 'todos'>('todos');

    const filtered = filterCat === 'todos' ? reports : reports.filter(r => r.category === filterCat);

    return (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-gray-50 flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div className="space-y-3">
                    <h3 className="text-xl font-bold text-gray-900">Documentos e Relatórios</h3>
                    <p className="text-sm text-gray-500">Contratos, relatórios, DRE, balancetes, atas e demais documentos.</p>

                    {/* Category filter chips */}
                    <div className="flex flex-wrap gap-2 pt-1">
                        <button
                            onClick={() => setFilterCat('todos')}
                            className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${filterCat === 'todos' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                        >
                            Todos ({reports.length})
                        </button>
                        {CATEGORIES.filter(([cat]) => reports.some(r => r.category === cat)).map(([cat, label]) => (
                            <button
                                key={cat}
                                onClick={() => setFilterCat(cat)}
                                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${filterCat === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                            >
                                {label} ({reports.filter(r => r.category === cat).length})
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button
                            onClick={() => onViewModeChange('grid')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            title="Grade"
                        >
                            <LayoutDashboard className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => onViewModeChange('list')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            title="Lista"
                        >
                            <Table2 className="w-4 h-4" />
                        </button>
                    </div>

                    {isAdmin && (
                        <div className="flex items-center gap-2">
                            <select
                                value={uploadCategory}
                                onChange={e => onUploadCategoryChange(e.target.value as ReportCategory)}
                                className="px-2 py-1.5 border border-gray-200 rounded-lg text-form-input focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {CATEGORIES.map(([cat, label]) => (
                                    <option key={cat} value={cat}>{label}</option>
                                ))}
                            </select>
                            <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-form-label font-bold shadow-md cursor-pointer hover:bg-blue-700 transition-colors">
                                <Plus className="w-4 h-4" />
                                Adicionar
                                <input type="file" accept="application/pdf,.docx,.xlsx" className="hidden" onChange={onUpload} />
                            </label>
                        </div>
                    )}
                </div>
            </div>

            {viewMode === 'list' ? (
                <div className="divide-y divide-gray-50">
                    {filtered.length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-10">Nenhum documento encontrado.</p>
                    )}
                    {filtered.map((doc) => (
                        <div key={doc.id} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors group cursor-pointer">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-gray-50 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-600 rounded-xl transition-colors">
                                    <FileText className="w-6 h-6" />
                                </div>
                                <div>
                                    <span className="font-bold text-gray-700 group-hover:text-gray-900 block">{doc.name}</span>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        {doc.category && (
                                            <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                                                {REPORT_CATEGORY_LABELS[doc.category]}
                                            </span>
                                        )}
                                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{doc.report_date}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {isAdmin && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); openConfirm('Remover este documento?', () => onDelete(doc.id!)); }}
                                        className="p-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                )}
                                <button
                                    className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                                    onClick={(e) => { e.stopPropagation(); if (doc.url) window.open(doc.url, '_blank'); }}
                                >
                                    <ArrowUpRight className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {filtered.length === 0 && (
                        <p className="text-sm text-gray-400 col-span-4 text-center py-10">Nenhum documento encontrado.</p>
                    )}
                    {filtered.map((doc) => (
                        <div key={doc.id} className="group flex flex-col items-center p-6 rounded-3xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:shadow-xl hover:border-blue-100 transition-all cursor-pointer relative">
                            {isAdmin && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); openConfirm('Remover este documento?', () => onDelete(doc.id!)); }}
                                    className="absolute top-2 right-2 p-1.5 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform">
                                <FileText className="w-8 h-8" />
                            </div>
                            <div className="text-center">
                                <span className="font-bold text-gray-900 block mb-1 uppercase tracking-tight text-sm">{doc.name}</span>
                                {doc.category && (
                                    <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                                        {REPORT_CATEGORY_LABELS[doc.category]}
                                    </span>
                                )}
                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest block mt-1">{doc.report_date}</span>
                            </div>
                            <button
                                className="mt-4 p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all"
                                onClick={() => doc.url && window.open(doc.url, '_blank')}
                            >
                                <Download className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ReportsTab;
