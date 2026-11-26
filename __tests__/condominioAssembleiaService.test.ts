import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Task A4 — serviço do gestor e tradução de erro das assembleias.
 * Plano: docs/planos/2026-11-25-condominio-assembleias-votacoes.md (Task A4).
 *
 * A regra (estado, quórum, impedimento, trava) é do banco — provada em
 * scripts/teste-condominio-assembleias-*.sql. Aqui se fixa o contrato do TS:
 * a frase de cada HINT, o nome/parâmetros de cada RPC, que o rascunho só manda
 * as 7 colunas que o app pode gravar, e que reescrever a pauta não perde itens.
 */

type Chamada = { tabela: string; ops: { op: string; args: unknown[] }[] };
type Resposta = { data: unknown; error: { code?: string; hint?: string; details?: string; message: string } | null };

const m = vi.hoisted(() => ({
    rpcs: [] as { fn: string; args: Record<string, unknown> }[],
    chamadas: [] as Chamada[],
    respostaRpc: { data: {} as unknown, error: null } as Resposta,
    // Decide a resposta de cada consulta encadeada (chamada já com todos os passos).
    responder: (_c: Chamada): Resposta => ({ data: [], error: null }),
}));

vi.mock('../lib/supabase', () => {
    const construtor = (tabela: string) => {
        const chamada: Chamada = { tabela, ops: [] };
        m.chamadas.push(chamada);
        const b: Record<string, unknown> = {};
        for (const op of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'order', 'single', 'maybeSingle']) {
            b[op] = (...args: unknown[]) => { chamada.ops.push({ op, args }); return b; };
        }
        b.then = (ok: (r: Resposta) => unknown, falha?: (e: unknown) => unknown) =>
            Promise.resolve(m.responder(chamada)).then(ok, falha);
        return b;
    };
    return {
        supabase: {
            rpc: async (fn: string, args: Record<string, unknown>) => { m.rpcs.push({ fn, args }); return m.respostaRpc; },
            from: construtor,
        },
    };
});

import {
    traduzirErroAssembleia,
    operacoesDoGestor,
    condominioAssembleiaService,
    ErroAssembleia,
} from '../services/condominioAssembleiaService';

const ops = (c: Chamada) => c.ops.map(o => o.op);
const arg = (c: Chamada, op: string) => c.ops.find(o => o.op === op)?.args[0];

beforeEach(() => {
    m.rpcs = []; m.chamadas = [];
    m.respostaRpc = { data: {}, error: null };
    m.responder = () => ({ data: [], error: null });
});

// ─── tradução de erro ────────────────────────────────────────────────────────
describe('traduzirErroAssembleia — frases fixas do plano', () => {
    it('assembleia_travada', () => {
        expect(traduzirErroAssembleia({ code: '23514', hint: 'assembleia_travada', message: 'Depois de convocada, a pauta não muda.' }))
            .toBe('Esta assembleia não aceita mais mudanças neste estado.');
    });

    it('unidade_impedida junta o motivo do DETAIL', () => {
        expect(traduzirErroAssembleia({
            code: 'P0001', hint: 'unidade_impedida',
            details: 'Cota de 10/2026 vencida em 10/10/2026',
            message: 'A unidade Torre A — 101 está impedida: Cota de 10/2026 vencida em 10/10/2026.',
        })).toBe('Unidade impedida de votar: Cota de 10/2026 vencida em 10/10/2026');
    });

    it('sem_quorum_primeira', () => {
        expect(traduzirErroAssembleia({ code: 'P0001', hint: 'sem_quorum_primeira', message: 'Na 1ª convocação…' }))
            .toBe('Presentes não somam metade das frações: só é possível instalar em 2ª convocação.');
    });

    it('antes_do_horario', () => {
        expect(traduzirErroAssembleia({ code: 'P0001', hint: 'antes_do_horario', message: 'A 1ª convocação está marcada para…' }))
            .toBe('Ainda não chegou o horário desta convocação.');
    });

    it('opcao_invalida', () => {
        expect(traduzirErroAssembleia({ code: 'P0001', hint: 'opcao_invalida', message: 'x' }))
            .toBe('Opção de voto inválida para este item.');
    });

    it('sem_direito_de_voto (vem com 42501, mas o HINT manda)', () => {
        expect(traduzirErroAssembleia({ code: '42501', hint: 'sem_direito_de_voto', message: 'Só o proprietário…' }))
            .toBe('Só o proprietário da unidade, com login próprio, pode votar.');
    });

    it('42501 sem HINT', () => {
        expect(traduzirErroAssembleia({ code: '42501', message: 'Sem permissão para conduzir assembleias deste condomínio.' }))
            .toBe('Sem permissão neste condomínio.');
    });

    it('desconhecido devolve message', () => {
        expect(traduzirErroAssembleia({ code: 'XX000', hint: 'outra_coisa', message: 'Falha qualquer.' }))
            .toBe('Falha qualquer.');
        expect(traduzirErroAssembleia({ message: 'Failed to fetch' })).toBe('Failed to fetch');
    });
});

describe('traduzirErroAssembleia — demais HINTs do banco', () => {
    // Lista conferida por grep nas três migrations (A1–A3): todo HINT tem frase própria.
    const HINTS = [
        'antes_do_horario', 'assembleia_travada', 'convocacao_invalida', 'deliberacoes_invalidas',
        'documento_invalido', 'edital_nao_confirmado', 'estado', 'item_fora', 'nao_encontrada',
        'opcao_invalida', 'papel_invalido', 'presenca_invalida', 'primeira_no_passado',
        'procuracao_invalida', 'sem_corpo', 'sem_datas', 'sem_itens', 'sem_mesa', 'sem_motivo',
        'sem_presenca', 'sem_quorum_primeira', 'sem_unidades', 'tem_voto_presencial',
        'unidade_fora', 'unidade_impedida', 'sem_direito_de_voto', 'motivo_longo',
    ];

    // 'estado' fica de fora de propósito: a frase do banco diz o estado (teste abaixo).
    it.each(HINTS.filter(h => h !== 'estado'))('%s tem frase própria em português (não cai no message cru)', (hint) => {
        const t = traduzirErroAssembleia({ code: 'P0001', hint, details: 'motivo', message: 'MENSAGEM_CRUA' });
        expect(t).not.toBe('MENSAGEM_CRUA');
        expect(t.trim().length).toBeGreaterThan(10);
    });

    it('todo HINT das migrations está na lista acima', async () => {
        const { readFileSync, readdirSync } = await import('node:fs');
        const path = await import('node:path');
        const pasta = path.join(process.cwd(), 'supabase', 'migrations');
        const achados = new Set<string>();
        for (const f of readdirSync(pasta).filter(n => /^aplicar_2027112586\d+_condominio_assembleias/.test(n))) {
            for (const x of readFileSync(path.join(pasta, f), 'utf8').matchAll(/HINT = '([a-z_]+)'/g)) achados.add(x[1]);
        }
        expect(achados.size).toBeGreaterThan(0);
        expect([...achados].filter(h => !HINTS.includes(h))).toEqual([]);
    });

    it('estado mantém a frase do banco (diz em que estado ela está: "já foi encerrada")', () => {
        expect(traduzirErroAssembleia({ code: 'P0001', hint: 'estado', message: 'Esta assembleia já foi encerrada.' }))
            .toBe('Esta assembleia já foi encerrada.');
        expect(traduzirErroAssembleia({ code: 'P0001', hint: 'estado', message: '' }))
            .toBe('Esta ação não vale no estado atual da assembleia.');
    });

    it('assembleia_travada ao excluir aviso/ata da assembleia mantém a frase específica', () => {
        const msg = 'Este aviso ou documento pertence a uma assembleia convocada e não pode ser excluído.';
        expect(traduzirErroAssembleia({ code: '23514', hint: 'assembleia_travada', message: msg })).toBe(msg);
    });

    it('unidade_impedida sem DETAIL não termina em "undefined"', () => {
        const t = traduzirErroAssembleia({ code: 'P0001', hint: 'unidade_impedida', message: 'A unidade X está impedida.' });
        expect(t).not.toMatch(/undefined|null/);
    });

    it('CHECK das datas e das opções viram frase', () => {
        expect(traduzirErroAssembleia({ code: '23514', message: 'new row for relation "condominio_assembleias" violates check constraint "condominio_assembleias_segunda_depois_da_primeira"' }))
            .toBe('A 2ª convocação tem de ser depois da 1ª.');
        expect(traduzirErroAssembleia({ code: '23514', message: 'new row for relation "condominio_assembleia_itens" violates check constraint "condominio_assembleia_itens_tipo_opcoes"' }))
            .toMatch(/opções/);
    });
});

// ─── operações do gestor (RPCs da A2/A3) ─────────────────────────────────────
describe('operacoesDoGestor → RPCs', () => {
    it('convocar', async () => {
        m.respostaRpc = { data: { unidades: 8, fora: ['Torre A — Estacionamento'], avisoId: 'av1' }, error: null };
        const r = await operacoesDoGestor.convocar('a1', 'Texto do aviso');
        expect(m.rpcs).toEqual([{ fn: 'condominio_assembleia_convocar', args: { p_assembleia: 'a1', p_corpo_aviso: 'Texto do aviso' } }]);
        expect(r).toEqual({ unidades: 8, fora: ['Torre A — Estacionamento'], avisoId: 'av1' });
    });

    it('cancelar', async () => {
        await operacoesDoGestor.cancelar('a1', 'Falta de quórum', 'Corpo');
        expect(m.rpcs).toEqual([{ fn: 'condominio_assembleia_cancelar', args: { p_assembleia: 'a1', p_motivo: 'Falta de quórum', p_corpo_aviso: 'Corpo' } }]);
    });

    it('registrarPresenca: na sala, por procurador e remover', async () => {
        await operacoesDoGestor.registrarPresenca('a1', 'u1', 'PRESENCIAL');
        await operacoesDoGestor.registrarPresenca('a1', 'u2', 'PROCURADOR', 'Maria', 'doc1');
        await operacoesDoGestor.registrarPresenca('a1', 'u3', null);
        expect(m.rpcs).toEqual([
            { fn: 'condominio_assembleia_registrar_presenca', args: { p_assembleia: 'a1', p_unit: 'u1', p_presenca: 'PRESENCIAL', p_procurador: null, p_procuracao: null } },
            { fn: 'condominio_assembleia_registrar_presenca', args: { p_assembleia: 'a1', p_unit: 'u2', p_presenca: 'PROCURADOR', p_procurador: 'Maria', p_procuracao: 'doc1' } },
            { fn: 'condominio_assembleia_registrar_presenca', args: { p_assembleia: 'a1', p_unit: 'u3', p_presenca: null, p_procurador: null, p_procuracao: null } },
        ]);
    });

    it('instalar', async () => {
        await operacoesDoGestor.instalar('a1', { convocacao: 2, presidente: 'Ana', secretario: 'Beto', editalEntregue: true });
        expect(m.rpcs).toEqual([{ fn: 'condominio_assembleia_instalar', args: {
            p_assembleia: 'a1', p_convocacao: 2, p_presidente: 'Ana', p_secretario: 'Beto', p_edital_entregue: true,
        } }]);
    });

    it('lancarVoto', async () => {
        await operacoesDoGestor.lancarVoto('i1', 'u1', 'SIM');
        expect(m.rpcs).toEqual([{ fn: 'condominio_assembleia_lancar_voto', args: { p_item: 'i1', p_unit: 'u1', p_opcao: 'SIM' } }]);
    });

    it('encerrar', async () => {
        await operacoesDoGestor.encerrar('a1', { i1: 'Aprovadas as contas.' }, 'Sem observações');
        expect(m.rpcs).toEqual([{ fn: 'condominio_assembleia_encerrar', args: {
            p_assembleia: 'a1', p_deliberacoes: { i1: 'Aprovadas as contas.' }, p_observacao: 'Sem observações',
        } }]);
    });

    it('vincularAta', async () => {
        await operacoesDoGestor.vincularAta('a1', 'doc9');
        expect(m.rpcs).toEqual([{ fn: 'condominio_assembleia_vincular_ata', args: { p_assembleia: 'a1', p_documento: 'doc9' } }]);
    });

    it('apuracao converte números', async () => {
        m.respostaRpc = { data: {
            total: '0.01', presentesFracao: 0.005, presentesUnidades: 4,
            itens: [{ itemId: 'i1', ordem: 1, titulo: 'Contas', tipo: 'APROVACAO', quorum: 'MAIORIA_PRESENTES',
                      porOpcao: { SIM: { fracao: '0.00375', unidades: 3 }, NAO: { fracao: 0.00125, unidades: 1 }, ABSTENCAO: { fracao: 0, unidades: 0 } },
                      resultado: 'APROVADO', vencedora: null }],
        }, error: null };
        const r = await operacoesDoGestor.apuracao('a1');
        expect(m.rpcs).toEqual([{ fn: 'condominio_assembleia_apuracao', args: { p_assembleia: 'a1' } }]);
        expect(r.total).toBe(0.01);
        expect(r.itens[0].porOpcao.SIM).toEqual({ fracao: 0.00375, unidades: 3 });
        expect(r.itens[0].resultado).toBe('APROVADO');
    });

    it('impedimentos (com a origem: MANUAL × AUTOMATICA — A10)', async () => {
        m.respostaRpc = { data: [
            { unitId: 'u1', motivo: 'Cota de 10/2026 vencida em 10/10/2026', origem: 'AUTOMATICA' },
            { unitId: 'u2', motivo: 'Acordo descumprido', origem: 'MANUAL' },
        ], error: null };
        const r = await operacoesDoGestor.impedimentos('a1');
        expect(m.rpcs).toEqual([{ fn: 'condominio_assembleia_impedimentos', args: { p_assembleia: 'a1' } }]);
        expect(r).toEqual([
            { unitId: 'u1', motivo: 'Cota de 10/2026 vencida em 10/10/2026', origem: 'AUTOMATICA' },
            { unitId: 'u2', motivo: 'Acordo descumprido', origem: 'MANUAL' },
        ]);
    });

    it('marcarImpedida: marcar com motivo e desmarcar com null (A10)', async () => {
        m.respostaRpc = { data: { unitId: 'u2', motivo: 'Acordo descumprido', em: '2026-12-10T22:10:00Z' }, error: null };
        const r = await operacoesDoGestor.marcarImpedida('a1', 'u2', 'Acordo descumprido');
        expect(r).toEqual({ unitId: 'u2', motivo: 'Acordo descumprido', em: '2026-12-10T22:10:00Z' });
        m.respostaRpc = { data: { unitId: 'u2', motivo: null, em: null }, error: null };
        await operacoesDoGestor.marcarImpedida('a1', 'u2', null);
        expect(m.rpcs).toEqual([
            { fn: 'condominio_assembleia_marcar_impedida', args: { p_assembleia: 'a1', p_unit: 'u2', p_motivo: 'Acordo descumprido' } },
            { fn: 'condominio_assembleia_marcar_impedida', args: { p_assembleia: 'a1', p_unit: 'u2', p_motivo: null } },
        ]);
    });

    it('marcarImpedida sem motivo: a frase do banco (sem_motivo vale para cancelar e para marcar)', async () => {
        m.respostaRpc = { data: null, error: { code: 'P0001', hint: 'sem_motivo', message: 'Informe o motivo do impedimento.' } };
        await expect(operacoesDoGestor.marcarImpedida('a1', 'u2', '  ')).rejects.toThrow('Informe o motivo do impedimento.');
        expect(traduzirErroAssembleia({ code: 'P0001', hint: 'sem_motivo', message: 'Informe o motivo do cancelamento.' }))
            .toBe('Informe o motivo do cancelamento.');
    });

    it('cotasConferidas (A10)', async () => {
        m.respostaRpc = { data: false, error: null };
        expect(await operacoesDoGestor.cotasConferidas('a1')).toBe(false);
        m.respostaRpc = { data: true, error: null };
        expect(await operacoesDoGestor.cotasConferidas('a1')).toBe(true);
        expect(m.rpcs).toEqual([
            { fn: 'condominio_assembleia_cotas_conferidas', args: { p_assembleia: 'a1' } },
            { fn: 'condominio_assembleia_cotas_conferidas', args: { p_assembleia: 'a1' } },
        ]);
    });

    it('instalar devolve cotasConferidas e a origem de cada impedida (A10)', async () => {
        m.respostaRpc = { data: { convocacao: 2, total: 0.01, presentesFracao: 0.005, presentesUnidades: 4, em: '2026-12-10T22:31:00Z',
            cotasConferidas: false,
            impedidas: [{ unitId: 'u7', rotulo: 'Apto 707', motivo: 'Acordo descumprido', origem: 'MANUAL' },
                        { unitId: 'u8', rotulo: 'Apto 808', motivo: 'Cota de 10/2026 vencida em 10/11/2026' }] }, error: null };
        const q = await operacoesDoGestor.instalar('a1', { convocacao: 2, presidente: 'A', secretario: 'B', editalEntregue: true });
        expect(q.cotasConferidas).toBe(false);
        // Sem origem gravada = a regra automática.
        expect(q.impedidas.map(i => i.origem)).toEqual(['MANUAL', 'AUTOMATICA']);
    });

    it('erro da RPC vira ErroAssembleia com a frase traduzida e o HINT', async () => {
        m.respostaRpc = { data: null, error: { code: 'P0001', hint: 'antes_do_horario', message: 'A 2ª convocação está marcada para…' } };
        const e = await operacoesDoGestor.instalar('a1', { convocacao: 2, presidente: 'A', secretario: 'B', editalEntregue: true })
            .catch(x => x);
        expect(e).toBeInstanceOf(ErroAssembleia);
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toBe('Ainda não chegou o horário desta convocação.');
        expect(e.hint).toBe('antes_do_horario');
        expect(e.code).toBe('P0001');
    });

    it('carregar lê as 4 tabelas e devolve em camelCase', async () => {
        m.responder = (c) => {
            if (c.tabela === 'condominio_assembleias') return { data: {
                id: 'a1', organization_id: 'o1', empreendimento_id: 'e1', tipo: 'AGO', titulo: 'AGO 2026',
                local: 'Salão', link_transmissao: null, primeira_convocacao_em: '2026-12-10T22:00:00+00:00',
                segunda_convocacao_em: '2026-12-10T22:30:00+00:00', status: 'CONVOCADA', convocada_em: '2026-11-25T12:00:00+00:00',
                aviso_id: 'av1', edital_entregue_em: null, instalada_em: null, instalada_convocacao: null,
                quorum_instalacao: null, presidente_nome: null, secretario_nome: null, observacao_geral: null,
                encerrada_em: null, retrato: null, ata_documento_id: null, cancelada_em: null, motivo_cancelamento: null,
                created_by: 'p1', created_at: '2026-11-25T11:00:00+00:00', updated_at: '2026-11-25T12:00:00+00:00',
            }, error: null };
            if (c.tabela === 'condominio_assembleia_itens') return { data: [
                { id: 'i1', assembleia_id: 'a1', ordem: 1, titulo: 'Contas', descricao: null, tipo: 'APROVACAO',
                  opcoes: null, quorum: 'MAIORIA_PRESENTES', assunto: 'APROVAR_CONTAS', deliberacao: null },
            ], error: null };
            if (c.tabela === 'condominio_assembleia_unidades') return { data: [
                { id: 'x1', assembleia_id: 'a1', unit_id: 'u1', fracao: '0.00125', unidade_rotulo: 'Torre A — 101',
                  proprietario_nome: 'João', presenca: null, procurador_nome: null, procuracao_documento_id: null,
                  presenca_em: null, impedida_na_instalacao: null, impedimento_manual: 'Acordo descumprido',
                  impedimento_manual_em: '2026-11-26T10:00:00+00:00' },
            ], error: null };
            if (c.tabela === 'condominio_assembleia_votos') return { data: [
                { id: 'v1', assembleia_id: 'a1', item_id: 'i1', unit_id: 'u1', opcao: 'SIM', origem: 'PORTAL',
                  client_id: 'c1', lancado_por: null, votado_em: '2026-11-26T10:00:00+00:00' },
            ], error: null };
            return { data: [], error: null };
        };
        const r = await operacoesDoGestor.carregar('a1');
        expect(r.assembleia).toMatchObject({ id: 'a1', empreendimentoId: 'e1', primeiraConvocacaoEm: '2026-12-10T22:00:00+00:00', status: 'CONVOCADA', avisoId: 'av1' });
        expect(r.itens).toEqual([{ id: 'i1', assembleiaId: 'a1', ordem: 1, titulo: 'Contas', descricao: null, tipo: 'APROVACAO',
            opcoes: null, quorum: 'MAIORIA_PRESENTES', assunto: 'APROVAR_CONTAS', deliberacao: null }]);
        expect(r.unidades[0]).toMatchObject({ unitId: 'u1', fracao: 0.00125, unidadeRotulo: 'Torre A — 101', proprietarioNome: 'João',
            impedimentoManual: 'Acordo descumprido', impedimentoManualEm: '2026-11-26T10:00:00+00:00' });
        const unid = m.chamadas.find(c => c.tabela === 'condominio_assembleia_unidades')!;
        expect(String(arg(unid, 'select'))).toContain('impedimento_manual');
        expect(r.votos[0]).toMatchObject({ itemId: 'i1', unitId: 'u1', opcao: 'SIM', origem: 'PORTAL', clientId: 'c1' });
        const itens = m.chamadas.find(c => c.tabela === 'condominio_assembleia_itens')!;
        expect(itens.ops).toContainEqual({ op: 'eq', args: ['assembleia_id', 'a1'] });
        expect(ops(itens)).toContain('order');
    });

    it('carregar de assembleia que não aparece diz que não encontrou', async () => {
        m.responder = (c) => c.tabela === 'condominio_assembleias' ? { data: null, error: null } : { data: [], error: null };
        await expect(operacoesDoGestor.carregar('a1')).rejects.toThrow('Assembleia não encontrada.');
    });
});

// ─── rascunho pela tabela (RLS) ──────────────────────────────────────────────
describe('condominioAssembleiaService — rascunho', () => {
    const LINHA = {
        id: 'a1', organization_id: 'o1', empreendimento_id: 'e1', tipo: 'AGE', titulo: 'Obra da fachada', local: null,
        link_transmissao: null, primeira_convocacao_em: null, segunda_convocacao_em: null, status: 'RASCUNHO',
    };

    it('listar filtra pelo condomínio', async () => {
        m.responder = () => ({ data: [LINHA], error: null });
        const r = await condominioAssembleiaService.listar('e1');
        const c = m.chamadas[0];
        expect(c.tabela).toBe('condominio_assembleias');
        expect(c.ops).toContainEqual({ op: 'eq', args: ['empreendimento_id', 'e1'] });
        expect(r[0]).toMatchObject({ id: 'a1', titulo: 'Obra da fachada', status: 'RASCUNHO' });
    });

    it('salvarRascunho novo manda SÓ as 7 colunas que o app pode gravar', async () => {
        m.responder = () => ({ data: LINHA, error: null });
        await condominioAssembleiaService.salvarRascunho({
            empreendimentoId: 'e1', tipo: 'AGE', titulo: '  Obra da fachada  ', local: '', linkTransmissao: 'https://meet/x',
            primeiraConvocacaoEm: '2026-12-10T19:00:00-03:00', segundaConvocacaoEm: '2026-12-10T19:30:00-03:00',
        });
        const c = m.chamadas[0];
        expect(c.tabela).toBe('condominio_assembleias');
        expect(arg(c, 'insert')).toEqual({
            empreendimento_id: 'e1', tipo: 'AGE', titulo: 'Obra da fachada', local: null, link_transmissao: 'https://meet/x',
            primeira_convocacao_em: '2026-12-10T19:00:00-03:00', segunda_convocacao_em: '2026-12-10T19:30:00-03:00',
        });
        expect(ops(c)).not.toContain('update');
    });

    it('salvarRascunho com id atualiza a linha (mesmas 7 colunas)', async () => {
        m.responder = () => ({ data: LINHA, error: null });
        await condominioAssembleiaService.salvarRascunho({ id: 'a1', empreendimentoId: 'e1', tipo: 'AGO', titulo: 'AGO' });
        const c = m.chamadas[0];
        expect(Object.keys(arg(c, 'update') as object).sort()).toEqual([
            'empreendimento_id', 'link_transmissao', 'local', 'primeira_convocacao_em',
            'segunda_convocacao_em', 'tipo', 'titulo',
        ]);
        expect(c.ops).toContainEqual({ op: 'eq', args: ['id', 'a1'] });
    });

    it('salvarRascunho traduz a trava', async () => {
        m.responder = () => ({ data: null, error: { code: '23514', hint: 'assembleia_travada', message: 'Depois de convocada…' } });
        await expect(condominioAssembleiaService.salvarRascunho({ id: 'a1', empreendimentoId: 'e1', tipo: 'AGO', titulo: 'AGO' }))
            .rejects.toThrow('Esta assembleia não aceita mais mudanças neste estado.');
    });

    it('salvarItens apaga a pauta e insere de novo, ordem 1..n na ordem da lista', async () => {
        m.responder = (c) => ops(c).includes('insert')
            ? { data: (arg(c, 'insert') as unknown[]), error: null }
            : { data: [], error: null };
        await condominioAssembleiaService.salvarItens('a1', [
            { titulo: 'Eleger síndico', tipo: 'ESCOLHA', opcoes: ['Ana', 'Beto'], quorum: 'MAIORIA_PRESENTES', assunto: 'ELEGER_SINDICO' },
            { id: 'i-velho', titulo: 'Contas', tipo: 'APROVACAO', quorum: 'MAIORIA_PRESENTES' },
        ]);
        const deletes = m.chamadas.filter(c => ops(c).includes('delete'));
        const inserts = m.chamadas.filter(c => ops(c).includes('insert'));
        expect(deletes).toHaveLength(1);
        expect(deletes[0].ops).toContainEqual({ op: 'eq', args: ['assembleia_id', 'a1'] });
        expect(inserts).toHaveLength(1);
        expect(m.chamadas.indexOf(deletes[0])).toBeLessThan(m.chamadas.indexOf(inserts[0]));
        expect(arg(inserts[0], 'insert')).toEqual([
            { assembleia_id: 'a1', ordem: 1, titulo: 'Eleger síndico', descricao: null, tipo: 'ESCOLHA',
              opcoes: ['Ana', 'Beto'], quorum: 'MAIORIA_PRESENTES', assunto: 'ELEGER_SINDICO' },
            { id: 'i-velho', assembleia_id: 'a1', ordem: 2, titulo: 'Contas', descricao: null, tipo: 'APROVACAO',
              opcoes: null, quorum: 'MAIORIA_PRESENTES', assunto: null },
        ]);
    });

    it('salvarItens recusa ESCOLHA com opção repetida ANTES de apagar a pauta', async () => {
        await expect(condominioAssembleiaService.salvarItens('a1', [
            { titulo: 'Eleger síndico', tipo: 'ESCOLHA', opcoes: ['Ana', ' ana '], quorum: 'MAIORIA_PRESENTES' },
        ])).rejects.toThrow(/opç/);
        expect(m.chamadas.filter(c => ops(c).includes('delete'))).toHaveLength(0);
    });

    it('salvarItens: se a inserção falha, devolve a pauta anterior', async () => {
        const anteriores = [{ id: 'i1', assembleia_id: 'a1', ordem: 1, titulo: 'Contas', descricao: null, tipo: 'APROVACAO',
                              opcoes: null, quorum: 'MAIORIA_PRESENTES', assunto: null, deliberacao: null }];
        let inserts = 0;
        m.responder = (c) => {
            if (ops(c).includes('insert')) {
                inserts += 1;
                return inserts === 1
                    ? { data: null, error: { code: 'XX000', message: 'Falha de rede.' } }
                    : { data: arg(c, 'insert'), error: null };
            }
            if (ops(c).includes('delete')) return { data: [], error: null };
            return { data: anteriores, error: null };   // leitura da pauta atual
        };
        await expect(condominioAssembleiaService.salvarItens('a1', [
            { titulo: 'Orçamento', tipo: 'APROVACAO', quorum: 'MAIORIA_PRESENTES' },
        ])).rejects.toThrow('Falha de rede.');
        const ins = m.chamadas.filter(c => ops(c).includes('insert'));
        expect(ins).toHaveLength(2);
        expect(arg(ins[1], 'insert')).toEqual(anteriores);
    });

    it('excluirRascunho apaga pelo id', async () => {
        m.responder = () => ({ data: [{ id: 'a1' }], error: null });
        await condominioAssembleiaService.excluirRascunho('a1');
        const c = m.chamadas[0];
        expect(c.tabela).toBe('condominio_assembleias');
        expect(ops(c)).toContain('delete');
        expect(c.ops).toContainEqual({ op: 'eq', args: ['id', 'a1'] });
    });

    it('excluirRascunho que não apagou nada avisa', async () => {
        m.responder = () => ({ data: [], error: null });
        await expect(condominioAssembleiaService.excluirRascunho('a1')).rejects.toThrow(/não encontrad/);
    });
});
