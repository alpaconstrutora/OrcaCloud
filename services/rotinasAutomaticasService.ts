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
    /** NULL = job criado sem nome (`cron.schedule(expr, cmd)`) — endereçado pelo jobid. */
    jobname: string | null;
    /** Expressão cron em GMT — ver `quandoRoda`. */
    schedule: string;
    /** Estado REAL de `cron.job.active`. */
    ativa: boolean;
    ultima: { inicio: string; status: string; mensagem: string | null } | null;
    execucoes7d: number;
    falhas7d: number;
    /** Última execução que FALHOU na janela (40 dias), independente de como terminou a última. */
    ultimoErro: { em: string; mensagem: string } | null;
    ultimaAlteracao: { em: string; porEmail: string | null; ativaDepois: boolean } | null;
}

interface LinhaDoBanco {
    jobid: number;
    jobname: string | null;
    schedule: string;
    active: boolean;
    ultima_inicio: string | null;
    ultima_status: string | null;
    ultima_mensagem: string | null;
    execucoes_7d: number;
    falhas_7d: number;
    ultimo_erro_em: string | null;
    ultimo_erro_mensagem: string | null;
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
        ultimoErro: l.ultimo_erro_em ? { em: l.ultimo_erro_em, mensagem: l.ultimo_erro_mensagem ?? '' } : null,
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

    /**
     * Liga/desliga para TODAS as organizações. Devolve a linha já no estado novo.
     * Com nome, endereça pelo nome (sobrevive a reagendamento); sem nome, pelo `jobid`.
     */
    async definir(jobname: string | null, ativa: boolean, jobid?: number): Promise<RotinaAutomatica> {
        const args = jobname === null
            ? { p_jobname: null, p_ativo: ativa, p_jobid: jobid ?? null }
            : { p_jobname: jobname, p_ativo: ativa };
        const { data, error } = await supabase.rpc('fn_rotina_automatica_definir', args);
        if (error) throw new Error(error.message);
        const linha = ((data ?? []) as LinhaDoBanco[])[0];
        if (!linha) throw new Error(`A rotina ${jobname ?? `#${jobid}`} não voltou do banco.`);
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
