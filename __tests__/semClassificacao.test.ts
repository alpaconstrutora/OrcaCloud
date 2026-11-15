/**
 * "Sem Classificação" lançamento a lançamento — a MESMA regra do LEFT JOIN de
 * fn_dre_summary (plano docs/planos/2026-11-14-controladoria-critica.md, passo 3).
 * Medido em produção (14/11/2026, 2026, Caixa): R$ 6.970,83 sem categoria vinculada
 * + R$ 648,40 de "Adiantamento" sem grupo = os −R$ 7.619,23 da linha da DRE.
 */
import { describe, it, expect, vi } from 'vitest';
vi.mock('../lib/supabase', () => ({ supabase: {} }));
import { separarSemClassificacao, type LinhaDaView, type CategoriaDoPlano } from '../services/semClassificacaoService';

const cat = (id: string, name: string, org: string | null, grupo: string | null): CategoriaDoPlano =>
    ({ id, name, organization_id: org, dre_group: grupo });

const linha = (p: Partial<LinhaDaView>): LinhaDaView => ({
    id: 'it-1', organization_id: 'org-a', project_id: null, direction: 'DEBIT', status: 'CONCILIATED',
    transaction_date: '2026-03-10', competencia_date: null, category: null, category_id_dre: null,
    amount_dre: 100, parte_juros: false, ...p,
});

const PLANO = [
    cat('c-mat', 'Material', 'org-a', 'CUSTO_OBRA'),
    cat('c-adt', 'Adiantamento', 'org-a', 'SEM_CLASSIFICACAO'),
    cat('c-sem', 'Diversos', 'org-a', null),
];

describe('separarSemClassificacao', () => {
    it('categoria pelo id com grupo de resultado NÃO entra', () => {
        expect(separarSemClassificacao([linha({ category_id_dre: 'c-mat' })], PLANO, 'CAIXA')).toEqual([]);
    });

    it('sem id, acha pelo NOME na organização do lançamento (fallback da DRE)', () => {
        expect(separarSemClassificacao([linha({ category: ' material ' })], PLANO, 'CAIXA')).toEqual([]);
    });

    it('nome que só existe em OUTRA organização não serve: categoria inexistente', () => {
        const r = separarSemClassificacao([linha({ organization_id: 'org-b', category: 'Material' })], PLANO, 'CAIXA');
        expect(r).toHaveLength(1);
        expect(r[0].motivo).toBe('categoria_inexistente');
        expect(r[0].categoria).toBe('Material');
    });

    it('os três motivos', () => {
        const r = separarSemClassificacao([
            linha({ id: 'a' }),                                  // nada
            linha({ id: 'b', category: 'Folha de Pagamento' }), // nome sem cadastro
            linha({ id: 'c', category_id_dre: 'c-adt' }),       // grupo SEM_CLASSIFICACAO
            linha({ id: 'd', category_id_dre: 'c-sem' }),       // grupo nulo
        ], PLANO, 'CAIXA');
        const porId = Object.fromEntries(r.map(i => [i.id, i.motivo]));
        expect(porId).toEqual({
            a: 'sem_categoria', b: 'categoria_inexistente', c: 'categoria_sem_grupo', d: 'categoria_sem_grupo',
        });
    });

    it('Caixa: só o conciliado é realizado; o total realizado bate com a linha da DRE', () => {
        const r = separarSemClassificacao([
            linha({ id: 'a', amount_dre: 6970.83 }),
            linha({ id: 'b', category_id_dre: 'c-adt', amount_dre: 648.40 }),
            linha({ id: 'c', status: 'PENDING', amount_dre: 31742.95 }),
        ], PLANO, 'CAIXA');
        const realizado = r.filter(i => i.realizado).reduce((s, i) => s + i.valor, 0);
        expect(realizado).toBeCloseTo(-7619.23, 2);
        expect(r.find(i => i.id === 'c')!.realizado).toBe(false);
    });

    it('Competência: tudo que não é cancelado é realizado, na data de competência', () => {
        const r = separarSemClassificacao([
            linha({ status: 'PENDING', competencia_date: '2026-02-28' }),
            linha({ id: 'x', status: 'CANCELLED' }),
        ], PLANO, 'COMPETENCIA');
        expect(r).toHaveLength(1);
        expect(r[0].realizado).toBe(true);
        expect(r[0].data).toBe('2026-02-28');
    });

    it('entrada positiva, saída negativa; parte de juros com chave própria', () => {
        const r = separarSemClassificacao([
            linha({ direction: 'CREDIT', amount_dre: 50 }),
            linha({ direction: 'CREDIT', amount_dre: 5, parte_juros: true }),
        ], PLANO, 'CAIXA');
        expect(r.map(i => i.valor).sort()).toEqual([5, 50]);
        expect(new Set(r.map(i => i.chave)).size).toBe(2);
    });
});
