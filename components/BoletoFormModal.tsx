import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Upload, Loader2, X, FileText, AlertCircle, CheckCircle2,
    Building2, Calendar, DollarSign, Hash, Eye, Save,
    ThumbsUp, Ban, Trash2, UserPlus,
} from 'lucide-react';
import HierarchicalSelect from './HierarchicalSelect';
import { boletoService } from '../services/boletoService';
import { supplierService } from '../services/supplierService';
import { financialRegistryService } from '../services/financialRegistryService';
import { projectService } from '../services/projectService';
import { extractFromPdfFile } from '../utils/boletoParser';
import { onlyDigits } from '../utils/febrabanRules';
import type { Boleto, BoletoExtractionResult, Supplier, CostCenter, ChartOfAccount } from '../types';

interface BoletoFormModalProps {
    organizationId: string;
    organizations?: { id: string; name: string }[];
    onOrgChange?: (id: string) => void;
    userEmail?: string;
    projectId?: string;
    boleto?: Boleto;
    onClose: () => void;
    onSaved: (boleto: Boleto) => void;
}

const formatBRL = (v?: number) =>
    typeof v === 'number'
        ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : '—';

const BoletoFormModal: React.FC<BoletoFormModalProps> = ({
    organizationId: initialOrgId, organizations = [], onOrgChange,
    userEmail, projectId, boleto: initial, onClose, onSaved,
}) => {
    const [organizationId, setOrganizationId] = React.useState(initialOrgId);
    const [boleto, setBoleto] = useState<Boleto | undefined>(initial);
    const [uploading, setUploading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    const [linhaManual, setLinhaManual] = useState('');
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
    const [charts, setCharts] = useState<ChartOfAccount[]>([]);
    const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
    const [documentoBlobUrl, setDocumentoBlobUrl] = useState<string | null>(null);

    // Arquivo selecionado mas ainda não enviado ao Supabase (aguardando org)
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [pendingExtraction, setPendingExtraction] = useState<BoletoExtractionResult | null>(null);

    // Form fields
    const [supplierId, setSupplierId] = useState<string>(initial?.supplier_id ?? '');
    const [costCenterId, setCostCenterId] = useState<string>(initial?.cost_center_id ?? '');
    const [chartId, setChartId] = useState<string>(initial?.chart_of_accounts_id ?? '');
    const [selectedProjectId, setSelectedProjectId] = useState<string>(initial?.project_id ?? projectId ?? '');
    const [observacoes, setObservacoes] = useState<string>(initial?.observacoes ?? '');
    const [valor, setValor] = useState<string>(initial?.valor != null ? String(initial.valor) : '');
    const [vencimento, setVencimento] = useState<string>(initial?.vencimento ?? '');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const isCreating = !boleto;

    // Mini-formulário de cadastro rápido de fornecedor
    const [showNovoFornecedor, setShowNovoFornecedor] = useState(false);
    const [novoForn, setNovoForn] = useState({
        name: '', document: '', type: 'PJ' as 'PJ' | 'PF', category: 'Materiais de Construção',
        street: '', number: '', neighborhood: '', city: '', state: '', zip_code: '',
    });
    const [salvandoForn, setSalvandoForn] = useState(false);

    useEffect(() => {
        Promise.all([
            supplierService.listSuppliers(organizationId),
            financialRegistryService.listCostCenters(organizationId),
            financialRegistryService.listChartOfAccounts(organizationId),
            projectService.listProjects().catch(() => []),
        ]).then(([sup, cc, ch, projs]) => {
            setSuppliers(sup || []);
            setCostCenters(cc || []);
            setCharts(ch || []);
            type ProjectRow = { id: string; name: string; settings?: { classification?: string } };
            setProjects(((projs || []) as ProjectRow[])
                .filter((p) =>
                    p.settings?.classification === 'OBRA' &&
                    !/gest[aã]o\s+comercial/i.test(p.name ?? '')
                )
                .map((p) => ({ id: p.id, name: p.name })));
        }).catch(err => console.warn('falha ao carregar registros', err));
    }, [organizationId]);

    // Aplica sugestão de fornecedor caso nenhum esteja selecionado
    useEffect(() => {
        if (boleto?.sugestao_supplier_id && !supplierId) {
            setSupplierId(boleto.sugestao_supplier_id);
        }
    }, [boleto?.sugestao_supplier_id]);

    // Pré-preenche formulário de novo fornecedor com dados do boleto
    useEffect(() => {
        if (boleto) {
            let nome = boleto.beneficiario_nome ?? '';
            let cnpj = boleto.beneficiario_cnpj ?? '';

            // Extrai CNPJ/CPF embutido no nome (ex: "... - CNPJ: 07604526000120  Ven")
            if (!cnpj) {
                const match = nome.match(/\b(\d{14}|\d{11})\b/);
                if (match) cnpj = match[1];
            }

            // Remove do nome: " - CNPJ: ...", sequências de 11+ dígitos e lixo após o separador
            nome = nome
                .replace(/[\s\-–]+(?:CNPJ|CPF)[:\s]*[\d.\/\-]+.*/i, '')
                .replace(/\s+\d{11,14}\b.*/g, '')
                .trim();

            const digits = onlyDigits(cnpj);
            setNovoForn(prev => ({
                ...prev,
                name: nome || prev.name,
                document: cnpj || prev.document,
                type: digits.length === 14 ? 'PJ' : digits.length === 11 ? 'PF' : prev.type,
            }));
        }
    }, [boleto?.id]);

    const documentoUrl = useMemo(
        () => boleto ? boletoService.getDocumentoUrl(boleto.documento_path) : null,
        [boleto?.documento_path],
    );

    // Busca o documento como blob para contornar CSP que bloqueia iframes cross-origin
    useEffect(() => {
        if (!documentoUrl) { setDocumentoBlobUrl(null); return; }
        let revoked = false;
        fetch(documentoUrl)
            .then(r => r.blob())
            .then(blob => {
                if (!revoked) setDocumentoBlobUrl(URL.createObjectURL(blob));
            })
            .catch(() => setDocumentoBlobUrl(null));
        return () => {
            revoked = true;
            setDocumentoBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
        };
    }, [documentoUrl]);

    async function handleFile(file: File) {
        setError(null);
        setUploading(true);
        // Gera preview local imediato
        const localUrl = URL.createObjectURL(file);
        setDocumentoBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return localUrl; });
        try {
            const extraction = await extractFromPdfFile(file).catch(() => null);
            setPendingFile(file);
            setPendingExtraction(extraction);
            // Pré-preenche campos com o que foi extraído
            if (extraction) {
                setValor(extraction.campos.valor.valor != null ? String(extraction.campos.valor.valor) : '');
                setVencimento(extraction.campos.vencimento.valor ?? '');
            }
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error.message || 'Falha na extração');
        } finally {
            setUploading(false);
        }
    }

    async function handleUploadAndSave(closeAfter = true) {
        if (!pendingFile || !organizationId) return;
        setBusy(true);
        setError(null);
        try {
            const result = await boletoService.uploadBoleto({
                organizationId, file: pendingFile, userEmail,
                projectId: selectedProjectId || projectId,
            });
            // Aplica associações do formulário
            const updated = await boletoService.associar(result.boleto.id, organizationId, {
                supplier_id:          supplierId || undefined,
                cost_center_id:       costCenterId || undefined,
                chart_of_accounts_id: chartId || undefined,
                project_id:           selectedProjectId || projectId || undefined,
                observacoes:          observacoes || undefined,
                valor:                valor ? Number(valor) : undefined,
                vencimento:           vencimento || undefined,
            }, userEmail);
            setPendingFile(null);
            setPendingExtraction(null);
            onSaved(updated);
            if (result.duplicate) {
                // Boleto duplicado: mostra aviso e permanece no modal com os dados existentes
                setBoleto(updated);
                setInfo('Este boleto já havia sido capturado anteriormente. Carregando registro existente.');
            } else if (closeAfter) {
                onClose();
            } else {
                setBoleto(updated);
            }
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error.message || 'Falha ao salvar boleto');
            setBusy(false);
        }
    }

    async function handleAplicarLinhaManual() {
        if (!boleto) return;
        const digits = onlyDigits(linhaManual);
        if (digits.length !== 44 && digits.length !== 47 && digits.length !== 48) {
            setError('Linha digitável deve ter 44, 47 ou 48 dígitos.');
            return;
        }
        setError(null);
        setBusy(true);
        try {
            const updated = await boletoService.aplicarLinhaDigitavelManual(
                boleto.id, organizationId, digits, userEmail,
            );
            setBoleto(updated);
            setValor(updated.valor != null ? String(updated.valor) : '');
            setVencimento(updated.vencimento ?? '');
            setLinhaManual('');
            setInfo('Linha digitável processada com sucesso.');
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error.message || 'Falha ao processar linha digitável');
        } finally {
            setBusy(false);
        }
    }

    async function handleSalvar() {
        if (!boleto) return;
        setBusy(true);
        setError(null);
        try {
            const updated = await boletoService.associar(boleto.id, organizationId, {
                supplier_id: supplierId || undefined,
                cost_center_id: costCenterId || undefined,
                chart_of_accounts_id: chartId || undefined,
                project_id: selectedProjectId || projectId || boleto.project_id,
                observacoes: observacoes || undefined,
                valor: valor ? Number(valor) : undefined,
                vencimento: vencimento || undefined,
            }, userEmail);
            setBoleto(updated);
            setInfo('Boleto atualizado.');
            onSaved(updated);
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error.message || 'Falha ao salvar');
        } finally {
            setBusy(false);
        }
    }

    async function handleAprovar() {
        if (!boleto) return;
        if (!supplierId) {
            setError('Selecione um fornecedor antes de aprovar.');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await handleSalvar();
            const updated = await boletoService.aprovarECriarInvoice(boleto.id, organizationId, userEmail);
            setBoleto(updated);
            setInfo('Boleto aprovado e lançado em contas a pagar.');
            onSaved(updated);
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error.message || 'Falha ao aprovar');
        } finally {
            setBusy(false);
        }
    }

    async function handleMarcarPago() {
        if (!boleto) return;
        setBusy(true);
        try {
            const updated = await boletoService.marcarPago(boleto.id, organizationId, userEmail);
            setBoleto(updated);
            onSaved(updated);
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error.message || 'Falha ao marcar como pago');
        } finally {
            setBusy(false);
        }
    }

    async function handleSalvarNovoFornecedor() {
        if (!novoForn.name.trim()) return;
        setSalvandoForn(true);
        try {
            const criado = await supplierService.addSupplier({
                name:         novoForn.name.trim(),
                document:     novoForn.document.trim() || undefined,
                type:         novoForn.type,
                category:     novoForn.category,
                street:       novoForn.street.trim() || undefined,
                number:       novoForn.number.trim() || undefined,
                neighborhood: novoForn.neighborhood.trim() || undefined,
                city:         novoForn.city.trim() || undefined,
                state:        novoForn.state.trim() || undefined,
                zip_code:     novoForn.zip_code.trim() || undefined,
                organization_id: organizationId,
            });
            setSuppliers(prev => [...prev, criado].sort((a, b) => a.name.localeCompare(b.name)));
            setSupplierId(criado.id);
            setShowNovoFornecedor(false);
            setInfo(`Fornecedor "${criado.name}" cadastrado e selecionado.`);
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error.message || 'Falha ao cadastrar fornecedor');
        } finally {
            setSalvandoForn(false);
        }
    }

    async function handleCancelar() {
        if (!boleto) return;
        const motivo = window.prompt('Motivo do cancelamento:');
        if (!motivo) return;
        setBusy(true);
        try {
            const updated = await boletoService.cancelar(boleto.id, organizationId, motivo, userEmail);
            setBoleto(updated);
            onSaved(updated);
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error.message || 'Falha ao cancelar');
        } finally {
            setBusy(false);
        }
    }

    async function handleExcluirRascunho() {
        if (!boleto) return;
        if (!window.confirm('Excluir este rascunho permanentemente?')) return;
        setBusy(true);
        try {
            await boletoService.excluirRascunho(boleto.id, organizationId, userEmail);
            onSaved({ ...boleto, status: 'cancelado' }); // sinal de atualização
            onClose();
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error.message || 'Falha ao excluir');
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
                    <div>
                        <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                            {isCreating ? 'Capturar Boleto' : `Boleto · ${boleto?.banco_nome ?? 'Documento'}`}
                            {!isCreating && boleto?.numero != null && (
                                <span className="text-sm font-black text-gray-400 tracking-widest">
                                    #{String(boleto.numero).padStart(4, '0')}
                                </span>
                            )}
                        </h2>
                        {boleto && (
                            <p className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wider">
                                Status: <span className="text-gray-900">{boleto.status}</span>
                                {' · '}
                                Confiança: {boleto.confidence_score ?? 0}%
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {error && (
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                    {info && (
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
                            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{info}</span>
                        </div>
                    )}

                    {/* Upload zone (only when creating and no file selected yet) */}
                    {isCreating && !pendingFile && (
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
                        >
                            {uploading ? (
                                <div className="flex flex-col items-center gap-3 text-blue-600">
                                    <Loader2 className="w-8 h-8 animate-spin" />
                                    <span className="font-medium">Processando boleto...</span>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-3 text-gray-500">
                                    <Upload className="w-10 h-10 text-blue-600" />
                                    <div>
                                        <p className="text-gray-900 font-bold">Arraste um boleto aqui ou clique para selecionar</p>
                                        <p className="text-xs text-gray-500 mt-1">PDF ou imagem (JPG/PNG)</p>
                                    </div>
                                </div>
                            )}
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="application/pdf,image/*"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleFile(f);
                                }}
                            />
                        </div>
                    )}

                    {/* Preview local após seleção do arquivo, antes de salvar */}
                    {isCreating && pendingFile && !boleto && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Preview do PDF */}
                            <div className="space-y-4">
                                <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                                    <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2 text-xs uppercase font-bold tracking-widest text-gray-500">
                                        <FileText className="w-3.5 h-3.5" /> Documento original
                                    </div>
                                    <div className="aspect-[3/4] bg-white">
                                        {documentoBlobUrl
                                            ? <iframe src={documentoBlobUrl} className="w-full h-full" title="Boleto" />
                                            : <div className="flex items-center justify-center h-full text-gray-400 text-sm"><Loader2 className="w-5 h-5 animate-spin mr-2" />Carregando...</div>
                                        }
                                    </div>
                                    <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100 truncate">{pendingFile.name}</div>
                                </div>
                            </div>

                            {/* Dados extraídos + formulário */}
                            <div className="space-y-4">
                                {pendingExtraction && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <ReadOnlyField icon={Building2} label="Banco" value={pendingExtraction.campos.banco_nome?.valor ?? '—'} />
                                        <ReadOnlyField icon={Hash} label="Confiança" value={`${pendingExtraction.confidence_score ?? 0}%`} />
                                        {pendingExtraction.campos.beneficiario_nome?.valor && (
                                            <ReadOnlyField label="Beneficiário" value={
                                                pendingExtraction.campos.beneficiario_nome.valor
                                                    .replace(/[\s\-–]+(?:CNPJ|CPF)[:\s]*[\d.\/\-]+.*/i, '')
                                                    .replace(/\s+\d{11,14}\b.*/g, '')
                                                    .trim()
                                            } />
                                        )}
                                        {pendingExtraction.campos.beneficiario_cnpj?.valor && (
                                            <ReadOnlyField label="CNPJ / CPF" value={pendingExtraction.campos.beneficiario_cnpj.valor} mono />
                                        )}
                                    </div>
                                )}

                                {/* Organização — obrigatória para salvar */}
                                {organizations.length > 0 && (
                                    <div className={`p-3 rounded-xl border ${organizationId ? 'bg-gray-50 border-gray-200' : 'bg-blue-50 border-blue-200'}`}>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">
                                            Organização *
                                        </label>
                                        <select
                                            value={organizationId}
                                            onChange={e => { setOrganizationId(e.target.value); onOrgChange?.(e.target.value); }}
                                            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-blue-400"
                                            autoFocus={!organizationId}
                                        >
                                            <option value="">— Selecione a organização —</option>
                                            {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                        </select>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-3">
                                    <FormField label="Valor (R$)" icon={DollarSign}>
                                        <input type="number" step="0.01" min="0" value={valor}
                                            onChange={e => setValor(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                                    </FormField>
                                    <FormField label="Vencimento" icon={Calendar}>
                                        <input type="date" value={vencimento}
                                            onChange={e => setVencimento(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                                    </FormField>
                                </div>

                                <FormField label="Obra / Projeto">
                                    <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                                        <option value="">— Sem vínculo —</option>
                                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </FormField>

                                <div className="grid grid-cols-2 gap-3">
                                    <FormField label="Centro de Custo">
                                        <select value={costCenterId} onChange={e => setCostCenterId(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                                            <option value="">—</option>
                                            {costCenters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </FormField>
                                    <FormField label="Plano de Contas">
                                        <select value={chartId} onChange={e => setChartId(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                                            <option value="">—</option>
                                            {charts.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                                        </select>
                                    </FormField>
                                </div>

                                <FormField label="Observações">
                                    <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
                                        rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                                </FormField>

                                <div className="flex justify-end gap-2 pt-2">
                                    <button onClick={() => { setPendingFile(null); setPendingExtraction(null); setDocumentoBlobUrl(null); }}
                                        className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg text-xs font-bold uppercase tracking-widest">
                                        Trocar arquivo
                                    </button>
                                    <button
                                        onClick={() => handleUploadAndSave(false)}
                                        disabled={busy || !organizationId}
                                        className="flex items-center gap-2 px-5 py-2 bg-gray-100 text-gray-900 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-gray-200 disabled:opacity-50"
                                        title={!organizationId ? 'Selecione a organização antes de salvar' : undefined}
                                    >
                                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                        Salvar rascunho
                                    </button>
                                    <button
                                        onClick={() => handleUploadAndSave(true)}
                                        disabled={busy || !organizationId}
                                        className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50"
                                        title={!organizationId ? 'Selecione a organização antes de salvar' : undefined}
                                    >
                                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                                        Salvar e fechar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Conteúdo após o boleto existir */}
                    {boleto && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Coluna esquerda: visualização do documento */}
                            <div className="space-y-4">
                                <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                                    <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2 text-xs uppercase font-bold tracking-widest text-gray-500">
                                        <FileText className="w-3.5 h-3.5" />
                                        Documento original
                                    </div>
                                    <div className="aspect-[3/4] bg-white">
                                        {boleto.documento_mime === 'application/pdf' ? (
                                            documentoBlobUrl
                                                ? <iframe src={documentoBlobUrl} className="w-full h-full" title="Boleto" />
                                                : <div className="flex items-center justify-center h-full text-gray-400 text-sm"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...</div>
                                        ) : documentoBlobUrl ? (
                                            <img src={documentoBlobUrl} className="w-full h-full object-contain" alt="Boleto" />
                                        ) : null}
                                    </div>
                                    <div className="px-4 py-2 flex items-center justify-between text-xs text-gray-500 border-t border-gray-100">
                                        <span className="truncate">{boleto.documento_nome}</span>
                                        {documentoUrl && (
                                            <a href={documentoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                                                <Eye className="w-3 h-3" /> Abrir
                                            </a>
                                        )}
                                    </div>
                                </div>

                                {/* Linha digitável manual (quando confidence baixo) */}
                                {boleto.confidence_score !== undefined && boleto.confidence_score < 80 && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                        <p className="text-xs uppercase font-bold tracking-widest text-amber-700 mb-2">
                                            Extração com baixa confiança
                                        </p>
                                        <p className="text-xs text-amber-700 mb-3">
                                            Cole abaixo a linha digitável (47 ou 48 dígitos) impressa no boleto:
                                        </p>
                                        <input
                                            type="text"
                                            value={linhaManual}
                                            onChange={(e) => setLinhaManual(e.target.value)}
                                            placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000"
                                            className="w-full px-3 py-2 rounded-lg border border-amber-300 text-sm font-mono"
                                        />
                                        <button
                                            onClick={handleAplicarLinhaManual}
                                            disabled={busy || !linhaManual}
                                            className="mt-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-amber-700 disabled:opacity-50"
                                        >
                                            Validar linha digitável
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Coluna direita: dados extraídos e form */}
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <ReadOnlyField icon={Building2} label="Banco" value={boleto.banco_nome ?? boleto.banco_codigo ?? '—'} />
                                    <ReadOnlyField icon={Hash} label="Linha digitável" value={boleto.linha_digitavel ?? '—'} mono />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <FormField label="Valor (R$)" icon={DollarSign}>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={valor}
                                            onChange={(e) => setValor(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                        />
                                    </FormField>
                                    <FormField label="Vencimento" icon={Calendar}>
                                        <input
                                            type="date"
                                            value={vencimento}
                                            onChange={(e) => setVencimento(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                        />
                                    </FormField>
                                </div>

                                {/* Beneficiário só aparece quando não há fornecedor vinculado — evita duplicidade */}
                                {boleto.beneficiario_nome && !supplierId && (() => {
                                    const nomeExib = boleto.beneficiario_nome!
                                        .replace(/[\s\-–]+(?:CNPJ|CPF)[:\s]*[\d.\/\-]+.*/i, '')
                                        .replace(/\s+\d{11,14}\b.*/g, '')
                                        .trim();
                                    let cnpjExib = boleto.beneficiario_cnpj ?? '';
                                    if (!cnpjExib) {
                                        const m = boleto.beneficiario_nome!.match(/\b(\d{14}|\d{11})\b/);
                                        if (m) cnpjExib = m[1];
                                    }
                                    return (
                                        <div className="grid grid-cols-2 gap-3">
                                            <ReadOnlyField label="Beneficiário" value={nomeExib || boleto.beneficiario_nome!} />
                                            <ReadOnlyField label="CNPJ / CPF" value={cnpjExib || '—'} mono />
                                        </div>
                                    );
                                })()}

                                <FormField label="Fornecedor">
                                    <>
                                        {boleto.sugestao_supplier_id && supplierId === boleto.sugestao_supplier_id && (
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-widest">
                                                    <CheckCircle2 className="w-3 h-3" /> Sugerido via CNPJ
                                                </span>
                                                <button type="button" onClick={() => setSupplierId('')} className="text-[10px] text-gray-400 hover:text-gray-600 underline">limpar</button>
                                            </div>
                                        )}
                                        <div className="flex gap-2">
                                            <select
                                                value={supplierId}
                                                onChange={(e) => { setSupplierId(e.target.value); setShowNovoFornecedor(false); }}
                                                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                            >
                                                <option value="">Selecione um fornecedor</option>
                                                {suppliers.map(s => (
                                                    <option key={s.id} value={s.id}>
                                                        {s.name}{s.document ? ` — ${s.document}` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={() => { setShowNovoFornecedor(v => !v); setSupplierId(''); }}
                                                title="Cadastrar novo fornecedor com dados do boleto"
                                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${
                                                    showNovoFornecedor
                                                        ? 'bg-blue-600 text-white border-blue-600'
                                                        : 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'
                                                }`}
                                            >
                                                <UserPlus className="w-3.5 h-3.5" />
                                                Novo
                                            </button>
                                        </div>

                                        {/* Mini-formulário de cadastro rápido */}
                                        {showNovoFornecedor && (
                                            <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700 flex items-center gap-1.5">
                                                    <UserPlus className="w-3 h-3" /> Cadastrar novo fornecedor
                                                </p>

                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Razão Social *</label>
                                                    <input
                                                        type="text"
                                                        required
                                                        value={novoForn.name}
                                                        onChange={e => setNovoForn(p => ({ ...p, name: e.target.value }))}
                                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                                                        placeholder="Nome do fornecedor"
                                                    />
                                                </div>

                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">CNPJ / CPF</label>
                                                        <input
                                                            type="text"
                                                            value={novoForn.document}
                                                            onChange={e => setNovoForn(p => ({ ...p, document: e.target.value }))}
                                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono bg-white"
                                                            placeholder="00.000.000/0000-00"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Tipo</label>
                                                        <select
                                                            value={novoForn.type}
                                                            onChange={e => setNovoForn(p => ({ ...p, type: e.target.value as 'PJ' | 'PF' }))}
                                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                                                        >
                                                            <option value="PJ">Pessoa Jurídica</option>
                                                            <option value="PF">Pessoa Física</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Categoria</label>
                                                    <select
                                                        value={novoForn.category}
                                                        onChange={e => setNovoForn(p => ({ ...p, category: e.target.value }))}
                                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                                                    >
                                                        {['Materiais de Construção','Mão de Obra / Serviços','Equipamentos / Ferramentas','Consultoria / Projetos','Transporte / Logística','Outros'].map(c => (
                                                            <option key={c} value={c}>{c}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* Endereço */}
                                                <div className="pt-1 border-t border-blue-100">
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Endereço</p>
                                                    <div className="grid grid-cols-3 gap-2 mb-2">
                                                        <div className="col-span-2">
                                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Rua / Logradouro</label>
                                                            <input
                                                                type="text"
                                                                value={novoForn.street}
                                                                onChange={e => setNovoForn(p => ({ ...p, street: e.target.value }))}
                                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                                                                placeholder="Av. Paulista"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Número</label>
                                                            <input
                                                                type="text"
                                                                value={novoForn.number}
                                                                onChange={e => setNovoForn(p => ({ ...p, number: e.target.value }))}
                                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                                                                placeholder="123"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 mb-2">
                                                        <div>
                                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Bairro</label>
                                                            <input
                                                                type="text"
                                                                value={novoForn.neighborhood}
                                                                onChange={e => setNovoForn(p => ({ ...p, neighborhood: e.target.value }))}
                                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                                                                placeholder="Centro"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">CEP</label>
                                                            <input
                                                                type="text"
                                                                value={novoForn.zip_code}
                                                                onChange={e => setNovoForn(p => ({ ...p, zip_code: e.target.value }))}
                                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono bg-white"
                                                                placeholder="00000-000"
                                                                maxLength={9}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <div className="col-span-2">
                                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Cidade</label>
                                                            <input
                                                                type="text"
                                                                value={novoForn.city}
                                                                onChange={e => setNovoForn(p => ({ ...p, city: e.target.value }))}
                                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                                                                placeholder="São Paulo"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">UF</label>
                                                            <select
                                                                value={novoForn.state}
                                                                onChange={e => setNovoForn(p => ({ ...p, state: e.target.value }))}
                                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                                                            >
                                                                <option value="">—</option>
                                                                {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                                                                    <option key={uf} value={uf}>{uf}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex gap-2 pt-1">
                                                    <button
                                                        type="button"
                                                        onClick={handleSalvarNovoFornecedor}
                                                        disabled={salvandoForn || !novoForn.name.trim()}
                                                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
                                                    >
                                                        {salvandoForn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                                        Salvar e selecionar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowNovoFornecedor(false)}
                                                        className="px-3 py-2 text-gray-500 hover:text-gray-700 text-xs font-bold"
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                </FormField>

                                <FormField label="Obra / Projeto">
                                    <select
                                        value={selectedProjectId}
                                        onChange={(e) => setSelectedProjectId(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                    >
                                        <option value="">— Sem vínculo —</option>
                                        {projects.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </FormField>

                                <div className="grid grid-cols-2 gap-3">
                                    <FormField label="Centro de Custo">
                                        <HierarchicalSelect
                                            items={costCenters}
                                            value={costCenterId}
                                            onChange={setCostCenterId}
                                            valueField="id"
                                            placeholder="—"
                                            hoverCls="hover:bg-blue-50"
                                        />
                                    </FormField>
                                    <FormField label="Plano de Contas">
                                        <HierarchicalSelect
                                            items={charts}
                                            value={chartId}
                                            onChange={setChartId}
                                            valueField="id"
                                            placeholder="—"
                                            hoverCls="hover:bg-blue-50"
                                        />
                                    </FormField>
                                </div>

                                <FormField label="Observações">
                                    <textarea
                                        value={observacoes}
                                        onChange={(e) => setObservacoes(e.target.value)}
                                        rows={2}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                    />
                                </FormField>

                                {boleto.erros_validacao && boleto.erros_validacao.length > 0 && (
                                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                        <p className="font-bold uppercase mb-1">Avisos de validação:</p>
                                        <ul className="list-disc list-inside space-y-0.5">
                                            {boleto.erros_validacao.map((e, i) => <li key={i}>{e}</li>)}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer com ações */}
                {boleto && (
                    <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex flex-wrap items-center justify-end gap-2">
                        {boleto.status === 'rascunho' && (
                            <button
                                onClick={handleExcluirRascunho}
                                disabled={busy}
                                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                            >
                                <Trash2 className="w-3.5 h-3.5" /> Excluir
                            </button>
                        )}

                        {boleto.status !== 'pago' && boleto.status !== 'cancelado' && (
                            <button
                                onClick={handleCancelar}
                                disabled={busy}
                                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                            >
                                <Ban className="w-3.5 h-3.5" /> Cancelar
                            </button>
                        )}

                        <button
                            onClick={handleSalvar}
                            disabled={busy}
                            className="px-5 py-2 bg-gray-100 text-gray-900 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-gray-200 flex items-center gap-2"
                        >
                            <Save className="w-3.5 h-3.5" /> Salvar Rascunho
                        </button>

                        {(boleto.status === 'rascunho' || boleto.status === 'revisao') && (
                            <button
                                onClick={handleAprovar}
                                disabled={busy || !supplierId}
                                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                <ThumbsUp className="w-3.5 h-3.5" /> Aprovar e Lançar
                            </button>
                        )}

                        {boleto.status === 'aprovado' && (
                            <button
                                onClick={handleMarcarPago}
                                disabled={busy}
                                className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-emerald-700 flex items-center gap-2"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Marcar como Pago
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Pequenos helpers de UI ──────────────────────────────────────────────────

const FormField: React.FC<React.PropsWithChildren<{ label: string; icon?: React.ComponentType<{ className?: string }> }>> = ({ label, icon: Icon, children }) => (
    <div>
        <label className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-1">
            {Icon && <Icon className="w-3 h-3" />}
            {label}
        </label>
        {children}
    </div>
);

const ReadOnlyField: React.FC<{ label: string; value: string; icon?: React.ComponentType<{ className?: string }>; mono?: boolean }> = ({ label, value, icon: Icon, mono }) => (
    <div>
        <label className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-1">
            {Icon && <Icon className="w-3 h-3" />}
            {label}
        </label>
        <div className={`px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm text-gray-700 ${mono ? 'font-mono text-[10px]' : ''} truncate`}>
            {value}
        </div>
    </div>
);

export default BoletoFormModal;
export { formatBRL };
