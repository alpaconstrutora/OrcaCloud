/**
 * PROJETOS DE SISTEMA — fonte única da verdade
 * ============================================
 *
 * Alguns registros da tabela `projects` não são obras: são projetos
 * "centralizadores" que o sistema cria sozinho para pendurar dados que não
 * pertencem a nenhuma obra específica. Hoje o único é **Gestão Comercial**
 * (criado por `services/commercialFinanceService.ts`), que carrega as parcelas
 * e transações da área comercial.
 *
 * Ele É necessário — o módulo financeiro comercial inteiro se apoia nele — mas
 * NUNCA deve aparecer numa lista de obras para o usuário.
 *
 * ## Por que este arquivo existe
 *
 * O projeto comercial é gravado com `classification: 'OBRA'`, então toda
 * consulta que pergunta "me dá as obras" o traz junto. Durante muito tempo a
 * defesa foi espalhar `p.name !== 'Gestão Comercial'` pelas telas, uma por uma
 * — 28 ocorrências em 18 arquivos. Isso falha por construção: **toda tela nova
 * nasce errada**, porque quem a escreve não tem como adivinhar que precisa
 * daquele filtro. Foi assim que a tela de seleção de obra do ÒPURA CNO passou a
 * mostrar duas linhas "Gestão Comercial" como se fossem obras reais.
 *
 * ## A regra agora
 *
 * O store (`store/useStore.ts`) já entrega `projects` SEM projetos de sistema.
 * Uma tela que lê `projects` do store não precisa filtrar nada — é seguro por
 * padrão, e é isso que impede o bug de voltar numa tela nova.
 *
 * Este módulo é para os outros dois casos:
 *   1. consulta que vai direto ao Supabase, sem passar pelo store
 *      → use `SYSTEM_PROJECT_NAMES` / `applySystemProjectFilter`
 *   2. código que precisa DO projeto de sistema (o financeiro comercial)
 *      → use `isSystemProject` invertido, ou `useStore().systemProjects`
 *
 * ❌ Não escreva `p.name !== 'Gestão Comercial'` em código novo.
 *    `scripts/check-system-projects.sh` reprova isso.
 */

/** Nomes reservados para projetos criados pelo sistema, não pelo usuário. */
export const SYSTEM_PROJECT_NAMES = ['Gestão Comercial'] as const;

/** Forma mínima que este módulo precisa enxergar de um projeto. */
export interface SystemProjectShape {
  name?: string | null;
  settings?: { isSystemProject?: boolean; name?: string | null } | null;
}

/**
 * Um projeto é "de sistema" se o flag estiver marcado OU se o nome for um dos
 * reservados.
 *
 * A checagem por nome não é redundância decorativa: `isSystemProject` só passou
 * a ser gravado depois que vários projetos comerciais já existiam em produção.
 * A migration `20270718000001` faz o backfill desses registros, mas o fallback
 * por nome cobre qualquer linha que a migration não tenha alcançado (outro
 * ambiente, um banco restaurado de backup antigo, uma organização criada por um
 * caminho que não passou pelo backfill). Sem ele, a garantia depende de um
 * UPDATE ter rodado em todo lugar — e é exatamente esse tipo de suposição que
 * fez o bug voltar antes.
 */
export function isSystemProject(project: SystemProjectShape | null | undefined): boolean {
  if (!project) return false;
  if (project.settings?.isSystemProject === true) return true;
  const nome = (project.name || project.settings?.name || '').trim();
  return (SYSTEM_PROJECT_NAMES as readonly string[]).includes(nome);
}

/** Remove projetos de sistema de uma lista. Preserva o tipo do item. */
export function excludeSystemProjects<T extends SystemProjectShape>(projects: T[]): T[] {
  return projects.filter(p => !isSystemProject(p));
}

/** Mantém SÓ os projetos de sistema (o financeiro comercial precisa disto). */
export function onlySystemProjects<T extends SystemProjectShape>(projects: T[]): T[] {
  return projects.filter(p => isSystemProject(p));
}

/**
 * Lista de nomes reservados no formato que o PostgREST espera em `.not(col,
 * 'in', ...)`, para consultas que vão direto ao Supabase sem passar pelo store:
 *
 * ```ts
 * supabase.from('projects').select('id, name')
 *   .not('name', 'in', SYSTEM_PROJECT_NAMES_SQL)
 * ```
 *
 * Corta por nome, não pelo flag: `settings` é JSONB e `isSystemProject` pode
 * estar ausente na linha — um `neq` sobre chave JSON inexistente **descarta** a
 * linha em vez de mantê-la, o que esconderia obras de verdade. Quando precisar
 * da garantia completa, traga as linhas e passe `excludeSystemProjects` no
 * cliente, que aí o fallback por nome e o flag agem juntos.
 */
export const SYSTEM_PROJECT_NAMES_SQL = `(${SYSTEM_PROJECT_NAMES.map(n => `"${n}"`).join(',')})`;
