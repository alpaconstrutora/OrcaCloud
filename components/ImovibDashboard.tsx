import React, { useState, useEffect } from 'react';
import { Plus, Search, Building2, TrendingUp, BarChart, Calendar, ChevronRight, Trash2, AlertCircle } from 'lucide-react';
import { ImovibStudy } from '../types';
import { imovibService } from '../services/imovibService';
import { usePersistedState } from './ui/TableUtils';
import { useConfirm } from './ui/confirm';

interface ImovibDashboardProps {
    organizationId?: string;
    onNewStudy: () => void;
    onViewStudy: (id: string) => void;
}

const ImovibDashboard: React.FC<ImovibDashboardProps> = ({ organizationId, onNewStudy, onViewStudy }) => {
    const [studies, setStudies] = useState<ImovibStudy[]>([]);
    const [loading, setLoading] = useState(true);
    // F2: filtros sobrevivem a navegação/reload.
    const [searchTerm, setSearchTerm] = usePersistedState('imovibDashboardFilters:search', '');
    const confirm = useConfirm();
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const loadStudies = async () => {
        try {
            setLoading(true);
            const data = await imovibService.getStudies(organizationId);
            setStudies(data);
        } catch (error) {
            console.error('Error loading studies:', error);
            notify('Erro ao carregar estudos.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStudies();
    }, [organizationId]);

    const handleDeleteStudy = async (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation(); // Previne abrir o estudo ao clicar em excluir
        const ok = await confirm({
            title: 'Excluir estudo?',
            message: `Tem certeza que deseja excluir o estudo "${name}"? Esta ação não pode ser desfeita.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await imovibService.deleteStudy(id);
            notify('Estudo excluído com sucesso.');
            loadStudies();
        } catch (error) {
            console.error('Error deleting study:', error);
            notify('Erro ao excluir estudo.', 'error');
        }
    };

    const filteredStudies = studies.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.developer && s.developer.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="space-y-6">
            {/* Header — §20 (flat, sem hero) */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Estudos de Viabilidade</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Análise de viabilidade econômico-financeira de empreendimentos.</p>
                </div>
                <button
                    onClick={onNewStudy}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                >
                    <Plus className="w-[15px] h-[15px]" />
                    Novo estudo
                </button>
            </div>

            {/* Filters — §5.1 (variante desaninhada, escala compacta §16) */}
            <div className="flex flex-col md:flex-row gap-2.5 items-center">
                <div className="flex-1 relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar estudo ou incorporadora..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando estudos...</p>
                </div>
            ) : filteredStudies.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-[10px] border border-gray-100">
                    <BarChart className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum estudo encontrado</h3>
                    <p className="text-sm text-gray-500 mb-6">
                        Você ainda não possui nenhum estudo de viabilidade. Clique abaixo para iniciar sua primeira análise financeira paramétrica.
                    </p>
                    <button
                        onClick={onNewStudy}
                        className="text-blue-600 font-bold hover:underline"
                    >
                        Criar primeiro estudo
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredStudies.map((study) => (
                        <div
                            key={study.id}
                            onClick={() => onViewStudy(study.id)}
                            className="group bg-white border border-gray-100 rounded-[10px] p-6 hover:border-blue-200 hover:shadow-lg transition-all cursor-pointer flex flex-col h-full relative overflow-hidden"
                        >
                                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <Building2 className="w-24 h-24 text-indigo-900" />
                                </div>

                                <div className="flex items-start justify-between mb-4 relative z-10">
                                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                        <TrendingUp className="w-6 h-6" />
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-xs font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-lg">
                                            {study.phase || 'Estudo Inicial'}
                                        </span>
                                        <span className="text-xs font-bold text-gray-400 mt-1">v{study.version}</span>
                                    </div>
                                </div>

                                <div className="flex-1 relative z-10">
                                    <h3 className="text-lg font-black text-gray-900 leading-tight mb-2 group-hover:text-indigo-600 transition-colors">
                                        {study.name}
                                    </h3>
                                    <p className="text-sm text-gray-500 line-clamp-2">
                                        {study.developer || 'Desenvolvedora não informada'}
                                    </p>
                                </div>

                                <div className="mt-8 pt-6 border-t border-gray-50 flex items-center justify-between relative z-10">
                                    <div className="flex items-center gap-2 text-gray-400">
                                        <Calendar className="w-4 h-4" />
                                        <span className="text-xs font-bold">{new Date(study.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={(e) => handleDeleteStudy(e, study.id, study.name)}
                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Excluir Estudo"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <div className="flex items-center gap-1 text-indigo-600 font-bold text-xs uppercase tracking-widest group-hover:gap-2 transition-all">
                                            Ver Dados
                                            <ChevronRight className="w-4 h-4" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

            {/* Toast de Notificação — §13 */}
            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default ImovibDashboard;
