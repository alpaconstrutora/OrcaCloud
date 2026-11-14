import React from 'react'
import { AlertCircle, BookOpen, CheckSquare, Loader2, LinkIcon, type LucideIcon } from 'lucide-react'
import Button from '../ui/Button'
import TasksMobileApp from '../TasksMobileApp'
import DiarioDoLink from './DiarioDoLink'
import { celularSessao, type SessaoCelular } from '../../services/celular/celularLinkService'
import { fonteDoLink, TarefasFonteContext } from '../../services/celular/tarefasFonte'
import { fonteDiarioDoLink } from '../../services/celular/diarioFonte'

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
 * Link revogado ou vencido COM A TELA ABERTA também vai a `invalido` (desmonta a tela de
 * tarefas — nenhum dado fica à vista): quando qualquer RPC da fonte volta com a recusa do
 * token, e quando a aba volta a ficar visível e `celular_sessao` recusa.
 */

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'invalido' }
  | { tipo: 'erro' }
  | { tipo: 'ok'; sessao: SessaoCelular }

export const TEXTO_LINK_INVALIDO = 'Link inválido ou vencido — peça um novo ao administrador'

/** Seções do seletor (pílula) no topo — a única barra de baixo é a de cada seção. */
type AbaId = 'tarefas' | 'diario'
const ABAS: { id: AbaId; rotulo: string; Icone: LucideIcon }[] = [
  { id: 'tarefas', rotulo: 'Tarefas', Icone: CheckSquare },
  { id: 'diario', rotulo: 'Diário', Icone: BookOpen },
]

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
  const [aba, setAba] = React.useState<AbaId>('tarefas')

  // `aoRecusar` usa o `setEstado` do React, que é estável por contrato: a mesma função
  // serve às duas fontes (Tarefas e Diário) — a recusa do token em QUALQUER RPC delas leva
  // o gate a `invalido`, desmontando a tela.
  const aoRecusar = React.useCallback(() => setEstado({ tipo: 'invalido' }), [])

  // ⚠️ As fontes PRECISAM ser estáveis: `TasksMobileApp` e `DiaryMobileApp` as têm nas
  // dependências dos efeitos que carregam os dados. `fonteDoLink(token)` solto no JSX
  // criaria um objeto novo a cada render do gate e a tela recarregaria em laço. Por isso
  // só `token` (e, no Diário, o `pode_aprovar_diario` da sessão — um booleano) nas deps.
  const fonte = React.useMemo(() => fonteDoLink(token, { aoRecusar }), [token, aoRecusar])

  const podeAprovarDiario = estado.tipo === 'ok' ? estado.sessao.pode_aprovar_diario === true : false
  const fonteDiario = React.useMemo(
    () => fonteDiarioDoLink(token, { aoRecusar, podeAprovar: podeAprovarDiario }),
    [token, aoRecusar, podeAprovarDiario],
  )

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

  // Aba de volta à frente (celular desbloqueado, troca de app): o link pode ter sido revogado
  // ou ter vencido enquanto a tela estava parada — reconfere antes de qualquer toque.
  // Só a recusa do banco tira da tela; falha de rede aqui não derruba quem está usando.
  const aberta = estado.tipo === 'ok'
  React.useEffect(() => {
    if (!aberta || !token) return
    let ativo = true
    const aoMudarVisibilidade = () => {
      if (document.visibilityState !== 'visible') return
      celularSessao(token)
        .then(sessao => { if (ativo && !sessao) setEstado({ tipo: 'invalido' }) })
        .catch(() => { /* rede: segue na tela; a próxima RPC dirá se o link caiu */ })
    }
    document.addEventListener('visibilitychange', aoMudarVisibilidade)
    return () => {
      ativo = false
      document.removeEventListener('visibilitychange', aoMudarVisibilidade)
    }
  }, [aberta, token])

  if (estado.tipo === 'carregando') {
    return (
      <TelaDeEstado
        icone={<Loader2 className="w-6 h-6 animate-spin text-slate-400" aria-hidden="true" />}
        titulo="Abrindo…"
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
  // Sem nome (conta sem nome cadastrado): só a organização, sem o "· " solto na frente.
  // `celular_sessao` não devolve e-mail — não há outro identificador para mostrar.
  const nome = sessao.nome?.trim() ?? ''
  return (
    <div className="h-[100dvh] flex flex-col bg-[#eef2ff] font-sans overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-4 pt-2 pb-2 flex-shrink-0 flex flex-col gap-2">
        <p className="text-xs text-slate-600 truncate">
          {nome ? (
            <>
              <span className="font-medium text-slate-800">{nome}</span> · {sessao.org_nome}
            </>
          ) : (
            <span className="font-medium text-slate-800">{sessao.org_nome}</span>
          )}
        </p>
        {/* Seletor de seção: pílula segmentada no topo. Só ele troca de seção; embaixo fica
            apenas a barra própria de cada seção (Entrada/+/Espaços ou Registros/Resumo). */}
        <div role="tablist" aria-label="Seções" className="flex bg-slate-100 rounded-full p-1 gap-1">
          {ABAS.map(({ id, rotulo, Icone }) => {
            const ativa = id === aba
            return (
              <button
                key={id}
                id={`celular-aba-${id}`}
                type="button"
                role="tab"
                aria-selected={ativa}
                aria-controls="celular-painel"
                onClick={() => setAba(id)}
                className={`flex-1 h-11 rounded-full inline-flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                  ativa ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                <Icone className="w-4 h-4" aria-hidden="true" />
                {rotulo}
              </button>
            )
          })}
        </div>
      </header>

      {/* TasksMobileApp/DiaryMobileApp foram feitos para viver dentro do <main> do Layout e anulam
          o gutter dele com margem negativa (-m-4 md:-m-6): este recipiente devolve o mesmo gutter.
          É `flex-1 min-h-0`: o cabeçalho cresce com a pílula e a área da seção encolhe junto. */}
      {/* Só a aba ativa fica montada: trocar de aba pode remontar a outra (é aceito). */}
      <div
        id="celular-painel"
        role="tabpanel"
        aria-labelledby={`celular-aba-${aba}`}
        className="relative flex-1 min-h-0 p-4 md:p-6"
      >
        {aba === 'tarefas' ? (
          <TarefasFonteContext.Provider value={fonte}>
            <TasksMobileApp orgId={sessao.org_id} />
          </TarefasFonteContext.Provider>
        ) : (
          <DiarioDoLink fonte={fonteDiario} />
        )}
      </div>
    </div>
  )
}

export default CelularTokenGate
