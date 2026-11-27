import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, FileText, Loader2, Paperclip, Upload } from 'lucide-react';
import {
    CardHeader, GhostButton, PortalCard, PortalEmpty, PortalLoading, PrimaryButton, StatusPill, Td, TextLinkButton, Th, fmtDate,
} from '../portal/PortalKit';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import { usePersistedState } from '../ui/TableUtils';
import { sindicoPortalService, type CondominioDoSindico, type IdentidadeDoSindico } from '../../services/sindicoPortalService';
import type { DocumentoCategoria } from '../../services/condominioComunicacaoService';
import {
    ACEITA_ARQUIVO, ROTULO_CATEGORIA_DOCUMENTO, motivoNaoEnvia, motivoNaoMostra, motivoNaoRemoveDocumento, tituloDoArquivo,
    type DocumentoDoPredio,
} from '../../utils/documentosDoSindico';
import { MOTIVO_SEM_LOGIN } from '../../utils/financeiroDoSindico';

/**
 * Portal do Síndico › Documentos (G5, 26/11/2026).
 * Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
 * Pronto quando: documento enviado pelo síndico aparece para o morador se marcado visível.
 *
 * O arquivo sobe pela Edge `sindico-portal-documentos` (`finalidade=documento`): o banco
 * autoriza (síndico logado ou a administradora pelo app) e a service_role grava no bucket
 * do condomínio. "Visível ao morador" é o que o Portal do Cliente mostra. Remover apaga a
 * linha no banco e a Edge tira o arquivo. Ata e procuração de assembleia ficam com a
 * assembleia (não saem; a procuração nunca vai ao portal).
 */

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]';
const CAMPO_DO_TOPO = 'h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]';

interface Props {
    identidade: IdentidadeDoSindico;
    condominios: CondominioDoSindico[];
    /** Pode gravar: síndico com e-mail e senha, sessão do link, ou a administradora pelo app. */
    logado: boolean;
    notify: (m: string, t?: 'success' | 'error') => void;
    /** O Portal do Cliente (e a visão geral) leem do payload do portal: reler depois de mudar. */
    onAlterado: () => void;
}

const Acao: React.FC<{ motivo: string | null; onClick: () => void; children: React.ReactNode }> = ({ motivo, onClick, children }) => (
    <span title={motivo ?? undefined} className={motivo ? 'cursor-not-allowed' : undefined}>
        <TextLinkButton onClick={onClick} disabled={!!motivo} className={motivo ? 'pointer-events-none text-gray-300 disabled:opacity-100' : ''}>
            {children}
        </TextLinkButton>
    </span>
);

const PainelDocumentosDoSindico: React.FC<Props> = ({ identidade, condominios, logado, notify, onAlterado }) => {
    const confirm = useConfirm();
    const [salvo, setCondominioId] = usePersistedState<string>('sindicoPortal:documentos:condominio', condominios[0]?.id ?? '');
    const condominioId = condominios.some(c => c.id === salvo) ? salvo : (condominios[0]?.id ?? '');
    const [lista, setLista] = React.useState<DocumentoDoPredio[] | null>(null);
    const [motivoDoPredio, setMotivoDoPredio] = React.useState<string | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);
    const [versao, setVersao] = React.useState(0);
    const [enviando, setEnviando] = React.useState(false);
    const [ocupado, setOcupado] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!condominioId) return;
        let vivo = true;
        setErro(null);
        sindicoPortalService.getDocumentos(identidade, condominioId)
            .then(r => { if (vivo) { setLista(r.documentos); setMotivoDoPredio(r.motivoNaoOpera); } })
            .catch(e => { if (vivo) { setLista(null); setErro(e instanceof Error ? e.message : 'Não foi possível carregar os documentos.'); } });
        return () => { vivo = false; };
    }, [identidade, condominioId, versao]);

    const motivoBase = !logado ? MOTIVO_SEM_LOGIN : !lista ? 'Carregando o condomínio…' : motivoDoPredio;
    const recarregar = () => { setVersao(v => v + 1); onAlterado(); };

    const abrir = async (d: DocumentoDoPredio) => {
        // Aba nova ANTES do await (depois dele o navegador trata como popup).
        const janela = window.open('', '_blank');
        if (janela) janela.opener = null;
        try {
            const url = await sindicoPortalService.abrirDocumento(identidade, d.id);
            if (janela) janela.location.href = url; else window.open(url, '_blank', 'noopener');
        } catch (e) {
            janela?.close();
            notify(e instanceof Error ? e.message : 'Não foi possível abrir o documento.', 'error');
        }
    };

    const alternar = async (d: DocumentoDoPredio) => {
        setOcupado(d.id);
        try {
            await sindicoPortalService.visibilidadeDocumento(identidade, condominioId, d.id, !d.visivelPortal);
            notify(d.visivelPortal ? 'O documento saiu do portal dos moradores.' : 'O documento agora aparece no portal dos moradores.');
            recarregar();
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Não foi possível mudar a visibilidade.', 'error');
        } finally {
            setOcupado(null);
        }
    };

    const remover = async (d: DocumentoDoPredio) => {
        const ok = await confirm({
            title: `Remover "${d.titulo}"?`,
            message: d.visivelPortal
                ? 'O documento sai daqui e do portal dos moradores, e o arquivo é apagado. Esta ação não pode ser desfeita.'
                : 'O documento e o arquivo são apagados. Esta ação não pode ser desfeita.',
            confirmLabel: 'Remover', variant: 'danger',
        });
        if (!ok) return;
        setOcupado(d.id);
        try {
            await sindicoPortalService.removerDocumento(identidade, condominioId, d.id);
            notify('Documento removido.');
            recarregar();
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Não foi possível remover o documento.', 'error');
        } finally {
            setOcupado(null);
        }
    };

    return (
        <>
            <PortalCard>
                <CardHeader
                    title="Documentos do condomínio"
                    subtitle="Convenção, regulamento, atas, laudos, seguros — e o que os moradores veem"
                    right={
                        <div className="flex flex-wrap items-center gap-3">
                            {condominios.length > 1 && (
                                <label className="flex items-center gap-2 text-[13px] text-[#8A8F9A] min-w-0">
                                    Condomínio
                                    <select value={condominioId} onChange={e => setCondominioId(e.target.value)} className={`${CAMPO_DO_TOPO} min-w-0 max-w-[16rem]`}>
                                        {condominios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                    </select>
                                </label>
                            )}
                            <span title={motivoBase ?? undefined}>
                                <PrimaryButton onClick={() => setEnviando(true)} disabled={!!motivoBase} className={motivoBase ? 'pointer-events-none' : ''}>
                                    <Upload className="w-4 h-4" /> Enviar documento
                                </PrimaryButton>
                            </span>
                        </div>
                    }
                />
                {erro ? (
                    <p className="px-5 pb-5 text-sm text-[#4A505C] flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /> {erro}</p>
                ) : !lista ? (
                    <PortalLoading label="Carregando os documentos..." />
                ) : lista.length === 0 ? (
                    <PortalEmpty icon={<FileText className="w-8 h-8" />} title="Nenhum documento"
                        subtitle="Envie a convenção, o regulamento interno e os laudos — e escolha o que os moradores podem ver." />
                ) : (
                    <div className="overflow-x-auto border-t border-[#ECECEF]">
                        <table className="w-full min-w-[760px]">
                            <thead className="border-b border-[#ECECEF]">
                                <tr><Th>Documento</Th><Th>Categoria</Th><Th>Enviado em</Th><Th>Moradores</Th><Th>Ações</Th></tr>
                            </thead>
                            <tbody className="divide-y divide-[#ECECEF]">
                                {lista.map(d => (
                                    <tr key={d.id} className="hover:bg-gray-50/70 transition-colors align-top">
                                        <Td className="text-[#1F2430]">
                                            {d.titulo}
                                            <span className="block text-[11px] text-gray-400 max-w-[360px] truncate" title={d.descricao ?? undefined}>
                                                {d.descricao || d.arquivo || '—'}
                                            </span>
                                        </Td>
                                        <Td>{ROTULO_CATEGORIA_DOCUMENTO[d.categoria] ?? d.categoria}</Td>
                                        <Td className="whitespace-nowrap">{fmtDate(d.criadoEm.slice(0, 10))}</Td>
                                        <Td><StatusPill tone={d.visivelPortal ? 'good' : 'muted'}>{d.visivelPortal ? 'Visível' : 'Interno'}</StatusPill></Td>
                                        <Td className="whitespace-nowrap">
                                            <span className="inline-flex items-center gap-3">
                                                <TextLinkButton onClick={() => abrir(d)}>Abrir</TextLinkButton>
                                                <Acao motivo={ocupado === d.id ? 'Gravando…' : motivoNaoMostra(d, motivoBase)} onClick={() => alternar(d)}>
                                                    {d.visivelPortal ? 'Esconder' : 'Mostrar'}
                                                </Acao>
                                                <Acao motivo={ocupado === d.id ? 'Gravando…' : motivoNaoRemoveDocumento(d, motivoBase)} onClick={() => remover(d)}>Remover</Acao>
                                            </span>
                                        </Td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {motivoBase && lista && <p className="px-5 py-3 text-xs text-gray-500">{motivoBase}</p>}
            </PortalCard>

            <EnviarDocumentoSheet open={enviando} identidade={identidade} condominioId={condominioId}
                onClose={() => setEnviando(false)}
                onSalvo={m => { setEnviando(false); notify(m); recarregar(); }} />
        </>
    );
};

const EnviarDocumentoSheet: React.FC<{
    open: boolean; identidade: IdentidadeDoSindico; condominioId: string;
    onClose: () => void; onSalvo: (m: string) => void;
}> = ({ open, identidade, condominioId, onClose, onSalvo }) => {
    const [arquivo, setArquivo] = React.useState<File | null>(null);
    const [titulo, setTitulo] = React.useState('');
    const [categoria, setCategoria] = React.useState<DocumentoCategoria>('OUTRO');
    const [visivel, setVisivel] = React.useState(true);
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        if (!open) return;
        setArquivo(null); setTitulo(''); setCategoria('OUTRO'); setVisivel(true); setErro(null);
        if (inputRef.current) inputRef.current.value = '';
    }, [open]);

    const escolher = (f: File | null) => {
        setArquivo(f);
        if (f && !titulo.trim()) setTitulo(tituloDoArquivo(f.name));
    };

    const motivo = salvando ? 'Enviando…' : motivoNaoEnvia({ titulo, arquivo });

    const salvar = async () => {
        if (motivo || !arquivo) return;
        setSalvando(true);
        setErro(null);
        try {
            await sindicoPortalService.enviarDocumento(identidade, condominioId, { titulo: titulo.trim(), categoria, visivelPortal: visivel, arquivo });
            onSalvo(visivel ? 'Documento enviado. Ele já aparece no portal dos moradores.' : 'Documento enviado (interno: os moradores não veem).');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível enviar o documento.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="md" dirty={(!!arquivo || !!titulo.trim()) && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Enviar documento</SheetTitle>
                <SheetDescription>PDF, Word, Excel ou imagem, até 50 MB</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                    <div className="space-y-1.5">
                        <span className={ROTULO}>Arquivo *</span>
                        <input ref={inputRef} type="file" accept={ACEITA_ARQUIVO} className="hidden" aria-label="Arquivo do documento"
                            onChange={e => escolher(e.target.files?.[0] ?? null)} />
                        <div className="flex items-center gap-3">
                            <GhostButton onClick={() => inputRef.current?.click()}><Paperclip className="w-4 h-4" /> {arquivo ? 'Trocar arquivo' : 'Escolher arquivo'}</GhostButton>
                            <span className="text-sm text-[#4A505C] truncate">{arquivo ? arquivo.name : 'Nenhum arquivo escolhido'}</span>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className={ROTULO} htmlFor="doc-titulo">Título *</label>
                        <input id="doc-titulo" className={CAMPO} value={titulo} maxLength={300} placeholder="Ex.: Laudo do SPDA 2026" onChange={e => setTitulo(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={ROTULO} htmlFor="doc-categoria">Categoria</label>
                        <select id="doc-categoria" className={CAMPO} value={categoria} onChange={e => setCategoria(e.target.value as DocumentoCategoria)}>
                            {(Object.keys(ROTULO_CATEGORIA_DOCUMENTO) as DocumentoCategoria[]).map(c => <option key={c} value={c}>{ROTULO_CATEGORIA_DOCUMENTO[c]}</option>)}
                        </select>
                    </div>
                    <label className="flex items-start gap-2 text-sm text-[#1F2430]">
                        <input type="checkbox" checked={visivel} onChange={e => setVisivel(e.target.checked)} className="accent-[#E1553C] mt-0.5" />
                        <span>Visível para os moradores<span className="block text-xs text-gray-500">Aparece no Portal do Cliente de quem mora ou é dono de unidade.</span></span>
                    </label>
                </div>
            </SheetPanel>
            <SheetFooter>
                <div className="flex items-center justify-end gap-3 w-full">
                    {erro && <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="w-4 h-4 shrink-0" /> {erro}</p>}
                    <GhostButton onClick={onClose}>Cancelar</GhostButton>
                    <span title={motivo ?? undefined}>
                        <PrimaryButton onClick={salvar} disabled={!!motivo} className={motivo ? 'pointer-events-none' : ''}>
                            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Enviar
                        </PrimaryButton>
                    </span>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

export default PainelDocumentosDoSindico;
