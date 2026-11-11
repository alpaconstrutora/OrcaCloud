import React from 'react'
import { AlertCircle, CheckSquare, Loader2, LinkIcon } from 'lucide-react'
import Button from '../ui/Button'
import TasksMobileApp from '../TasksMobileApp'
import { celularSessao, type SessaoCelular } from '../../services/celular/celularLinkService'
import { fonteDoLink, TarefasFonteContext } from '../../services/celular/tarefasFonte'

/**
 * Entrada do link do celular (`/celular?token=`): abre Minhas Tarefas SEM login.
 *
 * Quem decide tudo é o token: `celular_sessao` devolve o dono do link e a organização, e
 * toda leitura/gravação da tela passa pela `fonteDoLink(token)` (só RPCs `celular_*`).
 * Uma sessão logada de OUTRA pessoa no mesmo navegador é ignorada de propósito.
 *
 * Estados: `carregando` → `ok` | `invalido` (o banco recusou, ou o endereço não traz um
 * token com cara de token — aí nem chama RPC) | `erro` (rede: dá para tentar de novo).
 *
 * Por ora a barra de baixo só tem "Tarefas"; o Diário entra na Fase 5.
 */

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'invalido' }
  | { tipo: 'erro' }
  | { tipo: 'ok'; sessao: SessaoCelular }

export const TEXTO_LINK_INVALIDO = 'Link inválido ou vencido — peça um novo ao administrador'

// ── Telas de estado (mesmo desenho do EmptyState/ErrorState de Minhas Tarefas) ──
const TelaDeEstado: React.FC<{
  icone: React.ReactNode
  titulo: string
  texto?: string
  acao?: { rotulo: string; executar: () => void }
  alerta?: boolean
}> = ({ icone, titulo, texto, acao, alerta }) => (
  <div className="min-h-[100dvh] bg-[#eef2ff] font-sans flex items-center justify-center px-6">
    <div role={alerta ? 'alert' : 'status'} className="flex flex-col items-center gap-2 text-center">
      <div className="w-14 h-14 bg-white rounded-[10px] flex items-center justify-center shadow-sm mb-1">{icone}</div>
      <p className="text-sm font-semibold text-slate-800 max-w-[32ch]">{titulo}</p>
      {texto && <p className="text-sm text-slate-600 max-w-[30ch]">{texto}</p>}
      {acao && <Button variant="secondary" onClick={acao.executar} className="mt-2">{acao.rotulo}</Button>}
    </div>
  </div>
)

const CelularTokenGate: React.FC<{ token: string | '' }> = ({ token }) => {
  const [estado, setEstado] = React.useState<Estado>({ tipo: token ? 'carregando' : 'invalido' })
  const [tentativa, setTentativa] = React.useState(0)

  // ⚠️ A fonte PRECISA ser estável: `TasksMobileApp` a tem nas dependências do efeito que
  // carrega as listas. `fonteDoLink(token)` solto no JSX criaria um objeto novo a cada
  // render do gate e a tela recarregaria em laço.
  const fonte = React.useMemo(() => fonteDoLink(token), [token])

  React.useEffect(() => {
    // Sem token utilizável: recusa direto, sem tocar no banco.
    if (!token) { setEstado({ tipo: 'invalido' }); return }
    let cancelado = false
    setEstado({ tipo: 'carregando' })
    celularSessao(token)
      .then(sessao => {
        if (cancelado) return
        setEstado(sessao ? { tipo: 'ok', sessao } : { tipo: 'invalido' })
      })
      .catch(() => { if (!cancelado) setEstado({ tipo: 'erro' }) })
    return () => { cancelado = true }
  }, [token, tentativa])

  if (estado.tipo === 'carregando') {
    return (
      <TelaDeEstado
        icone={<Loader2 className="w-6 h-6 animate-spin text-slate-400" aria-hidden="true" />}
        titulo="Abrindo suas tarefas…"
      />
    )
  }

  if (estado.tipo === 'invalido') {
    return (
      <TelaDeEstado
        alerta
        icone={<LinkIcon className="w-8 h-8 text-red-600" aria-hidden="true" />}
        titulo={TEXTO_LINK_INVALIDO}
      />
    )
  }

  if (estado.tipo === 'erro') {
    return (
      <TelaDeEstado
        alerta
        icone={<AlertCircle className="w-8 h-8 text-red-600" aria-hidden="true" />}
        titulo="Não foi possível abrir. Verifique a conexão."
        acao={{ rotulo: 'Tentar de novo', executar: () => setTentativa(n => n + 1) }}
      />
    )
  }

  const { sessao } = estado
  return (
    <div className="h-[100dvh] flex flex-col bg-[#eef2ff] font-sans overflow-hidden">
      <div className="bg-white border-b border-slate-200 px-4 h-10 flex items-center flex-shrink-0">
        <p className="text-xs text-slate-600 truncate">
          <span className="font-medium text-slate-800">{sessao.nome}</span> · {sessao.org_nome}
        </p>
      </div>

      {/* TasksMobileApp foi feito para viver dentro do <main> do Layout e anula o gutter dele
          com margem negativa (-m-4 md:-m-6): este recipiente devolve o mesmo gutter. */}
      <div className="relative flex-1 min-h-0 p-4 md:p-6">
        <TarefasFonteContext.Provider value={fonte}>
          <TasksMobileApp orgId={sessao.org_id} />
        </TarefasFonteContext.Provider>
      </div>

      <nav aria-label="Seções" className="bg-white border-t border-slate-200 flex-shrink-0 pb-[env(safe-area-inset-bottom)]">
        <button
          type="button"
          aria-current="page"
          className="w-full h-12 flex flex-col items-center justify-center gap-0.5 text-blue-600"
        >
          <CheckSquare className="w-5 h-5" aria-hidden="true" />
          <span className="text-[11px] font-medium">Tarefas</span>
        </button>
      </nav>
    </div>
  )
}

export default CelularTokenGate
