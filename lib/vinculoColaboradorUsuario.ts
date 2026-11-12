/**
 * Quem pode vincular um colaborador (employees) a um usuário do sistema.
 *
 * Quem o colaborador "é" passa a ver e editar as tarefas de que ele é
 * responsável — vincular é dar acesso. Por isso só owner/admin da org do
 * colaborador (decisão do usuário, 2026-11-12). Quem garante é o banco: o
 * gatilho trg_employees_vinculo_so_gestor
 * (aplicar_20271112800000_vinculo_colaborador_e_envolvidos_trava.sql), que
 * também barra trocar o e-mail do colaborador para o de um login. Aqui é só
 * a tela dizer o motivo antes de o usuário tentar.
 */
export const MOTIVO_VINCULO_SO_GESTOR =
    'Só owner ou admin da organização vincula o colaborador a um usuário do sistema — quem é vinculado passa a ver as tarefas dele.';

export function motivoVinculoUsuarioBloqueado(args: {
    desenvolvedor: boolean;
    orgCarregada: boolean;
    papel: string | null | undefined;
}): string | null {
    if (args.desenvolvedor || !args.orgCarregada) return null;
    return args.papel === 'owner' || args.papel === 'admin' ? null : MOTIVO_VINCULO_SO_GESTOR;
}
