import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Service de Configurações › Rotinas automáticas — fala com as duas RPCs só-superadmin
 * (fn_rotinas_automaticas_listar / fn_rotina_automatica_definir) e com is_superadmin.
 * Plano: docs/planos/2026-11-16-rotinas-automaticas-ligar-desligar.md (Task 3).
 */
const rpc = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { rotinasAutomaticasService } from '../services/rotinasAutomaticasService';

const LINHA_COMPLETA = {
    jobid: 7, jobname: 'process-sla-sweep', schedule: '5 * * * *', active: true,
    ultima_inicio: '2026-11-16T17:05:00Z', ultima_status: 'failed', ultima_mensagem: 'ERROR: x',
    execucoes_7d: 168, falhas_7d: 3,
    ultimo_erro_em: '2026-11-16T07:00:00Z', ultimo_erro_mensagem: 'ERROR: create_task',
    alterado_em: '2026-11-16T15:00:00Z', alterado_por_email: 'a@b.com', alterado_ativo_depois: true,
};

const LINHA_SEM_HISTORICO = {
    ...LINHA_COMPLETA, jobid: 8, jobname: 'x-nova',
    ultima_inicio: null, ultima_status: null, ultima_mensagem: null,
    execucoes_7d: 0, falhas_7d: 0, ultimo_erro_em: null, ultimo_erro_mensagem: null,
    alterado_em: null, alterado_por_email: null, alterado_ativo_depois: null,
};

describe('rotinasAutomaticasService', () => {
    beforeEach(() => rpc.mockReset());

    it('listar chama fn_rotinas_automaticas_listar e mapeia as linhas', async () => {
        rpc.mockResolvedValue({ data: [LINHA_COMPLETA, LINHA_SEM_HISTORICO], error: null });
        const rotinas = await rotinasAutomaticasService.listar();
        expect(rpc).toHaveBeenCalledWith('fn_rotinas_automaticas_listar');
        expect(rotinas[0]).toEqual({
            jobid: 7, jobname: 'process-sla-sweep', schedule: '5 * * * *', ativa: true,
            ultima: { inicio: '2026-11-16T17:05:00Z', status: 'failed', mensagem: 'ERROR: x' },
            execucoes7d: 168, falhas7d: 3,
            ultimoErro: { em: '2026-11-16T07:00:00Z', mensagem: 'ERROR: create_task' },
            ultimaAlteracao: { em: '2026-11-16T15:00:00Z', porEmail: 'a@b.com', ativaDepois: true },
        });
        expect(rotinas[1].ultima).toBeNull();
        expect(rotinas[1].ultimaAlteracao).toBeNull();
        expect(rotinas[1].ultimoErro).toBeNull();
    });

    it('definir manda jobname e estado e devolve a linha mapeada', async () => {
        rpc.mockResolvedValue({ data: [{ ...LINHA_COMPLETA, active: false }], error: null });
        const r = await rotinasAutomaticasService.definir('process-sla-sweep', false);
        expect(rpc).toHaveBeenCalledWith('fn_rotina_automatica_definir', { p_jobname: 'process-sla-sweep', p_ativo: false });
        expect(r.ativa).toBe(false);
        expect(r.jobname).toBe('process-sla-sweep');
    });

    it('rotina sem nome (jobname NULL): definir manda o jobid', async () => {
        rpc.mockResolvedValue({ data: [{ ...LINHA_COMPLETA, jobid: 77, jobname: null, active: false }], error: null });
        const r = await rotinasAutomaticasService.definir(null, false, 77);
        expect(rpc).toHaveBeenCalledWith('fn_rotina_automatica_definir', { p_jobname: null, p_ativo: false, p_jobid: 77 });
        expect(r.jobname).toBeNull();
        expect(r.jobid).toBe(77);
    });

    it('erro da RPC vira exceção com a mensagem do banco', async () => {
        rpc.mockResolvedValue({ data: null, error: { message: 'apenas superadmin' } });
        await expect(rotinasAutomaticasService.listar()).rejects.toThrow('apenas superadmin');
        await expect(rotinasAutomaticasService.definir('a', true)).rejects.toThrow('apenas superadmin');
    });

    it('definir sem linha de volta é erro (rotina sumiu entre a lista e o clique)', async () => {
        rpc.mockResolvedValue({ data: [], error: null });
        await expect(rotinasAutomaticasService.definir('a', true)).rejects.toThrow();
    });

    it('souSuperadmin: true só com data === true; erro vira false', async () => {
        rpc.mockResolvedValueOnce({ data: true, error: null });
        expect(await rotinasAutomaticasService.souSuperadmin()).toBe(true);
        expect(rpc).toHaveBeenLastCalledWith('is_superadmin');
        rpc.mockResolvedValueOnce({ data: false, error: null });
        expect(await rotinasAutomaticasService.souSuperadmin()).toBe(false);
        rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
        expect(await rotinasAutomaticasService.souSuperadmin()).toBe(false);
        rpc.mockRejectedValueOnce(new Error('rede'));
        expect(await rotinasAutomaticasService.souSuperadmin()).toBe(false);
    });
});
