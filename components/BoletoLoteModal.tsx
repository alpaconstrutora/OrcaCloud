import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Upload, Loader2, X, CheckCircle2, AlertCircle, Copy,
    Building2, FolderOpen, Users,
} from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/modal';
import { boletoService } from '../services/boletoService';
import { supplierService } from '../services/supplierService';
import { financialRegistryService } from '../services/financialRegistryService';
import { projectService } from '../services/projectService';
import type { Boleto, BoletoExtractionResult, CostCenter } from '../types';

// ─── Tipos internos ─────────────────────────────────────────────────────────

type ItemStatus = 'aguardando' | 'processando' | 'ok' | 'duplicado' | 'erro';

interface LoteItem {
    id: string;
    file: File;
    status: ItemStatus;
    boleto?: Boleto;
    extraction?: BoletoExtractionResult;
    error?: string;
}

interface BoletoLoteModalProps {
    organizationId: string;
    organizations?: { id: string; name: string }[];
    userEmail?: string;
    projectId?: string;
    onClose: () => void;
    onConcluir: () => void;
}

const formatBRL = (v?: number) =>
    typeof v === 'number'
        ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : '—';

const formatDate = (d?: string | null) => {
    if (!d) return '—';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
};

// ─── Componente ─────────────────────────────────────────────────────────────

const BoletoLoteModal: React.FC<BoletoLoteModalProps> = ({
    organizationId: initialOrgId,
    organizations = [],
    userEmail,
    projectId: initialProjectId,
    onClose,
    onConcluir,
}) => {
    const [organizationId, setOrganizationId] = useState(initialOrgId);
    const [items, setItems] = useState<LoteItem[]>([]);
    const [dragging, setDragging] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [applyingCommon, setApplyingCommon] = useState(false);
    const [commonApplied, setCommonApplied] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const processingRef = useRef(false);

    // Campos comuns
    const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
    const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
    const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
    const [supplierId, setSupplierId] = useState('');
    const [costCenterId, setCostCenterId] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId ?? '');
    const [observacoes, setObservacoes] = useState('');

    // ─── Carregar listas de referência ────────────────────────────────────
    useEffect(() => {
        const orgArg = organizationId || undefined;
        Promise.all([
            supplierService.listSuppliers(orgArg).catch(() => [] as { id: string; name: string }[]),
            financialRegistryService.listCostCenters(orgArg).catch(() => [] as CostCenter[]),
            projectService.listProjects().catch(() => [] as { id: string; name: string }[]),
        ]).then(([sups, ccs, projs]) => {
            setSuppliers(sups);
            setCostCenters(ccs);
            setProjects(projs);
        });
    }, [organizationId]);

    // ─── Adicionar arquivos ───────────────────────────────────────────────
    function addFiles(files: FileList | File[]) {
        const arr = Array.from(files).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
        if (!arr.length) return;

        setCommonApplied(false);
        setItems(prev => {
            const existing = new Set(prev.map(i => i.file.name + i.file.size));
            const news = arr
                .filter(f => !existing.has(f.name + f.size))
                .map<LoteItem>(f => ({
                    id: `${Date.now()}_${Math.random()}`,
                    file: f,
                    status: 'aguardando',
                }));
            return [...prev, ...news];
        });
    }

    // ─── Processar fila sequencialmente ──────────────────────────────────
    useEffect(() => {
        if (processingRef.current) return;
        const aguardando = items.find(i => i.status === 'aguardando');
        if (!aguardando) return;
        if (!organizationId) return;

        processingRef.current = true;
        setProcessing(true);

        (async () => {
            // Atualiza status do item para 'processando'
            setItems(prev => prev.map(i => i.id === aguardando.id ? { ...i, status: 'processando' } : i));
            try {
                const result = await boletoService.uploadBoleto({
                    organizationId,
                    file: aguardando.file,
                    userEmail,
                    projectId: selectedProjectId || undefined,
                });
                setItems(prev => prev.map(i =>
                    i.id === aguardando.id
                        ? {
                            ...i,
                            status: result.duplicate ? 'duplicado' : 'ok',
                            boleto: result.boleto,
                            extraction: result.extraction,
                        }
                        : i,
                ));
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                setItems(prev => prev.map(i =>
                    i.id === aguardando.id ? { ...i, status: 'erro', error: msg } : i,
                ));
            } finally {
                processingRef.current = false;
                setProcessing(false);
            }
        })();
    }, [items, organizationId, userEmail, selectedProjectId]);

    // ─── Aplicar campos comuns ────────────────────────────────────────────
    const temCamposComuns = supplierId || costCenterId || selectedProjectId || observacoes.trim();
    const boletosOk = items.filter(i => i.status === 'ok' && i.boleto);

    async function aplicarCamposComuns() {
        if (!boletosOk.length || !temCamposComuns) return;
        setApplyingCommon(true);
        const fields: Parameters<typeof boletoService.associar>[2] = {};
        if (supplierId)   fields.supplier_id   = supplierId;
        if (costCenterId) fields.cost_center_id = costCenterId;
        if (selectedProjectId) fields.project_id = selectedProjectId;
        if (observacoes.trim()) fields.observacoes = observacoes.trim();

        const results = await Promise.allSettled(
            boletosOk.map(i => boletoService.associar(i.boleto!.id, organizationId, fields, userEmail)),
        );

        setItems(prev => {
            const updated = [...prev];
            boletosOk.forEach((item, idx) => {
                const r = results[idx];
                const ix = updated.findIndex(i => i.id === item.id);
                if (ix !== -1 && r.status === 'fulfilled') {
                    updated[ix] = { ...updated[ix], boleto: r.value };
                }
            });
            return updated;
        });
        setApplyingCommon(false);
        setCommonApplied(true);
    }

    // ─── Drag & drop ─────────────────────────────────────────────────────
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(true);
    }, []);
    const handleDragLeave = useCallback(() => setDragging(false), []);
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Contadores ───────────────────────────────────────────────────────
    const total   = items.length;
    const okCount = items.filter(i => i.status === 'ok').length;
    const errCount= items.filter(i => i.status === 'erro').length;
    const dupCount= items.filter(i => i.status === 'duplicado').length;
    const pendCount= items.filter(i => i.status === 'aguardando' || i.status === 'processando').length;
    const done    = pendCount === 0 && total > 0;

    // ─── UI ───────────────────────────────────────────────────────────────
    return (
        <Modal open dismissable={!processing} onClose={onClose} size="2xl" zIndex={80}>
            <ModalHeader
                title="Importação em Lote"
                description="Envie múltiplos boletos PDF de uma vez. Os dados são extraídos automaticamente."
                icon={<div className="p-2 bg-blue-50 rounded-xl"><Upload className="w-5 h-5 text-blue-600" /></div>}
                onClose={processing ? undefined : onClose}
            />

            <ModalBody className="space-y-5">
                {/* Seletor de org (multi-tenant) */}
                {organizations.length > 0 && (
                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                        <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
                        <select
                            value={organizationId}
                            onChange={e => setOrganizationId(e.target.value)}
                            className="flex-1 bg-transparent text-sm font-semibold text-gray-700 outline-none"
                            disabled={processing}
                        >
                            {organizations.map(o => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Drop zone */}
                <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                        dragging
                            ? 'border-blue-400 bg-blue-50'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                    }`}
                >
                    <Upload className={`w-8 h-8 mx-auto mb-3 transition-colors ${dragging ? 'text-blue-500' : 'text-gray-300'}`} />
                    <p className="text-sm font-bold text-gray-700">
                        {dragging ? 'Solte os arquivos aqui' : 'Arraste PDFs aqui ou clique para selecionar'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Apenas arquivos PDF. Pode selecionar vários de uma vez.</p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,application/pdf"
                        multiple
                        className="hidden"
                        onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
                    />
                </div>

                {/* Resumo quando há itens */}
                {total > 0 && (
                    <div className="flex items-center gap-3 text-xs font-bold flex-wrap">
                        <span className="text-gray-500">{total} arquivo{total !== 1 ? 's' : ''}</span>
                        {okCount   > 0 && <span className="text-emerald-600">{okCount} processado{okCount !== 1 ? 's' : ''}</span>}
                        {dupCount  > 0 && <span className="text-amber-600">{dupCount} duplicado{dupCount !== 1 ? 's' : ''}</span>}
                        {errCount  > 0 && <span className="text-red-600">{errCount} com erro</span>}
                        {pendCount > 0 && <span className="text-blue-600">{pendCount} na fila</span>}
                    </div>
                )}

                {/* Lista de itens */}
                {items.length > 0 && (
                    <div className="border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-50">
                        {items.map(item => (
                            <div key={item.id} className="flex items-center gap-3 px-4 py-3 bg-white">
                                {/* Ícone de status */}
                                <div className="shrink-0">
                                    {item.status === 'processando' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                                    {item.status === 'ok'          && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                    {item.status === 'duplicado'   && <Copy className="w-4 h-4 text-amber-500" />}
                                    {item.status === 'erro'        && <AlertCircle className="w-4 h-4 text-red-500" />}
                                    {item.status === 'aguardando'  && <div className="w-4 h-4 rounded-full border-2 border-gray-200" />}
                                </div>

                                {/* Nome do arquivo */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-gray-800 truncate" title={item.file.name}>
                                        {item.file.name}
                                    </p>
                                    {item.status === 'ok' && item.boleto && (
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {item.boleto.beneficiario_nome ?? '—'}
                                            {item.boleto.valor != null && ` · ${formatBRL(item.boleto.valor)}`}
                                            {item.boleto.vencimento && ` · Venc. ${formatDate(item.boleto.vencimento)}`}
                                        </p>
                                    )}
                                    {item.status === 'duplicado' && (
                                        <p className="text-xs text-amber-600 mt-0.5">Já cadastrado — boleto ignorado</p>
                                    )}
                                    {item.status === 'erro' && (
                                        <p className="text-xs text-red-500 mt-0.5 truncate">{item.error}</p>
                                    )}
                                    {item.status === 'aguardando' && (
                                        <p className="text-xs text-gray-400 mt-0.5">Aguardando na fila…</p>
                                    )}
                                    {item.status === 'processando' && (
                                        <p className="text-xs text-blue-500 mt-0.5">Processando…</p>
                                    )}
                                </div>

                                {/* Remover (só quando não está processando) */}
                                {item.status !== 'processando' && !processing && (
                                    <button
                                        onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))}
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

                {/* Campos comuns — só aparecem quando há pelo menos 1 ok */}
                {boletosOk.length > 0 && (
                    <div className="border border-gray-100 rounded-2xl p-4 space-y-3 bg-gray-50">
                        <p className="text-xs font-black text-gray-700 uppercase tracking-widest">
                            Campos comuns (opcional)
                        </p>
                        <p className="text-xs text-gray-500">
                            Preencha para aplicar os mesmos dados a todos os {boletosOk.length} boleto{boletosOk.length !== 1 ? 's' : ''} processado{boletosOk.length !== 1 ? 's' : ''}.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Fornecedor */}
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                                    <Users className="w-3 h-3" /> Fornecedor
                                </label>
                                <select
                                    value={supplierId}
                                    onChange={e => { setSupplierId(e.target.value); setCommonApplied(false); }}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                                >
                                    <option value="">— Sem fornecedor —</option>
                                    {suppliers.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Centro de custo */}
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                                    <FolderOpen className="w-3 h-3" /> Centro de custo
                                </label>
                                <select
                                    value={costCenterId}
                                    onChange={e => { setCostCenterId(e.target.value); setCommonApplied(false); }}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                                >
                                    <option value="">— Sem centro de custo —</option>
                                    {costCenters.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Projeto */}
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-600">Projeto / Obra</label>
                                <select
                                    value={selectedProjectId}
                                    onChange={e => { setSelectedProjectId(e.target.value); setCommonApplied(false); }}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                                >
                                    <option value="">— Sem projeto —</option>
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Observações */}
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-600">Observações</label>
                                <input
                                    type="text"
                                    value={observacoes}
                                    onChange={e => { setObservacoes(e.target.value); setCommonApplied(false); }}
                                    placeholder="Opcional"
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-3 pt-1">
                            <button
                                onClick={aplicarCamposComuns}
                                disabled={applyingCommon || !temCamposComuns || pendCount > 0}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                {applyingCommon && <Loader2 className="w-3 h-3 animate-spin" />}
                                Aplicar campos comuns
                            </button>
                            {commonApplied && (
                                <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Campos aplicados
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
                    onClick={onConcluir}
                    disabled={processing || !done}
                    className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-900/20"
                >
                    {processing && <Loader2 className="w-4 h-4 animate-spin" />}
                    {done
                        ? `Concluir (${okCount} boleto${okCount !== 1 ? 's' : ''})`
                        : `Processando… (${pendCount} restante${pendCount !== 1 ? 's' : ''})`
                    }
                </button>
            </ModalFooter>
        </Modal>
    );
};

export default BoletoLoteModal;
