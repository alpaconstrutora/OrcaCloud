/**
 * Portais › Portal do Investidor › Comunicados — a visão do GESTOR (criar, ler, editar, publicar,
 * excluir). Pedido de 16/11/2026: "portais > portal do investidor > aba comunicados : implementar
 * CRUD". Plano: docs/planos/2026-11-16-investidor-comunicados-crud.md.
 *
 * - A organização vem do topo (REGRA #5): "Todas" lista sem filtro e, ao criar, pergunta onde.
 *   Antes a aba listava pela organização do INVESTIDOR selecionado.
 * - Comunicado com aceite/voto de investidor fica travado: ele confirmou AQUELE texto, e excluir
 *   apagaria as respostas em cascata. O serviço confere de novo na hora de gravar.
 * - O investidor lê no portal (PortalAnnouncements, pelo link) — esta tela é só do app interno,
 *   fora da exceção §24: segue o guia inteiro.
 */
import React from 'react';
import { Bell, Plus, Loader2, Info, MessageSquareText } from 'lucide-react';
import {
    announcementsService,
    AnnouncementBlockedError,
    ANNOUNCEMENT_TYPE_LABELS,
    VOTE_LABELS,
    type AnnouncementDraft,
    type AnnouncementResponse,
    type AnnouncementType,
    type InvestorAnnouncement,
} from '../../services/announcementsService';
import { useOrgContext, useOrgWriteTarget, targetOrgIds, errorMessage } from '../../hooks/useOrgContext';
import { useStore } from '../../store/useStore';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../ui/confirm';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { SecaoTitulo } from '../ui/SecaoTitulo';

const COLUMNS: StandardTableColumn[] = [
    { key: 'title', label: 'Título', sortable: true, width: 340 },
    { key: 'type', label: 'Tipo', sortable: true, width: 140 },
    { key: 'status', label: 'Situação', sortable: true, width: 130 },
    { key: 'published_at', label: 'Publicado em', sortable: true, width: 140 },
    { key: 'respostas', label: 'Respostas', sortable: true, width: 120, align: 'right' },
];
/** Só em "Todas as organizações": com uma organização no topo a coluna repetiria o topo (§18). */
const COLUNA_ORGANIZACAO: StandardTableColumn = { key: 'org', label: 'Organização', sortable: true, width: 200 };

const ROTULO = 'block text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 border border-gray-200 rounded-[6px] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed';
const AREA_DE_TEXTO = 'w-full px-3 py-2 border border-gray-200 rounded-[6px] bg-white text-sm text-gray-900 placeholder:text-gray-400 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y disabled:bg-gray-50 disabled:cursor-not-allowed';
const BOTAO_PRIMARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';
const BOTAO_SECUNDARIO = 'flex items-center gap-1.5 h-9 px-3.5 border border-gray-200 bg-white text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all disabled:opacity-50 disabled:cursor-not-allowed';
const BOTAO_SUTIL = 'h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] disabled:opacity-50';

const publicado = (a: InvestorAnnouncement) => !!a.published_at;
const respostas = (a: InvestorAnnouncement) => a.ack_count ?? 0;
/** Pede resposta do investidor (aceite, ou voto na votação). */
const pedeResposta = (a: Pick<InvestorAnnouncement, 'type' | 'requires_acknowledgment'>) =>
    a.requires_acknowledgment || a.type === 'votacao';
const dataCurta = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const motivoTravado = (a: InvestorAnnouncement) => {
    const n = respostas(a);
    return n > 0 ? `Já tem ${n} resposta${n === 1 ? '' : 's'} de investidor: o texto fica como foi confirmado.` : null;
};

type Edicao = { modo: 'novo' } | { modo: 'existente'; item: InvestorAnnouncement };

const AnnouncementsManager: React.FC = () => {
    const { orgId } = useOrgContext();
    const organizations = useStore(s => s.organizations);
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const { showToast } = useToast();
    const confirm = useConfirm();

    const [items, setItems] = React.useState<InvestorAnnouncement[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [edicao, setEdicao] = React.useState<Edicao | null>(null);
    const [publicando, setPublicando] = React.useState<string | null>(null);

    const nomeDaOrg = React.useCallback(
        (id: string) => organizations.find(o => o.id === id)?.name ?? '',
        [organizations],
    );

    // Trocar o topo no meio do carregamento não pode deixar a resposta antiga por cima da nova.
    const pedido = React.useRef(0);
    React.useEffect(() => {
        const meu = ++pedido.current;
        setLoading(true);
        announcementsService.listAll(orgId)
            .then(lista => { if (meu === pedido.current) setItems(lista); })
            .catch(err => {
                if (meu !== pedido.current) return;
                console.error('Erro ao carregar comunicados', err);
                showToast(errorMessage(err, 'Não foi possível carregar os comunicados.'), 'error');
            })
            .finally(() => { if (meu === pedido.current) setLoading(false); });
    }, [orgId, showToast]);

    // §22 — atualiza a lista local; a contagem de respostas vem da linha que já estava na tela.
    const aplicar = React.useCallback((salvo: InvestorAnnouncement) => {
        setItems(prev => prev.some(i => i.id === salvo.id)
            ? prev.map(i => i.id === salvo.id ? { ...i, ...salvo, ack_count: salvo.ack_count ?? i.ack_count } : i)
            : [salvo, ...prev]);
    }, []);

    const confirmarPublicacao = React.useCallback(async (titulo: string, organizationId: string) => {
        const org = nomeDaOrg(organizationId);
        return confirm({
            title: 'Publicar comunicado?',
            message: `"${titulo}" passa a aparecer no portal para os investidores${org ? ` de ${org}` : ' da organização'}.`,
            confirmLabel: 'Publicar',
        });
    }, [confirm, nomeDaOrg]);

    const publicarDaLinha = async (item: InvestorAnnouncement) => {
        if (!(await confirmarPublicacao(item.title, item.organization_id))) return;
        setPublicando(item.id!);
        try {
            aplicar(await announcementsService.publish(item.id!));
            showToast('Comunicado publicado.');
        } catch (err) {
            showToast(errorMessage(err, 'Não foi possível publicar.'), 'error');
        } finally {
            setPublicando(null);
        }
    };

    const excluir = async (item: InvestorAnnouncement): Promise<boolean> => {
        const ok = await confirm({
            title: 'Excluir comunicado?',
            message: publicado(item)
                ? `"${item.title}" some do portal dos investidores. Essa ação não pode ser desfeita.`
                : `O rascunho "${item.title}" será apagado. Essa ação não pode ser desfeita.`,
            confirmLabel: 'Excluir',
            variant: 'danger',
        });
        if (!ok) return false;
        try {
            await announcementsService.remove(item.id!);
            setItems(prev => prev.filter(i => i.id !== item.id));
            showToast('Comunicado excluído.');
            return true;
        } catch (err) {
            if (err instanceof AnnouncementBlockedError) {
                // Chegou resposta depois que a lista carregou: a tela passa a mostrar a trava.
                setItems(prev => prev.map(i => i.id === item.id ? { ...i, ack_count: err.respostas } : i));
            }
            showToast(errorMessage(err, 'Não foi possível excluir.'), 'error');
            return false;
        }
    };

    const columns = orgId ? COLUMNS : [...COLUMNS, COLUNA_ORGANIZACAO];

    return (
        <>
            <StandardTable<InvestorAnnouncement>
                storageKey="investidor:comunicados:gestor"
                columns={columns}
                rows={items}
                rowKey={a => a.id!}
                rowLabel={a => a.title}
                loading={loading}
                searchText={a => `${a.title} ${a.body} ${ANNOUNCEMENT_TYPE_LABELS[a.type] ?? a.type} ${nomeDaOrg(a.organization_id)}`}
                searchPlaceholder="Buscar comunicado..."
                defaultSort={{ column: 'published_at', direction: 'desc' }}
                sortValue={(key, a) => {
                    switch (key) {
                        case 'type': return ANNOUNCEMENT_TYPE_LABELS[a.type] ?? a.type;
                        case 'status': return publicado(a) ? 'Publicado' : 'Rascunho';
                        // Rascunho (sem data) vai para o topo na ordem decrescente: é o que pede ação.
                        case 'published_at': return a.published_at ?? '9999';
                        case 'respostas': return respostas(a);
                        case 'org': return nomeDaOrg(a.organization_id);
                        default: return a.title;
                    }
                }}
                renderCell={(key, a) => {
                    switch (key) {
                        case 'type':
                            return <span className="text-sm font-normal text-gray-700">{ANNOUNCEMENT_TYPE_LABELS[a.type] ?? a.type}</span>;
                        case 'status':
                            return publicado(a)
                                ? <span className="text-sm font-normal text-green-700">Publicado</span>
                                : <span className="text-sm font-normal text-gray-600">Rascunho</span>;
                        case 'published_at':
                            return <span className="text-sm font-normal text-gray-700">{dataCurta(a.published_at) || '—'}</span>;
                        case 'respostas':
                            return <span className="text-sm font-normal text-gray-700">
                                {publicado(a) && (pedeResposta(a) || respostas(a) > 0) ? respostas(a) : '—'}
                            </span>;
                        case 'org':
                            return <span className="text-sm font-normal text-gray-700">{nomeDaOrg(a.organization_id) || '—'}</span>;
                        default:
                            return <span className="text-sm font-normal text-gray-900">{a.title}</span>;
                    }
                }}
                onRowClick={a => setEdicao({ modo: 'existente', item: a })}
                actions={{
                    width: 130,
                    render: a => {
                        const travado = motivoTravado(a);
                        return (
                            <div className="flex items-center justify-end gap-1.5">
                                {!publicado(a) && (
                                    <button
                                        type="button"
                                        onClick={() => publicarDaLinha(a)}
                                        disabled={publicando === a.id}
                                        className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all disabled:opacity-50"
                                    >
                                        Publicar
                                    </button>
                                )}
                                {/* Botão desligado não mostra o próprio title (pointer-events-none): o motivo vai no span. */}
                                <span className="inline-flex" title={travado ?? undefined}>
                                    <ActionIconButton kind="delete" disabled={!!travado} onClick={() => excluir(a)} />
                                </span>
                            </div>
                        );
                    },
                }}
                toolbarRight={
                    <button type="button" onClick={() => setEdicao({ modo: 'novo' })} className={BOTAO_PRIMARIO}>
                        <Plus className="w-[15px] h-[15px]" />
                        Novo comunicado
                    </button>
                }
                empty={{
                    icon: <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhum comunicado',
                    subtitle: 'O comunicado nasce como rascunho e só aparece no portal depois de publicado.',
                    acao: { rotulo: 'Novo comunicado', onClick: () => setEdicao({ modo: 'novo' }) },
                }}
            />

            <AnnouncementSheet
                edicao={edicao}
                onClose={() => setEdicao(null)}
                nomeDaOrg={nomeDaOrg}
                resolverOrganizacao={async () => {
                    const alvo = await resolveWriteOrg('single');
                    return alvo ? targetOrgIds(alvo)[0] ?? null : null;
                }}
                confirmarPublicacao={confirmarPublicacao}
                onSalvo={(salvo, msg) => { aplicar(salvo); showToast(msg); }}
                onErro={msg => showToast(msg, 'error')}
                onExcluir={excluir}
                onTravado={(id, n) => setItems(prev => prev.map(i => i.id === id ? { ...i, ack_count: n } : i))}
            />
            {orgTargetModal}
        </>
    );
};

// ─── Painel lateral: criar / editar / ver ──────────────────────────────────────

interface SheetProps {
    edicao: Edicao | null;
    onClose: () => void;
    nomeDaOrg: (id: string) => string;
    /** Organização de um comunicado NOVO: o topo, ou a escolha no modal em "Todas". */
    resolverOrganizacao: () => Promise<string | null>;
    confirmarPublicacao: (titulo: string, organizationId: string) => Promise<boolean>;
    onSalvo: (salvo: InvestorAnnouncement, mensagem: string) => void;
    onErro: (mensagem: string) => void;
    onExcluir: (item: InvestorAnnouncement) => Promise<boolean>;
    onTravado: (id: string, respostas: number) => void;
}

const VAZIO: AnnouncementDraft = { title: '', body: '', type: 'comunicado', requires_acknowledgment: false };

const AnnouncementSheet: React.FC<SheetProps> = ({
    edicao, onClose, nomeDaOrg, resolverOrganizacao, confirmarPublicacao, onSalvo, onErro, onExcluir, onTravado,
}) => {
    const item = edicao?.modo === 'existente' ? edicao.item : null;
    const inicial: AnnouncementDraft = React.useMemo(() => item
        ? { title: item.title, body: item.body, type: item.type, requires_acknowledgment: item.requires_acknowledgment }
        : VAZIO, [item]);

    const confirm = useConfirm();
    const [form, setForm] = React.useState<AnnouncementDraft>(inicial);
    const [salvando, setSalvando] = React.useState(false);
    const [lista, setLista] = React.useState<AnnouncementResponse[] | null>(null);

    React.useEffect(() => { setForm(inicial); }, [inicial]);

    const mostraRespostas = !!item && publicado(item) && (pedeResposta(item) || respostas(item) > 0);
    React.useEffect(() => {
        setLista(null);
        if (!mostraRespostas || !item?.id) return;
        let vivo = true;
        announcementsService.listResponses(item.id)
            .then(r => { if (vivo) setLista(r); })
            .catch(err => { console.error('Erro ao carregar respostas', err); if (vivo) setLista([]); });
        return () => { vivo = false; };
    }, [item?.id, mostraRespostas]);

    if (!edicao) return null;

    const travado = item ? motivoTravado(item) : null;
    const dirty = !travado && (form.title !== inicial.title || form.body !== inicial.body
        || form.type !== inicial.type || form.requires_acknowledgment !== inicial.requires_acknowledgment);
    const incompleto = !form.title.trim() || !form.body.trim();
    const motivoDesligado = salvando ? 'Salvando…' : incompleto ? 'Preencha o título e o texto.' : null;
    const ehRascunho = !item || !publicado(item);
    // Publicado: "Salvar alterações" sem alteração não faz nada — desligado, com o motivo à vista.
    const motivoDoBotao = motivoDesligado ?? (!ehRascunho && !dirty ? 'Nada foi alterado.' : null);

    const dados = (): AnnouncementDraft => ({ ...form, title: form.title.trim(), body: form.body.trim() });

    const falhou = (err: unknown, fallback: string) => {
        if (err instanceof AnnouncementBlockedError && item?.id) onTravado(item.id, err.respostas);
        onErro(errorMessage(err, fallback));
    };

    /** Grava; `publicar` = também publica (rascunho) — com confirmação, porque o investidor passa a ver. */
    const salvar = async (publicar: boolean) => {
        if (motivoDesligado) return;
        // Destino da GRAVAÇÃO: o do próprio comunicado, ou (novo) o topo / a escolha no modal.
        const destino = item ? item.organization_id : await resolverOrganizacao();
        if (destino == null) return;   // cancelou a escolha da organização no modal
        if (publicar && !(await confirmarPublicacao(dados().title, destino))) return;
        // Publicado (ainda sem resposta): o investidor pode já ter lido a versão anterior.
        if (item && publicado(item) && !(await confirm({
            title: 'Salvar alterações?',
            message: 'Este comunicado já está publicado: os investidores passam a ver o texto novo no portal.',
            confirmLabel: 'Salvar',
            variant: 'warning',
        }))) return;
        setSalvando(true);
        try {
            if (!item) {
                const novo = await announcementsService.create(destino, dados(), publicar);
                onSalvo(novo, publicar ? 'Comunicado publicado.' : 'Rascunho salvo.');
            } else {
                let salvo = dirty ? await announcementsService.update(item.id!, dados()) : item;
                if (publicar) salvo = await announcementsService.publish(item.id!);
                onSalvo(salvo, publicar ? 'Comunicado publicado.' : 'Alterações salvas.');
            }
            onClose();
        } catch (err) {
            falhou(err, 'Não foi possível salvar o comunicado.');
        } finally {
            setSalvando(false);
        }
    };

    const excluir = async () => {
        if (!item) return;
        if (await onExcluir(item)) onClose();
    };

    const titulo = !item ? 'Novo comunicado' : travado ? 'Comunicado' : 'Editar comunicado';
    const descricao = !item
        ? 'Fica como rascunho até você publicar.'
        : [
            ANNOUNCEMENT_TYPE_LABELS[item.type] ?? item.type,
            publicado(item) ? `publicado em ${dataCurta(item.published_at)}` : 'rascunho',
            nomeDaOrg(item.organization_id),
        ].filter(Boolean).join(' · ');

    return (
        // zIndex 60: no celular a barra inferior do InvestorDashboard é `fixed z-50` e vem depois no DOM —
        // com o 50 padrão ela cobria o rodapé da gaveta (Salvar/Publicar), medido a 390 px.
        <Sheet open onClose={onClose} size="lg" dirty={dirty && !salvando} zIndex={60}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{titulo}</SheetTitle>
                <SheetDescription>{descricao}</SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-8">
                {travado && (
                    <div className="flex gap-2 rounded-[10px] border border-amber-100 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                        <Info className="w-4 h-4 shrink-0 mt-0.5" />
                        <p>{travado} Para corrigir ou complementar, publique um novo comunicado.</p>
                    </div>
                )}

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="comunicado-titulo" className={ROTULO}>Título</label>
                        <input
                            id="comunicado-titulo"
                            type="text"
                            value={form.title}
                            disabled={!!travado}
                            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                            placeholder="Ex.: Assembleia de prestação de contas — março"
                            className={CAMPO}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label htmlFor="comunicado-tipo" className={ROTULO}>Tipo</label>
                            <select
                                id="comunicado-tipo"
                                value={form.type}
                                disabled={!!travado}
                                // Votação pede resposta: marca o aceite junto (o investidor confirma no portal).
                                onChange={e => {
                                    const type = e.target.value as AnnouncementType;
                                    setForm(f => ({ ...f, type, requires_acknowledgment: type === 'votacao' ? true : f.requires_acknowledgment }));
                                }}
                                className={CAMPO}
                            >
                                {(Object.keys(ANNOUNCEMENT_TYPE_LABELS) as AnnouncementType[]).map(t => (
                                    <option key={t} value={t}>{ANNOUNCEMENT_TYPE_LABELS[t]}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-end">
                            <label className="flex items-center gap-2 h-9 cursor-pointer text-sm text-gray-800">
                                <input
                                    type="checkbox"
                                    checked={form.requires_acknowledgment}
                                    disabled={!!travado}
                                    onChange={e => setForm(f => ({ ...f, requires_acknowledgment: e.target.checked }))}
                                    className="w-4 h-4 accent-blue-600"
                                />
                                Pedir confirmação de leitura
                            </label>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="comunicado-texto" className={ROTULO}>Texto</label>
                        <textarea
                            id="comunicado-texto"
                            rows={9}
                            value={form.body}
                            disabled={!!travado}
                            onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                            placeholder="O que o investidor precisa saber."
                            className={AREA_DE_TEXTO}
                        />
                    </div>
                </div>

                {mostraRespostas && (
                    <div className="space-y-4">
                        <SecaoTitulo
                            icon={MessageSquareText}
                            titulo="Respostas dos investidores"
                            resumo={lista ? `${lista.length}` : undefined}
                        />
                        {lista === null ? (
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                                <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
                            </div>
                        ) : lista.length === 0 ? (
                            <p className="text-sm text-gray-500">Nenhum investidor respondeu ainda.</p>
                        ) : (
                            <ul className="divide-y divide-gray-100 rounded-[10px] border border-gray-100">
                                {lista.map(r => (
                                    <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                                        <span className="text-gray-900 truncate">{r.investor_name ?? 'Investidor'}</span>
                                        <span className="flex items-center gap-4 shrink-0 text-gray-700">
                                            {r.vote_option && <span>{VOTE_LABELS[r.vote_option] ?? r.vote_option}</span>}
                                            <span>{dataCurta(r.acknowledged_at)}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </SheetPanel>

            <SheetFooter>
                {item && !travado && (
                    <button type="button" onClick={excluir} disabled={salvando}
                        className="mr-auto h-9 px-3.5 text-[13px] font-medium text-red-600 hover:bg-red-50 rounded-[6px] disabled:opacity-50">
                        Excluir
                    </button>
                )}
                {travado ? (
                    <button type="button" onClick={onClose} className={BOTAO_SECUNDARIO}>Fechar</button>
                ) : (
                    <>
                        {motivoDoBotao && !salvando && (
                            <span className="text-xs text-gray-500 mr-1">{motivoDoBotao}</span>
                        )}
                        <button type="button" onClick={onClose} disabled={salvando} className={BOTAO_SUTIL}>Cancelar</button>
                        {ehRascunho ? (
                            <>
                                <button type="button" onClick={() => salvar(false)} disabled={!!motivoDesligado}
                                    title={motivoDesligado ?? undefined} className={BOTAO_SECUNDARIO}>
                                    Salvar rascunho
                                </button>
                                <button type="button" onClick={() => salvar(true)} disabled={!!motivoDesligado}
                                    title={motivoDesligado ?? undefined} className={BOTAO_PRIMARIO}>
                                    {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Publicar
                                </button>
                            </>
                        ) : (
                            <button type="button" onClick={() => salvar(false)} disabled={!!motivoDoBotao}
                                title={motivoDoBotao ?? undefined} className={BOTAO_PRIMARIO}>
                                {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                                Salvar alterações
                            </button>
                        )}
                    </>
                )}
            </SheetFooter>
        </Sheet>
    );
};

export default AnnouncementsManager;
