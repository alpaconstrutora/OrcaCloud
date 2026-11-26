import { beforeEach, describe, expect, it, vi } from 'vitest';

// Qualidade SiAC — fase 2 (Task 3): os portões de checklist/NC/inspeção saíram do app e vêm do
// banco (`oe_portoes`); o app só junta as checagens próprias (equipe, responsável, datas, custo,
// predecessora, % executado).

const chamadas: { metodo: string; args: unknown[] }[] = [];
type Resposta = { data: unknown; error: { message: string; code?: string } | null };
let respostaPorTabela: Record<string, Resposta> = {};
let respostaRpc: Resposta = { data: [], error: null };
let respostaUpload: { message: string } | null = null;

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
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, file: unknown, opts: unknown) => {
          chamadas.push({ metodo: 'upload', args: [bucket, path, file, opts] });
          return Promise.resolve({ error: respostaUpload });
        },
      }),
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
  respostaUpload = null;
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

  it('encerrarNC sem foto nova não mexe na evidência anterior (decisão 3: não zera resolution_evidence_id)', async () => {
    await workOrderService.encerrarNC('nc1', { causa: 'traço errado', acaoCorretiva: 'refazer' });
    const patch = achar('update')[0].args[0] as Record<string, unknown>;
    expect(patch).toMatchObject({ status: 'closed', causa: 'traço errado', corrective_action: 'refazer', eficacia: 'pendente' });
    expect('resolution_evidence_id' in patch).toBe(false);
    expect(patch.eficacia_motivo).toBeNull();
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
    expect(achar('update')[0].args[0]).toEqual({ eficacia: 'eficaz', eficacia_motivo: null });

    chamadas.length = 0;
    await workOrderService.registrarEficacia('nc1', false);
    expect(achar('update')[0].args[0]).toEqual({ eficacia: 'nao_eficaz', status: 'open', closed_at: null, eficacia_motivo: null });
    expect(achar('eq')[0].args).toEqual(['id', 'nc1']);
  });

  it('registrarEficacia não eficaz com motivo: um UPDATE só, motivo em eficacia_motivo, descrição intocada', async () => {
    await workOrderService.registrarEficacia('nc1', false, '  fissura voltou ');
    expect(achar('select')).toHaveLength(0);
    expect(achar('update')).toHaveLength(1);
    const patch = achar('update')[0].args[0] as Record<string, unknown>;
    expect(patch).toEqual({ eficacia: 'nao_eficaz', status: 'open', closed_at: null, eficacia_motivo: 'fissura voltou' });
    expect('description' in patch).toBe(false);
  });

  it('closeNonConformance saiu (decisão 2: encerrar é só encerrarNC)', () => {
    expect('closeNonConformance' in workOrderService).toBe(false);
  });

  it('createNonConformance leva causa e ação corretiva opcionais (decisão 1)', async () => {
    respostaPorTabela.non_conformances = { data: { id: 'nc-nova' }, error: null };
    const nova = await workOrderService.createNonConformance({
      workOrderId: 'wo1', description: 'Prumo fora', severity: 'minor', causa: ' gabarito torto ', correctiveAction: 'refazer',
    });
    expect(nova).toEqual({ id: 'nc-nova' });
    expect(achar('insert')[0].args[0]).toMatchObject({
      work_order_id: 'wo1', description: 'Prumo fora', severity: 'minor', causa: 'gabarito torto', corrective_action: 'refazer', status: 'open',
    });

    chamadas.length = 0;
    await workOrderService.createNonConformance({ workOrderId: 'wo1', description: 'x', causa: '  ' });
    expect(achar('insert')[0].args[0]).toMatchObject({ causa: null, corrective_action: null });
  });

  it('enviarFotoEvidencia: sobe no bucket privado (pasta da org DA OE) e grava evidence_files com o PATH; devolve o id', async () => {
    // REGRA #5: a pasta é a da organização da OE (work_orders.org_id), nunca a do topo.
    respostaPorTabela.work_orders = { data: { org_id: 'org-da-oe' }, error: null };
    respostaPorTabela.evidence_files = { data: { id: 'ev1' }, error: null };
    const file = new File(['x'], 'foto.png', { type: 'image/png' });
    const id = await workOrderService.enviarFotoEvidencia({
      workOrderId: 'wo1', file, prefixo: 'nc_nc1', gate: 'execution', description: 'Correção da NC',
    });
    expect(id).toBe('ev1');
    expect(achar('from')[0].args).toEqual(['work_orders']);
    expect(achar('eq')[0].args).toEqual(['id', 'wo1']);
    const [bucket, path] = achar('upload')[0].args as [string, string];
    expect(bucket).toBe('operational-evidence');
    expect(path).toMatch(/^evidence\/org-da-oe\/wo1\/nc_nc1_\d+\.png$/);
    expect(achar('insert')[0].args[0]).toMatchObject({
      work_order_id: 'wo1', file_type: 'photo', file_url: path, gate: 'execution', description: 'Correção da NC',
    });

    chamadas.length = 0;
    respostaUpload = { message: 'sem permissão no bucket' };
    await expect(workOrderService.enviarFotoEvidencia({
      workOrderId: 'wo1', file, prefixo: 'p', gate: 'free', description: 'd',
    })).rejects.toThrow('sem permissão no bucket');
    expect(achar('insert')).toHaveLength(0);
  });

  it('enviarFotoEvidencia: sem conseguir ler a org da OE não sobe nada (nem para uma pasta "default")', async () => {
    const file = new File(['x'], 'foto.png', { type: 'image/png' });
    respostaPorTabela.work_orders = { data: null, error: { message: 'tempo esgotado' } };
    await expect(workOrderService.enviarFotoEvidencia({
      workOrderId: 'wo1', file, prefixo: 'p', gate: 'free', description: 'd',
    })).rejects.toThrow('tempo esgotado');
    expect(achar('upload')).toHaveLength(0);

    chamadas.length = 0;
    respostaPorTabela.work_orders = { data: { org_id: null }, error: null };
    await expect(workOrderService.enviarFotoEvidencia({
      workOrderId: 'wo1', file, prefixo: 'p', gate: 'free', description: 'd',
    })).rejects.toThrow(/organização da OE/);
    expect(achar('upload')).toHaveLength(0);
  });

  it('portoesDaOE chama oe_portoes e devolve as mensagens; erro do banco sobe', async () => {
    respostaRpc = { data: ['1 não conformidade(s) em aberto'], error: null };
    expect(await workOrderService.portoesDaOE('wo1', 'pending_inspection')).toEqual(['1 não conformidade(s) em aberto']);
    expect(achar('rpc')[0].args).toEqual(['oe_portoes', { p_work_order_id: 'wo1', p_novo_status: 'pending_inspection' }]);

    respostaRpc = { data: null, error: null };
    expect(await workOrderService.portoesDaOE('wo1', 'pending_inspection')).toEqual([]);

    respostaRpc = { data: null, error: { message: 'OE não encontrada ou sem acesso.', code: '42501' } };
    await expect(workOrderService.portoesDaOE('wo1', 'pending_inspection')).rejects.toThrow('OE não encontrada ou sem acesso.');
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

describe('workOrderService.transition / unblock — o histórico de status não falha calado', () => {
  it('transition: erro ao gravar work_order_status_log sobe (o status mudou, o histórico não)', async () => {
    respostaPorTabela.work_orders = { data: oe({ status: 'in_progress' }), error: null };
    respostaPorTabela.work_order_status_log = { data: null, error: { message: 'histórico recusado', code: '42501' } };
    await expect(workOrderService.transition('wo1', 'blocked')).rejects.toThrow('histórico recusado');
  });

  it('transition: histórico gravado → devolve a OE', async () => {
    respostaPorTabela.work_orders = { data: oe({ status: 'in_progress' }), error: null };
    respostaPorTabela.work_order_status_log = { data: null, error: null };
    await expect(workOrderService.transition('wo1', 'blocked')).resolves.toMatchObject({ id: 'wo1' });
    expect(achar('insert')[0].args[0]).toMatchObject({ work_order_id: 'wo1', new_status: 'blocked' });
  });

  it('unblock: erro ao gravar work_order_status_log sobe', async () => {
    respostaPorTabela.work_orders = { data: { status: 'blocked', status_before_block: 'in_progress', replanning_count: 0 }, error: null };
    respostaPorTabela.work_order_status_log = { data: null, error: { message: 'histórico recusado' } };
    await expect(workOrderService.unblock('wo1')).rejects.toThrow('histórico recusado');
  });
});
