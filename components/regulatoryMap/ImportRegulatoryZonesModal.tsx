// components/regulatoryMap/ImportRegulatoryZonesModal.tsx
//
// Modal aberto de dentro do Mapa Regulatório do Empreendimento ("Importar de mapa cadastrado").
// Fluxo: escolhe a cidade → escolhe o mapa cadastrado daquela cidade → marca as zonas
// aplicáveis → copia para empreendimento_regulatory_zones. É cópia (como o "pin" do SINAPI):
// depois de importado, editar no empreendimento não altera o cadastro da cidade.
import React from 'react';
import { X, Loader2, FolderInput, AlertCircle, MapPin } from 'lucide-react';
import { regulatoryMapService } from '../../services/regulatoryMapService';
import { RegulatoryMapWithCity, RegulatoryMapZone } from '../../types';
import CitySearchSelect, { CitySearchValue } from './CitySearchSelect';

interface Props {
    organizationId: string;
    empreendimentoId: string;
    existingCount: number;
    onClose: () => void;
    onImported: () => void;
}

export const ImportRegulatoryZonesModal: React.FC<Props> = ({ organizationId, empreendimentoId, existingCount, onClose, onImported }) => {
    const [city, setCity] = React.useState<CitySearchValue | null>(null);
    const [maps, setMaps] = React.useState<RegulatoryMapWithCity[]>([]);
    const [loadingMaps, setLoadingMaps] = React.useState(false);
    const [selectedMap, setSelectedMap] = React.useState<RegulatoryMapWithCity | null>(null);
    const [zones, setZones] = React.useState<RegulatoryMapZone[]>([]);
    const [loadingZones, setLoadingZones] = React.useState(false);
    const [checkedIds, setCheckedIds] = React.useState<Set<string>>(new Set());
    const [importing, setImporting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        setSelectedMap(null);
        setZones([]);
        setCheckedIds(new Set());
        if (!city) { setMaps([]); return; }
        setLoadingMaps(true);
        regulatoryMapService.list(organizationId, city.id)
            .then(setMaps)
            .catch(err => setError(err.message))
            .finally(() => setLoadingMaps(false));
    }, [city, organizationId]);

    React.useEffect(() => {
        if (!selectedMap) { setZones([]); return; }
        setLoadingZones(true);
        regulatoryMapService.listZones(selectedMap.id)
            .then(z => { setZones(z); setCheckedIds(new Set(z.map(zone => zone.id))); })
            .catch(err => setError(err.message))
            .finally(() => setLoadingZones(false));
    }, [selectedMap]);

    const toggleZone = (id: string) => {
        setCheckedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleImport = async () => {
        const chosen = zones.filter(z => checkedIds.has(z.id));
        if (chosen.length === 0) return;
        setImporting(true);
        setError(null);
        try {
            await regulatoryMapService.importZonesToEmpreendimento({
                zones: chosen, empreendimentoId, organizationId, sortOrderOffset: existingCount,
            });
            onImported();
        } catch (err: any) {
            setError(err.message || 'Erro ao importar zonas.');
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[10px] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
                <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-[10px]">
                    <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                        <FolderInput className="w-5 h-5 text-blue-600" /> Importar de mapa cadastrado
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

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Cidade</label>
                        <CitySearchSelect value={city} onChange={setCity} />
                    </div>

                    {city && (
                        loadingMaps ? (
                            <div className="flex items-center justify-center py-6">
                                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                            </div>
                        ) : maps.length === 0 ? (
                            <p className="text-sm text-gray-500 py-2">
                                Nenhum mapa regulatório cadastrado para {city.name}. Cadastre em Incorporação → Mapa Regulatório.
                            </p>
                        ) : (
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">Mapa regulatório</label>
                                <select
                                    value={selectedMap?.id ?? ''}
                                    onChange={e => setSelectedMap(maps.find(m => m.id === e.target.value) || null)}
                                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                >
                                    <option value="">Selecione...</option>
                                    {maps.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                            </div>
                        )
                    )}

                    {selectedMap && (
                        loadingZones ? (
                            <div className="flex items-center justify-center py-6">
                                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                            </div>
                        ) : zones.length === 0 ? (
                            <p className="text-sm text-gray-500 py-2">Este mapa ainda não tem zonas cadastradas.</p>
                        ) : (
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-2">
                                    Zonas a importar ({checkedIds.size}/{zones.length})
                                </label>
                                <div className="border border-gray-200 rounded-[6px] divide-y divide-gray-100 max-h-64 overflow-y-auto">
                                    {zones.map(z => (
                                        <label key={z.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={checkedIds.has(z.id)}
                                                onChange={() => toggleZone(z.id)}
                                                className="rounded border-gray-300"
                                            />
                                            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                            <div className="min-w-0 text-sm">
                                                <span className="font-medium text-gray-800">{z.zona || 'Sem zona'}</span>
                                                {z.macroarea && <span className="text-gray-400"> · {z.macroarea}</span>}
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )
                    )}
                </div>

                <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex justify-end gap-2 rounded-b-[10px]">
                    <button type="button" onClick={onClose} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleImport}
                        disabled={importing || checkedIds.size === 0}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-60"
                    >
                        {importing && <Loader2 className="w-4 h-4 animate-spin" />} Importar selecionadas
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ImportRegulatoryZonesModal;
