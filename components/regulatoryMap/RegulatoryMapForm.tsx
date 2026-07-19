// components/regulatoryMap/RegulatoryMapForm.tsx
import React from 'react';
import { X, Loader2, Map, AlertCircle } from 'lucide-react';
import { regulatoryMapService } from '../../services/regulatoryMapService';
import { organizationService } from '../../services/organizationService';
import { RegulatoryMap, RegulatoryMapStatus, RegulatoryMapWithCity, Organization } from '../../types';
import CitySearchSelect, { CitySearchValue } from './CitySearchSelect';

interface Props {
    /** Vazio quando o usuário está com "Todas as organizações" — o modal pede a org num seletor. */
    organizationId: string;
    editing?: RegulatoryMapWithCity | null;
    onClose: () => void;
    onSaved: (map: RegulatoryMap) => void;
}

const STATUS_OPTIONS: { value: RegulatoryMapStatus; label: string }[] = [
    { value: 'ATIVO', label: 'Ativo' },
    { value: 'RASCUNHO', label: 'Rascunho' },
    { value: 'ARQUIVADO', label: 'Arquivado' },
];

export const RegulatoryMapForm: React.FC<Props> = ({ organizationId, editing, onClose, onSaved }) => {
    const needsOrgPicker = !editing && !organizationId;
    const [orgId, setOrgId] = React.useState(editing?.organization_id || organizationId || '');
    const [organizations, setOrganizations] = React.useState<Organization[]>([]);
    const [city, setCity] = React.useState<CitySearchValue | null>(
        editing ? { id: editing.city_id, name: editing.city_name || '', state_code: editing.state_code } : null,
    );
    const [name, setName] = React.useState(editing?.name ?? '');
    const [leiReferencia, setLeiReferencia] = React.useState(editing?.lei_referencia ?? '');
    const [status, setStatus] = React.useState<RegulatoryMapStatus>(editing?.status ?? 'ATIVO');
    const [observacoes, setObservacoes] = React.useState(editing?.observacoes ?? '');
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!needsOrgPicker) return;
        organizationService.listOrganizations().then(setOrganizations).catch(() => setOrganizations([]));
    }, [needsOrgPicker]);

    // Sugere um nome automático ao escolher a cidade, se o usuário ainda não digitou nada.
    React.useEffect(() => {
        if (!city || editing) return;
        setName(prev => prev || `Mapa Regulatório - ${city.name}${city.state_code ? '/' + city.state_code : ''}`);
    }, [city, editing]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!orgId) { setError('Selecione a organização.'); return; }
        if (!city) { setError('Selecione a cidade.'); return; }
        if (!name.trim()) { setError('Informe um nome para o mapa.'); return; }

        setSaving(true);
        try {
            if (editing) {
                await regulatoryMapService.update(editing.id, {
                    city_id: city.id, name: name.trim(), lei_referencia: leiReferencia || undefined,
                    status, observacoes: observacoes || undefined,
                });
                onSaved({ ...editing, city_id: city.id, name: name.trim(), lei_referencia: leiReferencia || undefined, status, observacoes: observacoes || undefined });
            } else {
                const created = await regulatoryMapService.create({
                    organization_id: orgId, city_id: city.id, name: name.trim(),
                    lei_referencia: leiReferencia || undefined, status, observacoes: observacoes || undefined,
                });
                onSaved(created);
            }
        } catch (err: any) {
            setError(err.message || 'Erro ao salvar mapa regulatório.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <form onSubmit={handleSubmit} className="bg-white rounded-[10px] w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
                <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-[10px]">
                    <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                        <Map className="w-5 h-5 text-blue-600" /> {editing ? 'Editar mapa regulatório' : 'Novo mapa regulatório'}
                    </h2>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-[6px] hover:bg-gray-100 transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {error && (
                        <div className="bg-rose-50 border border-rose-100 text-rose-700 rounded-[10px] p-3 text-sm font-medium flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
                        </div>
                    )}

                    {needsOrgPicker && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Organização</label>
                            <select
                                value={orgId}
                                onChange={e => setOrgId(e.target.value)}
                                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            >
                                <option value="">Selecione...</option>
                                {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Cidade</label>
                        <CitySearchSelect value={city} onChange={setCity} />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Nome do mapa</label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Ex.: Mapa Regulatório - Cambuí/MG"
                            className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Lei de referência</label>
                            <input
                                value={leiReferencia}
                                onChange={e => setLeiReferencia(e.target.value)}
                                placeholder="Lei nº..."
                                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
                            <select
                                value={status}
                                onChange={e => setStatus(e.target.value as RegulatoryMapStatus)}
                                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            >
                                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Observações</label>
                        <textarea
                            value={observacoes}
                            onChange={e => setObservacoes(e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none"
                        />
                    </div>
                </div>

                <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex justify-end gap-2 rounded-b-[10px]">
                    <button type="button" onClick={onClose} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">
                        Cancelar
                    </button>
                    <button type="submit" disabled={saving} className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-60">
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
                    </button>
                </div>
            </form>
        </div>
    );
};

export default RegulatoryMapForm;
