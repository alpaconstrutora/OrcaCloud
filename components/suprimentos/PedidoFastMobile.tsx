import React from 'react';
import { ArrowLeft, Receipt, Zap, List, Loader2, ChevronRight } from 'lucide-react';
import PedidoFastFluxo, { type ObraDoFast } from './PedidoFastFluxo';
import { useConfirm } from '../ui/confirm';
import { formatMoney } from '../ui/Format';
import { useStore } from '../../store/useStore';
import { useOrgContext } from '../../hooks/useOrgContext';
import { fontePedidoFastLogado, listarMeusPedidosFast, type PedidoFastRecente } from '../../services/pedidoFastService';
import { rotuloStatusLogistico } from '../../utils/formaEntrega';

/**
 * Suprimentos › Pedidos de Compra no CELULAR (tela < 768 px) — o Pedido Fast em
 * primeiro lugar. Plano: docs/planos/2026-11-14-pedido-fast.md (Parte 1, item 8).
 *
 * A lista completa continua a um toque ("Abrir lista completa"), porque o
 * "Novo pedido" de sempre não foi tirado de ninguém — o Fast é mais uma maneira.
 */

interface Props {
    onAbrirListaCompleta: () => void;
    onVerPedido: (pedidoId: string) => void;
}

/** Obras do store (já só OBRA e sem projeto de sistema — REGRAS #2/#3), recortadas pelo topo. */
export function useObrasDoFast(): ObraDoFast[] {
    const projects = useStore(s => s.projects);
    const organizations = useStore(s => s.organizations);
    const { orgId } = useOrgContext();
    return React.useMemo(() => {
        const nomeDaOrg = new Map(organizations.map(o => [o.id, o.name]));
        return projects
            .filter(p => !!p.id)
            .map(p => ({ p, org: p.organization_id ?? p.settings?.organizationId ?? null }))
            .filter(({ org }) => !orgId || org === orgId)
            .map(({ p, org }) => ({
                id: p.id as string,
                nome: p.name,
                // Só em "Todas": com uma org no topo o contexto já está no shell (§18).
                organizacao: !orgId && org ? (nomeDaOrg.get(org) ?? null) : null,
            }));
    }, [projects, organizations, orgId]);
}

const PedidoFastMobile: React.FC<Props> = ({ onAbrirListaCompleta, onVerPedido }) => {
    const userId = useStore(s => s.session?.user?.id ?? null);
    const { orgId } = useOrgContext();
    const obras = useObrasDoFast();
    const confirm = useConfirm();
    const [fazendo, setFazendo] = React.useState(false);
    const [pendente, setPendente] = React.useState(false);
    const [recentes, setRecentes] = React.useState<PedidoFastRecente[] | null>(null);
    const [erroLista, setErroLista] = React.useState<string | null>(null);
    const [versao, setVersao] = React.useState(0);

    React.useEffect(() => {
        if (!userId) return;
        let cancelado = false;
        setErroLista(null);
        listarMeusPedidosFast(userId, orgId)
            .then(l => { if (!cancelado) setRecentes(l); })
            .catch(() => { if (!cancelado) { setRecentes([]); setErroLista('Não consegui carregar os seus Pedidos Fast.'); } });
        return () => { cancelado = true; };
    }, [userId, orgId, versao]);

    const voltar = async () => {
        if (pendente) {
            const ok = await confirm({
                title: 'Sair sem criar o pedido?',
                message: 'A foto já tirada não vira pedido se você sair agora.',
                variant: 'warning',
                confirmLabel: 'Sair',
            });
            if (!ok) return;
        }
        setFazendo(false);
        setPendente(false);
    };

    if (fazendo) {
        return (
            <div className="space-y-6 pb-20">
                <div>
                    <div className="flex items-center gap-3">
                        <button type="button" onClick={voltar} title="Voltar aos Pedidos Fast"
                            className="flex items-center justify-center h-9 w-9 -ml-2 rounded-[6px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-all shrink-0">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Pedido Fast</h1>
                    </div>
                    <p className="text-gray-500 text-sm mt-1.5 font-medium ml-12">Foto da nota e a obra. O resto é com o app.</p>
                </div>
                <PedidoFastFluxo
                    fonte={fontePedidoFastLogado}
                    obras={obras}
                    onPendenteChange={setPendente}
                    onCriado={() => setVersao(v => v + 1)}
                    onVerPedido={onVerPedido}
                />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Pedidos de Compra</h1>
                <p className="text-gray-500 text-sm mt-1.5 font-medium">Comprou no balcão? Registre em dois passos.</p>
            </div>

            <button type="button" onClick={() => setFazendo(true)}
                className="w-full flex items-center gap-4 p-4 bg-blue-600 text-white rounded-[10px] text-left active:scale-[0.99] transition-all">
                <span className="w-11 h-11 rounded-[10px] bg-white/15 flex items-center justify-center shrink-0">
                    <Zap className="w-6 h-6" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold">Novo Pedido Fast</span>
                    <span className="block text-sm text-blue-100">Tire a foto da nota ou do recibo e escolha a obra.</span>
                </span>
                <ChevronRight className="w-5 h-5 shrink-0" />
            </button>

            <section className="space-y-3">
                <h2 className="text-base font-semibold text-gray-900">Meus Pedidos Fast</h2>
                {erroLista && <p className="text-sm text-red-700">{erroLista}</p>}
                {recentes === null ? (
                    <div className="text-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
                        <p className="mt-2 text-gray-500 text-sm">Carregando...</p>
                    </div>
                ) : recentes.length === 0 ? (
                    !erroLista && (
                        <div className="text-center py-10 bg-white rounded-[10px] border border-gray-100">
                            <Receipt className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                            <p className="text-sm font-semibold text-gray-900">Nenhum Pedido Fast ainda</p>
                            <p className="text-sm text-gray-500 mt-1">Os que você fizer aparecem aqui.</p>
                        </div>
                    )
                ) : (
                    <ul className="bg-white rounded-[10px] border border-gray-100 shadow-sm divide-y divide-gray-100">
                        {recentes.map(p => (
                            <li key={p.id}>
                                <button type="button" onClick={() => onVerPedido(p.id)}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm text-gray-900">{p.numero} · {p.obraNome}</span>
                                        <span className="block text-xs text-gray-500">
                                            {new Date(p.criadoEm).toLocaleDateString('pt-BR')} · {p.quantidadeItens} {p.quantidadeItens === 1 ? 'item' : 'itens'} · {rotuloStatusLogistico(p.status, true)}
                                        </span>
                                    </span>
                                    <span className="text-sm font-medium text-gray-800 whitespace-nowrap">{formatMoney(p.total)}</span>
                                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <button type="button" onClick={onAbrirListaCompleta}
                className="w-full flex items-center justify-center gap-1.5 h-11 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px]">
                <List className="w-[15px] h-[15px]" /> Abrir lista completa de pedidos
            </button>
        </div>
    );
};

export default PedidoFastMobile;
