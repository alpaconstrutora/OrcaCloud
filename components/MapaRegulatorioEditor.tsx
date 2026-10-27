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
import { useToast } from '../hooks/useToast';
import { AlertCircle, FolderInput } from 'lucide-react';
import RegulatoryZoneTable, { ZoneField } from './RegulatoryZoneTable';
import ImportRegulatoryZonesModal from './regulatoryMap/ImportRegulatoryZonesModal';

interface Props {
    empreendimentoId: string;
    organizationId: string;
    /**
     * Motivo do modo só leitura. Usado pela Viabilidade (EstudoMapaRegulatorio):
     * sem canEditImovib o mapa aparece mas não edita (decisão de 2026-10-12).
     * Ausente: editável, como no módulo Empreendimentos.
     */
    somenteLeitura?: string;
}

export const MapaRegulatorioEditor: React.FC<Props> = ({ empreendimentoId, organizationId, somenteLeitura }) => {
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

    // Zona que vale para o terreno (26/10/2026, plano docs/planos/2026-10-26-zona-aplicavel-do-empreendimento.md).
    // Marca na hora (§22) e desfaz se o banco recusar.
    const { localToast, showToast } = useToast();
    const zonaAplicavelId = zones.find(z => z.aplicavel)?.id ?? null;
    const handleMarcarAplicavel = async (zonaId: string | null) => {
        const antes = zonaAplicavelId;
        const marcar = (id: string | null) => setZones(prev => prev.map(z => ({ ...z, aplicavel: z.id === id })));
        marcar(zonaId);
        try {
            await empreendimentoService.marcarZonaAplicavel(empreendimentoId, zonaId, organizationId);
        } catch (e) {
            marcar(antes);
            showToast(e instanceof Error ? e.message : 'Não foi possível marcar a zona aplicável.', 'error');
        }
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
                somenteLeitura={somenteLeitura}
                aplicavel={{ zonaId: zonaAplicavelId, onMarcar: handleMarcarAplicavel }}
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
                    existingZoneIds={zones.map(z => z.id)}
                />
            )}
            {/* Só desenha fora do ToastProvider (teste, render isolado): com o provider
                montado em index.tsx o `localToast` vem null e quem mostra é ele. */}
            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {localToast.message}
                </div>
            )}
        </>
    );
};

export default MapaRegulatorioEditor;
