import React, { useState } from 'react';
import { TrendingUp, X, CheckCircle2, Trash2 } from 'lucide-react';
import { Baseline } from '../../types';

interface BaselineModalProps {
    isOpen: boolean;
    onClose: () => void;
    baselines: Baseline[];
    onSave: (name: string, description: string) => void;
    onActivate: (id: string | null) => void;
    onDelete: (id: string) => void;
    activeBaselineId?: string;
}

export const BaselineModal: React.FC<BaselineModalProps> = ({
    isOpen,
    onClose,
    baselines,
    onSave,
    onActivate,
    onDelete,
    activeBaselineId
}) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl h-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200 border border-gray-200">
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-500" />
                        <h3 className="text-lg font-bold text-gray-800">Linhas de Base (Baseline)</h3>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 space-y-4 flex-1 overflow-y-auto p-6">
                    <p className="text-xs text-gray-500 leading-relaxed">
                        Salve o estado atual do cronograma como uma linha de base para comparar o progresso real vs planejado e medir atrasos (slippage).
                    </p>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">Nova Linha de Base</label>
                        <input
                            type="text"
                            placeholder="Nome (ex: Planejamento Inicial)"
                            className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                        <button
                            disabled={!name}
                            onClick={() => { onSave(name, description); setName(''); setDescription(''); }}
                            className="w-full py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                        >
                            Salvar Estado Atual
                        </button>
                    </div>

                    <div className="border-t pt-4">
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Linhas de Base Salvas</label>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                            <div
                                onClick={() => onActivate(null)}
                                className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex justify-between items-center ${!activeBaselineId ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/10' : 'border-gray-100 hover:border-gray-200'}`}
                            >
                                <span className="font-bold text-gray-700 text-sm italic">Nenhuma (Visualização Real)</span>
                                {!activeBaselineId && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                            </div>
                            {baselines?.map(b => (
                                <div
                                    key={b.id}
                                    onClick={() => onActivate(b.id)}
                                    className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex justify-between items-center ${activeBaselineId === b.id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/10' : 'border-gray-100 hover:border-gray-200'}`}
                                >
                                    <div>
                                        <div className="font-bold text-gray-800 text-sm">{b.name}</div>
                                        <div className="text-[10px] text-gray-400">{new Date(b.createdAt).toLocaleString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {activeBaselineId === b.id && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onDelete(b.id); }}
                                            className="p-1 hover:text-red-500 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
