import React from 'react';
import { Calendar, Plus, X, LayoutDashboard, Table2, ExternalLink, TrendingUp, Clock } from 'lucide-react';
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
}) => {
    const [selected, setSelected] = React.useState<InvestorOpportunity | null>(null);

    return (
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
                                    <button
                                        onClick={() => setSelected(op)}
                                        className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-blue-900/40"
                                    >
                                        Garantir Cota
                                    </button>
                                    <button
                                        onClick={() => setSelected(op)}
                                        className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl transition-all border border-white/10 backdrop-blur"
                                    >
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
                                            <button
                                                onClick={() => setSelected(op)}
                                                className="text-xs font-bold text-blue-600 hover:text-blue-700"
                                            >
                                                Ver Detalhes
                                            </button>
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

            {/* Modal de detalhes */}
            {selected && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
                    onClick={() => setSelected(null)}
                >
                    <div
                        className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full mx-4 animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between mb-6">
                            <div>
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-[10px] font-black uppercase tracking-wider mb-2">
                                    <Calendar className="w-3 h-3" />
                                    Oportunidade
                                </span>
                                <h2 className="text-2xl font-black text-gray-900">{selected.title}</h2>
                                {selected.subtitle && (
                                    <p className="text-sm text-gray-500 mt-1">{selected.subtitle}</p>
                                )}
                            </div>
                            <button
                                onClick={() => setSelected(null)}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-emerald-50 rounded-2xl p-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">Retorno Projetado</span>
                                </div>
                                <p className="text-2xl font-black text-emerald-700">{selected.projected_yield ?? '—'} <span className="text-sm font-bold">a.a.</span></p>
                            </div>
                            <div className="bg-blue-50 rounded-2xl p-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <Clock className="w-4 h-4 text-blue-600" />
                                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-wider">Reservas Abertas</span>
                                </div>
                                <p className="text-2xl font-black text-blue-700">{selected.open_date || 'Em breve'}</p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            {selected.link ? (
                                <a
                                    href={selected.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white text-sm font-bold rounded-2xl hover:bg-blue-700 transition-colors"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    Acessar Material
                                </a>
                            ) : (
                                <button
                                    disabled
                                    className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-gray-100 text-gray-400 text-sm font-bold rounded-2xl cursor-not-allowed"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    Material em breve
                                </button>
                            )}
                            <button
                                onClick={() => setSelected(null)}
                                className="px-5 py-3 text-sm font-bold text-gray-500 hover:text-gray-700 rounded-2xl hover:bg-gray-100 transition-colors"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OpportunitiesTab;
