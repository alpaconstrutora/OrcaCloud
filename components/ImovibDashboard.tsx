import React, { useState, useEffect } from 'react';
import { Plus, Search, Building2, TrendingUp, BarChart, Calendar, ChevronRight, Loader2, Trash2 } from 'lucide-react';
import { ImovibStudy } from '../types';
import { imovibService } from '../services/imovibService';

interface ImovibDashboardProps {
    organizationId?: string;
    onNewStudy: () => void;
    onViewStudy: (id: string) => void;
}

const ImovibDashboard: React.FC<ImovibDashboardProps> = ({ organizationId, onNewStudy, onViewStudy }) => {
    const [studies, setStudies] = useState<ImovibStudy[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const loadStudies = async () => {
        try {
            setLoading(true);
            const data = await imovibService.getStudies(organizationId);
            setStudies(data);
        } catch (error) {
            console.error('Error loading studies:', error);
            alert('Erro ao carregar estudos.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStudies();
    }, [organizationId]);

    const handleDeleteStudy = async (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation(); // Previne abrir o estudo ao clicar em excluir
        if (window.confirm(`Tem certeza que deseja excluir o estudo "${name}"? Esta ação não pode ser desfeita.`)) {
            try {
                await imovibService.deleteStudy(id);
                alert('Estudo excluído com sucesso.');
                loadStudies(); // Recarrega a lista
            } catch (error) {
                console.error('Error deleting study:', error);
                alert('Erro ao excluir estudo.');
            }
        }
    };

    const filteredStudies = studies.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.developer && s.developer.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 pb-12">
            {/* Header section with gradient background */}
            <div className="relative overflow-hidden bg-gradient-to-br from-indigo-900 via-blue-900 to-indigo-800 p-10 rounded-[2.5rem] shadow-xl">
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4"></div>

                <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="max-w-xl">
                        <h1 className="text-3xl font-black text-white tracking-tight mb-3">IMOVIB <span className="text-indigo-300 font-light">| Viabilidade</span></h1>
                        <p className="text-indigo-100/80 text-sm leading-relaxed">
                            Plataforma especialista em análise de viabilidade econômico-financeira de empreendimentos.
                            Substitua planilhas frágeis por modelos paramétricos profissionais, gere relatórios executivos
                            e tome decisões de investimento em tempo real.
                        </p>
                    </div>
                    <button
                        onClick={onNewStudy}
                        className="flex items-center gap-2 bg-white text-indigo-900 px-6 py-3.5 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-indigo-50 hover:scale-105 transition-all shadow-xl shadow-indigo-900/20 active:scale-95 whitespace-nowrap"
                    >
                        <Plus className="w-5 h-5" />
                        Novo Estudo
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                    <div>
                        <h2 className="text-xl font-black text-gray-900 tracking-tight">Estudos Recentes</h2>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Gerencie seu portfólio de viabilidades</p>
                    </div>

                    <div className="relative group min-w-[300px]">
                        <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-indigo-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Buscar estudo ou incorporadora..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3.5 bg-gray-50/50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-gray-400 font-medium"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="py-24 flex flex-col items-center justify-center text-indigo-500">
                        <Loader2 className="w-10 h-10 animate-spin mb-4" />
                        <p className="text-xs font-bold uppercase tracking-widest animate-pulse">Carregando Estudos...</p>
                    </div>
                ) : filteredStudies.length === 0 ? (
                    <div className="text-center py-20 bg-gray-50/50 rounded-3xl border border-dashed border-gray-200">
                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                            <BarChart className="w-10 h-10 text-indigo-300" />
                        </div>
                        <h3 className="text-lg font-black text-gray-900 mb-2">Nenhum estudo encontrado</h3>
                        <p className="text-sm text-gray-500 max-w-sm mx-auto mb-8">
                            Você ainda não possui nenhum estudo de viabilidade. Clique abaixo para iniciar sua primeira análise financeira paramétrica.
                        </p>
                        <button
                            onClick={onNewStudy}
                            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-md active:scale-95"
                        >
                            <Plus className="w-4 h-4" />
                            Criar Primeiro Estudo
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredStudies.map((study) => (
                            <div
                                key={study.id}
                                onClick={() => onViewStudy(study.id)}
                                className="group bg-white border border-gray-100 rounded-3xl p-6 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-100/50 transition-all cursor-pointer flex flex-col h-full relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <Building2 className="w-24 h-24 text-indigo-900" />
                                </div>

                                <div className="flex items-start justify-between mb-4 relative z-10">
                                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                        <TrendingUp className="w-6 h-6" />
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-lg">
                                            {study.phase || 'Estudo Inicial'}
                                        </span>
                                        <span className="text-[10px] font-bold text-gray-400 mt-1">v{study.version}</span>
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
            </div>
        </div>
    );
};

export default ImovibDashboard;
