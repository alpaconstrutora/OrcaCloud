import { describe, it, expect } from 'vitest';
import {
    saudacaoPorHora, comoChamar, diaEmSaoPaulo, diasDeAtraso, montarFila, itemEmDestaque,
    contagemDoDia, fraseResumo, percentualConciliado, alertasDasFontes, type AlertaDoDia,
} from '../utils/meuDia';
import type { ActionQueueItem } from '../services/approvalService';
import type { MeuDia } from '../services/centralControleService';

const HOJE = '2026-11-11';

function aprovacao(p: Partial<ActionQueueItem> & { id: string }): ActionQueueItem {
    return {
        entity: 'transaction', title: `Título ${p.id}`, amount: 100, approval_status: 'PENDENTE',
        approval_chain: [], approval_required_levels: 1, pode_aprovar: true, vez_de: [], ...p,
    } as ActionQueueItem;
}

function meuDia(p: Partial<MeuDia> = {}): MeuDia {
    return {
        hoje: HOJE,
        tarefas: { pendentes: [], qtd_pendentes: 0, concluidas_hoje: 0 },
        contas_hoje: { pendentes: [], qtd_pendentes: 0, pagas_hoje: 0 },
        aprovacoes_hoje: 0,
        contas_7_dias: { atrasadas: { qtd: 0, valor: 0 }, vencem_em_2_dias: { qtd: 0, valor: 0 }, vencem_em_7_dias: { qtd: 0, valor: 0 } },
        conciliado: { conciliadas: 0, pendentes: 0, conciliadas_anterior: 0, pendentes_anterior: 0 },
        ...p,
    };
}

const alerta = (id: string, severity: AlertaDoDia['severity']): AlertaDoDia =>
    ({ id, severity, title: id, description: '', view: 'x' });

describe('saudacaoPorHora', () => {
    it.each([[5, 'Bom dia'], [11, 'Bom dia'], [12, 'Boa tarde'], [17, 'Boa tarde'], [18, 'Boa noite'], [0, 'Boa noite'], [4, 'Boa noite']])(
        '%ih → %s', (hora, esperado) => expect(saudacaoPorHora(hora as number)).toBe(esperado));
});

describe('comoChamar', () => {
    const orgs = [{ members: [{ email: 'Dev@alpa.com.br', name: 'Dev Silva' }, { email: 'bruna.pereira@alpa.com.br', name: 'bruna.pereira' }] }];
    it('primeiro nome do cadastro, sem diferenciar maiúscula no e-mail', () => expect(comoChamar(orgs, 'dev@alpa.com.br')).toBe('Dev'));
    it('nome cadastrado com cara de login ("bruna.pereira") vira o primeiro pedaço, com inicial maiúscula', () =>
        expect(comoChamar(orgs, 'bruna.pereira@alpa.com.br')).toBe('Bruna'));
    it('sem cadastro: parte do e-mail antes do ponto', () => expect(comoChamar([], 'iago.marques@alpa.com.br')).toBe('Iago'));
    it('sem e-mail: null', () => expect(comoChamar(orgs, undefined)).toBeNull());
});

describe('datas', () => {
    it('data pura passa direto; timestamp vira o dia de São Paulo', () => {
        expect(diaEmSaoPaulo('2026-11-11')).toBe('2026-11-11');
        // 01:30 UTC do dia 12 ainda é dia 11 em São Paulo (UTC−3)
        expect(diaEmSaoPaulo('2026-11-12T01:30:00Z')).toBe('2026-11-11');
    });
    it('diasDeAtraso', () => {
        expect(diasDeAtraso('2026-11-08', HOJE)).toBe(3);
        expect(diasDeAtraso(HOJE, HOJE)).toBe(0);
    });
});

describe('montarFila', () => {
    it('aprovação só PENDENTE e dentro da alçada; alertas HIGH primeiro', () => {
        const f = montarFila(
            [aprovacao({ id: 'a' }), aprovacao({ id: 'b', approval_status: 'RASCUNHO' }), aprovacao({ id: 'c', pode_aprovar: false })],
            null,
            [alerta('m', 'MEDIUM'), alerta('h', 'HIGH')],
        );
        expect(f.aprovacoes.map(i => i.chave)).toEqual(['aprovacao:transaction:a']);
        expect(f.alertas.map(i => i.chave)).toEqual(['alerta:h', 'alerta:m']);
    });
});

describe('itemEmDestaque', () => {
    const md = meuDia({
        tarefas: { pendentes: [{ id: 't', org_id: 'o', title: 'T', due_date: '2026-11-11T15:00:00Z', priority: 2, source_module: null, source_ref: null }], qtd_pendentes: 1, concluidas_hoje: 0 },
        contas_hoje: { pendentes: [{ id: 'c', organization_id: 'o', description: 'Luz', party_name: null, amount: 900, due_date: HOJE }], qtd_pendentes: 1, pagas_hoje: 0 },
    });
    it('vencido há mais tempo ganha de tudo', () => {
        const f = montarFila([aprovacao({ id: 'v1', due_date: '2026-11-09' }), aprovacao({ id: 'v2', due_date: '2026-11-01' })], md, [alerta('h', 'HIGH')]);
        expect(itemEmDestaque(f, HOJE)?.chave).toBe('aprovacao:transaction:v2');
    });
    it('sem vencido: vence hoje de maior valor', () => {
        const f = montarFila([aprovacao({ id: 'x', due_date: HOJE, amount: 50 })], md, []);
        expect(itemEmDestaque(f, HOJE)?.chave).toBe('conta:c');
    });
    it('sem prazo de hoje: alerta de alta prioridade', () => {
        const f = montarFila([aprovacao({ id: 'fut', due_date: '2026-12-01' })], null, [alerta('m', 'MEDIUM'), alerta('h', 'HIGH')]);
        expect(itemEmDestaque(f, HOJE)?.chave).toBe('alerta:h');
    });
    it('fila vazia: null', () => expect(itemEmDestaque(montarFila([], null, []), HOJE)).toBeNull());
});

describe('contagemDoDia e fraseResumo', () => {
    it('dia zerado', () => {
        const c = contagemDoDia(montarFila([], meuDia(), []), meuDia());
        expect(c).toMatchObject({ pendentes: 0, feitos: 0, total: 0 });
        expect(fraseResumo(c)).toBe('Nada esperando por você hoje.');
    });
    it('usa a contagem do banco (lista vem cortada) e só alerta HIGH conta', () => {
        const md = meuDia({
            tarefas: { pendentes: [], qtd_pendentes: 25, concluidas_hoje: 2 },
            contas_hoje: { pendentes: [], qtd_pendentes: 1, pagas_hoje: 3 },
            aprovacoes_hoje: 4,
        });
        const c = contagemDoDia(montarFila([aprovacao({ id: 'a' })], md, [alerta('h', 'HIGH'), alerta('m', 'MEDIUM')]), md);
        expect(c).toMatchObject({ aprovacoes: 1, tarefas: 25, contas: 1, alertas: 1, pendentes: 28, feitos: 9, total: 37 });
        expect(fraseResumo(c)).toBe('28 itens precisam de você hoje: 1 aprovação, 25 tarefas, 1 conta vencendo hoje e 1 alerta de alta prioridade.');
    });
    it('uma parte só, sem vírgula', () => {
        const md = meuDia({ contas_hoje: { pendentes: [], qtd_pendentes: 2, pagas_hoje: 0 } });
        expect(fraseResumo(contagemDoDia(montarFila([], md, []), md))).toBe('2 itens precisam de você hoje: 2 contas vencendo hoje.');
    });
});

describe('percentualConciliado', () => {
    it('percentual e variação em pontos', () => {
        expect(percentualConciliado({ conciliadas: 3, pendentes: 1, conciliadas_anterior: 1, pendentes_anterior: 1 }))
            .toEqual({ pct: 75, base: 4, variacao: 25 });
    });
    it('sem extrato no período: null, não 0%', () => {
        expect(percentualConciliado({ conciliadas: 0, pendentes: 0, conciliadas_anterior: 2, pendentes_anterior: 0 }))
            .toEqual({ pct: null, base: 0, variacao: null });
    });
});

/**
 * Plano B da Central (docs/planos/2026-11-16-central-blocos-isolados.md, Tarefa 3):
 * quando os blocos chegam um a um, o cartão de alertas mostra o que já chegou — a
 * Minha fila não pode ficar esperando o bloco mais lento.
 */
describe('alertasDasFontes', () => {
    const ok = <T,>(value: T): PromiseSettledResult<T> => ({ status: 'fulfilled', value });
    const caiu: PromiseSettledResult<never> = { status: 'rejected', reason: new Error('57014') };
    const semDivergencia = { as_of: HOJE, counts: { value_mismatch: 0, bank_without_internal: 0, internal_without_bank: 0 } } as never;
    const reajuste = { id: 'c1', number: '12/2025', title: 'Aluguel', reajuste_index: 'IGPM', reajuste_proximo: '2026-11-01', current_value: 1500 };

    it('só reajustes chegou: ok com os reajustes, sem esperar os outros', () => {
        const r = alertasDasFontes({ reajustes: ok([reajuste]) });
        expect(r.estado).toBe('ok');
        expect(r.estado === 'ok' && r.data.map(a => a.id)).toEqual(['reajuste-c1']);
        expect(r.estado === 'ok' && r.data[0]).toMatchObject({ severity: 'MEDIUM', view: 'contracts-reajuste', title: 'Contrato 12/2025 com reajuste vencido', amount: 1500 });
    });

    it('nada chegou ainda: carregando', () => {
        expect(alertasDasFontes({})).toEqual({ estado: 'carregando' });
        expect(alertasDasFontes({ financial: caiu })).toEqual({ estado: 'carregando' });
    });

    it('todas caíram: erro', () => {
        expect(alertasDasFontes({ financial: caiu, divergences: caiu, bottlenecks: caiu, reajustes: caiu })).toEqual({ estado: 'erro' });
    });

    it('divergência zerada não vira alerta; valor divergente vira HIGH', () => {
        expect(alertasDasFontes({ divergences: ok(semDivergencia) })).toEqual({ estado: 'ok', data: [], faltou: [] });
        const r = alertasDasFontes({ divergences: ok({ as_of: HOJE, counts: { value_mismatch: 2, bank_without_internal: 0, internal_without_bank: 0 } } as never) });
        expect(r).toEqual({ estado: 'ok', faltou: [], data: [expect.objectContaining({ id: 'div-mismatch', severity: 'HIGH', title: '2 lançamento(s) com valor divergente', view: 'bank-reconciliation' })] });
    });

    // Revisão final (16/11): no plano B, o bloco que costuma cair é o dos alertas
    // financeiros (o mais pesado). Se outra fonte chegou, o cartão fica "ok" — e o
    // que caiu tem de aparecer no aviso da fila, senão o gestor conclui que não há alerta.
    it('fonte que caiu entra em `faltou`, com o nome que o aviso da fila mostra; a que ainda não chegou, não', () => {
        expect(alertasDasFontes({ financial: caiu, divergences: ok(semDivergencia), reajustes: caiu }))
            .toEqual({ estado: 'ok', data: [], faltou: ['alertas financeiros', 'reajustes de contrato'] });
        expect(alertasDasFontes({ divergences: caiu, bottlenecks: caiu, reajustes: ok([]) }))
            .toEqual({ estado: 'ok', data: [], faltou: ['divergências de conciliação', 'gargalos de processo'] });
    });

    // 17/11 (menores do #521): `forEach` em valor nulo lançava dentro do `load` — no
    // caminho normal nenhum cartão saía do esqueleto; no plano B o Atualizar travava.
    it('fonte que chega mas não monta (valor nulo) entra em `faltou` em vez de lançar', () => {
        const r = alertasDasFontes({ financial: ok(null as never), divergences: ok(semDivergencia), reajustes: ok([reajuste]) });
        expect(r).toEqual({ estado: 'ok', faltou: ['alertas financeiros'], data: [expect.objectContaining({ id: 'reajuste-c1' })] });
    });
});
