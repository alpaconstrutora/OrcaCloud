/**
 * Cliente/investidor mudando de organização: o código (001, 002…) é único POR
 * organização (idx_clients_org_code / idx_investors_org_code). O formulário de
 * edição reenvia o código atual junto com a organização nova — e no destino
 * esse número pode já ser de outro cadastro.
 *
 * Caso real (15/09/2026): cliente "012" da org A movido para a org B, onde o
 * 012 já existia → PATCH 409 / 23505 e o toast "Erro ao salvar o cliente".
 * O serviço deve reagir à colisão gerando o próximo código da org de destino
 * (mesma RPC do cadastro) e tentar uma única vez.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Resp = { data: unknown; error: unknown };

const updates: Array<Record<string, unknown>> = [];
const rpcCalls: Array<{ fn: string; args: unknown }> = [];
let updateRespostas: Resp[] = [];
let rpcResposta: Resp = { data: '013', error: null };

vi.mock('../lib/supabase', () => {
    const chain = (resp: () => Resp) => {
        const c: Record<string, unknown> = {};
        c.eq = () => c;
        c.select = () => c;
        c.single = () => Promise.resolve(resp());
        return c;
    };
    return {
        supabase: {
            from: () => ({
                update: (payload: Record<string, unknown>) => {
                    updates.push(payload);
                    return chain(() => updateRespostas.shift() ?? { data: null, error: { code: 'SEM_RESPOSTA' } });
                },
            }),
            rpc: (fn: string, args: unknown) => {
                rpcCalls.push({ fn, args });
                return Promise.resolve(rpcResposta);
            },
        },
    };
});
vi.mock('../services/documentDuplicateCheck', () => ({ assertDocumentNotDuplicated: async () => undefined }));
// investorService importa sinapiService, que consulta o banco ao carregar o módulo.
vi.mock('../services/sinapiService', () => ({ sinapiService: {} }));

import { clientService } from '../services/clientService';
import { investorService } from '../services/investorService';

const ORG_B = 'bbbbbbbb-0000-0000-0000-000000000000';
const colisao = (idx: string) => ({ code: '23505', details: null, hint: null, message: `duplicate key value violates unique constraint "${idx}"` });

beforeEach(() => {
    updates.length = 0;
    rpcCalls.length = 0;
    updateRespostas = [];
    rpcResposta = { data: '013', error: null };
});

describe('clientService.saveClient — troca de organização com código em colisão', () => {
    it('reage ao 23505 gerando o próximo código da org de destino e regrava', async () => {
        updateRespostas = [
            { data: null, error: colisao('idx_clients_org_code') },
            { data: { id: 'c1', code: '013', organization_id: ORG_B }, error: null },
        ];
        const saved = await clientService.saveClient({ id: 'c1', name: 'Igreja', code: '012', organization_id: ORG_B } as never);

        expect(rpcCalls).toEqual([{ fn: 'get_next_client_code', args: { p_org_id: ORG_B } }]);
        expect(updates).toHaveLength(2);
        expect(updates[0].code).toBe('012');
        expect(updates[1].code).toBe('013');
        expect(updates[1].organization_id).toBe(ORG_B);
        expect(saved.code).toBe('013');
    });

    it('sem organization_id no payload NÃO regera: colisão vira erro legível', async () => {
        updateRespostas = [{ data: null, error: colisao('idx_clients_org_code') }];
        await expect(clientService.saveClient({ id: 'c1', code: '012' } as never))
            .rejects.toThrow(/Já existe um cliente com esse código/);
        expect(rpcCalls).toHaveLength(0);
        expect(updates).toHaveLength(1);
    });

    it('tenta UMA vez: se a regravação também colidir, erro legível, sem laço', async () => {
        updateRespostas = [
            { data: null, error: colisao('idx_clients_org_code') },
            { data: null, error: colisao('idx_clients_org_code') },
        ];
        await expect(clientService.saveClient({ id: 'c1', code: '012', organization_id: ORG_B } as never))
            .rejects.toThrow(/organização de destino/);
        expect(updates).toHaveLength(2);
        expect(rpcCalls).toHaveLength(1);
    });

    it('23505 de OUTRO índice não é tratado como colisão de código', async () => {
        updateRespostas = [{ data: null, error: colisao('clients_email_key') }];
        await expect(clientService.saveClient({ id: 'c1', code: '012', organization_id: ORG_B } as never))
            .rejects.toMatchObject({ code: '23505' });
        expect(rpcCalls).toHaveLength(0);
    });
});

describe('investorService.saveInvestor — mesmo molde', () => {
    it('reage ao 23505 de idx_investors_org_code com get_next_investor_code', async () => {
        updateRespostas = [
            { data: null, error: colisao('idx_investors_org_code') },
            { data: { id: 'i1', code: '013', organization_id: ORG_B }, error: null },
        ];
        const saved = await investorService.saveInvestor({ id: 'i1', name: 'Inv', code: '012', organization_id: ORG_B } as never);

        expect(rpcCalls).toEqual([{ fn: 'get_next_investor_code', args: { p_org_id: ORG_B } }]);
        expect(updates[1].code).toBe('013');
        expect(saved.code).toBe('013');
    });
});
