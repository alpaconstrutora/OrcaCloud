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
  const msg = err?.message || err?.details || ''
  if (!msg) return 'Erro desconhecido'
  if (/row-level security/i.test(msg)) {
    return 'Sem permissão para gravar a tarefa assim: depois de salva ela precisa continuar visível para você. '
      + DICA_VISIBILIDADE_TAREFA
  }
  return maiuscula(msg)
}
