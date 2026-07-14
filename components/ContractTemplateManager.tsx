import React, { useEffect, useState, useCallback } from 'react';
import {
    FileText, Plus, Eye, EyeOff,
    ChevronLeft, Variable, Save,
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import {
    contractTemplateService, ContractTemplate, TEMPLATE_VARIABLES, renderTemplate,
} from '../services/contractTemplateService';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader } from './ui/TableUtils';
import Button from './ui/Button';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from './ui/sheet';
import { useConfirm } from './ui/confirm';

const CONTRACT_TEMPLATE_COLUMNS: ColumnConfig[] = [
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'type', label: 'Tipo', sortable: true },
    { key: 'variables', label: 'Variáveis', sortable: false },
    { key: 'version', label: 'Versão', sortable: true },
];

interface Props {
    organizationId: string;
    open: boolean;
    onClose: () => void;
}

const EMPTY_BODY = `<h2>CONTRATO DE {{TIPO}}</h2>

<p>Pelo presente instrumento, as partes abaixo qualificadas celebram o presente contrato nos seguintes termos:</p>

<h3>1. DAS PARTES</h3>
<p><strong>CONTRATANTE:</strong> [nome da empresa]</p>
<p><strong>CONTRATADO:</strong> {{CLIENTE}}</p>

<h3>2. DO OBJETO</h3>
<p>{{TITULO}}</p>
<p>Referente à obra: {{OBRA}}</p>

<h3>3. DO VALOR</h3>
<p>O valor total deste contrato é de <strong>{{VALOR_TOTAL}}</strong>.</p>

<h3>4. DO PRAZO</h3>
<p>Vigência: de {{DATA_INICIO}} a {{DATA_FIM}} ({{PRAZO_DIAS}} dias corridos).</p>

<h3>5. DO REAJUSTE</h3>
<p>O valor será reajustado pelo índice {{INDICE_REAJUSTE}}.</p>

<h3>6. DA RETENÇÃO</h3>
<p>Será retida {{RETENCAO_PCT}}% do valor de cada medição.</p>

<p style="margin-top: 40px;">{{OBRA}}, {{DATA_HOJE}}</p>
<p>Contrato nº {{NUMERO}}</p>
`;

const ContractTemplateManager: React.FC<Props> = ({ organizationId, open, onClose }) => {
    const confirm = useConfirm();
    const [templates, setTemplates] = useState<ContractTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<ContractTemplate | null>(null);
    const [isNew, setIsNew] = useState(false);
    const [busy, setBusy] = useState(false);
    const [previewMode, setPreviewMode] = useState(false);
    const [notification, setNotification] = useState<string | null>(null);
    const tableColumns = useTableColumns(CONTRACT_TEMPLATE_COLUMNS, 'contractTemplateColumns');

    const sortedTemplates = React.useMemo(() => {
        if (!tableColumns.sortColumn) return templates;
        const col = tableColumns.sortColumn;
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        return [...templates].sort((a, b) => {
            if (col === 'name') return a.name.localeCompare(b.name) * dir;
            if (col === 'type') return (a.contract_type || '').localeCompare(b.contract_type || '') * dir;
            if (col === 'version') return (a.version - b.version) * dir;
            return 0;
        });
    }, [templates, tableColumns.sortColumn, tableColumns.sortDirection]);

    // form state
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [contractType, setContractType] = useState('');
    const [bodyHtml, setBodyHtml] = useState(EMPTY_BODY);

    const notify = (msg: string) => { setNotification(msg); setTimeout(() => setNotification(null), 3500); };

    const load = useCallback(async () => {
        setLoading(true);
        try { setTemplates(await contractTemplateService.list(organizationId)); }
        finally { setLoading(false); }
    }, [organizationId]);

    useEffect(() => { if (open) load(); }, [open, load]);

    const openNew = () => {
        setEditing(null); setIsNew(true);
        setName(''); setDescription(''); setContractType(''); setBodyHtml(EMPTY_BODY);
    };

    const openEdit = (t: ContractTemplate) => {
        setEditing(t); setIsNew(false);
        setName(t.name); setDescription(t.description ?? ''); setContractType(t.contract_type ?? ''); setBodyHtml(t.body_html);
    };

    const closeEditor = () => { setEditing(null); setIsNew(false); setPreviewMode(false); };

    const handleSave = async () => {
        if (!name.trim()) return;
        setBusy(true);
        try {
            const vars = TEMPLATE_VARIABLES.filter(v => bodyHtml.includes(`{{${v.key}}}`)).map(v => v.key);
            await contractTemplateService.save(organizationId, editing?.id ?? null, {
                name: name.trim(), description: description.trim() || undefined,
                contract_type: contractType || undefined, body_html: bodyHtml, variables: vars,
            });
            notify('Template salvo com sucesso.');
            closeEditor();
            load();
        } catch (e) {
            notify(`Erro: ${e instanceof Error ? e.message : 'Tente novamente.'}`);
        } finally { setBusy(false); }
    };

    const handleDeactivate = async (id: string) => {
        const ok = await confirm({
            title: 'Desativar template?',
            message: 'O template deixa de aparecer para novos contratos, mas contratos já emitidos com ele não são afetados.',
            variant: 'warning',
            confirmLabel: 'Desativar',
        });
        if (!ok) return;
        await contractTemplateService.deactivate(id);
        notify('Template desativado.');
        load();
    };

    const insertVar = (key: string) => {
        setBodyHtml(prev => prev + `{{${key}}}`);
    };

    const detectedVars = TEMPLATE_VARIABLES.filter(v => bodyHtml.includes(`{{${v.key}}}`));
    const isEditing = editing || isNew;

    // ── Editor ────────────────────────────────────────────────────────────────
    const editorContent = isEditing && (() => {
        const previewContent = renderTemplate(bodyHtml, Object.fromEntries(
            TEMPLATE_VARIABLES.map(v => [v.key, `[${v.label}]`])
        ));

        return (
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <button onClick={closeEditor} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 font-medium">
                        <ChevronLeft size={16} /> Voltar
                    </button>
                    <div className="flex-1" />
                    <button onClick={() => setPreviewMode(p => !p)}
                        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200">
                        {previewMode ? <EyeOff size={14} /> : <Eye size={14} />}
                        {previewMode ? 'Editar' : 'Preview'}
                    </button>
                    <Button onClick={handleSave} disabled={busy || !name.trim()}
                        className="gap-2">
                        <Save size={14} /> {busy ? 'Salvando…' : 'Salvar'}
                    </Button>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    {/* Formulário principal */}
                    <div className="col-span-2 space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-form-label font-medium text-gray-500 mb-1">Nome *</label>
                                <input value={name} onChange={e => setName(e.target.value)}
                                    placeholder="ex: Contrato de Empreitada Padrão"
                                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-form-label font-medium text-gray-500 mb-1">Tipo de contrato</label>
                                <select value={contractType} onChange={e => setContractType(e.target.value)}
                                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="">Todos</option>
                                    {['Empreitada Global', 'Preço Unitário', 'Administração', 'Subempreitada', 'Outros'].map(t =>
                                        <option key={t} value={t}>{t}</option>
                                    )}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-form-label font-medium text-gray-500 mb-1">Descrição</label>
                            <input value={description} onChange={e => setDescription(e.target.value)}
                                placeholder="Uso interno para identificar o template"
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>

                        {/* Editor / Preview */}
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-form-label font-medium text-gray-500">
                                    {previewMode ? 'Preview (variáveis substituídas por exemplo)' : 'Conteúdo HTML — use {{VARIAVEL}} para substituição dinâmica'}
                                </label>
                            </div>
                            {previewMode ? (
                                <div
                                    className="min-h-[480px] p-5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 overflow-auto prose prose-sm max-w-none"
                                    dangerouslySetInnerHTML={{ __html: previewContent }}
                                />
                            ) : (
                                <textarea
                                    value={bodyHtml}
                                    onChange={e => setBodyHtml(e.target.value)}
                                    rows={24}
                                    spellCheck={false}
                                    className="w-full font-mono text-form-input rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                />
                            )}
                        </div>
                    </div>

                    {/* Sidebar: variáveis */}
                    <div className="space-y-4">
                        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                                <Variable size={13} /> Variáveis disponíveis
                            </p>
                            <p className="text-xs text-gray-400">Clique para inserir no editor.</p>
                            <div className="space-y-1 max-h-64 overflow-y-auto">
                                {TEMPLATE_VARIABLES.map(v => (
                                    <button key={v.key} onClick={() => insertVar(v.key)}
                                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition-colors flex items-center justify-between group ${
                                            bodyHtml.includes(`{{${v.key}}}`)
                                                ? 'bg-blue-50 text-blue-700'
                                                : 'hover:bg-gray-50 text-gray-600'
                                        }`}>
                                        <span className="font-mono">{`{{${v.key}}}`}</span>
                                        <span className="text-gray-400 group-hover:text-gray-600 text-xs truncate max-w-[80px]">{v.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {detectedVars.length > 0 && (
                            <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4">
                                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">
                                    {detectedVars.length} variável(is) no template
                                </p>
                                {detectedVars.map(v => (
                                    <p key={v.key} className="text-xs text-emerald-600">✓ {v.label}</p>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    })();

    // ── Lista ─────────────────────────────────────────────────────────────────
    const listContent = (
        <div className="space-y-5">
            <div className="flex items-center justify-end gap-2">
                <ColumnConfigButton
                    columns={CONTRACT_TEMPLATE_COLUMNS}
                    visibleColumns={tableColumns.visibleColumns}
                    showColumnConfig={tableColumns.showColumnConfig}
                    onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                    onToggleColumn={tableColumns.toggleColumn}
                    onReset={tableColumns.resetColumns}
                />
                <Button onClick={openNew} className="gap-2">
                    <Plus size={15} /> Novo Template
                </Button>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="space-y-px">
                        {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-50 animate-pulse" />)}
                    </div>
                ) : templates.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
                        <FileText size={32} strokeWidth={1} />
                        <p className="text-sm">Nenhum template criado ainda.</p>
                        <button onClick={openNew} className="text-sm text-blue-600 hover:underline">Criar primeiro template</button>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                {tableColumns.visibleColumns.includes('name') && (
                                    <SortableHeader label="Nome" colKey="name" sortable={true} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="text-left px-4 py-3" />
                                )}
                                {tableColumns.visibleColumns.includes('type') && (
                                    <SortableHeader label="Tipo" colKey="type" sortable={true} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="text-left px-4 py-3" />
                                )}
                                {tableColumns.visibleColumns.includes('variables') && (
                                    <SortableHeader label="Variáveis" colKey="variables" sortable={false} className="text-left px-4 py-3" />
                                )}
                                {tableColumns.visibleColumns.includes('version') && (
                                    <SortableHeader label="Versão" colKey="version" sortable={true} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="text-left px-4 py-3" />
                                )}
                                <th className="w-24" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {sortedTemplates.map(t => (
                                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                                    {tableColumns.visibleColumns.includes('name') && (
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-gray-900">{t.name}</p>
                                            {t.description && <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>}
                                        </td>
                                    )}
                                    {tableColumns.visibleColumns.includes('type') && (
                                        <td className="px-4 py-3 text-gray-500 text-table-body">{t.contract_type || '—'}</td>
                                    )}
                                    {tableColumns.visibleColumns.includes('variables') && (
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap gap-1">
                                                {(t.variables ?? []).slice(0, 4).map(v => (
                                                    <span key={v} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                                                        {`{{${v}}}`}
                                                    </span>
                                                ))}
                                                {(t.variables ?? []).length > 4 && (
                                                    <span className="text-xs text-gray-400">+{(t.variables ?? []).length - 4}</span>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                    {tableColumns.visibleColumns.includes('version') && (
                                        <td className="px-4 py-3 text-table-body text-gray-400">v{t.version}</td>
                                    )}
                                    <td className="px-4 py-3">
                                        <div className="flex gap-1.5 justify-end">
                                            <ActionIconButton kind="edit" size="sm" onClick={() => openEdit(t)} />
                                            <ActionIconButton kind="delete" size="sm" title="Desativar" onClick={() => handleDeactivate(t.id)} />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );

    return (
        <Sheet open={open} onClose={onClose} size={isEditing ? 'full' : 'lg'}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>
                    {isNew ? 'Novo Template' : editing ? `Editar: ${editing.name}` : 'Templates de Contrato'}
                </SheetTitle>
                <SheetDescription>Modelos reutilizáveis para emissão de contratos.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-6">
                {isEditing ? editorContent : listContent}
            </SheetPanel>
            {notification && (
                <div className="fixed bottom-6 right-6 z-[60] bg-gray-900 text-white px-4 py-3 rounded-xl text-sm shadow-lg">
                    {notification}
                </div>
            )}
        </Sheet>
    );
};

export default ContractTemplateManager;
