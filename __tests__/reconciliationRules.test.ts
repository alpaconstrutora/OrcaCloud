/**
 * Regras de automação com AND, filtros e simulação — item 2.6 do plano.
 *
 * O ponto delicado é a COMPATIBILIDADE: as regras que estão em produção hoje foram
 * gravadas em dois formatos antigos (condição solta e array = OR). Se elas pararem
 * de funcionar, 6.147 lançamentos deixam de ser classificados. Metade dos casos
 * abaixo existe só para travar isso.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { bankReconciliationService } from '../services/bankReconciliationService';
import type { BankTransaction } from '../types';

const svc = bankReconciliationService;

const tx = (over: Partial<BankTransaction> = {}): BankTransaction => ({
    id: 't1',
    organization_id: 'org-1',
    bank_account_id: 'conta-1',
    transaction_date: '2026-06-15',
    amount: 600,
    direction: 'DEBIT',
    description_raw: 'PAGAMENTO PIX-PIX_DEB   11866633000101 EMPORIUM DOS PAES',
    description_normalized: 'PAGAMENTO PIX PIX DEB 11866633000101 EMPORIUM DOS PAES',
    status: 'NORMALIZED',
    ...over,
} as BankTransaction);

describe('formatos legados continuam funcionando', () => {
    it('condição solta', () => {
        expect(svc.evaluateRule(tx(), { type: 'contains', field: 'description_normalized', value: 'EMPORIUM' })).toBe(true);
        expect(svc.evaluateRule(tx(), { type: 'contains', field: 'description_normalized', value: 'POSTO' })).toBe(false);
    });

    it('array é OR, como sempre foi', () => {
        const r = svc.evaluateRule(tx(), [
            { type: 'contains', field: 'description', value: 'NAO EXISTE' },
            { type: 'contains', field: 'description', value: 'EMPORIUM' },
        ]);
        expect(r).toBe(true);
    });

    it('a regra real do Asaas, como está gravada em produção', () => {
        const asaas = { type: 'contains', field: 'description', value: 'ASAAS' } as const;
        expect(svc.evaluateRule(tx({ description_normalized: 'CREDITO ASAAS REPASSE' }), asaas)).toBe(true);
        expect(svc.evaluateRule(tx(), asaas)).toBe(false);
    });
});

describe('grupo com operador explícito', () => {
    it('AND exige todas', () => {
        const regra = {
            op: 'AND' as const,
            items: [
                { type: 'contains' as const, field: 'description_normalized', value: 'PIX' },
                { type: 'contains' as const, field: 'description_normalized', value: 'EMPORIUM' },
            ],
        };
        expect(svc.evaluateRule(tx(), regra)).toBe(true);
        expect(svc.evaluateRule(tx({ description_normalized: 'TED EMPORIUM DOS PAES' }), regra)).toBe(false);
    });

    it('OR explícito basta uma', () => {
        const regra = {
            op: 'OR' as const,
            items: [
                { type: 'contains' as const, field: 'description_normalized', value: 'NAO EXISTE' },
                { type: 'contains' as const, field: 'description_normalized', value: 'EMPORIUM' },
            ],
        };
        expect(svc.evaluateRule(tx(), regra)).toBe(true);
    });
});

describe('filtros de valor, direção e conta', () => {
    const texto = [{ type: 'contains' as const, field: 'description_normalized', value: 'PIX' }];

    it('faixa de valor restringe', () => {
        expect(svc.evaluateRule(tx(), { op: 'AND', items: texto, filters: { amount_min: 500, amount_max: 700 } })).toBe(true);
        expect(svc.evaluateRule(tx(), { op: 'AND', items: texto, filters: { amount_min: 1000 } })).toBe(false);
        expect(svc.evaluateRule(tx(), { op: 'AND', items: texto, filters: { amount_max: 100 } })).toBe(false);
    });

    it('direção restringe', () => {
        expect(svc.evaluateRule(tx(), { op: 'AND', items: texto, filters: { direction: 'DEBIT' } })).toBe(true);
        expect(svc.evaluateRule(tx(), { op: 'AND', items: texto, filters: { direction: 'CREDIT' } })).toBe(false);
    });

    it('conta restringe', () => {
        expect(svc.evaluateRule(tx(), { op: 'AND', items: texto, filters: { bank_account_id: 'conta-1' } })).toBe(true);
        expect(svc.evaluateRule(tx(), { op: 'AND', items: texto, filters: { bank_account_id: 'conta-2' } })).toBe(false);
    });

    it('filtro ausente não restringe nada', () => {
        expect(svc.evaluateRule(tx(), { op: 'AND', items: texto, filters: {} })).toBe(true);
        expect(svc.evaluateRule(tx(), { op: 'AND', items: texto })).toBe(true);
    });

    it('regra SÓ de filtro, sem texto, casa por filtro', () => {
        // "toda saída acima de R$ 10.000 nesta conta" — não dá para escrever com texto.
        const regra = { op: 'AND' as const, items: [], filters: { direction: 'DEBIT' as const, amount_min: 500 } };
        expect(svc.evaluateRule(tx(), regra)).toBe(true);
        expect(svc.evaluateRule(tx({ amount: 100 }), regra)).toBe(false);
    });

    it('grupo totalmente vazio não casa com nada', () => {
        expect(svc.evaluateRule(tx(), { op: 'AND', items: [] })).toBe(false);
    });

    it('o filtro vence o texto: casa o texto mas está fora da faixa', () => {
        const regra = { op: 'OR' as const, items: texto, filters: { amount_min: 10000 } };
        expect(svc.evaluateRule(tx(), regra)).toBe(false);
    });
});

describe('simularRegra — o "Testar" da tela', () => {
    const movimentos = [
        tx({ id: 'a', description_normalized: 'TARIFA PACOTE SERVICOS', amount: 29.9 }),
        tx({ id: 'b', description_normalized: 'TARIFA MANUTENCAO CONTA', amount: 45 }),
        tx({ id: 'c', description_normalized: 'PIX ENVIADO FORNECEDOR', amount: 1200 }),
    ];

    it('conta quantos seriam afetados e devolve exemplos', () => {
        const r = svc.simularRegra(movimentos, { type: 'contains', field: 'description_normalized', value: 'TARIFA' });
        expect(r.total).toBe(2);
        expect(r.exemplos.map(e => e.id)).toEqual(['a', 'b']);
    });

    it('limita os exemplos sem mentir no total', () => {
        const muitos = Array.from({ length: 20 }, (_, i) => tx({ id: `x${i}`, description_normalized: 'TARIFA X' }));
        const r = svc.simularRegra(muitos, { type: 'contains', field: 'description_normalized', value: 'TARIFA' }, 5);
        expect(r.total).toBe(20);
        expect(r.exemplos).toHaveLength(5);
    });

    it('nenhum afetado devolve zero, não erro', () => {
        const r = svc.simularRegra(movimentos, { type: 'contains', field: 'description_normalized', value: 'INEXISTENTE' });
        expect(r).toEqual({ total: 0, exemplos: [] });
    });

    it('simula com filtro junto', () => {
        const r = svc.simularRegra(movimentos, {
            op: 'AND', items: [{ type: 'contains', field: 'description_normalized', value: 'TARIFA' }],
            filters: { amount_max: 30 },
        });
        expect(r.total).toBe(1);
        expect(r.exemplos[0].id).toBe('a');
    });
});

describe('matchesFilters isolado', () => {
    it('sem filtros, passa', () => {
        expect(svc.matchesFilters(tx(), undefined)).toBe(true);
    });
    it('limites são inclusivos', () => {
        expect(svc.matchesFilters(tx({ amount: 600 }), { amount_min: 600, amount_max: 600 })).toBe(true);
    });
});

describe('"Todas as organizações" não pode quebrar o motor (REGRA #5)', () => {
    it('usa a organização que a tela informou, sem ir ao banco', async () => {
        await expect(svc.resolverOrganizacaoDaConta('conta-1', 'org-7')).resolves.toBe('org-7');
    });

    it('nulo, indefinido e string VAZIA caem no banco, pela conta bancária', async () => {
        // As três sentinelas de "Todas" da REGRA #5. A vazia é a traiçoeira: `??` não
        // a pega, então ela passava adiante e virava `organization_id=eq.` no
        // PostgREST, que responde 22P02 e derruba o motor inteiro.
        const consultadas: string[] = [];
        const fake = {
            from: (tabela: string) => {
                consultadas.push(tabela);
                return {
                    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { organization_id: 'org-da-conta' }, error: null }) }) }),
                };
            },
        };
        const supa = (await import('../lib/supabase')) as unknown as { supabase: unknown };
        const antes = supa.supabase;
        supa.supabase = fake;
        try {
            for (const sentinela of [null, undefined, '']) {
                await expect(svc.resolverOrganizacaoDaConta('conta-1', sentinela)).resolves.toBe('org-da-conta');
            }
        } finally {
            supa.supabase = antes;
        }
        expect(consultadas).toEqual(['payment_accounts', 'payment_accounts', 'payment_accounts']);
    });
});
