import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { lerMsProjectXml } from '../utils/cronogramaLeitura';
import { casarComOrcamento } from '../utils/cronogramaCasamento';
import type { DecisaoDaTarefa } from '../utils/cronogramaMontagem';
import { aplicarAtualizacao, diferencasDaAtualizacao, avulsasDoOutline } from '../utils/cronogramaAtualizacao';
import { SchedulingEngine } from '../utils/schedulingEngine';
import { getAncestors } from '../utils/scheduleOutline';
import type { BudgetEntry, ProjectSchedule } from '../types';

// Planejamento "existente" = datas e avanço DO APP (gabarito.noApp) — o arquivo de teste é esse
// cronograma replanejado (3 itens atrasados 3 dias úteis, 3 avanços diferentes, 2 tarefas sem par).
const DIR = path.join(__dirname, 'fixtures', 'cronograma');
const gabarito = JSON.parse(readFileSync(path.join(DIR, 'gabarito.json'), 'utf8'));
const orcamento: BudgetEntry[] = JSON.parse(readFileSync(path.join(DIR, 'orcamento-divino.json'), 'utf8')).itens;
const cronograma = lerMsProjectXml(readFileSync(path.join(DIR, 'msproject-divino.xml'), 'utf8'));
const itensDoGabarito = gabarito.tarefas.filter((t: { origem: string }) => t.origem === 'item');

const BASELINE = { id: 'bl-antiga', name: 'Contrato', createdAt: '2026-07-01T00:00:00Z', itemDates: { x: { startDate: '2026-08-01', endDate: '2026-08-02' } } };
const existente = (): ProjectSchedule => ({
    startDate: '2026-08-01', endDate: '2026-12-02', duration: 5, periods: [], distributions: [],
    itemSchedules: itensDoGabarito.map((t: { itemId: string; noApp: { inicio: string; termino: string; duracao: number; percentual: number | null } }) => ({
        id: t.itemId, startDate: t.noApp.inicio, endDate: t.noApp.termino, duration: t.noApp.duracao,
        manualRealPct: t.noApp.percentual ?? 0, autoDuration: false,
    })),
    baselines: [BASELINE], activeBaselineId: BASELINE.id,
});
const decisoesDe = (schedule: ProjectSchedule) => {
    const m = new Map<string, DecisaoDaTarefa>();
    for (const c of casarComOrcamento(cronograma, orcamento, avulsasDoOutline(schedule.outline)).casamentos)
        m.set(c.tarefa.chave, c.itemId ? { tipo: 'item', itemId: c.itemId } : { tipo: 'sem-custo' });
    return m;
};
let n = 0;
const aplicar = (schedule: ProjectSchedule, trocarAvanco = new Set<string>()) =>
    aplicarAtualizacao({ schedule, orcamento, cronograma, decisoes: decisoesDe(schedule), trocarAvanco, gerarId: () => `novo-${++n}` });
const chaveDe = (eapPrefixo: string) => cronograma.tarefas.find(t => t.eap.startsWith(eapPrefixo) && !t.resumo)!.chave;

describe('diferencasDaAtualizacao', () => {
    it('mostra exatamente as 3 tarefas replanejadas e os 3 avanços diferentes', () => {
        const dif = [...diferencasDaAtualizacao(cronograma, decisoesDe(existente()), existente()).values()];
        const replanejadas = itensDoGabarito.filter((t: { muda: { datas: boolean } }) => t.muda.datas).map((t: { itemId: string }) => t.itemId).sort();
        expect(dif.filter(d => d.mudaDatas).map(d => d.id).sort()).toEqual(replanejadas);
        expect(dif.filter(d => d.mudaPercentual)).toHaveLength(3);
    });
});

describe('aplicarAtualizacao', () => {
    it('limpa as datas do cálculo anterior do motor (early/late) — a lista lê earlyFinish antes do endDate', () => {
        // 2ª crítica, 15/11/2026: sem limpar, o término velho seguia na lista até reabrir o planejamento.
        const comCalculo = existente();
        comCalculo.itemSchedules = comCalculo.itemSchedules!.map(s => ({ ...s, earlyStart: '2020-01-01', earlyFinish: '2020-01-02', lateStart: '2020-01-01', lateFinish: '2020-01-02' }));
        const r = aplicar(comCalculo);
        const replanejada = itensDoGabarito.find((t: { muda: { datas: boolean } }) => t.muda.datas).itemId;
        const s = r.schedule.itemSchedules!.find(x => x.id === replanejada)! as Record<string, unknown>;
        expect(s.earlyFinish).toBeUndefined();
        expect(s.lateStart).toBeUndefined();
        expect(s.endDate).toBeTruthy();
    });

    it('troca as datas das replanejadas; o avanço fica como estava (nada marcado)', () => {
        const r = aplicar(existente());
        expect(r.contagem).toMatchObject({ datasTrocadas: 3, avancosTrocados: 0, novasSemCusto: 2, ignoradas: 0 });
        const porId = new Map(r.schedule.itemSchedules!.map(s => [s.id, s]));
        for (const g of itensDoGabarito) {
            const s = porId.get(g.itemId)!;
            expect([s.startDate, s.endDate], g.nome).toEqual([g.importadoNoApp.inicio, g.importadoNoApp.termino]);
            expect(s.manualRealPct, g.nome).toBe(g.noApp.percentual ?? 0);
        }
    });

    it('avanço marcado troca só naquela tarefa (Terraplanagem 80 → 100)', () => {
        const terra = chaveDe('03.01.01');
        const r = aplicar(existente(), new Set([terra]));
        expect(r.contagem.avancosTrocados).toBe(1);
        const id = itensDoGabarito.find((t: { eap: string }) => t.eap.startsWith('03.01.01')).itemId;
        expect(r.schedule.itemSchedules!.find(s => s.id === id)!.manualRealPct).toBe(100);
    });

    it('a linha de base não muda', () => {
        const r = aplicar(existente());
        expect(r.schedule.baselines).toEqual([BASELINE]);
        expect(r.schedule.activeBaselineId).toBe(BASELINE.id);
    });

    it('item do orçamento fora do arquivo fica intacto', () => {
        const fora = gabarito.foraDoArquivo[0].itemId;
        const antes = existente().itemSchedules!.find(s => s.id === fora);
        const depois = aplicar(existente()).schedule.itemSchedules!.find(s => s.id === fora);
        expect(depois).toEqual(antes ?? depois);
    });

    it('tarefas sem custo novas entram no outline (que nasce da EAP do orçamento) no grupo certo', () => {
        const r = aplicar(existente());
        const avulsas = avulsasDoOutline(r.schedule.outline);
        expect(avulsas.map(a => a.nome)).toEqual(['Mobilização do canteiro', 'Aprovação do projeto na prefeitura']);
        for (const a of avulsas) expect(getAncestors(r.schedule.outline!, a.id)[0].name).toMatch(/SERVIÇOS INICIAIS/);
    });

    it('reimportar o mesmo arquivo não duplica as tarefas sem custo nem muda mais nada', () => {
        const primeira = aplicar(existente());
        const segunda = aplicar(primeira.schedule);
        expect(segunda.contagem).toMatchObject({ datasTrocadas: 0, novasSemCusto: 0 });
        expect(avulsasDoOutline(segunda.schedule.outline)).toHaveLength(2);
        expect(segunda.schedule.itemSchedules).toHaveLength(primeira.schedule.itemSchedules!.length);
    });

    it('o motor do cronograma (que roda ao abrir) não move nenhuma data depois da atualização', () => {
        const { schedule } = aplicar(existente());
        const calculado = SchedulingEngine.calculate(schedule.itemSchedules!, schedule.startDate, undefined, true);
        const antes = new Map(schedule.itemSchedules!.filter(s => s.startDate).map(s => [s.id, [s.startDate, s.endDate]]));
        for (const c of calculado) if (antes.has(c.id)) expect([c.startDate, c.endDate], c.id).toEqual(antes.get(c.id));
    });

    it('arquivo que começa antes recua o início do cronograma (a Mobilização é em julho)', () => {
        expect(aplicar(existente()).schedule.startDate).toBe('2026-07-24');
    });
});
