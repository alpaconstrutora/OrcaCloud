import React from 'react';
import { Plus, Trash2, Pencil, ShieldAlert, FileWarning, Paperclip, Upload, Download, ScanText, Sparkles } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/modal';
import Button from '../ui/Button';
import { useConfirm } from '../ui/confirm';
import {
    dueDiligenceService, DueDiligenceItem, DueDiligenceFinding, DueDiligenceCategory, DueDiligenceStatus, DueDiligenceCriticidade,
    DD_CATEGORY_LABELS, DD_STATUS_LABELS, DD_CRITICIDADE_LABELS,
} from '../../services/dueDiligenceService';

interface Props {
    opportunityId: string;
    organizationId: string;
    userEmail?: string;
}

const CATEGORIES: DueDiligenceCategory[] = ['imovel', 'proprietario', 'tecnica', 'ambiental'];
const CRITICIDADE_COLOR: Record<DueDiligenceCriticidade, string> = {
    baixa: 'text-gray-500',
    media: 'text-blue-600',
    alta: 'text-amber-600',
    critica: 'text-red-600',
};

const emptyItem = (organizationId: string, opportunityId: string): Omit<DueDiligenceItem, 'id'> => ({
    organization_id: organizationId,
    opportunity_id: opportunityId,
    category: 'imovel',
    title: '',
    status: 'pendente',
    criticidade: 'media',
});

const DueDiligencePanel: React.FC<Props> = ({ opportunityId, organizationId, userEmail }) => {
    const confirm = useConfirm();
    const [items, setItems] = React.useState<DueDiligenceItem[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [editing, setEditing] = React.useState<DueDiligenceItem | null>(null);
    const [saving, setSaving] = React.useState(false);
    const [findingsFor, setFindingsFor] = React.useState<DueDiligenceItem | null>(null);
    const [findings, setFindings] = React.useState<DueDiligenceFinding[]>([]);
    const [findingUrls, setFindingUrls] = React.useState<Record<string, string>>({});
    const [uploading, setUploading] = React.useState(false);
    const [readingMatricula, setReadingMatricula] = React.useState(false);

    const load = React.useCallback(() => {
        setLoading(true);
        dueDiligenceService.listItems(opportunityId)
            .then(setItems)
            .catch(err => console.error('Erro ao carregar due diligence', err))
            .finally(() => setLoading(false));
    }, [opportunityId]);

    React.useEffect(() => { load(); }, [load]);

    const handleSave = async () => {
        if (!editing || !editing.title.trim()) return;
        setSaving(true);
        try {
            const isCompleting = ['conforme', 'inconforme', 'nao_aplicavel'].includes(editing.status) && !editing.completed_at;
            await dueDiligenceService.saveItem({
                ...editing,
                completed_at: isCompleting ? new Date().toISOString() : editing.completed_at,
                completed_by: isCompleting ? (userEmail ?? editing.completed_by) : editing.completed_by,
            });
            setEditing(null);
            load();
        } catch (err) {
            console.error('Erro ao salvar item de due diligence', err);
            alert('Erro ao salvar. Tente novamente.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (item: DueDiligenceItem) => {
        if (!item.id) return;
        const ok = await confirm({ title: 'Excluir item de due diligence?', message: item.title, variant: 'danger' });
        if (!ok) return;
        await dueDiligenceService.deleteItem(item.id);
        load();
    };

    const openFindings = async (item: DueDiligenceItem) => {
        if (!item.id) return;
        setFindingsFor(item);
        const list = await dueDiligenceService.listFindings(item.id);
        setFindings(list);
        const urls: Record<string, string> = {};
        await Promise.all(list.map(async f => {
            if (f.evidence_url) {
                try { urls[f.id!] = await dueDiligenceService.getFindingSignedUrl(f.evidence_url); } catch { /* ignora */ }
            }
        }));
        setFindingUrls(urls);
    };

    const handleUploadFinding = async (file: File) => {
        if (!findingsFor?.id) return;
        setUploading(true);
        try {
            const path = await dueDiligenceService.uploadFindingFile(file, organizationId);
            await dueDiligenceService.addFinding({
                organization_id: organizationId,
                item_id: findingsFor.id,
                document_ref: file.name,
                evidence_url: path,
                author_email: userEmail ?? 'desconhecido',
            });
            const list = await dueDiligenceService.listFindings(findingsFor.id);
            setFindings(list);
            const url = await dueDiligenceService.getFindingSignedUrl(path);
            setFindingUrls(prev => ({ ...prev, [list[0]?.id ?? '']: url }));
        } catch (err) {
            console.error('Erro ao anexar evidência', err);
            alert('Erro ao anexar arquivo. Tente novamente.');
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteFinding = async (finding: DueDiligenceFinding) => {
        if (!finding.id) return;
        const ok = await confirm({ title: 'Excluir evidência?', message: finding.document_ref ?? undefined, variant: 'danger' });
        if (!ok) return;
        await dueDiligenceService.deleteFinding(finding.id);
        setFindings(prev => prev.filter(f => f.id !== finding.id));
    };

    const handleReadMatricula = async (file: File) => {
        setReadingMatricula(true);
        try {
            const { created, extraction } = await dueDiligenceService.readMatricula(organizationId, opportunityId, file);
            load();
            const donos = extraction.proprietarios_atuais?.length ? `\nProprietários atuais: ${extraction.proprietarios_atuais.join(', ')}` : '';
            alert(`${created.length} item(ns) de due diligence pré-preenchido(s) a partir da matrícula.${donos}\n\nRevise cada item — a IA não valida juridicamente; o veredito é do responsável técnico.`);
        } catch (err) {
            console.error('Erro ao ler matrícula', err);
            alert(`Erro ao ler a matrícula: ${err instanceof Error ? err.message : 'tente novamente'}`);
        } finally {
            setReadingMatricula(false);
        }
    };

    const blocking = dueDiligenceService.hasBlockingPendencies(items);
    const byCategory = CATEGORIES.map(cat => ({
        category: cat,
        items: items.filter(i => i.category === cat),
    }));

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider">Due Diligence da Aquisição</h4>
                    <p className="text-xs text-gray-500 mt-1">Matriz de pendências — imóvel, proprietário, técnica e ambiental.</p>
                </div>
                <div className="flex items-center gap-2">
                    <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold cursor-pointer border transition-colors ${readingMatricula ? 'border-gray-200 text-gray-400' : 'border-blue-200 text-blue-700 hover:bg-blue-50'}`}>
                        <ScanText className="w-4 h-4" />
                        {readingMatricula ? 'Lendo matrícula...' : 'Ler matrícula (IA)'}
                        <input
                            type="file"
                            accept="application/pdf,image/*"
                            className="hidden"
                            disabled={readingMatricula}
                            onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handleReadMatricula(file);
                                e.target.value = '';
                            }}
                        />
                    </label>
                    <Button variant="primary" size="sm" onClick={() => setEditing(emptyItem(organizationId, opportunityId) as DueDiligenceItem)} className="gap-2">
                        <Plus className="w-4 h-4" /> Novo item
                    </Button>
                </div>
            </div>

            {blocking && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700 font-semibold">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    Há pendências críticas/altas ainda não resolvidas — o avanço de gate deve ser bloqueado ou justificado por exceção.
                </div>
            )}

            {loading ? (
                <p className="text-sm text-gray-400 text-center py-8">Carregando...</p>
            ) : items.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-2xl">
                    <FileWarning className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-gray-400">Nenhum item de due diligence cadastrado</p>
                </div>
            ) : (
                byCategory.filter(g => g.items.length > 0).map(group => (
                    <div key={group.category}>
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">{DD_CATEGORY_LABELS[group.category]}</p>
                        <div className="border border-gray-100 rounded-3xl overflow-x-auto bg-white shadow-sm">
                            <table className="min-w-[720px] w-full text-left text-sm">
                                <thead className="bg-gray-50/80 text-gray-500 font-black uppercase tracking-wider text-xs border-b border-gray-100">
                                    <tr>
                                        <th className="p-4">Item</th>
                                        <th className="p-4">Status</th>
                                        <th className="p-4">Criticidade</th>
                                        <th className="p-4">Responsável</th>
                                        <th className="p-4">Prazo</th>
                                        <th className="p-4"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {group.items.map(item => (
                                        <tr key={item.id} className="hover:bg-gray-50/30">
                                            <td className="p-4 font-semibold text-gray-800">
                                                <span className="flex items-center gap-2">
                                                    {item.title}
                                                    {item.ai_extracted && (
                                                        <span
                                                            className="inline-flex items-center gap-1 text-xs text-blue-600"
                                                            title={item.ai_confidence != null ? `Extraído por IA — confiança ${(item.ai_confidence * 100).toFixed(0)}%. Requer validação do RT.` : 'Extraído por IA. Requer validação do RT.'}
                                                        >
                                                            <Sparkles className="w-3 h-3" />
                                                            IA{item.ai_confidence != null ? ` ${(item.ai_confidence * 100).toFixed(0)}%` : ''}
                                                        </span>
                                                    )}
                                                </span>
                                            </td>
                                            <td className="p-4 text-gray-600">{DD_STATUS_LABELS[item.status]}</td>
                                            <td className={`p-4 font-semibold ${CRITICIDADE_COLOR[item.criticidade]}`}>{DD_CRITICIDADE_LABELS[item.criticidade]}</td>
                                            <td className="p-4 text-gray-500">{item.responsavel_email || '—'}</td>
                                            <td className="p-4 text-gray-500">{item.due_date ? new Date(item.due_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-1 justify-end">
                                                    <button onClick={() => openFindings(item)} className="p-1.5 hover:bg-gray-100 rounded-lg" title="Evidências"><Paperclip className="w-3.5 h-3.5 text-gray-500" /></button>
                                                    <button onClick={() => setEditing(item)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Pencil className="w-3.5 h-3.5 text-gray-500" /></button>
                                                    <button onClick={() => handleDelete(item)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))
            )}

            <Modal open={!!editing} onClose={() => setEditing(null)} size="lg">
                <ModalHeader title={editing?.id ? 'Editar item' : 'Novo item de due diligence'} onClose={() => setEditing(null)} />
                {editing && (
                    <ModalBody className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Categoria</label>
                                <select
                                    value={editing.category}
                                    onChange={e => setEditing({ ...editing, category: e.target.value as DueDiligenceCategory })}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                                >
                                    {CATEGORIES.map(c => <option key={c} value={c}>{DD_CATEGORY_LABELS[c]}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Criticidade</label>
                                <select
                                    value={editing.criticidade}
                                    onChange={e => setEditing({ ...editing, criticidade: e.target.value as DueDiligenceCriticidade })}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                                >
                                    {(['baixa', 'media', 'alta', 'critica'] as DueDiligenceCriticidade[]).map(c => <option key={c} value={c}>{DD_CRITICIDADE_LABELS[c]}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1.5">Título *</label>
                            <input
                                type="text"
                                value={editing.title}
                                onChange={e => setEditing({ ...editing, title: e.target.value })}
                                placeholder="Ex: Certidão de ônus reais atualizada"
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1.5">Descrição</label>
                            <textarea
                                rows={2}
                                value={editing.description ?? ''}
                                onChange={e => setEditing({ ...editing, description: e.target.value })}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none"
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Status</label>
                                <select
                                    value={editing.status}
                                    onChange={e => setEditing({ ...editing, status: e.target.value as DueDiligenceStatus })}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                                >
                                    {(['pendente', 'em_analise', 'conforme', 'inconforme', 'nao_aplicavel'] as DueDiligenceStatus[]).map(s => <option key={s} value={s}>{DD_STATUS_LABELS[s]}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Responsável (e-mail)</label>
                                <input
                                    type="email"
                                    value={editing.responsavel_email ?? ''}
                                    onChange={e => setEditing({ ...editing, responsavel_email: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Prazo</label>
                                <input
                                    type="date"
                                    value={editing.due_date ?? ''}
                                    onChange={e => setEditing({ ...editing, due_date: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Impacto</label>
                                <textarea rows={2} value={editing.impacto ?? ''} onChange={e => setEditing({ ...editing, impacto: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Mitigação</label>
                                <textarea rows={2} value={editing.mitigacao ?? ''} onChange={e => setEditing({ ...editing, mitigacao: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1.5">Condição para aprovação</label>
                            <input
                                type="text"
                                value={editing.condicao_aprovacao ?? ''}
                                onChange={e => setEditing({ ...editing, condicao_aprovacao: e.target.value })}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                        {editing.ai_extracted && editing.ai_source_excerpt && (
                            <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3">
                                <p className="text-xs font-bold text-blue-700 flex items-center gap-1.5 mb-1.5">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    Trecho de origem na matrícula {editing.ai_confidence != null ? `(confiança ${(editing.ai_confidence * 100).toFixed(0)}%)` : ''}
                                </p>
                                <p className="text-xs text-gray-600 italic whitespace-pre-line">"{editing.ai_source_excerpt}"</p>
                                <p className="text-[11px] text-blue-600/70 mt-2">Confira este trecho contra o documento original — a IA não substitui a validação jurídica.</p>
                            </div>
                        )}
                    </ModalBody>
                )}
                <ModalFooter>
                    <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSave} disabled={saving || !editing?.title.trim()}>
                        {saving ? 'Salvando...' : 'Salvar'}
                    </Button>
                </ModalFooter>
            </Modal>

            <Modal open={!!findingsFor} onClose={() => setFindingsFor(null)} size="lg">
                <ModalHeader title="Evidências" description={findingsFor?.title} onClose={() => setFindingsFor(null)} />
                <ModalBody className="space-y-4">
                    <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-2xl p-6 cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors">
                        <Upload className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-semibold text-gray-500">{uploading ? 'Enviando...' : 'Clique para anexar um arquivo'}</span>
                        <input
                            type="file"
                            className="hidden"
                            disabled={uploading}
                            onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadFinding(file);
                                e.target.value = '';
                            }}
                        />
                    </label>
                    {findings.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">Nenhuma evidência anexada</p>
                    ) : (
                        <div className="space-y-2">
                            {findings.map(f => (
                                <div key={f.id} className="flex items-center justify-between p-3 bg-gray-50/50 border border-gray-100 rounded-xl">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-gray-800 truncate">{f.document_ref || 'Arquivo'}</p>
                                        <p className="text-xs text-gray-400">{f.author_email} — {f.created_at ? new Date(f.created_at).toLocaleDateString('pt-BR') : ''}</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {f.id && findingUrls[f.id] && (
                                            <a href={findingUrls[f.id]} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-gray-100 rounded-lg">
                                                <Download className="w-3.5 h-3.5 text-gray-500" />
                                            </a>
                                        )}
                                        <button onClick={() => handleDeleteFinding(f)} className="p-1.5 hover:bg-red-50 rounded-lg">
                                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ModalBody>
            </Modal>
        </div>
    );
};

export default DueDiligencePanel;
