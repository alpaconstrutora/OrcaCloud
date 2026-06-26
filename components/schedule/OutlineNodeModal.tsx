import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { OutlineNodeType } from '../../utils/scheduleOutline';
import { TaskNature } from '../../types';
import { TASK_NATURE_LIST, TASK_NATURE_META } from '../../utils/taskNature';

const TYPE_LABEL: Record<OutlineNodeType, string> = {
    group: 'Grupo', phase: 'Etapa', subphase: 'Subetapa', activity: 'Atividade', item: 'Item',
};

interface OutlineNodeModalProps {
    mode: 'create' | 'rename';
    nodeType: OutlineNodeType;
    initialName: string;
    /** Mostra o seletor de Natureza (apenas folhas: item/activity). */
    showNature?: boolean;
    initialNature?: TaskNature;
    /** Sobrescreve o título (ex.: "Adicionar Marco"). */
    titleOverride?: string;
    onCancel: () => void;
    onSubmit: (name: string, nature?: TaskNature) => void;
}

export const OutlineNodeModal: React.FC<OutlineNodeModalProps> = ({
    mode, nodeType, initialName, showNature, initialNature, titleOverride, onCancel, onSubmit,
}) => {
    const [name, setName] = useState(initialName);
    const [nature, setNature] = useState<TaskNature | undefined>(initialNature);
    useEffect(() => { setName(initialName); setNature(initialNature); }, [initialName, initialNature]);

    const title = titleOverride ?? (mode === 'create' ? `Adicionar ${TYPE_LABEL[nodeType]}` : `Renomear ${TYPE_LABEL[nodeType]}`);
    const submit = () => { if (name.trim()) onSubmit(name.trim(), showNature ? nature : undefined); };

    return (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-[420px] flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-gray-900">{title}</h2>
                    <button onClick={onCancel} className="p-1.5 hover:bg-gray-100 rounded-lg transition-all text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="px-6 py-4 space-y-4">
                    <div>
                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Nome</label>
                        <input
                            autoFocus
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
                            placeholder={`Nome ${mode === 'create' ? 'da nova ' : 'd'}${TYPE_LABEL[nodeType].toLowerCase()}`}
                            className="mt-1.5 w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
                        />
                    </div>

                    {showNature && (
                        <div>
                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Natureza</label>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setNature(undefined)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${!nature ? 'border-gray-400 bg-gray-100 text-gray-700' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                                >
                                    —
                                </button>
                                {TASK_NATURE_LIST.map(n => {
                                    const meta = TASK_NATURE_META[n];
                                    const active = nature === n;
                                    return (
                                        <button
                                            key={n}
                                            type="button"
                                            onClick={() => setNature(n)}
                                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${active ? meta.badge + ' border-transparent ring-1 ring-offset-1 ring-gray-300' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                        >
                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
                                            {meta.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
                    <button onClick={onCancel} className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all">
                        Cancelar
                    </button>
                    <button
                        onClick={submit}
                        disabled={!name.trim()}
                        className="px-4 py-2 text-sm font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {mode === 'create' ? 'Adicionar' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
};
