import { describe, it, expect } from 'vitest';

/**
 * Fase 6 do plano docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md (pedido do
 * usuário, 15/11: congelar também o resultado do cálculo): a versão guarda os números já
 * calculados — indicadores, dados dos gráficos, capa e seções do relatório — e o painel e o PDF
 * leem deles, sem recalcular. Uma correção futura do motor não muda o que o investidor já recebeu.
 */
import { calculoDaVersao, indicadoresDoEstudo, graficosDoEstudo, VERSAO_DO_CALCULO } from '../utils/imovibCalculoDaVersao';
import { resultadosDoEstudo } from '../utils/imovibVersoes';
import { secoesDoRelatorio, capaDoRelatorio } from '../utils/imovibRelatorio';
import { computeImovibMath } from '../utils/imovibMotor';
import { fluxoAnual } from '../utils/imovibGraficos';
import { baseStudy } from './fixtures/imovibEstudos';

const cenarios = [{ id: 'c1', study_id: 'e', name: 'Pessimista', kind: 'pessimista', choques: { preco: -10 }, sort_order: 0 }] as never[];
const dados = () => ({
    study: baseStudy({ recommendation: 'aprovar', recommendation_notes: 'interno' }) as never,
    comparaveis: [], riscos: [], cenarios, dueDiligence: [], socios: [], hoje: '2026-11-15',
});
const versao = { label: 'Comitê', created_at: '2026-11-15T13:40:00Z' };

describe('cálculo congelado na versão', () => {
    it('indicadores do painel = os da versão (ResultadosDaVersao)', () => {
        const d = dados();
        const ind = indicadoresDoEstudo(d.study);
        const r = resultadosDoEstudo(d.study);
        expect(ind.vpl).toBe(r.vpl);
        expect(ind.tirAnual).toBe(r.tirAnual);
        expect(ind.exposicaoMaxima).toBe(r.exposicaoMaxima);
        expect(ind.vgv).toBe(r.vgv);
        expect(ind.payback).toMatch(/Mês|Sem/);
    });

    it('dados dos gráficos = os que a tela calcula ao vivo', () => {
        const d = dados();
        const g = graficosDoEstudo(d.study, cenarios);
        const r = computeImovibMath(d.study);
        expect(g.curvaS).toHaveLength(r.monthlyFlows.length);
        expect(g.curvaS[0]).toEqual({ name: r.monthlyFlows[0].name, net: r.monthlyFlows[0].net, acc: r.monthlyFlows[0].acc });
        expect(g.fluxoAnual).toEqual(fluxoAnual(r.monthlyFlows));
        expect(g.cenarios.map(c => c.nome)).toEqual(['Estudo', 'Pessimista']);
        expect(g.tornado.length).toBeGreaterThan(0);
    });

    it('investidor: capa e seções sem parecer; interna à parte, com parecer', () => {
        const c = calculoDaVersao(dados(), versao);
        expect(c.versaoDoCalculo).toBe(VERSAO_DO_CALCULO);
        expect(c.investidor.secoes).toEqual(secoesDoRelatorio(dados(), { edicao: 'investidor', versao }));
        expect(c.investidor.capa).toEqual(capaDoRelatorio(dados(), { edicao: 'investidor', versao }));
        expect(JSON.stringify(c.investidor)).not.toMatch(/Parecer|interno/);
        expect(c.interno.secoes.find(s => s.id === 'capa')!.paragrafos.join(' ')).toContain('Parecer: Aprovar');
    });

    it('sobrevive ao JSON do banco sem mudar (nada de NaN nem undefined)', () => {
        const c = calculoDaVersao(dados(), versao);
        expect(JSON.parse(JSON.stringify(c))).toEqual(c);
    });
});
