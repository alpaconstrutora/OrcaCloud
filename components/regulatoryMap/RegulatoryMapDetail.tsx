// components/regulatoryMap/RegulatoryMapDetail.tsx
//
// Edição das zonas de um mapa regulatório cadastrado (cidade). Mesma tabela usada no
// Empreendimento (RegulatoryZoneTable), só que as linhas moram em regulatory_map_zones em vez
// de empreendimento_regulatory_zones.
import React from 'react';
import { ArrowLeft, Edit, FileSpreadsheet, Map, Ruler, FileWarning, ShieldCheck, AlertCircle } from 'lucide-react';
import { regulatoryMapService } from '../../services/regulatoryMapService';
import { RegulatoryMapWithCity, RegulatoryMapZone, RegulatoryMapZoneUpdate } from '../../types';
import { KpiCard } from '../ui/KpiCard';
import RegulatoryZoneTable, { ZoneField } from '../RegulatoryZoneTable';
import RegulatoryMapExcelImportModal from './RegulatoryMapExcelImportModal';

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
    const [importOpen, setImportOpen] = React.useState(false);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const loadZones = React.useCallback(() => {
        setLoading(true);
        return regulatoryMapService.listZones(map.id).then(setZones).catch((e) => {
            console.error(e);
            notify('Erro ao carregar zonas do mapa.', 'error');
        }).finally(() => setLoading(false));
    }, [map.id]);

    React.useEffect(() => { loadZones(); }, [loadZones]);

    const handleAdd = async () => {
        try {
            setAdding(true);
            const created = await regulatoryMapService.createZone({
                regulatory_map_id: map.id, organization_id: map.organization_id, sort_order: zones.length,
            });
            setZones(prev => [...prev, created]);
        } catch (e) {
            console.error(e);
            notify('Erro ao criar zona.', 'error');
        } finally { setAdding(false); }
    };

    const handleUpdate = async (id: string, field: ZoneField, value: string) => {
        setZones(prev => prev.map(z => z.id === id ? { ...z, [field]: value } : z));
        setSavingId(id);
        try {
            await regulatoryMapService.updateZone(id, { [field]: value } as RegulatoryMapZoneUpdate);
        } catch (e) {
            console.error(e);
            notify('Erro ao salvar a alteração.', 'error');
        } finally { setSavingId(null); }
    };

    const handleDelete = async (id: string) => {
        setZones(prev => prev.filter(z => z.id !== id));
        try {
            await regulatoryMapService.deleteZone(id);
        } catch (e) {
            console.error(e);
            notify('Erro ao excluir a zona.', 'error');
        }
    };

    // KPIs derivados das zonas cadastradas — §4 do guia.
    const maiorCaMaximo = React.useMemo(() => {
        const valores = zones
            .map(z => parseFloat((z.ca_maximo || '').replace(',', '.')))
            .filter(n => Number.isFinite(n));
        if (valores.length === 0) return '—';
        return Math.max(...valores).toString().replace('.', ',');
    }, [zones]);
    const semLeiReferencia = zones.filter(z => !z.lei_referencia).length;
    const validadasPrefeitura = zones.filter(z => z.nivel_confianca === 'Validado na prefeitura').length;

    return (
        <div className="space-y-6">
            <div>
                <button
                    type="button"
                    onClick={onBack}
                    className="flex items-center gap-1.5 h-8 px-2.5 -ml-2.5 rounded-[6px] text-sm font-medium text-gray-500 hover:bg-gray-100 transition-all mb-3"
                >
                    <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">{map.name}</h1>
                        <p className="text-gray-400 text-sm mt-1.5 font-medium">
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard label="Zonas cadastradas" value={zones.length} icon={<Map className="w-5 h-5" />} color="blue" />
                <KpiCard label="C.A. máximo mais alto" value={maiorCaMaximo} sub="Entre as zonas cadastradas" icon={<Ruler className="w-5 h-5" />} color="indigo" />
                <KpiCard label="Sem lei de referência" value={semLeiReferencia} sub="Zonas com o campo em branco" icon={<FileWarning className="w-5 h-5" />} color="amber" />
                <KpiCard label="Validadas na prefeitura" value={validadasPrefeitura} icon={<ShieldCheck className="w-5 h-5" />} color="emerald" />
            </div>

            <RegulatoryZoneTable
                tableId="planoDiretorZonas"
                title="Zonas"
                subtitle="Parâmetros urbanísticos por zona desta cidade. O empreendimento importa (copia) as zonas aplicáveis a partir daqui."
                zones={zones}
                loading={loading}
                adding={adding}
                savingId={savingId}
                onAdd={handleAdd}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                emptyLabel='Clique em "Nova Zona" ou importe uma planilha da prefeitura'
                headerActions={
                    <button onClick={() => setImportOpen(true)}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-[6px] font-medium text-[13px] transition-all">
                        <FileSpreadsheet className="w-[15px] h-[15px]" /> Importar planilha Excel
                    </button>
                }
            />

            {importOpen && (
                <RegulatoryMapExcelImportModal
                    regulatoryMapId={map.id}
                    organizationId={map.organization_id}
                    onClose={() => setImportOpen(false)}
                    onImported={async () => {
                        setImportOpen(false);
                        await loadZones();
                        notify('Planilha importada com sucesso.');
                    }}
                />
            )}

            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default RegulatoryMapDetail;
