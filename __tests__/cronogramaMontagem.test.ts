import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { lerMsProjectXml } from '../utils/cronogramaLeitura';
import { casarComOrcamento } from '../utils/cronogramaCasamento';
import { montarCronogramaImportado, somarDiasUteis, diasUteisInclusive, valorPlanejado, type DecisaoDaTarefa } from '../utils/cronogramaMontagem';
import { SchedulingEngine } from '../utils/schedulingEngine';
import { indicadoresDePrazo, folhasDoOrcamento } from '../utils/planejamentoIndicadores';
import { getAncestors } from '../utils/scheduleOutline';
import type { BudgetEntry } from '../types';

const DIR = path.join(__dirname, 'fixtures', 'cronograma');
const gabarito = JSON.parse(readFileSync(path.join(DIR, 'gabarito.json'), 'utf8'));
const orcamento: BudgetEntry[] = JSON.parse(readFileSync(path.join(DIR, 'orcamento-divino.json'), 'utf8')).itens;
const cronograma = lerMsProjectXml(readFileSync(path.join(DIR, 'msproject-divino.xml'), 'utf8'));

/** Decisões como a prévia propõe: casadas → item; sem par → o que o teste mandar. */
const decisoesPadrao = (semPar: DecisaoDaTarefa = { tipo: 'sem-custo' }) => {
    const m = new Map<string, DecisaoDaTarefa>();
    for (const c of casarComOrcamento(cronograma, orcamento).casamentos) m.set(c.tarefa.chave, c.itemId ? { tipo: 'item', itemId: c.itemId } : semPar);
    return m;
};
const montar = (decisoes = decisoesPadrao()) => {
    let n = 0;
    return montarCronogramaImportado({
        cronograma, decisoes, orcamento, bdi: 25, nomeDoArquivo: 'msproject-divino.xml',
        agora: '2026-11-15T12:00:00.000Z', gerarId: () => `gerado-${++n}`,
    });
};

describe('montarCronogramaImportado — criar a partir do arquivo', () => {
    it('conta: 36 itens, 2 sem custo, nada ignorado, 1 item do orçamento sem tarefa', () => {
        expect(montar().contagem).toEqual({ itens: 36, semCusto: 2, ignoradas: 0, itensDoOrcamentoSemTarefa: 1 });
    });

    it('datas no app = início do arquivo + Duration (convenção do motor) — batem com o gabarito', () => {
        const porId = new Map(montar().schedule.itemSchedules!.map(s => [s.id, s]));
        for (const g of gabarito.tarefas.filter((t: { origem: string }) => t.origem === 'item')) {
            const s = porId.get(g.itemId)!;
            expect({ inicio: s.startDate, termino: s.endDate, duracao: s.duration }, g.nome).toEqual(g.importadoNoApp);
            expect(s.manualRealPct).toBe(g.percentual);
        }
    });

    it('sem replanejamento, a ida e volta app → arquivo → app devolve as mesmas datas', () => {
        const porId = new Map(montar().schedule.itemSchedules!.map(s => [s.id, s]));
        const iguais = gabarito.tarefas.filter((t: { origem: string; muda?: { datas: boolean } }) => t.origem === 'item' && !t.muda!.datas);
        expect(iguais.length).toBe(33);
        for (const g of iguais) expect([porId.get(g.itemId)!.startDate, porId.get(g.itemId)!.endDate]).toEqual([g.noApp.inicio, g.noApp.termino]);
    });

    it('cada tarefa com data leva restrição MSO no início (o motor não move a data do arquivo)', () => {
        const comData = montar().schedule.itemSchedules!.filter(s => s.startDate);
        expect(comData.length).toBe(38);
        expect(comData.every(s => s.constraintType === 'MSO' && s.constraintDate === s.startDate && s.autoDuration === false)).toBe(true);
    });

    it('o item do orçamento fora do arquivo entra sem datas', () => {
        const fora = gabarito.foraDoArquivo[0].itemId;
        const s = montar().schedule.itemSchedules!.find(x => x.id === fora)!;
        expect(s.startDate).toBeUndefined();
    });

    it('tarefas sem custo viram activity no grupo do arquivo (SERVIÇOS INICIAIS), marco com duração 0', () => {
        const { schedule } = montar();
        const ids = ['gerado-1', 'gerado-2'];
        for (const id of ids) {
            const cadeia = getAncestors(schedule.outline!, id);
            expect(cadeia.map(n => n.type)).toEqual(['group', 'activity']);
            expect(cadeia[0].name).toMatch(/SERVIÇOS INICIAIS/);
        }
        const marco = schedule.itemSchedules!.find(s => s.id === 'gerado-2')!;
        expect(marco).toMatchObject({ isMilestone: true, duration: 0, startDate: '2026-07-31', endDate: '2026-07-31' });
    });

    it('predecessoras viram vínculos entre ids do app (Terraplanagem ← Mobilização, sem custo)', () => {
        const { schedule } = montar();
        const terra = gabarito.tarefas.find((t: { eap: string }) => t.eap.startsWith('03.01.01'));
        const s = schedule.itemSchedules!.find(x => x.id === terra.itemId)!;
        expect(s.predecessors).toContainEqual({ id: 'gerado-1', type: 'FS', lag: 0 });
        const total = schedule.itemSchedules!.reduce((n, x) => n + (x.predecessors?.length ?? 0), 0);
        expect(total).toBe(19);
    });

    it('linha de base ativa com as datas do arquivo', () => {
        const { schedule } = montar();
        const b = schedule.baselines![0];
        expect(schedule.activeBaselineId).toBe(b.id);
        expect(Object.keys(b.itemDates)).toHaveLength(38);
        expect(b.itemData!['gerado-1'].plannedValue).toBe(0);
    });

    it('recém-importado não tem desvio de custo: valor da linha de base = cascata do app (15/11/2026)', () => {
        // O app compara plannedValue ?? totalLaborCost ?? total do orçamento com a linha de base.
        // Antes, os itens casados não tinham totalLaborCost (padrão do ensureFullScheduleList) e a
        // linha de base guardava o total do orçamento: abriu com "desvio de custo −R$ 416 mil".
        const { schedule } = montar();
        const b = schedule.baselines![0];
        const porId = new Map(orcamento.map(x => [x.id, x]));
        for (const s of schedule.itemSchedules!) {
            if (porId.has(s.id)) expect(s.totalLaborCost, s.id).toBeDefined();
            expect(b.itemData![s.id].plannedValue).toBe(valorPlanejado(s, porId.get(s.id), 25));
        }
    });

    it('o motor do cronograma (que roda ao abrir o planejamento) não move nenhuma data do arquivo', () => {
        // Medido em 15/11/2026: com uma predecessora que o arquivo não respeitava, abrir empurrou o
        // término 2 dias. Arquivo consistente (como o Project grava) → o motor não mexe em nada.
        const { schedule } = montar();
        const calculado = SchedulingEngine.calculate(schedule.itemSchedules!, schedule.startDate, schedule.baselines![0], true);
        const antes = new Map(schedule.itemSchedules!.filter(s => s.startDate).map(s => [s.id, [s.startDate, s.endDate]]));
        for (const c of calculado) {
            if (!antes.has(c.id)) continue;
            expect([c.startDate, c.endDate], c.id).toEqual(antes.get(c.id));
        }
    });

    it('ignorar a Mobilização tira a tarefa e o vínculo, com aviso', () => {
        const r = montar(decisoesPadrao({ tipo: 'ignorar' }));
        expect(r.contagem).toMatchObject({ semCusto: 0, ignoradas: 2 });
        expect(r.avisos.some(a => /Mobilização do canteiro.*ficou de fora/.test(a))).toBe(true);
        expect(r.schedule.itemSchedules!.some(s => s.id.startsWith('gerado-') && s.startDate)).toBe(false);
    });

    it('casar a Mobilização com um item já usado por outra tarefa não duplica o item', () => {
        const d = decisoesPadrao();
        const mob = cronograma.tarefas.find(t => t.nome === 'Mobilização do canteiro')!;
        const jaUsado = [...d.values()].find(x => x.tipo === 'item') as { tipo: 'item'; itemId: string };
        d.set(mob.chave, { tipo: 'item', itemId: jaUsado.itemId });
        const r = montar(d);
        expect(r.avisos.some(a => /já está em outra tarefa/.test(a))).toBe(true);
        expect(r.schedule.itemSchedules!.filter(s => s.id === jaUsado.itemId)).toHaveLength(1);
    });

    it('o resultado serve aos indicadores de prazo do item 1 (lista e Central de Comando)', () => {
        const { schedule } = montar();
        const ind = indicadoresDePrazo(folhasDoOrcamento(orcamento), schedule, '2026-11-15');
        expect(ind.temDatas).toBe(true);
        expect(ind.fimBaseline).toBe(ind.fimPrevisto);   // acabou de importar: sem desvio
        expect(ind.desvioDias).toBe(0);
        expect(ind.avancoFisicoPct).toBeGreaterThan(0);
    });
});

describe('calendário seg–sex', () => {
    it('somarDiasUteis e diasUteisInclusive', () => {
        expect(somarDiasUteis('2026-09-04', 1)).toBe('2026-09-07');   // sex + 1 = seg
        expect(somarDiasUteis('2026-09-04', 0)).toBe('2026-09-04');
        expect(diasUteisInclusive('2026-09-04', '2026-09-07')).toBe(2);
        expect(diasUteisInclusive('2026-09-05', '2026-09-05')).toBe(1); // sábado sozinho: mínimo 1
    });
});
