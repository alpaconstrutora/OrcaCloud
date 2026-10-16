/**
 * Torre de Controle — Fluxo Financeiro (services/financeiroFlowService.ts +
 * CELULAS_FINANCEIRO). D.1/D.2/D.5 de docs/planos/2026-10-16-torre-fluxo-financeiro.md.
 *
 * O que este arquivo trava:
 *   1. o desenho: 11 etapas, 10 transições, 4 grupos; toda aresta liga etapas
 *      que existem; só as quatro portas de entrada não têm aresta de entrada;
 *   2. modelo ativo em `payable.approved` → a transição Alçada → Pagamento (e a
 *      entrada do nó Pagamento) fica orquestrada, e a Alçada resume as
 *      instâncias nascidas nela;
 *   3. evento do P2P não orquestra nada aqui (cada Torre lê os seus eventos);
 *   4. o recorte: obra escolhida filtra título/boleto/views, mas NÃO o extrato
 *      nem o fechamento (são da organização); origem a pagar exclui manual e
 *      boleto; "Todas" não manda `organization_id`;
 *   5. o arranjo no canvas: nenhum cartão sobrepõe outro e nenhuma caixa de
 *      grupo encosta na de outro grupo nem cobre cartão alheio;
 *   6. motor fora do ar → retrato estático; nó sem evento → sem processos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Linha = Record<string, unknown>;
type Operacao = [string, string, unknown];
const dados: Record<string, Linha[]> = {};
const consultas: { tabela: string; ops: Operacao[] }[] = [];
let motorFalha = false;

function query(tabela: string) {
    const q: Record<string, unknown> = {};
    const registro = { tabela, ops: [] as Operacao[] };
    consultas.push(registro);
    const op = (nome: string) => (col: string, a: unknown, b?: unknown) => {
        registro.ops.push([nome, col, b === undefined ? a : `${a} ${b}`]);
        return q;
    };
    const resposta = async () => {
        if (motorFalha && tabela.startsWith('process_')) return { data: null, error: { message: 'motor fora' }, count: 0 };
        return { data: dados[tabela] ?? [], error: null, count: (dados[tabela] ?? []).length };
    };
    Object.assign(q, {
        select: () => q, order: () => q, limit: () => q,
        eq: op('eq'), in: op('in'), not: op('not'),
        then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => resposta().then(res, rej),
    });
    return q;
}

vi.mock('../lib/supabase', () => ({ supabase: { from: (tabela: string) => query(tabela) } }));
vi.mock('../services/projectService', () => ({ projectService: { listProjects: async () => [] } }));

import { financeiroFlowService, DEFINICAO_DAS_ARESTAS_FIN, FIN_GROUPS } from '../services/financeiroFlowService';
import { posicoesDosNos, caixaDoGrupo, sobrepoe, CELULAS_FINANCEIRO } from '../utils/p2pLayout';

const IDS = ['boletos', 'origens_pagar', 'a_pagar', 'aprovacao', 'pagamento', 'origens_receber', 'a_receber', 'cobranca', 'extrato', 'baixado', 'fechamento'];
const ONTEM = new Date(Date.now() - 86_400_000).toISOString();

const consultasDe = (tabela: string) => consultas.filter(c => c.tabela === tabela);
const colunas = (c: { ops: Operacao[] }) => c.ops.map(o => o[1]);

describe('financeiroFlowService — desenho', () => {
    beforeEach(() => {
        for (const k of Object.keys(dados)) delete dados[k];
        consultas.length = 0;
        motorFalha = false;
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('11 etapas, 10 transições entre etapas que existem, 4 grupos; só as portas de entrada não têm aresta de entrada', async () => {
        const { stages, edges, groups } = await financeiroFlowService.getSnapshot('org1');
        expect(stages.map(s => s.id)).toEqual(IDS);
        expect(edges).toHaveLength(10);
        for (const e of edges) {
            expect(IDS).toContain(e.from);
            expect(IDS).toContain(e.to);
        }
        expect(groups.map(g => g.id)).toEqual(['pagar', 'receber', 'tesouraria', 'controladoria']);
        expect(groups.flatMap(g => g.nodeIds).sort()).toEqual([...IDS].sort());
        const semEntrada = IDS.filter(id => !edges.some(e => e.to === id));
        expect(semEntrada).toEqual(['boletos', 'origens_pagar', 'origens_receber', 'extrato']);
        // As duas linhas convergem em Pago / Recebido.
        expect(edges.filter(e => e.to === 'baixado').map(e => e.from).sort()).toEqual(['cobranca', 'extrato', 'pagamento']);
    });

    it('nó com várias entradas lista todas na nota e fica com a costura mais exigente (16/10: herdava só a do boleto)', async () => {
        const { stages } = await financeiroFlowService.getSnapshot('org1');
        const aPagar = stages.find(s => s.id === 'a_pagar')!;
        expect(aPagar.inboundSeam).toBe('manual');
        expect(aPagar.inboundNote).toBe('2 entradas: Boletos capturados (semi-manual) · Origens a pagar (automática)');
        const baixado = stages.find(s => s.id === 'baixado')!;
        expect(baixado.inboundNote).toMatch(/^3 entradas: Pagamento \(semi-manual\) · Extrato bancário \(automática\) · Cobrança emitida \(automática\)$/);
        // nó de uma entrada só segue herdando a nota da aresta
        expect(stages.find(s => s.id === 'aprovacao')!.inboundNote).toContain('Só o boleto entra na alçada sozinho');
    });

    it('a lacuna conhecida fica escrita na transição: a baixa não confere a alçada', () => {
        const baixa = DEFINICAO_DAS_ARESTAS_FIN.find(d => d.from === 'pagamento' && d.to === 'baixado')!;
        expect(baixa.note).toContain('não confere a alçada');
    });

    it('modelo ativo em payable.approved → Alçada → Pagamento orquestrada (aresta e nó) e a Alçada resume as instâncias', async () => {
        const tpl = { id: 't1', name: 'Programar pagamento', trigger_event_key: 'payable.approved', organization_id: 'org1' };
        dados.process_templates = [tpl];
        dados.process_instances = [{
            id: 'i1', title: 'Aluguel do galpão', status: 'EM_ANDAMENTO', started_at: ONTEM, due_at: ONTEM,
            current_step_id: null, process_templates: tpl,
        }];
        const { stages, edges } = await financeiroFlowService.getSnapshot('org1');
        const aresta = edges.find(e => e.id === 'aprovacao->pagamento')!;
        expect(aresta.seam).toBe('orquestrada');
        expect(aresta.templates).toEqual([{ id: 't1', name: 'Programar pagamento', organizationId: 'org1', eventKey: 'payable.approved' }]);
        expect(stages.find(s => s.id === 'pagamento')!.inboundSeam).toBe('orquestrada');
        expect(stages.find(s => s.id === 'aprovacao')!.processes).toEqual({ ativos: 1, atrasados: 1, templates: ['Programar pagamento'] });
        expect(edges.filter(e => e.seam === 'orquestrada').map(e => e.id)).toEqual(['aprovacao->pagamento']);
    });

    it('transição orquestrada mantém a nota do retrato (a lacuna da baixa não some quando o modelo existe)', async () => {
        dados.process_templates = [{ id: 't3', name: 'Pós-pagamento', trigger_event_key: 'payable.settled', organization_id: 'org1' }];
        const { edges } = await financeiroFlowService.getSnapshot('org1');
        const baixa = edges.find(e => e.id === 'pagamento->baixado')!;
        expect(baixa.seam).toBe('orquestrada');
        expect(baixa.note).toMatch(/^Conduzida por Processos: Pós-pagamento — .*não confere a alçada$/);
    });

    it('evento do P2P não orquestra nenhuma transição do Financeiro', async () => {
        dados.process_templates = [{ id: 't9', name: 'Pagamento de fornecedor', trigger_event_key: 'internal_transaction.paid', organization_id: 'org1' }];
        const { edges } = await financeiroFlowService.getSnapshot('org1');
        expect(edges.some(e => e.seam === 'orquestrada')).toBe(false);
        expect(edges.flatMap(e => e.eventKeys ?? []).sort()).toEqual(['boleto.approved', 'payable.approved', 'payable.settled', 'receivable.settled']);
    });

    it('motor fora do ar → retrato estático, o quadro não some', async () => {
        motorFalha = true;
        dados.process_templates = [{ id: 't1', name: 'X', trigger_event_key: 'payable.approved', organization_id: 'org1' }];
        const { stages, edges } = await financeiroFlowService.getSnapshot('org1');
        expect(stages).toHaveLength(11);
        expect(edges.some(e => e.seam === 'orquestrada')).toBe(false);
    });

    it('nó sem evento não tem processos', async () => {
        expect(await financeiroFlowService.getStageProcesses('a_pagar', 'org1')).toEqual([]);
    });
});

describe('financeiroFlowService — recorte (REGRA #5 e filtro de obra)', () => {
    beforeEach(() => {
        for (const k of Object.keys(dados)) delete dados[k];
        consultas.length = 0;
        motorFalha = false;
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('obra escolhida filtra títulos, boletos e views; extrato e fechamento são da organização inteira', async () => {
        await financeiroFlowService.getSnapshot('org1', 'obra1');
        for (const t of ['internal_transactions', 'vw_payables', 'vw_receivables', 'boletos']) {
            expect(consultasDe(t).length).toBeGreaterThan(0);
            for (const c of consultasDe(t)) expect(colunas(c)).toContain('project_id');
        }
        for (const t of ['bank_transactions', 'financial_period_locks']) {
            expect(consultasDe(t).length).toBeGreaterThan(0);
            for (const c of consultasDe(t)) {
                expect(colunas(c)).not.toContain('project_id');
                expect(colunas(c)).toContain('organization_id');
            }
        }
    });

    it('"Todas as organizações" não manda organization_id em nenhuma contagem', async () => {
        await financeiroFlowService.getSnapshot(null);
        const contagens = consultas.filter(c => !c.tabela.startsWith('process_'));
        expect(contagens.length).toBeGreaterThan(0);
        for (const c of contagens) expect(colunas(c)).not.toContain('organization_id');
    });

    it('Alçada e Pagamento contam pelo approval_status de títulos ABERTOS — o liberado abaixo do piso não tem business_status (16/10: 75 títulos, nó dava zero)', async () => {
        await financeiroFlowService.getSnapshot('org1');
        const porAprovacao = consultasDe('internal_transactions').filter(c => c.ops.some(o => o[1] === 'approval_status'));
        const valores = porAprovacao.map(c => c.ops.find(o => o[1] === 'approval_status')![2]).sort();
        expect(valores).toEqual(['APROVADO', 'PENDENTE']);
        for (const c of porAprovacao) {
            expect(c.ops).toContainEqual(['eq', 'status', 'PENDING']);
            expect(c.ops).toContainEqual(['eq', 'direction', 'DEBIT']);
        }
        expect(consultas.some(c => c.ops.some(o => o[1] === 'business_status'))).toBe(false);
    });

    it('extrato pendente usa o mesmo critério da aba Pendentes da Conciliação', async () => {
        await financeiroFlowService.getSnapshot('org1');
        const extrato = consultasDe('bank_transactions')[0];
        expect(extrato.ops).toContainEqual(['in', 'status', ['IMPORTED', 'NORMALIZED', 'RULE_APPLIED', 'CONFIRMED']]);
    });

    it('origem a pagar exclui lançamento manual e boleto (que tem etapa própria); a receber exclui só o manual', async () => {
        await financeiroFlowService.getSnapshot('org1');
        const origens = consultasDe('internal_transactions').filter(c => c.ops.some(o => o[1] === 'source_system'));
        const nots = origens.map(c => c.ops.find(o => o[1] === 'source_system')![2]);
        expect(nots).toContain('in (MANUAL,BOLETO)');
        expect(nots).toContain('in (MANUAL)');
    });
});

describe('CELULAS_FINANCEIRO — arranjo no canvas', () => {
    const p = posicoesDosNos(IDS, CELULAS_FINANCEIRO);

    it('toda etapa tem célula própria e nenhum cartão sobrepõe outro', () => {
        for (const id of IDS) expect(CELULAS_FINANCEIRO[id]).toBeDefined();
        for (let i = 0; i < IDS.length; i++) {
            for (let j = i + 1; j < IDS.length; j++) expect(sobrepoe(p[IDS[i]], p[IDS[j]])).toBe(false);
        }
    });

    it('nenhuma caixa de grupo encosta na de outro grupo nem cobre cartão de outro grupo', () => {
        const caixas = FIN_GROUPS.map(g => ({ g, caixa: caixaDoGrupo(g.nodeIds, p)! }));
        for (let i = 0; i < caixas.length; i++) {
            for (let j = i + 1; j < caixas.length; j++) {
                expect(sobrepoe(caixas[i].caixa, caixas[j].caixa), `${caixas[i].g.id} × ${caixas[j].g.id}`).toBe(false);
            }
            for (const id of IDS.filter(x => !caixas[i].g.nodeIds.includes(x))) {
                expect(sobrepoe(caixas[i].caixa, p[id]), `${caixas[i].g.id} cobre ${id}`).toBe(false);
            }
        }
    });
});
