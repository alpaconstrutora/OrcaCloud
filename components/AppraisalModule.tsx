import React from 'react';
import { Plus, FileText, Trash2, Pencil, ArrowLeft, FileDown, Calculator, Home } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/modal';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import {
    appraisalService, AppraisalReport, AppraisalComparable,
    AppraisalFinalidade, AppraisalObjetivo, AppraisalMetodologia, AppraisalPropertyType, AppraisalStatus,
    APPRAISAL_FINALIDADE_LABELS, APPRAISAL_OBJETIVO_LABELS, APPRAISAL_METODOLOGIA_LABELS,
    APPRAISAL_PROPERTY_TYPE_LABELS, APPRAISAL_STATUS_LABELS,
    calculateAppraisal, homogenizedUnitPrice,
} from '../services/appraisalService';
import { generateAppraisalReportPdf } from '../services/appraisalPdfService';

interface Props {
    organizationId: string;
    userEmail?: string;
}

const fmtBRL = (v?: number | null) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const emptyReport = (organizationId: string, userEmail?: string): Omit<AppraisalReport, 'id'> => ({
    organization_id: organizationId,
    title: '',
    finalidade: 'compra_venda',
    objetivo: 'valor_mercado_venda',
    metodologia: 'comparativo_direto',
    data_base: new Date().toISOString().slice(0, 10),
    status: 'rascunho',
    created_by_email: userEmail,
});

const emptyComparable = (organizationId: string, reportId: string): Omit<AppraisalComparable, 'id'> => ({
    organization_id: organizationId,
    report_id: reportId,
    address: '',
    source: 'oferta',
    area: 0,
    price_total: 0,
    fator_oferta: 0.9,
    fator_localizacao: 1.0,
    fator_area: 1.0,
    fator_estado_conservacao: 1.0,
    fator_outros: 1.0,
});

const AppraisalModule: React.FC<Props> = ({ organizationId, userEmail }) => {
    const confirm = useConfirm();
    const [reports, setReports] = React.useState<AppraisalReport[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [selected, setSelected] = React.useState<AppraisalReport | null>(null);
    const [comparables, setComparables] = React.useState<AppraisalComparable[]>([]);
    const [editingReport, setEditingReport] = React.useState<AppraisalReport | null>(null);
    const [editingComparable, setEditingComparable] = React.useState<AppraisalComparable | null>(null);
    const [saving, setSaving] = React.useState(false);
    const [exporting, setExporting] = React.useState(false);

    const loadReports = React.useCallback(() => {
        setLoading(true);
        appraisalService.listReports(organizationId)
            .then(setReports)
            .catch(err => console.error('Erro ao carregar laudos', err))
            .finally(() => setLoading(false));
    }, [organizationId]);

    React.useEffect(() => { loadReports(); }, [loadReports]);

    const loadComparables = React.useCallback((reportId: string) => {
        appraisalService.listComparables(reportId).then(setComparables).catch(err => console.error('Erro ao carregar comparáveis', err));
    }, []);

    const openDetail = (report: AppraisalReport) => {
        setSelected(report);
        if (report.id) loadComparables(report.id);
    };

    const handleSaveReport = async () => {
        if (!editingReport || !editingReport.title.trim()) return;
        setSaving(true);
        try {
            const saved = await appraisalService.saveReport(editingReport);
            setEditingReport(null);
            loadReports();
            if (selected?.id === saved.id) setSelected(saved);
            if (!selected) openDetail(saved);
        } catch (err) {
            console.error('Erro ao salvar laudo', err);
            alert('Erro ao salvar. Tente novamente.');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteReport = async (report: AppraisalReport) => {
        if (!report.id) return;
        const ok = await confirm({ title: 'Excluir laudo de avaliação?', message: report.title, variant: 'danger' });
        if (!ok) return;
        await appraisalService.deleteReport(report.id);
        loadReports();
        if (selected?.id === report.id) setSelected(null);
    };

    const handleSaveComparable = async () => {
        if (!editingComparable || !editingComparable.address.trim() || !selected?.id) return;
        setSaving(true);
        try {
            await appraisalService.saveComparable(editingComparable);
            setEditingComparable(null);
            loadComparables(selected.id);
        } catch (err) {
            console.error('Erro ao salvar comparável', err);
            alert('Erro ao salvar. Tente novamente.');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteComparable = async (comparable: AppraisalComparable) => {
        if (!comparable.id || !selected?.id) return;
        const ok = await confirm({ title: 'Excluir comparável?', message: comparable.address, variant: 'danger' });
        if (!ok) return;
        await appraisalService.deleteComparable(comparable.id);
        loadComparables(selected.id);
    };

    const handleRecalculate = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            const updated = await appraisalService.recalculateAndSave(selected);
            setSelected(updated);
            loadReports();
        } catch (err) {
            console.error('Erro ao recalcular', err);
        } finally {
            setSaving(false);
        }
    };

    const handleExportPdf = async () => {
        if (!selected) return;
        setExporting(true);
        try {
            generateAppraisalReportPdf(selected, comparables);
        } catch (err) {
            console.error('Erro ao gerar PDF do laudo', err);
            alert('Erro ao gerar PDF.');
        } finally {
            setExporting(false);
        }
    };

    const calc = selected ? calculateAppraisal(comparables, selected.property_area_privativa ?? selected.property_area_total) : null;

    // ─── Detalhe do laudo ───
    if (selected) {
        return (
            <div className="space-y-6">
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)} className="gap-2">
                    <ArrowLeft className="w-4 h-4" /> Voltar
                </Button>

                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-black text-gray-900">{selected.title}</h2>
                        <p className="text-sm text-gray-500 mt-1">{APPRAISAL_STATUS_LABELS[selected.status]} — {APPRAISAL_METODOLOGIA_LABELS[selected.metodologia]}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setEditingReport(selected)} className="gap-2">
                            <Pencil className="w-4 h-4" /> Editar dados
                        </Button>
                        <Button variant="primary" size="sm" onClick={handleExportPdf} disabled={exporting} className="gap-2">
                            <FileDown className="w-4 h-4" /> {exporting ? 'Gerando...' : 'Baixar PDF'}
                        </Button>
                    </div>
                </div>

                {/* Dados gerais resumo */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                        <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Finalidade</p>
                        <p className="text-sm font-bold text-gray-800">{APPRAISAL_FINALIDADE_LABELS[selected.finalidade]}</p>
                    </div>
                    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                        <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Objetivo</p>
                        <p className="text-sm font-bold text-gray-800">{APPRAISAL_OBJETIVO_LABELS[selected.objetivo]}</p>
                    </div>
                    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                        <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Área privativa</p>
                        <p className="text-sm font-bold text-gray-800">{selected.property_area_privativa ?? '—'} m²</p>
                    </div>
                    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                        <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Data-base</p>
                        <p className="text-sm font-bold text-gray-800">{new Date(selected.data_base + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                    </div>
                </div>

                {/* Comparáveis */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider">Comparáveis (Amostra de Mercado)</h4>
                        <Button size="sm" onClick={() => setEditingComparable(emptyComparable(organizationId, selected.id!) as AppraisalComparable)} className="gap-2">
                            <Plus className="w-4 h-4" /> Novo comparável
                        </Button>
                    </div>
                    {comparables.length === 0 ? (
                        <div className="text-center py-10 bg-gray-50 rounded-2xl">
                            <Home className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm font-bold text-gray-400">Nenhum comparável cadastrado</p>
                        </div>
                    ) : (
                        <div className="border border-gray-100 rounded-3xl overflow-x-auto bg-white shadow-sm">
                            <table className="min-w-[820px] w-full text-left text-sm">
                                <thead className="bg-gray-50/80 text-gray-500 font-black uppercase tracking-wider text-xs border-b border-gray-100">
                                    <tr>
                                        <th className="p-4">Endereço</th>
                                        <th className="p-4">Fonte</th>
                                        <th className="p-4">Área</th>
                                        <th className="p-4">Preço total</th>
                                        <th className="p-4">R$/m² homogeneizado</th>
                                        <th className="p-4"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {comparables.map(c => (
                                        <tr key={c.id} className="hover:bg-gray-50/30">
                                            <td className="p-4 font-semibold text-gray-800">{c.address}</td>
                                            <td className="p-4 text-gray-600">{c.source === 'oferta' ? 'Oferta' : 'Venda'}</td>
                                            <td className="p-4 text-gray-600">{c.area} m²</td>
                                            <td className="p-4 text-gray-700 font-medium">{fmtBRL(c.price_total)}</td>
                                            <td className="p-4 text-gray-700 font-medium">{fmtBRL(homogenizedUnitPrice(c))}</td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-1 justify-end">
                                                    <button onClick={() => setEditingComparable(c)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Pencil className="w-3.5 h-3.5 text-gray-500" /></button>
                                                    <button onClick={() => handleDeleteComparable(c)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Resultado */}
                {calc && comparables.length > 0 && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider">Resultado — Método Comparativo Direto</h4>
                            <Button variant="ghost" size="sm" onClick={handleRecalculate} disabled={saving} className="gap-2">
                                <Calculator className="w-4 h-4" /> Recalcular e salvar
                            </Button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                                <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Nº comparáveis</p>
                                <p className="text-lg font-black text-gray-800">{calc.stats.n}</p>
                            </div>
                            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                                <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Coef. de variação</p>
                                <p className="text-lg font-black text-gray-800">{calc.stats.coefficientOfVariation.toFixed(1)}%</p>
                            </div>
                            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                                <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Grau (indicativo)</p>
                                <p className="text-lg font-black text-gray-800">{selected.grau_fundamentacao ?? calc.grauFundamentacao}</p>
                            </div>
                            <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100 shadow-sm">
                                <p className="text-[10px] font-black text-blue-500 uppercase mb-1">Valor estimado</p>
                                <p className="text-lg font-black text-blue-900">{fmtBRL(selected.valor_estimado ?? calc.valorEstimado)}</p>
                            </div>
                        </div>
                        <p className="text-xs text-gray-400">
                            Intervalo de confiança (95%, aproximado): {fmtBRL(selected.valor_minimo ?? calc.valorMinimo)} a {fmtBRL(selected.valor_maximo ?? calc.valorMaximo)}.
                            O grau de fundamentação é uma estimativa indicativa — a classificação oficial (NBR 14653-2, Anexo A) deve ser validada pelo RT.
                        </p>
                    </div>
                )}

                {/* Modal editar dados do laudo */}
                <Modal open={!!editingReport} onClose={() => setEditingReport(null)} size="xl">
                    <ModalHeader title="Dados do Laudo" onClose={() => setEditingReport(null)} />
                    {editingReport && (
                        <ModalBody className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Título *</label>
                                <input type="text" value={editingReport.title} onChange={e => setEditingReport({ ...editingReport, title: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Finalidade</label>
                                    <select value={editingReport.finalidade} onChange={e => setEditingReport({ ...editingReport, finalidade: e.target.value as AppraisalFinalidade })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
                                        {Object.entries(APPRAISAL_FINALIDADE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Objetivo</label>
                                    <select value={editingReport.objetivo} onChange={e => setEditingReport({ ...editingReport, objetivo: e.target.value as AppraisalObjetivo })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
                                        {Object.entries(APPRAISAL_OBJETIVO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Metodologia</label>
                                    <select value={editingReport.metodologia} onChange={e => setEditingReport({ ...editingReport, metodologia: e.target.value as AppraisalMetodologia })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
                                        {Object.entries(APPRAISAL_METODOLOGIA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Solicitante</label>
                                    <input type="text" value={editingReport.client_name ?? ''} onChange={e => setEditingReport({ ...editingReport, client_name: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Status</label>
                                    <select value={editingReport.status} onChange={e => setEditingReport({ ...editingReport, status: e.target.value as AppraisalStatus })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
                                        {Object.entries(APPRAISAL_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                </div>
                            </div>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest pt-2">Imóvel avaliando</p>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Endereço</label>
                                    <input type="text" value={editingReport.property_address ?? ''} onChange={e => setEditingReport({ ...editingReport, property_address: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Tipo</label>
                                    <select value={editingReport.property_type ?? ''} onChange={e => setEditingReport({ ...editingReport, property_type: e.target.value as AppraisalPropertyType })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
                                        <option value="">Selecione...</option>
                                        {Object.entries(APPRAISAL_PROPERTY_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Cidade</label>
                                    <input type="text" value={editingReport.property_city ?? ''} onChange={e => setEditingReport({ ...editingReport, property_city: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">UF</label>
                                    <input type="text" maxLength={2} value={editingReport.property_state ?? ''} onChange={e => setEditingReport({ ...editingReport, property_state: e.target.value.toUpperCase() })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Data-base</label>
                                    <input type="date" value={editingReport.data_base} onChange={e => setEditingReport({ ...editingReport, data_base: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Área privativa (m²)</label>
                                    <input type="number" value={editingReport.property_area_privativa ?? ''} onChange={e => setEditingReport({ ...editingReport, property_area_privativa: parseFloat(e.target.value) || null })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Área total (m²)</label>
                                    <input type="number" value={editingReport.property_area_total ?? ''} onChange={e => setEditingReport({ ...editingReport, property_area_total: parseFloat(e.target.value) || null })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Descrição do imóvel</label>
                                <textarea rows={2} value={editingReport.property_description ?? ''} onChange={e => setEditingReport({ ...editingReport, property_description: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Diagnóstico do mercado</label>
                                <textarea rows={2} value={editingReport.diagnostico_mercado ?? ''} onChange={e => setEditingReport({ ...editingReport, diagnostico_mercado: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Pressupostos e ressalvas</label>
                                <textarea rows={2} value={editingReport.premissas_ressalvas ?? ''} onChange={e => setEditingReport({ ...editingReport, premissas_ressalvas: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none" />
                            </div>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest pt-2">Responsabilidade técnica</p>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Responsável técnico</label>
                                    <input type="text" value={editingReport.responsavel_tecnico ?? ''} onChange={e => setEditingReport({ ...editingReport, responsavel_tecnico: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">CREA/CAU</label>
                                    <input type="text" value={editingReport.crea_cau ?? ''} onChange={e => setEditingReport({ ...editingReport, crea_cau: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">ART/RRT nº</label>
                                    <input type="text" value={editingReport.art_numero ?? ''} onChange={e => setEditingReport({ ...editingReport, art_numero: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                                </div>
                            </div>
                        </ModalBody>
                    )}
                    <ModalFooter>
                        <Button variant="ghost" onClick={() => setEditingReport(null)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleSaveReport} disabled={saving || !editingReport?.title.trim()}>
                            {saving ? 'Salvando...' : 'Salvar'}
                        </Button>
                    </ModalFooter>
                </Modal>

                {/* Modal editar comparável */}
                <Modal open={!!editingComparable} onClose={() => setEditingComparable(null)} size="lg">
                    <ModalHeader title={editingComparable?.id ? 'Editar comparável' : 'Novo comparável'} onClose={() => setEditingComparable(null)} />
                    {editingComparable && (
                        <ModalBody className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Endereço *</label>
                                <input type="text" value={editingComparable.address} onChange={e => setEditingComparable({ ...editingComparable, address: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Fonte</label>
                                    <select value={editingComparable.source} onChange={e => setEditingComparable({ ...editingComparable, source: e.target.value as 'oferta' | 'venda' })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
                                        <option value="oferta">Oferta</option>
                                        <option value="venda">Venda</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Área (m²) *</label>
                                    <input type="number" value={editingComparable.area || ''} onChange={e => setEditingComparable({ ...editingComparable, area: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Preço total (R$) *</label>
                                    <input type="number" value={editingComparable.price_total || ''} onChange={e => setEditingComparable({ ...editingComparable, price_total: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                                </div>
                            </div>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest pt-2">Fatores de homogeneização (1,0 = sem ajuste)</p>
                            <div className="grid grid-cols-5 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Oferta</label>
                                    <input type="number" step="0.01" value={editingComparable.fator_oferta} onChange={e => setEditingComparable({ ...editingComparable, fator_oferta: parseFloat(e.target.value) || 1 })} className="w-full px-2 py-2 border border-gray-200 rounded-xl text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Localização</label>
                                    <input type="number" step="0.01" value={editingComparable.fator_localizacao} onChange={e => setEditingComparable({ ...editingComparable, fator_localizacao: parseFloat(e.target.value) || 1 })} className="w-full px-2 py-2 border border-gray-200 rounded-xl text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Área</label>
                                    <input type="number" step="0.01" value={editingComparable.fator_area} onChange={e => setEditingComparable({ ...editingComparable, fator_area: parseFloat(e.target.value) || 1 })} className="w-full px-2 py-2 border border-gray-200 rounded-xl text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Conservação</label>
                                    <input type="number" step="0.01" value={editingComparable.fator_estado_conservacao} onChange={e => setEditingComparable({ ...editingComparable, fator_estado_conservacao: parseFloat(e.target.value) || 1 })} className="w-full px-2 py-2 border border-gray-200 rounded-xl text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Outros</label>
                                    <input type="number" step="0.01" value={editingComparable.fator_outros} onChange={e => setEditingComparable({ ...editingComparable, fator_outros: parseFloat(e.target.value) || 1 })} className="w-full px-2 py-2 border border-gray-200 rounded-xl text-sm" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Distância (km)</label>
                                    <input type="number" step="0.1" value={editingComparable.distance_km ?? ''} onChange={e => setEditingComparable({ ...editingComparable, distance_km: parseFloat(e.target.value) || null })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Data de coleta</label>
                                    <input type="date" value={editingComparable.data_coleta ?? ''} onChange={e => setEditingComparable({ ...editingComparable, data_coleta: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Observações</label>
                                <textarea rows={2} value={editingComparable.notes ?? ''} onChange={e => setEditingComparable({ ...editingComparable, notes: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none" />
                            </div>
                        </ModalBody>
                    )}
                    <ModalFooter>
                        <Button variant="ghost" onClick={() => setEditingComparable(null)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleSaveComparable} disabled={saving || !editingComparable?.address.trim()}>
                            {saving ? 'Salvando...' : 'Salvar'}
                        </Button>
                    </ModalFooter>
                </Modal>
            </div>
        );
    }

    // ─── Lista de laudos ───
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">Laudos de Avaliação</h1>
                    <p className="text-sm text-gray-500 mt-1.5">Avaliação de imóveis conforme ABNT NBR 14653-2 — método comparativo direto de dados de mercado.</p>
                </div>
                <Button variant="primary" onClick={() => setEditingReport(emptyReport(organizationId, userEmail) as AppraisalReport)} className="gap-2">
                    <Plus className="w-4 h-4" /> Novo laudo
                </Button>
            </div>

            {loading ? (
                <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>
            ) : reports.length === 0 ? (
                <div className="text-center py-16 bg-gray-50 rounded-2xl">
                    <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-gray-400">Nenhum laudo de avaliação cadastrado</p>
                </div>
            ) : (
                <div className="border border-gray-100 rounded-3xl overflow-x-auto bg-white shadow-sm">
                    <table className="min-w-[820px] w-full text-left text-sm">
                        <thead className="bg-gray-50/80 text-gray-500 font-black uppercase tracking-wider text-xs border-b border-gray-100">
                            <tr>
                                <th className="p-4">Título</th>
                                <th className="p-4">Solicitante</th>
                                <th className="p-4">Status</th>
                                <th className="p-4">Valor estimado</th>
                                <th className="p-4">Data-base</th>
                                <th className="p-4"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {reports.map(r => (
                                <tr key={r.id} className="hover:bg-gray-50/30 cursor-pointer" onClick={() => openDetail(r)}>
                                    <td className="p-4 font-semibold text-gray-800">{r.title}</td>
                                    <td className="p-4 text-gray-600">{r.client_name || '—'}</td>
                                    <td className="p-4 text-gray-600">{APPRAISAL_STATUS_LABELS[r.status]}</td>
                                    <td className="p-4 text-gray-700 font-medium">{fmtBRL(r.valor_estimado)}</td>
                                    <td className="p-4 text-gray-500">{new Date(r.data_base + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                                            <button onClick={() => handleDeleteReport(r)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <Modal open={!!editingReport && !selected} onClose={() => setEditingReport(null)} size="lg">
                <ModalHeader title="Novo Laudo de Avaliação" onClose={() => setEditingReport(null)} />
                {editingReport && (
                    <ModalBody className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1.5">Título *</label>
                            <input type="text" value={editingReport.title} onChange={e => setEditingReport({ ...editingReport, title: e.target.value })} placeholder="Ex: Laudo de Avaliação — Apto 302, Ed. XYZ" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Finalidade</label>
                                <select value={editingReport.finalidade} onChange={e => setEditingReport({ ...editingReport, finalidade: e.target.value as AppraisalFinalidade })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
                                    {Object.entries(APPRAISAL_FINALIDADE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Solicitante</label>
                                <input type="text" value={editingReport.client_name ?? ''} onChange={e => setEditingReport({ ...editingReport, client_name: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                            </div>
                        </div>
                    </ModalBody>
                )}
                <ModalFooter>
                    <Button variant="ghost" onClick={() => setEditingReport(null)}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSaveReport} disabled={saving || !editingReport?.title.trim()}>
                        {saving ? 'Criando...' : 'Criar laudo'}
                    </Button>
                </ModalFooter>
            </Modal>
        </div>
    );
};

export default AppraisalModule;
