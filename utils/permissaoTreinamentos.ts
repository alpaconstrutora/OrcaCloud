/**
 * Quem vê e quem edita a GESTÃO de treinamentos (menu "Treinamentos").
 *
 * Pedido de 16/10/2026: a gestão saiu de Recursos Humanos — "não é (só) o RH"
 * quem cuida de treinamento. Plano:
 * docs/planos/2026-10-16-treinamentos-fora-do-rh-e-meus-treinamentos.md
 *
 * Chaves próprias (`canViewTrainings`/`canEditTrainings` e o módulo
 * `treinamentos` na matriz por cargo). A regra que segura a migração:
 * **sem valor gravado, herda do RH** — quem hoje gerencia por estar no RH
 * continua gerenciando, sem ninguém precisar reconfigurar perfil. O admin
 * concede só Treinamentos a quem não é do RH.
 *
 * Ordem (a mesma de `checkModule`/`isModuleAllowed`): permissão do usuário →
 * matriz do cargo → herança do RH.
 */

type Permissoes = Record<string, unknown> | null | undefined;
type MatrizDoCargo = Record<string, boolean> | null | undefined;

const definido = (v: unknown): v is boolean => typeof v === 'boolean';

export function podeVerTreinamentos(args: {
  permissoes: Permissoes;
  matrizDoCargo: MatrizDoCargo;
  /** o que o RH já decide para este usuário (`canViewLabor` → matriz `rh` → padrão) */
  podeVerRh: boolean;
}): boolean {
  const propria = args.permissoes?.canViewTrainings;
  if (definido(propria)) return propria;
  const doCargo = args.matrizDoCargo?.treinamentos;
  if (definido(doCargo)) return doCargo;
  return args.podeVerRh;
}

export function podeEditarTreinamentos(args: {
  permissoes: Permissoes;
  /** admin da organização e desenvolvedor editam sempre */
  administrador: boolean;
}): boolean {
  if (args.administrador) return true;
  const propria = args.permissoes?.canEditTrainings;
  if (definido(propria)) return propria;
  const doRh = args.permissoes?.canEditLabor;
  if (definido(doRh)) return doRh;
  // Sem nada gravado: como era em RH › Treinamentos — quem vê, edita.
  return true;
}
