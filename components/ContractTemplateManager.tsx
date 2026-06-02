import React, { useEffect, useState, useCallback } from 'react';
import {
    FileText, Plus, Edit2, Trash2, Copy, Eye, EyeOff,
    ChevronLeft, Tag, Variable, Save, X, AlertCircle,
} from 'lucide-react';
import {
    contractTemplateService, ContractTemplate, TEMPLATE_VARIABLES, renderTemplate,
} from '../services/contractTemplateService';

interface Props {
    organizationId: string;
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

const ContractTemplateManager: React.FC<Props> = ({ organizationId }) => {
    const [templates, setTemplates] = useState<ContractTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<ContractTemplate | null>(null);
    const [isNew, setIsNew] = useState(false);
    const [busy, setBusy] = useState(false);
    const [previewMode, setPreviewMode] = useState(false);
    const [notification, setNotification] = useState<string | null>(null);

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

    useEffect(() => { load(); }, [load]);

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
        if (!confirm('Desativar este template?')) return;
        await contractTemplateService.deactivate(id);
        notify('Template desativado.');
        load();
    };

    const insertVar = (key: string) => {
        setBodyHtml(prev => prev + `{{${key}}}`);
    };

    const detectedVars = TEMPLATE_VARIABLES.filter(v => bodyHtml.includes(`{{${v.key}}}`));

    // ── Editor ────────────────────────────────────────────────────────────────
    if (editing || isNew) {
        const previewContent = renderTemplate(bodyHtml, Object.fromEntries(
            TEMPLATE_VARIABLES.map(v => [v.key, `[${v.label}]`])
        ));

        return (
            <div className="p-6 space-y-4 max-w-4xl mx-auto">
                {notification && (
                    <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white px-4 py-3 rounded-xl text-sm shadow-lg">
                        {notification}
                    </div>
                )}
                <div className="flex items-center gap-3">
                    <button onClick={closeEditor} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                        <ChevronLeft size={20} />
                    </button>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex-1">
                        {isNew ? 'Novo Template' : `Editar: ${editing?.name}`}
                    </h2>
                    <button onClick={() => setPreviewMode(p => !p)}
                        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600">
                        {previewMode ? <EyeOff size={14} /> : <Eye size={14} />}
                        {previewMode ? 'Editar' : 'Preview'}
                    </button>
                    <button onClick={handleSave} disabled={busy || !name.trim()}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                        <Save size={14} /> {busy ? 'Salvando…' : 'Salvar'}
                    </button>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    {/* Formulário principal */}
                    <div className="col-span-2 space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Nome *</label>
                                <input value={name} onChange={e => setName(e.target.value)}
                                    placeholder="ex: Contrato de Empreitada Padrão"
                                    className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Tipo de contrato</label>
                                <select value={contractType} onChange={e => setContractType(e.target.value)}
                                    className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="">Todos</option>
                                    {['Empreitada Global', 'Preço Unitário', 'Administração', 'Subempreitada', 'Outros'].map(t =>
                                        <option key={t} value={t}>{t}</option>
                                    )}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Descrição</label>
                            <input value={description} onChange={e => setDescription(e.target.value)}
                                placeholder="Uso interno para identificar o template"
                                className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>

                        {/* Editor / Preview */}
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-medium text-gray-500">
                                    {previewMode ? 'Preview (variáveis substituídas por exemplo)' : 'Conteúdo HTML — use {{VARIAVEL}} para substituição dinâmica'}
                                </label>
                            </div>
                            {previewMode ? (
                                <div
                                    className="min-h-[480px] p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-800 dark:text-gray-200 overflow-auto prose prose-sm max-w-none"
                                    dangerouslySetInnerHTML={{ __html: previewContent }}
                                />
                            ) : (
                                <textarea
                                    value={bodyHtml}
                                    onChange={e => setBodyHtml(e.target.value)}
                                    rows={24}
                                    spellCheck={false}
                                    className="w-full font-mono text-xs rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-3 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                />
                            )}
                        </div>
                    </div>

                    {/* Sidebar: variáveis */}
                    <div className="space-y-4">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                                <Variable size={13} /> Variáveis disponíveis
                            </p>
                            <p className="text-[11px] text-gray-400">Clique para inserir no editor.</p>
                            <div className="space-y-1 max-h-64 overflow-y-auto">
                                {TEMPLATE_VARIABLES.map(v => (
                                    <button key={v.key} onClick={() => insertVar(v.key)}
                                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition-colors flex items-center justify-between group ${
                                            bodyHtml.includes(`{{${v.key}}}`)
                                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
                                        }`}>
                                        <span className="font-mono">{`{{${v.key}}}`}</span>
                                        <span className="text-gray-400 group-hover:text-gray-600 text-[10px] truncate max-w-[80px]">{v.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {detectedVars.length > 0 && (
                            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-800 p-4">
                                <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-2">
                                    {detectedVars.length} variável(is) no template
                                </p>
                                {detectedVars.map(v => (
                                    <p key={v.key} className="text-[11px] text-emerald-600 dark:text-emerald-300">✓ {v.label}</p>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── Lista ─────────────────────────────────────────────────────────────────
    return (
        <div className="p-6 space-y-5 max-w-4xl mx-auto">
            {notification && (
                <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white px-4 py-3 rounded-xl text-sm shadow-lg">
                    {notification}
                </div>
            )}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Templates de Contrato</h2>
                <button onClick={openNew}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
                    <Plus size={15} /> Novo Template
                </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                {loading ? (
                    <div className="space-y-px">
                        {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-50 dark:bg-gray-700/50 animate-pulse" />)}
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
                            <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
                                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Variáveis</th>
                                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Versão</th>
                                <th className="w-24" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                            {templates.map(t => (
                                <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-gray-900 dark:text-white">{t.name}</p>
                                        {t.description && <p className="text-[11px] text-gray-400 mt-0.5">{t.description}</p>}
                                    </td>
                                    <td className="px-4 py-3 text-gray-500 text-xs">{t.contract_type || '—'}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-wrap gap-1">
                                            {(t.variables ?? []).slice(0, 4).map(v => (
                                                <span key={v} className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded font-mono">
                                                    {`{{${v}}}`}
                                                </span>
                                            ))}
                                            {(t.variables ?? []).length > 4 && (
                                                <span className="text-[10px] text-gray-400">+{(t.variables ?? []).length - 4}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-gray-400">v{t.version}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-1 justify-end">
                                            <button onClick={() => openEdit(t)}
                                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                                                <Edit2 size={14} />
                                            </button>
                                            <button onClick={() => handleDeactivate(t.id)}
                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                                                <Trash2 size={14} />
                                            </button>
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
};

export default ContractTemplateManager;
