/**
 * Montagem dos cards por objetivo em `coletarEmpreendimentosDoEscopo`, com `empreendimentoService` e supabase
 * simulados.
 *
 * Protege: o aluguel pedido vem da unidade, senão do espelho de Locações (`rental_property_id`); disponível sem
 * aluguel conta à parte; o aluguel contratado soma só as locações DAQUELE empreendimento; falha na leitura do
 * serviço vira `servico: null` (e só para o de serviço); falha na leitura do espelho de aluguel deixa o aluguel
 * das disponíveis DESCONHECIDO (nunca "sem aluguel cadastrado").
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Linhas = Record<string, unknown[]>;
let respostas: Linhas = {};
/** Tabela (ou "tabela:colunas") cuja leitura devolve erro. */
let erros = new Set<string>();
const servidas = new Set<string>();

const builder = (tabela: string) => {
    let colunas = '';
    const filtros: unknown[] = [];
    const chave = () => `${tabela}:${colunas}`;
    // `.eq`/`.in` filtram de verdade, mas só pela coluna que a linha simulada traz (linha sem a coluna passa).
    const passa = (row: Record<string, unknown>) => filtros.every(f => {
        const [m, [col, v]] = f as [string, [string, unknown]];
        if (!(col in row)) return true;
        if (m === 'eq') return row[col] === v;
        if (m === 'in') return (v as unknown[]).includes(row[col]);
        return true;
    });
    const resposta = () => (erros.has(tabela) || erros.has(chave())
        ? { data: null, error: new Error('falhou') }
        : { data: ((respostas[chave()] ?? respostas[tabela] ?? []) as Record<string, unknown>[]).filter(passa), error: null });
    const b: Record<string, unknown> = {};
    b.select = (c: string) => { colunas = c; return b; };
    for (const m of ['eq', 'in', 'or', 'order']) b[m] = (...a: unknown[]) => { filtros.push([m, a]); return b; };
    // Consulta sem `.range` (awaited direto)…
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resposta()).then(ok, ko);
    // …e paginada: a 2ª página da MESMA consulta vem vazia.
    b.range = () => {
        const k = JSON.stringify([chave(), filtros]);
        const primeira = !servidas.has(k);
        servidas.add(k);
        const r = resposta();
        return Promise.resolve(r.error ? r : { data: primeira ? r.data : [], error: null });
    };
    return b;
};

vi.mock('../lib/supabase', () => ({ supabase: { from: (t: string) => builder(t), rpc: vi.fn() } }));

const unidadesDe: Record<string, Record<string, unknown>[]> = {};
vi.mock('../services/empreendimentoService', () => ({
    empreendimentoService: {
        list: vi.fn(async () => EMPS),
        listAllUnitsForEmpreendimento: vi.fn(async (id: string) => unidadesDe[id] ?? []),
    },
}));
vi.mock('../services/empreendimentoMidiaService', () => ({ fotosDosEmpreendimentos: vi.fn(async () => new Map()) }));

import { creditRoomService } from '../services/creditRoomService';
import type { LocacaoVigente } from '../utils/creditCapacity';

const emp = (id: string, objetivo: string, project_id: string | null = null) => ({
    id, name: `Emp ${id}`, organization_id: 'o1', objetivo, project_id, endereco_city: null, endereco_state: null,
});
const EMPS = [emp('eLoc', 'LOCACAO'), emp('eSrv', 'SERVICO', 'obra-1'), emp('eVen', 'VENDAS')];

const unidade = (o: Record<string, unknown>) => ({ status: 'DISPONIVEL', rental_status: 'VAGO', ...o });
const locacao = (empreendimentoId: string, aluguelMensal: number): LocacaoVigente => ({
    contractId: `c-${empreendimentoId}-${aluguelMensal}`, organizationId: 'o1', empreendimentoId, partyKey: null,
    aluguelMensal, inicio: '2026-01-01', fim: null,
});

const coletar = async () => {
    const r = await creditRoomService.coletarEmpreendimentosDoEscopo(
        ['o1'], [], [], [locacao('eLoc', 2_000), locacao('eLoc', 3_000), locacao('eVen', 999)],
        '2026-11-20', { vendas: true, alugueis: true },
    );
    return new Map((r ?? []).map(e => [e.id, e]));
};

describe('coletarEmpreendimentosDoEscopo — cards por objetivo', () => {
    beforeEach(() => {
        respostas = {}; erros = new Set(); servidas.clear();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        unidadesDe.eLoc = [
            unidade({ id: 'u1', rental_price: 1_000 }),
            unidade({ id: 'u2', rental_price: undefined, rental_property_id: 'rp2' }), // preço só no espelho
            unidade({ id: 'u3' }), // sem aluguel em lugar nenhum
            unidade({ id: 'u4', rental_status: 'LOCADO', rental_price: 777 }), // locada: não é disponível
        ];
        unidadesDe.eSrv = [];
        unidadesDe.eVen = [unidade({ id: 'v1', status: 'VENDIDO', price: 100 })];
        respostas['commercial_properties:id, rental_price'] = [{ id: 'rp2', rental_price: 500 }];
        respostas.contracts = [];
    });

    it('locação: aluguel pedido pela unidade e pelo espelho; sem aluguel à parte; contratado só do empreendimento', async () => {
        const e = (await coletar()).get('eLoc')!;
        expect(e.alugadas).toBe(1);
        expect(e.disponiveis).toBe(3);
        expect(e.aluguel_disponiveis).toBe(1_500); // 1.000 (unidade) + 500 (espelho)
        expect(e.disponiveis_sem_aluguel).toBe(1); // u3
        expect(e.aluguel_locadas).toBe(5_000); // 2.000 + 3.000; os 999 são de outro empreendimento
    });

    it('sem locação vigente do empreendimento: aluguel_locadas 0 (zero é dado; "—" só em versão antiga)', async () => {
        const e = (await coletar()).get('eVen')!;
        expect(e.aluguel_locadas).toBe(999); // este tem uma
        const r = await creditRoomService.coletarEmpreendimentosDoEscopo(['o1'], [], [], [], '2026-11-20', { vendas: true, alugueis: true });
        expect(r!.find(x => x.id === 'eLoc')!.aluguel_locadas).toBe(0);
    });

    describe('etapa da negociação de locação', () => {
        const DEALS = 'commercial_deals:id, property_id, status, value, installment_value';
        const comEtapas = async () => {
            unidadesDe.eLoc = [
                // caso real 014/102: contrato Ativo, negociação em Assinatura, unidade Reservado
                unidade({ id: 'n1', rental_status: 'RESERVADO', rental_property_id: 'rp-n1', rental_price: 3_500 }),
                // negociação em Alugado com a unidade ainda Disponível: conta como locada
                unidade({ id: 'n2', rental_property_id: 'rp-n2', rental_price: 900 }),
                // em Reserva, sem contrato: aluguel da negociação
                unidade({ id: 'n3', rental_property_id: 'rp-n3', rental_price: 1_000 }),
                // só proposta: segue disponível
                unidade({ id: 'n4', rental_property_id: 'rp-n4', rental_price: 2_000 }),
                // 2ª unidade do MESMO negócio do n1 (só em `commercial_deal_units`): em negociação, sem 2ª parcela
                unidade({ id: 'n5', rental_status: 'RESERVADO', rental_property_id: 'rp-n5', rental_price: 400 }),
            ];
            respostas[DEALS] = [
                { id: 'd1', type: 'RENTAL', property_id: 'rp-n1', status: 'ASSINATURA', value: 3_500, installment_value: null },
                { id: 'd1x', type: 'RENTAL', property_id: 'rp-n1', status: 'CANCELLED', value: 1, installment_value: null },
                { id: 'd2', type: 'RENTAL', property_id: 'rp-n2', status: 'COMPLETED', value: 900, installment_value: 900 },
                { id: 'd3', type: 'RENTAL', property_id: 'rp-n3', status: 'RESERVA', value: 99_999, installment_value: 1_200 },
                { id: 'd4', type: 'RENTAL', property_id: 'rp-n4', status: 'IN_NEGOTIATION', value: 2_000, installment_value: null },
                // negociação de VENDA do mesmo imóvel: não é etapa de locação
                { id: 'dv', type: 'SALE', property_id: 'rp-n4', status: 'COMPLETED', value: 500_000, installment_value: null },
            ];
            respostas['commercial_deal_units'] = [
                { deal_id: 'd1', property_id: 'rp-n1' },
                { deal_id: 'd1', property_id: 'rp-n5' },
            ];
            const ls: LocacaoVigente[] = [
                { ...locacao('eLoc', 3_500), propertyId: 'rp-n1' },
                { ...locacao('eLoc', 900), propertyId: 'rp-n2' },
            ];
            const r = await creditRoomService.coletarEmpreendimentosDoEscopo(['o1'], [], [], ls, '2026-11-20', { vendas: true, alugueis: true });
            return r!.find(x => x.id === 'eLoc')!;
        };

        it('Alugado = locada; Reserva/Contrato/Assinatura = em negociação (fora das disponíveis); Proposta = disponível', async () => {
            const e = await comEtapas();
            expect(e.alugadas).toBe(1); // n2
            expect(e.em_negociacao).toBe(3); // n1, n3 e n5 (2ª unidade do negócio do n1)
            expect(e.disponiveis).toBe(1); // n4 — a venda concluída do mesmo imóvel não conta como locação
            expect(e.em_negociacao_por_etapa).toEqual({ Assinatura: 2, Reserva: 1 });
        });

        it('aluguel: o contrato da unidade em negociação sai das locadas; sem contrato, vale a parcela da negociação', async () => {
            const e = await comEtapas();
            expect(e.aluguel_locadas).toBe(900);
            // 3.500 (contrato do n1) + 1.200 (installment_value do n3, não o value); o n5 não soma a parcela do d1 de novo
            expect(e.aluguel_em_negociacao).toBe(4_700);
            expect(e.aluguel_disponiveis).toBe(2_000);
        });

        it.each([DEALS, 'commercial_deal_units'])('falha ao ler %s: "em negociação" desconhecido (null), unidade no status dela, card de pé', async tabela => {
            erros.add(tabela);
            const e = await comEtapas();
            expect(e.em_negociacao).toBeNull();
            expect(e.aluguel_em_negociacao).toBeNull();
            expect(e.em_negociacao_por_etapa).toBeUndefined();
            expect(e.alugadas).toBe(0);
            expect(e.disponiveis).toBe(5); // RESERVADO não é LOCADO: disponível, como antes
            expect(console.warn).toHaveBeenCalled();
        });
    });

    it('serviço: falha na leitura dos contratos vira servico null só nele; os demais seguem, e não-serviço fica sem o campo', async () => {
        erros.add('contracts');
        const m = await coletar();
        expect(m.get('eSrv')!.servico).toBeNull();
        expect(m.get('eLoc')!.servico).toBeUndefined();
        expect(m.get('eVen')!.servico).toBeUndefined();
        expect(m.get('eLoc')!.aluguel_disponiveis).toBe(1_500); // o resto do bloco não caiu
    });

    it('serviço: sem contrato válido da obra = n_contratos 0', async () => {
        const e = (await coletar()).get('eSrv')!;
        expect(e.servico).toEqual({ n_contratos: 0, valor_contratos: 0, faturado: 0, a_faturar: 0 });
    });

    it('falha ao ler o aluguel do espelho: aluguel das disponíveis desconhecido (null) e sem contagem de "sem valor"', async () => {
        erros.add('commercial_properties:id, rental_price');
        const m = await coletar();
        const e = m.get('eLoc')!;
        expect(e.aluguel_disponiveis).toBeNull();
        expect(e.disponiveis_sem_aluguel).toBeUndefined();
        expect(e.disponiveis).toBe(3); // o resto do card segue
        expect(e.aluguel_locadas).toBe(5_000);
        expect(console.warn).toHaveBeenCalled();
        expect(m.get('eVen')).toBeDefined();
    });
});
