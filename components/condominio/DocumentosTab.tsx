// components/condominio/DocumentosTab.tsx
// Documentos do condomínio — convenção, regulamento, atas, laudos.
// Plano: docs/planos/2026-09-04-condominio-ficha-largura-e-aba-documentos.md
//
// Esta aba NÃO é tabela nova: `condominio_documentos` existe desde a
// `aplicar_20270905000023` e vivia como sub-aba de Comunicação, guardando só
// LINK. Duas mudanças de uma vez, e a segunda é a razão do pedido:
//
// 1. Documento saiu de Comunicação. Lá ele dividia a tela com avisos, que têm
//    outro ciclo (aviso vence; convenção não) — e sub-aba dentro de aba escondia
//    justamente o documento que mais importa do prédio.
// 2. Passou a aceitar ARQUIVO, não só endereço. O bucket é privado
//    (`condominio-documentos`): quem abre pelo app usa URL assinada, e quem abre
//    pelo Portal do Condômino — que roda sem sessão — passa pela edge function
//    `condomino-portal-download`, o mesmo molde dos outros cinco portais.
import React from 'react';
import {
    FileText, Search, RefreshCw, Plus, Eye, EyeOff, AlertCircle,
    Upload, Link2, ScrollText, Paperclip,
} from 'lucide-react';
import {
    ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState,
} from '../ui/TableUtils';
import { KpiCard } from '../ui/KpiCard';
import ActionIconButton from '../ui/ActionIconButton';
import { InlineDisclosureMenu } from '../ui/inline-disclosure-menu';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import {
    condominioComunicacaoService, EXTENSOES_ACEITAS, TAMANHO_MAXIMO_BYTES,
    type CondominioDocumento, type DocumentoCategoria,
} from '../../services/condominioComunicacaoService';
import type { Empreendimento } from '../../types/empreendimento';

const CATEGORIA_DOC: Record<DocumentoCategoria, string> = {
    CONVENCAO: 'Convenção', REGULAMENTO: 'Regulamento', ATA: 'Ata',
    MANUAL: 'Manual do proprietário', LAUDO: 'Laudo', SEGURO: 'Seguro', OUTRO: 'Outro',
};

const COLUMNS: ColumnConfig[] = [
    { key: 'titulo', label: 'Documento', sortable: true },
    { key: 'categoria', label: 'Categoria', sortable: true },
    { key: 'arquivo', label: 'Arquivo', sortable: true },
    { key: 'tamanho', label: 'Tamanho', sortable: true },
    { key: 'portal', label: 'Portal', sortable: true },
    { key: 'descricao', label: 'Descrição', sortable: true, defaultHidden: true },
    { key: 'atualizado', label: 'Atualizado em', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

function formatarData(iso?: string | null): string {
    if (!iso) return '—';
    const [a, m, d] = iso.slice(0, 10).split('-');
    return d && m && a ? `${d}/${m}/${a}` : '—';
}

function formatarTamanho(bytes?: number | null): string {
    if (!bytes && bytes !== 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** `Convenção de Condomínio.pdf` → `Convenção de Condomínio`. */
function semExtensao(nome: string): string {
    const i = nome.lastIndexOf('.');
    return i > 0 ? nome.slice(0, i) : nome;
}

type Modo = 'arquivo' | 'link';

interface Props { empreendimento: Empreendimento }

const DocumentosTab: React.FC<Props> = ({ empreendimento }) => {
    const confirm = useConfirm();
    const orgId = empreendimento.organization_id;

    const [searchTerm, setSearchTerm] = usePersistedState<string>('condominio:documentos:busca', '');
    const tableColumns = useTableColumns(COLUMNS, 'condominioDocumentosColumns');

    const [documentos, setDocumentos] = React.useState<CondominioDocumento[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [salvando, setSalvando] = React.useState(false);
    const [sheetAberto, setSheetAberto] = React.useState(false);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const [modo, setModo] = React.useState<Modo>('arquivo');
    const [arquivo, setArquivo] = React.useState<File | null>(null);
    const inputArquivoRef = React.useRef<HTMLInputElement>(null);
    const [form, setForm] = React.useState<{
        titulo: string; categoria: DocumentoCategoria; url: string; descricao: string; visivelPortal: boolean;
    }>({ titulo: '', categoria: 'CONVENCAO', url: '', descricao: '', visivelPortal: true });

    const carregar = React.useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            setDocumentos(await condominioComunicacaoService.listDocumentos(empreendimento.id));
        } catch (e: any) {
            setErro(e?.message || 'Erro ao carregar os documentos.');
        } finally {
            setLoading(false);
        }
    }, [empreendimento.id]);

    React.useEffect(() => { carregar(); }, [carregar]);

    const kpis = React.useMemo(() => ({
        total: documentos.length,
        enviados: documentos.filter(d => !!d.storage_path).length,
        noPortal: documentos.filter(d => d.visivel_portal).length,
        temConvencao: documentos.some(d => d.categoria === 'CONVENCAO'),
    }), [documentos]);

    const filtrados = React.useMemo(() => {
        const t = searchTerm.trim().toLowerCase();
        const base = !t ? documentos : documentos.filter(d =>
            d.titulo.toLowerCase().includes(t)
            || (d.descricao || '').toLowerCase().includes(t)
            || (d.file_name || '').toLowerCase().includes(t)
            || CATEGORIA_DOC[d.categoria].toLowerCase().includes(t));

        const { sortColumn, sortDirection } = tableColumns;
        const sinal = sortDirection === 'asc' ? 1 : -1;
        const valor = (d: CondominioDocumento): string | number => {
            switch (sortColumn) {
                case 'titulo': return d.titulo.toLowerCase();
                case 'categoria': return CATEGORIA_DOC[d.categoria].toLowerCase();
                case 'arquivo': return (d.file_name || d.url || '').toLowerCase();
                case 'tamanho': return d.file_size ?? -1;
                case 'portal': return d.visivel_portal ? 1 : 0;
                case 'descricao': return (d.descricao || '').toLowerCase();
                case 'atualizado': return d.updated_at || '';
                default: return '';
            }
        };

        return [...base].sort((a, b) => {
            // Sem coluna escolhida, a ordem é a que o service já pediu ao banco
            // (categoria, depois título) — a convenção antes da ata avulsa.
            if (!sortColumn) return 0;
            const va = valor(a);
            const vb = valor(b);
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sinal;
            return String(va).localeCompare(String(vb), 'pt-BR') * sinal;
        });
    }, [documentos, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection]);

    /**
     * Abrir precisa de uma ida ao servidor (a URL do arquivo é assinada na hora),
     * e `window.open` DEPOIS de um `await` é bloqueado como pop-up. Por isso a
     * aba nasce no clique, ainda em branco, e só depois recebe o endereço.
     */
    const abrir = async (d: CondominioDocumento) => {
        const janela = window.open('', '_blank');
        try {
            const url = await condominioComunicacaoService.abrirDocumento(d);
            if (janela) janela.location.href = url;
            else window.open(url, '_blank', 'noopener');
        } catch (e: any) {
            janela?.close();
            notify(e?.message || 'Não foi possível abrir o documento.', 'error');
        }
    };

    const escolherArquivo = (f: File | null) => {
        setArquivo(f);
        // Título vazio + arquivo escolhido: o nome do arquivo já é o melhor
        // palpite. Título preenchido nunca é sobrescrito.
        if (f) setForm(prev => (prev.titulo.trim() ? prev : { ...prev, titulo: semExtensao(f.name) }));
    };

    const fecharSheet = () => {
        setSheetAberto(false);
        setArquivo(null);
        setForm({ titulo: '', categoria: 'CONVENCAO', url: '', descricao: '', visivelPortal: true });
        if (inputArquivoRef.current) inputArquivoRef.current.value = '';
    };

    const salvar = async () => {
        if (!form.titulo.trim()) {
            notify('Dê um título ao documento.', 'error');
            return;
        }
        if (modo === 'arquivo' && !arquivo) {
            notify('Escolha o arquivo a enviar.', 'error');
            return;
        }
        if (modo === 'link' && !form.url.trim()) {
            notify('Informe o endereço do documento.', 'error');
            return;
        }

        setSalvando(true);
        try {
            const comum = {
                empreendimento_id: empreendimento.id,
                organization_id: orgId,
                titulo: form.titulo.trim(),
                categoria: form.categoria,
                descricao: form.descricao.trim() || null,
                visivel_portal: form.visivelPortal,
            };
            const criado = modo === 'arquivo'
                ? await condominioComunicacaoService.uploadDocumento(arquivo!, comum)
                : await condominioComunicacaoService.createDocumento({ ...comum, url: form.url.trim() });

            // §22 — o array local recebe o registro salvo; nada de recarregar a aba.
            setDocumentos(prev => [criado, ...prev]);
            fecharSheet();
            notify(modo === 'arquivo' ? 'Arquivo enviado.' : 'Documento cadastrado.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao salvar o documento.', 'error');
        } finally {
            setSalvando(false);
        }
    };

    const alternarVisibilidade = async (d: CondominioDocumento) => {
        try {
            const atualizado = await condominioComunicacaoService.setVisibilidade(d.id, !d.visivel_portal);
            setDocumentos(prev => prev.map(x => (x.id === d.id ? atualizado : x)));
            notify(atualizado.visivel_portal ? 'Visível no portal do condômino.' : 'Oculto do portal.');
        } catch (e: any) { notify(e?.message || 'Erro ao alterar.', 'error'); }
    };

    const excluir = async (d: CondominioDocumento) => {
        const ok = await confirm({
            title: 'Excluir o documento?',
            message: d.storage_path
                ? `"${d.titulo}" sai do cadastro e o arquivo enviado é apagado. Esta ação não pode ser desfeita.`
                : `"${d.titulo}" sai do cadastro. O arquivo em si não é apagado — só a referência a ele.`,
            variant: 'danger', confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await condominioComunicacaoService.removeDocumento(d);
            setDocumentos(prev => prev.filter(x => x.id !== d.id));
            notify('Documento excluído.');
        } catch (e: any) { notify(e?.message || 'Erro ao excluir.', 'error'); }
    };

    const cabecalho = (key: string, label: string) => (
        tableColumns.visibleColumns.includes(key) && (
            <SortableHeader
                colKey={key} label={label} uppercase={false}
                sortColumn={tableColumns.sortColumn}
                sortDirection={tableColumns.sortDirection}
                onSort={tableColumns.handleColumnSort}
                className="px-6 py-2 border-r border-gray-100"
            />
        )
    );

    return (
        <div className="space-y-6">
            {/* Fora do card acoplado de propósito: dentro, o banner quebra a
                costura do border-b da toolbar (§5.2). */}
            {erro && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm">{erro}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                <KpiCard label="DOCUMENTOS" value={kpis.total} icon={<FileText className="w-5 h-5" />} color="blue" />
                <KpiCard
                    label="ARQUIVOS ENVIADOS" value={kpis.enviados}
                    sub={kpis.total > kpis.enviados ? `${kpis.total - kpis.enviados} são link externo` : undefined}
                    icon={<Paperclip className="w-5 h-5" />}
                    color={kpis.enviados > 0 ? 'emerald' : 'gray'}
                />
                <KpiCard label="VISÍVEIS NO PORTAL" value={kpis.noPortal} icon={<Eye className="w-5 h-5" />} color="indigo" />
                {/* A convenção é o documento que sustenta fração ideal e rateio.
                    Sem ela o condomínio cobra por área privativa, não pelo
                    critério que a lei manda — daí ela ter KPI próprio. */}
                <KpiCard
                    label="CONVENÇÃO"
                    value={kpis.temConvencao ? 'Cadastrada' : 'Falta'}
                    sub={kpis.temConvencao ? undefined : 'É ela que define a fração ideal'}
                    icon={<ScrollText className="w-5 h-5" />}
                    color={kpis.temConvencao ? 'emerald' : 'amber'}
                />
            </div>

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-2 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por título, categoria, arquivo ou descrição..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <button
                            onClick={carregar}
                            className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                            title="Recarregar"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>

                        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={COLUMNS.filter(c => c.key !== 'actions')}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                        </div>

                        <button
                            onClick={() => setSheetAberto(true)}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0 whitespace-nowrap"
                        >
                            <Plus className="w-[15px] h-[15px]" />
                            Novo documento
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filtrados.length === 0 ? (
                    <div className="text-center py-12">
                        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">
                            {documentos.length === 0 ? 'Nenhum documento' : 'Nada encontrado'}
                        </h3>
                        <p className="text-sm text-gray-500 max-w-md mx-auto">
                            {documentos.length === 0
                                ? 'Convenção, regulamento, atas de assembleia, laudos e apólices. Envie o arquivo ou aponte para um endereço já existente.'
                                : 'Tente ajustar a busca.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {cabecalho('titulo', 'Documento')}
                                    {cabecalho('categoria', 'Categoria')}
                                    {cabecalho('arquivo', 'Arquivo')}
                                    {cabecalho('tamanho', 'Tamanho')}
                                    {cabecalho('portal', 'Portal')}
                                    {cabecalho('descricao', 'Descrição')}
                                    {cabecalho('atualizado', 'Atualizado em')}
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtrados.map(d => (
                                    <tr
                                        key={d.id}
                                        onClick={() => abrir(d)}
                                        title="Abrir o documento"
                                        className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                    >
                                        {tableColumns.visibleColumns.includes('titulo') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-blue-600">
                                                <span className="block truncate" title={d.titulo}>{d.titulo}</span>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('categoria') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                {CATEGORIA_DOC[d.categoria]}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('arquivo') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                <span className="flex items-center gap-1.5 min-w-0">
                                                    {d.storage_path
                                                        ? <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                        : <Link2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                                                    <span className="block truncate" title={d.file_name || d.url || ''}>
                                                        {d.file_name || (d.url ? 'Link externo' : '—')}
                                                    </span>
                                                </span>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('tamanho') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                {formatarTamanho(d.file_size)}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('portal') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal">
                                                <span className={d.visivel_portal ? 'text-emerald-700' : 'text-gray-500'}>
                                                    {d.visivel_portal ? 'Visível' : 'Oculto'}
                                                </span>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('descricao') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                <span className="block truncate" title={d.descricao || ''}>{d.descricao || '—'}</span>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('atualizado') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                {formatarData(d.updated_at)}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                {/* §9.1 — abrir é a ação dominante e já está no clique da
                                                    linha; aqui fica só o que ELA não faz. */}
                                                <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                                    <ActionIconButton
                                                        kind="view"
                                                        title={d.visivel_portal ? 'Ocultar do portal do condômino' : 'Mostrar no portal do condômino'}
                                                        icon={d.visivel_portal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                        onClick={() => alternarVisibilidade(d)}
                                                    />
                                                    <InlineDisclosureMenu showDelete onDelete={() => excluir(d)} />
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <Sheet open={sheetAberto} onClose={fecharSheet} size="lg">
                <SheetHeader onClose={fecharSheet}>
                    <SheetTitle>Novo documento</SheetTitle>
                    <SheetDescription>{empreendimento.name}</SheetDescription>
                </SheetHeader>
                <SheetPanel>
                    <div className="space-y-4">
                        {/* Enviar × apontar: são dois documentos diferentes do ponto
                            de vista de quem administra (um é nosso, o outro mora
                            fora), então a escolha vem antes dos campos. */}
                        <div className="flex items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1">
                            {([['arquivo', 'Enviar arquivo', Upload], ['link', 'Link externo', Link2]] as [Modo, string, any][]).map(([id, label, Icone]) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setModo(id)}
                                    className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[6px] text-sm font-medium transition-all ${
                                        modo === id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                                    }`}
                                >
                                    <Icone className="w-4 h-4" /> {label}
                                </button>
                            ))}
                        </div>

                        {/* `key` distinta nos dois ramos de propósito: sem ela o React
                            REAPROVEITA o mesmo <input>, trocando só o `type` de `file`
                            para `text` — e aí um campo não-controlado vira controlado,
                            que é o aviso que o console cospe e o caminho para o valor
                            digitado sobreviver a uma troca de modo que devia limpá-lo. */}
                        {modo === 'arquivo' ? (
                            <div key="modo-arquivo">
                                <label className="text-xs font-semibold text-slate-500">Arquivo</label>
                                <input
                                    ref={inputArquivoRef}
                                    type="file"
                                    accept={EXTENSOES_ACEITAS}
                                    onChange={e => escolherArquivo(e.target.files?.[0] || null)}
                                    className="mt-1 w-full text-sm font-normal text-gray-600 file:mr-3 file:h-9 file:px-3.5 file:rounded-[6px] file:border-0 file:bg-blue-50 file:text-blue-600 file:text-[13px] file:font-medium hover:file:bg-blue-100 file:cursor-pointer"
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    {arquivo
                                        ? `${arquivo.name} · ${formatarTamanho(arquivo.size)}`
                                        : `PDF, Word, Excel ou imagem, até ${TAMANHO_MAXIMO_BYTES / 1048576} MB.`}
                                </p>
                            </div>
                        ) : (
                            <div key="modo-link">
                                <label className="text-xs font-semibold text-slate-500">Endereço do arquivo</label>
                                <input
                                    type="text" value={form.url}
                                    onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                                    placeholder="https://..."
                                    className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    Para arquivo que já mora em outro lugar (ÒPURA Docs, site do cartório).
                                    Se ele exigir login, o condômino não vai conseguir abrir — nesse caso, envie o arquivo.
                                </p>
                            </div>
                        )}

                        <div>
                            <label className="text-xs font-semibold text-slate-500">Título</label>
                            <input
                                type="text" value={form.titulo}
                                onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                                placeholder="Ex: Convenção de condomínio registrada"
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-slate-500">Categoria</label>
                            <select
                                value={form.categoria}
                                onChange={e => setForm(f => ({ ...f, categoria: e.target.value as DocumentoCategoria }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            >
                                {(Object.keys(CATEGORIA_DOC) as DocumentoCategoria[]).map(c => (
                                    <option key={c} value={c}>{CATEGORIA_DOC[c]}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-slate-500">Descrição</label>
                            <input
                                type="text" value={form.descricao}
                                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                                placeholder="Ex: registro nº 12.345 no 2º Ofício"
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>

                        <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.visivelPortal}
                                onChange={e => setForm(f => ({ ...f, visivelPortal: e.target.checked }))}
                                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <span className="text-sm font-normal text-gray-700">
                                Visível no Portal do Condômino
                                <span className="block text-xs text-gray-400 mt-0.5">
                                    Desmarque para documento interno — laudo em análise, minuta ainda não aprovada.
                                </span>
                            </span>
                        </label>
                    </div>
                </SheetPanel>
                <SheetFooter>
                    <button onClick={fecharSheet} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">Cancelar</button>
                    <button
                        onClick={salvar}
                        disabled={salvando}
                        className="h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                    >
                        {salvando
                            ? (modo === 'arquivo' ? 'Enviando...' : 'Salvando...')
                            : (modo === 'arquivo' ? 'Enviar documento' : 'Salvar documento')}
                    </button>
                </SheetFooter>
            </Sheet>

            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default DocumentosTab;
