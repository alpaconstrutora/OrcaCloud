/**
 * Quem vê e quem edita o módulo Qualidade (SiAC) — fase 1 do plano
 * docs/planos/2026-11-25-qualidade-siac.md.
 *
 * Chaves próprias (`canViewQualitySystem`/`canEditQualitySystem` e o módulo
 * `qualidade_siac` na matriz por cargo). Sem valor gravado, **herda de Obras**:
 * o sistema de qualidade é da obra, e quem hoje opera obra não pode perder o
 * módulo novo por não ter a chave gravada no perfil. Mesmo molde de
 * `utils/permissaoRiscos.ts`. (`quality` é o Pós-Obra & Garantia — outro módulo.)
 *
 * Ordem (a mesma de `checkModule`/`isModuleAllowed`): permissão do usuário →
 * matriz do cargo → herança de Obras.
 */

type Permissoes = Record<string, unknown> | null | undefined;
type MatrizDoCargo = Record<string, boolean> | null | undefined;

const definido = (v: unknown): v is boolean => typeof v === 'boolean';

export function podeVerQualidadeSiac(args: {
    permissoes: Permissoes;
    matrizDoCargo: MatrizDoCargo;
    /** o que Obras já decide para este usuário (`canViewBudget` → matriz `obras` → padrão) */
    podeVerObras: boolean;
}): boolean {
    const propria = args.permissoes?.canViewQualitySystem;
    if (definido(propria)) return propria;
    const doCargo = args.matrizDoCargo?.qualidade_siac;
    if (definido(doCargo)) return doCargo;
    return args.podeVerObras;
}

/** Motivo exibido na tela quando ela abre só para leitura (botão desligado sempre diz o porquê). */
export const MOTIVO_SEM_EDICAO_QUALIDADE =
    'Você pode consultar a Qualidade (SiAC), mas não editar: peça a permissão "Qualidade (SiAC) · editar" a um administrador da organização.';

export function podeEditarQualidadeSiac(args: {
    permissoes: Permissoes;
    /** admin da organização, desenvolvedor, ou "Todas" sem membro resolvido — editam sempre */
    administrador: boolean;
    /** papel do membro na organização ativa (`viewer` = visitante) */
    papel?: string | null;
}): boolean {
    if (args.administrador) return true;
    const propria = args.permissoes?.canEditQualitySystem;
    if (definido(propria)) return propria;
    // Sem a chave gravada: herda de quem edita obra (Orçamento é a chave de Obras).
    const deObras = args.permissoes?.canEditBudget;
    if (definido(deObras)) return deObras;
    return args.papel !== 'viewer';
}
