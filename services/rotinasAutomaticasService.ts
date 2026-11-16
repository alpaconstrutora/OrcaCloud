import { supabase } from '../lib/supabase';

/**
 * Configurações › Rotinas automáticas — jobs do pg_cron, só para superadmin.
 * Plano: docs/planos/2026-11-16-rotinas-automaticas-ligar-desligar.md
 *
 * A autorização é do banco (`is_superadmin()` dentro das duas RPCs); `souSuperadmin` só
 * decide se a folha aparece no menu de Configurações.
 */

export interface RotinaAutomatica {
    jobid: number;
    jobname: string;
    /** Expressão cron em GMT — ver `quandoRoda`. */
    schedule: string;
    /** Estado REAL de `cron.job.active`. */
    ativa: boolean;
    ultima: { inicio: string; status: string; mensagem: string | null } | null;
    execucoes7d: number;
    falhas7d: number;
    ultimaAlteracao: { em: string; porEmail: string | null; ativaDepois: boolean } | null;
}

interface LinhaDoBanco {
    jobid: number;
    jobname: string;
    schedule: string;
    active: boolean;
    ultima_inicio: string | null;
    ultima_status: string | null;
    ultima_mensagem: string | null;
    execucoes_7d: number;
    falhas_7d: number;
    alterado_em: string | null;
    alterado_por_email: string | null;
    alterado_ativo_depois: boolean | null;
}

function daLinha(l: LinhaDoBanco): RotinaAutomatica {
    return {
        jobid: Number(l.jobid),
        jobname: l.jobname,
        schedule: l.schedule,
        ativa: l.active,
        ultima: l.ultima_inicio
            ? { inicio: l.ultima_inicio, status: l.ultima_status ?? '', mensagem: l.ultima_mensagem }
            : null,
        execucoes7d: l.execucoes_7d ?? 0,
        falhas7d: l.falhas_7d ?? 0,
        ultimaAlteracao: l.alterado_em
            ? { em: l.alterado_em, porEmail: l.alterado_por_email, ativaDepois: !!l.alterado_ativo_depois }
            : null,
    };
}

export const rotinasAutomaticasService = {
    async listar(): Promise<RotinaAutomatica[]> {
        const { data, error } = await supabase.rpc('fn_rotinas_automaticas_listar');
        if (error) throw new Error(error.message);
        return ((data ?? []) as LinhaDoBanco[]).map(daLinha);
    },

    /** Liga/desliga para TODAS as organizações. Devolve a linha já no estado novo. */
    async definir(jobname: string, ativa: boolean): Promise<RotinaAutomatica> {
        const { data, error } = await supabase.rpc('fn_rotina_automatica_definir', {
            p_jobname: jobname,
            p_ativo: ativa,
        });
        if (error) throw new Error(error.message);
        const linha = ((data ?? []) as LinhaDoBanco[])[0];
        if (!linha) throw new Error(`A rotina ${jobname} não voltou do banco.`);
        return daLinha(linha);
    },

    async souSuperadmin(): Promise<boolean> {
        try {
            const { data, error } = await supabase.rpc('is_superadmin');
            return !error && data === true;
        } catch {
            return false;
        }
    },
};
