import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Loader2, X, CheckCircle2, AlertCircle, Layers } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/modal';

// Espelho de components/BoletoLoteModal.tsx (Financeiro > Captura de Boletos):
// drop zone → fila que processa sozinha → painel único de aplicação em lote →
// footer Cancelar/Concluir. Lá o painel é "Campos comuns" (aplica os mesmos
// dados a todos os boletos); aqui é "Aplicar a estas unidades" (aplica a mesma
// foto a todas as unidades marcadas — unidades iguais compartilham a foto).

type ItemStatus = 'aguardando' | 'processando' | 'ok' | 'erro';

interface LoteItem {
    id: string;
    file: File;
    previewUrl: string;
    status: ItemStatus;
    url?: string;
    error?: string;
}

export interface LoteUnit {
    propertyId: string;
    name: string;
    typology: string | null;
}

interface Props {
    organizationId: string;
    buildingId: string;
    units: LoteUnit[];
    uploadBatchPhoto: (organizationId: string, buildingId: string, file: File) => Promise<string>;
    applyPhotoToUnits: (propertyIds: string[], imageUrl: string) => Promise<number>;
    onClose: () => void;
    onConcluir: () => void;
}

const SEM_TIPO = 'Sem tipo definido';

const UnitPhotoLoteModal: React.FC<Props> = ({
    organizationId,
    buildingId,
    units,
    uploadBatchPhoto,
    applyPhotoToUnits,
    onClose,
    onConcluir,
}) => {
    const [items, setItems] = useState<LoteItem[]>([]);
    const [dragging, setDragging] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
    const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
    const [applying, setApplying] = useState(false);
    const [appliedMsg, setAppliedMsg] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const processingRef = useRef(false);
    // Revoga no unmount sem depender de closure desatualizada.
    const previewUrlsRef = useRef<Set<string>>(new Set());

    useEffect(() => () => { previewUrlsRef.current.forEach(u => URL.revokeObjectURL(u)); }, []);

    // Unidades agrupadas por tipo — é o que permite aplicar a foto a "todas as
    // unidades iguais" com um clique. Sem typology no banco, cai num grupo único.
    const groups = React.useMemo(() => {
        const m = new Map<string, LoteUnit[]>();
        units.forEach(u => {
            const key = u.typology?.trim() || SEM_TIPO;
            if (!m.has(key)) m.set(key, []);
            m.get(key)!.push(u);
        });
        return Array.from(m.entries())
            .map(([typology, list]) => ({ typology, units: list }))
            .sort((a, b) => a.typology.localeCompare(b.typology, 'pt-BR'));
    }, [units]);

    function addFiles(files: FileList | File[]) {
        const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (!arr.length) return;
        setAppliedMsg(null);
        setItems(prev => {
            const existing = new Set(prev.map(i => i.file.name + i.file.size));
            const news = arr
                .filter(f => !existing.has(f.name + f.size))
                .map<LoteItem>(f => {
                    const previewUrl = URL.createObjectURL(f);
                    previewUrlsRef.current.add(previewUrl);
                    return { id: `${Date.now()}_${Math.random()}`, file: f, previewUrl, status: 'aguardando' };
                });
            return [...prev, ...news];
        });
    }

    // Fila sequencial — 1 upload por vez (mesmo padrão do BoletoLoteModal).
    useEffect(() => {
        if (processingRef.current) return;
        const next = items.find(i => i.status === 'aguardando');
        if (!next) return;

        processingRef.current = true;
        setProcessing(true);
        (async () => {
            setItems(prev => prev.map(i => i.id === next.id ? { ...i, status: 'processando' } : i));
            try {
                const url = await uploadBatchPhoto(organizationId, buildingId, next.file);
                setItems(prev => prev.map(i => i.id === next.id ? { ...i, status: 'ok', url } : i));
                setSelectedPhotoId(prev => prev ?? next.id);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                setItems(prev => prev.map(i => i.id === next.id ? { ...i, status: 'erro', error: msg } : i));
            } finally {
                processingRef.current = false;
                setProcessing(false);
            }
        })();
    }, [items, organizationId, buildingId, uploadBatchPhoto]);

    const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(true); }, []);
    const handleDragLeave = useCallback(() => setDragging(false), []);
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
    }, []);

    const removeItem = (id: string) => {
        setItems(prev => {
            const item = prev.find(i => i.id === id);
            if (item) {
                URL.revokeObjectURL(item.previewUrl);
                previewUrlsRef.current.delete(item.previewUrl);
            }
            return prev.filter(i => i.id !== id);
        });
        setSelectedPhotoId(prev => prev === id ? null : prev);
    };

    const toggleUnit = (propertyId: string) => {
        setAppliedMsg(null);
        setSelectedUnitIds(prev => {
            const next = new Set(prev);
            if (next.has(propertyId)) next.delete(propertyId); else next.add(propertyId);
            return next;
        });
    };

    const toggleGroup = (groupUnits: LoteUnit[]) => {
        setAppliedMsg(null);
        const allSelected = groupUnits.every(u => selectedUnitIds.has(u.propertyId));
        setSelectedUnitIds(prev => {
            const next = new Set(prev);
            groupUnits.forEach(u => { if (allSelected) next.delete(u.propertyId); else next.add(u.propertyId); });
            return next;
        });
    };

    const fotosOk = items.filter(i => i.status === 'ok');
    const selectedPhoto = fotosOk.find(i => i.id === selectedPhotoId) ?? null;

    async function aplicarAsUnidades() {
        if (!selectedPhoto?.url || selectedUnitIds.size === 0) return;
        setApplying(true);
        setAppliedMsg(null);
        try {
            const count = await applyPhotoToUnits(Array.from(selectedUnitIds), selectedPhoto.url);
            setAppliedMsg(`Foto aplicada a ${count} unidade${count !== 1 ? 's' : ''}.`);
            setSelectedUnitIds(new Set());
        } catch (err: unknown) {
            setAppliedMsg(err instanceof Error ? err.message : String(err));
        } finally {
            setApplying(false);
        }
    }

    const total = items.length;
    const okCount = fotosOk.length;
    const errCount = items.filter(i => i.status === 'erro').length;
    const pendCount = items.filter(i => i.status === 'aguardando' || i.status === 'processando').length;
    const done = pendCount === 0 && total > 0;

    return (
        <Modal open dismissable={!processing} onClose={onClose} size="2xl" zIndex={80}>
            <ModalHeader
                title="Upload de Imagens em Lote"
                description="Envie várias fotos de uma vez e aplique a mesma imagem a todas as unidades do mesmo tipo."
                icon={<div className="p-2 bg-blue-50 rounded-xl"><Upload className="w-5 h-5 text-blue-600" /></div>}
                onClose={processing ? undefined : onClose}
            />

            <ModalBody className="space-y-5">
                {/* Drop zone */}
                <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                        dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                    }`}
                >
                    <Upload className={`w-8 h-8 mx-auto mb-3 transition-colors ${dragging ? 'text-blue-500' : 'text-gray-300'}`} />
                    <p className="text-sm font-bold text-gray-700">
                        {dragging ? 'Solte as imagens aqui' : 'Arraste imagens aqui ou clique para selecionar'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Apenas imagens. Pode selecionar várias de uma vez.</p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
                    />
                </div>

                {/* Resumo */}
                {total > 0 && (
                    <div className="flex items-center gap-3 text-xs font-bold flex-wrap">
                        <span className="text-gray-500">{total} imagem{total !== 1 ? 'ns' : ''}</span>
                        {okCount > 0 && <span className="text-emerald-600">{okCount} enviada{okCount !== 1 ? 's' : ''}</span>}
                        {errCount > 0 && <span className="text-red-600">{errCount} com erro</span>}
                        {pendCount > 0 && <span className="text-blue-600">{pendCount} na fila</span>}
                    </div>
                )}

                {/* Lista de itens */}
                {items.length > 0 && (
                    <div className="border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-50">
                        {items.map(item => (
                            <div key={item.id} className="flex items-center gap-3 px-4 py-3 bg-white">
                                <img src={item.previewUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-100 shrink-0" />
                                <div className="shrink-0">
                                    {item.status === 'processando' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                                    {item.status === 'ok' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                    {item.status === 'erro' && <AlertCircle className="w-4 h-4 text-red-500" />}
                                    {item.status === 'aguardando' && <div className="w-4 h-4 rounded-full border-2 border-gray-200" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-gray-800 truncate" title={item.file.name}>{item.file.name}</p>
                                    {item.status === 'ok' && <p className="text-xs text-gray-400 mt-0.5">Enviada — pronta para aplicar</p>}
                                    {item.status === 'erro' && <p className="text-xs text-red-500 mt-0.5 truncate">{item.error}</p>}
                                    {item.status === 'processando' && <p className="text-xs text-blue-500 mt-0.5">Enviando…</p>}
                                    {item.status === 'aguardando' && <p className="text-xs text-gray-400 mt-0.5">Aguardando na fila…</p>}
                                </div>
                                {item.status !== 'processando' && (
                                    <button
                                        onClick={() => removeItem(item.id)}
                                        className="p-1 hover:bg-gray-100 rounded-lg transition-all shrink-0"
                                        title="Remover"
                                    >
                                        <X className="w-3.5 h-3.5 text-gray-400" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Aplicação em lote — equivalente ao painel "Campos comuns" do BoletoLoteModal */}
                {okCount > 0 && (
                    <div className="border border-gray-100 rounded-2xl p-4 space-y-3 bg-gray-50">
                        <p className="text-xs font-black text-gray-700 uppercase tracking-widest">Aplicar a unidades iguais</p>
                        <p className="text-xs text-gray-500">
                            Escolha a foto, marque as unidades (ou o tipo inteiro) e aplique a todas de uma vez.
                        </p>

                        {/* Escolha da foto */}
                        <div className="flex gap-2 flex-wrap">
                            {fotosOk.map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => { setSelectedPhotoId(f.id); setAppliedMsg(null); }}
                                    className={`w-14 h-14 rounded-xl overflow-hidden border-2 transition-all ${
                                        selectedPhotoId === f.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-blue-300'
                                    }`}
                                    title={f.file.name}
                                >
                                    <img src={f.previewUrl} alt="" className="w-full h-full object-cover" />
                                </button>
                            ))}
                        </div>

                        {/* Unidades agrupadas por tipo */}
                        <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-xl bg-white divide-y divide-gray-50">
                            {groups.map(g => {
                                const allSelected = g.units.every(u => selectedUnitIds.has(u.propertyId));
                                return (
                                    <div key={g.typology} className="p-3">
                                        <button
                                            onClick={() => toggleGroup(g.units)}
                                            className="flex items-center gap-2 text-xs font-bold text-gray-700 hover:text-blue-600 transition-all"
                                        >
                                            <Layers className="w-3.5 h-3.5 text-gray-400" />
                                            {g.typology} ({g.units.length})
                                            <span className="text-blue-600 font-medium">
                                                {allSelected ? 'desmarcar todas' : 'selecionar todas'}
                                            </span>
                                        </button>
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {g.units.map(u => (
                                                <button
                                                    key={u.propertyId}
                                                    onClick={() => toggleUnit(u.propertyId)}
                                                    className={`px-2.5 py-1 rounded-lg border text-xs font-normal transition-all ${
                                                        selectedUnitIds.has(u.propertyId)
                                                            ? 'border-blue-400 bg-blue-50 text-blue-700'
                                                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                                                    }`}
                                                >
                                                    {u.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex items-center gap-3 pt-1 flex-wrap">
                            <button
                                onClick={aplicarAsUnidades}
                                disabled={applying || !selectedPhoto || selectedUnitIds.size === 0}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-button uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                {applying && <Loader2 className="w-3 h-3 animate-spin" />}
                                Aplicar a {selectedUnitIds.size} unidade{selectedUnitIds.size !== 1 ? 's' : ''}
                            </button>
                            {appliedMsg && (
                                <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> {appliedMsg}
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </ModalBody>

            <ModalFooter>
                <button
                    onClick={onClose}
                    disabled={processing}
                    className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-all disabled:opacity-50"
                >
                    Cancelar
                </button>
                <button
                    onClick={() => { onConcluir(); onClose(); }}
                    disabled={processing || (total > 0 && !done)}
                    className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-900/20"
                >
                    {processing && <Loader2 className="w-4 h-4 animate-spin" />}
                    {total === 0 || done ? 'Concluir' : `Processando… (${pendCount} restante${pendCount !== 1 ? 's' : ''})`}
                </button>
            </ModalFooter>
        </Modal>
    );
};

export default UnitPhotoLoteModal;
