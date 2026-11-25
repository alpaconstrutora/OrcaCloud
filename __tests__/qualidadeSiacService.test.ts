import { beforeEach, describe, expect, it, vi } from 'vitest';

const chamadas: { metodo: string; args: unknown[] }[] = [];
let resposta: { data: unknown; error: { message: string } | null } = { data: null, error: null };

function cadeia() {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'upsert', 'insert', 'update', 'delete']) {
    c[m] = (...args: unknown[]) => {
      chamadas.push({ metodo: m, args });
      return c;
    };
  }
  c.single = () => Promise.resolve(resposta);
  c.maybeSingle = () => Promise.resolve(resposta);
  c.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resposta).then(ok, ko);
  return c;
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (tabela: string) => {
      chamadas.push({ metodo: 'from', args: [tabela] });
      return cadeia();
    },
    rpc: (nome: string, params: unknown) => {
      chamadas.push({ metodo: 'rpc', args: [nome, params] });
      return Promise.resolve(resposta);
    },
  },
}));

import { qualidadeSiacService } from '../services/qualidadeSiacService';

const achar = (metodo: string) => chamadas.filter((c) => c.metodo === metodo);

beforeEach(() => {
  chamadas.length = 0;
  resposta = { data: null, error: null };
});

describe('qualidadeSiacService', () => {
  it('listarItens(null) não filtra por organização; com org filtra', async () => {
    await qualidadeSiacService.listarItens(null);
    expect(achar('eq')).toHaveLength(0);
    expect(achar('from')[0].args).toEqual(['quality_controlled_items']);
    expect(achar('order').map((c) => c.args[0])).toEqual(['tipo', 'ordem']);

    chamadas.length = 0;
    await qualidadeSiacService.listarItens('org-1');
    expect(achar('eq')[0].args).toEqual(['organization_id', 'org-1']);
  });

  it('listarItens achata os códigos (array, objeto ou nulo)', async () => {
    resposta = {
      data: [
        { id: 'a', codigos: [{ item_code: '1' }, { item_code: '2' }] },
        { id: 'b', codigos: { item_code: '3' } },
        { id: 'c', codigos: null },
      ],
      error: null,
    };
    const itens = await qualidadeSiacService.listarItens('org-1');
    expect(itens.map((i) => i.codigos)).toEqual([['1', '2'], ['3'], []]);
  });

  it('carregarAnexo4 faz upsert das 27 linhas sem sobrescrever e devolve quantas entraram', async () => {
    resposta = { data: [{ id: '1' }, { id: '2' }], error: null };
    const n = await qualidadeSiacService.carregarAnexo4('org-1');
    const up = achar('upsert')[0];
    const linhas = up.args[0] as Array<Record<string, unknown>>;
    expect(linhas).toHaveLength(27);
    expect(linhas[0]).toMatchObject({
      organization_id: 'org-1', tipo: 'SERVICO', origem: 'ANEXO4', anexo4_numero: 1, chave_padrao: 'ANEXO4-01', ordem: 1,
    });
    expect(up.args[1]).toEqual({ onConflict: 'organization_id,chave_padrao', ignoreDuplicates: true });
    expect(n).toBe(2);
  });

  it('carregarSugestaoMateriais usa tipo MATERIAL e origem PROPRIO', async () => {
    await qualidadeSiacService.carregarSugestaoMateriais('org-1');
    const linhas = achar('upsert')[0].args[0] as Array<Record<string, unknown>>;
    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas[0]).toMatchObject({ tipo: 'MATERIAL', origem: 'PROPRIO', chave_padrao: 'MAT-01' });
    expect(achar('upsert')[0].args[1]).toEqual({ onConflict: 'organization_id,chave_padrao', ignoreDuplicates: true });
  });

  it('resumirProcedimentos e listarTreinamentos com lista vazia não consultam', async () => {
    expect(await qualidadeSiacService.resumirProcedimentos([])).toEqual({});
    expect(await qualidadeSiacService.listarTreinamentos([])).toEqual({});
    expect(achar('from')).toHaveLength(0);
  });

  it('resumirProcedimentos monta o resumo com a data da versão ativa (objeto ou array; nula se faltar)', async () => {
    resposta = {
      data: [
        { id: 'd1', nome: 'P1', revisao: '2', approval_status: 'APPROVED', active_version: { created_at: '2026-01-01' } },
        { id: 'd2', nome: 'P2', revisao: null, approval_status: 'DRAFT', active_version: [{ created_at: '2026-02-02' }] },
        { id: 'd3', nome: 'P3', revisao: null, approval_status: 'DRAFT', active_version: null },
      ],
      error: null,
    };
    const r = await qualidadeSiacService.resumirProcedimentos(['d1', 'd2', 'd3']);
    expect(achar('in')[0].args).toEqual(['id', ['d1', 'd2', 'd3']]);
    expect(r.d1.versao_ativa_em).toBe('2026-01-01');
    expect(r.d2.versao_ativa_em).toBe('2026-02-02');
    expect(r.d3.versao_ativa_em).toBeNull();
  });

  it('listarTreinamentos agrupa por curso e marca externo', async () => {
    resposta = {
      data: [
        { course_id: 'c1', employee_id: 'e1', data_realizacao: '2026-03-01', aprovado: true, employees: { contract_type: 'CLT', academy_externo: false } },
        { course_id: 'c1', employee_id: 'e2', data_realizacao: '2026-03-02', aprovado: true, employees: [{ contract_type: 'EMPREITEIRO', academy_externo: false }] },
        { course_id: 'c2', employee_id: 'e3', data_realizacao: '2026-03-03', aprovado: false, employees: { contract_type: 'CLT', academy_externo: true } },
        { course_id: 'c2', employee_id: 'e4', data_realizacao: '2026-03-04', aprovado: true, employees: null },
      ],
      error: null,
    };
    const r = await qualidadeSiacService.listarTreinamentos(['c1', 'c2']);
    expect(r.c1.map((x) => x.externo)).toEqual([false, true]);
    expect(r.c2.map((x) => x.externo)).toEqual([true, false]);
    expect(r.c2[0].aprovado).toBe(false);
  });

  it('definirCodigos grava só os novos, sem vazios nem repetidos, e apaga os ausentes', async () => {
    resposta = { data: [{ item_code: '111' }], error: null };
    await qualidadeSiacService.definirCodigos('i1', [' 92873 ', '92873', '']);
    const ins = achar('insert')[0];
    expect(ins.args[0]).toEqual([{ item_id: 'i1', item_code: '92873' }]);
    expect(achar('delete')).toHaveLength(1);
    expect(achar('in').some((c) => c.args[0] === 'item_code' && JSON.stringify(c.args[1]) === '["111"]')).toBe(true);
  });

  it('listarNiveis devolve um mapa org→nível', async () => {
    resposta = { data: [{ organization_id: 'o1', nivel_alvo: 'A' }], error: null };
    expect(await qualidadeSiacService.listarNiveis(null)).toEqual({ o1: 'A' });
    expect(achar('eq')).toHaveLength(0);
  });

  it('definirNivel faz upsert por organization_id', async () => {
    await qualidadeSiacService.definirNivel('o1', 'A');
    const up = achar('upsert')[0];
    expect(up.args[0]).toMatchObject({ organization_id: 'o1', nivel_alvo: 'A' });
    expect(up.args[1]).toEqual({ onConflict: 'organization_id' });
  });

  it('exclusões por obra', async () => {
    resposta = { data: [{ item_id: 'i1', motivo: 'sem fôrma' }], error: null };
    expect(await qualidadeSiacService.listarExclusoes('p1')).toEqual([{ item_id: 'i1', motivo: 'sem fôrma' }]);
    chamadas.length = 0;
    await qualidadeSiacService.excluirDaObra('p1', 'i1', 'não tem');
    expect(achar('insert')[0].args[0]).toEqual({ project_id: 'p1', item_id: 'i1', motivo: 'não tem' });
    chamadas.length = 0;
    await qualidadeSiacService.reincluirNaObra('p1', 'i1');
    expect(achar('delete')).toHaveLength(1);
    expect(achar('eq').map((c) => c.args)).toEqual([['project_id', 'p1'], ['item_id', 'i1']]);
  });

  it('registrarTreinamentoEmObra chama a RPC com os parâmetros nomeados e devolve o número', async () => {
    resposta = { data: 3, error: null };
    const n = await qualidadeSiacService.registrarTreinamentoEmObra({
      organizationId: 'o1', courseId: 'c1', data: '2026-03-01', instrutor: 'Ana', local: 'Obra A',
      employeeIds: ['e1'], novosTerceiros: [{ nome: 'João', cpf: '123' }],
    });
    expect(achar('rpc')[0].args).toEqual(['quality_registrar_treinamento_em_obra', {
      p_org: 'o1', p_course_id: 'c1', p_data: '2026-03-01', p_instrutor: 'Ana', p_local: 'Obra A',
      p_employee_ids: ['e1'], p_novos_terceiros: [{ nome: 'João', cpf: '123' }],
    }]);
    expect(n).toBe(3);
  });

  it('erro do supabase vira Error com a mensagem', async () => {
    resposta = { data: null, error: { message: 'permission denied' } };
    await expect(qualidadeSiacService.listarItens('o1')).rejects.toThrow('permission denied');
    await expect(qualidadeSiacService.registrarTreinamentoEmObra({
      organizationId: 'o1', courseId: 'c', data: 'd', instrutor: 'i', local: 'l', employeeIds: [], novosTerceiros: [],
    })).rejects.toThrow('permission denied');
  });
});
