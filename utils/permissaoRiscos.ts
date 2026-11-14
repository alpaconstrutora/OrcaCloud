/**
 * Quem vê e quem edita o módulo Riscos (F1.4 de docs/planos/2026-11-13-modulo-riscos.md).
 *
 * Chaves próprias (`canViewRisks`/`canEditRisks` e o módulo `riscos` na matriz
 * por cargo). Sem valor gravado, **herda de Obras** — o risco é do
 * empreendimento/obra/contrato, e quem hoje opera obra não pode perder o módulo
 * novo por não ter a chave gravada no perfil. Mesmo molde de
 * `utils/permissaoTreinamentos.ts` (que herda do RH).
 *
 * Ordem (a mesma de `checkModule`/`isModuleAllowed`): permissão do usuário →
 * matriz do cargo → herança de Obras.
 */

type Permissoes = Record<string, unknown> | null | undefined;
type MatrizDoCargo = Record<string, boolean> | null | undefined;

const definido = (v: unknown): v is boolean => typeof v === 'boolean';

export function podeVerRiscos(args: {
    permissoes: Permissoes;
    matrizDoCargo: MatrizDoCargo;
    /** o que Obras já decide para este usuário (`canViewBudget` → matriz `obras` → padrão) */
    podeVerObras: boolean;
}): boolean {
    const propria = args.permissoes?.canViewRisks;
    if (definido(propria)) return propria;
    const doCargo = args.matrizDoCargo?.riscos;
    if (definido(doCargo)) return doCargo;
    return args.podeVerObras;
}

/** Motivo exibido na tela quando ela abre só para leitura (botão desligado sempre diz o porquê). */
export const MOTIVO_SEM_EDICAO_RISCOS =
    'Você pode consultar os riscos, mas não editar: peça a permissão "Riscos · editar" a um administrador da organização.';

export function podeEditarRiscos(args: {
    permissoes: Permissoes;
    /** admin da organização, desenvolvedor, ou "Todas" sem membro resolvido — editam sempre */
    administrador: boolean;
    /** papel do membro na organização ativa (`viewer` = visitante) */
    papel?: string | null;
}): boolean {
    if (args.administrador) return true;
    const propria = args.permissoes?.canEditRisks;
    if (definido(propria)) return propria;
    // Sem a chave gravada: herda de quem edita obra (Orçamento é a chave de Obras).
    const deObras = args.permissoes?.canEditBudget;
    if (definido(deObras)) return deObras;
    return args.papel !== 'viewer';
}
