import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    FileText, Upload, Plus, Loader2, Save, AlertCircle, Link2, Search, MoveHorizontal, ArrowLeft,
} from 'lucide-react';
import {
    documentTemplateService, DocumentTemplate,
} from '../services/documentTemplateService';
import { detectTokens } from '../services/docxRenderService';
import { FIELD_GROUPS, TokenMap, TokenMapping } from '../services/docxFieldCatalog';
import { organizationService } from '../services/organizationService';
import { useOrgContext } from '../hooks/useOrgContext';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useScrollAoTopo } from '../hooks/useScrollAoTopo';
import { supabase } from '../lib/supabase';
import {
    ColumnConfig, useTableColumns, useResizableColumns, ColumnConfigButton, SortableHeader, usePersistedState,
} from './ui/TableUtils';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';
import SaveStatus from './ui/SaveStatus';

/**
 * "Modelos de documento" — TELA, não overlay.
 *
 * Renderiza in-flow: sem `fixed`, sem `absolute`, sem backdrop e sem `Sheet`.
 * Quem monta troca o próprio conteúdo por esta tela e volta pelo `onClose`,
 * exatamente como Suprimentos › Contratos faz com o `ContractDetailView`.
 * O cabeçalho (seta "voltar" + `h1 text-2xl`) é o mesmo daquela tela.
 *
 * Não declara gutter horizontal: o `p-4 md:p-6` do `<main>` do Layout (§20.2)
 * já é o da tela. Quem monta fora do `<main>` é que precisa repetir o padding.
 */
interface Props {
    organizationId: string;
    onClose: () => void;
}

type Draft = {
    id: string | null;
    name: string;
    description: string;
    file: File | null;          // arquivo novo (obrigatório ao criar)
    detectedTokens: string[];
    tokenMap: TokenMap;
};

const EMPTY_DRAFT: Draft = {
    id: null, name: '', description: '', file: null, detectedTokens: [], tokenMap: {},
};

// §2 — colunas de dado. "Ações" não entra aqui: é estrutural e sempre visível
// (§9), então não aparece no seletor de colunas nem pode ser escondida.
const COLUMNS: ColumnConfig[] = [
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'description', label: 'Descrição', sortable: true },
    { key: 'file', label: 'Arquivo', sortable: true },
    // A célula mostra "mapeados/total"; a ordenação usa a quantidade de
    // marcadores JÁ MAPEADOS, que é o que interessa procurar (§6.3).
    { key: 'tokens', label: 'Marcadores', sortable: true },
    { key: 'updated_at', label: 'Atualizado em', sortable: true },
    { key: 'created_at', label: 'Criado em', sortable: true },
];

// A soma tem de caber na área de conteúdo do app (~1290px com a sidebar aberta),
// senão a tabela nasce com barra de rolagem horizontal parada. 240+260+200+130+
// 130+130+90 = 1180: sobra folga para o `<col />` espaçador da §6.1.1 absorver.
const DEFAULT_COL_WIDTHS: Record<string, number> = {
    name: 240, description: 260, file: 200, tokens: 130, updated_at: 130, created_at: 130, actions: 90,
};

// §6.6 — tabela de página inteira: `px-6` em toda célula e todo cabeçalho.
// (A régua `px-3`/`px-4` da §6.9 valia enquanto isto era painel lateral; como
// tela, a largura deixou de ser o recurso escasso.) `overflow-hidden` é
// exigência do §6.1 para o `<SortableHeader>` que carrega um `ResizeHandle`.
const HEADER_CLASS = 'px-6 py-2 border-r border-gray-100 overflow-hidden';
const COLUMN_HEADERS: Record<string, { label: string; className: string }> = {
    name: { label: 'Nome', className: HEADER_CLASS },
    description: { label: 'Descrição', className: HEADER_CLASS },
    file: { label: 'Arquivo', className: HEADER_CLASS },
    tokens: { label: 'Marcadores', className: HEADER_CLASS },
    updated_at: { label: 'Atualizado em', className: HEADER_CLASS },
    created_at: { label: 'Criado em', className: HEADER_CLASS },
};

const CELL_CLASS = 'px-6 py-2.5 border-r border-gray-100';

const contarMapeados = (t: DocumentTemplate) => t.detected_tokens.filter(tk => t.token_map?.[tk]).length;

/** `created_at`/`updated_at` são TIMESTAMPTZ (migration 20261110000001) — têm hora
 *  real, então NÃO podem passar por `formatDateBR`, que lê só o prefixo
 *  `YYYY-MM-DD` e ignora o fuso (produziria o bug inverso, data adiantada à noite
 *  em UTC-3). Mesma decisão de `ProjectList`/`ClientList`. */
const formatarData = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

// ─── Seletor de mapeamento de um marcador ─────────────────────────────────────────
const MappingSelect: React.FC<{
    value?: TokenMapping;
    onChange: (m: TokenMapping | undefined) => void;
}> = ({ value, onChange }) => {
    const selectValue = !value ? '' : value.source === 'fixed' ? 'fixed' : `${value.source}.${value.field}`;

    return (
        <div className="flex flex-col gap-1.5">
            <select
                value={selectValue}
                onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') return onChange(undefined);
                    if (v === 'fixed') return onChange({ source: 'fixed', fixed: value?.fixed ?? '' });
                    const [source, field] = v.split('.');
                    const group = FIELD_GROUPS.find(g => g.source === source);
                    const f = group?.fields.find(x => x.field === field);
                    onChange({ source: source as TokenMapping['source'], field, label: f?.label });
                }}
                className="w-full rounded-[6px] border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            >
                <option value="">— não mapeado —</option>
                <option value="fixed">✎ Texto fixo…</option>
                {FIELD_GROUPS.map(g => (
                    <optgroup key={g.source} label={g.label}>
                        {g.fields.map(f => (
                            <option key={`${g.source}.${f.field}`} value={`${g.source}.${f.field}`}>
                                {f.label}
                            </option>
                        ))}
                    </optgroup>
                ))}
            </select>
            {value?.source === 'fixed' && (
                <input
                    value={value.fixed ?? ''}
                    onChange={(e) => onChange({ source: 'fixed', fixed: e.target.value })}
                    placeholder="Texto que substituirá o marcador"
                    className="w-full rounded-[6px] border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
                />
            )}
        </div>
    );
};

const DocxTemplateManager: React.FC<Props> = ({ organizationId, onClose }) => {
    const { orgId: contextOrgId } = useOrgContext();
    const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [parsing, setParsing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    // §25 — dirty-tracking do formulário + guarda de saída.
    const { dirty, markDirty, markSaved, confirmDiscard } = useUnsavedChanges();
    // §3 — busca sobrevive a navegação/reload.
    const [searchTerm, setSearchTerm] = usePersistedState<string>('docxTemplates:search', '');
    const tableColumns = useTableColumns(COLUMNS, 'docxTemplatesColumns');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'docxTemplatesColWidths');
    // Org efetiva: usa a prop quando válida; senão resolve a organização do
    // usuário. Sem ela, o upload no storage perde a pasta {org}/ e o RLS barra
    // o INSERT ("new row violates row-level security policy").
    const [orgId, setOrgId] = useState<string>(organizationId);
    // Trocar o conteudo in-flow nao mexe no scroll do container: vindo de uma
    // lista rolada, esta tela nasceria com o proprio cabecalho fora de vista.
    const raiz = React.useRef<HTMLDivElement>(null);
    useScrollAoTopo(raiz);

    useEffect(() => {
        if (organizationId) { setOrgId(organizationId); return; }
        // Seletor do topo tem precedência sobre qualquer descoberta automática.
        if (contextOrgId) { setOrgId(contextOrgId); return; }
        // Em "Todas as organizações": cai na organização da qual o usuário é
        // membro. Sem `?? orgs[0]` — escolher a primeira da lista gravava o
        // modelo numa organização alheia. Ver hooks/useOrgContext.tsx.
        (async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                const email = user?.email?.toLowerCase();
                const orgs = await organizationService.listOrganizations();
                const mine = email
                    ? orgs.find(o => (o.members ?? []).some(m => m.email?.toLowerCase() === email))
                    : undefined;
                if (mine) setOrgId(mine.id);
            } catch { /* mantém vazio; save mostrará erro */ }
        })();
    }, [organizationId, contextOrgId]);

    const load = useCallback(() => {
        setLoading(true);
        documentTemplateService.list(orgId || undefined)
            .then(setTemplates)
            .catch(e => setError(e instanceof Error ? e.message : 'Erro ao carregar modelos'))
            .finally(() => setLoading(false));
    }, [orgId]);

    useEffect(() => { load(); }, [load]);

    // §6.4 — a ordenação vem toda do <thead>; sem coluna escolhida, o default é
    // nome A-Z (a mesma ordem que o serviço já devolve).
    const visibleTemplates = useMemo(() => {
        const termo = searchTerm.trim().toLowerCase();
        const filtrados = termo
            ? templates.filter(t =>
                t.name.toLowerCase().includes(termo)
                || (t.description ?? '').toLowerCase().includes(termo)
                || (t.file_name ?? '').toLowerCase().includes(termo))
            : templates;

        const { sortColumn, sortDirection } = tableColumns;
        const dir = sortDirection === 'desc' ? -1 : 1;
        const valor = (t: DocumentTemplate): string | number => {
            switch (sortColumn) {
                case 'name': return t.name.toLowerCase();
                case 'description': return (t.description ?? '').toLowerCase();
                case 'file': return (t.file_name ?? '').toLowerCase();
                case 'tokens': return contarMapeados(t);
                case 'updated_at': return t.updated_at ?? '';
                case 'created_at': return t.created_at ?? '';
                default: return t.name.toLowerCase();
            }
        };
        return [...filtrados].sort((a, b) => {
            if (!sortColumn) return a.name.localeCompare(b.name);
            const va = valor(a);
            const vb = valor(b);
            const cmp = typeof va === 'number' && typeof vb === 'number'
                ? va - vb
                : String(va).localeCompare(String(vb));
            // Desempate determinístico por nome — sem ele a ordem "dança" entre
            // renders quando o valor da coluna empata (§6.7).
            return (cmp !== 0 ? cmp : a.name.localeCompare(b.name)) * dir;
        });
    }, [templates, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection]);

    // §6.1 — largura da tabela é a SOMA exata das colunas visíveis. Nunca w-full:
    // com table-layout:fixed e 100%, o navegador redistribui a folga e arrastar
    // uma borda redimensiona a coluna errada.
    const tableTotalWidth = tableColumns.orderedVisibleColumns
        .reduce((soma, key) => soma + cols.getWidth(key), 0) + cols.getWidth('actions');

    const startNew = () => { setError(null); setSavedAt(null); markSaved(); setDraft({ ...EMPTY_DRAFT }); };

    const startEdit = (t: DocumentTemplate) => {
        setError(null);
        setSavedAt(null);
        markSaved();
        setDraft({
            id: t.id,
            name: t.name,
            description: t.description ?? '',
            file: null,
            detectedTokens: t.detected_tokens,
            tokenMap: t.token_map ?? {},
        });
    };

    /** Sai da edição (ou do painel inteiro) respeitando a guarda do §25. */
    const closeDraft = async () => {
        if (!await confirmDiscard()) return;
        markSaved();
        setDraft(null);
    };

    const requestClosePanel = async () => {
        if (!await confirmDiscard()) return;
        onClose();
    };

    const handleFile = async (file: File) => {
        if (!file.name.toLowerCase().endsWith('.docx')) {
            setError('Selecione um arquivo .docx (Word).');
            return;
        }
        setError(null);
        setParsing(true);
        try {
            const tokens = await detectTokens(file);
            setDraft(d => {
                const base = d ?? { ...EMPTY_DRAFT };
                // Preserva mapeamentos já feitos para marcadores que continuam existindo
                const keptMap: TokenMap = {};
                for (const tk of tokens) if (base.tokenMap[tk]) keptMap[tk] = base.tokenMap[tk];
                return {
                    ...base,
                    file,
                    name: base.name || file.name.replace(/\.docx$/i, ''),
                    detectedTokens: tokens,
                    tokenMap: keptMap,
                };
            });
            markDirty();
            if (tokens.length === 0) {
                setError('Nenhum marcador {001} encontrado no documento. Verifique se o texto usa chaves simples, ex.: {001}.');
            }
        } catch (e) {
            const raw = e instanceof Error ? e.message : '';
            // Oculta mensagens técnicas do docxtemplater (ex.: "Multi error")
            const friendly = /multi error|templat/i.test(raw)
                ? 'Erro ao ler o arquivo. Verifique se é um .docx válido e tente novamente.'
                : raw || 'Não foi possível ler o .docx.';
            setError(friendly);
        } finally {
            setParsing(false);
        }
    };

    const setMapping = (token: string, m: TokenMapping | undefined) => {
        setDraft(d => {
            if (!d) return d;
            const next = { ...d.tokenMap };
            if (m) next[token] = m; else delete next[token];
            return { ...d, tokenMap: next };
        });
        markDirty();
    };

    const canSave = !!draft && draft.name.trim() !== '' && (draft.id !== null || draft.file !== null);

    const save = async () => {
        if (!draft || !canSave) return;
        if (!orgId) {
            setError('Organização não identificada. Recarregue a página e tente novamente.');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const payload = {
                name: draft.name.trim(),
                description: draft.description.trim() || undefined,
                detected_tokens: draft.detectedTokens,
                token_map: draft.tokenMap,
            };
            const salvo = draft.id
                ? await documentTemplateService.update(draft.id, orgId, payload, draft.file ?? undefined)
                : await documentTemplateService.create(orgId, draft.file!, payload);

            // §22 — atualiza o array local em vez de recarregar a lista inteira;
            // o serviço já devolve o registro completo.
            setTemplates(prev => (prev.some(t => t.id === salvo.id)
                ? prev.map(t => (t.id === salvo.id ? salvo : t))
                : [...prev, salvo].sort((a, b) => a.name.localeCompare(b.name))));
            markSaved();
            setSavedAt(Date.now());

            // §25 — criar fecha (a tarefa acabou); editar permanece aberto, com o
            // formulário reidratado a partir do que o banco devolveu.
            if (draft.id) {
                setDraft({
                    id: salvo.id,
                    name: salvo.name,
                    description: salvo.description ?? '',
                    file: null,
                    detectedTokens: salvo.detected_tokens,
                    tokenMap: salvo.token_map ?? {},
                });
            } else {
                setDraft(null);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao salvar o modelo.');
        } finally {
            setSaving(false);
        }
    };

    /** Exclusão (soft delete). A confirmação é a do próprio `InlineDisclosureMenu`
     *  — §14: nada de `window.confirm()` nativo. */
    const remove = async (t: DocumentTemplate) => {
        try {
            await documentTemplateService.deactivate(t.id);
            setTemplates(prev => prev.filter(x => x.id !== t.id));   // §22
            if (draft?.id === t.id) { markSaved(); setDraft(null); }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao remover o modelo.');
        }
    };

    const mappedCount = draft ? draft.detectedTokens.filter(tk => draft.tokenMap[tk]).length : 0;

    const renderCell = (key: string, t: DocumentTemplate): React.ReactNode => {
        switch (key) {
            case 'name':
                // §6.1.2 — `truncate` só recorta em elemento de bloco, e o `title`
                // devolve o texto inteiro que a coluna cortou.
                return <span className="block truncate text-sm font-normal text-gray-700" title={t.name}>{t.name}</span>;
            case 'description':
                return (
                    <span className="block truncate text-sm font-normal text-gray-600" title={t.description || undefined}>
                        {t.description || '—'}
                    </span>
                );
            case 'file':
                return (
                    <span className="block truncate text-sm font-normal text-gray-600" title={t.file_name || undefined}>
                        {t.file_name ?? '—'}
                    </span>
                );
            case 'tokens': {
                const total = t.detected_tokens.length;
                const mapeados = contarMapeados(t);
                // §8 — texto colorido simples, sem pílula: âmbar quando falta mapear.
                const cor = total > 0 && mapeados < total ? 'text-amber-600' : 'text-gray-600';
                return <span className={`text-sm font-normal ${cor}`}>{mapeados}/{total}</span>;
            }
            case 'updated_at':
                return <span className="text-sm font-normal text-gray-600">{formatarData(t.updated_at)}</span>;
            case 'created_at':
                return <span className="text-sm font-normal text-gray-600">{formatarData(t.created_at)}</span>;
            default:
                return null;
        }
    };

    return (
        /* §20.1 — 24px do cabeçalho até o cromo. Sem `px-*` na raiz (§20.2): o
           gutter é o do `<main>`. */
        <div ref={raiz} className="space-y-6 animate-in fade-in duration-300 pb-4">
            {/* Cabeçalho de tela — mesmo desenho do ContractDetailView: seta
                "voltar" + h1 2xl (3xl é só para o topo de uma lista-raiz, §20). */}
            <div className="flex items-center gap-4">
                <button
                    type="button"
                    onClick={requestClosePanel}
                    title="Voltar"
                    className="p-2.5 bg-white border border-gray-200 rounded-[6px] text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm active:scale-95 group shrink-0"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                </button>
                <div className="min-w-0">
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">Modelos de documento</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">
                        Suba um .docx com marcadores {'{001}'} e associe cada marcador a um campo do contrato.
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                {/* §5.2 — o banner de erro fica FORA do card acoplado, antes dele. */}
                {error && (
                    <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                    </div>
                )}

                {draft ? (
                    /* ─── Modo edição/criação ───
                       `max-w-4xl`: a tabela quer a largura inteira do painel, o
                       formulário não. Sem o limite, cada select de marcador
                       esticava por ~1500px e a linha ficava ilegível. */
                    <div className="space-y-4 max-w-4xl">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500">Nome do modelo *</label>
                                <input
                                    value={draft.name}
                                    onChange={e => { setDraft({ ...draft, name: e.target.value }); markDirty(); }}
                                    placeholder="Ex.: Contrato de prestação de serviços"
                                    className="w-full h-9 rounded-[6px] border border-gray-200 bg-white px-3 text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500">Descrição</label>
                                <input
                                    value={draft.description}
                                    onChange={e => { setDraft({ ...draft, description: e.target.value }); markDirty(); }}
                                    placeholder="Opcional"
                                    className="w-full h-9 rounded-[6px] border border-gray-200 bg-white px-3 text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                />
                            </div>
                        </div>

                        {/* Upload / substituição do arquivo */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-slate-500">
                                Arquivo .docx {draft.id ? '(deixe em branco para manter o atual)' : '*'}
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer rounded-[6px] border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-600 hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
                                {parsing ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : <Upload className="w-4 h-4 text-blue-600" />}
                                <span className="truncate">
                                    {parsing ? 'Lendo marcadores…' : draft.file ? draft.file.name : (draft.id ? 'Substituir arquivo (.docx)' : 'Selecionar arquivo (.docx)')}
                                </span>
                                <input
                                    type="file"
                                    accept=".docx"
                                    className="hidden"
                                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ''; }}
                                />
                            </label>
                        </div>

                        {/* Mapeamento de marcadores */}
                        {draft.detectedTokens.length > 0 && (
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                                        <Link2 className="w-4 h-4 text-blue-600" /> Mapeamento dos marcadores
                                    </h3>
                                    <span className="text-xs text-gray-400">{mappedCount}/{draft.detectedTokens.length} mapeados</span>
                                </div>
                                <div className="space-y-2">
                                    {draft.detectedTokens.map(tk => (
                                        <div key={tk} className="grid grid-cols-[80px_1fr] items-start gap-3 rounded-[10px] bg-gray-50 p-2.5">
                                            {/* `font-mono` fica: é o token literal do placeholder, exceção
                                                explícita do §21 — e não está dentro de uma célula de tabela. */}
                                            <span className="font-mono text-sm font-semibold text-blue-700 pt-1.5">{`{${tk}}`}</span>
                                            <MappingSelect value={draft.tokenMap[tk]} onChange={m => setMapping(tk, m)} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* ─── Lista (§5.2 — toolbar e tabela num único card) ─── */
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                        <div className="p-2 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-2.5 items-center">
                            <div className="flex-1 relative w-full">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar por nome, descrição ou arquivo..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                />
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                    <ColumnConfigButton
                                        columns={COLUMNS}
                                        visibleColumns={tableColumns.visibleColumns}
                                        showColumnConfig={tableColumns.showColumnConfig}
                                        onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                        onToggleColumn={tableColumns.toggleColumn}
                                        onReset={tableColumns.resetColumns}
                                    />
                                    <div className="w-px h-5 bg-gray-200 mx-0.5"></div>
                                    {/* §6.1.2 — ajuste ao conteúdo sob comando explícito, nunca automático. */}
                                    <button
                                        type="button"
                                        onClick={() => cols.autoFit()}
                                        className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                        title="Ajustar largura das colunas ao conteúdo"
                                    >
                                        <MoveHorizontal className="w-4 h-4" />
                                    </button>
                                </div>
                                {/* §17 — botão primário na variante compacta. */}
                                <button
                                    type="button"
                                    onClick={startNew}
                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                                >
                                    <Plus className="w-[15px] h-[15px]" />
                                    Novo modelo
                                </button>
                            </div>
                        </div>

                        {loading ? (
                            /* §11 */
                            <div className="text-center py-12">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                                <p className="mt-2 text-gray-500">Carregando...</p>
                            </div>
                        ) : visibleTemplates.length === 0 ? (
                            /* §12 — sem moldura própria: o card acoplado já supre. */
                            <div className="text-center py-12">
                                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-gray-900 mb-2">
                                    {searchTerm.trim() ? 'Nenhum modelo encontrado' : 'Nenhum modelo ainda'}
                                </h3>
                                <p className="text-sm text-gray-500">
                                    {searchTerm.trim()
                                        ? 'Tente ajustar a busca.'
                                        : 'Crie um modelo a partir de um arquivo .docx com marcadores.'}
                                </p>
                            </div>
                        ) : (
                            /* §6.5 — cabeçalho fixo; a lista pode passar da altura do painel. */
                            <div className="overflow-auto max-h-[70vh]">
                                <table
                                    ref={cols.tableRef}
                                    className="text-left border-collapse"
                                    style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}
                                >
                                    <colgroup>
                                        {tableColumns.orderedVisibleColumns.map(key => (
                                            <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                                        ))}
                                        {/* §6.1.1 — espaçador ANTES de "Ações": absorve a folga no meio, em
                                            vez de a borda de "Ações" andar a cada arraste. */}
                                        <col />
                                        <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                                    </colgroup>
                                    <thead>
                                        <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                            {tableColumns.orderedVisibleColumns.map(key => {
                                                const def = COLUMN_HEADERS[key];
                                                if (!def) return null;
                                                return (
                                                    <SortableHeader
                                                        key={key}
                                                        colKey={key}
                                                        label={def.label}
                                                        uppercase={false}
                                                        sortColumn={tableColumns.sortColumn}
                                                        sortDirection={tableColumns.sortDirection}
                                                        onSort={tableColumns.handleColumnSort}
                                                        onMoveColumn={tableColumns.moveColumn}
                                                        className={def.className}
                                                    >
                                                        <cols.ResizeHandle colKey={key} />
                                                    </SortableHeader>
                                                );
                                            })}
                                            {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                            <th aria-hidden="true" className="border-r border-gray-100" />
                                                            <th className="px-6 py-2 text-right relative overflow-hidden text-table-header font-semibold text-gray-500">
                                                Ações
                                                <cols.ResizeHandle colKey="actions" />
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {visibleTemplates.map(t => (
                                            <tr
                                                key={t.id}
                                                onClick={() => startEdit(t)}
                                                className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                            >
                                                {tableColumns.orderedVisibleColumns.map(key => (
                                                    <td key={key} className={CELL_CLASS}>
                                                        {renderCell(key, t)}
                                                    </td>
                                                ))}
                                                {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                                <td aria-hidden="true" className="border-r border-gray-100"></td>
                                                <td className="px-6 py-2.5 text-right">
                                                    {/* §9.1 — editar é o clique na linha (ação dominante); o kebab
                                                        só tem Excluir, isolado de propósito. */}
                                                    <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                                                        <InlineDisclosureMenu showDelete onDelete={() => remove(t)} />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {draft && (
                /* Rodapé canônico da §25, agora no fluxo da tela: gruda no fim da
                   área visível enquanto se rola os 36 marcadores, sem virar
                   overlay (é `sticky`, não `fixed`). */
                <div className="sticky bottom-0 -mb-4 bg-white border-t border-gray-100 rounded-t-[10px] shadow-sm px-4 py-3 flex items-center justify-end gap-2">
                    <SaveStatus dirty={dirty} savedAt={savedAt} className="mr-auto" />
                    <button
                        type="button"
                        onClick={closeDraft}
                        className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] transition-all"
                    >
                        {draft.id ? 'Voltar' : 'Cancelar'}
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        /* §25 — em edição, sem pendência não há o que gravar de
                           novo. Na criação o botão depende só do `canSave`
                           (nome + arquivo), que já cobre o formulário vazio. */
                        disabled={!canSave || saving || parsing || (!!draft.id && !dirty)}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Save className="w-[15px] h-[15px]" />}
                        {saving ? 'Salvando...' : 'Salvar modelo'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default DocxTemplateManager;
