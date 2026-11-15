/**
 * Arquivo REAL do MS Project (obra Bella Vista, 2017; salvo como XML pelo Project 2016 em 15/11/2026).
 * Recursos, calendários de pessoas, autor e empresa foram tirados — só as tarefas importam aqui.
 * Pegou dois defeitos que o arquivo sintético não pegava (item 2e de
 * docs/planos/2026-11-14-planejamento-lista-critica.md):
 *  - o Project numera qualquer arquivo (1, 2, 2.1, 4.1.1…) e o número sozinho casava tarefa com
 *    item de outro orçamento;
 *  - tarefa sem custo sem referência no orçamento ia toda para um grupo só e a estrutura sumia.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { lerMsProjectXml } from '../utils/cronogramaLeitura';
import { casarComOrcamento, nomesCompativeis } from '../utils/cronogramaCasamento';
import { montarCronogramaImportado, type DecisaoDaTarefa } from '../utils/cronogramaMontagem';
import { SchedulingEngine } from '../utils/schedulingEngine';
import { getAncestors } from '../utils/scheduleOutline';
import type { BudgetEntry } from '../types';

const DIR = path.join(__dirname, 'fixtures', 'cronograma');
const cronograma = lerMsProjectXml(readFileSync(path.join(DIR, 'msproject-real-bella-vista.xml'), 'utf8'));
/** Orçamento de OUTRA obra — nada do Bella Vista deveria casar com ele. */
const outroOrcamento: BudgetEntry[] = JSON.parse(readFileSync(path.join(DIR, 'orcamento-divino.json'), 'utf8')).itens;

const tudoSemCusto = () => {
    const m = new Map<string, DecisaoDaTarefa>();
    for (const t of cronograma.tarefas) if (!t.resumo) m.set(t.chave, { tipo: 'sem-custo' });
    return m;
};
const montar = () => {
    let n = 0;
    return montarCronogramaImportado({
        cronograma, decisoes: tudoSemCusto(), orcamento: [], bdi: 25, nomeDoArquivo: 'CRONOGRAMA.xml',
        agora: '2026-11-15T12:00:00.000Z', gerarId: () => `g-${++n}`,
    });
};

describe('arquivo real do MS Project (Bella Vista)', () => {
    it('lê as tarefas: a linha vazia do Project (UID 1, sem nome) fica de fora', () => {
        expect(cronograma.tarefas.some(t => t.chave === '1')).toBe(false);
        expect(cronograma.tarefas.filter(t => !t.resumo)).toHaveLength(30);
        expect(cronograma.tarefas.filter(t => t.resumo && t.nivel === 1).map(t => t.nome))
            .toEqual(['Revestimento', 'Construção', 'Elétrica', 'Hidráulica', 'Pintura']);
        const piso = cronograma.tarefas.find(t => t.nome === 'Piso Hall')!;
        expect(piso).toMatchObject({ eap: '2.2', inicio: '2017-11-16', termino: '2017-11-17', duracaoDias: 2 });
        expect(piso.predecessoras).toEqual([{ chave: '3', tipo: 'FS', defasagemDias: 0 }]);
    });

    it('número de EAP igual com nome diferente NÃO casa — fica sem par, com aviso', () => {
        const { casamentos } = casarComOrcamento(cronograma, outroOrcamento);
        expect(casamentos.filter(c => c.itemId)).toEqual([]);
        const comAviso = casamentos.filter(c => c.mesmoNumeroOutroNome);
        expect(comAviso.length).toBeGreaterThan(0);
        expect(comAviso.map(c => c.tarefa.eap)).toContain('4.1.1');
    });

    it('tudo sem custo: o outline recria a estrutura do arquivo (grupo › etapa), nada no grupo avulso', () => {
        const { schedule } = montar();
        const outline = schedule.outline!;
        expect(outline.map(n => [n.type, n.name])).toEqual([
            ['group', 'Revestimento'], ['group', 'Construção'], ['group', 'Elétrica'], ['group', 'Hidráulica'], ['group', 'Pintura'],
        ]);
        const eletrica = outline.find(n => n.name === 'Elétrica')!;
        expect(eletrica.children!.map(n => [n.type, n.name])).toEqual([
            ['phase', 'Apartamentos'], ['phase', 'Garagem'], ['phase', 'Escadas'], ['phase', 'Elevador'], ['phase', 'Muros'], ['phase', 'Incêndio'],
        ]);
        const apartamentos = eletrica.children![0];
        expect(apartamentos.children!.map(n => [n.type, n.name])).toEqual([
            ['activity', 'Instalação interruptores e tomadas'], ['activity', 'Montagem paineis'], ['activity', 'instalação de luminárias'],
        ]);
        // As 4 "Instalação interruptores e tomadas" ficam cada uma no seu lugar.
        const homonimas = schedule.itemSchedules!.map(s => s.id).filter(id => getAncestors(outline, id).at(-1)?.name === 'Instalação interruptores e tomadas');
        expect(homonimas.map(id => getAncestors(outline, id)[1].name)).toEqual(['Apartamentos', 'Garagem', 'Escadas', 'Muros']);
    });

    it('o motor do cronograma não move nenhuma data do arquivo', () => {
        const { schedule } = montar();
        const calculado = SchedulingEngine.calculate(schedule.itemSchedules!, schedule.startDate, schedule.baselines![0], true);
        const antes = new Map(schedule.itemSchedules!.filter(s => s.startDate).map(s => [s.id, [s.startDate, s.endDate]]));
        expect(antes.size).toBe(30);
        for (const c of calculado) if (antes.has(c.id)) expect([c.startDate, c.endDate], c.id).toEqual(antes.get(c.id));
    });
});

describe('nomesCompativeis', () => {
    it('precisa de uma palavra significativa em comum; "instalação" sozinha não conta', () => {
        expect(nomesCompativeis('Estaca escavada', ['ESTACA ESCAVADA MECANICAMENTE, DIÂMETRO 30 CM'])).toBe(true);
        expect(nomesCompativeis('Instalação de luminárias', ['Instalação de tubulação de esgoto'])).toBe(false);
        expect(nomesCompativeis('Pintura externa - Muros', ['Fundação', 'Muros de divisa'])).toBe(true);
        expect(nomesCompativeis('', ['qualquer coisa'])).toBe(false);
    });
});
