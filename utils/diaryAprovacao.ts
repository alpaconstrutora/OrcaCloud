import type { DiaryEntry } from '../types/diary';

/**
 * Quem aprova/recusa registro do Diário de Obra — a MESMA regra de
 * `fn_pode_aprovar_diario` (aplicar_20271014600000), que é quem decide de
 * verdade: as RPCs `diary_upsert_entry`/`diary_delete_entry` recusam com 42501.
 * Aqui é só para o botão dizer por quê antes de a pessoa tentar.
 *
 * - não é membro da org do diário: não aprova;
 * - admin/owner: aprova;
 * - `canApproveDiary` definido no membro: vale ele;
 * - sem a chave: NÃO aprova (member "não mexe em aprovações" — getDefaultPermissions).
 * - org ainda não carregada no store: libera o botão (o banco segue conferindo).
 */

type Status = NonNullable<DiaryEntry['status']>;

export interface AprovacaoDiario {
    pode: boolean;
    /** Por que não pode — vai no `title` e no aviso. */
    motivo?: string;
}

export const MOTIVO_SEM_PERMISSAO_APROVAR =
    'Aprovar ou recusar exige a permissão de aprovação do Diário de Obra (Usuários › Permissões Detalhadas › Operação de Obra).';
export const MOTIVO_REGISTRO_APROVADO =
    'Registro aprovado: só quem aprova o Diário de Obra pode alterá-lo ou excluí-lo.';

export function avaliarAprovacaoDiario(args: {
    orgCarregada: boolean;
    membro: { role?: string | null; permissions?: Record<string, unknown> | null } | null;
}): AprovacaoDiario {
    if (!args.orgCarregada) return { pode: true };
    const m = args.membro;
    if (!m) return { pode: false, motivo: 'Você não é membro da organização deste diário — não pode aprovar registros.' };
    if (m.role === 'admin' || m.role === 'owner') return { pode: true };
    const perm = m.permissions ? m.permissions['canApproveDiary'] : undefined;
    return perm === true ? { pode: true } : { pode: false, motivo: MOTIVO_SEM_PERMISSAO_APROVAR };
}

/** Este status pode ser escolhido? (a regra do banco: passar a Aprovado/Recusado exige permissão). */
export function podeEscolherStatus(alvo: Status, statusNoBanco: Status | null, a: AprovacaoDiario): AprovacaoDiario {
    if (a.pode) return a;
    if ((alvo === 'Aprovado' || alvo === 'Recusado') && alvo !== statusNoBanco) {
        return { pode: false, motivo: a.motivo || MOTIVO_SEM_PERMISSAO_APROVAR };
    }
    return { pode: true };
}

/** O registro está travado para esta pessoa? (aprovado no banco + sem permissão) */
export function registroTravado(statusNoBanco: Status | null | undefined, a: AprovacaoDiario): AprovacaoDiario {
    if (statusNoBanco === 'Aprovado' && !a.pode) return { pode: false, motivo: MOTIVO_REGISTRO_APROVADO };
    return { pode: true };
}
