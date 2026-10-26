// components/regulatoryMap/ImportRegulatoryZonesModal.tsx
//
// Modal aberto de dentro do Mapa Regulatório do Empreendimento ("Importar de mapa cadastrado").
// Fluxo: escolhe a cidade → escolhe o mapa cadastrado daquela cidade → marca as zonas
// aplicáveis → copia para empreendimento_regulatory_zones. É cópia (como o "pin" do SINAPI):
// depois de importado, editar no empreendimento não altera o cadastro da cidade.
//
// Os mapas da cidade vêm de todas as organizações do usuário, não só da do empreendimento
// (26/10/2026): a lei de Cambuí-MG está na Alpa e o Garden Cambuhy na SPE dele — ver
// `regulatoryMapService.listByCity`. A cópia continua gravada em `organizationId`.
//
// Importar só o que vale (26/10/2026, plano docs/planos/2026-10-26-zona-aplicavel-do-empreendimento.md):
// as zonas vinham TODAS marcadas e o Garden recebeu as 175 da cidade. Agora vêm desmarcadas,
// com busca, "Marcar todas" sobre o que está na tela, C.A./T.O. em cada zona (o mapa de Cambuí
// repete macroárea × zona com números diferentes) e a opção de SUBSTITUIR as atuais.
import React from 'react';
import { X, Loader2, FolderInput, AlertCircle, MapPin, Search } from 'lucide-react';
import { regulatoryMapService } from '../../services/regulatoryMapService';
import { empreendimentoService } from '../../services/empreendimentoService';
import { RegulatoryMapWithCity, RegulatoryMapZone } from '../../types';
import { useStore } from '../../store/useStore';
import { useConfirm } from '../ui/confirm';
import { normalizarTexto } from '../ui/FilterUtils';
import { rotuloMapaRegulatorio } from '../../utils/rotuloMapaRegulatorio';
import CitySearchSelect, { CitySearchValue } from './CitySearchSelect';

interface Props {
    organizationId: string;
    empreendimentoId: string;
    /** Zonas que o empreendimento já tem — "Substituir" apaga estas depois de importar. */
    existingZoneIds: string[];
    onClose: () => void;
    onImported: () => void;
}

/** "C.A. 0,25 / 3 / 3 · T.O. 0,9 · Gabarito 18 m" — o que distingue duas linhas de mesma zona. */
function parametrosDaZona(z: RegulatoryMapZone): string {
    const partes: string[] = [];
    if (z.ca_minimo || z.ca_basico || z.ca_maximo) {
        partes.push(`C.A. ${z.ca_minimo || '—'} / ${z.ca_basico || '—'} / ${z.ca_maximo || '—'}`);
    }
    if (z.taxa_ocupacao_maxima) partes.push(`T.O. ${z.taxa_ocupacao_maxima}`);
    if (z.gabarito_altura_maxima) partes.push(`Gabarito ${z.gabarito_altura_maxima} m`);
    return partes.join(' · ');
}

const MOTIVO_SEM_ZONA = 'Marque ao menos uma zona para importar';

export const ImportRegulatoryZonesModal: React.FC<Props> = ({ organizationId, empreendimentoId, existingZoneIds, onClose, onImported }) => {
    const [city, setCity] = React.useState<CitySearchValue | null>(null);
    const [maps, setMaps] = React.useState<RegulatoryMapWithCity[]>([]);
    const [loadingMaps, setLoadingMaps] = React.useState(false);
    const [selectedMap, setSelectedMap] = React.useState<RegulatoryMapWithCity | null>(null);
    const [zones, setZones] = React.useState<RegulatoryMapZone[]>([]);
    const [loadingZones, setLoadingZones] = React.useState(false);
    const [checkedIds, setCheckedIds] = React.useState<Set<string>>(new Set());
    // Busca dentro de um seletor que fecha ao importar: transitória de propósito (guia §3.1).
    const [buscaZona, setBuscaZona] = React.useState('');
    const [substituir, setSubstituir] = React.useState(false);
    const [importing, setImporting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const organizations = useStore(state => state.organizations);
    const confirm = useConfirm();
    const atuais = existingZoneIds.length;

    React.useEffect(() => {
        setSelectedMap(null);
        setZones([]);
        setCheckedIds(new Set());
        if (!city) { setMaps([]); return; }
        setLoadingMaps(true);
        regulatoryMapService.listByCity(city.id)
            .then(setMaps)
            .catch(err => setError(err.message))
            .finally(() => setLoadingMaps(false));
    }, [city]);

    React.useEffect(() => {
        setCheckedIds(new Set());
        setBuscaZona('');
        if (!selectedMap) { setZones([]); return; }
        setLoadingZones(true);
        regulatoryMapService.listZones(selectedMap.id)
            .then(setZones)
            .catch(err => setError(err.message))
            .finally(() => setLoadingZones(false));
    }, [selectedMap]);

    const zonasNaTela = React.useMemo(() => {
        const q = normalizarTexto(buscaZona.trim());
        if (!q) return zones;
        return zones.filter(z => normalizarTexto(`${z.zona ?? ''} ${z.macroarea ?? ''} ${z.uso_permitido ?? ''}`).includes(q));
    }, [zones, buscaZona]);
    const todasNaTelaMarcadas = zonasNaTela.length > 0 && zonasNaTela.every(z => checkedIds.has(z.id));

    const toggleZone = (id: string) => {
        setCheckedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const alternarTodasNaTela = () => {
        setCheckedIds(prev => {
            const next = new Set(prev);
            for (const z of zonasNaTela) {
                if (todasNaTelaMarcadas) next.delete(z.id); else next.add(z.id);
            }
            return next;
        });
    };

    const handleImport = async () => {
        const chosen = zones.filter(z => checkedIds.has(z.id));
        if (chosen.length === 0) return;
        const vaiSubstituir = substituir && atuais > 0;
        if (vaiSubstituir) {
            const ok = await confirm({
                title: atuais === 1 ? 'Substituir a zona atual?' : `Substituir as ${atuais} zonas atuais?`,
                message: `${atuais === 1 ? 'A zona atual do empreendimento será excluída' : `As ${atuais} zonas atuais do empreendimento serão excluídas`} depois que ${chosen.length === 1 ? 'a nova for importada' : `as ${chosen.length} novas forem importadas`}. Plantas que aplicaram uma delas guardam os números, mas perdem o vínculo com a zona.`,
                variant: 'danger',
                confirmLabel: 'Substituir',
            });
            if (!ok) return;
        }
        setImporting(true);
        setError(null);
        try {
            // Importa primeiro e só depois apaga: se a importação falhar no meio, as antigas ficam.
            await regulatoryMapService.importZonesToEmpreendimento({
                zones: chosen, empreendimentoId, organizationId, sortOrderOffset: vaiSubstituir ? 0 : atuais,
            });
            if (vaiSubstituir) {
                await empreendimentoService.deleteRegulatoryZones(existingZoneIds, { empreendimentoId, organizationId });
            }
            onImported();
        } catch (err: any) {
            setError(err.message || 'Erro ao importar zonas.');
        } finally {
            setImporting(false);
        }
    };

    const marcadas = checkedIds.size;

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
                                Nenhum mapa regulatório cadastrado para {city.name} nas suas organizações. Cadastre em Incorporação → Planta Inteligente, aba Mapa Regulatório.
                            </p>
                        ) : (
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">Mapa regulatório</label>
                                <select
                                    value={selectedMap?.id ?? ''}
                                    onChange={e => setSelectedMap(maps.find(m => m.id === e.target.value) || null)}
                                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                >
                                    <option value="">Selecione...</option>
                                    {maps.map(m => <option key={m.id} value={m.id}>{rotuloMapaRegulatorio(m, maps, organizations)}</option>)}
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
                            <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="block text-xs font-semibold text-gray-500">
                                        Zonas a importar ({marcadas} de {zones.length})
                                    </label>
                                    <button
                                        type="button"
                                        onClick={alternarTodasNaTela}
                                        disabled={zonasNaTela.length === 0}
                                        title={zonasNaTela.length === 0 ? 'Nenhuma zona na busca' : undefined}
                                        className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {todasNaTelaMarcadas ? 'Desmarcar todas' : 'Marcar todas'}{buscaZona.trim() ? ' da busca' : ''}
                                    </button>
                                </div>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        value={buscaZona}
                                        onChange={e => setBuscaZona(e.target.value)}
                                        placeholder="Buscar zona, macroárea ou uso..."
                                        className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                    />
                                </div>
                                <div className="border border-gray-200 rounded-[6px] divide-y divide-gray-100 max-h-64 overflow-y-auto">
                                    {zonasNaTela.length === 0 ? (
                                        <p className="px-3 py-4 text-sm text-gray-500 text-center">Nenhuma zona com "{buscaZona}".</p>
                                    ) : zonasNaTela.map(z => {
                                        const parametros = parametrosDaZona(z);
                                        return (
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
                                                    {z.macroarea && <span className="text-gray-500"> · {z.macroarea}</span>}
                                                    {parametros && <span className="block text-xs text-gray-500">{parametros}</span>}
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                                {atuais > 0 && (
                                    <label className="flex items-start gap-2 pt-1 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={substituir}
                                            onChange={e => setSubstituir(e.target.checked)}
                                            className="mt-0.5 rounded border-gray-300"
                                        />
                                        <span className="text-sm text-gray-800">
                                            {atuais === 1 ? 'Substituir a zona atual' : `Substituir as ${atuais} zonas atuais`}
                                            <span className="block text-xs text-gray-500">
                                                Sem marcar, as importadas entram depois das que o empreendimento já tem.
                                            </span>
                                        </span>
                                    </label>
                                )}
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
                        disabled={importing || marcadas === 0}
                        title={marcadas === 0 ? MOTIVO_SEM_ZONA : undefined}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                        {marcadas === 0 ? 'Importar' : marcadas === 1 ? 'Importar 1 zona' : `Importar ${marcadas} zonas`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ImportRegulatoryZonesModal;
