/**
 * Contas puras da prévia do Credit Room: versão de tela, simulação de
 * parâmetros (sem reler o banco) e comparação com a última liberada.
 *
 * Protege: simular os MESMOS parâmetros reproduz a série e o valor máximo; com
 * proposta de dívida vinculada o serviço novo (cronograma real) NÃO é refeito
 * com os parâmetros simulados; sem proposta ele é refeito com o 1º vencimento
 * no 1º mês da série; dado ausente é `null`, não zero.
 */
import { describe, expect, it } from 'vitest';
import type { CreditRoomVersion } from '../types/creditRoom';
import type { VersaoPreparada } from '../services/creditRoomService';
import { buildSnapshot, computeIndicators, type SnapshotCapacidade } from '../utils/creditRoomSnapshot';
import { buildSchedule } from '../utils/debtAmortization';
import {
    PARAMETROS_CAPACIDADE_PADRAO, montarCapacidade,
    type FluxosElegiveis, type MontarCapacidadeEntrada, type TituloCarteira,
} from '../utils/creditCapacity';
import { ID_DA_PREVIA, compararComLiberada, ehPrevia, simularParametros, versaoDaPrevia } from '../utils/creditRoomPrevia';

const DATA_BASE = '2026-11-21';
const FLUXOS: FluxosElegiveis = { vendas: true, alugueis: true };
const PEDIDO = 500_000;
const P = { ...PARAMETROS_CAPACIDADE_PADRAO, horizonte_meses: 24, prazo_meses: 36 };

/** Título de venda de R$ 40 mil vencendo no `i`-ésimo mês depois da data-base. */
const titulo = (i: number): TituloCarteira => {
    const idx = 2026 * 12 + 10 + i; // nov/26 = 2026*12 + 10
    const ano = Math.floor(idx / 12);
    const mes = (idx % 12) + 1;
    return {
        id: `t${i}`, organizationId: 'o1', contractId: 'c', natureza: 'VENDA', empreendimentoId: 'e1',
        partyKey: 'p', dueDate: `${ano}-${String(mes).padStart(2, '0')}-10`,
        paymentDate: null, amount: 40_000, recebido: false,
    };
};

/** Série de 24 meses (dez/26 em diante) com o serviço novo informado. */
const nova = (servicoNovo: Record<string, number>): SnapshotCapacidade => {
    const e: MontarCapacidadeEntrada = {
        fonte: 'teste', dataBase: DATA_BASE, horizonte: 24, parametros: P, fluxos: FLUXOS,
        primeiroVencimento: '2026-12-01', orgs: ['o1'],
        titulos: [], titulosDoEscopo: Array.from({ length: 24 }, (_, i) => titulo(i + 1)), locacoesDoEscopo: [],
        despesaMensal: 0, despesaPorOrg: [0], servicoAtualPorMes: { '2026-12': 3_000, '2027-01': 3_000 },
        servicoAtualPorOrg: [{}], servicoNovoPorMes: servicoNovo, vendasSemTitulo: [],
        empreendimentos: [{ vgv_disponivel: 1_000_000, objetivo: 'VENDAS' }], dividaTotalPorOrg: [0],
    };
    return montarCapacidade(e);
};

/** O serviço novo do pedido por mês — a mesma conta do congelamento sem proposta. */
const porMes = (p = P): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const l of buildSchedule({
        principal: PEDIDO, nominalRate: p.taxa_mensal_pct, ratePeriod: 'MENSAL', system: p.sistema,
        installmentCount: p.prazo_meses, installmentPeriod: 'MENSAL', firstDueDate: '2026-12-01',
        gracePrincipalPeriods: p.carencia_meses,
    })) {
        const mes = l.dueDate.slice(0, 7);
        out[mes] = Math.round(((out[mes] ?? 0) + l.total) * 100) / 100;
    }
    return out;
};

/** O congelamento montou o serviço novo com `buildSchedule` (sem proposta, ou proposta sem cronograma). */
const simulado = { requestedAmount: PEDIDO, servicoNovoSimulado: true, fluxos: FLUXOS };

const versao = (cap: SnapshotCapacidade | null, extra: { nEmp?: number | null; nCont?: number | null } = {}): CreditRoomVersion => {
    const snapshot = buildSnapshot({
        dataBase: DATA_BASE,
        operacao: {
            requestedAmount: PEDIDO, modality: 'Financiamento',
            eligibleFlows: { noi: true, receivables: true, operating_cash: false },
            guarantees: [], equityCommitted: 0, equityContributed: 0,
        },
        documentVersionIds: ['d1', 'd2'],
        ...(cap ? { capacidade: cap } : {}),
        empreendimentos: extra.nEmp == null ? null : Array.from({ length: extra.nEmp }, () => ({}) as never),
        contratos: extra.nCont == null ? null : Array.from({ length: extra.nCont }, () => ({}) as never),
    });
    return {
        id: 'v1', organizationId: 'o1', creditRoomId: 'r1', versionNo: 1, dataBase: DATA_BASE,
        snapshot, indicators: computeIndicators(snapshot), documentVersionIds: ['d1', 'd2'], frozenAt: '2026-11-22T10:00:00Z',
    };
};

describe('versaoDaPrevia / ehPrevia', () => {
    it('mantém snapshot e indicadores, versionNo 0, label Prévia, frozenAt = calculada em', () => {
        const v = versao(nova(porMes()));
        const prep: VersaoPreparada = { roomId: 'r9', dataBase: DATA_BASE, snapshot: v.snapshot, indicators: v.indicators, servicoNovoSimulado: true };
        const pv = versaoDaPrevia(prep, '2026-11-22T12:00:00Z', 'o9');
        expect(pv.snapshot).toBe(v.snapshot);
        expect(pv.indicators).toBe(v.indicators);
        expect(pv).toMatchObject({
            id: ID_DA_PREVIA, organizationId: 'o9', versionNo: 0, label: 'Prévia', creditRoomId: 'r9', dataBase: DATA_BASE,
            frozenAt: '2026-11-22T12:00:00Z', documentVersionIds: ['d1', 'd2'],
        });
        expect(ehPrevia(pv)).toBe(true);
        expect(ehPrevia(v)).toBe(false);
        expect(ehPrevia(null)).toBe(false);
        expect(ehPrevia(undefined)).toBe(false);
    });
});

describe('simularParametros', () => {
    it('mesmos parâmetros, sem proposta: mesma série e mesma capacidade máxima (identidade)', () => {
        const c = nova(porMes());
        const s = simularParametros(c, P, simulado);
        expect(s.serie).toEqual(c.serie);
        expect(s.capacidade_maxima).toEqual(c.capacidade_maxima);
        expect(s.parametros).toEqual(c.parametros);
        expect(c.capacidade_maxima.valor_maximo).toBeGreaterThan(0);
    });

    it('taxa maior → valor máximo menor; prazo maior → maior', () => {
        const c = nova(porMes());
        const base = c.capacidade_maxima.valor_maximo;
        expect(simularParametros(c, { ...P, taxa_mensal_pct: 2.5 }, simulado).capacidade_maxima.valor_maximo).toBeLessThan(base);
        expect(simularParametros(c, { ...P, prazo_meses: 48 }, simulado).capacidade_maxima.valor_maximo).toBeGreaterThan(base);
    });

    it('(a) cronograma real da proposta (servicoNovoSimulado false): o servico_novo de cada mês não muda (cronograma real), mas a capacidade reconta', () => {
        const real = { '2026-12': 7_777, '2027-01': 7_777, '2027-02': 7_777 };
        const c = nova(real);
        const s = simularParametros(c, { ...P, taxa_mensal_pct: 2.5, prazo_meses: 48 }, { ...simulado, servicoNovoSimulado: false });
        expect(s.serie.map(m => m.servico_novo)).toEqual(c.serie.map(m => m.servico_novo));
        expect(s.serie).toEqual(c.serie);
        expect(s.parametros.taxa_mensal_pct).toBe(2.5);
        expect(s.capacidade_maxima).not.toEqual(c.capacidade_maxima);
    });

    it('(c) simulado (sem proposta ou proposta sem cronograma): o servico_novo muda com a taxa e o 1º vencimento é o 1º mês da série', () => {
        const c = nova(porMes());
        const p2 = { ...P, taxa_mensal_pct: 2.5 };
        const s = simularParametros(c, p2, simulado);
        expect(s.serie.map(m => m.servico_novo)).not.toEqual(c.serie.map(m => m.servico_novo));
        const esperado = porMes(p2);
        expect(s.serie[0].mes).toBe('2026-12');
        expect(s.serie[0].servico_novo).toBe(esperado['2026-12']);
        expect(s.serie.every(m => m.servico_novo === (esperado[m.mes] ?? 0))).toBe(true);
        // A renda e o serviço atual seguem intactos; folga e DSCR acompanham o serviço novo.
        expect(s.serie.map(m => m.renda_liquida)).toEqual(c.serie.map(m => m.renda_liquida));
        expect(s.serie.map(m => m.servico_atual)).toEqual(c.serie.map(m => m.servico_atual));
        expect(s.serie[0].folga).toBe(Math.round((s.serie[0].renda_liquida - s.serie[0].servico_atual - s.serie[0].servico_novo) * 100) / 100);
    });

    it('(b) proposta já na curva (servico_novo todo zero, servicoNovoSimulado false): taxa/prazo não criam serviço novo, só reconta a capacidade', () => {
        const c = nova({});
        expect(c.serie.every(m => m.servico_novo === 0)).toBe(true);
        const s = simularParametros(c, { ...P, taxa_mensal_pct: 2.5, prazo_meses: 48 }, { ...simulado, servicoNovoSimulado: false });
        expect(s.serie.every(m => m.servico_novo === 0)).toBe(true);
        expect(s.serie).toEqual(c.serie);
        expect(s.capacidade_maxima).not.toEqual(c.capacidade_maxima);
        // Contraprova: com a flag errada (true) a dívida da proposta seria inventada.
        expect(simularParametros(c, P, simulado).serie.some(m => m.servico_novo > 0)).toBe(true);
    });

    it('parâmetros gravados não afirmam o que a série não reflete: despesa_operacional e horizonte ficam os da série', () => {
        const c = nova(porMes());
        const s = simularParametros(c, { ...P, despesa_operacional: !P.despesa_operacional, horizonte_meses: 60 }, simulado);
        expect(s.parametros.despesa_operacional).toBe(c.parametros.despesa_operacional);
        expect(s.parametros.horizonte_meses).toBe(c.parametros.horizonte_meses);
    });

    it('sem valor pedido, simulado: serviço novo zero (não inventa dívida)', () => {
        const s = simularParametros(nova(porMes()), P, { ...simulado, requestedAmount: 0 });
        expect(s.serie.every(m => m.servico_novo === 0)).toBe(true);
    });

    it('haircut simulado recalcula o estoque elegível; sem estoque segue null; horizonte fica o da série', () => {
        const c = nova(porMes());
        const s = simularParametros(c, { ...P, haircut_estoque_pct: 50, horizonte_meses: 60 }, simulado);
        expect(s.estoque).toEqual({ vgv_disponivel: 1_000_000, haircut_pct: 50, valor_elegivel: 500_000 });
        expect(s.parametros.horizonte_meses).toBe(24);
        expect(simularParametros({ ...c, estoque: null }, P, simulado).estoque).toBeNull();
    });

    it('não muda a entrada e aguenta série vazia', () => {
        const c = nova(porMes());
        const antes = structuredClone(c);
        simularParametros(c, { ...P, taxa_mensal_pct: 3 }, simulado);
        expect(c).toEqual(antes);
        const vazia = simularParametros({ ...c, serie: [] }, P, simulado);
        expect(vazia.capacidade_maxima).toEqual({ parcela_maxima: 0, valor_maximo: 0 });
    });
});

describe('compararComLiberada', () => {
    it('sem liberada: todos os campos com antes null', () => {
        const c = nova(porMes());
        const d = compararComLiberada(versao(c, { nEmp: 2, nCont: 3 }), null);
        expect(d.map(x => x.campo)).toEqual(['valor_maximo', 'dscr_minimo_12m', 'renda_liquida_media_12m', 'n_empreendimentos', 'n_contratos']);
        expect(d.every(x => x.antes === null)).toBe(true);
        expect(d.find(x => x.campo === 'n_empreendimentos')?.depois).toBe(2);
        expect(d.find(x => x.campo === 'valor_maximo')?.depois).toBe(c.capacidade_maxima.valor_maximo);
    });

    it('liberada igual: lista vazia', () => {
        const c = nova(porMes());
        expect(compararComLiberada(versao(c, { nEmp: 2, nCont: 3 }), versao(structuredClone(c), { nEmp: 2, nCont: 3 }))).toEqual([]);
    });

    it('só volta o que difere', () => {
        const c = nova(porMes());
        const sim = simularParametros(c, { ...P, taxa_mensal_pct: 2.5 }, simulado);
        const d = compararComLiberada(versao(sim, { nEmp: 4, nCont: 3 }), versao(c, { nEmp: 2, nCont: 3 }));
        const campos = d.map(x => x.campo);
        expect(campos).toContain('valor_maximo');
        expect(campos).toContain('n_empreendimentos');
        expect(campos).not.toContain('n_contratos');
        expect(d.find(x => x.campo === 'n_empreendimentos')).toEqual({ campo: 'n_empreendimentos', antes: 2, depois: 4 });
        const vm = d.find(x => x.campo === 'valor_maximo')!;
        expect(vm.antes).toBe(c.capacidade_maxima.valor_maximo);
        expect(vm.depois).toBe(sim.capacidade_maxima.valor_maximo);
    });

    it('lista ausente é null (≠ zero): versão sem lista vs. prévia com zero itens difere', () => {
        const c = nova(porMes());
        const d = compararComLiberada(versao(c, { nEmp: 0, nCont: 0 }), versao(c, { nEmp: null, nCont: null }));
        expect(d).toEqual([
            { campo: 'n_empreendimentos', antes: null, depois: 0 },
            { campo: 'n_contratos', antes: null, depois: 0 },
        ]);
    });

    it('versão sem capacidade: números de capacidade null, não zero', () => {
        const d = compararComLiberada(versao(null, { nEmp: 1, nCont: 1 }), null);
        expect(d.find(x => x.campo === 'valor_maximo')?.depois).toBeNull();
        expect(d.find(x => x.campo === 'dscr_minimo_12m')?.depois).toBeNull();
    });
});
