// components/MapaRegulatorioEditor.tsx
//
// Editor do Mapa Regulatório — a tabela de zonas urbanísticas que agora MORA no empreendimento
// (empreendimento_regulatory_zones). Mesma tela nos três módulos: no Empreendimento direto, e
// na Viabilidade/Planta via o wrapper EstudoMapaRegulatorio (que resolve o empreendimento do
// estudo). Editar em qualquer lugar edita a mesma linha — fonte única.
import React from 'react';
import {
    EmpreendimentoRegulatoryZone,
    EmpreendimentoRegulatoryZoneUpdate,
} from '../types';
import { empreendimentoService } from '../services/empreendimentoService';
import { Plus, Loader2, Map } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { useConfirm } from './ui/confirm';

interface Props {
    empreendimentoId: string;
    organizationId: string;
}

type ZoneField =
    | 'macroarea' | 'zona' | 'ca_minimo' | 'ca_basico' | 'ca_maximo'
    | 'taxa_ocupacao_maxima' | 'taxa_permeabilidade_minima' | 'gabarito_altura_maxima'
    | 'uso_permitido' | 'recuo_frente' | 'recuo_lateral_direita' | 'recuo_lateral_esquerda'
    | 'recuo_fundos' | 'gabarito_pavimentos' | 'regra_vagas' | 'vagas_por_unidade'
    | 'area_minima_unidade' | 'lei_referencia' | 'documento_fonte' | 'nivel_confianca' | 'observacoes';

const SELECT_OPTIONS: Partial<Record<ZoneField, readonly string[]>> = {
    macroarea: ['Urbanização Consolidada', 'Qualificação Urbana', 'Transição Urbana', 'Resiliência Urbana'],
    zona: ['ZC', 'ZDSE', 'ZEEP', 'ZEIS 1', 'ZEIS 2', 'ZEIS 3', 'ZEM', 'ZEP', 'ZEPAM 1', 'ZEPAM 2', 'ZEPAM 3', 'ZEPEC 1a', 'ZEPEC 1b', 'ZEPEC 2', 'ZEPEC 3', 'ZM 1', 'ZM 2', 'ZM 3', 'ZM 4', 'ZPU'],
    ca_minimo: ['N.A.', '0,05', '0,25', '1'],
    ca_basico: ['N.A.', '2', '2,5', '3'],
    ca_maximo: ['N.A.', '3', '4', '5', '6'],
    taxa_ocupacao_maxima: ['N.A.', '0,7', '0,75', '0,8', '0,9'],
    taxa_permeabilidade_minima: ['N.A.', '0,05', '0,1'],
    gabarito_altura_maxima: ['N.A.', '10', '11,6', '18'],
    nivel_confianca: ['Baixo', 'Médio', 'Alto', 'Validado por profissional', 'Validado na prefeitura'],
};

interface ColDef { key: ZoneField; label: string; width: string; type: 'select' | 'text'; placeholder?: string; }

const COLUMNS: ColDef[] = [
    { key: 'macroarea',                  label: 'Macroárea',           width: 'w-44', type: 'select' },
    { key: 'zona',                       label: 'Zona',                width: 'w-28', type: 'select' },
    { key: 'uso_permitido',              label: 'Uso permitido',       width: 'w-40', type: 'text', placeholder: 'Residencial, misto…' },
    { key: 'ca_minimo',                  label: 'C.A. mínimo',         width: 'w-28', type: 'select' },
    { key: 'ca_basico',                  label: 'C.A. básico',         width: 'w-28', type: 'select' },
    { key: 'ca_maximo',                  label: 'C.A. máximo',         width: 'w-28', type: 'select' },
    { key: 'taxa_ocupacao_maxima',       label: 'T.O. máx.',           width: 'w-24', type: 'select' },
    { key: 'taxa_permeabilidade_minima', label: 'T.perm. mín.',        width: 'w-24', type: 'select' },
    { key: 'gabarito_altura_maxima',     label: 'Gabarito (m)',        width: 'w-28', type: 'select' },
    { key: 'gabarito_pavimentos',        label: 'Gabarito (pav.)',     width: 'w-28', type: 'text', placeholder: 'nº' },
    { key: 'recuo_frente',               label: 'Recuo frente (m)',    width: 'w-28', type: 'text', placeholder: '0' },
    { key: 'recuo_fundos',               label: 'Recuo fundos (m)',    width: 'w-28', type: 'text', placeholder: '0' },
    { key: 'recuo_lateral_direita',      label: 'Recuo lat. dir. (m)', width: 'w-32', type: 'text', placeholder: '0' },
    { key: 'recuo_lateral_esquerda',     label: 'Recuo lat. esq. (m)', width: 'w-32', type: 'text', placeholder: '0' },
    { key: 'regra_vagas',                label: 'Regra de vagas',      width: 'w-40', type: 'text', placeholder: 'por unidade, por m²…' },
    { key: 'vagas_por_unidade',          label: 'Vagas / unidade',     width: 'w-28', type: 'text', placeholder: '0' },
    { key: 'area_minima_unidade',        label: 'Área mín. unid. (m²)', width: 'w-32', type: 'text', placeholder: '0' },
    { key: 'lei_referencia',             label: 'Lei de referência',   width: 'w-44', type: 'text', placeholder: 'Lei nº…' },
    { key: 'documento_fonte',            label: 'Documento fonte',     width: 'w-44', type: 'text' },
    { key: 'nivel_confianca',            label: 'Nível de confiança',  width: 'w-48', type: 'select' },
    { key: 'observacoes',                label: 'Observações',         width: 'w-56', type: 'text' },
];

const SelectCell: React.FC<{ value?: string; options: readonly string[]; onChange: (v: string) => void; saving: boolean }> =
    ({ value, options, onChange, saving }) => (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={saving}
        className="w-full bg-transparent border-none focus:ring-0 text-sm font-normal text-slate-700 cursor-pointer py-0.5 disabled:opacity-50">
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
);

const TextCell: React.FC<{ value?: string; onCommit: (v: string) => void; saving: boolean; placeholder?: string }> =
    ({ value, onCommit, saving, placeholder }) => (
    <input type="text" defaultValue={value ?? ''} placeholder={placeholder} disabled={saving}
        onBlur={(e) => { if ((e.target.value ?? '') !== (value ?? '')) onCommit(e.target.value); }}
        className="w-full bg-transparent border-none focus:ring-1 focus:ring-indigo-400 rounded text-sm font-normal text-slate-700 py-0.5 disabled:opacity-50" />
);

export const MapaRegulatorioEditor: React.FC<Props> = ({ empreendimentoId, organizationId }) => {
    const confirm = useConfirm();
    const [zones, setZones] = React.useState<EmpreendimentoRegulatoryZone[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [savingId, setSavingId] = React.useState<string | null>(null);
    const [adding, setAdding] = React.useState(false);

    React.useEffect(() => {
        setLoading(true);
        empreendimentoService.listRegulatoryZones(empreendimentoId)
            .then(setZones).catch(console.error).finally(() => setLoading(false));
    }, [empreendimentoId]);

    const handleAdd = async () => {
        try {
            setAdding(true);
            const created = await empreendimentoService.createRegulatoryZone({
                empreendimento_id: empreendimentoId, organization_id: organizationId, sort_order: zones.length,
            });
            setZones(prev => [...prev, created]);
        } catch (e) { console.error(e); } finally { setAdding(false); }
    };

    const handleUpdate = async (id: string, field: ZoneField, value: string) => {
        setZones(prev => prev.map(z => z.id === id ? { ...z, [field]: value } : z));
        setSavingId(id);
        try {
            await empreendimentoService.updateRegulatoryZone(id, { [field]: value } as EmpreendimentoRegulatoryZoneUpdate);
        } catch (e) { console.error(e); } finally { setSavingId(null); }
    };

    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: 'Excluir zona regulatória?',
            message: 'A zona e seus parâmetros serão removidos.',
            confirmLabel: 'Excluir', variant: 'danger',
        });
        if (!ok) return;
        setZones(prev => prev.filter(z => z.id !== id));
        try { await empreendimentoService.deleteRegulatoryZone(id); } catch (e) { console.error(e); }
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
            <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100">
                <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <Map className="w-5 h-5 text-indigo-500" /> Mapa Regulatório
                    </h2>
                    <p className="text-slate-500 text-sm mt-1 font-medium">
                        Todos os parâmetros urbanísticos por zona, no empreendimento — compartilhado com
                        Viabilidade e Planta. Editar aqui edita em todos.
                    </p>
                </div>
                <button onClick={handleAdd} disabled={adding}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm transition-all shadow-sm disabled:opacity-60 shrink-0">
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
                            <tr className="bg-slate-50 text-xs font-black tracking-widest uppercase text-slate-400 border-b border-slate-100">
                                {COLUMNS.map(col => <th key={col.key} className={`px-4 py-3 ${col.width}`}>{col.label}</th>)}
                                <th className="px-4 py-3 w-12" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {zones.map(zone => (
                                <tr key={zone.id} className={`group hover:bg-slate-50/60 transition-colors ${savingId === zone.id ? 'opacity-60' : ''}`}>
                                    {COLUMNS.map(col => (
                                        <td key={col.key} className={`px-4 py-2.5 ${col.width}`}>
                                            {col.type === 'select' ? (
                                                <SelectCell
                                                    value={zone[col.key] as string | undefined}
                                                    options={SELECT_OPTIONS[col.key] ?? []}
                                                    onChange={(v) => handleUpdate(zone.id, col.key, v)}
                                                    saving={savingId === zone.id}
                                                />
                                            ) : (
                                                <TextCell
                                                    value={zone[col.key] as string | undefined}
                                                    onCommit={(v) => handleUpdate(zone.id, col.key, v)}
                                                    saving={savingId === zone.id}
                                                    placeholder={col.placeholder}
                                                />
                                            )}
                                        </td>
                                    ))}
                                    <td className="px-4 py-2.5 text-right">
                                        <ActionIconButton kind="delete" className="opacity-0 group-hover:opacity-100" title="Excluir zona" onClick={() => handleDelete(zone.id)} />
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

export default MapaRegulatorioEditor;
