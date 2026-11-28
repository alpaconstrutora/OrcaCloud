import { supabase } from '../lib/supabase'
import { comprimirFoto } from '../utils/comprimirFoto'
import type { EntradaDoItem } from '../lib/recebimento'
import type { CategoriaDocumentoPedido } from '../lib/pedidoDocumentos'
import type { ResultadoSyncPedido } from './pedidoFinanceiroMotor'

/**
 * Fonte de dados do Recebimento mobile (docs/planos/2026-11-27-recebimento-mobile.md).
 *
 * UMA implementação, dois modos — a mesma tela (`RecebimentoFluxo`) serve o app
 * logado no celular e a aba "Receber" do link `/celular`:
 *   · leitura pelas RPCs `recebimento_listar/abrir` (sessão; `orgId` do topo, REGRA #5)
 *     ou `celular_recebimento_listar/abrir` (token);
 *   · TODA gravação pela Edge `pedido-recebimento` (a regra mora lá e em
 *     lib/recebimento.ts) — com o JWT da sessão, ou com o token no corpo.
 * Fotos e documentos sobem direto ao storage por URL assinada que a Edge prepara.
 *
 * Recusa do token (link revogado/vencido) avisa `aoRecusar` — o gate derruba a tela.
 */

export const MENSAGEM_LINK_RECUSADO = 'link inválido ou vencido'
const EDGE = 'pedido-recebimento'

export type GrupoDaLista = 'a_conferir' | 'a_retirar' | 'a_caminho' | 'conferidos'

export interface PedidoDaLista {
  id: string
  numero: string | null
  org_id: string
  org_nome: string | null
  obra: string | null
  fornecedor: string | null
  status: string
  fob: boolean
  previsao: string | null
  itens: number
  versao: number
  grupo: GrupoDaLista
  divergencias_pendentes: number
  atualizado: string | null
}

export interface ConferenciaGravada {
  id: string
  status: string
  recebido_em: string
  notas: string | null
  foto: string | null
  origem: 'APP' | 'LINK'
  recebido_por: string | null
  itens: { indice: number | null; code: string | null; description: string | null; unit: string | null; pedida: number; recebida: number; problema: string | null; obs: string | null }[]
}

export interface PedidoAberto {
  id: string
  numero: string | null
  org_id: string
  org_nome: string | null
  obra: string | null
  fornecedor: string | null
  status: string
  fob: boolean
  previsao: string | null
  versao: number
  notas_recebimento: string | null
  data_retirada: string | null
  retirado_por: { id: string; nome: string } | null
  itens: { indice: number; code: string | null; description: string | null; unit: string | null; quantity: number }[]
  colaboradores: { id: string; nome: string; cargo: string | null; autorizado: boolean }[]
  conferencias: ConferenciaGravada[]
  divergencias: { id: string; description: string | null; unit: string | null; issue: string | null; quantity: number; status: string; notes: string | null; resolucao: string | null; resposta_fornecedor: string | null }[]
  documentos: { id: string; categoria: string; descricao: string | null; arquivo: string; path: string; mime: string | null; lado: string; enviado_por: string | null; criado_em: string }[]
}

export type ResultadoFinanceiro = ResultadoSyncPedido | { falhou: string } | null

export interface ResultadoDaConferencia {
  receiptId: string
  status: 'Recebido' | 'Divergência' | 'Parcial'
  statusPedido: string
  versao: number
  jaExistia: boolean
  financeiro: ResultadoFinanceiro
}

export interface ResultadoDaRetirada {
  statusPedido: string
  versao: number
  jaExistia: boolean
  financeiro: ResultadoFinanceiro
}

export interface FonteRecebimento {
  modo: 'logado' | 'link'
  listar(): Promise<PedidoDaLista[]>
  abrir(orderId: string): Promise<PedidoAberto>
  receber(args: { orderId: string; receiptId: string; versao: number; itens: EntradaDoItem[]; notas: string | null; foto: File | null }): Promise<ResultadoDaConferencia>
  registrarRetirada(args: { orderId: string; versao: number; data: string; employeeId: string }): Promise<ResultadoDaRetirada>
  enviarDocumento(args: { orderId: string; file: File; categoria: CategoriaDocumentoPedido; descricao: string | null }): Promise<void>
  /** URLs assinadas (1 h) dos arquivos DO pedido — comprovantes e documentos. */
  assinar(orderId: string, paths: string[]): Promise<Record<string, string>>
}

/** Erro com o status HTTP da Edge (409 = pedido mudou; 429 = limite do link). */
export class ErroDoRecebimento extends Error {
  constructor(message: string, public status?: number) { super(message) }
}

export interface OpcoesDaFonte {
  /** Só no logado: organização do topo (null = "Todas"). */
  orgId?: string | null
  /** Só no link. */
  token?: string
  aoRecusar?: () => void
}

export function criarFonteRecebimento(opcoes: OpcoesDaFonte): FonteRecebimento {
  const token = opcoes.token ?? null
  const modo: 'logado' | 'link' = token ? 'link' : 'logado'

  function recusouOLink(status: number | undefined, mensagem: string): boolean {
    return !!token && status === 403 && mensagem === MENSAGEM_LINK_RECUSADO
  }

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.rpc(fn, args)
    if (error) {
      if (token && error.code === '42501' && error.message === MENSAGEM_LINK_RECUSADO) opcoes.aoRecusar?.()
      throw new ErroDoRecebimento(error.message || 'Falha ao carregar.', error.code === '42501' ? 403 : undefined)
    }
    return data as T
  }

  async function edge<T>(corpo: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke(EDGE, { body: token ? { ...corpo, token } : corpo })
    if (error) {
      const ctx = (error as { context?: { status?: number; json?: () => Promise<unknown> } }).context
      let mensagem = 'Não foi possível concluir. Verifique a conexão e tente de novo.'
      const status = typeof ctx?.status === 'number' ? ctx.status : undefined
      try {
        const c = (await ctx?.json?.()) as { error?: unknown } | undefined
        if (c && typeof c.error === 'string' && c.error.trim()) mensagem = c.error
      } catch { /* corpo não é JSON */ }
      if (recusouOLink(status, mensagem)) opcoes.aoRecusar?.()
      throw new ErroDoRecebimento(mensagem, status)
    }
    return data as T
  }

  async function subirAssinado(acao: 'comprovante_subir' | 'documento_subir', extra: Record<string, unknown>, bucket: string, arquivo: File): Promise<string> {
    const { path, token: tokenDeEnvio } = await edge<{ path: string; token: string }>({ acao, ...extra })
    const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(path, tokenDeEnvio, arquivo, { contentType: arquivo.type || undefined })
    if (error) throw new ErroDoRecebimento('O arquivo não subiu. Verifique a conexão e tente de novo.')
    return path
  }

  return {
    modo,

    listar: async () => (await (token
      ? rpc<PedidoDaLista[] | null>('celular_recebimento_listar', { p_token: token })
      : rpc<PedidoDaLista[] | null>('recebimento_listar', { p_org: opcoes.orgId ?? null }))) ?? [],

    abrir: orderId => token
      ? rpc<PedidoAberto>('celular_recebimento_abrir', { p_token: token, p_order: orderId })
      : rpc<PedidoAberto>('recebimento_abrir', { p_order: orderId }),

    async receber({ orderId, receiptId, versao, itens, notas, foto }) {
      let caminho: string | null = null
      if (foto) {
        const jpg = await comprimirFoto(foto)
        caminho = await subirAssinado('comprovante_subir', { orderId, receiptId }, 'receipts', jpg)
      }
      return edge<ResultadoDaConferencia>({ acao: 'receber', orderId, receiptId, versao, itens, notas, foto: caminho })
    },

    registrarRetirada: ({ orderId, versao, data, employeeId }) =>
      edge<ResultadoDaRetirada>({ acao: 'retirada', orderId, versao, data, employeeId }),

    async enviarDocumento({ orderId, file, categoria, descricao }) {
      const enviar = file.type.startsWith('image/') ? await comprimirFoto(file) : file
      const path = await subirAssinado('documento_subir', { orderId, nome: enviar.name, tamanho: enviar.size }, 'purchase-order-documents', enviar)
      await edge({ acao: 'documento_registrar', orderId, path, nome: enviar.name, tamanho: enviar.size, tipo: enviar.type || null, categoria, descricao })
    },

    async assinar(orderId, paths) {
      if (paths.length === 0) return {}
      const r = await edge<{ urls?: Record<string, string> }>({ acao: 'assinar', orderId, paths: paths.slice(0, 100) })
      return r?.urls ?? {}
    },
  }
}

/** Frase do que aconteceu com as parcelas a pagar (para o aviso depois de gravar), ou null. */
export function fraseDoFinanceiro(f: ResultadoFinanceiro): string | null {
  if (!f) return null
  if ('gerou' in f) return f.gerou > 0 ? `${f.gerou} ${f.gerou === 1 ? 'parcela a pagar gerada' : 'parcelas a pagar geradas'}.` : null
  if ('falhou' in f) return 'As parcelas a pagar não foram geradas agora — o financeiro confere depois.'
  if (f.pulou === 'sem-nota') return 'Parcelas a pagar: aguardando a nota fiscal.'
  return null
}
