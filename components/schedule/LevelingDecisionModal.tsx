import React from 'react';
import { AlertCircle, X, Clock, Users } from 'lucide-react';
import { LevelingIssue } from '../../types';

interface LevelingDecisionModalProps {
    issues: LevelingIssue[];
    onClose: () => void;
    onResolve: (action: 'EXTEND' | 'INCREASE') => void;
}

export const LevelingDecisionModal: React.FC<LevelingDecisionModalProps> = ({ issues, onClose, onResolve }) => {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] animate-in fade-in duration-300">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 flex flex-col animate-in zoom-in-95 duration-300">
                <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-gradient-to-r from-orange-50 to-white">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-orange-100 rounded-2xl">
                            <AlertCircle className="w-6 h-6 text-orange-600" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-gray-900 leading-tight">Gargalos de Recurso Detectados</h3>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">Alguns itens excedem a capacidade disponível</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="p-8 overflow-y-auto max-h-[50vh]">
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600 leading-relaxed">
                            O nivelador identificou que algumas tarefas, individualmente, exigem mais recursos do que o limite total configurado. Mover estas tarefas no tempo não resolverá o problema.
                        </p>

                        <div className="space-y-2">
                            {issues.map((issue, idx) => (
                                <div key={idx} className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="text-xs font-black text-gray-900 uppercase">Item: {issue.itemId}</div>
                                            <div className="text-sm font-medium text-gray-600 mt-1">Recurso: <span className="text-orange-600 font-bold">{issue.resourceName}</span></div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] font-black text-gray-400 uppercase">Necessário vs Limite</div>
                                            <div className="text-sm font-black text-gray-900">{issue.required} &gt; {issue.capacity}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-8 bg-gray-50 border-t border-gray-100 grid grid-cols-2 gap-4">
                    <button
                        onClick={() => onResolve('EXTEND')}
                        className="flex flex-col items-center gap-2 p-6 bg-white border-2 border-transparent hover:border-blue-500 rounded-3xl transition-all shadow-sm group"
                    >
                        <Clock className="w-8 h-8 text-blue-500 group-hover:scale-110 transition-transform" />
                        <div className="text-center">
                            <div className="text-sm font-black text-gray-900">Alongar Prazo</div>
                            <div className="text-[10px] text-gray-500 font-medium mt-1">Reduz a equipe para caber na capacidade</div>
                        </div>
                    </button>

                    <button
                        onClick={() => onResolve('INCREASE')}
                        className="flex flex-col items-center gap-2 p-6 bg-white border-2 border-transparent hover:border-orange-500 rounded-3xl transition-all shadow-sm group"
                    >
                        <Users className="w-8 h-8 text-orange-500 group-hover:scale-110 transition-transform" />
                        <div className="text-center">
                            <div className="text-sm font-black text-gray-900">Aumentar Equipe</div>
                            <div className="text-[10px] text-gray-500 font-medium mt-1">Adiciona trabalhadores para manter o prazo</div>
                        </div>
                    </button>

                    <button
                        onClick={onClose}
                        className="col-span-2 mt-2 py-3 text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors"
                    >
                        Ignorar por enquanto
                    </button>
                </div>
            </div>
        </div>
    );
};
