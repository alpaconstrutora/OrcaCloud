// Portal do Cliente › Assembleias — o serviço (Task A8).
// Plano: docs/planos/2026-11-25-condominio-assembleias-votacoes.md (R2, R5).
//
// O que erra em SILÊNCIO aqui: a leitura que falha (link expirado, RPC com erro)
// tem de virar lista vazia COM log — a aba mostra o estado vazio, não quebra, e o
// console conta o porquê; e o voto recusado tem de chegar à cédula traduzido, não
// como o "Failed to run…" cru do PostgREST.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
    rpc: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ supabase: { rpc: m.rpc } }));

import { clientPortalService } from '../services/clientPortalService';

beforeEach(() => {
    m.rpc.mockReset();
    vi.restoreAllMocks();
});

describe('getAssembleiasByToken / getAssembleiasForClient', () => {
    it('ok:false (link inválido) → [] com console.error do motivo', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        m.rpc.mockResolvedValue({ data: { ok: false, motivo: 'Link inválido ou expirado.' }, error: null });
        expect(await clientPortalService.getAssembleiasByToken('tok')).toEqual([]);
        expect(m.rpc).toHaveBeenCalledWith('client_portal_get_assembleias', { p_token: 'tok' });
        expect(log).toHaveBeenCalled();
        expect(String(log.mock.calls[0].join(' '))).toContain('Link inválido ou expirado.');
    });

    it('erro da RPC → [] com console.error', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        m.rpc.mockResolvedValue({ data: null, error: { message: 'boom', code: 'XX000' } });
        expect(await clientPortalService.getAssembleiasForClient('c1')).toEqual([]);
        expect(m.rpc).toHaveBeenCalledWith('client_portal_get_assembleias_for_client', { p_client_id: 'c1' });
        expect(log).toHaveBeenCalled();
    });

    it('ok:true normaliza total e frações (numeric pode chegar como string)', async () => {
        m.rpc.mockResolvedValue({
            data: {
                ok: true,
                assembleias: [{
                    id: 'a1', status: 'ENCERRADA', total: '1.000000000000', itens: [], sessaoValida: false,
                    minhasUnidades: [{ unitId: 'u1', rotulo: '101', impedida: null }],
                    resultado: [{ itemId: 'i1', ordem: '1', porOpcao: { SIM: { fracao: '0.25', unidades: '1' } }, resultado: 'APROVADO' }],
                }],
            },
            error: null,
        });
        const [a] = await clientPortalService.getAssembleiasForClient('c1');
        expect(a.total).toBe(1);
        expect(a.minhasUnidades[0].votos).toEqual({});
        expect(a.resultado?.[0].porOpcao.SIM).toEqual({ fracao: 0.25, unidades: 1 });
        expect(a.resultado?.[0].vencedora).toBeNull();
        expect(a.ataDocumentoId).toBeNull();
    });
});

describe('votarAssembleia', () => {
    it('chama a RPC só com item, unidade e opção (quem vota é a sessão)', async () => {
        m.rpc.mockResolvedValue({ data: { opcao: 'SIM', origem: 'PORTAL', votadoEm: '2026-12-01T13:00:00Z' }, error: null });
        expect(await clientPortalService.votarAssembleia('i1', 'u1', 'SIM'))
            .toEqual({ opcao: 'SIM', origem: 'PORTAL', votadoEm: '2026-12-01T13:00:00Z' });
        expect(m.rpc).toHaveBeenCalledWith('client_portal_assembleia_votar', { p_item: 'i1', p_unit: 'u1', p_opcao: 'SIM' });
    });

    it('erro cru do Supabase com HINT sai traduzido', async () => {
        m.rpc.mockResolvedValue({
            data: null,
            error: {
                code: '42501', hint: 'sem_direito_de_voto', details: null,
                message: 'Só o proprietário da unidade, entrando com o e-mail e a senha do cadastro, vota por ela.',
            },
        });
        await expect(clientPortalService.votarAssembleia('i1', 'u1', 'SIM'))
            .rejects.toThrow('Só o proprietário da unidade, com login próprio, pode votar.');
    });

    it('impedida: a frase leva o motivo do DETAIL', async () => {
        m.rpc.mockResolvedValue({
            data: null,
            error: { code: 'P0001', hint: 'unidade_impedida', details: 'Cota de 10/2026 vencida em 10/11/2026', message: 'A unidade 101 está impedida: …' },
        });
        await expect(clientPortalService.votarAssembleia('i1', 'u1', 'SIM'))
            .rejects.toThrow('Unidade impedida de votar: Cota de 10/2026 vencida em 10/11/2026');
    });
});
