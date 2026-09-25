/**
 * Prévia de "Importar do Comercial": o que SERÁ criado, linha a linha.
 *
 * O pedido que gerou estes testes foi um bug relatado — "o condomínio 007 está
 * importando também estacionamento". Não estava: o Estacionamento aparecia na
 * lista como lacuna de cadastro e nunca virava ocupação. Mas a lista não
 * distinguia "vai ser criada" de "não tem ninguém", e é isso que estes testes
 * agora travam: unidade sem pessoa **aparece** (some da lista = defeito
 * invisível, foi assim que a importação pareceu quebrada em 14/08/2026) e
 * **não** vira candidata.
 *
 * Dublê em memória do cliente Supabase, só com a cadeia que a prévia usa.
 */
import { describe, it, expect, vi } from 'vitest';

type Linha = Record<string, unknown>;
const tabelas: Record<string, Linha[]> = {
    commercial_deals: [
        // Venda efetivada do apto 11 → proprietário.
        { id: 'd1', client_id: 'c1', property_id: 'p11', type: 'SALE', status: 'CONTRATO', date: '2020-03-01' },
        // Locação efetivada do apto 12 → inquilino (e responsável financeiro).
        { id: 'd2', client_id: 'c2', property_id: 'p12', type: 'RENTAL', status: 'COMPLETED', date: '2024-07-01' },
        // Reserva do apto 21: NÃO é posse.
        { id: 'd3', client_id: 'c3', property_id: 'p21', type: 'SALE', status: 'RESERVA', date: '2026-01-01' },
    ],
    commercial_deal_units: [],
    contracts: [{ id: 'ct1', number: 'CV-7', start_date: '2020-03-15', deal_id: 'd1' }],
    unit_occupancies: [],
    clients: [
        { id: 'c1', name: 'MARCOS JULIANO FORSTER' },
        { id: 'c2', name: 'Napoleão Da Costa Azevedo' },
        { id: 'c3', name: 'Quem só reservou' },
    ],
};

function builder(table: string) {
    const preds: Array<(r: Linha) => boolean> = [];
    const q: any = {
        select() { return q; },
        eq(k: string, v: unknown) { preds.push(r => r[k] === v); return q; },
        in(k: string, vs: unknown[]) { preds.push(r => vs.includes(r[k])); return q; },
        is(k: string, v: unknown) { preds.push(r => r[k] == v); return q; },
        order() { return q; },
        then(resolve: (v: { data: Linha[]; error: null }) => unknown) {
            return Promise.resolve(resolve({
                data: (tabelas[table] ?? []).filter(r => preds.every(p => p(r))),
                error: null,
            }));
        },
    };
    return q;
}

vi.mock('../lib/supabase', () => ({ supabase: { from: (t: string) => builder(t) } }));
vi.mock('../services/empreendimentoService', () => ({
    empreendimentoService: {
        listAllUnitsForEmpreendimento: async () => [
            { id: 'u11', name: '11', _tower_name: 'Torre Única', commercial_property_id: 'p11', rental_property_id: null },
            { id: 'u12', name: '12', _tower_name: 'Torre Única', commercial_property_id: null, rental_property_id: 'p12' },
            { id: 'u21', name: '21', _tower_name: 'Torre Única', commercial_property_id: 'p21', rental_property_id: null },
            // O caso do relato: existe no empreendimento, não existe no Comercial.
            { id: 'uest', name: 'Estacionamento', _tower_name: 'Torre Única', commercial_property_id: 'pest', rental_property_id: null },
        ],
    },
}));
vi.mock('../services/unitOccupancyService', () => ({ traduzirErroOcupacao: (m: string) => m }));

import { occupancyImportService, chaveDaCandidata } from '../services/occupancyImportService';

const previa = () => occupancyImportService.previewImport('emp', 'org');

describe('previewImport — o Estacionamento do relato', () => {
    it('APARECE na lista: unidade que some vira defeito invisível', async () => {
        const p = await previa();
        expect(p.rows.map(r => r.unitId)).toContain('uest');
        expect(p.unidadesTotal).toBe(4);
    });

    it('NÃO vira candidata: nada é criado para ela', async () => {
        const p = await previa();
        expect(p.candidatas.filter(c => c.unitId === 'uest')).toEqual([]);
    });

    it('diz o motivo, em vez de sumir calada', async () => {
        const p = await previa();
        expect(p.rows.find(r => r.unitId === 'uest')!.motivo)
            .toContain('Nenhum proprietário ou locatário encontrado no Comercial');
    });
});

describe('previewImport — candidatas', () => {
    it('venda efetivada vira proprietário + responsável financeiro, cada um em sua linha', async () => {
        const p = await previa();
        const doApto = p.candidatas.filter(c => c.unitId === 'u11');
        expect(doApto.map(c => c.role).sort()).toEqual(['PROPRIETARIO', 'RESPONSAVEL_FINANCEIRO']);
    });

    it('o responsável financeiro herda a data e o contrato de quem o originou', async () => {
        const p = await previa();
        const rf = p.candidatas.find(c => c.unitId === 'u11' && c.role === 'RESPONSAVEL_FINANCEIRO')!;
        expect(rf.startedAt).toBe('2020-03-15');
        expect(rf.sourceContractId).toBe('ct1');
        expect(rf.origem).toBe('Contrato CV-7');
        expect(rf.clientName).toBe('MARCOS JULIANO FORSTER');
    });

    it('locação vira inquilino, e é ELE o responsável financeiro (não o dono)', async () => {
        const p = await previa();
        const do12 = p.candidatas.filter(c => c.unitId === 'u12');
        expect(do12.map(c => c.role).sort()).toEqual(['INQUILINO', 'RESPONSAVEL_FINANCEIRO']);
        expect(do12.every(c => c.clientId === 'c2')).toBe(true);
    });

    it('reserva NÃO vira candidata — reserva não é posse', async () => {
        const p = await previa();
        expect(p.candidatas.filter(c => c.unitId === 'u21')).toEqual([]);
        expect(p.unidadesEmNegociacao).toBe(1);
    });

    it('cada candidata tem chave única — duas linhas não podem colidir na seleção', async () => {
        const p = await previa();
        const chaves = p.candidatas.map(chaveDaCandidata);
        expect(new Set(chaves).size).toBe(chaves.length);
    });
});
