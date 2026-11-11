import React from 'react'
import { Check, Copy, Loader2, MessageCircle, Smartphone } from 'lucide-react'
import Button from '../ui/Button'
import { useConfirm } from '../ui/confirm'
import {
  gerarLinkCelular,
  revogarLinkCelular,
  statusLinkCelular,
  type StatusLinkCelular,
} from '../../services/celular/celularLinkService'

/**
 * Gestão do link do celular de UMA pessoa em UMA organização (`/celular?token=`):
 * validade e último uso, **Gerar** / **Gerar novo**, **Copiar**, **WhatsApp** e **Revogar**.
 *
 * Quem pode o quê é decidido no BANCO (`mobile_link_*`): gestor da organização para qualquer
 * membro, ou a própria pessoa para si. Recusa chega como 42501 e vira o texto de permissão.
 *
 * O token só existe em claro na URL devolvida por `gerarLinkCelular`. Ela fica só neste estado
 * (some ao trocar de pessoa/organização, ao revogar e ao desmontar) — nunca vai para log,
 * `localStorage` ou toast. Por isso o `console.error` abaixo registra só o código do erro.
 */

const CODIGO_SEM_PERMISSAO = '42501'

/** `Date` válido, ou `null` — o banco devolve texto ISO. */
const comoData = (iso: string | null | undefined): Date | null => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

const dataBr = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const dataHoraBr = (d: Date) =>
  `${dataBr(d)} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`

type Situacao = 'nenhum' | 'ativo' | 'vencido' | 'revogado'

/** Texto da situação do link, pelo que o banco devolveu (sem nenhum dado do token). */
export function situacaoDoLink(status: StatusLinkCelular, agora: Date = new Date()): Situacao {
  if (!status.existe) return 'nenhum'
  if (status.revogado) return 'revogado'
  const validade = comoData(status.expires_at)
  if (validade && validade.getTime() <= agora.getTime()) return 'vencido'
  return 'ativo'
}

/** Mensagem para o usuário a partir do erro do Supabase — sem expor detalhe técnico. */
function mensagemDoErro(e: unknown, acao: string): string {
  const codigo = e && typeof e === 'object' ? (e as { code?: unknown }).code : undefined
  if (codigo === CODIGO_SEM_PERMISSAO) {
    return 'Você não tem permissão para gerenciar o link desta pessoa nesta organização.'
  }
  return `Não foi possível ${acao}. Verifique a conexão e tente novamente.`
}

/** Texto enviado por WhatsApp — o endereço vai junto, para a pessoa tocar e abrir. */
export const textoDoWhatsapp = (url: string) => `Seu link do OrçaCloud no celular: ${url}`

interface Props {
  userId: string
  orgId: string
  nomePessoa: string
}

const LinkDoCelularBloco: React.FC<Props> = ({ userId, orgId, nomePessoa }) => {
  const confirm = useConfirm()
  const [status, setStatus] = React.useState<StatusLinkCelular | null>(null)
  const [carregando, setCarregando] = React.useState(true)
  const [ocupado, setOcupado] = React.useState<'gerar' | 'revogar' | null>(null)
  const [erro, setErro] = React.useState<string | null>(null)
  /** URL com o token — só existe logo depois de gerar. */
  const [urlGerada, setUrlGerada] = React.useState<string | null>(null)
  const [copiado, setCopiado] = React.useState(false)

  // Pessoa/organização nova = estado novo: o link gerado de outra pessoa nunca fica na tela.
  React.useEffect(() => {
    let cancelado = false
    setStatus(null)
    setUrlGerada(null)
    setCopiado(false)
    setErro(null)
    setCarregando(true)
    statusLinkCelular(userId, orgId)
      .then(s => { if (!cancelado) setStatus(s) })
      .catch((e: unknown) => {
        if (cancelado) return
        console.error('[LinkDoCelularBloco] status falhou:', (e as { code?: unknown })?.code)
        setErro(mensagemDoErro(e, 'consultar o link'))
      })
      .finally(() => { if (!cancelado) setCarregando(false) })
    return () => { cancelado = true }
  }, [userId, orgId])

  // O "Copiado" volta ao ícone normal sozinho.
  React.useEffect(() => {
    if (!copiado) return
    const t = window.setTimeout(() => setCopiado(false), 2000)
    return () => window.clearTimeout(t)
  }, [copiado])

  const situacao: Situacao = status ? situacaoDoLink(status) : 'nenhum'
  const temLinkAtivo = situacao === 'ativo'
  const validade = comoData(status?.expires_at)
  const ultimoUso = comoData(status?.last_used_at)

  const recarregarStatus = async () => {
    try {
      setStatus(await statusLinkCelular(userId, orgId))
    } catch (e) {
      console.error('[LinkDoCelularBloco] status falhou:', (e as { code?: unknown })?.code)
    }
  }

  const gerar = async () => {
    if (ocupado) return
    // Gerar de novo derruba o link que já está no celular da pessoa — avisa antes.
    if (temLinkAtivo) {
      const ok = await confirm({
        title: 'Gerar um novo link?',
        message: `O link atual de ${nomePessoa} deixa de funcionar assim que o novo for gerado. Quem usa o link antigo precisará receber o novo.`,
        variant: 'warning',
        confirmLabel: 'Gerar novo link',
      })
      if (!ok) return
    }
    setOcupado('gerar')
    setErro(null)
    try {
      setUrlGerada(await gerarLinkCelular(userId, orgId))
      setCopiado(false)
      await recarregarStatus()
    } catch (e) {
      console.error('[LinkDoCelularBloco] gerar falhou:', (e as { code?: unknown })?.code)
      setErro(mensagemDoErro(e, 'gerar o link'))
    } finally {
      setOcupado(null)
    }
  }

  const revogar = async () => {
    if (ocupado) return
    const ok = await confirm({
      title: 'Revogar o link do celular?',
      message: `O link de ${nomePessoa} para de funcionar na hora. Para voltar a usar o celular, será preciso gerar um novo link.`,
      variant: 'danger',
      confirmLabel: 'Revogar link',
    })
    if (!ok) return
    setOcupado('revogar')
    setErro(null)
    try {
      await revogarLinkCelular(userId, orgId)
      setUrlGerada(null)
      await recarregarStatus()
    } catch (e) {
      console.error('[LinkDoCelularBloco] revogar falhou:', (e as { code?: unknown })?.code)
      setErro(mensagemDoErro(e, 'revogar o link'))
    } finally {
      setOcupado(null)
    }
  }

  const copiar = async () => {
    if (!urlGerada) return
    try {
      await navigator.clipboard.writeText(urlGerada)
      setCopiado(true)
      setErro(null)
    } catch {
      setErro('Não foi possível copiar automaticamente. Selecione o endereço acima e copie à mão.')
    }
  }

  const enviarPorWhatsapp = () => {
    if (!urlGerada) return
    window.open(`https://wa.me/?text=${encodeURIComponent(textoDoWhatsapp(urlGerada))}`, '_blank', 'noopener,noreferrer')
  }

  // ── Texto de situação (§21: sentence case, valor escuro) ──
  const linhaDeSituacao = (() => {
    if (carregando) return 'Consultando o link…'
    if (!status) return 'Não foi possível consultar o link.'
    switch (situacao) {
      case 'nenhum': return 'Nenhum link gerado.'
      case 'revogado': return 'Link revogado — não funciona mais.'
      case 'vencido': return validade ? `Link vencido em ${dataBr(validade)}.` : 'Link vencido.'
      case 'ativo': return validade ? `Link ativo, válido até ${dataBr(validade)}.` : 'Link ativo.'
    }
  })()

  const motivoGerarDesligado = carregando
    ? 'Aguarde a consulta do link.'
    : ocupado
      ? 'Aguarde a operação em andamento.'
      : undefined
  const motivoRevogarDesligado = carregando
    ? 'Aguarde a consulta do link.'
    : ocupado
      ? 'Aguarde a operação em andamento.'
      : !temLinkAtivo
        ? 'Não há link ativo para revogar.'
        : undefined

  return (
    <div className="space-y-4" data-testid="link-do-celular-bloco">
      <div className="space-y-1.5">
        <p className="text-sm text-gray-900" data-testid="link-do-celular-situacao">{linhaDeSituacao}</p>
        {status && status.existe && ultimoUso && (
          <p className="text-xs text-slate-500">Último uso: {dataHoraBr(ultimoUso)}</p>
        )}
        {status && status.existe && !ultimoUso && situacao !== 'nenhum' && (
          <p className="text-xs text-slate-500">Ainda não foi usado.</p>
        )}
        <p className="text-xs text-slate-500">
          Com o link, {nomePessoa} abre Minhas Tarefas no celular sem digitar senha. Quem tiver o link acessa as tarefas — envie só para a própria pessoa.
        </p>
      </div>

      {erro && (
        <p role="alert" className="rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</p>
      )}

      {urlGerada && (
        <div className="space-y-2 rounded-[10px] border border-emerald-200 bg-emerald-50 p-3" data-testid="link-do-celular-gerado">
          <p className="text-xs font-semibold text-slate-500">Link gerado — aparece só agora</p>
          <div
            className="select-all break-all rounded-[6px] border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
            data-testid="link-do-celular-url"
          >
            {urlGerada}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={copiar} data-testid="link-do-celular-copiar">
              {copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              {copiado ? 'Copiado' : 'Copiar'}
            </Button>
            <Button type="button" variant="secondary" onClick={enviarPorWhatsapp} data-testid="link-do-celular-whatsapp">
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Depois de fechar esta tela o endereço não pode ser consultado de novo — só gerando um novo link.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={gerar}
          disabled={carregando || !!ocupado}
          title={motivoGerarDesligado}
          data-testid="link-do-celular-gerar"
        >
          {ocupado === 'gerar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
          {temLinkAtivo ? 'Gerar novo link' : 'Gerar link'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={revogar}
          disabled={carregando || !!ocupado || !temLinkAtivo}
          title={motivoRevogarDesligado}
          data-testid="link-do-celular-revogar"
          className="text-red-600!"
        >
          {ocupado === 'revogar' && <Loader2 className="h-4 w-4 animate-spin" />}
          Revogar link
        </Button>
      </div>
      {motivoRevogarDesligado && !carregando && !ocupado && (
        <p className="text-xs text-slate-500">{motivoRevogarDesligado}</p>
      )}
    </div>
  )
}

export default LinkDoCelularBloco
