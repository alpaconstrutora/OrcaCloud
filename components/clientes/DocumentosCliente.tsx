// components/clientes/DocumentosCliente.tsx
// Documentos do cliente — tabela + envio (15/11/2026).
// Plano: docs/planos/2026-11-15-cliente-aba-documentos.md
//
// Usado em dois lugares, com os MESMOS documentos:
//  - Meus Clientes › cadastro do cliente › aba Documentos (a casa);
//  - Comercial › negociação › aba Cliente, abaixo do checklist (quem usa).
//
// O arquivo mora no GED (opura_documents, client_id). Quem carrega a lista é o
// pai (o checklist da negociação precisa dela também); este componente só
// mostra, envia, edita e exclui, e devolve a lista nova por `onDocumentosChange`.
//
// Sem <form> próprio: os botões são type="button" e a Sheet vive num portal —
// dentro do <form id="client-form"> do cadastro, nada aqui submete o cliente.
import React from 'react';
import { AlertCircle, ExternalLink, FileText, Paperclip, Upload } from 'lucide-react';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import { useStore } from '../../store/useStore';
import { useWritableOrganizations } from '../../hooks/useOrgContext';
import type { OpuraDocument } from '../../types/documents';
import {
    chaveDoDocumento, rotuloDoTipo, situacaoDaValidade, tiposDoCliente,
    TIPO_DOCUMENTO_CLIENTE_OUTRO, type MetaDocumentoCliente,
} from '../../types/clienteDocumentos';
import {
    clienteDocumentosService as svc, erroDoArquivo, EXTENSOES_ACEITAS, TAMANHO_MAXIMO_BYTES,
} from '../../services/clienteDocumentosService';

export interface ClienteDosDocumentos {
    id: string;
    organization_id?: string | null;
    name?: string | null;
    type?: string | null;
}

// ─── Régua (§21 / §30) ──────────────────────────────────────────────────────

const ROTULO = 'block text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none';
const BOTAO_PRIMARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0 whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none';
const TD = 'text-sm font-normal';

const COLUNAS: StandardTableColumn[] = [
    { key: 'nome', label: 'Documento', sortable: true, width: 300 },
    { key: 'tipo', label: 'Tipo', sortable: true, width: 230 },
    { key: 'validade', label: 'Validade', sortable: true, width: 170 },
    { key: 'tamanho', label: 'Tamanho', sortable: true, width: 100, align: 'right' },
    { key: 'enviado', label: 'Enviado em', sortable: true, width: 120 },
    { key: 'por', label: 'Enviado por', sortable: true, width: 200, defaultHidden: true },
];

// ─── Formatação ─────────────────────────────────────────────────────────────

export function formatarData(iso?: string | null): string {
    if (!iso) return '—';
    const [a, m, d] = iso.slice(0, 10).split('-');
    return d && m && a ? `${d}/${m}/${a}` : '—';
}

function formatarTamanho(bytes?: number | null): string {
    if (bytes == null) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

function semExtensao(nome: string): string {
    const i = nome.lastIndexOf('.');
    return i > 0 ? nome.slice(0, i) : nome;
}

/** Rótulo da coluna Tipo: o do checklist (pela chave) ou o texto livre gravado no GED. */
function tipoExibido(d: OpuraDocument): string {
    const chave = chaveDoDocumento(d);
    if (chave && chave !== TIPO_DOCUMENTO_CLIENTE_OUTRO.key) return rotuloDoTipo(chave) ?? d.tipo_documento ?? '—';
    return d.tipo_documento || '—';
}

export function rotuloDaValidade(d: Pick<OpuraDocument, 'data_validade' | 'alerta_dias_antecedencia'>): { texto: string; cor: string } {
    const { situacao, dias } = situacaoDaValidade(d);
    if (situacao === 'sem_validade') return { texto: 'Não vence', cor: 'text-gray-600' };
    const data = formatarData(d.data_validade);
    if (situacao === 'vencido') return { texto: `Vencido em ${data}`, cor: 'text-red-700' };
    if (situacao === 'vencendo') return { texto: dias === 0 ? 'Vence hoje' : `Vence em ${dias} dia${dias === 1 ? '' : 's'}`, cor: 'text-amber-700' };
    return { texto: data, cor: 'text-gray-600' };
}

// ─── Abrir arquivo e permissão ──────────────────────────────────────────────

/**
 * Abre o arquivo numa aba nova. A aba nasce no CLIQUE — `window.open` depois de
 * um `await` é bloqueado como pop-up.
 */
export async function abrirDocumentoCliente(doc: OpuraDocument, onErro: (msg: string) => void) {
    const janela = window.open('', '_blank');
    try {
        const url = await svc.urlDoArquivo(doc);
        if (janela) janela.location.href = url;
        else window.open(url, '_blank', 'noopener');
    } catch (err) {
        janela?.close();
        onErro(err instanceof Error ? err.message : 'Não foi possível abrir o arquivo.');
    }
}

/**
 * Motivo de NÃO poder gravar documentos deste cliente, ou `null` se pode. O
 * documento é da organização DO CLIENTE (não da do seletor do topo): cliente
 * compartilhado de outra organização é só leitura aqui.
 */
export function useMotivoSemEscrita(cliente: ClienteDosDocumentos): string | null {
    const gravaveis = useWritableOrganizations();
    const todas = useStore(s => s.organizations);
    if (!cliente.organization_id) return 'Este cliente não tem organização definida.';
    if (gravaveis.some(o => o.id === cliente.organization_id)) return null;
    const nome = todas.find(o => o.id === cliente.organization_id)?.name;
    return `Os documentos deste cliente são da organização ${nome || 'dona do cadastro'}, em que você não pode gravar.`;
}

// ─── Sheet de envio / edição ────────────────────────────────────────────────

interface EnviarProps {
    open: boolean;
    onClose: () => void;
    cliente: ClienteDosDocumentos;
    /** Presente = editando este documento. */
    documento?: OpuraDocument | null;
    /** Tipo já escolhido (item do checklist da negociação). */
    tipoInicial?: string;
    onSalvo: (doc: OpuraDocument, editado: boolean) => void;
    onErro: (msg: string) => void;
}

interface FormEnvio { tipo: string; tipoLivre: string; nome: string; validade: string }

function formInicial(documento: OpuraDocument | null | undefined, tipoInicial: string | undefined, tipos: { key: string; label: string }[]): FormEnvio {
    if (documento) {
        const chave = chaveDoDocumento(documento) ?? TIPO_DOCUMENTO_CLIENTE_OUTRO.key;
        return {
            tipo: chave,
            tipoLivre: chave === TIPO_DOCUMENTO_CLIENTE_OUTRO.key ? (documento.tipo_documento ?? '') : '',
            nome: documento.nome,
            validade: documento.data_validade ?? '',
        };
    }
    const tipo = tipoInicial ?? tipos[0]?.key ?? TIPO_DOCUMENTO_CLIENTE_OUTRO.key;
    return { tipo, tipoLivre: '', nome: '', validade: '' };
}

export const EnviarDocumentoClienteSheet: React.FC<EnviarProps> = ({
    open, onClose, cliente, documento, tipoInicial, onSalvo, onErro,
}) => {
    const fileRef = React.useRef<HTMLInputElement>(null);
    // ids únicos: a Sheet fechada continua no DOM, e a negociação com dois
    // compradores monta quatro destas — id fixo faria todo <label> apontar
    // para o campo da primeira.
    const uid = React.useId();
    const idDe = (campo: string) => `${uid}-${campo}`;
    const tipos = React.useMemo(() => {
        const base = tiposDoCliente(cliente.type);
        // Tipo gravado que não está na lista atual (cliente PF que virou PJ) continua escolhível.
        const atual = documento ? chaveDoDocumento(documento) : tipoInicial;
        if (atual && !base.some(t => t.key === atual)) return [{ key: atual, label: rotuloDoTipo(atual) ?? atual }, ...base];
        return base;
    }, [cliente.type, documento, tipoInicial]);

    const [form, setForm] = React.useState<FormEnvio>(() => formInicial(documento, tipoInicial, tipos));
    const [arquivo, setArquivo] = React.useState<File | null>(null);
    const [erroArquivo, setErroArquivo] = React.useState<string | null>(null);
    const [sujo, setSujo] = React.useState(false);
    const [salvando, setSalvando] = React.useState(false);

    // Cada abertura começa do documento (ou do tipo) pedido.
    React.useEffect(() => {
        if (!open) return;
        setForm(formInicial(documento, tipoInicial, tipos));
        setArquivo(null);
        setErroArquivo(null);
        setSujo(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, documento?.id, tipoInicial]);

    const campo = <K extends keyof FormEnvio>(k: K, v: FormEnvio[K]) => {
        setForm(f => ({ ...f, [k]: v }));
        setSujo(true);
    };

    const escolher = (f: File | null) => {
        if (!f) return;
        const problema = erroDoArquivo(f);
        setErroArquivo(problema);
        if (problema) return;
        setArquivo(f);
        // Nome sugerido: o do tipo (RG / CNH…) ou, em "Outro", o do arquivo.
        setForm(prev => {
            if (prev.nome.trim()) return prev;
            const rotulo = prev.tipo === TIPO_DOCUMENTO_CLIENTE_OUTRO.key ? null : rotuloDoTipo(prev.tipo);
            return { ...prev, nome: rotulo ?? semExtensao(f.name) };
        });
    };

    const editando = !!documento;
    const motivoDesligado = salvando
        ? 'Salvando…'
        : !editando && !arquivo
            ? 'Escolha o arquivo a enviar.'
            : !form.nome.trim()
                ? 'Dê um nome ao documento.'
                : editando && !sujo && !arquivo
                    ? 'Nada foi alterado.'
                    : null;

    const salvar = async () => {
        if (motivoDesligado) return;
        const meta: MetaDocumentoCliente = {
            tipo: form.tipo,
            tipoLivre: form.tipoLivre,
            nome: form.nome,
            data_validade: form.validade || null,
        };
        setSalvando(true);
        try {
            const doc = documento
                ? await svc.atualizar(documento, meta, arquivo)
                : await svc.enviar({ id: cliente.id, organization_id: cliente.organization_id! }, arquivo!, meta);
            onSalvo(doc, editando);
        } catch (err) {
            onErro(err instanceof Error ? err.message : 'Erro ao salvar o documento.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="md" dirty={(sujo || !!arquivo) && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{documento ? documento.nome : 'Enviar documento'}</SheetTitle>
                <SheetDescription>
                    {cliente.name ? `${cliente.name} · ` : ''}Fica em Meus Clientes e no GED, e o comercial usa nas negociações deste cliente.
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                    <div className="space-y-1.5 sm:col-span-2">
                        <span className={ROTULO}>{documento ? 'Enviar nova versão' : 'Arquivo'}</span>
                        <input
                            ref={fileRef}
                            type="file"
                            accept={EXTENSOES_ACEITAS}
                            className="hidden"
                            aria-hidden="true"
                            tabIndex={-1}
                            onChange={ev => { escolher(ev.target.files?.[0] ?? null); ev.target.value = ''; }}
                        />
                        {arquivo ? (
                            <div className="flex items-center gap-3 p-3 rounded-[6px] border border-gray-100 bg-gray-50">
                                <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                                <span className="flex-1 min-w-0 truncate text-sm text-gray-900" title={arquivo.name}>{arquivo.name}</span>
                                <span className="text-sm text-gray-500 shrink-0">{formatarTamanho(arquivo.size)}</span>
                                <button type="button" onClick={() => setArquivo(null)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Remover</button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                onDragOver={ev => ev.preventDefault()}
                                onDrop={ev => { ev.preventDefault(); escolher(ev.dataTransfer.files?.[0] ?? null); }}
                                className="w-full flex flex-col items-center gap-2 py-8 rounded-[10px] border border-dashed border-gray-300 bg-gray-50 hover:bg-white transition-colors"
                            >
                                <Upload className="w-6 h-6 text-gray-400" />
                                <span className="text-sm font-medium text-gray-700">Clique ou arraste o arquivo aqui</span>
                                <span className="text-xs text-gray-500">
                                    {documento
                                        ? 'Opcional. A versão atual fica guardada no histórico do GED.'
                                        : `PDF, imagem, Word, Excel ou ZIP · até ${TAMANHO_MAXIMO_BYTES / 1048576} MB`}
                                </span>
                            </button>
                        )}
                        {erroArquivo && (
                            <p className="flex items-center gap-1.5 text-sm text-red-600">
                                <AlertCircle className="w-4 h-4 shrink-0" /> {erroArquivo}
                            </p>
                        )}
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                        <label className={ROTULO} htmlFor={idDe('tipo')}>Tipo</label>
                        <select id={idDe('tipo')} className={CAMPO} value={form.tipo} onChange={ev => campo('tipo', ev.target.value)}>
                            {tipos.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                    </div>
                    {form.tipo === TIPO_DOCUMENTO_CLIENTE_OUTRO.key && (
                        <div className="space-y-1.5 sm:col-span-2">
                            <label className={ROTULO} htmlFor={idDe('tipo-livre')}>Que documento é</label>
                            <input id={idDe('tipo-livre')} className={CAMPO} value={form.tipoLivre}
                                onChange={ev => campo('tipoLivre', ev.target.value)} placeholder="Ex: Certidão de casamento, Procuração" />
                        </div>
                    )}
                    <div className="space-y-1.5 sm:col-span-2">
                        <label className={ROTULO} htmlFor={idDe('nome')}>Nome</label>
                        <input id={idDe('nome')} className={CAMPO} value={form.nome}
                            onChange={ev => campo('nome', ev.target.value)} placeholder="Ex: RG – frente e verso" />
                    </div>
                    <div className="space-y-1.5">
                        <label className={ROTULO} htmlFor={idDe('validade')}>Validade</label>
                        <input id={idDe('validade')} type="date" className={CAMPO} value={form.validade}
                            onChange={ev => campo('validade', ev.target.value)} />
                        <p className="text-xs text-gray-500">Deixe em branco se não vence.</p>
                    </div>
                </div>
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={onClose} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">
                    {documento ? 'Voltar' : 'Cancelar'}
                </button>
                <span title={motivoDesligado ?? undefined}>
                    <button type="button" onClick={salvar} disabled={!!motivoDesligado} className={BOTAO_PRIMARIO}>
                        {salvando ? 'Salvando...' : documento ? 'Salvar alterações' : 'Enviar documento'}
                    </button>
                </span>
            </SheetFooter>
        </Sheet>
    );
};

// ─── Tabela ─────────────────────────────────────────────────────────────────

interface TabelaProps {
    cliente: ClienteDosDocumentos;
    /** Documentos DESTE cliente (o pai já filtrou). */
    documentos: OpuraDocument[];
    onDocumentosChange: (proximos: (atual: OpuraDocument[]) => OpuraDocument[]) => void;
    loading?: boolean;
    onNotificar: (msg: string, tipo?: 'success' | 'error') => void;
    /** Chave de colunas/busca da StandardTable — uma por tela. */
    storageKey: string;
}

const DocumentosClienteTabela: React.FC<TabelaProps> = ({
    cliente, documentos, onDocumentosChange, loading, onNotificar, storageKey,
}) => {
    const confirm = useConfirm();
    const navigateToFocus = useStore(s => s.navigateToFocus);
    const motivoSemEscrita = useMotivoSemEscrita(cliente);

    const [envioAberto, setEnvioAberto] = React.useState(false);
    const [editando, setEditando] = React.useState<OpuraDocument | null>(null);

    const abrir = (d: OpuraDocument) => abrirDocumentoCliente(d, msg => onNotificar(msg, 'error'));

    const excluir = async (d: OpuraDocument) => {
        const ok = await confirm({
            title: 'Excluir o documento?',
            message: `"${d.nome}" é apagado de Meus Clientes e do GED, com todas as versões. Some também do checklist das negociações deste cliente. Esta ação não pode ser desfeita.`,
            variant: 'danger', confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await svc.excluir(d);
            onDocumentosChange(prev => prev.filter(x => x.id !== d.id));
            onNotificar('Documento excluído.');
        } catch (err) { onNotificar(err instanceof Error ? err.message : 'Erro ao excluir.', 'error'); }
    };

    const celula = (key: string, d: OpuraDocument): React.ReactNode => {
        switch (key) {
            case 'nome':
                return (
                    <span className={`flex items-center gap-1.5 min-w-0 ${TD} text-blue-600`} title={d.nome}>
                        <Paperclip className="w-3.5 h-3.5 shrink-0" />
                        <span className="block truncate">{d.nome}</span>
                    </span>
                );
            case 'tipo': {
                const t = tipoExibido(d);
                return <span className={`block truncate ${TD} text-gray-700`} title={t}>{t}</span>;
            }
            case 'validade': {
                const v = rotuloDaValidade(d);
                return <span className={`${TD} ${v.cor} whitespace-nowrap`}>{v.texto}</span>;
            }
            case 'tamanho': return <span className={`${TD} text-gray-600`}>{formatarTamanho(d.active_version?.tamanho)}</span>;
            case 'enviado': return <span className={`${TD} text-gray-600 whitespace-nowrap`}>{formatarData(d.created_at)}</span>;
            case 'por': return <span className={`block truncate ${TD} text-gray-600`} title={d.criado_por}>{d.criado_por || '—'}</span>;
            default: return null;
        }
    };

    const ordem = (key: string, d: OpuraDocument): string | number | null => {
        switch (key) {
            case 'nome': return d.nome.toLowerCase();
            case 'tipo': return tipoExibido(d).toLowerCase();
            case 'validade': return d.data_validade ?? '9999-12-31';
            case 'tamanho': return d.active_version?.tamanho ?? -1;
            case 'enviado': return d.created_at ?? '';
            case 'por': return (d.criado_por ?? '').toLowerCase();
            default: return null;
        }
    };

    const fechar = () => { setEnvioAberto(false); setEditando(null); };

    return (
        <>
            <StandardTable<OpuraDocument>
                storageKey={storageKey}
                searchScope={cliente.id}
                columns={COLUNAS}
                rows={documentos}
                rowKey={d => d.id}
                loading={loading}
                renderCell={celula}
                sortValue={ordem}
                defaultSort={{ column: 'enviado', direction: 'desc' }}
                searchText={d => `${d.nome} ${tipoExibido(d)}`}
                searchPlaceholder="Buscar por nome ou tipo..."
                onRowClick={d => d.active_version?.storage_path && abrir(d)}
                rowLabel={d => `${d.nome}. Abrir o arquivo`}
                toolbarRight={
                    <span title={motivoSemEscrita ?? undefined}>
                        <button type="button" onClick={() => { setEditando(null); setEnvioAberto(true); }}
                            disabled={!!motivoSemEscrita} className={BOTAO_PRIMARIO}>
                            <Upload className="w-[15px] h-[15px]" />
                            Enviar documento
                        </button>
                    </span>
                }
                actions={{
                    width: 150,
                    render: d => (
                        <div className="flex items-center justify-end gap-1.5">
                            <span className="inline-flex" title={motivoSemEscrita ?? 'Editar'}>
                                <ActionIconButton kind="edit" title="Editar" disabled={!!motivoSemEscrita}
                                    onClick={ev => { ev.stopPropagation(); setEditando(d); setEnvioAberto(true); }} />
                            </span>
                            <ActionIconButton
                                kind="view"
                                icon={<ExternalLink className="w-4 h-4" />}
                                title="Abrir no GED"
                                onClick={ev => { ev.stopPropagation(); navigateToFocus('opura-docs', d.id, 'GED_DOCUMENTO'); }}
                            />
                            <span className="inline-flex" title={motivoSemEscrita ?? 'Excluir'}>
                                <ActionIconButton kind="delete" title="Excluir" disabled={!!motivoSemEscrita}
                                    onClick={ev => { ev.stopPropagation(); excluir(d); }} />
                            </span>
                        </div>
                    ),
                }}
                empty={{
                    icon: <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhum documento',
                    subtitle: 'Envie RG, CPF, comprovantes e certidões do cliente. Os mesmos documentos aparecem no checklist das negociações dele.',
                }}
            />

            <EnviarDocumentoClienteSheet
                open={envioAberto}
                onClose={fechar}
                cliente={cliente}
                documento={editando}
                onErro={msg => onNotificar(msg, 'error')}
                onSalvo={(doc, editado) => {
                    onDocumentosChange(prev => editado ? prev.map(x => (x.id === doc.id ? doc : x)) : [doc, ...prev]);
                    fechar();
                    onNotificar(editado ? 'Documento salvo.' : 'Documento enviado. Já aparece nas negociações deste cliente.');
                }}
            />
        </>
    );
};

export default DocumentosClienteTabela;

/** Aviso flutuante — mesmo da aba Documentos do Empreendimento. */
export const AvisoFlutuante: React.FC<{ aviso: { message: string; type: 'success' | 'error' } | null }> = ({ aviso }) =>
    aviso ? (
        <div role="status" className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
            aviso.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
            <AlertCircle className="w-4 h-4 shrink-0" />
            {aviso.message}
        </div>
    ) : null;

/** Estado do aviso flutuante (4,5 s). */
export function useAvisoFlutuante() {
    const [aviso, setAviso] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const notificar = React.useCallback((message: string, type: 'success' | 'error' = 'success') => {
        if (timer.current) clearTimeout(timer.current);
        setAviso({ message, type });
        timer.current = setTimeout(() => setAviso(null), 4500);
    }, []);
    React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
    return { aviso, notificar };
}
