// components/regulatoryMap/RegulatoryMapDetail.tsx
//
// Edição das zonas de um mapa regulatório cadastrado (cidade). Mesma tabela usada no
// Empreendimento (RegulatoryZoneTable), só que as linhas moram em regulatory_map_zones em vez
// de empreendimento_regulatory_zones.
import React from 'react';
import { ArrowLeft, Edit } from 'lucide-react';
import { regulatoryMapService } from '../../services/regulatoryMapService';
import { RegulatoryMapWithCity, RegulatoryMapZone, RegulatoryMapZoneUpdate } from '../../types';
import RegulatoryZoneTable, { ZoneField } from '../RegulatoryZoneTable';

interface Props {
    map: RegulatoryMapWithCity;
    onBack: () => void;
    onEdit: () => void;
}

export const RegulatoryMapDetail: React.FC<Props> = ({ map, onBack, onEdit }) => {
    const [zones, setZones] = React.useState<RegulatoryMapZone[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [savingId, setSavingId] = React.useState<string | null>(null);
    const [adding, setAdding] = React.useState(false);

    React.useEffect(() => {
        setLoading(true);
        regulatoryMapService.listZones(map.id).then(setZones).catch(console.error).finally(() => setLoading(false));
    }, [map.id]);

    const handleAdd = async () => {
        try {
            setAdding(true);
            const created = await regulatoryMapService.createZone({
                regulatory_map_id: map.id, organization_id: map.organization_id, sort_order: zones.length,
            });
            setZones(prev => [...prev, created]);
        } catch (e) { console.error(e); } finally { setAdding(false); }
    };

    const handleUpdate = async (id: string, field: ZoneField, value: string) => {
        setZones(prev => prev.map(z => z.id === id ? { ...z, [field]: value } : z));
        setSavingId(id);
        try {
            await regulatoryMapService.updateZone(id, { [field]: value } as RegulatoryMapZoneUpdate);
        } catch (e) { console.error(e); } finally { setSavingId(null); }
    };

    const handleDelete = async (id: string) => {
        setZones(prev => prev.filter(z => z.id !== id));
        try { await regulatoryMapService.deleteZone(id); } catch (e) { console.error(e); }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm">
                <button
                    type="button"
                    onClick={onBack}
                    className="flex items-center gap-1.5 h-8 px-2.5 -ml-2.5 rounded-[6px] text-sm font-medium text-gray-500 hover:bg-gray-100 transition-all mb-3"
                >
                    <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">{map.name}</h1>
                        <p className="text-xs text-gray-400 font-medium mt-0.5">
                            {map.city_name}{map.state_code ? ` - ${map.state_code}` : ''}
                            {map.lei_referencia ? ` · ${map.lei_referencia}` : ''}
                        </p>
                    </div>
                    <button
                        onClick={onEdit}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                    >
                        <Edit className="w-[15px] h-[15px]" /> Editar
                    </button>
                </div>
            </div>

            <RegulatoryZoneTable
                title="Zonas"
                subtitle="Parâmetros urbanísticos por zona desta cidade. O empreendimento importa (copia) as zonas aplicáveis a partir daqui."
                zones={zones}
                loading={loading}
                adding={adding}
                savingId={savingId}
                onAdd={handleAdd}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
            />
        </div>
    );
};

export default RegulatoryMapDetail;
