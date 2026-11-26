import { beforeEach, describe, expect, it, vi } from 'vitest';

const chamadas: { metodo: string; args: unknown[] }[] = [];
type Resposta = { data: unknown; error: { message: string } | null };
let resposta: Resposta = { data: null, error: null };
/** Resposta própria de uma tabela (consultas a mais de uma tabela na mesma chamada). */
let respostaPorTabela: Record<string, Resposta> = {};

function cadeia(tabela?: string) {
  const r = () => (tabela !== undefined && respostaPorTabela[tabela]) || resposta;
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'upsert', 'insert', 'update', 'delete']) {
    c[m] = (...args: unknown[]) => {
      chamadas.push({ metodo: m, args });
      return c;
    };
  }
  c.single = () => Promise.resolve(r());
  c.maybeSingle = () => Promise.resolve(r());
  c.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(r()).then(ok, ko);
  return c;
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (tabela: string) => {
      chamadas.push({ metodo: 'from', args: [tabela] });
      return cadeia(tabela);
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
  respostaPorTabela = {};
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
    respostaPorTabela.opura_documents = {
      data: [
        { id: 'd1', nome: 'P1', revisao: '2', status: 'ativo', approval_status: 'aprovado', active_version: { created_at: '2026-01-01' } },
        { id: 'd2', nome: 'P2', revisao: null, status: 'ativo', approval_status: 'rascunho', active_version: [{ created_at: '2026-02-02' }] },
        { id: 'd3', nome: 'P3', revisao: null, status: 'arquivado', approval_status: 'rascunho', active_version: null },
      ],
      error: null,
    };
    respostaPorTabela.opura_document_approvals = { data: [], error: null };
    const r = await qualidadeSiacService.resumirProcedimentos(['d1', 'd2', 'd3']);
    expect(achar('in')[0].args).toEqual(['id', ['d1', 'd2', 'd3']]);
    expect(r.d1.versao_ativa_em).toBe('2026-01-01');
    expect(r.d2.versao_ativa_em).toBe('2026-02-02');
    expect(r.d3.versao_ativa_em).toBeNull();
    expect(r.d1.approval_status).toBe('aprovado');
    expect(r.d3.status).toBe('arquivado');
  });

  it('resumirProcedimentos traz a data da aprovação mais recente de cada documento (updated_at da linha aprovada)', async () => {
    respostaPorTabela.opura_documents = {
      data: [
        { id: 'd1', nome: 'P1', revisao: '2', status: 'ativo', approval_status: 'aprovado', active_version: { created_at: '2026-03-01T10:00:00Z' } },
        { id: 'd2', nome: 'P2', revisao: '1', status: 'ativo', approval_status: 'aprovado', active_version: { created_at: '2026-03-01T10:00:00Z' } },
      ],
      error: null,
    };
    respostaPorTabela.opura_document_approvals = {
      data: [
        { document_id: 'd1', updated_at: '2026-02-01T10:00:00Z' },
        { document_id: 'd1', updated_at: '2026-03-02T10:00:00Z' },
        { document_id: 'd1', updated_at: '2026-01-01T10:00:00Z' },
      ],
      error: null,
    };
    const r = await qualidadeSiacService.resumirProcedimentos(['d1', 'd2']);
    const froms = achar('from').map((c) => c.args[0]);
    expect(froms).toEqual(['opura_documents', 'opura_document_approvals']);
    expect(achar('eq').map((c) => c.args)).toContainEqual(['status', 'aprovado']);
    expect(achar('in').map((c) => c.args)).toContainEqual(['document_id', ['d1', 'd2']]);
    expect(r.d1.aprovado_em).toBe('2026-03-02T10:00:00Z');
    expect(r.d2.aprovado_em).toBeNull();
  });

  it('resumirProcedimentos: erro ao ler as aprovações sobe como Error', async () => {
    respostaPorTabela.opura_documents = { data: [], error: null };
    respostaPorTabela.opura_document_approvals = { data: null, error: { message: 'sem acesso às aprovações' } };
    await expect(qualidadeSiacService.resumirProcedimentos(['d1'])).rejects.toThrow('sem acesso às aprovações');
  });

  it('listarTreinamentos agrupa por curso e marca externo', async () => {
    resposta = {
      data: [
        { course_id: 'c1', employee_id: 'e1', data_realizacao: '2026-03-01', aprovado: true, created_at: '2026-03-01T14:00:00Z', employees: { contract_type: 'CLT', academy_externo: false } },
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
    expect(achar('select')[0].args[0]).toContain('created_at');
    expect(r.c1[0].registrado_em).toBe('2026-03-01T14:00:00Z');
    expect(r.c1[1].registrado_em).toBeNull();
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

  it('listarTreinamentos lê e devolve data_validade (fase 2: validade passada não conta)', async () => {
    resposta = {
      data: [
        { course_id: 'c1', employee_id: 'e1', data_realizacao: '2026-03-01', aprovado: true, data_validade: '2027-03-01', employees: null },
        { course_id: 'c1', employee_id: 'e2', data_realizacao: '2026-03-01', aprovado: true, employees: null },
      ],
      error: null,
    };
    const r = await qualidadeSiacService.listarTreinamentos(['c1']);
    expect(achar('select')[0].args[0]).toContain('data_validade');
    expect(r.c1.map((x) => x.data_validade)).toEqual(['2027-03-01', null]);
  });

  it('sgqDaOrganizacao pergunta ao banco (_qualidade_sgq_da_org); sem resposta = a própria', async () => {
    resposta = { data: 'alpa', error: null };
    expect(await qualidadeSiacService.sgqDaOrganizacao('spe')).toBe('alpa');
    expect(achar('rpc')[0].args).toEqual(['_qualidade_sgq_da_org', { p_org: 'spe' }]);

    resposta = { data: null, error: null };
    expect(await qualidadeSiacService.sgqDaOrganizacao('spe')).toBe('spe');

    resposta = { data: null, error: { message: 'falhou' } };
    await expect(qualidadeSiacService.sgqDaOrganizacao('spe')).rejects.toThrow('falhou');
  });

  it('orgDoServicoControlado lê a org dona do serviço (quality_controlled_items); invisível = null; erro sobe', async () => {
    resposta = { data: { organization_id: 'alpa' }, error: null };
    expect(await qualidadeSiacService.orgDoServicoControlado('srv-1')).toBe('alpa');
    expect(achar('from')[0].args).toEqual(['quality_controlled_items']);
    expect(achar('select')[0].args).toEqual(['organization_id']);
    expect(achar('eq')[0].args).toEqual(['id', 'srv-1']);

    // a RLS esconde o serviço de quem não é membro da org dona dele — não é erro, é "sem vínculo"
    resposta = { data: null, error: null };
    expect(await qualidadeSiacService.orgDoServicoControlado('srv-1')).toBeNull();

    resposta = { data: null, error: { message: 'falhou' } };
    await expect(qualidadeSiacService.orgDoServicoControlado('srv-1')).rejects.toThrow('falhou');
  });

  it('sgqLegivel = o SGQ está em minhas_orgs_membro(); erro sobe', async () => {
    resposta = { data: ['spe', 'alpa'], error: null };
    expect(await qualidadeSiacService.sgqLegivel('alpa')).toBe(true);
    expect(achar('rpc')[0].args).toEqual(['minhas_orgs_membro', undefined]);
    resposta = { data: ['spe'], error: null };
    expect(await qualidadeSiacService.sgqLegivel('alpa')).toBe(false);
    resposta = { data: null, error: { message: 'falhou' } };
    await expect(qualidadeSiacService.sgqLegivel('alpa')).rejects.toThrow('falhou');
  });

  it('oeTemRegistro pergunta ao banco (_qualidade_oe_tem_registro); erro sobe', async () => {
    resposta = { data: true, error: null };
    expect(await qualidadeSiacService.oeTemRegistro('wo-1')).toBe(true);
    expect(achar('rpc')[0].args).toEqual(['_qualidade_oe_tem_registro', { p_work_order_id: 'wo-1' }]);
    resposta = { data: false, error: null };
    expect(await qualidadeSiacService.oeTemRegistro('wo-1')).toBe(false);
    resposta = { data: null, error: { message: 'falhou' } };
    await expect(qualidadeSiacService.oeTemRegistro('wo-1')).rejects.toThrow('falhou');
  });

  it('listarItens traz a ficha modelo do serviço (checklist_template_id)', async () => {
    await qualidadeSiacService.listarItens('org-1');
    expect(String(achar('select')[0].args[0])).toContain('checklist_template_id');
  });

  it('definirSgq faz upsert por organization_id só com o SGQ (null = a própria); 42501 sobe', async () => {
    await qualidadeSiacService.definirSgq('spe', 'alpa');
    const up = achar('upsert')[0];
    expect(up.args[0]).toEqual({ organization_id: 'spe', sgq_organization_id: 'alpa' });
    expect(up.args[1]).toEqual({ onConflict: 'organization_id' });

    chamadas.length = 0;
    await qualidadeSiacService.definirSgq('spe', null);
    expect(achar('upsert')[0].args[0]).toEqual({ organization_id: 'spe', sgq_organization_id: null });

    resposta = { data: null, error: { message: 'Só o dono ou um administrador da organização pode trocar' } };
    await expect(qualidadeSiacService.definirSgq('spe', 'alpa')).rejects.toThrow('Só o dono');
  });

  it('servicosParaOE: serviços ATIVOS do SGQ da org da OE, sem os excluídos da obra', async () => {
    resposta = { data: 'alpa', error: null }; // rpc
    respostaPorTabela.quality_controlled_items = {
      data: [
        { id: 'forma', tipo: 'SERVICO', situacao: 'ATIVO', codigos: [{ item_code: '1' }] },
        { id: 'concreto', tipo: 'SERVICO', situacao: 'ATIVO', codigos: [] },
        { id: 'pintura', tipo: 'SERVICO', situacao: 'DISPENSADO', codigos: [] },
        { id: 'cimento', tipo: 'MATERIAL', situacao: 'ATIVO', codigos: [] },
      ],
      error: null,
    };
    respostaPorTabela.quality_project_exclusions = { data: [{ item_id: 'concreto', motivo: 'pré-moldado' }], error: null };

    const r = await qualidadeSiacService.servicosParaOE('spe', 'p1');

    expect(achar('rpc')[0].args).toEqual(['_qualidade_sgq_da_org', { p_org: 'spe' }]);
    expect(achar('eq').map((c) => c.args)).toContainEqual(['organization_id', 'alpa']);
    expect(achar('eq').map((c) => c.args)).toContainEqual(['project_id', 'p1']);
    expect(r.map((i) => i.id)).toEqual(['forma']);
    expect(r[0].codigos).toEqual(['1']);
  });

  it('inspecoesAprovadas: validações de inspeção aprovadas de OEs com serviço do SGQ, com o status da obra', async () => {
    resposta = {
      data: [
        {
          work_order_id: 'wo1', liberado_em: '2026-11-20T10:00:00Z', created_at: '2026-11-20T09:00:00Z',
          executores: [{ employee_id: 'e1', nome: 'Ana', treinado: true }],
          work_orders: { controlled_item_id: 'forma', projects: { obra_status: 'Em andamento' } },
        },
        {
          work_order_id: 'wo2', liberado_em: null, created_at: '2026-11-21T09:00:00Z', executores: null,
          work_orders: [{ controlled_item_id: 'concreto', projects: [{ obra_status: null }] }],
        },
      ],
      error: null,
    };

    const r = await qualidadeSiacService.inspecoesAprovadas('alpa');

    expect(achar('from')[0].args).toEqual(['work_order_validations']);
    const sel = achar('select')[0].args[0] as string;
    expect(sel).toContain('work_orders!inner');
    expect(sel).toContain('quality_controlled_items!inner');
    expect(sel).toContain('settings->>obraStatus');
    const eqs = achar('eq').map((c) => c.args);
    expect(eqs).toContainEqual(['type', 'inspection']);
    expect(eqs).toContainEqual(['status', 'approved']);
    expect(eqs).toContainEqual(['work_orders.quality_controlled_items.organization_id', 'alpa']);
    expect(r).toEqual([
      {
        work_order_id: 'wo1', controlled_item_id: 'forma', obra_status: 'Em andamento', aprovado_em: '2026-11-20T10:00:00Z',
        executores: [{ employee_id: 'e1', nome: 'Ana', treinado: true }],
      },
      { work_order_id: 'wo2', controlled_item_id: 'concreto', obra_status: null, aprovado_em: '2026-11-21T09:00:00Z', executores: [] },
    ]);
  });

  it('criarFichaModelo insere o modelo ativo na org do item, com o nome do serviço, e devolve o id; erro sobe', async () => {
    resposta = { data: { id: 'tpl-1' }, error: null };
    const id = await qualidadeSiacService.criarFichaModelo('org-1', 'Execução de alvenaria', 'Vedação');
    expect(id).toBe('tpl-1');
    expect(achar('from')[0].args).toEqual(['oe_checklist_templates']);
    expect(achar('insert')[0].args[0]).toEqual({ org_id: 'org-1', name: 'Execução de alvenaria', service_type: 'Vedação', active: true });
    expect(achar('select')[0].args[0]).toBe('id');

    chamadas.length = 0;
    await qualidadeSiacService.criarFichaModelo('org-1', 'Pintura', null);
    expect(achar('insert')[0].args[0]).toMatchObject({ service_type: null });

    resposta = { data: null, error: { message: 'new row violates row-level security policy' } };
    await expect(qualidadeSiacService.criarFichaModelo('org-1', 'X', null)).rejects.toThrow('row-level security');
  });

  it('inspecoesAprovadas: erro sobe como Error', async () => {
    resposta = { data: null, error: { message: 'sem acesso' } };
    await expect(qualidadeSiacService.inspecoesAprovadas('alpa')).rejects.toThrow('sem acesso');
  });

  it('erro do supabase vira Error com a mensagem', async () => {
    resposta = { data: null, error: { message: 'permission denied' } };
    await expect(qualidadeSiacService.listarItens('o1')).rejects.toThrow('permission denied');
    await expect(qualidadeSiacService.registrarTreinamentoEmObra({
      organizationId: 'o1', courseId: 'c', data: 'd', instrutor: 'i', local: 'l', employeeIds: [], novosTerceiros: [],
    })).rejects.toThrow('permission denied');
  });
});
