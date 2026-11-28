import React from 'react';
import { AlertCircle, ChevronRight, Loader2, PackageCheck, RefreshCw } from 'lucide-react';
import Button from '../../ui/Button';
import { rotuloStatusLogistico } from '../../../utils/formaEntrega';
import type { FonteRecebimento, GrupoDaLista, PedidoDaLista } from '../../../services/recebimentoFonte';
import RecebimentoDetalhe from './RecebimentoDetalhe';

/**
 * Recebimento no celular — a MESMA tela no app logado (`RecebimentoMobile`) e na aba
 * "Receber" do link `/celular` (`RecebimentoDoLink`); a fonte decide de onde vêm os
 * dados. Plano: docs/planos/2026-11-27-recebimento-mobile.md (Fases 4 e 5).
 *
 * Lista agrupada pelo que o pedido espera de quem está na obra: conferir, retirar,
 * a caminho (só leitura) e conferidos nos últimos 30 dias. Tocar abre o detalhe.
 *
 * ⚠️ A fonte PRECISA ser estável (useMemo no chamador): ela está nas dependências da carga.
 */

const GRUPOS: { id: GrupoDaLista; titulo: string; vazio?: string }[] = [
    { id: 'a_conferir', titulo: 'A conferir' },
    { id: 'a_retirar', titulo: 'A retirar' },
    { id: 'a_caminho', titulo: 'A caminho' },
    { id: 'conferidos', titulo: 'Conferidos nos últimos 30 dias' },
];

/** Cor do status (§8: texto colorido, sem pílula). */
const COR_DO_STATUS: Record<string, string> = {
    'Confirmado': 'text-gray-800', 'Separação': 'text-blue-700', 'Em Trânsito': 'text-indigo-800',
    'Entregue': 'text-amber-800', 'Recebido': 'text-green-800', 'Divergência': 'text-red-600', 'Enviado': 'text-blue-600',
};

const dataCurta = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : null);

interface Props {
    fonte: FonteRecebimento;
    /** Só no app logado: abre o pedido completo (detalhe do computador). */
    onVerPedidoCompleto?: (orderId: string) => void;
}

type Estado = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string } | { tipo: 'ok'; pedidos: PedidoDaLista[] };

const RecebimentoFluxo: React.FC<Props> = ({ fonte, onVerPedidoCompleto }) => {
    const [estado, setEstado] = React.useState<Estado>({ tipo: 'carregando' });
    const [aberto, setAberto] = React.useState<string | null>(null);
    const [versao, setVersao] = React.useState(0);

    React.useEffect(() => {
        let cancelado = false;
        setEstado(e => (e.tipo === 'ok' ? e : { tipo: 'carregando' }));
        fonte.listar()
            .then(pedidos => { if (!cancelado) setEstado({ tipo: 'ok', pedidos }); })
            .catch((e: unknown) => {
                if (!cancelado) setEstado({ tipo: 'erro', mensagem: e instanceof Error && e.message ? e.message : 'Não consegui carregar os pedidos.' });
            });
        return () => { cancelado = true; };
    }, [fonte, versao]);

    if (aberto) {
        return (
            <RecebimentoDetalhe
                fonte={fonte}
                orderId={aberto}
                onVoltar={() => setAberto(null)}
                onMudou={() => setVersao(v => v + 1)}
                onVerPedidoCompleto={onVerPedidoCompleto}
            />
        );
    }

    if (estado.tipo === 'carregando') {
        return (
            <div role="status" className="text-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" aria-hidden="true" />
                <p className="mt-2 text-gray-500 text-sm">Carregando…</p>
            </div>
        );
    }

    if (estado.tipo === 'erro') {
        const semAcesso = /sem acesso a Pedidos de Compra/i.test(estado.mensagem);
        return (
            <div role="alert" className="text-center py-12 bg-white rounded-[10px] border border-gray-100">
                <AlertCircle className="w-10 h-10 text-red-600 mx-auto mb-3" aria-hidden="true" />
                <p className="text-sm font-semibold text-gray-900 max-w-[32ch] mx-auto">
                    {semAcesso ? 'Você não tem acesso a Pedidos de Compra.' : 'Não foi possível carregar os pedidos. Verifique a conexão.'}
                </p>
                {!semAcesso && (
                    <Button variant="secondary" onClick={() => setVersao(v => v + 1)} className="mt-3">
                        <RefreshCw className="w-4 h-4" /> Tentar de novo
                    </Button>
                )}
            </div>
        );
    }

    const pedidos = estado.pedidos;
    const variasOrgs = new Set(pedidos.map(p => p.org_id)).size > 1;

    if (pedidos.length === 0) {
        return (
            <div className="text-center py-12 bg-white rounded-[10px] border border-gray-100">
                <PackageCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" aria-hidden="true" />
                <h3 className="text-lg font-bold text-gray-900 mb-2">Nada para receber</h3>
                <p className="text-sm text-gray-500 max-w-[36ch] mx-auto">Quando um pedido sair do fornecedor ou estiver pronto para retirar, ele aparece aqui.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {GRUPOS.map(g => {
                const doGrupo = pedidos.filter(p => p.grupo === g.id);
                if (doGrupo.length === 0) return null;
                return (
                    <section key={g.id} aria-labelledby={`receber-grupo-${g.id}`} className="space-y-3">
                        <h2 id={`receber-grupo-${g.id}`} className="text-base font-semibold text-gray-900">
                            {g.titulo} <span className="font-normal text-gray-500">· {doGrupo.length}</span>
                        </h2>
                        <ul className="bg-white rounded-[10px] border border-gray-100 shadow-sm divide-y divide-gray-100">
                            {doGrupo.map(p => (
                                <li key={p.id}>
                                    <button type="button" onClick={() => setAberto(p.id)}
                                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100">
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm text-gray-900 truncate">
                                                {p.numero || 'Pedido'}{p.fornecedor ? ` · ${p.fornecedor}` : ''}
                                            </span>
                                            <span className="block text-xs text-gray-500 truncate">
                                                {[p.obra, variasOrgs ? p.org_nome : null, p.previsao && g.id !== 'conferidos' ? `previsão ${dataCurta(p.previsao)}` : null,
                                                  `${p.itens} ${p.itens === 1 ? 'item' : 'itens'}`].filter(Boolean).join(' · ')}
                                            </span>
                                            <span className="flex flex-wrap gap-x-3 mt-0.5">
                                                <span className={`text-sm font-normal ${COR_DO_STATUS[p.status] || 'text-gray-600'}`}>
                                                    {rotuloStatusLogistico(p.status, p.fob)}
                                                </span>
                                                {p.divergencias_pendentes > 0 && (
                                                    <span className="text-sm font-normal text-red-600">
                                                        {p.divergencias_pendentes} {p.divergencias_pendentes === 1 ? 'divergência aberta' : 'divergências abertas'}
                                                    </span>
                                                )}
                                            </span>
                                        </span>
                                        <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
};

export default RecebimentoFluxo;
