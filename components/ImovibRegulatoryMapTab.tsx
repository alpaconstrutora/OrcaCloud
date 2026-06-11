import React, { useState, useEffect } from 'react';
import { ImovibRegulatoryZone, ImovibRegulatoryZoneUpdate } from '../types';
import { imovibService } from '../services/imovibService';
import { Plus, Trash2, Loader2, Map } from 'lucide-react';

interface Props {
    studyId: string;
}

const OPTIONS = {
    macroarea: ['Urbanização Consolidada', 'Qualificação Urbana', 'Transição Urbana', 'Resiliência Urbana'],
    zona: ['ZC', 'ZDSE', 'ZEEP', 'ZEIS 1', 'ZEIS 2', 'ZEIS 3', 'ZEM', 'ZEP', 'ZEPAM 1', 'ZEPAM 2', 'ZEPAM 3', 'ZEPEC 1a', 'ZEPEC 1b', 'ZEPEC 2', 'ZEPEC 3', 'ZM 1', 'ZM 2', 'ZM 3', 'ZM 4', 'ZPU'],
    ca_minimo: ['N.A.', '0,05', '0,25', '1'],
    ca_basico: ['N.A.', '2', '2,5', '3'],
    ca_maximo: ['N.A.', '3', '4', '5', '6'],
    taxa_ocupacao_maxima: ['N.A.', '0,7', '0,75', '0,8', '0,9'],
    taxa_permeabilidade_minima: ['N.A.', '0,05', '0,1'],
    gabarito_altura_maxima: ['N.A.', '10', '11,6', '18'],
} as const;

type FieldKey = keyof typeof OPTIONS;

const COLUMNS: { key: FieldKey; label: string; width: string }[] = [
    { key: 'macroarea',              label: 'Macroárea',            width: 'w-44' },
    { key: 'zona',                   label: 'Zona',                 width: 'w-28' },
    { key: 'ca_minimo',              label: 'C.A. Mínimo',          width: 'w-28' },
    { key: 'ca_basico',              label: 'C.A. Básico',          width: 'w-28' },
    { key: 'ca_maximo',              label: 'C.A. Máximo',          width: 'w-28' },
    { key: 'taxa_ocupacao_maxima',        label: 'T.O. Máx.',       width: 'w-24' },
    { key: 'taxa_permeabilidade_minima',  label: 'T.Perm. Mín.',   width: 'w-24' },
    { key: 'gabarito_altura_maxima', label: 'Gabarito (m)',         width: 'w-28' },
];

const SelectCell: React.FC<{
    value: string | undefined;
    options: readonly string[];
    onChange: (v: string) => void;
    saving: boolean;
}> = ({ value, options, onChange, saving }) => (
    <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={saving}
        className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 cursor-pointer py-0.5 disabled:opacity-50"
    >
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
);

const ImovibRegulatoryMapTab: React.FC<Props> = ({ studyId }) => {
    const [zones, setZones] = useState<ImovibRegulatoryZone[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        imovibService.getRegulatoryZones(studyId)
            .then(setZones)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [studyId]);

    const handleAdd = async () => {
        try {
            setAdding(true);
            const created = await imovibService.createRegulatoryZone({ study_id: studyId });
            setZones(prev => [...prev, created]);
        } catch (e) {
            console.error(e);
            alert('Erro ao adicionar zona.');
        } finally {
            setAdding(false);
        }
    };

    const handleUpdate = async (id: string, field: FieldKey, value: string) => {
        setZones(prev => prev.map(z => z.id === id ? { ...z, [field]: value } : z));
        setSavingId(id);
        try {
            await imovibService.updateRegulatoryZone(id, { [field]: value } as ImovibRegulatoryZoneUpdate);
        } catch (e) {
            console.error(e);
        } finally {
            setSavingId(null);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Excluir esta zona regulatória?')) return;
        setZones(prev => prev.filter(z => z.id !== id));
        try {
            await imovibService.deleteRegulatoryZone(id);
        } catch (e) {
            console.error(e);
            alert('Erro ao excluir zona.');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12 bg-white rounded-3xl border border-slate-100 shadow-sm">
                <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100">
                <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <Map className="w-5 h-5 text-indigo-500" />
                        Mapa Regulatório
                    </h2>
                    <p className="text-slate-500 text-sm mt-1 font-medium">
                        Parâmetros urbanísticos por zona do terreno (PDE / LPUOS).
                    </p>
                </div>
                <button
                    onClick={handleAdd}
                    disabled={adding}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm transition-all shadow-sm disabled:opacity-60"
                >
                    {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Nova Zona
                </button>
            </div>

            {zones.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <Map className="w-10 h-10 mb-3 opacity-30" />
                    <p className="font-bold text-sm">Nenhuma zona cadastrada</p>
                    <p className="text-xs mt-1">Clique em "Nova Zona" para adicionar</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-max">
                        <thead>
                            <tr className="bg-slate-50 text-[10px] font-black tracking-widest uppercase text-slate-400 border-b border-slate-100">
                                {COLUMNS.map(col => (
                                    <th key={col.key} className={`px-4 py-3 ${col.width}`}>{col.label}</th>
                                ))}
                                <th className="px-4 py-3 w-12" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {zones.map(zone => (
                                <tr
                                    key={zone.id}
                                    className={`group hover:bg-slate-50/60 transition-colors ${savingId === zone.id ? 'opacity-60' : ''}`}
                                >
                                    {COLUMNS.map(col => (
                                        <td key={col.key} className={`px-4 py-2.5 ${col.width}`}>
                                            <SelectCell
                                                value={zone[col.key] as string | undefined}
                                                options={OPTIONS[col.key]}
                                                onChange={(v) => handleUpdate(zone.id, col.key, v)}
                                                saving={savingId === zone.id}
                                            />
                                        </td>
                                    ))}
                                    <td className="px-4 py-2.5 text-right">
                                        <button
                                            onClick={() => handleDelete(zone.id)}
                                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                            title="Excluir zona"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default ImovibRegulatoryMapTab;
