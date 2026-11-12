import React from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import Button from '../ui/Button'
import DiaryMobileApp from '../DiaryMobileApp'
import { DiarioFonteContext, type DiarioFonteDoLink, type ProjetoDoLink } from '../../services/celular/diarioFonte'

/**
 * Aba "Diário" do link do celular (`/celular?token=`): o Diário de Obras de sempre
 * (`DiaryMobileApp`) lendo e gravando pela fonte do link — só RPCs `celular_*`.
 *
 * Carrega a lista de diários do dono do link (`fonte.listarProjetos()`) UMA vez por fonte,
 * e mantém o array `projetos` com a mesma identidade entre renders: `DiaryMobileApp` o tem
 * nas dependências dos efeitos de carga e recarregaria em laço se ele mudasse a cada render.
 *
 * A recusa do token (link revogado/vencido) não é tratada aqui: a própria fonte avisa o
 * `aoRecusar` do gate, que derruba a tela inteira para o estado "link inválido".
 *
 * Estados: carregando → ok | erro (rede: "Tentar de novo").
 */

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro' }
  | { tipo: 'ok'; projetos: ProjetoDoLink[] }

const DiarioDoLink: React.FC<{ fonte: DiarioFonteDoLink }> = ({ fonte }) => {
  const [estado, setEstado] = React.useState<Estado>({ tipo: 'carregando' })
  const [tentativa, setTentativa] = React.useState(0)

  React.useEffect(() => {
    let cancelado = false
    setEstado({ tipo: 'carregando' })
    fonte.listarProjetos()
      .then(projetos => { if (!cancelado) setEstado({ tipo: 'ok', projetos }) })
      .catch(() => { if (!cancelado) setEstado({ tipo: 'erro' }) })
    return () => { cancelado = true }
  }, [fonte, tentativa])

  if (estado.tipo === 'carregando') {
    return (
      <div role="status" className="h-full flex flex-col items-center justify-center gap-2 text-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-800">Abrindo o diário…</p>
      </div>
    )
  }

  if (estado.tipo === 'erro') {
    return (
      <div role="alert" className="h-full flex flex-col items-center justify-center gap-2 text-center">
        <div className="w-14 h-14 bg-white rounded-[10px] flex items-center justify-center shadow-sm mb-1">
          <AlertCircle className="w-8 h-8 text-red-600" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold text-slate-800 max-w-[32ch]">Não foi possível abrir o diário. Verifique a conexão.</p>
        <Button variant="secondary" onClick={() => setTentativa(n => n + 1)} className="mt-2">Tentar de novo</Button>
      </div>
    )
  }

  return (
    <DiarioFonteContext.Provider value={fonte}>
      <DiaryMobileApp projects={estado.projetos} />
    </DiarioFonteContext.Provider>
  )
}

export default DiarioDoLink
