/**
 * Configurações › WhatsApp & Integrações — WhatsApp do ÒPURA (OpenWA).
 * Piloto 23/11/2026, Tarefa 8. Plano: docs/planos/2026-11-23-whatsapp-openwa-piloto-pedido.md.
 *
 * O número é UM só, da plataforma, e serve todas as organizações que o ligam:
 *   • situação do número — conectado (com o número), número desconectado (falta
 *     ler o QR na máquina) ou máquina fora. "Máquina fora" é a mesma regra do
 *     pedido (`maquinaFora`, sem sinal do worker há mais de 3 min);
 *   • owner/admin da organização do topo (ou superadmin) liga/desliga o uso e o
 *     envio automático do pedido ao marcar Enviado (RPC `wa_definir_uso`, que é
 *     quem decide de verdade). O interruptor mostra o que o banco gravou: só vira
 *     depois de gravar;
 *   • topo em "Todas as organizações": só a situação — o uso é por organização,
 *     os controles ficam desligados com o motivo (REGRA #5);
 *   • superadmin: "Mensagens sem pedido" — respostas de fornecedor que não deu
 *     para ligar a um pedido; ele atribui pelo número do pedido, com confirmação.
 */
import React from 'react';
import { CheckCircle, Loader2, Smartphone } from 'lucide-react';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import TableSwitch from '../ui/TableSwitch';
import { useConfirm } from '../ui/confirm';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useOrgContext } from '../../hooks/useOrgContext';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store/useStore';
import { temAcessoTotal } from '../../lib/acessoTotal';
import {
    whatsappOpenwaService, ErroWhatsappOpenwa, type MensagemSemPedido, type SituacaoOpenwa,
} from '../../services/whatsappOpenwaService';
import { maquinaFora } from '../../utils/canalWhatsappDoPedido';

export const MOTIVO_TODAS_OPURA = 'O uso do WhatsApp do ÒPURA é por organização — escolha uma organização no topo.';
export const MOTIVO_NAO_GESTOR_OPURA = 'Só proprietário ou administrador desta organização liga ou desliga o WhatsApp do ÒPURA.';
export const MOTIVO_NAO_MEMBRO_OPURA = 'Você não é membro da organização selecionada no topo.';
export const MOTIVO_LIGAR_USO_ANTES = 'Ligue antes "Usar o WhatsApp do ÒPURA nesta organização".';

const ROTULO_USO = 'Usar o WhatsApp do ÒPURA nesta organização';
const ROTULO_AUTO = 'Enviar o pedido automaticamente ao marcar Enviado';

const CAMPO = 'w-full px-3 h-9 bg-gray-50 border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';
const ROTULO = 'block text-xs font-semibold text-slate-500';
const BOTAO_SECUNDARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
const BOTAO_PRIMARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';

type Tom = 'ok' | 'atencao' | 'erro' | 'neutro';

/** Texto da situação do número. `conexao` null = nenhuma conexão cadastrada na plataforma. */
export function situacaoDoNumero(
    conexao: Pick<SituacaoOpenwa, 'estado' | 'numeroExibicao' | 'vistoEm'> | null,
    agoraMs: number,
): { texto: string; tom: Tom } {
    if (!conexao || !conexao.estado) return { texto: 'Nenhum número do ÒPURA cadastrado', tom: 'neutro' };
    if (maquinaFora(conexao, agoraMs)) return { texto: 'Máquina fora — os envios esperam na fila', tom: 'atencao' };
    if (conexao.estado === 'conectado') {
        return { texto: conexao.numeroExibicao ? `Conectado · ${conexao.numeroExibicao}` : 'Conectado', tom: 'ok' };
    }
    return { texto: 'Número desconectado — ler o QR no painel do OpenWA na máquina', tom: 'erro' };
}

/** Por que os controles da organização do topo ficam desligados (null = pode). Mesmos papéis de `minhas_orgs_gestor()`. */
export function motivoSemGestaoOpura(a: {
    isAllOrgs: boolean;
    superadmin: boolean;
    temLinhaDaOrg: boolean;
    membro: { role?: string | null } | null;
}): string | null {
    if (a.isAllOrgs) return MOTIVO_TODAS_OPURA;
    if (!a.temLinhaDaOrg) return MOTIVO_NAO_MEMBRO_OPURA;
    if (a.superadmin) return null;
    if (a.membro?.role === 'owner' || a.membro?.role === 'admin') return null;
    return MOTIVO_NAO_GESTOR_OPURA;
}

const COR_DO_TOM: Record<Tom, { ponto: string; texto: string }> = {
    ok: { ponto: 'bg-green-500', texto: 'text-green-700' },
    atencao: { ponto: 'bg-amber-500', texto: 'text-amber-700' },
    erro: { ponto: 'bg-red-500', texto: 'text-red-700' },
    neutro: { ponto: 'bg-gray-400', texto: 'text-gray-700' },
};

const DATA_HORA_BRT = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});
function dataHora(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : DATA_HORA_BRT.format(d).replace(',', '');
}

// Área das Configurações ~840 px: as colunas somam 640 + Ações 180, tabela `dense` (§6.9).
const COLUNAS_SEM_PEDIDO: StandardTableColumn[] = [
    { key: 'recebidoEm', label: 'Recebida em', sortable: true, width: 120 },
    { key: 'telefone', label: 'Telefone', sortable: true, width: 150 },
    { key: 'texto', label: 'Mensagem', sortable: true, width: 370 },
];

const WhatsappOpenwaSettings: React.FC = () => {
    const { orgId, isAllOrgs } = useOrgContext();
    const organizations = useStore(state => state.organizations);
    const email = useStore(state => state.session?.user?.email);
    const superadmin = temAcessoTotal(email);
    const confirm = useConfirm();
    const { showToast } = useToast();

    const [situacoes, setSituacoes] = React.useState<SituacaoOpenwa[] | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);
    const [gravando, setGravando] = React.useState(false);
    const [erroGravar, setErroGravar] = React.useState<string | null>(null);
    // "Máquina fora" depende do relógio: relê a conta a cada 30 s sem ir ao banco.
    const [agora, setAgora] = React.useState(() => Date.now());

    const [semPedido, setSemPedido] = React.useState<MensagemSemPedido[] | null>(null);
    const [erroSemPedido, setErroSemPedido] = React.useState<string | null>(null);
    const [atribuindo, setAtribuindo] = React.useState<MensagemSemPedido | null>(null);
    const [numeroPedido, setNumeroPedido] = React.useState('');
    const [buscando, setBuscando] = React.useState(false);
    const [erroAtribuir, setErroAtribuir] = React.useState<string | null>(null);

    React.useEffect(() => {
        const t = window.setInterval(() => setAgora(Date.now()), 30_000);
        return () => window.clearInterval(t);
    }, []);

    React.useEffect(() => {
        let vivo = true;
        whatsappOpenwaService.situacao()
            .then(lista => { if (vivo) { setSituacoes(lista); setErro(null); setAgora(Date.now()); } })
            .catch(e => { if (vivo) { setSituacoes([]); setErro(e instanceof Error ? e.message : String(e)); } });
        return () => { vivo = false; };
    }, []);

    React.useEffect(() => {
        if (!superadmin) return;
        let vivo = true;
        whatsappOpenwaService.listarSemPedido()
            .then(lista => { if (vivo) { setSemPedido(lista); setErroSemPedido(null); } })
            .catch(e => { if (vivo) { setSemPedido([]); setErroSemPedido(e instanceof Error ? e.message : String(e)); } });
        return () => { vivo = false; };
    }, [superadmin]);

    const nomeDaOrg = React.useCallback(
        (id: string | null) => (id && organizations.find(o => o.id === id)?.name) || 'organização não identificada',
        [organizations],
    );

    const linhaDaOrg = React.useMemo(
        () => (orgId ? (situacoes ?? []).find(s => s.organizationId === orgId) ?? null : null),
        [situacoes, orgId],
    );
    // O número é um só: a situação da conexão vale para qualquer linha.
    const conexao = linhaDaOrg ?? situacoes?.[0] ?? null;
    const situacao = situacaoDoNumero(conexao, agora);

    const membro = React.useMemo(() => {
        const emailLower = (email || '').toLowerCase();
        const org = orgId ? organizations.find(o => o.id === orgId) : undefined;
        return org?.members?.find(m => (m.email || '').toLowerCase() === emailLower) ?? null;
    }, [email, organizations, orgId]);

    const motivoGestao = motivoSemGestaoOpura({ isAllOrgs, superadmin, temLinhaDaOrg: !!linhaDaOrg, membro });
    const usa = !!linhaDaOrg?.usaNaOrg;
    const motivoUso = motivoGestao ?? (gravando ? 'Gravando…' : null);
    const motivoAuto = motivoGestao ?? (!usa ? MOTIVO_LIGAR_USO_ANTES : gravando ? 'Gravando…' : null);

    const gravar = async (usar: boolean, envioAutomatico: boolean | null) => {
        if (!linhaDaOrg) return;
        const alvo = linhaDaOrg.organizationId;
        setGravando(true);
        setErroGravar(null);
        try {
            await whatsappOpenwaService.definirUso(alvo, usar, envioAutomatico);
            // Espelha o banco: sem uso, wa_situacao devolve envio automático false; ligado pela 1ª vez, true.
            setSituacoes(prev => (prev ?? []).map(s => s.organizationId !== alvo ? s : {
                ...s,
                usaNaOrg: usar,
                envioAutomaticoPedido: usar ? (envioAutomatico ?? s.envioAutomaticoPedido) : false,
            }));
        } catch (e) {
            setErroGravar(e instanceof Error ? e.message : String(e));
        } finally {
            setGravando(false);
        }
    };

    const alternarUso = async () => {
        if (!linhaDaOrg || motivoUso) return;
        if (usa) {
            const ok = await confirm({
                title: 'Desligar o WhatsApp do ÒPURA?',
                message: `Os pedidos de ${nomeDaOrg(linhaDaOrg.organizationId)} deixam de sair pelo número do ÒPURA: o botão do WhatsApp volta para a API oficial (se configurada) ou para o WhatsApp de quem clica.`,
                variant: 'warning',
                confirmLabel: 'Desligar',
            });
            if (!ok) return;
            await gravar(false, null);
        } else {
            await gravar(true, true);
        }
    };

    const alternarAuto = async () => {
        if (!linhaDaOrg || motivoAuto) return;
        await gravar(true, !linhaDaOrg.envioAutomaticoPedido);
    };

    const emUso = (situacoes ?? []).filter(s => s.usaNaOrg).length;

    // ─── Atribuir uma mensagem sem pedido (superadmin) ───────────────────────
    const abrirAtribuir = (m: MensagemSemPedido) => { setAtribuindo(m); setNumeroPedido(''); setErroAtribuir(null); };
    const fecharAtribuir = () => { if (!buscando) { setAtribuindo(null); setErroAtribuir(null); } };
    const motivoAtribuir = !numeroPedido.trim() ? 'Informe o número do pedido.' : buscando ? 'Procurando o pedido…' : null;

    const atribuir = async () => {
        if (!atribuindo || motivoAtribuir) return;
        const msg = atribuindo;
        const numero = numeroPedido.trim();
        setBuscando(true);
        setErroAtribuir(null);
        try {
            const pedido = await whatsappOpenwaService.pedidoPeloNumero(numero);
            if (!pedido) { setErroAtribuir(`Nenhum pedido com o número ${numero}.`); return; }
            const ok = await confirm({
                title: 'Atribuir a mensagem ao pedido?',
                message: `A mensagem de ${msg.telefone || 'telefone desconhecido'} passa a ser do pedido ${pedido.numero} de ${nomeDaOrg(pedido.organizationId)} e entra no chat dele. Esta tela não desfaz a atribuição.`,
                variant: 'warning',
                confirmLabel: 'Confirmar atribuição',
            });
            if (!ok) return;
            await whatsappOpenwaService.atribuir(msg.id, pedido.id);
            setSemPedido(prev => (prev ?? []).filter(x => x.id !== msg.id));
            setAtribuindo(null);
            showToast(`Mensagem atribuída ao pedido ${pedido.numero}.`);
        } catch (e) {
            // Já atribuída por outra aba/pessoa: some da lista do mesmo jeito.
            if (e instanceof ErroWhatsappOpenwa && e.codigo === 'ja_atribuida') {
                setSemPedido(prev => (prev ?? []).filter(x => x.id !== msg.id));
            }
            setErroAtribuir(e instanceof Error ? e.message : String(e));
        } finally {
            setBuscando(false);
        }
    };

    const cor = COR_DO_TOM[situacao.tom];

    return (
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-6">
            <div className="flex items-start gap-4">
                <div className="p-3 bg-green-50 rounded-[10px]">
                    <Smartphone className="w-6 h-6 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-gray-800">WhatsApp do ÒPURA</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Um número da plataforma, compartilhado pelas organizações que o ligam. O pedido sai por ele ao
                        fornecedor e a resposta volta para o chat do pedido. Cada mensagem diz de qual empresa é o pedido.
                    </p>
                </div>
            </div>

            <div className="mt-6 border-t border-gray-100 pt-4">
                {situacoes === null ? (
                    <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : erro ? (
                    <p role="alert" className="text-sm text-red-600">Não foi possível ler a situação do WhatsApp do ÒPURA: {erro}</p>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <p className="text-xs font-semibold text-slate-500">Situação do número</p>
                            <p className="mt-1 flex items-center gap-2 text-sm">
                                <span className={`inline-block w-2 h-2 rounded-full ${cor.ponto}`} aria-hidden="true" />
                                <span className={cor.texto}>{situacao.texto}</span>
                            </p>
                            {isAllOrgs && situacoes.length > 0 && (
                                <p className="text-sm text-gray-600 mt-1">
                                    Em uso em {emUso} de {situacoes.length} {situacoes.length === 1 ? 'organização sua' : 'organizações suas'}.
                                </p>
                            )}
                        </div>

                        <ul className="divide-y divide-gray-100 border-t border-gray-100">
                            <li className="py-3 flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-900">{ROTULO_USO}</p>
                                    <p className="text-sm text-gray-600 mt-0.5">
                                        Desligado, o botão do WhatsApp do pedido segue como hoje (API oficial ou o WhatsApp de quem clica).
                                    </p>
                                </div>
                                <TableSwitch
                                    checked={usa}
                                    onChange={() => { void alternarUso(); }}
                                    ariaLabel={ROTULO_USO}
                                    disabled={!!motivoUso}
                                    title={motivoUso ?? undefined}
                                />
                            </li>
                            <li className="py-3 flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-900">{ROTULO_AUTO}</p>
                                    <p className="text-sm text-gray-600 mt-0.5">
                                        Ao marcar o pedido como Enviado, a mensagem ao fornecedor entra na fila sozinha, sem clicar no botão do WhatsApp.
                                    </p>
                                </div>
                                <TableSwitch
                                    checked={usa && !!linhaDaOrg?.envioAutomaticoPedido}
                                    onChange={() => { void alternarAuto(); }}
                                    ariaLabel={ROTULO_AUTO}
                                    disabled={!!motivoAuto}
                                    title={motivoAuto ?? undefined}
                                />
                            </li>
                        </ul>
                        {erroGravar && <p role="alert" className="text-sm text-red-600">{erroGravar}</p>}
                    </div>
                )}
            </div>

            {superadmin && (
                <div className="mt-6 border-t border-gray-100 pt-4 space-y-3">
                    <div>
                        <h3 className="text-base font-semibold text-gray-800">Mensagens sem pedido</h3>
                        <p className="text-sm text-gray-500 mt-0.5">
                            Respostas de fornecedor dos últimos 30 dias que não deu para ligar a um pedido com certeza.
                            Só superadmin vê esta lista.
                        </p>
                    </div>
                    {erroSemPedido && (
                        <p role="alert" className="text-sm text-red-600">Não foi possível ler as mensagens sem pedido: {erroSemPedido}</p>
                    )}
                    <StandardTable<MensagemSemPedido>
                        columns={COLUNAS_SEM_PEDIDO}
                        storageKey="whatsapp-openwa-sem-pedido"
                        rows={semPedido ?? []}
                        rowKey={m => m.id}
                        loading={semPedido === null}
                        dense
                        searchText={m => `${m.telefone} ${m.texto}`}
                        searchPlaceholder="Buscar por telefone ou texto..."
                        sortValue={(key, m) => (key === 'recebidoEm' ? m.recebidoEm : key === 'telefone' ? m.telefone : m.texto)}
                        renderCell={(key, m) => {
                            if (key === 'recebidoEm') return <span className="text-sm font-normal text-gray-700">{dataHora(m.recebidoEm)}</span>;
                            if (key === 'telefone') return <span className="text-sm font-normal text-gray-700">{m.telefone || '—'}</span>;
                            return <span className="block truncate text-sm font-normal text-gray-700" title={m.texto}>{m.texto}</span>;
                        }}
                        actions={{
                            width: 180,
                            render: m => (
                                <button
                                    type="button"
                                    onClick={() => abrirAtribuir(m)}
                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all"
                                >
                                    Atribuir a um pedido
                                </button>
                            ),
                        }}
                        empty={{
                            title: 'Nenhuma mensagem sem pedido',
                            subtitle: 'Quando uma resposta não puder ser ligada a um pedido com certeza, ela aparece aqui.',
                        }}
                    />
                </div>
            )}

            <Sheet open={!!atribuindo} onClose={fecharAtribuir} size="sm" dirty={!!numeroPedido.trim() && !buscando}>
                {atribuindo && (
                    <>
                        <SheetHeader onClose={fecharAtribuir}>
                            <SheetTitle>Atribuir a um pedido</SheetTitle>
                            <SheetDescription>
                                Mensagem de {atribuindo.telefone || 'telefone desconhecido'}, recebida em {dataHora(atribuindo.recebidoEm)}.
                            </SheetDescription>
                        </SheetHeader>
                        <SheetPanel className="px-6 py-5">
                            <form
                                id="form-atribuir-openwa"
                                onSubmit={e => { e.preventDefault(); void atribuir(); }}
                                className="space-y-4"
                            >
                                <p className="text-sm text-gray-700 whitespace-pre-wrap [overflow-wrap:anywhere]">{atribuindo.texto}</p>
                                <div className="space-y-1.5">
                                    <label htmlFor="openwa-numero-pedido" className={ROTULO}>Número do pedido</label>
                                    <input
                                        id="openwa-numero-pedido"
                                        autoComplete="off"
                                        value={numeroPedido}
                                        onChange={e => setNumeroPedido(e.target.value)}
                                        placeholder="ex.: PC-0007"
                                        className={CAMPO}
                                    />
                                    <p className="text-xs text-gray-500">O número aparece no cabeçalho do pedido. Antes de atribuir, a tela mostra de qual organização ele é.</p>
                                </div>
                                {erroAtribuir && <p role="alert" className="text-sm text-red-600">{erroAtribuir}</p>}
                            </form>
                        </SheetPanel>
                        <SheetFooter>
                            <span className="inline-flex" title={buscando ? 'Procurando o pedido…' : undefined}>
                                <button type="button" onClick={fecharAtribuir} disabled={buscando} className={BOTAO_SECUNDARIO}>Cancelar</button>
                            </span>
                            <span className="inline-flex" title={motivoAtribuir ?? undefined}>
                                <button type="submit" form="form-atribuir-openwa" disabled={!!motivoAtribuir} className={BOTAO_PRIMARIO}>
                                    {buscando
                                        ? <Loader2 className="w-[15px] h-[15px] animate-spin" />
                                        : <CheckCircle className="w-[15px] h-[15px]" />}
                                    Atribuir
                                </button>
                            </span>
                        </SheetFooter>
                    </>
                )}
            </Sheet>
        </div>
    );
};

export default WhatsappOpenwaSettings;
