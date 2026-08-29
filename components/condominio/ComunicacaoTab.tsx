// components/condominio/ComunicacaoTab.tsx
// Avisos e documentos do condomínio — o que o Portal do Condômino exibe.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md (F3)
//
// Duas sub-abas porque são dois ciclos diferentes: aviso é efêmero (publica,
// pessoas leem, vence) e documento é permanente (convenção, regulamento, ata).
// Juntá-los numa lista só faria o comunicado de portão quebrado disputar espaço
// com a convenção do condomínio.
import React from 'react';
import { Megaphone, FileText, Search, RefreshCw, Plus, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { usePersistedState } from '../ui/TableUtils';
import { KpiCard } from '../ui/KpiCard';
import ActionIconButton from '../ui/ActionIconButton';
import { InlineDisclosureMenu } from '../ui/inline-disclosure-menu';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import {
    condominioComunicacaoService,
    type AvisoRow, type CondominioDocumento,
    type AvisoCategoria, type DocumentoCategoria,
} from '../../services/condominioComunicacaoService';
import type { Empreendimento } from '../../types/empreendimento';

const CATEGORIA_AVISO: Record<AvisoCategoria, { rotulo: string; cor: string }> = {
    AVISO: { rotulo: 'Aviso', cor: 'text-gray-600' },
    URGENTE: { rotulo: 'Urgente', cor: 'text-red-600' },
    MANUTENCAO: { rotulo: 'Manutenção', cor: 'text-amber-600' },
    ASSEMBLEIA: { rotulo: 'Assembleia', cor: 'text-indigo-600' },
    OBRA: { rotulo: 'Obra', cor: 'text-blue-600' },
};

const CATEGORIA_DOC: Record<DocumentoCategoria, string> = {
    CONVENCAO: 'Convenção', REGULAMENTO: 'Regulamento', ATA: 'Ata',
    MANUAL: 'Manual do proprietário', LAUDO: 'Laudo', SEGURO: 'Seguro', OUTRO: 'Outro',
};

function formatarData(iso?: string | null): string {
    if (!iso) return '—';
    const [a, m, d] = iso.slice(0, 10).split('-');
    return d && m && a ? `${d}/${m}/${a}` : '—';
}

type Sub = 'avisos' | 'documentos';

interface Props { empreendimento: Empreendimento }

const ComunicacaoTab: React.FC<Props> = ({ empreendimento }) => {
    const confirm = useConfirm();
    const orgId = empreendimento.organization_id;

    const [sub, setSub] = usePersistedState<Sub>('condominio:comunicacao:sub', 'avisos');
    const [searchTerm, setSearchTerm] = usePersistedState<string>('condominio:comunicacao:search', '');

    const [avisos, setAvisos] = React.useState<AvisoRow[]>([]);
    const [documentos, setDocumentos] = React.useState<CondominioDocumento[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [salvando, setSalvando] = React.useState(false);
    const [sheetAviso, setSheetAviso] = React.useState(false);
    const [sheetDoc, setSheetDoc] = React.useState(false);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const [formAviso, setFormAviso] = React.useState<{
        titulo: string; corpo: string; categoria: AvisoCategoria; valido_ate: string;
    }>({ titulo: '', corpo: '', categoria: 'AVISO', valido_ate: '' });

    const [formDoc, setFormDoc] = React.useState<{
        titulo: string; categoria: DocumentoCategoria; url: string; descricao: string;
    }>({ titulo: '', categoria: 'CONVENCAO', url: '', descricao: '' });

    const carregar = React.useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            const [a, d] = await Promise.all([
                condominioComunicacaoService.listAvisos(empreendimento.id),
                condominioComunicacaoService.listDocumentos(empreendimento.id),
            ]);
            setAvisos(a);
            setDocumentos(d);
        } catch (e: any) {
            setErro(e?.message || 'Erro ao carregar a comunicação.');
        } finally {
            setLoading(false);
        }
    }, [empreendimento.id]);

    React.useEffect(() => { carregar(); }, [carregar]);

    const hoje = new Date().toISOString().slice(0, 10);
    const kpis = React.useMemo(() => ({
        vigentes: avisos.filter(a => !a.valido_ate || a.valido_ate >= hoje).length,
        leituras: avisos.reduce((s, a) => s + a._leituras, 0),
        docsPortal: documentos.filter(d => d.visivel_portal).length,
    }), [avisos, documentos, hoje]);

    const avisosFiltrados = React.useMemo(() => {
        const t = searchTerm.trim().toLowerCase();
        if (!t) return avisos;
        return avisos.filter(a => a.titulo.toLowerCase().includes(t) || a.corpo.toLowerCase().includes(t));
    }, [avisos, searchTerm]);

    const docsFiltrados = React.useMemo(() => {
        const t = searchTerm.trim().toLowerCase();
        if (!t) return documentos;
        return documentos.filter(d =>
            d.titulo.toLowerCase().includes(t) || (d.descricao || '').toLowerCase().includes(t));
    }, [documentos, searchTerm]);

    const publicarAviso = async () => {
        if (!formAviso.titulo.trim() || !formAviso.corpo.trim()) {
            notify('Preencha o título e o texto do aviso.', 'error');
            return;
        }
        setSalvando(true);
        try {
            const criado = await condominioComunicacaoService.createAviso({
                empreendimento_id: empreendimento.id,
                organization_id: orgId,
                titulo: formAviso.titulo.trim(),
                corpo: formAviso.corpo.trim(),
                categoria: formAviso.categoria,
                valido_ate: formAviso.valido_ate || null,
            });
            // §22 — atualiza o array local, sem recarregar a aba.
            setAvisos(prev => [{ ...criado, _leituras: 0 }, ...prev]);
            setSheetAviso(false);
            setFormAviso({ titulo: '', corpo: '', categoria: 'AVISO', valido_ate: '' });
            notify('Aviso publicado. Já aparece no portal dos condôminos.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao publicar.', 'error');
        } finally { setSalvando(false); }
    };

    const salvarDoc = async () => {
        if (!formDoc.titulo.trim() || !formDoc.url.trim()) {
            notify('Preencha o título e o endereço do documento.', 'error');
            return;
        }
        setSalvando(true);
        try {
            const criado = await condominioComunicacaoService.createDocumento({
                empreendimento_id: empreendimento.id,
                organization_id: orgId,
                titulo: formDoc.titulo.trim(),
                categoria: formDoc.categoria,
                url: formDoc.url.trim(),
                descricao: formDoc.descricao || null,
            });
            setDocumentos(prev => [criado, ...prev]);
            setSheetDoc(false);
            setFormDoc({ titulo: '', categoria: 'CONVENCAO', url: '', descricao: '' });
            notify('Documento cadastrado.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao cadastrar.', 'error');
        } finally { setSalvando(false); }
    };

    const excluirAviso = async (a: AvisoRow) => {
        const ok = await confirm({
            title: 'Excluir o aviso?',
            message: a._leituras > 0
                ? `"${a.titulo}" já foi lido por ${a._leituras} condômino(s). Excluir apaga o aviso e o registro de quem leu.`
                : `"${a.titulo}" será apagado. Esta ação não pode ser desfeita.`,
            variant: 'danger', confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await condominioComunicacaoService.removeAviso(a.id);
            setAvisos(prev => prev.filter(x => x.id !== a.id));
            notify('Aviso excluído.');
        } catch (e: any) { notify(e?.message || 'Erro ao excluir.', 'error'); }
    };

    const alternarVisibilidade = async (d: CondominioDocumento) => {
        try {
            const atualizado = await condominioComunicacaoService.setVisibilidade(d.id, !d.visivel_portal);
            setDocumentos(prev => prev.map(x => (x.id === d.id ? atualizado : x)));
            notify(atualizado.visivel_portal ? 'Visível no portal.' : 'Oculto do portal.');
        } catch (e: any) { notify(e?.message || 'Erro ao alterar.', 'error'); }
    };

    const excluirDoc = async (d: CondominioDocumento) => {
        const ok = await confirm({
            title: 'Excluir o documento?',
            message: `"${d.titulo}" sai do cadastro. O arquivo em si não é apagado — só a referência a ele.`,
            variant: 'danger', confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await condominioComunicacaoService.removeDocumento(d.id);
            setDocumentos(prev => prev.filter(x => x.id !== d.id));
            notify('Documento excluído.');
        } catch (e: any) { notify(e?.message || 'Erro ao excluir.', 'error'); }
    };

    return (
        <div className="space-y-6">
            {erro && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm">{erro}</div>
            )}

            {/* Abas antes dos KPIs: os números dizem respeito à aba ativa (§20.1). */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {([['avisos', 'Avisos'], ['documentos', 'Documentos']] as [Sub, string][]).map(([id, label]) => (
                        <button
                            key={id}
                            onClick={() => setSub(id)}
                            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                sub === id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                <KpiCard label="AVISOS VIGENTES" value={kpis.vigentes} icon={<Megaphone className="w-5 h-5" />} color="blue" />
                <KpiCard
                    label="CONFIRMAÇÕES DE LEITURA" value={kpis.leituras}
                    sub={kpis.leituras === 0 && kpis.vigentes > 0 ? 'Ninguém abriu ainda' : undefined}
                    icon={<Eye className="w-5 h-5" />}
                    color={kpis.leituras > 0 ? 'emerald' : 'gray'}
                />
                <KpiCard label="DOCUMENTOS NO PORTAL" value={kpis.docsPortal} icon={<FileText className="w-5 h-5" />} color="indigo" />
            </div>

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-2 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder={sub === 'avisos' ? 'Buscar por título ou texto...' : 'Buscar por título ou descrição...'}
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
                        <button
                            onClick={() => (sub === 'avisos' ? setSheetAviso(true) : setSheetDoc(true))}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0 whitespace-nowrap"
                        >
                            <Plus className="w-[15px] h-[15px]" />
                            {sub === 'avisos' ? 'Publicar aviso' : 'Novo documento'}
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : sub === 'avisos' ? (
                    avisosFiltrados.length === 0 ? (
                        <div className="text-center py-12">
                            <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum aviso</h3>
                            <p className="text-sm text-gray-500 max-w-md mx-auto">
                                O que for publicado aqui aparece no portal de todos os condôminos, com confirmação de leitura.
                            </p>
                        </div>
                    ) : (
                        <div className="p-4 space-y-3">
                            {avisosFiltrados.map(a => {
                                const cat = CATEGORIA_AVISO[a.categoria];
                                const vencido = !!a.valido_ate && a.valido_ate < hoje;
                                return (
                                    <div key={a.id} className={`p-4 rounded-[10px] border ${vencido ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}>
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <h3 className="text-sm font-medium text-gray-800">{a.titulo}</h3>
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    <span className={cat.cor}>{cat.rotulo}</span>
                                                    {' · '}{new Date(a.publicado_em).toLocaleDateString('pt-BR')}
                                                    {a.valido_ate ? ` · até ${formatarData(a.valido_ate)}` : ''}
                                                    {vencido ? ' · vencido' : ''}
                                                    {' · '}
                                                    <span className={a._leituras > 0 ? 'text-emerald-600' : 'text-gray-400'}>
                                                        {a._leituras} leitura{a._leituras === 1 ? '' : 's'}
                                                    </span>
                                                </p>
                                            </div>
                                            <div className="shrink-0">
                                                <InlineDisclosureMenu showDelete onDelete={() => excluirAviso(a)} />
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{a.corpo}</p>
                                    </div>
                                );
                            })}
                        </div>
                    )
                ) : docsFiltrados.length === 0 ? (
                    <div className="text-center py-12">
                        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum documento</h3>
                        <p className="text-sm text-gray-500 max-w-md mx-auto">
                            Convenção, regulamento, atas e manual do proprietário. O endereço pode ser um
                            arquivo do ÒPURA Docs ou qualquer link acessível ao condômino.
                        </p>
                    </div>
                ) : (
                    <div className="p-4 space-y-2">
                        {docsFiltrados.map(d => (
                            <div key={d.id} className="flex items-start gap-3 p-3 rounded-[10px] border border-gray-200">
                                <FileText className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <a href={d.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-600 hover:text-blue-800">
                                        {d.titulo}
                                    </a>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        {CATEGORIA_DOC[d.categoria]}
                                        {d.descricao ? ` · ${d.descricao}` : ''}
                                        {' · '}
                                        <span className={d.visivel_portal ? 'text-emerald-600' : 'text-gray-400'}>
                                            {d.visivel_portal ? 'visível no portal' : 'oculto'}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <ActionIconButton
                                        kind="view"
                                        title={d.visivel_portal ? 'Ocultar do portal' : 'Mostrar no portal'}
                                        icon={d.visivel_portal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        onClick={() => alternarVisibilidade(d)}
                                    />
                                    <InlineDisclosureMenu showDelete onDelete={() => excluirDoc(d)} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Publicar aviso */}
            <Sheet open={sheetAviso} onClose={() => setSheetAviso(false)} size="lg">
                <SheetHeader onClose={() => setSheetAviso(false)}>
                    <SheetTitle>Publicar aviso</SheetTitle>
                    <SheetDescription>{empreendimento.name}</SheetDescription>
                </SheetHeader>
                <SheetPanel>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Título</label>
                            <input
                                type="text" value={formAviso.titulo}
                                onChange={e => setFormAviso(f => ({ ...f, titulo: e.target.value }))}
                                placeholder="Ex: Manutenção do elevador na quinta-feira"
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Categoria</label>
                                <select
                                    value={formAviso.categoria}
                                    onChange={e => setFormAviso(f => ({ ...f, categoria: e.target.value as AvisoCategoria }))}
                                    className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                >
                                    {(Object.keys(CATEGORIA_AVISO) as AvisoCategoria[]).map(c => (
                                        <option key={c} value={c}>{CATEGORIA_AVISO[c].rotulo}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Válido até</label>
                                <input
                                    type="date" value={formAviso.valido_ate}
                                    onChange={e => setFormAviso(f => ({ ...f, valido_ate: e.target.value }))}
                                    className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                />
                                <p className="text-xs text-gray-400 mt-1">Em branco = sem prazo.</p>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Texto</label>
                            <textarea
                                rows={6} value={formAviso.corpo}
                                onChange={e => setFormAviso(f => ({ ...f, corpo: e.target.value }))}
                                className="mt-1 w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <p className="text-xs text-gray-400">
                            O aviso aparece imediatamente no portal de todos os condôminos com link ativo,
                            e o sistema registra quem confirmou a leitura.
                        </p>
                    </div>
                </SheetPanel>
                <SheetFooter>
                    <button onClick={() => setSheetAviso(false)} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">Cancelar</button>
                    <button onClick={publicarAviso} disabled={salvando} className="h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50">
                        {salvando ? 'Publicando...' : 'Publicar aviso'}
                    </button>
                </SheetFooter>
            </Sheet>

            {/* Novo documento */}
            <Sheet open={sheetDoc} onClose={() => setSheetDoc(false)} size="lg">
                <SheetHeader onClose={() => setSheetDoc(false)}>
                    <SheetTitle>Novo documento</SheetTitle>
                    <SheetDescription>{empreendimento.name}</SheetDescription>
                </SheetHeader>
                <SheetPanel>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Título</label>
                            <input
                                type="text" value={formDoc.titulo}
                                onChange={e => setFormDoc(f => ({ ...f, titulo: e.target.value }))}
                                placeholder="Ex: Convenção de condomínio"
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Categoria</label>
                            <select
                                value={formDoc.categoria}
                                onChange={e => setFormDoc(f => ({ ...f, categoria: e.target.value as DocumentoCategoria }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            >
                                {(Object.keys(CATEGORIA_DOC) as DocumentoCategoria[]).map(c => (
                                    <option key={c} value={c}>{CATEGORIA_DOC[c]}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Endereço do arquivo</label>
                            <input
                                type="text" value={formDoc.url}
                                onChange={e => setFormDoc(f => ({ ...f, url: e.target.value }))}
                                placeholder="https://..."
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                            <p className="text-xs text-amber-600 mt-1">
                                O link precisa ser acessível sem login — o condômino entra no portal por
                                token, não tem sessão no sistema. Arquivo em bucket privado não vai abrir.
                            </p>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Descrição</label>
                            <input
                                type="text" value={formDoc.descricao}
                                onChange={e => setFormDoc(f => ({ ...f, descricao: e.target.value }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>
                    </div>
                </SheetPanel>
                <SheetFooter>
                    <button onClick={() => setSheetDoc(false)} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">Cancelar</button>
                    <button onClick={salvarDoc} disabled={salvando} className="h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50">
                        {salvando ? 'Salvando...' : 'Salvar documento'}
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

export default ComunicacaoTab;
