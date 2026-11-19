import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Serviço de editar/excluir versões (plano docs/planos/2026-11-19-imovib-versoes-editar-excluir.md, F2.3):
 * cada ação chama a RPC/UPDATE/DELETE certa, com a cópia do estudo montada pelo MESMO código do congelar,
 * e a mensagem do banco chega inteira a quem chamou.
 */
const chamadas = vi.hoisted(() => ({ rpc: [] as [string, Record<string, unknown>][], ops: [] as unknown[][], erro: null as null | string }));
vi.mock('../lib/supabase', () => {
    const resposta = () => Promise.resolve({ data: chamadas.erro ? null : [{ id: 'v1' }], error: chamadas.erro ? { message: chamadas.erro } : null });
    const q: Record<string, unknown> = {};
    q.from = (t: string) => { chamadas.ops.push(['from', t]); return q; };
    q.update = (v: unknown) => { chamadas.ops.push(['update', v]); return q; };
    q.delete = () => { chamadas.ops.push(['delete']); return q; };
    q.eq = (c: string, v: unknown) => { chamadas.ops.push(['eq', c, v]); return q; };
    q.select = () => q;
    q.then = (ok: (r: unknown) => unknown) => resposta().then(ok);
    q.single = () => Promise.resolve({ data: { id: 's1' }, error: null });
    q.rpc = (nome: string, args: Record<string, unknown>) => {
        chamadas.rpc.push([nome, args]);
        return Promise.resolve({ data: null, error: chamadas.erro ? { message: chamadas.erro } : null });
    };
    return { supabase: q };
});

import { imovibService } from '../services/imovibService';
import { baseStudy } from './fixtures/imovibEstudos';

beforeEach(() => {
    chamadas.rpc = []; chamadas.ops = []; chamadas.erro = null;
    for (const f of ['listarCenarios', 'listarRiscos', 'listarDueDiligence', 'listarComparaveis', 'listarSocios'] as const) {
        vi.spyOn(imovibService, f).mockResolvedValue([] as never);
    }
});

describe('editar versão pelo estudo', () => {
    it('iniciar: manda a versão e a cópia de segurança do estudo (com as listas do relatório)', async () => {
        await imovibService.iniciarEdicaoDaVersao(baseStudy() as never, 'v1');
        const [nome, args] = chamadas.rpc[0];
        expect(nome).toBe('imovib_versao_iniciar_edicao');
        expect(args.p_version_id).toBe('v1');
        const backup = args.p_backup as Record<string, unknown>;
        expect(backup.name).toBe('Estudo teste');
        expect(backup.relatorio).toEqual({ comparaveis: [], riscos: [], dueDiligence: [], socios: [] });
        expect(backup.cenarios).toEqual([]);
    });

    it('salvar: manda a cópia completa (com o cálculo congelado) e os resultados', async () => {
        const estudo = baseStudy();
        await imovibService.salvarEdicaoDaVersao(estudo as never);
        const [nome, args] = chamadas.rpc[0];
        expect(nome).toBe('imovib_versao_salvar_edicao');
        expect(args.p_study_id).toBe((estudo as { id: string }).id);
        expect((args.p_snapshot as Record<string, unknown>).calculo).toBeTruthy();
        expect(args.p_results).toBeTruthy();
    });

    it('descartar: só o estudo', async () => {
        await imovibService.descartarEdicaoDaVersao('s1');
        expect(chamadas.rpc).toEqual([['imovib_versao_descartar_edicao', { p_study_id: 's1' }]]);
    });

    it('a recusa do banco chega com a mensagem dele', async () => {
        chamadas.erro = 'Versão publicada na oportunidade «Garden» — só leitura.';
        await expect(imovibService.iniciarEdicaoDaVersao(baseStudy() as never, 'v1')).rejects.toThrow('Versão publicada na oportunidade «Garden» — só leitura.');
    });
});

describe('renomear e excluir', () => {
    it('renomear grava nome e observações da versão', async () => {
        await imovibService.renomearVersao('v1', 'Cenário banco', 'obs');
        expect(chamadas.ops).toEqual([['from', 'imovib_study_versions'], ['update', { label: 'Cenário banco', notes: 'obs' }], ['eq', 'id', 'v1']]);
    });

    it('excluir apaga a versão; a recusa do banco chega com a mensagem', async () => {
        await imovibService.excluirVersao('v1');
        expect(chamadas.ops).toEqual([['from', 'imovib_study_versions'], ['delete'], ['eq', 'id', 'v1']]);
        chamadas.erro = 'Versão publicada na oportunidade «Garden» — só leitura.';
        await expect(imovibService.excluirVersao('v1')).rejects.toThrow('só leitura');
    });
});

// Revisão final (C1): salvar Premissas numa aba carregada antes/depois da edição não pode regravar a
// marca da edição (e a cópia de segurança dentro dela).
describe('updateStudy nunca leva a edição de versão', () => {
    it('tira edicao_versao do que vai ao banco', async () => {
        await imovibService.updateStudy('s1', { name: 'Garden', edicao_versao: null } as never);
        const upd = chamadas.ops.find(o => o[0] === 'update')![1] as Record<string, unknown>;
        expect(upd.name).toBe('Garden');
        expect('edicao_versao' in upd).toBe(false);
    });
});
