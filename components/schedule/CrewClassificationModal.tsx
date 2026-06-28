import React, { useEffect, useState } from 'react';
import { X, Users, Plus, RotateCcw, Loader2, Info } from 'lucide-react';
import { CrewClassificationConfig, SchedulingEngine } from '../../utils/schedulingEngine';
import { crewClassificationService, effectiveCrewClassification } from '../../services/crewClassificationService';

interface CrewClassificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    organizationId?: string;
    /** Called after a successful save so the caller can recalc the schedule. */
    onSaved?: () => void;
}

type ListKey = keyof CrewClassificationConfig;

const SECTIONS: { key: ListKey; title: string; desc: string; placeholder: string; accent: string }[] = [
    {
        key: 'laborRoles',
        title: 'Mão de obra',
        desc: 'Palavras que identificam um insumo como mão de obra (quando a natureza SINAPI não informa).',
        placeholder: 'ex.: calceteiro',
        accent: 'blue',
    },
    {
        key: 'mainWorkerRoles',
        title: 'Oficiais (dirigem a duração)',
        desc: 'Cargos contados como oficial — são eles que determinam o prazo da tarefa.',
        placeholder: 'ex.: meio-oficial',
        accent: 'green',
    },
    {
        key: 'helperRoles',
        title: 'Ajudantes (apoio)',
        desc: 'Cargos de apoio (servente/ajudante). Não aceleram o prazo quando há oficial.',
        placeholder: 'ex.: meio-servente',
        accent: 'amber',
    },
    {
        key: 'equipmentKeywords',
        title: 'Equipamentos (excluir)',
        desc: 'Palavras que marcam um insumo medido em horas como equipamento, e não mão de obra.',
        placeholder: 'ex.: retroescavadeira',
        accent: 'gray',
    },
];

const accentChip: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    gray: 'bg-gray-100 border-gray-200 text-gray-600',
};

export const CrewClassificationModal: React.FC<CrewClassificationModalProps> = ({ isOpen, onClose, organizationId, onSaved }) => {
    const [config, setConfig] = useState<CrewClassificationConfig>(() => effectiveCrewClassification(null));
    const [drafts, setDrafts] = useState<Record<ListKey, string>>({ laborRoles: '', equipmentKeywords: '', helperRoles: '', mainWorkerRoles: '' });
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const eff = organizationId
                    ? await crewClassificationService.getEffective(organizationId)
                    : effectiveCrewClassification(null);
                if (!cancelled) setConfig(eff);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [isOpen, organizationId]);

    if (!isOpen) return null;

    const addTerm = (key: ListKey) => {
        const term = drafts[key].trim().toLowerCase();
        if (!term) return;
        setConfig(prev => prev[key].includes(term) ? prev : { ...prev, [key]: [...prev[key], term] });
        setDrafts(prev => ({ ...prev, [key]: '' }));
    };

    const removeTerm = (key: ListKey, term: string) => {
        setConfig(prev => ({ ...prev, [key]: prev[key].filter(t => t !== term) }));
    };

    const restoreDefaults = () => setConfig(effectiveCrewClassification(null));

    const handleSave = async () => {
        setSaving(true);
        try {
            if (organizationId) {
                await crewClassificationService.save(organizationId, config);
            }
            SchedulingEngine.configureCrewClassification(config);
            onSaved?.();
            onClose();
        } catch (err) {
            console.error('[CREW CLASSIFICATION] save failed', err);
            window.alert('Não foi possível salvar a configuração de cargos.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[88vh] overflow-hidden flex flex-col border border-gray-200 animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-blue-600" />
                        <h3 className="text-lg font-bold text-gray-800">Classificação de Cargos</h3>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex items-start gap-2 px-6 py-3 bg-blue-50/60 border-b border-blue-100">
                    <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-blue-700 leading-relaxed">
                        O <strong>Auto Equipe</strong> usa estas listas para reconhecer mão de obra nas composições e
                        montar a equipe. Adicione cargos fora do padrão SINAPI (ex.: CALCETEIRO, MARMORISTA).
                        Vale para esta organização.
                    </p>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16 text-gray-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                ) : (
                    <div className="p-6 space-y-5 overflow-y-auto">
                        {SECTIONS.map(section => {
                            const terms = config[section.key];
                            return (
                                <div key={section.key} className="space-y-2">
                                    <div>
                                        <span className="text-sm font-black text-gray-700">{section.title}</span>
                                        <p className="text-[10px] text-gray-400">{section.desc}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {terms.map(term => (
                                            <span key={term} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold ${accentChip[section.accent]}`}>
                                                {term}
                                                <button onClick={() => removeTerm(section.key, term)} className="hover:opacity-60">
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </span>
                                        ))}
                                        {terms.length === 0 && <span className="text-[11px] text-gray-300 italic py-1">Nenhum termo</span>}
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            value={drafts[section.key]}
                                            onChange={e => setDrafts(prev => ({ ...prev, [section.key]: e.target.value }))}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTerm(section.key); } }}
                                            placeholder={section.placeholder}
                                            className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                                        />
                                        <button
                                            onClick={() => addTerm(section.key)}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-button font-bold hover:bg-gray-700"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Adicionar
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="flex items-center justify-between gap-2 p-4 border-t border-gray-100 bg-gray-50">
                    <button
                        onClick={restoreDefaults}
                        disabled={saving || loading}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-button font-bold text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                    >
                        <RotateCcw className="w-3.5 h-3.5" /> Restaurar padrões SINAPI
                    </button>
                    <div className="flex gap-2">
                        <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-50">
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || loading}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
                        >
                            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                            Salvar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
