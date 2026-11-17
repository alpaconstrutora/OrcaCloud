/**
 * Permissão "Diretoria (CEO)" — painel da diretoria (ÒPURA CEO, 17/11/2026).
 * Plano: docs/planos/2026-11-17-opura-ceo.md (decisão 3).
 *
 * Diferente de Riscos/Treinamentos, NADA herda: a permissão vem desligada para todos os
 * cargos (admin inclusive) e só a flag gravada no membro liga. É a mesma regra que o banco
 * aplica em `_diretoria_orgs` — a tela só espelha; quem libera os dados é o banco.
 *   ver    = canViewDiretoria ou canEditDiretoria
 *   editar = canEditDiretoria
 * `acessoTotal` = `temAcessoTotal(email)` (lista de superadmins do banco). O grupo
 * DESENVOLVEDOR sozinho NÃO conta: o banco não o trata como superadmin.
 */
type Permissoes = Record<string, unknown> | null | undefined;

export function podeVerDiretoria(args: { permissoes: Permissoes; acessoTotal: boolean }): boolean {
    if (args.acessoTotal) return true;
    return args.permissoes?.canViewDiretoria === true || args.permissoes?.canEditDiretoria === true;
}

export function podeEditarDiretoria(args: { permissoes: Permissoes; acessoTotal: boolean }): boolean {
    if (args.acessoTotal) return true;
    return args.permissoes?.canEditDiretoria === true;
}

export const MOTIVO_SEM_EDICAO_DIRETORIA =
    'Você pode consultar o painel, mas não editar: peça a permissão "Diretoria (CEO) · editar" a um administrador da organização.';
