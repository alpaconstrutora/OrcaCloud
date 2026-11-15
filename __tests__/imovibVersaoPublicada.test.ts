import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Fase 2 do plano docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md: o investidor
 * vê a VERSÃO congelada publicada na oportunidade (fn_investor_portal_get_study devolve o snapshot
 * dela, a versão e a organização).
 */
const rpc = vi.hoisted(() => ({ resposta: null as unknown, chamadas: [] as unknown[] }));
const tabelas = vi.hoisted(() => ({ linhas: {} as Record<string, unknown> }));
vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: (nome: string, args: unknown) => { rpc.chamadas.push([nome, args]); return Promise.resolve({ data: rpc.resposta, error: null }); },
        from: (tabela: string) => {
            const r = { data: tabelas.linhas[tabela] ?? null, error: null };
            const q: Record<string, unknown> = {};
            q.select = () => q; q.eq = () => q;
            q.single = () => Promise.resolve(r); q.maybeSingle = () => Promise.resolve(r);
            return q;
        },
    },
}));

import { investorPortalTokenService } from '../services/investorPortalTokenService';
import { imovibService } from '../services/imovibService';
import { versaoPublicadaDoSnapshot, snapshotDaVersaoPublicada, dadosDoRelatorioDaVersao } from '../utils/imovibVersoes';
import { baseStudy } from './fixtures/imovibEstudos';

const versao = { id: 'v1', label: 'Comitê de novembro', created_at: '2026-11-15T13:40:00Z' };
const organizacao = { name: 'Alpa', logo_url: 'https://exemplo/logo.png' };
const riscos = [{ id: 'r1', description: 'Matrícula com ônus' }];
const cenarios = [{ id: 'c1', name: 'Pessimista' }];

beforeEach(() => { rpc.resposta = null; rpc.chamadas = []; });

describe('versão publicada', () => {
    it('separa o estudo das listas penduradas no snapshot e volta ao mesmo snapshot', () => {
        const snapshot = { ...(baseStudy() as object), cenarios, relatorio: { riscos } } as never;
        const vp = versaoPublicadaDoSnapshot(snapshot, versao, organizacao);
        expect(vp.cenarios).toEqual(cenarios);
        expect(vp.relatorio.riscos).toEqual(riscos);
        expect('cenarios' in vp.study).toBe(false);
        expect('relatorio' in vp.study).toBe(false);
        expect(vp.versao.label).toBe('Comitê de novembro');
        expect(dadosDoRelatorioDaVersao(snapshotDaVersaoPublicada(vp), vp.versao).riscos).toEqual(riscos);
    });

    it('pelo link: a RPC devolve a versão, a organização e as listas', async () => {
        rpc.resposta = { valid: true, study: { ...(baseStudy() as object) }, cenarios, relatorio: { riscos }, versao, organizacao };
        const vp = await investorPortalTokenService.getVersaoPublicadaByToken('tok', 'estudo-teste');
        expect(rpc.chamadas[0]).toEqual(['fn_investor_portal_get_study', { p_token: 'tok', p_study_id: 'estudo-teste' }]);
        expect(vp.study.name).toBe('Estudo teste');
        expect(vp.cenarios).toEqual(cenarios);
        expect(vp.relatorio.riscos).toEqual(riscos);
        expect(vp.versao).toEqual(versao);
        expect(vp.organizacao).toEqual(organizacao);
    });

    it('oportunidade sem versão publicada: diz em português', async () => {
        rpc.resposta = { valid: false, error: 'sem_versao' };
        await expect(investorPortalTokenService.getVersaoPublicadaByToken('tok', 'estudo-teste'))
            .rejects.toThrow('Esta oportunidade ainda não tem uma versão do estudo publicada.');
    });

    it('link vencido: diz em português', async () => {
        rpc.resposta = { valid: false, error: 'unauthorized' };
        await expect(investorPortalTokenService.getVersaoPublicadaByToken('tok', 'estudo-teste'))
            .rejects.toThrow('O link do portal venceu ou foi desativado.');
    });

    it('prévia do gestor: a mesma versão, com a organização do estudo', async () => {
        tabelas.linhas = {
            imovib_study_versions: { ...versao, snapshot: { ...(baseStudy() as object), organization_id: 'org', cenarios, relatorio: { riscos } } },
            organizations: organizacao,
        };
        const vp = await imovibService.versaoPublicada('v1');
        expect(vp.versao).toEqual(versao);
        expect(vp.organizacao).toEqual(organizacao);
        expect(vp.relatorio.riscos).toEqual(riscos);
        expect('relatorio' in vp.study).toBe(false);
    });
});
