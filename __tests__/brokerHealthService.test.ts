/**
 * Aba Saúde do Portal do Corretor lê por RPC, não por tabela (18/11/2026).
 *
 * Achados F5/F6/F7 da varredura de segurança: o corretor externo só lia
 * commercial_properties/commercial_deals/projects porque contava como MEMBRO da
 * organização (ramo broker_profiles de is_org_member/minhas_orgs_membro) — e esse
 * ramo dava a ele a organização inteira. A aba passou para
 * `fn_broker_portal_saude` / `fn_broker_portal_saude_empreendimentos`, que repetem
 * a RLS de antes e devolvem uma linha por unidade e por negócio.
 *
 * O que não pode mudar, e que duas tentativas anteriores mudaram (revisões F6/F7):
 *   · canal dominante e mix por tipologia DESEMPATAM PELA ORDEM das linhas (o
 *     primeiro que aparece), não por rótulo;
 *   · sem dado (link anônimo) o painel é o ZERO de sempre — não `null`, que vira a
 *     tela de "Nenhum dado de empreendimento";
 *   · a organização é a do painel (parâmetro), nunca a do token.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) } }));

import { brokerHealthService } from '../services/brokerHealthService';

const ORG = 'aaaaaaaa-0000-0000-0000-000000000000';
const PROJ = '33333333-0000-0000-0000-000000000001';
const hoje = new Date().toISOString().slice(0, 10);

type Unidade = { id: string; initial_price: number | null; price: number | null; status: string | null; purpose: string | null; typology: string | null };
type Negocio = { id: string; value: number | null; status: string | null; type: string | null; date: string | null; com_corretor: boolean; payment_method: string | null; property_id: string | null };

const un = (id: string, typology: string | null, status = 'AVAILABLE', extra: Partial<Unidade> = {}): Unidade =>
    ({ id, initial_price: 100, price: 120, status, purpose: 'SALE', typology, ...extra });
const ng = (id: string, extra: Partial<Negocio> = {}): Negocio =>
    ({ id, value: 1000, status: 'COMPLETED', type: 'SALE', date: hoje, com_corretor: false, payment_method: 'PIX', property_id: 'u1', ...extra });

function responde(unidades: Unidade[], negocios: Negocio[], projeto_nome: string | null = null) {
    rpc.mockResolvedValue({ data: { unidades, negocios, projeto_nome }, error: null });
}

beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('getHealthData — fonte', () => {
    it('chama fn_broker_portal_saude com a org do PAINEL e nenhuma tabela direto', async () => {
        responde([], []);
        await brokerHealthService.getHealthData(ORG, null);
        expect(rpc).toHaveBeenCalledWith('fn_broker_portal_saude', { p_org: ORG, p_project: null });
        expect(from).not.toHaveBeenCalled();
    });

    it('empreendimento escolhido vai para o banco; vazio/undefined = consolidado (p_project null)', async () => {
        responde([], []);
        await brokerHealthService.getHealthData(ORG, PROJ);
        expect(rpc).toHaveBeenLastCalledWith('fn_broker_portal_saude', { p_org: ORG, p_project: PROJ });
        await brokerHealthService.getHealthData(ORG);
        expect(rpc).toHaveBeenLastCalledWith('fn_broker_portal_saude', { p_org: ORG, p_project: null });
        await brokerHealthService.getHealthData(ORG, '');
        expect(rpc).toHaveBeenLastCalledWith('fn_broker_portal_saude', { p_org: ORG, p_project: null });
    });

    it('sem nenhuma linha (link anônimo) devolve o painel ZERO, não null', async () => {
        responde([], []);
        const k = await brokerHealthService.getHealthData(ORG, null);
        expect(k).not.toBeNull();
        expect(k).toMatchObject({
            id: ORG, project_name: 'Consolidado — todos os empreendimentos',
            total_units: 0, sold_units: 0, available_units: 0, reserved_units: 0,
            vgv_total: 0, vgv_sold: 0, ivv: 0, months_to_sell: 0, top_channel: '–', avg_ticket: 0, mix_sales: [],
        });
        expect(k!.absorption_curve).toHaveLength(12);
    });

    it('erro da RPC = null (a tela mostra "Nenhum dado", como quando o SELECT falhava)', async () => {
        rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
        expect(await brokerHealthService.getHealthData(ORG, null)).toBeNull();
    });
});

describe('getHealthData — contas (o mesmo código de antes)', () => {
    it('canal dominante desempata pelo PRIMEIRO que aparece (ordem das linhas)', async () => {
        const unidades = [un('u1', '2Q')];
        // PIX e Corretor empatam em 2 — vence quem apareceu primeiro.
        const pixPrimeiro = [ng('d1'), ng('d2', { com_corretor: true }), ng('d3'), ng('d4', { com_corretor: true })];
        responde(unidades, pixPrimeiro);
        expect((await brokerHealthService.getHealthData(ORG, null))!.top_channel).toBe('PIX');

        responde(unidades, [...pixPrimeiro].reverse());
        expect((await brokerHealthService.getHealthData(ORG, null))!.top_channel).toBe('Corretor');
    });

    it('canal: com corretor → "Corretor"; senão payment_method, type, "Direto" (vazio conta como ausente)', async () => {
        const unidades = [un('u1', '2Q')];
        responde(unidades, [ng('d1', { payment_method: '', type: '' }), ng('d2', { payment_method: null, type: null })]);
        expect((await brokerHealthService.getHealthData(ORG, null))!.top_channel).toBe('Direto');
        responde(unidades, [ng('d1', { payment_method: '', type: 'RENTAL' })]);
        expect((await brokerHealthService.getHealthData(ORG, null))!.top_channel).toBe('RENTAL');
        // Negócio não fechado não entra no canal.
        responde(unidades, [ng('d1', { status: 'PENDING', com_corretor: true }), ng('d2')]);
        expect((await brokerHealthService.getHealthData(ORG, null))!.top_channel).toBe('PIX');
    });

    it('mix por tipologia desempata pela ordem de aparição e corta em 6', async () => {
        const unidades = [
            un('a', 'Studio'), un('b', '3Q', 'SOLD'), un('c', 'Studio', 'VENDIDO'), un('d', '3Q'),
            un('e', 'T1'), un('f', 'T2'), un('g', 'T3'), un('h', 'T4'), un('i', null),
        ];
        responde(unidades, []);
        const k = (await brokerHealthService.getHealthData(ORG, null))!;
        expect(k.mix_sales.map(m => m.typology)).toEqual(['Studio', '3Q', 'T1', 'T2', 'T3', 'T4']);
        expect(k.mix_sales[0]).toEqual({ typology: 'Studio', sold: 1, total: 2, pct: 50 });
    });

    it('estoque: só venda (SALE/BOTH/sem finalidade), sem permuta; VGV pelo preço inicial, senão o preço', async () => {
        const unidades = [
            un('a', 'X', 'AVAILABLE', { initial_price: null, price: 500 }),
            un('b', 'X', 'RESERVADO'),
            un('c', 'X', 'SOLD', { purpose: 'BOTH' }),
            un('d', 'X', 'AVAILABLE', { purpose: null }),
            un('e', 'X', 'AVAILABLE', { purpose: 'RENTAL' }),
            un('f', 'X', 'EXCHANGED'),
            un('g', 'X', 'PERMUTADO'),
        ];
        responde(unidades, []);
        const k = (await brokerHealthService.getHealthData(ORG, null))!;
        expect([k.total_units, k.available_units, k.reserved_units, k.sold_units]).toEqual([4, 2, 1, 1]);
        expect(k.vgv_total).toBe(500 + 100 + 100 + 100);
    });

    it('com empreendimento: negócio só conta se a unidade principal é dele; nome vem da RPC', async () => {
        responde([un('u1', '2Q', 'SOLD')], [ng('d1', { value: 10 }), ng('d2', { property_id: 'outra', value: 99 })], 'Residencial Um');
        const k = (await brokerHealthService.getHealthData(ORG, PROJ))!;
        expect(k.vgv_sold).toBe(10);
        expect(k.project_name).toBe('Residencial Um');
        expect(k.id).toBe(PROJ);
    });

    it('projeto que a RLS de antes não mostrava (nome nulo) fica como consolidado', async () => {
        responde([un('u1', '2Q')], [], null);
        expect((await brokerHealthService.getHealthData(ORG, PROJ))!.project_name).toBe('Consolidado — todos os empreendimentos');
    });
});

describe('listProjectsWithSales', () => {
    it('chama fn_broker_portal_saude_empreendimentos e mantém o filtro, a deduplicação e a ordem por nome', async () => {
        rpc.mockResolvedValue({
            data: [
                { project_id: 'p2', status: 'AVAILABLE', purpose: 'SALE', project_name: 'Zeta' },
                { project_id: 'p1', status: 'SOLD', purpose: null, project_name: 'Alfa' },
                { project_id: 'p1', status: 'AVAILABLE', purpose: 'BOTH', project_name: 'Alfa' },
                { project_id: 'p3', status: 'AVAILABLE', purpose: 'RENTAL', project_name: 'Só locação' },
                { project_id: 'p4', status: 'PERMUTADO', purpose: 'SALE', project_name: 'Permutado' },
                { project_id: 'p5', status: 'AVAILABLE', purpose: 'SALE', project_name: null },
            ],
            error: null,
        });
        const lista = await brokerHealthService.listProjectsWithSales(ORG);
        expect(rpc).toHaveBeenCalledWith('fn_broker_portal_saude_empreendimentos', { p_org: ORG });
        expect(from).not.toHaveBeenCalled();
        expect(lista).toEqual([{ id: 'p1', name: 'Alfa' }, { id: 'p2', name: 'Zeta' }]);
    });

    it('erro = lista vazia (sem seletor), como antes', async () => {
        rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
        expect(await brokerHealthService.listProjectsWithSales(ORG)).toEqual([]);
    });
});
