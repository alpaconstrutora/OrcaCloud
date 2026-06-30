import React from 'react';
import { Building2, LayoutDashboard, Table2 } from 'lucide-react';
import { HoldingItem } from './types';

interface Props {
    holdings: HoldingItem[];
    filterStatus: string;
    viewMode: 'grid' | 'list';
    onFilterChange: (status: string) => void;
    onViewModeChange: (mode: 'grid' | 'list') => void;
    onSelectAsset: (proj: HoldingItem) => void;
}

const STATUS_FILTERS = ['Todos', 'Em Execução', 'Lançamento', 'Concluída'];

const HoldingsList: React.FC<Props> = ({
    holdings, filterStatus, viewMode,
    onFilterChange, onViewModeChange, onSelectAsset,
}) => (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
            <div className="flex bg-gray-100 p-1 rounded-lg">
                <button
                    onClick={() => onViewModeChange('grid')}
                    className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                    title="Visualização em Blocos"
                >
                    <LayoutDashboard className="w-4 h-4" />
                </button>
                <button
                    onClick={() => onViewModeChange('list')}
                    className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                    title="Visualização em Linhas"
                >
                    <Table2 className="w-4 h-4" />
                </button>
            </div>
        </div>

        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
            {STATUS_FILTERS.map((status) => (
                <button
                    key={status}
                    onClick={() => onFilterChange(status)}
                    className={`px-4 py-2 rounded-full text-button font-bold whitespace-nowrap transition-all ${filterStatus === status
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-100'
                        }`}
                >
                    {status}
                </button>
            ))}
        </div>

        {viewMode === 'list' ? (
            <>
                <div className="md:hidden space-y-3">
                    {holdings.map((proj, i) => (
                        <button
                            key={proj.id ?? i}
                            type="button"
                            onClick={() => onSelectAsset(proj)}
                            className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-4"
                        >
                            <div className="flex items-start justify-between gap-3 mb-4">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
                                        <Building2 className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-bold text-gray-900 truncate">{proj.name}</p>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-0.5">{proj.status}</p>
                                    </div>
                                </div>
                                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-xs font-bold whitespace-nowrap">{proj.cota}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div>
                                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Patrimônio</p>
                                    <p className="text-sm font-black text-gray-900">
                                        {typeof proj.equity === 'number'
                                            ? proj.equity.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                            : proj.equity}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Progresso</p>
                                    <p className="text-sm font-black text-blue-600">{proj.progress}%</p>
                                </div>
                            </div>
                            <div className="bg-gray-100 h-2 rounded-full overflow-hidden">
                                <div className="bg-blue-600 h-full" style={{ width: `${proj.progress}%` }} />
                            </div>
                        </button>
                    ))}
                </div>
                <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50/50 border-b border-gray-100">
                        <tr className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                            <th className="px-6 py-4">Empreendimento</th>
                            <th className="px-6 py-4 text-center">Status</th>
                            <th className="px-6 py-4 text-center">Cotas</th>
                            <th className="px-6 py-4 text-center">Progresso</th>
                            <th className="px-6 py-4 text-right">Patrimônio</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {holdings.map((proj, i) => (
                            <tr
                                key={proj.id ?? i}
                                className="hover:bg-blue-50/30 transition-colors cursor-pointer"
                                onClick={() => onSelectAsset(proj)}
                            >
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                                            <Building2 className="w-5 h-5" />
                                        </div>
                                        <span className="font-bold text-gray-900">{proj.name}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold uppercase tracking-wider">
                                        {proj.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-center font-bold text-blue-600 text-sm">{proj.cota}</td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                                            <div className="bg-blue-600 h-full" style={{ width: `${proj.progress}%` }} />
                                        </div>
                                        <span className="text-xs font-bold text-gray-400">{proj.progress}%</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right font-black text-gray-900">
                                    {typeof proj.equity === 'number'
                                        ? proj.equity.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                        : proj.equity}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                </div>
            </>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {holdings.map((proj, i) => (
                    <div
                        key={proj.id ?? i}
                        className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer"
                        onClick={() => onSelectAsset(proj)}
                    >
                        <div className="h-40 bg-slate-100 relative">
                            <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-black text-blue-600 uppercase tracking-widest">
                                {proj.status}
                            </div>
                        </div>
                        <div className="p-6">
                            <h4 className="text-xl font-bold text-gray-900 mb-4">{proj.name}</h4>
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Cotas</p>
                                    <p className="font-bold text-gray-900 text-lg">{proj.cota}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Rendimento</p>
                                    <p className="font-bold text-emerald-600 text-lg">{proj.yield || '—'}</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl mb-4">
                                <div className="text-xs font-bold text-gray-500">Patrimônio Atual</div>
                                <div className="text-lg font-black text-blue-600">
                                    {typeof proj.equity === 'number'
                                        ? proj.equity.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                        : proj.equity}
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Progresso da Obra</span>
                                    <span className="text-sm font-bold text-blue-600">{proj.progress}%</span>
                                </div>
                                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                                    <div className="bg-blue-600 h-full transition-all duration-1000" style={{ width: `${proj.progress}%` }} />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
);

export default HoldingsList;
