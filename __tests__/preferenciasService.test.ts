/**
 * preferenciasService — plano docs/planos/2026-10-22-preferencias-planta-eletrica.md (seção 3).
 * Cliente Supabase SIMULADO: cada `from('preferencias')` devolve um construtor encadeável que
 * grava as chamadas e resolve com o próximo resultado da fila. Confere o que o serviço MANDA ao
 * banco: filtros do dono certo, upsert pelo índice do escopo, delete no "voltar ao padrão".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Resultado = { data: unknown; error: { message: string } | null };

const m = vi.hoisted(() => ({
    getSession: vi.fn(),
    fila: [] as Array<{ data: unknown; error: { message: string } | null }>,
    consultas: [] as Array<{ tabela: string; chamadas: Array<[string, unknown[]]> }>,
}));

vi.mock('../lib/supabase', () => {
    const from = (tabela: string) => {
        const consulta = { tabela, chamadas: [] as Array<[string, unknown[]]> };
        m.consultas.push(consulta);
        const proxy: Record<string, unknown> = new Proxy({}, {
            get(_alvo, nome: string) {
                if (nome === 'then') {
                    const r = m.fila.shift() ?? { data: [], error: null };
                    return (ok: (v: Resultado) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(r).then(ok, ko);
                }
                return (...args: unknown[]) => { consulta.chamadas.push([nome, args]); return proxy; };
            },
        });
        return proxy;
    };
    return { supabase: { from, auth: { getSession: m.getSession } } };
});

import { preferenciasService } from '../services/preferenciasService';

const nomes = (i: number) => m.consultas[i].chamadas.map(([n]) => n);
const chamada = (i: number, nome: string) => m.consultas[i].chamadas.find(([n]) => n === nome)?.[1];
const todas = (i: number, nome: string) => m.consultas[i].chamadas.filter(([n]) => n === nome).map(([, a]) => a);

describe('preferenciasService', () => {
    beforeEach(() => {
        m.fila.length = 0;
        m.consultas.length = 0;
        m.getSession.mockReset();
        m.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
    });

    describe('listarDoUsuario', () => {
        it('lê só as linhas USUARIO do usuário da sessão', async () => {
            m.fila.push({ data: [{ escopo: 'USUARIO', chave: 'k', valor: true }], error: null });
            const linhas = await preferenciasService.listarDoUsuario();
            expect(linhas).toEqual([{ escopo: 'USUARIO', chave: 'k', valor: true }]);
            expect(m.consultas[0].tabela).toBe('preferencias');
            expect(todas(0, 'eq')).toEqual(expect.arrayContaining([['escopo', 'USUARIO'], ['user_id', 'u1']]));
        });

        it('erro do banco vira Error com a frase do banco', async () => {
            m.fila.push({ data: null, error: { message: 'rede caiu' } });
            await expect(preferenciasService.listarDoUsuario()).rejects.toThrow('rede caiu');
        });

        it('sem usuário na sessão lança erro claro', async () => {
            m.getSession.mockResolvedValue({ data: { session: null }, error: null });
            await expect(preferenciasService.listarDoUsuario()).rejects.toThrow(/sess[aã]o/i);
            expect(m.consultas).toHaveLength(0);
        });
    });

    describe('listarDaPrancha', () => {
        it('filtra ORGANIZACAO pela organização e ESTUDO pelo estudo, e junta as duas', async () => {
            m.fila.push({ data: [{ escopo: 'ORGANIZACAO', chave: 'a', valor: false }], error: null });
            m.fila.push({ data: [{ escopo: 'ESTUDO', chave: 'b', valor: true }], error: null });
            const linhas = await preferenciasService.listarDaPrancha('org1', 'est1');
            expect(linhas).toEqual([
                { escopo: 'ORGANIZACAO', chave: 'a', valor: false },
                { escopo: 'ESTUDO', chave: 'b', valor: true },
            ]);
            const eqs = [0, 1].map((i) => todas(i, 'eq'));
            expect(eqs).toEqual(expect.arrayContaining([
                expect.arrayContaining([['escopo', 'ORGANIZACAO'], ['organization_id', 'org1']]),
                expect.arrayContaining([['escopo', 'ESTUDO'], ['study_id', 'est1']]),
            ]));
        });

        it('sem estudo lê só a organização (uma consulta)', async () => {
            m.fila.push({ data: [], error: null });
            await preferenciasService.listarDaPrancha('org1');
            expect(m.consultas).toHaveLength(1);
            expect(todas(0, 'eq')).toEqual(expect.arrayContaining([['escopo', 'ORGANIZACAO'], ['organization_id', 'org1']]));
        });

        it('qualquer das duas leituras falhando rejeita', async () => {
            m.fila.push({ data: [], error: null });
            m.fila.push({ data: null, error: { message: 'sem permissão' } });
            await expect(preferenciasService.listarDaPrancha('org1', 'est1')).rejects.toThrow('sem permissão');
        });
    });

    describe('gravar', () => {
        it('USUARIO: manda o id da sessão em user_id (o banco não tem default) e usa o índice do usuário', async () => {
            await preferenciasService.gravar('USUARIO', {}, 'k', true);
            expect(nomes(0)).toContain('upsert');
            const [linha, opcoes] = chamada(0, 'upsert') as [Record<string, unknown>, { onConflict: string }];
            expect(linha).toMatchObject({
                escopo: 'USUARIO', user_id: 'u1', organization_id: null, study_id: null,
                chave: 'k', valor: true, updated_by: 'u1',
            });
            expect(typeof linha.updated_at).toBe('string');
            expect(opcoes.onConflict).toBe('escopo,user_id,chave');
        });

        it('ORGANIZACAO: user_id nulo, organization_id do dono, índice da organização', async () => {
            await preferenciasService.gravar('ORGANIZACAO', { organizationId: 'org1' }, 'k', false);
            const [linha, opcoes] = chamada(0, 'upsert') as [Record<string, unknown>, { onConflict: string }];
            expect(linha).toMatchObject({
                escopo: 'ORGANIZACAO', user_id: null, organization_id: 'org1', study_id: null,
                chave: 'k', valor: false, updated_by: 'u1',
            });
            expect(opcoes.onConflict).toBe('escopo,organization_id,chave');
        });

        it('ESTUDO: user_id nulo, study_id do dono, índice do estudo', async () => {
            await preferenciasService.gravar('ESTUDO', { studyId: 'est1' }, 'k', true);
            const [linha, opcoes] = chamada(0, 'upsert') as [Record<string, unknown>, { onConflict: string }];
            expect(linha).toMatchObject({
                escopo: 'ESTUDO', user_id: null, organization_id: null, study_id: 'est1', chave: 'k', valor: true,
            });
            expect(opcoes.onConflict).toBe('escopo,study_id,chave');
        });

        it('valor null apaga (delete) e NÃO faz upsert', async () => {
            await preferenciasService.gravar('ORGANIZACAO', { organizationId: 'org1' }, 'k', null);
            expect(nomes(0)).toContain('delete');
            expect(nomes(0)).not.toContain('upsert');
            expect(todas(0, 'eq')).toEqual(expect.arrayContaining([
                ['escopo', 'ORGANIZACAO'], ['organization_id', 'org1'], ['chave', 'k'],
            ]));
        });

        it('valor null no USUARIO apaga só a linha do usuário da sessão', async () => {
            await preferenciasService.gravar('USUARIO', {}, 'k', null);
            expect(todas(0, 'eq')).toEqual(expect.arrayContaining([['escopo', 'USUARIO'], ['user_id', 'u1'], ['chave', 'k']]));
        });

        it('valor em TEXTO (estilo, modo de cor) vai como está', async () => {
            await preferenciasService.gravar('USUARIO', {}, 'planta.exibir.estiloPlanta', 'HUMANIZADA');
            const [linha] = chamada(0, 'upsert') as [Record<string, unknown>];
            expect(linha).toMatchObject({ chave: 'planta.exibir.estiloPlanta', valor: 'HUMANIZADA' });
        });

        it('valor null no terreno 3D ("Automático") APAGA a linha: a coluna é NOT NULL, nunca vai upsert com null', async () => {
            await preferenciasService.gravar('USUARIO', {}, 'planta.exibir.vista3dTerreno', null);
            expect(nomes(0)).toContain('delete');
            expect(nomes(0)).not.toContain('upsert');
        });

        it('erro do banco rejeita com a frase do banco', async () => {
            m.fila.push({ data: null, error: { message: 'new row violates row-level security policy' } });
            await expect(preferenciasService.gravar('ORGANIZACAO', { organizationId: 'org1' }, 'k', true))
                .rejects.toThrow('new row violates row-level security policy');
        });

        it('escopo sem o dono necessário lança antes de falar com o banco', async () => {
            await expect(preferenciasService.gravar('ORGANIZACAO', {}, 'k', true)).rejects.toThrow(/organiza/i);
            await expect(preferenciasService.gravar('ESTUDO', {}, 'k', true)).rejects.toThrow(/estudo/i);
            expect(m.consultas).toHaveLength(0);
        });

        it('USUARIO sem usuário na sessão lança erro claro e não grava', async () => {
            m.getSession.mockResolvedValue({ data: { session: null }, error: null });
            await expect(preferenciasService.gravar('USUARIO', {}, 'k', true)).rejects.toThrow(/sess[aã]o/i);
            expect(m.consultas).toHaveLength(0);
        });
    });

    describe('gravarVarios', () => {
        it('faz UM upsert com N linhas USUARIO do usuário da sessão', async () => {
            await preferenciasService.gravarVarios([
                { chave: 'planta.exibir.mostrarGrade', valor: false },
                { chave: 'planta.exibir.estiloPlanta', valor: 'HUMANIZADA' },
                { chave: 'planta.exibir.mostrarEixos', valor: true },
            ]);
            expect(m.consultas).toHaveLength(1);
            expect(m.consultas[0].tabela).toBe('preferencias');
            expect(todas(0, 'upsert')).toHaveLength(1);
            const [linhas, opcoes] = chamada(0, 'upsert') as [Array<Record<string, unknown>>, { onConflict: string }];
            expect(linhas).toHaveLength(3);
            for (const l of linhas) {
                expect(l).toMatchObject({ escopo: 'USUARIO', user_id: 'u1', organization_id: null, study_id: null, updated_by: 'u1' });
                expect(typeof l.updated_at).toBe('string');
            }
            expect(linhas.map((l) => [l.chave, l.valor])).toEqual([
                ['planta.exibir.mostrarGrade', false],
                ['planta.exibir.estiloPlanta', 'HUMANIZADA'],
                ['planta.exibir.mostrarEixos', true],
            ]);
            expect(opcoes.onConflict).toBe('escopo,user_id,chave');
        });

        it('⚠️ ignoreDuplicates: a migração NUNCA substitui uma linha que já existe', async () => {
            await preferenciasService.gravarVarios([{ chave: 'planta.exibir.mostrarGrade', valor: false }]);
            const [, opcoes] = chamada(0, 'upsert') as [unknown, { onConflict: string; ignoreDuplicates?: boolean }];
            expect(opcoes.ignoreDuplicates).toBe(true);
        });

        it('lista vazia não fala com o banco', async () => {
            await preferenciasService.gravarVarios([]);
            expect(m.consultas).toHaveLength(0);
            expect(m.getSession).not.toHaveBeenCalled();
        });

        it('erro do banco rejeita com a frase do banco', async () => {
            m.fila.push({ data: null, error: { message: 'negado' } });
            await expect(preferenciasService.gravarVarios([{ chave: 'planta.exibir.mostrarGrade', valor: true }]))
                .rejects.toThrow('negado');
        });

        it('sem usuário na sessão lança erro claro e não grava', async () => {
            m.getSession.mockResolvedValue({ data: { session: null }, error: null });
            await expect(preferenciasService.gravarVarios([{ chave: 'planta.exibir.mostrarGrade', valor: true }]))
                .rejects.toThrow(/sess[aã]o/i);
            expect(m.consultas).toHaveLength(0);
        });
    });

    describe('apagarDoEstudo', () => {
        it('apaga as linhas ESTUDO daquele estudo cuja chave começa pelo prefixo', async () => {
            await preferenciasService.apagarDoEstudo('est1', 'planta.eletrica.prancha.');
            expect(nomes(0)).toContain('delete');
            expect(todas(0, 'eq')).toEqual(expect.arrayContaining([['escopo', 'ESTUDO'], ['study_id', 'est1']]));
            expect(chamada(0, 'like')).toEqual(['chave', 'planta.eletrica.prancha.%']);
        });

        it('erro do banco rejeita', async () => {
            m.fila.push({ data: null, error: { message: 'negado' } });
            await expect(preferenciasService.apagarDoEstudo('est1', 'p.')).rejects.toThrow('negado');
        });
    });
});
