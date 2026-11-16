/**
 * Dados da cópia de um projeto (Orçamento, Obra, Planejamento…) — UMA regra para todo "Duplicar".
 *
 * Teste com gravação do "Novo planejamento" (15/11/2026, docs/planos/2026-11-15-planejamento-lista-
 * critica-2.md) mostrou dois defeitos do "Duplicar" que copiava só as settings:
 *  - o CÓDIGO ia junto: dois "001" na mesma organização. Sem código, `projectService.saveProject`
 *    gera o próximo da sequência (get_next_*_code por classificação);
 *  - a EMPRESA não ia na coluna: o gatilho `sync_org_from_empresa` tira o `organization_id` da coluna
 *    `empresa_id`, e projeto com empresa só na coluna (o planejamento Divino, p.ex.) saía sem
 *    organização — órfão, invisível para todos.
 */
import type { BudgetEntry, ProjectSettings } from '../types';

/** Settings da cópia: tudo do original, com o nome novo e SEM o código. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function settingsDaCopia(original: any, nome: string) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { code: _codigo, ...resto } = original ?? {};
    return { ...resto, name: nome.trim() };
}

/** O que mandar para `projectService.saveProject` (sem id = cria). */
export function dadosDaCopia(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    original: { settings?: any; budget?: BudgetEntry[] | null; empresa_id?: string | null },
    nome: string,
): { name: string; settings: ProjectSettings; budget: BudgetEntry[]; empresa_id?: string } {
    const empresaId: string | undefined = original.empresa_id || original.settings?.empresaId || undefined;
    return {
        name: nome.trim(),
        settings: { ...settingsDaCopia(original.settings, nome), ...(empresaId ? { empresaId } : {}) } as ProjectSettings,
        budget: original.budget || [],
        ...(empresaId ? { empresa_id: empresaId } : {}),
    };
}
