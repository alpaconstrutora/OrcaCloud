import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const invoke = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
const listarDoUsuario = vi.fn();
const gravar = vi.fn();
vi.mock('../services/preferenciasService', () => ({
    preferenciasService: { listarDoUsuario: () => listarDoUsuario(), gravar: (...a: unknown[]) => gravar(...a) },
}));

import { diretoriaService } from '../services/diretoriaService';

// Plano: docs/planos/2026-11-17-opura-ceo.md (Tarefa 5).
beforeEach(() => { rpc.mockReset(); invoke.mockReset(); listarDoUsuario.mockReset(); gravar.mockReset(); });

describe('diretoriaService', () => {
    it('painel: org do topo (ou null = "Todas") e listas vazias quando o banco não manda', async () => {
        rpc.mockResolvedValue({ data: { hoje: '2026-11-17', orgs: [{ id: 'a', nome: 'A', pode_editar: true }] }, error: null });
        const p = await diretoriaService.painel(null);
        expect(rpc).toHaveBeenCalledWith('fn_diretoria_painel', { p_org: null });
        expect(p.excecoes).toEqual([]);
        expect(p.determinacoes).toEqual([]);
        expect(p.erros).toEqual({});
        expect(p.orgs[0].pode_editar).toBe(true);
    });

    it('erro do banco sobe com o código (42501 = sem a permissão)', async () => {
        rpc.mockResolvedValue({ data: null, error: { message: 'sem acesso: falta a permissão "Diretoria (CEO)" nesta organização', code: '42501' } });
        await expect(diretoriaService.painel('a')).rejects.toMatchObject({ code: '42501', message: expect.stringContaining('Diretoria (CEO)') });
    });

    it('cobrar manda a chave, o tipo, o título, os responsáveis e a tela de origem', async () => {
        rpc.mockResolvedValue({ data: { criadas: 2, ja_abertas: 0 }, error: null });
        const r = await diretoriaService.cobrar({ orgId: 'a', chave: 'k', tipo: 'conta_vencida', titulo: '3 contas', responsaveis: ['r', 's'], tela: 'contas-a-pagar' });
        expect(rpc).toHaveBeenCalledWith('fn_diretoria_cobrar', {
            p_org: 'a', p_chave: 'k', p_tipo: 'conta_vencida', p_titulo: '3 contas', p_responsaveis: ['r', 's'], p_view: 'contas-a-pagar',
        });
        expect(r).toEqual({ criadas: 2, ja_abertas: 0 });
    });

    it('determinar, atualizar, concluir, área e chefe chamam as RPCs com os nomes do banco', async () => {
        rpc.mockResolvedValue({ data: 'id-1', error: null });
        expect(await diretoriaService.determinar({ orgId: 'a', titulo: 'T', responsavelId: 'r', prazo: '2026-11-24', origem: 'Reunião', excecaoChave: null })).toBe('id-1');
        expect(rpc).toHaveBeenLastCalledWith('fn_diretoria_determinar', { p_org: 'a', p_titulo: 'T', p_responsavel: 'r', p_prazo: '2026-11-24', p_origem: 'Reunião', p_excecao_chave: null });
        await diretoriaService.atualizar('id-1', 'andou');
        expect(rpc).toHaveBeenLastCalledWith('fn_diretoria_atualizar', { p_id: 'id-1', p_texto: 'andou' });
        await diretoriaService.concluir('id-1');
        expect(rpc).toHaveBeenLastCalledWith('fn_diretoria_concluir', { p_id: 'id-1' });
        await diretoriaService.definirArea('a', 'financeiro', null);
        expect(rpc).toHaveBeenLastCalledWith('fn_diretoria_definir_area', { p_org: 'a', p_area: 'financeiro', p_user: null });
        await diretoriaService.definirChefe('a', 'r', 'd');
        expect(rpc).toHaveBeenLastCalledWith('fn_diretoria_definir_chefe', { p_org: 'a', p_user: 'r', p_chefe: 'd' });
    });

    it('preferências: visão e silenciados lidos e gravados como USUARIO', async () => {
        listarDoUsuario.mockResolvedValue([
            { escopo: 'USUARIO', chave: 'diretoria.visao', valor: 'reuniao' },
            { escopo: 'USUARIO', chave: 'diretoria.silenciados', valor: 'conta_vencida,xyz' },
            { escopo: 'USUARIO', chave: 'planta.exibir.cotas', valor: true },
        ]);
        expect(await diretoriaService.preferencias()).toEqual({ visao: 'reuniao', silenciados: ['conta_vencida'], resumoSemanal: false });
        listarDoUsuario.mockResolvedValue([{ escopo: 'USUARIO', chave: 'diretoria.visao', valor: 'outra' }]);
        expect(await diretoriaService.preferencias()).toEqual({ visao: null, silenciados: [], resumoSemanal: false });

        await diretoriaService.gravarVisao('responsavel');
        expect(gravar).toHaveBeenLastCalledWith('USUARIO', {}, 'diretoria.visao', 'responsavel');
        await diretoriaService.gravarSilenciados(['tarefa_vencida', 'conta_vencida']);
        expect(gravar).toHaveBeenLastCalledWith('USUARIO', {}, 'diretoria.silenciados', 'conta_vencida,tarefa_vencida');
        await diretoriaService.gravarSilenciados([]);
        expect(gravar).toHaveBeenLastCalledWith('USUARIO', {}, 'diretoria.silenciados', null);
    });

    it('resumo por e-mail: liga/desliga na preferência diretoria.resumo_semanal (desligar apaga a linha)', async () => {
        listarDoUsuario.mockResolvedValue([{ escopo: 'USUARIO', chave: 'diretoria.resumo_semanal', valor: true }]);
        expect((await diretoriaService.preferencias()).resumoSemanal).toBe(true);
        await diretoriaService.gravarResumoSemanal(true);
        expect(gravar).toHaveBeenLastCalledWith('USUARIO', {}, 'diretoria.resumo_semanal', true);
        await diretoriaService.gravarResumoSemanal(false);
        expect(gravar).toHaveBeenLastCalledWith('USUARIO', {}, 'diretoria.resumo_semanal', null);
    });

    it('prévia: chama a function diretoria-resumo-semanal; falha vira mensagem legível', async () => {
        invoke.mockResolvedValue({ data: { modo: 'previa', enviados: 1 }, error: null });
        expect(await diretoriaService.enviarPrevia()).toBe(1);
        expect(invoke).toHaveBeenCalledWith('diretoria-resumo-semanal', { body: {} });
        invoke.mockResolvedValue({ data: null, error: { message: 'Failed to send a request to the Edge Function' } });
        await expect(diretoriaService.enviarPrevia()).rejects.toThrow(/prévia não saiu/i);
    });

    it('painel sem semana_anterior vira null', async () => {
        rpc.mockResolvedValue({ data: { hoje: '2026-11-17' }, error: null });
        expect((await diretoriaService.painel('a')).semana_anterior).toBeNull();
    });
});
