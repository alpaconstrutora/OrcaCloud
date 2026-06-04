import React from 'react';
import { Calendar, Plus, X, LayoutDashboard, Table2 } from 'lucide-react';
import { InvestorOpportunity } from '../../services/investorPortalService';

interface Props {
    opportunities: InvestorOpportunity[];
    isAdmin: boolean;
    viewMode: 'grid' | 'list';
    organizationId?: string;
    onViewModeChange: (mode: 'grid' | 'list') => void;
    onAdd: (title: string) => void;
    onDelete: (id: string) => void;
    openConfirm: (msg: string, onConfirm: () => void) => void;
    openInput: (label: string, defaultValue: string, onConfirm: (val: string) => void) => void;
}

const OpportunitiesTab: React.FC<Props> = ({
    opportunities, isAdmin, viewMode,
    onViewModeChange, onAdd, onDelete,
    openConfirm, openInput,
}) => (
    <div className="space-y-8">
        <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
                <h3 className="text-xl font-bold text-gray-900">Oportunidades de Mercado</h3>
                <div className="flex bg-gray-100 p-1 rounded-lg">
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
            {isAdmin && (
                <button
                    onClick={() => openInput('Título da Oportunidade', '', (title) => {
                        if (title) onAdd(title);
                    })}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md"
                >
                    <Plus className="w-4 h-4" />
                    Nova Oportunidade
                </button>
            )}
        </div>

        {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-6">
                {opportunities.map((op) => (
                    <div key={op.id} className="bg-[#0B1727] p-12 rounded-[2rem] text-white relative overflow-hidden flex flex-col justify-center min-h-[300px] group">
                        {isAdmin && (
                            <button
                                onClick={() => openConfirm('Remover esta oportunidade?', () => onDelete(op.id!))}
                                className="absolute top-6 right-6 p-2 bg-red-500/20 text-red-300 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] -mr-40 -mt-40" />
                        <div className="relative z-10 max-w-2xl">
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600/30 rounded-full text-xs font-black text-blue-200 uppercase tracking-widest mb-8">
                                <Calendar className="w-4 h-4" />
                                Reservas Abertas {op.open_date ? `• ${op.open_date}` : ''}
                            </div>
                            <h2 className="text-5xl font-black mb-6 leading-tight">{op.title}</h2>
                            <p className="text-xl text-blue-100/70 mb-10 leading-relaxed font-medium">
                                {op.subtitle}. Retorno projetado de {op.projected_yield ?? '—'} a.a.
                            </p>
                            <div className="flex flex-wrap gap-4">
                                <button className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-blue-900/40">
                                    Garantir Cota
                                </button>
                                <button className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl transition-all border border-white/10 backdrop-blur">
                                    Ver Memorial Descritivo
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50/50 border-b border-gray-100">
                        <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                            <th className="px-6 py-4">Oportunidade</th>
                            <th className="px-6 py-4">Retorno Projetado</th>
                            <th className="px-6 py-4">Data de Reserva</th>
                            <th className="px-6 py-4 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {opportunities.map((op) => (
                            <tr key={op.id} className="hover:bg-blue-50/30 transition-colors group">
                                <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-gray-900">{op.title}</span>
                                        <span className="text-xs text-gray-500">{op.subtitle}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 font-bold text-emerald-600">{op.projected_yield ?? '—'} a.a.</td>
                                <td className="px-6 py-4 text-gray-500 text-sm">{op.open_date || 'Em breve'}</td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button className="text-xs font-bold text-blue-600 hover:text-blue-700">Ver Detalhes</button>
                                        {isAdmin && (
                                            <button
                                                onClick={() => openConfirm('Remover esta oportunidade?', () => onDelete(op.id!))}
                                                className="p-1 text-red-400 hover:text-red-600"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
    </div>
);

export default OpportunitiesTab;
