/**
 * Boletos a Pagar › Captura por e-mail — caixas conectadas, remetentes
 * monitorados e o histórico do que foi lido.
 *
 * Plano: docs/planos/2026-10-15-captura-boletos-por-email.md (item 4.2).
 *
 * Não existe "Caixa de Entrada" separada: o boleto capturado é uma linha de
 * Boletos a Pagar (origem = e-mail) e a revisão é o filtro "Em revisão" da aba
 * Boletos. Esta aba é configuração + histórico.
 *
 * REGRA #5: lê de `useOrgContext` (null = "Todas"); conectar caixa pede UMA org
 * (`resolveWriteOrg('single')`) porque a caixa tem dona.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Mail, Plus, RefreshCw, KeyRound, Pause, Play, FlaskConical, Inbox, Users, History,
    CheckCircle2, Copy as CopyIcon, AlertTriangle, Loader2, CalendarSearch,
} from 'lucide-react';
import { SegmentedProgress } from '../ui/SegmentedProgress';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { KpiCard } from '../ui/KpiCard';
import SecaoTitulo from '../ui/SecaoTitulo';
import { useConfirm } from '../ui/confirm';
import { useToast } from '../../hooks/useToast';
import { useOrgContext, useOrgWriteTarget } from '../../hooks/useOrgContext';
import { useStore } from '../../store/useStore';
import { formatDateBR, formatDateTimeBR } from '../ui/Format';
import { supplierService } from '../../services/supplierService';
import {
    emailCaptureService,
    ROTULO_MODO,
    ROTULO_RESULTADO,
    ROTULO_STATUS_CONTA,
    type ContaCaptura,
    type MensagemCaptura,
    type RemetenteCaptura,
    type RemetenteRascunho,
    type StatusConta,
    type ResultadoMensagem,
    type BuscaPeriodo,
    ROTULO_STATUS_BUSCA,
    progressoDaBusca,
} from '../../services/emailCaptureService';
import EmailCaptureAccountSheet from './EmailCaptureAccountSheet';
import EmailCaptureBuscaSheet from './EmailCaptureBuscaSheet';
import EmailCaptureSenderSheet, { type FornecedorDaOrg } from './EmailCaptureSenderSheet';

const COR_STATUS: Record<StatusConta, string> = {
    ativa: 'text-emerald-700', pausada: 'text-gray-600', reautenticar: 'text-red-600', desconectada: 'text-gray-500',
};
const COR_RESULTADO: Record<ResultadoMensagem, string> = {
    processando: 'text-blue-600', criado: 'text-emerald-700', duplicado: 'text-gray-600', ignorado: 'text-gray-500', erro: 'text-red-600',
};

// Larguras: as três tabelas somam ~1240px com "Ações" — a área útil do card com a
// sidebar aberta num viewport de 1600 (guia §6.1.1). Medido no harness em 15/10/2026:
// com as larguras anteriores (1360–1470px) as ações saíam pela borda.
const COLS_CONTAS: StandardTableColumn[] = [
    { key: 'usuario', label: 'Caixa', sortable: true, width: 220 },
    { key: 'organizacao', label: 'Organização', sortable: true, width: 160 },
    { key: 'status', label: 'Status', sortable: true, width: 110 },
    { key: 'modo', label: 'Remetentes lidos', sortable: true, width: 170 },
    { key: 'piloto', label: 'Piloto', sortable: true, width: 80 },
    { key: 'data_inicial', label: 'Lê desde', sortable: true, width: 110 },
    { key: 'last_sync_at', label: 'Última leitura', sortable: true, width: 140 },
    { key: 'ultimo_erro', label: 'Último erro', sortable: true, width: 150 },
];

const COLS_BUSCAS: StandardTableColumn[] = [
    { key: 'caixa', label: 'Caixa', sortable: true, width: 170 },
    { key: 'periodo', label: 'Período', sortable: true, width: 180 },
    { key: 'remetentes', label: 'Remetentes', sortable: true, width: 170 },
    { key: 'status', label: 'Situação', sortable: true, width: 120 },
    { key: 'progresso', label: 'Progresso', sortable: true, width: 170 },
    { key: 'resultado', label: 'Resultado', sortable: false, width: 200 },
    { key: 'pedida_por', label: 'Pedida por', sortable: true, width: 120 },
];

const COR_BUSCA: Record<BuscaPeriodo['status'], string> = {
    pendente: 'text-blue-700', em_andamento: 'text-blue-700', concluida: 'text-emerald-700', cancelada: 'text-gray-500', erro: 'text-red-600',
};
const dataBR = (d: string) => d.split('-').reverse().join('/');

const COLS_REMETENTES: StandardTableColumn[] = [
    { key: 'nome', label: 'Remetente', sortable: true, width: 160 },
    { key: 'endereco', label: 'E-mail ou domínio', sortable: true, width: 210 },
    { key: 'fornecedor', label: 'Fornecedor', sortable: true, width: 170 },
    { key: 'caixa', label: 'Caixa', sortable: true, width: 160 },
    { key: 'palavras', label: 'Palavras-chave', sortable: true, width: 120 },
    { key: 'senha', label: 'Senha do PDF', sortable: true, width: 120 },
    { key: 'importacao', label: 'Importação', sortable: true, width: 110 },
    { key: 'ativo', label: 'Situação', sortable: true, width: 100 },
];

const COLS_MENSAGENS: StandardTableColumn[] = [
    { key: 'data', label: 'Recebido em', sortable: true, width: 140 },
    { key: 'remetente', label: 'Remetente', sortable: true, width: 190 },
    { key: 'assunto', label: 'Assunto', sortable: true, width: 190 },
    { key: 'anexo', label: 'Anexo', sortable: true, width: 150 },
    { key: 'dmarc', label: 'DMARC', sortable: true, width: 90 },
    { key: 'resultado', label: 'Resultado', sortable: true, width: 140 },
    { key: 'motivo', label: 'Detalhe', sortable: true, width: 180 },
];

const TRINTA_DIAS_MS = 30 * 24 * 3600 * 1000;

interface Props {
    /** Abre o boleto criado a partir de uma mensagem (o pai troca para o formulário). */
    onAbrirBoleto?: (boletoId: string) => void;
}

const EmailCapturaConfig: React.FC<Props> = ({ onAbrirBoleto }) => {
    const { orgId } = useOrgContext();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const organizations = useStore(s => s.organizations);
    const confirm = useConfirm();
    const { showToast, localToast } = useToast();

    const [contas, setContas] = useState<ContaCaptura[]>([]);
    const [remetentes, setRemetentes] = useState<RemetenteCaptura[]>([]);
    const [mensagens, setMensagens] = useState<MensagemCaptura[]>([]);
    const [buscas, setBuscas] = useState<BuscaPeriodo[]>([]);
    const [sheetBusca, setSheetBusca] = useState<{ aberto: boolean; conta: ContaCaptura | null }>({ aberto: false, conta: null });
    const [fornecedores, setFornecedores] = useState<FornecedorDaOrg[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erroCarga, setErroCarga] = useState<string | null>(null);
    const [sincronizando, setSincronizando] = useState<string | null>(null);

    const [sheetConta, setSheetConta] = useState<{ aberto: boolean; orgId: string | null; reconectar: ContaCaptura | null }>({ aberto: false, orgId: null, reconectar: null });
    const [sheetRemetente, setSheetRemetente] = useState<{ aberto: boolean; remetente: RemetenteCaptura | null; prefill: Partial<RemetenteRascunho> | null }>({ aberto: false, remetente: null, prefill: null });

    const carregar = useCallback(async () => {
        setCarregando(true);
        setErroCarga(null);
        try {
            const [c, r, m, f, b] = await Promise.all([
                emailCaptureService.listarContas(orgId),
                emailCaptureService.listarRemetentes(orgId),
                emailCaptureService.listarMensagens(orgId),
                supplierService.listSuppliers(orgId ?? undefined).catch(() => []),
                // Buscas por período não podem derrubar a aba se falharem.
                emailCaptureService.listarBuscas(orgId).catch(() => [] as BuscaPeriodo[]),
            ]);
            setBuscas(b);
            setContas(c);
            setRemetentes(r);
            setMensagens(m);
            setFornecedores(f.map(s => ({ id: s.id, name: s.name, nickname: s.nickname, document: s.document, category: s.category, organization_id: s.organization_id ?? null })));
        } catch (e) {
            setErroCarga(e instanceof Error ? e.message : String(e));
        } finally {
            setCarregando(false);
        }
    }, [orgId]);

    useEffect(() => { carregar(); }, [carregar]);

    const nomeOrg = useMemo(() => Object.fromEntries((organizations ?? []).map(o => [o.id, o.name])), [organizations]);
    const nomeFornecedor = useMemo(() => Object.fromEntries(fornecedores.map(f => [f.id, f.nickname || f.name])), [fornecedores]);
    const caixaPorId = useMemo(() => Object.fromEntries(contas.map(c => [c.id, c.usuario])), [contas]);
    const contasVisiveis = useMemo(() => contas.filter(c => c.status !== 'desconectada'), [contas]);

    const kpis = useMemo(() => {
        const desde = Date.now() - TRINTA_DIAS_MS;
        const recentes = mensagens.filter(m => new Date(m.created_at).getTime() >= desde);
        return {
            ativas: contas.filter(c => c.status === 'ativa').length,
            reconectar: contas.filter(c => c.status === 'reautenticar').length,
            criados: recentes.filter(m => m.resultado === 'criado').length,
            duplicados: recentes.filter(m => m.resultado === 'duplicado').length,
            falhas: recentes.filter(m => m.resultado === 'erro').length,
        };
    }, [contas, mensagens]);

    // ─── ações das caixas ────────────────────────────────────────────────────
    async function conectarNova() {
        const alvo = await resolveWriteOrg('single');
        if (!alvo || alvo.kind !== 'org') return;
        setSheetConta({ aberto: true, orgId: alvo.orgId, reconectar: null });
    }

    function contaPronta(conta: ContaCaptura) {
        setContas(prev => prev.some(c => c.id === conta.id) ? prev.map(c => (c.id === conta.id ? conta : c)) : [...prev, conta]);
        showToast(`Caixa ${conta.usuario} conectada. A primeira leitura acontece em até 15 minutos — ou use "Sincronizar agora".`);
    }

    async function sincronizar(conta: ContaCaptura) {
        setSincronizando(conta.id);
        try {
            const r = await emailCaptureService.sincronizarAgora(conta.id);
            showToast(r.mensagens
                ? `${r.criados} boleto(s) criado(s), ${r.duplicados} duplicado(s), ${r.ignorados} ignorado(s), ${r.erros} falha(s).`
                : 'Nenhuma mensagem nova com boleto.');
            await carregar();
        } catch (e) {
            showToast(e instanceof Error ? e.message : String(e), 'error');
        } finally {
            setSincronizando(null);
        }
    }

    async function alternarPausa(conta: ContaCaptura) {
        const novo: StatusConta = conta.status === 'pausada' ? 'ativa' : 'pausada';
        try {
            await emailCaptureService.atualizarConta(conta.id, { status: novo });
            setContas(prev => prev.map(c => (c.id === conta.id ? { ...c, status: novo } : c)));
        } catch (e) {
            showToast(e instanceof Error ? e.message : String(e), 'error');
        }
    }

    async function sairDoPiloto(conta: ContaCaptura) {
        const ok = await confirm({
            title: conta.modo_piloto ? 'Sair do modo piloto?' : 'Voltar ao modo piloto?',
            message: conta.modo_piloto
                ? 'Boletos de remetentes com importação automática passam a nascer como rascunho com fornecedor quando TUDO confere (DMARC, linha digitável, vencimento, beneficiário = fornecedor). Os demais continuam em revisão. Nada é aprovado nem pago sozinho.'
                : 'Todo boleto capturado desta caixa volta a ir para revisão.',
            variant: 'warning',
            confirmLabel: conta.modo_piloto ? 'Sair do piloto' : 'Voltar ao piloto',
        });
        if (!ok) return;
        try {
            await emailCaptureService.atualizarConta(conta.id, { modo_piloto: !conta.modo_piloto });
            setContas(prev => prev.map(c => (c.id === conta.id ? { ...c, modo_piloto: !c.modo_piloto } : c)));
        } catch (e) {
            showToast(e instanceof Error ? e.message : String(e), 'error');
        }
    }

    async function desconectar(conta: ContaCaptura) {
        const ok = await confirm({
            title: 'Desconectar caixa?',
            message: `A senha de ${conta.usuario} é apagada do cofre e a caixa deixa de ser lida. Boletos já capturados e o histórico continuam.`,
            variant: 'danger',
            confirmLabel: 'Desconectar caixa',
        });
        if (!ok) return;
        try {
            await emailCaptureService.desconectar(conta.id);
            setContas(prev => prev.map(c => (c.id === conta.id ? { ...c, status: 'desconectada' } : c)));
        } catch (e) {
            showToast(e instanceof Error ? e.message : String(e), 'error');
        }
    }

    function buscaAtualizada(b: BuscaPeriodo) {
        setBuscas(prev => [b, ...prev.filter(x => x.id !== b.id)]);
    }

    async function fecharBusca() {
        setSheetBusca({ aberto: false, conta: null });
        // O histórico ganhou linhas durante a busca: recarrega mensagens e contadores.
        try { setMensagens(await emailCaptureService.listarMensagens(orgId)); } catch { /* fica o que tinha */ }
    }

    const buscaAtivaDa = (contaId: string) => buscas.find(b => b.account_id === contaId && (b.status === 'pendente' || b.status === 'em_andamento')) ?? null;

    // ─── ações dos remetentes ────────────────────────────────────────────────
    function remetenteSalvo(r: RemetenteCaptura) {
        setRemetentes(prev => prev.some(x => x.id === r.id) ? prev.map(x => (x.id === r.id ? r : x)) : [...prev, r]);
        showToast('Remetente salvo.');
    }

    async function excluirRemetente(r: RemetenteCaptura) {
        const ok = await confirm({
            title: 'Excluir remetente monitorado?',
            message: `${r.nome || r.email || r.dominio} deixa de ser monitorado. Boletos já capturados não mudam.`,
            variant: 'danger',
            confirmLabel: 'Excluir remetente',
        });
        if (!ok) return;
        try {
            await emailCaptureService.excluirRemetente(r.id);
            setRemetentes(prev => prev.filter(x => x.id !== r.id));
        } catch (e) {
            showToast(e instanceof Error ? e.message : String(e), 'error');
        }
    }

    function favoritarDaMensagem(m: MensagemCaptura) {
        const email = (m.remetente?.match(/<([^>]+)>/)?.[1] ?? m.remetente ?? '').trim().toLowerCase();
        setSheetRemetente({ aberto: true, remetente: null, prefill: { account_id: m.account_id, tipo: 'exato', email: email || null } });
    }

    const motivoSemCaixa = contasVisiveis.length === 0 ? 'Conecte uma caixa de e-mail antes de cadastrar remetentes.' : null;

    return (
        <>
            {erroCarga && (
                <p className="rounded-[10px] border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                    Não foi possível carregar a captura por e-mail: {erroCarga}
                </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <KpiCard label="Caixas ativas" value={kpis.ativas} icon={<Mail className="w-4 h-4" />} color="blue"
                    sub={kpis.reconectar ? `${kpis.reconectar} precisa(m) reconectar` : undefined} />
                <KpiCard label="Boletos capturados" value={kpis.criados} icon={<CheckCircle2 className="w-4 h-4" />} color="emerald" sub="Últimos 30 dias" />
                <KpiCard label="Duplicados evitados" value={kpis.duplicados} icon={<CopyIcon className="w-4 h-4" />} color="gray" sub="Últimos 30 dias" />
                <KpiCard label="Falhas" value={kpis.falhas} icon={<AlertTriangle className="w-4 h-4" />} color="red" sub="Últimos 30 dias" />
            </div>

            <div className="space-y-3">
                <SecaoTitulo icon={Inbox} titulo="Caixas de e-mail" resumo={`${contasVisiveis.length} conectada(s)`}
                    acoes={(
                        <button onClick={conectarNova}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
                            <Plus className="w-[15px] h-[15px]" /> Conectar caixa
                        </button>
                    )} />
                <StandardTable<ContaCaptura>
                    storageKey="boletos:captura:contas"
                    columns={orgId ? COLS_CONTAS.filter(c => c.key !== 'organizacao') : COLS_CONTAS}
                    rows={contasVisiveis}
                    rowKey={c => c.id}
                    loading={carregando}
                    maxHeight="40vh"
                    searchText={c => `${c.usuario} ${nomeOrg[c.organization_id] ?? ''}`}
                    searchPlaceholder="Buscar caixa..."
                    sortValue={(k, c) => k === 'organizacao' ? (nomeOrg[c.organization_id] ?? '') : k === 'piloto' ? c.modo_piloto : (c as unknown as Record<string, string | null>)[k]}
                    renderCell={(k, c) => {
                        switch (k) {
                            case 'usuario': return <span className="block truncate text-sm font-normal text-gray-700" title={c.usuario}>{c.usuario}</span>;
                            case 'organizacao': return <span className="block truncate text-sm font-normal text-gray-700">{nomeOrg[c.organization_id] ?? '—'}</span>;
                            case 'status': return <span className={`text-sm font-normal ${COR_STATUS[c.status]}`}>{ROTULO_STATUS_CONTA[c.status]}</span>;
                            case 'modo': return <span className="text-sm font-normal text-gray-700">{ROTULO_MODO[c.modo]}</span>;
                            case 'piloto': return <span className="text-sm font-normal text-gray-600">{c.modo_piloto ? 'Sim' : 'Não'}</span>;
                            case 'data_inicial': return <span className="text-sm font-normal text-gray-600">{formatDateBR(c.data_inicial)}</span>;
                            case 'last_sync_at': return <span className="text-sm font-normal text-gray-600 whitespace-nowrap">{c.last_sync_at ? formatDateTimeBR(c.last_sync_at) : 'Ainda não leu'}</span>;
                            case 'ultimo_erro': return c.ultimo_erro
                                ? <span className="block truncate text-sm font-normal text-red-600" title={c.ultimo_erro}>{c.ultimo_erro}</span>
                                : <span className="text-sm font-normal text-gray-400">—</span>;
                            default: return null;
                        }
                    }}
                    actions={{
                        width: 250,
                        render: c => (
                            <div className="flex items-center justify-end gap-1.5">
                                <ActionIconButton kind="history"
                                    title={c.status !== 'ativa' ? 'Reative a caixa para buscar um período' : buscaAtivaDa(c.id) ? 'Ver a busca por período em andamento' : 'Buscar e-mails de um período'}
                                    icon={<CalendarSearch className="w-4 h-4" />}
                                    disabled={c.status !== 'ativa'} onClick={() => setSheetBusca({ aberto: true, conta: c })} />
                                <ActionIconButton kind="history" title={c.status === 'ativa' ? 'Sincronizar agora' : 'Reative a caixa para sincronizar'}
                                    icon={sincronizando === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                    disabled={c.status !== 'ativa' || !!sincronizando} onClick={() => sincronizar(c)} />
                                <ActionIconButton kind="lock" title="Reconectar (nova senha de app)" icon={<KeyRound className="w-4 h-4" />}
                                    onClick={() => setSheetConta({ aberto: true, orgId: c.organization_id, reconectar: c })} />
                                <ActionIconButton kind="settings" title={c.status === 'pausada' ? 'Reativar leitura' : 'Pausar leitura'}
                                    icon={c.status === 'pausada' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                                    disabled={c.status === 'reautenticar'} onClick={() => alternarPausa(c)} />
                                <ActionIconButton kind="settings" title={c.modo_piloto ? 'Sair do modo piloto' : 'Voltar ao modo piloto'}
                                    icon={<FlaskConical className="w-4 h-4" />} onClick={() => sairDoPiloto(c)} />
                                <ActionIconButton kind="delete" title="Desconectar caixa" onClick={() => desconectar(c)} />
                            </div>
                        ),
                    }}
                    empty={{ icon: <Mail className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhuma caixa conectada', subtitle: 'Conecte a caixa do Gmail que recebe os boletos dos fornecedores.' }}
                />
            </div>

            {buscas.length > 0 && (
                <div className="space-y-3">
                    <SecaoTitulo icon={CalendarSearch} titulo="Buscas por período" resumo="Leituras retroativas pedidas nas caixas" />
                    <StandardTable<BuscaPeriodo>
                        storageKey="boletos:captura:buscas"
                        columns={COLS_BUSCAS}
                        rows={buscas}
                        rowKey={b => b.id}
                        maxHeight="30vh"
                        sortValue={(k, b) => {
                            switch (k) {
                                case 'caixa': return caixaPorId[b.account_id] ?? '';
                                case 'periodo': return b.data_de;
                                case 'remetentes': return b.remetentes?.join(', ') ?? '';
                                case 'status': return ROTULO_STATUS_BUSCA[b.status];
                                case 'progresso': return progressoDaBusca(b) ?? -1;
                                default: return (b as unknown as Record<string, string | null>)[k];
                            }
                        }}
                        renderCell={(k, b) => {
                            switch (k) {
                                case 'caixa': return <span className="block truncate text-sm font-normal text-gray-700">{caixaPorId[b.account_id] ?? '—'}</span>;
                                case 'periodo': return <span className="text-sm font-normal text-gray-700 whitespace-nowrap">{dataBR(b.data_de)} a {dataBR(b.data_ate)}</span>;
                                case 'remetentes': return b.remetentes?.length
                                    ? <span className="block truncate text-sm font-normal text-gray-700" title={b.remetentes.join(', ')}>{b.remetentes.join(', ')}</span>
                                    : <span className="text-sm font-normal text-gray-400">Todos</span>;
                                case 'status': return <span className={`text-sm font-normal ${COR_BUSCA[b.status]}`}>{ROTULO_STATUS_BUSCA[b.status]}</span>;
                                case 'progresso': {
                                    const pct = progressoDaBusca(b);
                                    return pct == null ? <span className="text-sm font-normal text-gray-400">Contando…</span> : <SegmentedProgress percent={pct} tone="blue" />;
                                }
                                case 'resultado': return (
                                    <span className="block truncate text-sm font-normal text-gray-600" title={b.ultimo_erro ?? undefined}>
                                        {b.criados} criado(s) · {b.duplicados} já existia(m){b.erros ? ` · ${b.erros} falha(s)` : ''}
                                    </span>
                                );
                                case 'pedida_por': return <span className="block truncate text-sm font-normal text-gray-600">{b.pedida_por ?? '—'}</span>;
                                default: return null;
                            }
                        }}
                        actions={{
                            width: 110,
                            render: b => (b.status === 'pendente' || b.status === 'em_andamento') ? (
                                <button onClick={() => setSheetBusca({ aberto: true, conta: contas.find(c => c.id === b.account_id) ?? null })}
                                    className="whitespace-nowrap text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all">
                                    Acompanhar
                                </button>
                            ) : null,
                        }}
                        empty={{ title: 'Nenhuma busca' }}
                    />
                </div>
            )}

            <div className="space-y-3">
                <SecaoTitulo icon={Users} titulo="Remetentes monitorados" resumo={`${remetentes.length} cadastrado(s)`}
                    acoes={(
                        <button onClick={() => setSheetRemetente({ aberto: true, remetente: null, prefill: null })}
                            disabled={!!motivoSemCaixa} title={motivoSemCaixa ?? undefined}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-blue-600 rounded-[6px] hover:bg-blue-50 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                            <Plus className="w-[15px] h-[15px]" /> Novo remetente
                        </button>
                    )} />
                <StandardTable<RemetenteCaptura>
                    storageKey="boletos:captura:remetentes"
                    columns={COLS_REMETENTES}
                    rows={remetentes}
                    rowKey={r => r.id}
                    loading={carregando}
                    maxHeight="40vh"
                    onRowClick={r => setSheetRemetente({ aberto: true, remetente: r, prefill: null })}
                    searchText={r => `${r.nome ?? ''} ${r.email ?? ''} ${r.dominio ?? ''} ${r.supplier_id ? nomeFornecedor[r.supplier_id] ?? '' : ''}`}
                    searchPlaceholder="Buscar remetente, e-mail ou fornecedor..."
                    sortValue={(k, r) => {
                        switch (k) {
                            case 'endereco': return r.email ?? r.dominio ?? '';
                            case 'fornecedor': return r.supplier_id ? nomeFornecedor[r.supplier_id] ?? '' : '';
                            case 'caixa': return caixaPorId[r.account_id] ?? '';
                            case 'palavras': return r.palavras_chave.join(', ');
                            case 'senha': return r.pdf_senha_atualizada_em ? 1 : 0;
                            default: return (r as unknown as Record<string, string | boolean | null>)[k] as string | boolean | null;
                        }
                    }}
                    renderCell={(k, r) => {
                        switch (k) {
                            case 'nome': return <span className="block truncate text-sm font-normal text-gray-700" title={r.nome ?? undefined}>{r.nome || '—'}</span>;
                            case 'endereco': return <span className="block truncate text-sm font-normal text-gray-700">{r.tipo === 'exato' ? r.email : `@${r.dominio} (domínio)`}</span>;
                            case 'fornecedor': return <span className="block truncate text-sm font-normal text-gray-700">{r.supplier_id ? nomeFornecedor[r.supplier_id] ?? '—' : '—'}</span>;
                            case 'caixa': return <span className="block truncate text-sm font-normal text-gray-600">{caixaPorId[r.account_id] ?? '—'}</span>;
                            case 'palavras': return <span className="block truncate text-sm font-normal text-gray-600" title={r.palavras_chave.join(', ')}>{r.palavras_chave.join(', ') || '—'}</span>;
                            case 'senha': return r.pdf_senha_atualizada_em
                                ? <span className="text-sm font-normal text-emerald-700">Cadastrada</span>
                                : <span className="text-sm font-normal text-gray-400">—</span>;
                            case 'importacao': return <span className={`text-sm font-normal ${r.importacao === 'automatica' ? 'text-blue-700' : 'text-gray-600'}`}>{r.importacao === 'automatica' ? 'Automática' : 'Revisão'}</span>;
                            case 'ativo': return <span className={`text-sm font-normal ${r.ativo ? 'text-emerald-700' : 'text-gray-500'}`}>{r.ativo ? 'Ativo' : 'Inativo'}</span>;
                            default: return null;
                        }
                    }}
                    actions={{
                        width: 100,
                        render: r => (
                            <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                <ActionIconButton kind="edit" onClick={() => setSheetRemetente({ aberto: true, remetente: r, prefill: null })} />
                                <ActionIconButton kind="delete" title="Excluir remetente" onClick={() => excluirRemetente(r)} />
                            </div>
                        ),
                    }}
                    empty={{ icon: <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum remetente monitorado', subtitle: 'Cadastre os e-mails de cobrança dos fornecedores — ou adicione pelo histórico abaixo.' }}
                />
            </div>

            <div className="space-y-3">
                <SecaoTitulo icon={History} titulo="Histórico da captura" resumo="Cada anexo PDF lido, e o que aconteceu com ele" />
                <StandardTable<MensagemCaptura>
                    storageKey="boletos:captura:mensagens"
                    columns={COLS_MENSAGENS}
                    rows={mensagens}
                    rowKey={m => m.id}
                    loading={carregando}
                    pagination={{ defaultPageSize: 50 }}
                    searchText={m => `${m.remetente ?? ''} ${m.assunto ?? ''} ${m.documento_nome ?? ''} ${ROTULO_RESULTADO[m.resultado]} ${m.motivo ?? ''} ${m.erro ?? ''}`}
                    searchPlaceholder="Buscar remetente, assunto, anexo ou resultado..."
                    sortValue={(k, m) => {
                        switch (k) {
                            case 'data': return m.data_email ?? m.created_at;
                            case 'anexo': return m.documento_nome ?? '';
                            case 'dmarc': return m.auth_results?.dmarc ?? '';
                            case 'resultado': return ROTULO_RESULTADO[m.resultado];
                            case 'motivo': return m.erro ?? m.motivo ?? '';
                            default: return (m as unknown as Record<string, string | null>)[k];
                        }
                    }}
                    renderCell={(k, m) => {
                        switch (k) {
                            case 'data': return <span className="text-sm font-normal text-gray-600 whitespace-nowrap">{formatDateTimeBR(m.data_email ?? m.created_at)}</span>;
                            case 'remetente': return <span className="block truncate text-sm font-normal text-gray-700" title={m.remetente ?? undefined}>{m.remetente ?? '—'}</span>;
                            case 'assunto': return <span className="block truncate text-sm font-normal text-gray-700" title={m.assunto ?? undefined}>{m.assunto || '—'}</span>;
                            case 'anexo': return <span className="block truncate text-sm font-normal text-gray-600" title={m.documento_nome ?? undefined}>{m.documento_nome ?? '—'}</span>;
                            case 'dmarc': {
                                const d = m.auth_results?.dmarc ?? 'none';
                                return <span className={`text-sm font-normal ${d === 'pass' ? 'text-emerald-700' : d === 'none' ? 'text-gray-500' : 'text-red-600'}`}>{d === 'pass' ? 'Passou' : d === 'none' ? 'Sem dado' : 'Falhou'}</span>;
                            }
                            case 'resultado': return <span className={`text-sm font-normal ${COR_RESULTADO[m.resultado]}`}>{ROTULO_RESULTADO[m.resultado]}</span>;
                            case 'motivo': {
                                const t = m.erro ?? m.motivo;
                                return t ? <span className={`block truncate text-sm font-normal ${m.erro ? 'text-red-600' : 'text-gray-600'}`} title={t}>{t}</span>
                                    : <span className="text-sm font-normal text-gray-400">—</span>;
                            }
                            default: return null;
                        }
                    }}
                    actions={{
                        width: 160,
                        render: m => (
                            <div className="flex items-center justify-end gap-1.5">
                                {m.boleto_id && onAbrirBoleto && (
                                    <button onClick={() => onAbrirBoleto(m.boleto_id!)}
                                        className="whitespace-nowrap text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all">
                                        Ver boleto
                                    </button>
                                )}
                                <ActionIconButton kind="annotate" title="Monitorar este remetente" icon={<Plus className="w-4 h-4" />}
                                    disabled={!m.remetente} onClick={() => favoritarDaMensagem(m)} />
                            </div>
                        ),
                    }}
                    empty={{ icon: <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nada lido ainda', subtitle: 'Quando a caixa conectada receber PDFs, cada anexo aparece aqui.' }}
                />
            </div>

            <EmailCaptureAccountSheet
                open={sheetConta.aberto}
                onClose={() => setSheetConta({ aberto: false, orgId: null, reconectar: null })}
                organizationId={sheetConta.orgId}
                reconectar={sheetConta.reconectar}
                onPronta={contaPronta}
            />
            <EmailCaptureBuscaSheet
                open={sheetBusca.aberto}
                onClose={fecharBusca}
                conta={sheetBusca.conta}
                buscaAtiva={sheetBusca.conta ? buscaAtivaDa(sheetBusca.conta.id) : null}
                onAtualizada={buscaAtualizada}
                remetentesDaCaixa={sheetBusca.conta ? remetentes.filter(r => r.account_id === sheetBusca.conta!.id && r.ativo) : []}
            />
            <EmailCaptureSenderSheet
                open={sheetRemetente.aberto}
                onClose={() => setSheetRemetente({ aberto: false, remetente: null, prefill: null })}
                contas={contasVisiveis}
                fornecedores={fornecedores}
                remetente={sheetRemetente.remetente}
                prefill={sheetRemetente.prefill}
                onSalvo={remetenteSalvo}
            />
            {orgTargetModal}
            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium ${localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    {localToast.message}
                </div>
            )}
        </>
    );
};

export default EmailCapturaConfig;
