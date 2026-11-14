/**
 * Tarefas — quem vê e quem apaga, nas palavras que a tela mostra.
 *
 * A regra mora no banco (aplicar_20271112998000_tarefas_visibilidade_por_responsavel.sql):
 * vê a tarefa quem a criou, o responsável, os Envolvidos (só consulta) e o
 * proprietário/admin da organização — este só se ela tem responsável ou está num espaço
 * (sem responsável e fora de espaço é agenda pessoal). Apagar é só de quem criou.
 *
 * O banco recusa calado o que a RLS esconde (DELETE de 0 linhas): a tela compara o que
 * pediu com o que voltou e diz o porquê, em vez de não fazer nada.
 * Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md
 *        (Ajustes — visibilidade pelo responsável).
 */

export const MSG_SO_QUEM_CRIOU_EXCLUI = 'Só quem criou a tarefa pode excluí-la.'

export const DICA_VISIBILIDADE_TAREFA =
  'Visível para quem criou, o responsável, os Envolvidos (só consulta) e o proprietário/admin da organização.'

/** Sem responsável e fora de espaço: agenda pessoal — owner/admin NÃO veem. */
export const DICA_AGENDA_PESSOAL = 'Agenda pessoal: só quem criou e os Envolvidos veem esta tarefa.'

/** A frase de quem vê, conforme o que está escolhido no formulário. */
export function dicaVisibilidade(assigneeId: string | null | undefined, spaceId: string | null | undefined): string {
  return !assigneeId && !spaceId ? DICA_AGENDA_PESSOAL : DICA_VISIBILIDADE_TAREFA
}

/** Excluir que o banco recusou (0 linhas): pode ser a regra, ou a tarefa já não existir. */
export const MSG_EXCLUSAO_RECUSADA =
  'Não foi possível excluir: só quem criou a tarefa pode excluí-la (ou ela já foi excluída).'

/**
 * Por que o botão Excluir está desligado (null = pode tentar). `meuId` desconhecido (sessão
 * ainda carregando) não desliga: o banco decide, e a recusa sai em MSG_EXCLUSAO_RECUSADA.
 */
export function motivoParaNaoExcluirTarefa(meuId: string | null | undefined, criadorId: string | null | undefined): string | null {
  if (!meuId || !criadorId || meuId === criadorId) return null
  return 'Só quem criou a tarefa pode excluí-la. Para tirá-la da lista, conclua a tarefa ou peça a quem a criou.'
}

/** Editar recusado sem erro de regra (o UPDATE não achou a linha que pode mexer). */
export const MSG_SEM_PERMISSAO_EDITAR =
  'Sem permissão para alterar esta tarefa: editam quem criou, o responsável e o proprietário/admin da organização (Envolvidos só consultam).'

/** Exclusão: quais ids pedidos o banco não apagou, e a frase para o aviso (null = todas apagadas). */
export function resumirExclusao(pedidas: string[], apagadas: string[]): { recusadas: string[]; mensagem: string | null } {
  const foram = new Set(apagadas)
  const recusadas = pedidas.filter(id => !foram.has(id))
  if (recusadas.length === 0) return { recusadas, mensagem: null }
  const inicio = pedidas.length === 1
    ? 'A tarefa não foi excluída.'
    : `${recusadas.length} de ${pedidas.length} tarefas não ${recusadas.length === 1 ? 'foi excluída' : 'foram excluídas'}.`
  return { recusadas, mensagem: `${inicio} ${MSG_SO_QUEM_CRIOU_EXCLUI}` }
}

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Erro do banco ao gravar a tarefa, para a tela. As recusas do gatilho já vêm explicadas
 * (só ganham a inicial maiúscula); o 42501 genérico da RLS ("new row violates row-level
 * security policy") vira frase: a linha gravada deixaria de ser visível para quem gravou.
 */
export function explicarErroTarefa(err: { code?: string; message?: string; details?: string } | null | undefined): string {
  // `.single()` sobre 0 linhas: a RLS não deixou o UPDATE achar a tarefa.
  if (err?.code === 'PGRST116') return MSG_SEM_PERMISSAO_EDITAR
  const msg = err?.message || err?.details || ''
  if (!msg) return 'Erro desconhecido'
  if (/row-level security/i.test(msg)) {
    return 'Sem permissão para gravar a tarefa assim: depois de salva ela precisa continuar visível para você. '
      + DICA_VISIBILIDADE_TAREFA
  }
  return maiuscula(msg)
}

/**
 * O erro veio do BANCO (recusa com SQLSTATE, ex.: 42501 do gatilho, 22023 da RPC, PGRST*
 * do PostgREST) — e não da rede. Só esses ganham a explicação; falha de rede segue com a
 * mensagem de conexão de cada tela.
 */
export function ehRecusaDoBanco(err: unknown): err is { code: string; message?: string; details?: string } {
  if (!err || typeof err !== 'object') return false
  const code = (err as { code?: unknown }).code
  return typeof code === 'string' && /^([0-9A-Z]{5}|PGRST\d+)$/.test(code)
}

/**
 * Mensagem de quem grava a tarefa pela tela do celular (logado ou link): recusa do banco
 * explicada; qualquer outra coisa (rede, sessão), a frase de conexão que a tela já usa.
 */
export function mensagemAoGravarTarefa(err: unknown, falhaDeConexao: string): string {
  return ehRecusaDoBanco(err) ? explicarErroTarefa(err) : falhaDeConexao
}
