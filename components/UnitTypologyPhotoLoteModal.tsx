import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Loader2, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/modal';

// Mesma mecânica de components/BoletoLoteModal.tsx (Financeiro > Captura de
// Boletos): drop zone → fila de itens com status → processamento sequencial →
// footer Cancelar/Concluir. Diferença: aqui 1 arquivo não vira 1 registro —
// vira a foto de TODAS as unidades que compartilham a mesma tipologia
// (commercial_properties.typology), porque unidades iguais (mesmo tipo/planta)
// usam a mesma imagem de capa.

type ItemStatus = 'aguardando' | 'processando' | 'ok' | 'sem_tipo' | 'erro';

interface LoteItem {
    id: string;
    file: File;
    previewUrl: string;
    typology: string; // '' = ainda sem tipologia atribuída (status sem_tipo)
    status: ItemStatus;
    unitsUpdated?: number;
    error?: string;
}

interface TypologyGroup {
    typology: string;
    count: number;
}

interface Props {
    organizationId: string;
    buildingId: string;
    typologyGroups: TypologyGroup[];
    uploadTypologyPhoto: (organizationId: string, buildingId: string, typology: string, file: File) => Promise<string>;
    applyPhotoToTypology: (buildingId: string, typology: string, imageUrl: string) => Promise<number>;
    onClose: () => void;
    onConcluir: () => void;
}

// Casa o nome do arquivo (sem extensão) com o nome da tipologia — normaliza
// acento/case/símbolo para tolerar variação de digitação (mesmo critério do
// upload individual em PriceTableManager.tsx).
const normalizeMatchKey = (s: string): string =>
    s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const UnitTypologyPhotoLoteModal: React.FC<Props> = ({
    organizationId,
    buildingId,
    typologyGroups,
    uploadTypologyPhoto,
    applyPhotoToTypology,
    onClose,
    onConcluir,
}) => {
    const [items, setItems] = useState<LoteItem[]>([]);
    const [dragging, setDragging] = useState(false);
    const [processing, setProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const processingRef = useRef(false);
    // Rastreia toda URL de preview criada (não só as do render atual) para
    // revogar no unmount sem depender de closure desatualizada.
    const previewUrlsRef = useRef<Set<string>>(new Set());

    useEffect(() => () => { previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url)); }, []);

    const groupByKey = React.useMemo(() => {
        const m = new Map<string, string>();
        typologyGroups.forEach(g => m.set(normalizeMatchKey(g.typology), g.typology));
        return m;
    }, [typologyGroups]);

    function addFiles(files: FileList | File[]) {
        const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (!arr.length) return;

        setItems(prev => {
            const existing = new Set(prev.map(i => i.file.name + i.file.size));
            const news = arr
                .filter(f => !existing.has(f.name + f.size))
                .map<LoteItem>(f => {
                    const baseName = f.name.replace(/\.[^./]+$/, '');
                    const matched = groupByKey.get(normalizeMatchKey(baseName)) || '';
                    const previewUrl = URL.createObjectURL(f);
                    previewUrlsRef.current.add(previewUrl);
                    return {
                        id: `${Date.now()}_${Math.random()}`,
                        file: f,
                        previewUrl,
                        typology: matched,
                        status: matched ? 'aguardando' : 'sem_tipo',
                    };
                });
            return [...prev, ...news];
        });
    }

    // Processar fila sequencialmente — 1 por vez (mesmo padrão do BoletoLoteModal).
    useEffect(() => {
        if (processingRef.current) return;
        const next = items.find(i => i.status === 'aguardando' && i.typology);
        if (!next) return;

        processingRef.current = true;
        setProcessing(true);
        (async () => {
            setItems(prev => prev.map(i => i.id === next.id ? { ...i, status: 'processando' } : i));
            try {
                const url = await uploadTypologyPhoto(organizationId, buildingId, next.typology, next.file);
                const count = await applyPhotoToTypology(buildingId, next.typology, url);
                setItems(prev => prev.map(i => i.id === next.id ? { ...i, status: 'ok', unitsUpdated: count } : i));
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                setItems(prev => prev.map(i => i.id === next.id ? { ...i, status: 'erro', error: msg } : i));
            } finally {
                processingRef.current = false;
                setProcessing(false);
            }
        })();
    }, [items, organizationId, buildingId, uploadTypologyPhoto, applyPhotoToTypology]);

    const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(true); }, []);
    const handleDragLeave = useCallback(() => setDragging(false), []);
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupByKey]);

    const removeItem = (id: string) => {
        setItems(prev => {
            const item = prev.find(i => i.id === id);
            if (item) {
                URL.revokeObjectURL(item.previewUrl);
                previewUrlsRef.current.delete(item.previewUrl);
            }
            return prev.filter(i => i.id !== id);
        });
    };

    const total = items.length;
    const okCount = items.filter(i => i.status === 'ok').length;
    const errCount = items.filter(i => i.status === 'erro').length;
    const semTipoCount = items.filter(i => i.status === 'sem_tipo').length;
    const pendCount = items.filter(i => i.status === 'aguardando' || i.status === 'processando').length;
    const done = pendCount === 0 && total > 0;
    const unitsUpdatedTotal = items.reduce((s, i) => s + (i.unitsUpdated ?? 0), 0);

    return (
        <Modal open dismissable={!processing} onClose={onClose} size="2xl" zIndex={80}>
            <ModalHeader
                title="Upload de Fotos em Lote"
                description="Envie 1 foto por tipo de unidade — ela é aplicada a todas as unidades iguais de uma vez."
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
                        {dragging ? 'Solte as fotos aqui' : 'Arraste fotos aqui ou clique para selecionar'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                        Nomeie o arquivo com o nome do tipo (ex: "2 dormitórios.jpg") para casar automaticamente. Pode selecionar várias de uma vez.
                    </p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
                    />
                </div>

                {/* Resumo quando há itens */}
                {total > 0 && (
                    <div className="flex items-center gap-3 text-xs font-bold flex-wrap">
                        <span className="text-gray-500">{total} arquivo{total !== 1 ? 's' : ''}</span>
                        {okCount > 0 && <span className="text-emerald-600">{okCount} aplicado{okCount !== 1 ? 's' : ''} ({unitsUpdatedTotal} unidade{unitsUpdatedTotal !== 1 ? 's' : ''})</span>}
                        {semTipoCount > 0 && <span className="text-amber-600">{semTipoCount} sem tipo definido</span>}
                        {errCount > 0 && <span className="text-red-600">{errCount} com erro</span>}
                        {pendCount > 0 && <span className="text-blue-600">{pendCount} na fila</span>}
                    </div>
                )}

                {/* Lista de itens */}
                {items.length > 0 && (
                    <div className="border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-50">
                        {items.map(item => (
                            <div key={item.id} className="flex items-center gap-3 px-4 py-3 bg-white">
                                {/* Thumbnail */}
                                <img src={item.previewUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-100 shrink-0" />

                                {/* Ícone de status */}
                                <div className="shrink-0">
                                    {item.status === 'processando' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                                    {item.status === 'ok' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                    {item.status === 'sem_tipo' && <AlertCircle className="w-4 h-4 text-amber-500" />}
                                    {item.status === 'erro' && <AlertCircle className="w-4 h-4 text-red-500" />}
                                    {item.status === 'aguardando' && <div className="w-4 h-4 rounded-full border-2 border-gray-200" />}
                                </div>

                                {/* Nome do arquivo + tipologia */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-gray-800 truncate" title={item.file.name}>{item.file.name}</p>
                                    {item.status === 'ok' && (
                                        <p className="text-xs text-emerald-600 mt-0.5">
                                            Aplicada a {item.unitsUpdated} unidade{item.unitsUpdated !== 1 ? 's' : ''} do tipo "{item.typology}"
                                        </p>
                                    )}
                                    {item.status === 'erro' && <p className="text-xs text-red-500 mt-0.5 truncate">{item.error}</p>}
                                    {item.status === 'processando' && <p className="text-xs text-blue-500 mt-0.5">Enviando e aplicando…</p>}
                                    {item.status === 'aguardando' && <p className="text-xs text-gray-400 mt-0.5">Aguardando na fila…</p>}
                                    {item.status === 'sem_tipo' && (
                                        <p className="text-xs text-amber-600 mt-0.5">Selecione o tipo de unidade ao lado</p>
                                    )}
                                </div>

                                {/* Seletor de tipologia — editável enquanto não processou */}
                                {(item.status === 'sem_tipo' || item.status === 'aguardando') && (
                                    <select
                                        value={item.typology}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setItems(prev => prev.map(i => i.id === item.id ? { ...i, typology: val, status: val ? 'aguardando' : 'sem_tipo' } : i));
                                        }}
                                        className="text-xs font-normal px-2 py-1.5 rounded-lg border border-gray-200 bg-gray-50 outline-none focus:border-blue-400 max-w-[160px] shrink-0"
                                    >
                                        <option value="">— Selecione o tipo —</option>
                                        {typologyGroups.map(g => (
                                            <option key={g.typology} value={g.typology}>{g.typology} ({g.count})</option>
                                        ))}
                                    </select>
                                )}

                                {/* Remover (só quando não está processando) */}
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
                    disabled={processing || !done}
                    className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-900/20"
                >
                    {processing && <Loader2 className="w-4 h-4 animate-spin" />}
                    {done
                        ? `Concluir (${okCount} tipo${okCount !== 1 ? 's' : ''} atualizado${okCount !== 1 ? 's' : ''})`
                        : total > 0
                            ? `Processando… (${pendCount} restante${pendCount !== 1 ? 's' : ''})`
                            : 'Concluir'}
                </button>
            </ModalFooter>
        </Modal>
    );
};

export default UnitTypologyPhotoLoteModal;
