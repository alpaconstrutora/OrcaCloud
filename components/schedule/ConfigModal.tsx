import React from 'react';
import { X } from 'lucide-react';
import { ProjectSchedule, ReplanMode } from '../../types';

interface ConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    schedule: ProjectSchedule;
    onUpdate: (updates: Partial<ProjectSchedule>) => void;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({ isOpen, onClose, schedule, onUpdate }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl h-full max-h-[90vh] overflow-hidden flex flex-col border animate-in fade-in zoom-in duration-200 border-gray-200">
                <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="text-lg font-bold text-gray-800">Definições do Cronograma</h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-gray-700">Dias Úteis</span>
                                <span className="text-[10px] text-gray-400">Ignorar Sábados e Domingos</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={schedule.useWorkingDays ?? true}
                                    onChange={(e) => onUpdate({ useWorkingDays: e.target.checked })}
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none ring-4 ring-blue-500/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        <div className="space-y-2">
                            <span className="text-sm font-bold text-gray-700">Modo de Replanejamento</span>
                            <div className="grid grid-cols-1 gap-2">
                                {[
                                    { id: ReplanMode.AFFECTED_TASK, label: 'Cascata (CPM)', desc: 'Propaga apenas em tarefas sucessoras' },
                                    { id: ReplanMode.CURRENT_DATE, label: 'Hoje em Diante', desc: 'Calcula o restante a partir de hoje' },
                                ].map(mode => (
                                    <button
                                        key={mode.id}
                                        onClick={() => onUpdate({ replanMode: mode.id as ReplanMode })}
                                        className={`p-3 rounded-xl border-2 text-left transition-all ${schedule.replanMode === mode.id || (!schedule.replanMode && mode.id === ReplanMode.AFFECTED_TASK) ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}
                                    >
                                        <div className="text-xs font-bold text-gray-800">{mode.label}</div>
                                        <div className="text-[10px] text-gray-400">{mode.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
