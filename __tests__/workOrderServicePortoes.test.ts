import { beforeEach, describe, expect, it, vi } from 'vitest';

// Qualidade SiAC — fase 2 (Task 3): os portões de checklist/NC/inspeção saíram do app e vêm do
// banco (`oe_portoes`); o app só junta as checagens próprias (equipe, responsável, datas, custo,
// predecessora, % executado).

const chamadas: { metodo: string; args: unknown[] }[] = [];
type Resposta = { data: unknown; error: { message: string; code?: string } | null };
let respostaPorTabela: Record<string, Resposta> = {};
let respostaRpc: Resposta = { data: [], error: null };

function cadeia(tabela: string) {
  const r = () => respostaPorTabela[tabela] ?? { data: null, error: null };
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'upsert', 'insert', 'update', 'delete', 'not', 'lt']) {
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
      return Promise.resolve(respostaRpc);
    },
  },
}));

import { workOrderService } from '../services/workOrderService';

const achar = (metodo: string) => chamadas.filter((c) => c.metodo === metodo);

/** OE completa para liberar (equipe, responsável, datas, custo), sem predecessora. */
const oe = (extra: Record<string, unknown> = {}) => ({
  id: 'wo1',
  project_id: 'p1',
  status: 'planned',
  team_id: 't1',
  responsible_id: 'r1',
  planned_start_date: '2026-11-01',
  planned_end_date: '2026-11-30',
  planned_cost: 1000,
  completion_pct: 100,
  predecessor: null,
  checklist_responses: [],
  non_conformances: [],
  validations: [],
  ...extra,
});

beforeEach(() => {
  chamadas.length = 0;
  respostaPorTabela = {};
  respostaRpc = { data: [], error: null };
});

describe('workOrderService.validateTransition — portões do banco + checagens próprias', () => {
  it('chama oe_portoes com a OE e o status novo e junta as mensagens às checagens próprias', async () => {
    respostaPorTabela.work_orders = { data: oe({ team_id: null }), error: null };
    respostaRpc = { data: ['2 itens obrigatórios do checklist antes de iniciar não cumpridos'], error: null };

    const r = await workOrderService.validateTransition('wo1', 'released');

    expect(achar('rpc')[0].args).toEqual(['oe_portoes', { p_work_order_id: 'wo1', p_novo_status: 'released' }]);
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual([
      'Equipe não vinculada',
      '2 itens obrigatórios do checklist antes de iniciar não cumpridos',
    ]);
  });

  it('não conta mais o checklist local: item pendente na OE, banco sem mensagem → válido', async () => {
    respostaPorTabela.work_orders = {
      data: oe({
        checklist_responses: [{ completed: false, item: { gate: 'pre_start', required: true } }],
      }),
      error: null,
    };
    const r = await workOrderService.validateTransition('wo1', 'released');
    expect(r).toEqual({ valid: true, errors: [] });
  });

  it('pending_inspection: % executado é do app; NC aberta local não conta (vem do banco)', async () => {
    respostaPorTabela.work_orders = {
      data: oe({ status: 'in_progress', completion_pct: 50, non_conformances: [{ status: 'open' }] }),
      error: null,
    };
    respostaPorTabela.project_ops_config = { data: { gate_config: { minPctForInspection: 90 } }, error: null };
    respostaRpc = { data: ['1 não conformidade(s) em aberto'], error: null };

    const r = await workOrderService.validateTransition('wo1', 'pending_inspection');

    expect(r.errors).toEqual(['Execução em 50% — mínimo 90% para solicitar inspeção', '1 não conformidade(s) em aberto']);
    expect(achar('rpc')[0].args[1]).toEqual({ p_work_order_id: 'wo1', p_novo_status: 'pending_inspection' });
  });

  it('approved: sem checagem local da validação — vale o que o banco disser', async () => {
    respostaPorTabela.work_orders = { data: oe({ status: 'pending_inspection' }), error: null };
    expect(await workOrderService.validateTransition('wo1', 'approved')).toEqual({ valid: true, errors: [] });

    respostaRpc = { data: ['Registro de inspeção aprovada não encontrado — use "Aprovar inspeção"'], error: null };
    const r = await workOrderService.validateTransition('wo1', 'approved');
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(['Registro de inspeção aprovada não encontrado — use "Aprovar inspeção"']);
  });

  it('transição não permitida responde na hora, sem consultar o banco', async () => {
    respostaPorTabela.work_orders = { data: oe({ status: 'planned' }), error: null };
    const r = await workOrderService.validateTransition('wo1', 'closed');
    expect(r.valid).toBe(false);
    expect(achar('rpc')).toHaveLength(0);
  });

  it('erro da RPC (ex.: 42501) vira mensagem do portão — a transição não fica liberada calada', async () => {
    respostaPorTabela.work_orders = { data: oe(), error: null };
    respostaRpc = { data: null, error: { message: 'OE não encontrada ou sem acesso.', code: '42501' } };
    const r = await workOrderService.validateTransition('wo1', 'released');
    expect(r).toEqual({ valid: false, errors: ['OE não encontrada ou sem acesso.'] });
  });
});

describe('workOrderService — inspeção e NC da fase 2', () => {
  it('aprovarInspecao chama a RPC com os parâmetros nomeados e devolve o id da validação', async () => {
    respostaRpc = { data: 'val-1', error: null };
    expect(await workOrderService.aprovarInspecao('wo1', false, 'prumo fora')).toBe('val-1');
    expect(achar('rpc')[0].args).toEqual(['quality_aprovar_inspecao', {
      p_work_order_id: 'wo1', p_aprovar: false, p_notas: 'prumo fora',
    }]);
  });

  it('aprovarInspecao: erro do banco sobe como Error com a mensagem (e o código)', async () => {
    respostaRpc = { data: null, error: { message: 'Sem permissão para aprovar a inspeção de serviço controlado', code: '42501' } };
    const p = workOrderService.aprovarInspecao('wo1', true, '');
    await expect(p).rejects.toThrow('Sem permissão para aprovar a inspeção de serviço controlado');
    await expect(p).rejects.toMatchObject({ code: '42501' });
  });

  it('encerrarNC grava causa, ação corretiva, evidência, encerramento e eficácia pendente', async () => {
    await workOrderService.encerrarNC('nc1', { causa: ' traço errado ', acaoCorretiva: 'refazer', evidenciaId: 'ev1' });
    expect(achar('from')[0].args).toEqual(['non_conformances']);
    const patch = achar('update')[0].args[0] as Record<string, unknown>;
    expect(patch).toMatchObject({
      status: 'closed', causa: 'traço errado', corrective_action: 'refazer', resolution_evidence_id: 'ev1', eficacia: 'pendente',
    });
    expect(typeof patch.closed_at).toBe('string');
    expect(achar('eq')[0].args).toEqual(['id', 'nc1']);
  });

  it('encerrarNC sem causa ou sem ação corretiva é recusado antes de ir ao banco', async () => {
    await expect(workOrderService.encerrarNC('nc1', { causa: ' ', acaoCorretiva: 'x' })).rejects.toThrow(/causa/i);
    await expect(workOrderService.encerrarNC('nc1', { causa: 'x', acaoCorretiva: '' })).rejects.toThrow(/ação corretiva/i);
    expect(achar('update')).toHaveLength(0);
  });

  it('encerrarNC: erro do banco sobe como Error', async () => {
    respostaPorTabela.non_conformances = { data: null, error: { message: 'new row violates check constraint' } };
    await expect(workOrderService.encerrarNC('nc1', { causa: 'a', acaoCorretiva: 'b' })).rejects.toThrow('violates check');
  });

  it('registrarEficacia: eficaz só marca; não eficaz reabre a NC', async () => {
    await workOrderService.registrarEficacia('nc1', true);
    expect(achar('update')[0].args[0]).toEqual({ eficacia: 'eficaz' });

    chamadas.length = 0;
    await workOrderService.registrarEficacia('nc1', false);
    expect(achar('update')[0].args[0]).toEqual({ eficacia: 'nao_eficaz', status: 'open', closed_at: null });
    expect(achar('eq')[0].args).toEqual(['id', 'nc1']);
  });

  it('histórico da NC e da resposta: tabela própria, filtrado e em ordem cronológica', async () => {
    respostaPorTabela.non_conformance_history = { data: [{ id: 'h1' }], error: null };
    expect(await workOrderService.listarHistoricoNC('nc1')).toEqual([{ id: 'h1' }]);
    expect(achar('from')[0].args).toEqual(['non_conformance_history']);
    expect(achar('eq')[0].args).toEqual(['nc_id', 'nc1']);
    expect(achar('order')[0].args).toEqual(['created_at', { ascending: true }]);

    chamadas.length = 0;
    respostaPorTabela.oe_checklist_response_history = { data: null, error: null };
    expect(await workOrderService.listarHistoricoResposta('r1')).toEqual([]);
    expect(achar('from')[0].args).toEqual(['oe_checklist_response_history']);
    expect(achar('eq')[0].args).toEqual(['response_id', 'r1']);

    respostaPorTabela.oe_checklist_response_history = { data: null, error: { message: 'sem acesso' } };
    await expect(workOrderService.listarHistoricoResposta('r1')).rejects.toThrow('sem acesso');
  });
});

describe('workOrderService.update — serviço controlado (Task 4)', () => {
  it('manda controlled_item_id só quando o formulário envia (null = retirar); ausente não mexe', async () => {
    respostaPorTabela.work_orders = { data: oe(), error: null };
    await workOrderService.update('wo1', { title: 'OE', controlledItemId: 's1', checklistTemplateId: 'tpl' });
    expect(achar('update')[0].args[0]).toMatchObject({ controlled_item_id: 's1', checklist_template_id: 'tpl' });

    chamadas.length = 0;
    await workOrderService.update('wo1', { title: 'OE', controlledItemId: null });
    expect(achar('update')[0].args[0]).toMatchObject({ controlled_item_id: null });

    chamadas.length = 0;
    await workOrderService.update('wo1', { title: 'OE' });
    expect(achar('update')[0].args[0]).not.toHaveProperty('controlled_item_id');
  });
});
