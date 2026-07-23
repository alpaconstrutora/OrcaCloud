// components/MapaRegulatorioEditor.tsx
//
// Editor do Mapa Regulatório — a tabela de zonas urbanísticas que agora MORA no empreendimento
// (empreendimento_regulatory_zones). Mesma tela nos três módulos: no Empreendimento direto, e
// na Viabilidade/Planta via o wrapper EstudoMapaRegulatorio (que resolve o empreendimento do
// estudo). Editar em qualquer lugar edita a mesma linha — fonte única.
//
// "Importar de mapa cadastrado" copia zonas do cadastro por cidade (regulatory_maps —
// components/regulatoryMap/) para cá. É cópia, não vínculo vivo: depois de importado, editar
// aqui não altera o cadastro da cidade (mesma filosofia de "pin" do SINAPI versionado).
import React from 'react';
import {
    EmpreendimentoRegulatoryZone,
    EmpreendimentoRegulatoryZoneUpdate,
} from '../types';
import { empreendimentoService } from '../services/empreendimentoService';
import { FolderInput } from 'lucide-react';
import RegulatoryZoneTable, { ZoneField } from './RegulatoryZoneTable';
import ImportRegulatoryZonesModal from './regulatoryMap/ImportRegulatoryZonesModal';

interface Props {
    empreendimentoId: string;
    organizationId: string;
}

export const MapaRegulatorioEditor: React.FC<Props> = ({ empreendimentoId, organizationId }) => {
    const [zones, setZones] = React.useState<EmpreendimentoRegulatoryZone[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [savingId, setSavingId] = React.useState<string | null>(null);
    const [adding, setAdding] = React.useState(false);
    const [importOpen, setImportOpen] = React.useState(false);

    const load = React.useCallback(() => {
        setLoading(true);
        return empreendimentoService.listRegulatoryZones(empreendimentoId)
            .then(setZones).catch(console.error).finally(() => setLoading(false));
    }, [empreendimentoId]);

    React.useEffect(() => { load(); }, [load]);

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
        setZones(prev => prev.filter(z => z.id !== id));
        try { await empreendimentoService.deleteRegulatoryZone(id); } catch (e) { console.error(e); }
    };

    return (
        <>
            <RegulatoryZoneTable
                tableId="empreendimentoZonas"
                title="Mapa Regulatório"
                subtitle="Todos os parâmetros urbanísticos por zona, no empreendimento — compartilhado com Viabilidade e Planta. Editar aqui edita em todos."
                zones={zones}
                loading={loading}
                adding={adding}
                savingId={savingId}
                onAdd={handleAdd}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                emptyLabel='Clique em "Nova Zona" ou "Importar de mapa cadastrado" para adicionar'
                headerActions={
                    <button onClick={() => setImportOpen(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-sm transition-all">
                        <FolderInput className="w-4 h-4" /> Importar de mapa cadastrado
                    </button>
                }
            />
            {importOpen && (
                <ImportRegulatoryZonesModal
                    organizationId={organizationId}
                    onClose={() => setImportOpen(false)}
                    onImported={async () => {
                        setImportOpen(false);
                        await load();
                    }}
                    empreendimentoId={empreendimentoId}
                    existingCount={zones.length}
                />
            )}
        </>
    );
};

export default MapaRegulatorioEditor;
