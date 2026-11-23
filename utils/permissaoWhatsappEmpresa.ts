/**
 * Permissão "Usar o WhatsApp da empresa" — piloto do envio de pedido pelo OpenWA (23/11/2026).
 *
 * Mesmo modelo da Diretoria (utils/permissaoDiretoria.ts): NADA herda. A permissão vem
 * desligada para todos os cargos (owner/admin inclusive) e só a flag gravada no membro liga.
 * É a mesma regra que o banco aplica em `wa_pode_usar`
 * (`organization_members.permissions->>'canUseWhatsappEmpresa'`) — a tela só espelha;
 * quem libera o envio é o banco.
 * `acessoTotal` = `temAcessoTotal(email)` (lista de superadmins do banco). O grupo
 * DESENVOLVEDOR sozinho NÃO conta: o banco não o trata como superadmin.
 */
type Permissoes = Record<string, unknown> | null | undefined;

export function podeUsarWhatsappEmpresa(args: { permissoes: Permissoes; acessoTotal: boolean }): boolean {
    if (args.acessoTotal) return true;
    return args.permissoes?.canUseWhatsappEmpresa === true;
}

export const MOTIVO_SEM_WHATSAPP_EMPRESA =
    'O envio pelo número do ÒPURA depende da permissão "Usar o WhatsApp da empresa" (Minha organização › Usuários).';
