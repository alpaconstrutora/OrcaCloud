/**
 * Torre de Controle — a costura deixa de ser rótulo fixo e passa a ler o motor
 * de Processos. docs/planos/2026-09-28-torre-p2p-processos.md — Passo 2.1
 *
 * O que este arquivo trava:
 *   1. org com template EVENTO ativo para `purchase_order.received` → o nó
 *      SEGUINTE ao Recebimento (Estoque) entra `orquestrada`, e o Recebimento
 *      ganha o resumo das instâncias nascidas nele (ativos/atrasados);
 *   2. org sem template → costura estática, sem `orquestrada` em lugar nenhum;
 *   3. nenhum nó sai `gap` por "SEM 3-way match" — o rótulo de junho morreu;
 *   4. motor fora do ar → retrato estático, o quadro não some;
 *   5. `getStageProcesses` devolve as instâncias do nó com a etapa atual e o
 *      atraso calculado pelo prazo da etapa; nó sem evento devolve [].
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Linha = Record<string, unknown>;
const dados: Record<string, Linha[]> = {};
let motorFalha = false;

function query(tabela: string) {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    const resposta = async () => {
        if (motorFalha && tabela.startsWith('process_')) return { data: null, error: { message: 'motor fora' }, count: 0 };
        return { data: dados[tabela] ?? [], error: null, count: (dados[tabela] ?? []).length };
    };
    Object.assign(q, {
        select: chain, eq: chain, in: chain, not: chain, order: chain, limit: chain,
        then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => resposta().then(res, rej),
    });
    return q;
}

vi.mock('../lib/supabase', () => ({ supabase: { from: (tabela: string) => query(tabela) } }));
vi.mock('../services/projectService', () => ({ projectService: { listProjects: async () => [] } }));
vi.mock('../services/purchaseRequestService', () => ({ purchaseRequestService: { list: async () => [] } }));

import { p2pFlowService } from '../services/p2pFlowService';

const ONTEM = new Date(Date.now() - 86_400_000).toISOString();
const AMANHA = new Date(Date.now() + 86_400_000).toISOString();

const templateRecebido = { name: 'Aprovação de pagamento de fornecedor', trigger_event_key: 'purchase_order.received' };
const instancia = (id: string, stepId: string) => ({
    id, title: `Pedido ${id} — Recebido`, status: 'AGUARDANDO_APROVACAO', started_at: ONTEM, due_at: null,
    current_step_id: stepId, process_templates: templateRecebido,
});

describe('p2pFlowService — costura orquestrada pelo motor de Processos', () => {
    beforeEach(() => {
        for (const k of Object.keys(dados)) delete dados[k];
        motorFalha = false;
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('template ativo → entrada do nó seguinte ao Recebimento é orquestrada, e o Recebimento resume as instâncias', async () => {
        dados.process_templates = [templateRecebido];
        dados.process_instances = [instancia('i1', 's1'), instancia('i2', 's2')];
        dados.process_instance_steps = [
            { id: 's1', name: 'Conferência Fiscal', due_at: ONTEM },   // atrasada
            { id: 's2', name: 'Conferência Fiscal', due_at: AMANHA },
        ];
        const { stages } = await p2pFlowService.getSnapshot('org1');
        const recebimento = stages.find(s => s.id === 'recebimento')!;
        const estoque = stages.find(s => s.id === 'estoque')!;

        expect(estoque.inboundSeam).toBe('orquestrada');
        expect(estoque.inboundNote).toContain('Aprovação de pagamento de fornecedor');
        expect(recebimento.inboundSeam).toBe('auto'); // a ENTRADA do Recebimento não muda: o processo nasce nele
        expect(recebimento.processes).toEqual({ ativos: 2, atrasados: 1, templates: ['Aprovação de pagamento de fornecedor'] });
    });

    it('sem template ativo → costura estática, sem orquestrada', async () => {
        const { stages } = await p2pFlowService.getSnapshot('org1');
        expect(stages.some(s => s.inboundSeam === 'orquestrada')).toBe(false);
        expect(stages.find(s => s.id === 'recebimento')!.processes).toEqual({ ativos: 0, atrasados: 0, templates: [] });
    });

    it('o rótulo "SEM 3-way match" morreu: nenhum nó é gap por isso', async () => {
        const { stages } = await p2pFlowService.getSnapshot('org1');
        const fiscal = stages.find(s => s.id === 'fiscal')!;
        expect(fiscal.inboundSeam).not.toBe('gap');
        expect(fiscal.inboundNote).toMatch(/3-way match/);
        expect(stages.find(s => s.id === 'financeiro')!.inboundSeam).toBe('auto');
    });

    it('motor fora do ar → o quadro continua com o retrato estático', async () => {
        motorFalha = true;
        const { stages } = await p2pFlowService.getSnapshot('org1');
        expect(stages).toHaveLength(8);
        expect(stages.some(s => s.inboundSeam === 'orquestrada')).toBe(false);
    });

    it('getStageProcesses lista as instâncias do nó com etapa atual e atraso; nó sem evento devolve []', async () => {
        dados.process_templates = [templateRecebido];
        dados.process_instances = [instancia('i1', 's1')];
        dados.process_instance_steps = [{ id: 's1', name: 'Conferência Fiscal', due_at: ONTEM }];

        const lista = await p2pFlowService.getStageProcesses('recebimento', 'org1');
        expect(lista).toHaveLength(1);
        expect(lista[0]).toMatchObject({
            id: 'i1', templateName: 'Aprovação de pagamento de fornecedor',
            stepName: 'Conferência Fiscal', overdue: true, status: 'AGUARDANDO_APROVACAO',
        });
        expect(await p2pFlowService.getStageProcesses('fiscal', 'org1')).toEqual([]);
    });
});
