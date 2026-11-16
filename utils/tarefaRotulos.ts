/**
 * Rótulos de tarefa compartilhados entre a Lista (`TasksList`) e o Painel
 * (`TasksDashboard`) de Minhas Tarefas.
 *
 * Saíram de `components/TasksList.tsx` em 15/11/2026, quando o Painel passou a
 * precisar dos mesmos nomes. O mapa de origem local não tinha `suprimentos`: a
 * linha da tabela caía em "Manual", e as 10 tarefas geradas por Suprimentos
 * apareciam como manuais. Os quatro módulos que geram tarefa e não tinham rótulo
 * (`suprimentos`, `processos`, `services`, `comercial`) entraram aqui, e origem
 * desconhecida agora mostra o próprio nome (`rotuloOrigem`), nunca "Manual".
 */

/** 1 = urgente … 4 = baixa (CHECK do banco: `priority BETWEEN 1 AND 4`). */
export const PRIORIDADE_TAREFA: Record<number, { label: string; flag: string }> = {
  1: { label: 'Urgente', flag: 'text-red-500'    },
  2: { label: 'Alta',    flag: 'text-orange-400' },
  3: { label: 'Normal',  flag: 'text-blue-400'   },
  4: { label: 'Baixa',   flag: 'text-slate-300'  },
}

/** `tasks.source_module` → rótulo e cor de texto. */
export const ORIGEM_TAREFA: Record<string, { label: string; cls: string }> = {
  manual:      { label: 'Manual',      cls: 'text-slate-500' },
  operacional: { label: 'Operacional', cls: 'text-amber-700' },
  financeiro:  { label: 'Financeiro',  cls: 'text-emerald-700' },
  rh:          { label: 'RH',          cls: 'text-purple-700' },
  compras:     { label: 'Compras',     cls: 'text-indigo-700' },
  suprimentos: { label: 'Suprimentos', cls: 'text-indigo-700' },
  oficios:     { label: 'Ofícios',     cls: 'text-sky-700' },
  riscos:      { label: 'Riscos',      cls: 'text-red-700' },
  processos:   { label: 'Processos',   cls: 'text-teal-700' },
  services:    { label: 'Serviços',    cls: 'text-cyan-700' },
  comercial:   { label: 'Comercial',   cls: 'text-blue-700' },
}

/** Rótulo da origem; a desconhecida mostra o próprio nome (nunca vira "Manual"). */
export function rotuloOrigem(sourceModule: string | null | undefined): { label: string; cls: string } {
  const chave = sourceModule ?? ''
  return ORIGEM_TAREFA[chave] ?? { label: chave || 'Sem origem', cls: 'text-slate-500' }
}

/** Rótulo da prioridade; fora de 1–4 cai em Normal (mesmo padrão da Lista). */
export function rotuloPrioridade(prioridade: number | null | undefined): string {
  return PRIORIDADE_TAREFA[prioridade ?? 3]?.label ?? PRIORIDADE_TAREFA[3].label
}
