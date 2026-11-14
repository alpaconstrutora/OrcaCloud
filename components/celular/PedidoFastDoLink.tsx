import React from 'react'
import { AlertCircle, Loader2, Lock } from 'lucide-react'
import Button from '../ui/Button'
import PedidoFastFluxo, { type ObraDoFast } from '../suprimentos/PedidoFastFluxo'
import { listarObrasDoLink, type FontePedidoFast } from '../../services/pedidoFastService'

/**
 * Aba "Pedido" do link do celular (`/celular?token=`): o Pedido Fast de sempre
 * (`PedidoFastFluxo`) pela fonte do link — a Edge `pedido-fast` com o token no
 * corpo. Plano: docs/planos/2026-11-14-pedido-fast.md (Parte 2).
 *
 * Carrega as obras do link (`celular_obras_listar`) uma vez por token. A recusa do
 * token não é tratada aqui: `aoRecusar` derruba o gate inteiro para "link inválido".
 * "sem acesso a Pedidos de Compra" vira tela própria (o link continua valendo para
 * Tarefas e Diário).
 *
 * Estados: carregando → ok | sem-acesso | erro (rede: "Tentar de novo").
 */

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro' }
  | { tipo: 'sem-acesso' }
  | { tipo: 'ok'; obras: ObraDoFast[] }

const PedidoFastDoLink: React.FC<{ token: string; fonte: FontePedidoFast; aoRecusar: () => void }> = ({ token, fonte, aoRecusar }) => {
  const [estado, setEstado] = React.useState<Estado>({ tipo: 'carregando' })
  const [tentativa, setTentativa] = React.useState(0)

  React.useEffect(() => {
    let cancelado = false
    setEstado({ tipo: 'carregando' })
    listarObrasDoLink(token, { aoRecusar })
      .then(obras => { if (!cancelado) setEstado({ tipo: 'ok', obras }) })
      .catch((e: Error) => {
        if (cancelado) return
        setEstado(/sem acesso a Pedidos de Compra/i.test(e.message) ? { tipo: 'sem-acesso' } : { tipo: 'erro' })
      })
    return () => { cancelado = true }
  }, [token, aoRecusar, tentativa])

  if (estado.tipo === 'carregando') {
    return (
      <div role="status" className="h-full flex flex-col items-center justify-center gap-2 text-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-800">Abrindo o Pedido Fast…</p>
      </div>
    )
  }

  if (estado.tipo === 'sem-acesso' || estado.tipo === 'erro') {
    const semAcesso = estado.tipo === 'sem-acesso'
    return (
      <div role="alert" className="h-full flex flex-col items-center justify-center gap-2 text-center">
        <div className="w-14 h-14 bg-white rounded-[10px] flex items-center justify-center shadow-sm mb-1">
          {semAcesso
            ? <Lock className="w-7 h-7 text-slate-500" aria-hidden="true" />
            : <AlertCircle className="w-8 h-8 text-red-600" aria-hidden="true" />}
        </div>
        <p className="text-sm font-semibold text-slate-800 max-w-[32ch]">
          {semAcesso ? 'Este link não tem acesso a Pedidos de Compra.' : 'Não foi possível abrir o Pedido Fast. Verifique a conexão.'}
        </p>
        {semAcesso
          ? <p className="text-sm text-slate-600 max-w-[30ch]">Peça ao administrador para liberar Suprimentos › Pedidos no seu usuário.</p>
          : <Button variant="secondary" onClick={() => setTentativa(n => n + 1)} className="mt-2">Tentar de novo</Button>}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto -mx-4 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pedido Fast</h1>
          <p className="text-sm text-slate-600 mt-0.5">Comprou no balcão? Foto da nota e a obra.</p>
        </div>
        <PedidoFastFluxo fonte={fonte} obras={estado.obras} chaveUltimaObra={`pedidoFast:ultimaObra:link`} />
      </div>
    </div>
  )
}

export default PedidoFastDoLink
