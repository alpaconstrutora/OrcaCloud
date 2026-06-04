import React from 'react';
import { FileText, ArrowUpRight, Download, Plus, X, LayoutDashboard, Table2 } from 'lucide-react';
import { InvestorReport } from '../../services/investorPortalService';

interface Props {
    reports: InvestorReport[];
    isAdmin: boolean;
    viewMode: 'grid' | 'list';
    onViewModeChange: (mode: 'grid' | 'list') => void;
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onDelete: (id: string) => void;
    openConfirm: (msg: string, onConfirm: () => void) => void;
}

const ReportsTab: React.FC<Props> = ({
    reports, isAdmin, viewMode,
    onViewModeChange, onUpload, onDelete, openConfirm,
}) => (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
                <h3 className="text-xl font-bold text-gray-900">Relatórios Disponíveis</h3>
                <div className="flex items-center gap-4 mt-1">
                    <p className="text-sm text-gray-500">Extratos de rendimentos, informes e demonstrativos mensais.</p>
                    <div className="flex bg-gray-100 p-1 rounded-lg ml-2">
                        <button
                            onClick={() => onViewModeChange('grid')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            title="Visualização em Grade"
                        >
                            <LayoutDashboard className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => onViewModeChange('list')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            title="Visualização em Lista"
                        >
                            <Table2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
            {isAdmin && (
                <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer hover:bg-blue-700 transition-colors">
                    <Plus className="w-4 h-4" />
                    Adicionar Relatório
                    <input type="file" accept="application/pdf" className="hidden" onChange={onUpload} />
                </label>
            )}
        </div>

        {viewMode === 'list' ? (
            <div className="divide-y divide-gray-50">
                {reports.map((doc) => (
                    <div key={doc.id} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors group cursor-pointer">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-gray-50 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-600 rounded-xl transition-colors">
                                <FileText className="w-6 h-6" />
                            </div>
                            <div>
                                <span className="font-bold text-gray-700 group-hover:text-gray-900 block">{doc.name}</span>
                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{doc.report_date}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {isAdmin && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openConfirm('Remover este relatório?', () => onDelete(doc.id!));
                                    }}
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
                {reports.map((doc) => (
                    <div key={doc.id} className="group flex flex-col items-center p-6 rounded-3xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:shadow-xl hover:border-blue-100 transition-all cursor-pointer relative">
                        {isAdmin && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openConfirm('Remover este relatório?', () => onDelete(doc.id!));
                                }}
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
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{doc.report_date}</span>
                        </div>
                        <div className="mt-4">
                            <button
                                className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all"
                                onClick={() => doc.url && window.open(doc.url, '_blank')}
                            >
                                <Download className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
);

export default ReportsTab;
