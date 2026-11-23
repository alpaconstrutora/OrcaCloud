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
    const resposta = () => (erros.has(tabela) || erros.has(chave())
        ? { data: null, error: new Error('falhou') }
        : { data: respostas[chave()] ?? respostas[tabela] ?? [], error: null });
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

    it('sem locação vigente do empreendimento: aluguel_locadas null (não R$ 0)', async () => {
        const e = (await coletar()).get('eVen')!;
        expect(e.aluguel_locadas).toBe(999); // este tem uma
        const r = await creditRoomService.coletarEmpreendimentosDoEscopo(['o1'], [], [], [], '2026-11-20', { vendas: true, alugueis: true });
        expect(r!.find(x => x.id === 'eLoc')!.aluguel_locadas).toBeNull();
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
